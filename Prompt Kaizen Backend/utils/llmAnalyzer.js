/**
 * LLM-backed prompt evaluation, layered over the rule-based analyzer.
 *
 * Why this exists
 * ---------------
 * The rule-based scorer measures keyword overlap between the user's prompt and
 * the scenario. That is cheap and instant, but it cannot tell whether a prompt
 * is actually *good* — echoing the scenario back scores near-100 — and
 * `generateImprovedPrompt()` ignored the user's text entirely, so every learner
 * on a given scenario received an identical "improved" version.
 *
 * Design
 * ------
 * - The rule-based score is ALWAYS computed first. It is the floor, it is free,
 *   and it is what the user gets if this path is unavailable.
 * - The LLM is asked to score the same ten parameters against the same maxima,
 *   plus rewrite the user's own prompt. Structured Outputs (`json_schema` with
 *   `strict: true`) guarantee the shape, so no defensive JSON parsing.
 * - Every failure mode — no key, timeout, rate limit, refusal, malformed
 *   result — degrades to the rule-based result rather than failing the request.
 *   A scoring feature that 500s when a vendor has an incident is worse than
 *   one that is occasionally less insightful.
 */
const { analyzePrompt, ratingFromScore } = require('./promptAnalyzer');
const { generateImprovedPrompt } = require('./generateImprovedPrompt');

const ENABLED = String(process.env.LLM_ANALYSIS_ENABLED || '').toLowerCase() === 'true';
const API_KEY = process.env.OPENAI_API_KEY;

// gpt-4o-mini is the default: this runs on every submission, and on a
// rubric-scoring task with a fixed schema the quality gap to gpt-4o does not
// justify roughly 20x the cost. Override with OPENAI_MODEL if evaluation
// quality proves insufficient on real submissions.
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
/**
 * Reads a numeric env var without the `Number(x) || default` trap: for
 * OPENAI_MAX_RETRIES the value 0 is both legitimate and falsy, so `|| 1`
 * silently turned "no retries" into one retry and doubled the worst-case
 * latency of a user-facing request.
 */
function numEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

// Per-attempt timeout. Kept well under the request budget because the caller
// is a user waiting on a score, not a batch job.
const TIMEOUT_MS = numEnv('OPENAI_TIMEOUT_MS', 12_000);
const MAX_RETRIES = numEnv('OPENAI_MAX_RETRIES', 1);

// Hard ceiling on the whole evaluation regardless of per-attempt timeout and
// retry count — TIMEOUT_MS x (MAX_RETRIES + 1) can otherwise exceed what a
// user will wait. Whichever fires first wins, and either way we fall back.
const TOTAL_BUDGET_MS = numEnv('OPENAI_TOTAL_BUDGET_MS', 25_000);

// The ten parameters and their maxima, single-sourced so the schema, the
// prompt, and the clamping below cannot drift apart.
const PARAMETERS = [
  ['clarity',          10, 'Is the instruction unambiguous and easy to act on?'],
  ['context',          15, 'Does the prompt supply the situational detail the scenario requires?'],
  ['roleAssignment',   10, 'Does it give the model a role or persona to adopt?'],
  ['taskDefinition',   15, 'Is the deliverable stated explicitly and completely?'],
  ['inputParameters',  15, 'Does it name the audience and the specifics needed to do the task?'],
  ['outputFormat',     10, 'Is the required shape of the answer stated?'],
  ['constraints',      10, 'Are limits given — length, tone limits, things to include or avoid?'],
  ['tone',              5, 'Is the desired voice or register specified?'],
  ['relevance',         5, 'Does the prompt address THIS scenario rather than a generic one?'],
  ['grammarStructure',  5, 'Is it well-formed, readable and properly punctuated?'],
];

const MAXIMA = Object.fromEntries(PARAMETERS.map(([k, max]) => [k, max]));

/** Strict JSON schema for the model's reply. */
const RESPONSE_SCHEMA = {
  name: 'prompt_evaluation',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['scores', 'strengths', 'weaknesses', 'suggestions', 'missingParameters', 'improvedPrompt'],
    properties: {
      scores: {
        type: 'object',
        additionalProperties: false,
        required: PARAMETERS.map(([k]) => k),
        properties: Object.fromEntries(
          PARAMETERS.map(([k, max, desc]) => [
            k,
            { type: 'integer', minimum: 0, maximum: max, description: `${desc} 0-${max}.` },
          ])
        ),
      },
      strengths:         { type: 'array', maxItems: 5, items: { type: 'string' } },
      weaknesses:        { type: 'array', maxItems: 5, items: { type: 'string' } },
      suggestions:       { type: 'array', maxItems: 5, items: { type: 'string' } },
      missingParameters: { type: 'array', maxItems: 10, items: { type: 'string' } },
      improvedPrompt: {
        type: 'string',
        description:
          'A rewritten version of THE USER\'S OWN prompt, preserving their intent, ' +
          'subject matter and any specifics they supplied, with the missing elements added.',
      },
    },
  },
};

