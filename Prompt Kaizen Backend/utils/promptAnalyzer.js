/**
 * Rule-based Prompt Analyzer.
 *
 * Evaluates a user's prompt against a real-world scenario across 10 parameters,
 * producing per-parameter scores, an overall score (out of 100), a rating,
 * strengths/weaknesses, missing parameters and suggestions.
 *
 * Designed so it can later be augmented by an LLM (OpenAI/Gemini/Claude).
 */

const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','of','for','to','in','on','at','by','with',
  'is','are','was','were','be','been','being','it','its','this','that','these','those',
  'as','from','i','you','he','she','we','they','my','your','our','their','me','us',
  'so','do','does','did','have','has','had','will','would','can','could','should',
  'about','into','than','then','there','here','what','which','who','whom','how','why',
  'when','where','not','no','yes','please','kindly'
]);

const ACTION_WORDS = [
  'write','generate','explain','create','analyze','summarize','compare','prepare',
  'develop','design','build','draft','compose','review','translate','rewrite','outline',
  'plan','describe','list','classify','recommend','suggest','evaluate','optimize',
  'refactor','debug','implement','solve','calculate','predict'
];

const ROLE_PHRASES = [
  'act as','you are','behave like','as a','as an','pretend to be','assume the role of',
  'imagine you are','take on the role','play the role'
];

const FORMAT_KEYWORDS = [
  'paragraph','email','table','bullet','bullets','bullet points','code','report',
  'social media','step-by-step','step by step','list','json','markdown','outline',
  'essay','letter','memo','summary','presentation','document','article','format'
];

const TONE_KEYWORDS = [
  'professional','friendly','formal','simple','academic','creative','technical',
  'persuasive','respectful','polite','enthusiastic','neutral','casual','informal',
  'serious','witty','warm','authoritative','tone'
];

// Specific role / persona words only. Earlier this list also contained
// generic English words like "audience", "users", "team" — almost any prompt
// mentions at least one of those, which inflated the Input Parameters score
// to easy 6/15 for free. Now the prompt has to name an actual audience.
const AUDIENCE_KEYWORDS = [
  'student','students','principal','hr','recruiter','developer','developers',
  'customer','customers','client','clients','manager','employees',
  'readers','beginners','experts','children','professor','teacher',
  'investors','stakeholders'
];

const CONSTRAINT_KEYWORDS = [
  'word limit','words','characters','character limit','format','deadline','example',
  'examples','language','steps','bullet points','sections','headings','length',
  'minimum','maximum','at least','no more than','within','include','exclude','must',
  'should','must not','should not','avoid','platform','reference','citation'
];

const tokenize = (text = '') =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const meaningfulWords = (text = '') =>
  tokenize(text).filter((w) => !STOPWORDS.has(w) && w.length > 2);

const containsAny = (haystack, needles) => {
  const lower = String(haystack).toLowerCase();
  return needles.some((n) => lower.includes(n));
};

const round = (n) => Math.round(n * 10) / 10;

const ratingFromScore = (score) => {
  if (score >= 90) return 'Excellent Prompt';
  if (score >= 75) return 'Good Prompt';
  if (score >= 60) return 'Average Prompt';
  if (score >= 40) return 'Needs Improvement';
  return 'Poor Prompt';
};

/**
 * Main analyzer.
 * @param {object} input
 * @returns {object} evaluation
 */