const SYSTEM_PROMPT = [
  'You are an exacting prompt-engineering examiner. You score a learner\'s prompt',
  'against the real-world scenario it was written for, using a fixed 100-point rubric.',
  '',
  'Rubric (award whole points up to each maximum):',
  ...PARAMETERS.map(([k, max, desc]) => `- ${k} (0-${max}): ${desc}`),
  '',
  'Scoring rules:',
  '1. Score the PROMPT, never the scenario. A prompt that merely restates or copies',
  '   the scenario has NOT demonstrated prompt-engineering skill — award low marks',
  '   for taskDefinition, inputParameters, outputFormat and constraints in that case.',
  '2. Reward specificity over length. Padding earns nothing.',
  '3. Be consistent and be willing to use the full range. A genuinely excellent',
  '   prompt should reach 90+; a vague one-liner should land under 30.',
  '4. relevance measures whether the prompt targets THIS scenario specifically.',
  '   Do not simply mirror the context score.',
  '',
  'improvedPrompt rules:',
  '- Rewrite the LEARNER\'S prompt. Keep their intent, subject and any concrete',
  '  details they chose. Do not substitute a generic template.',
  '- Add only what is missing: role, audience, format, tone, constraints.',
  '- Output the prompt itself, ready to paste. No commentary, no preamble.',
  '',
  'strengths, weaknesses and suggestions must be specific to this submission and',
  'quote or reference the learner\'s actual wording. Generic advice is worthless.',
].join('\n');

/**
 * Rejects if `promise` has not settled within `ms`. The underlying request is
 * left to finish or fail on its own — we only stop waiting on it, because the
 * caller is a user watching a spinner.
 */
function withBudget(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`evaluation exceeded ${ms}ms budget`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

let client = null;
function getClient() {
  if (client) return client;
  if (!API_KEY) return null;
  const OpenAI = require('openai');
  client = new OpenAI({ apiKey: API_KEY, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
  return client;
}

function isEnabled() {
  return ENABLED && Boolean(API_KEY);
}

/** Health/observability snapshot, mirrored into the admin console. */
const llmHealth = {
  enabled: isEnabled(),
  model: MODEL,
  calls: 0,
  failures: 0,
  fallbacks: 0,
  lastError: null,
  lastErrorAt: null,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
};

function getLlmHealth() {
  return { ...llmHealth, enabled: isEnabled(), model: MODEL };
}

/** Clamp every score into its allowed range and recompute the total ourselves. */
function normalizeScores(raw) {
  const scores = {};
  for (const [key, max] of Object.entries(MAXIMA)) {
    const n = Number(raw?.[key]);
    scores[key] = Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0;
  }
  // Never trust a total supplied by the model — derive it.
  const overallScore = Object.values(scores).reduce((a, b) => a + b, 0);
  return { scores, overallScore };
}

const cleanList = (arr, cap = 5) =>
  Array.isArray(arr)
    ? Array.from(new Set(arr.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))).slice(0, cap)
    : [];

/**
 * Evaluate a prompt. Always resolves — never throws — so callers do not need
 * their own fallback logic.
 *
 * @returns {Promise<object>} the same shape as analyzePrompt(), plus
 *   `improvedPrompt` and `meta.source` ('llm' | 'rules').
 */
async function evaluatePrompt({ category, scenario, userPrompt }) {
  // Rule-based result first: it is the floor and the fallback.
  const rules = analyzePrompt({ category, scenario, userPrompt });
  const ruleResult = {
    ...rules,
    improvedPrompt: generateImprovedPrompt({ category, scenario }),
    meta: { ...rules.meta, source: 'rules', model: null },
  };

  if (!isEnabled()) return ruleResult;

  const openai = getClient();
  if (!openai) return ruleResult;

  try {
    llmHealth.calls += 1;
    const completion = await withBudget(openai.chat.completions.create({
      model: MODEL,
      // Deterministic-ish: the same submission should not swing between
      // grades on resubmission.
      temperature: 0.2,
      response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            `Category: ${category}`,
            '',
            'Scenario the learner was given:',
            '"""', scenario, '"""',
            '',
            'The prompt the learner wrote:',
            '"""', userPrompt, '"""',
          ].join('\n'),
        },
      ],
    }), TOTAL_BUDGET_MS);

    if (completion.usage) {
      llmHealth.totalPromptTokens += completion.usage.prompt_tokens || 0;
      llmHealth.totalCompletionTokens += completion.usage.completion_tokens || 0;
    }

    const choice = completion.choices?.[0];
    // A refusal is a normal outcome, not an exception — fall back quietly.
    if (choice?.message?.refusal) {
      throw new Error(`Model refused: ${choice.message.refusal}`);
    }
    const parsed = JSON.parse(choice?.message?.content || '{}');

    const { scores, overallScore } = normalizeScores(parsed.scores);
    const improved = typeof parsed.improvedPrompt === 'string' ? parsed.improvedPrompt.trim() : '';

    return {
      scores,
      overallScore,
      rating: ratingFromScore(overallScore),
      missingParameters: cleanList(parsed.missingParameters, 10),
      strengths: cleanList(parsed.strengths),
      weaknesses: cleanList(parsed.weaknesses),
      suggestions: cleanList(parsed.suggestions),
      // If the rewrite came back empty, keep the deterministic template rather
      // than handing the user a blank box.
      improvedPrompt: improved || ruleResult.improvedPrompt,
      meta: {
        ...rules.meta,
        source: 'llm',
        model: MODEL,
        // Kept for calibration: how far the model diverged from the rules.
        ruleScore: rules.overallScore,
      },
    };
  } catch (err) {
    llmHealth.failures += 1;
    llmHealth.fallbacks += 1;
    llmHealth.lastError = String(err?.message || err).slice(0, 300);
    llmHealth.lastErrorAt = new Date().toISOString();
    console.error(`[llm] evaluation failed, falling back to rules: ${llmHealth.lastError}`);
    return ruleResult;
  }
}

module.exports = {
  evaluatePrompt,
  numEnv,
  isEnabled,
  getLlmHealth,
  PARAMETERS,
  MAXIMA,
  RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
  normalizeScores,
};