function analyzePrompt(input) {
  const {
    category = '',
    scenario = '',
    userPrompt = '',
    tone = '',
    targetAudience = '',
    additionalRequirements = '',
  } = input || {};

  const promptText = String(userPrompt || '');
  const promptLower = promptText.toLowerCase();
  const scenarioLower = String(scenario || '').toLowerCase();

  const promptTokens = tokenize(promptText);
  const wordCount = promptTokens.length;

  const strengths = [];
  const weaknesses = [];
  const missing = [];
  const suggestions = [];

  // 1) Clarity (10) — based on length, action words, sentence structure
  let clarity = 0;
  if (wordCount >= 8) clarity += 4;
  else if (wordCount >= 4) clarity += 2;

  const hasAction = ACTION_WORDS.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(promptText));
  if (hasAction) {
    clarity += 4;
    strengths.push('Uses a clear action verb (e.g., write/generate/analyze).');
  } else {
    weaknesses.push('No clear action verb (e.g., write, generate, explain).');
    suggestions.push('Start with a strong action verb so the model knows what to do.');
  }

  if (/[?.!]/.test(promptText)) clarity += 2;
  clarity = Math.min(10, clarity);
  if (clarity >= 8) strengths.push('Prompt is reasonably clear.');
  if (clarity < 5) weaknesses.push('Prompt lacks clarity; it is too short or vague.');

  // 2) Context (15) — does prompt reference scenario context?
  const scenarioWords = meaningfulWords(scenarioLower);
  const promptMeaningful = new Set(meaningfulWords(promptLower));
  const overlap = scenarioWords.filter((w) => promptMeaningful.has(w));
  const overlapRatio = scenarioWords.length === 0 ? 0 : overlap.length / scenarioWords.length;

  // How much of the prompt is the learner's own wording rather than the
  // scenario's. Needed by both Context and Relevance, so computed once here.
  const scenarioSet = new Set(scenarioWords);
  const promptOwnWords = [...promptMeaningful].filter((w) => !scenarioSet.has(w));
  const originality = promptMeaningful.size === 0
    ? 0
    : promptOwnWords.length / promptMeaningful.size;

  // Verbatim paste detection.
  //
  // Bag-of-words ratios cannot separate "pasted the scenario, then appended a
  // few keywords" from genuine work: appending text lifts the originality
  // ratio while overlap stays at 1.0, which scored 92/100. Contiguous runs
  // catch that specific move directly — a learner writing in their own words
  // does not reproduce a 10-word span of the brief exactly.
  const normalize = (t) => String(t).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normScenario = normalize(scenario);
  const normPrompt = normalize(promptText);

  let longestVerbatimRun = 0;
  if (normScenario && normPrompt) {
    const sWords = normScenario.split(' ');
    // Walk decreasing span lengths and stop at the first contiguous run of
    // scenario text that also appears in the prompt.
    for (let len = Math.min(sWords.length, 40); len >= 5; len--) {
      let found = false;
      for (let i = 0; i + len <= sWords.length; i++) {
        if (normPrompt.includes(sWords.slice(i, i + len).join(' '))) { found = true; break; }
      }
      if (found) { longestVerbatimRun = len; break; }
    }
  }
  // Proportion of the brief reproduced word-for-word.
  const verbatimRatio = scenarioWords.length === 0
    ? 0
    : Math.min(1, longestVerbatimRun / Math.max(1, normScenario.split(' ').length));
  const isPasted = longestVerbatimRun >= 8 || verbatimRatio >= 0.5;

  let context = Math.round(overlapRatio * 15);
  if (wordCount >= 25) context = Math.min(15, context + 2);

  // Copying the scenario into the prompt used to earn full Context marks,
  // which made paste-the-scenario the single highest-yield way to score. These
  // points are for weaving the situation into an instruction, so they are
  // damped when almost nothing in the prompt is the learner's own wording.
  if (originality < 0.15) context = Math.round(context * 0.4);
  else if (originality < 0.30) context = Math.round(context * 0.7);

  // Pasting the brief verbatim is not supplying context, whatever else was
  // appended around it.
  if (isPasted) context = Math.min(context, 5);

  context = Math.max(0, Math.min(15, context));

  if (overlapRatio >= 0.4) {
    strengths.push('Prompt reflects the scenario context well.');
  } else if (overlapRatio >= 0.15) {
    weaknesses.push('Prompt partially captures the scenario context.');
    suggestions.push('Include more details from the scenario (purpose, who, what, when).');
  } else {
    weaknesses.push('Prompt does not reflect the scenario context.');
    missing.push('Scenario Context');
    suggestions.push('Restate the situation briefly inside the prompt itself.');
  }

  // 3) Role Assignment (10)
  const hasRole = ROLE_PHRASES.some((p) => promptLower.includes(p));
  let role = hasRole ? 10 : 0;
  if (hasRole) strengths.push('Assigns a role to the model (e.g., "Act as...").');
  else {
    weaknesses.push('No role assigned to the model.');
    missing.push('Role Assignment');
    suggestions.push('Begin with "Act as a [role]" to set expertise and perspective.');
  }

  // 4) Task Definition (15)
  let task = 0;
  if (hasAction) task += 8;
  if (wordCount >= 12) task += 4;
  if (overlapRatio >= 0.25) task += 3;
  task = Math.min(15, task);
  if (task >= 10) strengths.push('Task is reasonably defined.');
  else {
    weaknesses.push('Task is not clearly defined.');
    missing.push('Clear Task Definition');
    suggestions.push('Spell out the exact deliverable (what to produce, for whom, why).');
  }

  // Detect constraint / "specifics" keywords inside the prompt text once,
  // so Input Parameters, Constraints, and other rules can award credit when
  // those details are written into the prompt itself (rather than carried in
  // separate form fields that the current frontend no longer collects).
  const constraintMatches = CONSTRAINT_KEYWORDS.filter((k) => promptLower.includes(k));
  const constraintMatchCount = constraintMatches.length;
  const specificsInPrompt = constraintMatchCount > 0;

  // 5) Input Parameters (15) — audience + specifics + scenario specificity.
  // A prompt that names its audience and lists details (word limit / examples
  // / deadline / etc.) inside the text should reach the full 15 — the form
  // fields (`targetAudience`, `additionalRequirements`) are still honored if
  // an API caller supplies them directly.
  let inputs = 0;
  const audienceProvided = !!String(targetAudience).trim();
  const additionalProvided = !!String(additionalRequirements).trim();
  const audienceMentioned =
    audienceProvided ||
    AUDIENCE_KEYWORDS.some((k) => promptLower.includes(k));
  if (audienceMentioned) inputs += 6;
  else {
    missing.push('Target Audience');
    suggestions.push('Mention the target audience (e.g., students, HR, developers).');
  }
  if (additionalProvided || specificsInPrompt) inputs += 5;
  else suggestions.push('Add specifics like word limit, examples, deadline or language.');

  if (wordCount >= 30) inputs += 4;
  inputs = Math.min(15, inputs);
  if (inputs >= 10) strengths.push('Provides useful input parameters / audience info.');
  else weaknesses.push('Important input parameters are missing.');

  // 6) Output Format (10). The user must state the desired output format
  // (email / table / bullet points / etc.) inside the prompt text itself —
  // there is no separate dropdown to fall back on.
  const formatMentioned = FORMAT_KEYWORDS.some((k) => promptLower.includes(k));
  let outputFormat = 0;
  if (formatMentioned) {
    outputFormat = 10;
    strengths.push('Specifies an output format.');
  } else {
    missing.push('Output Format');
    suggestions.push('State the format clearly (e.g., email, table, bullet points).');
  }

  // 7) Constraints (10). Tiered by how many distinct constraint keywords show
  // up in the prompt — a single mention is partial credit, two or more is
  // full marks. An explicit `additionalRequirements` field also earns full.
  const constraintProvided = !!String(additionalRequirements).trim();
  let constraints = 0;
  if (constraintProvided || constraintMatchCount >= 5) {
    constraints = 10;
    strengths.push('Includes constraints / requirements.');
  } else if (constraintMatchCount >= 3) {
    constraints = 6;
    strengths.push('Includes several constraints / requirements.');
    suggestions.push('Add more constraints (length, examples, sections...) for full credit.');
  } else if (constraintMatchCount >= 1) {
    constraints = 3;
    strengths.push('Includes at least one constraint / requirement.');
    suggestions.push('Add more constraints (length, examples, sections...) for full credit.');
  } else {
    missing.push('Constraints');
    suggestions.push('Add constraints such as word limit, sections, or tone limits.');
  }

  // 8) Tone (5). Any tone keyword in the prompt text earns full marks — the
  // earlier "3 if only mentioned in text" penalty was a relic of the removed
  // tone form field.
  const toneProvided = !!String(tone).trim();
  const toneMentioned =
    toneProvided || TONE_KEYWORDS.some((k) => promptLower.includes(k));
  let toneScore = 0;
  if (toneMentioned) {
    toneScore = 5;
    strengths.push('Tone is specified.');
  } else {
    missing.push('Tone');
    suggestions.push('Mention the desired tone (professional, formal, friendly...).');
  }

  // 9) Relevance (5) — is the prompt ON-TOPIC, and is it doing more than
  // parroting the scenario back?
  //
  // This used to be `overlapRatio * 5`, the identical signal Context (15) is
  // built from — so the same keyword overlap was paid for twice, 20 of the 100
  // points moved together, and the single most effective way to score highly
  // was to copy the scenario into the prompt. Relevance now measures topicality
  // while penalising verbatim copying, so the two parameters can diverge.
  let relevance = 0;
  if (overlapRatio >= 0.12) relevance += 3;       // on-topic at all
  else if (overlapRatio >= 0.05) relevance += 1;  // tenuously related

  // Does the prompt contribute wording of its own, or is it a copy?
  if (originality >= 0.45) relevance += 2;
  else if (originality >= 0.25) relevance += 1;

  // Near-verbatim restatement of the scenario: almost every meaningful word is
  // borrowed and little is added. That is copying, not prompt engineering.
  const isEcho = isPasted || (overlapRatio >= 0.75 && originality < 0.2);
  if (isEcho) {
    relevance = Math.min(relevance, 1);
    weaknesses.push('Prompt largely restates the scenario instead of instructing the model.');
    suggestions.push('Write instructions in your own words — state the role, task, format and limits.');
  }

  relevance = Math.max(0, Math.min(5, relevance));
  if (relevance >= 4) strengths.push('Prompt is relevant and adds its own instruction.');
  else if (relevance <= 2 && !isEcho) {
    weaknesses.push('Prompt is loosely relevant to the scenario.');
    suggestions.push('Reference the specifics of the scenario in your instructions.');
  }

  // 10) Grammar & Structure (5)
  let grammar = 0;
  if (wordCount > 0) grammar += 1;
  if (/^[A-Z]/.test(promptText.trim())) grammar += 1;
  if (/[.!?]\s*$/.test(promptText.trim())) grammar += 1;
  // simple sentence count heuristic
  const sentences = promptText.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length >= 2) grammar += 1;
  if (wordCount >= 15) grammar += 1;
  grammar = Math.min(5, grammar);
  if (grammar >= 4) strengths.push('Good grammar and structure.');
  else if (grammar <= 3) {
    weaknesses.push('Grammar or structure could be improved.');
    suggestions.push('Use proper capitalization, punctuation, and multiple sentences.');
  }

  const scores = {
    clarity,
    context,
    roleAssignment: role,
    taskDefinition: task,
    inputParameters: inputs,
    outputFormat,
    constraints,
    tone: toneScore,
    relevance,
    grammarStructure: grammar,
  };

  const overallScore = Math.round(
    scores.clarity +
      scores.context +
      scores.roleAssignment +
      scores.taskDefinition +
      scores.inputParameters +
      scores.outputFormat +
      scores.constraints +
      scores.tone +
      scores.relevance +
      scores.grammarStructure
  );

  const rating = ratingFromScore(overallScore);

  // Deduplicate arrays
  const dedupe = (arr) => Array.from(new Set(arr));
  return {
    scores,
    overallScore,
    rating,
    missingParameters: dedupe(missing),
    strengths: dedupe(strengths),
    weaknesses: dedupe(weaknesses),
    suggestions: dedupe(suggestions),
    meta: {
      wordCount,
      overlapRatio: round(overlapRatio),
      originality: round(originality),
      isEcho,
      isPasted,
      longestVerbatimRun,
      hasAction,
      hasRole,
      category,
    },
  };
}

module.exports = { analyzePrompt, ratingFromScore };
