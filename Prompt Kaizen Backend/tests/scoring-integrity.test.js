/**
 * Scoring integrity.
 *
 * The product's value rests on the score meaning something. Two defects made
 * it not:
 *   - /analyze trusted a client-supplied `scenario`, and the rule-based score
 *     is largely keyword overlap against it, so submitting a "scenario" equal
 *     to your own prompt scored near-100;
 *   - Context (15) and Relevance (5) were computed from the identical overlap
 *     ratio, so pasting the brief moved 20 points at once.
 *
 * These assertions pin the gaming resistance and the fallback contract.
 */
const { analyzePrompt } = require('../utils/promptAnalyzer');
const { isKnownScenario, scenarioId, getScenarioById, SCENARIO_BANK } = require('../utils/scenarioBank');
const { evaluatePrompt, normalizeScores, MAXIMA } = require('../utils/llmAnalyzer');

let pass = 0, fail = 0;
const ok  = (n, e='') => { console.log(`  PASS  ${n}${e ? ' — ' + e : ''}`); pass++; };
const bad = (n, e='') => { console.log(`  FAIL  ${n}${e ? ' — ' + e : ''}`); fail++; };

const SCENARIO = SCENARIO_BANK['Email Writing'][0];
const score = (p) => analyzePrompt({ category:'Email Writing', scenario: SCENARIO, userPrompt: p });

(async () => {
  console.log('=== Rubric totals 100 ===');
  const total = Object.values(MAXIMA).reduce((a,b) => a+b, 0);
  total === 100 ? ok('parameter maxima sum to 100') : bad('maxima sum to ' + total);

  console.log('=== Gaming resistance ===');
  const verbatim = score(SCENARIO);
  const garnished = score(SCENARIO + ' Act as a writer. Use a table format with a professional tone.');
  const buried = score('Act as a professional. ' + SCENARIO + ' Use bullet points, formal tone, under 200 words.');
  const genuine = score(
    'Act as a professional communication specialist. Write a formal email from a student to the ' +
    'Principal requesting approval to run a hands-on AI workshop for B.Tech students this Saturday. ' +
    'Audience is the Principal. Use a respectful, concise tone, keep it under 180 words, include a ' +
    'clear subject line, the date, expected attendance, and a single call to action.');
  const lazy = score('write an email');

  verbatim.meta.isPasted ? ok('verbatim copy flagged as pasted', `run=${verbatim.meta.longestVerbatimRun}`) : bad('paste not detected');
  garnished.meta.isPasted ? ok('paste-plus-garnish flagged') : bad('garnished paste not detected');
  buried.meta.isPasted ? ok('paste buried mid-prompt flagged') : bad('buried paste not detected');
  !genuine.meta.isPasted ? ok('genuine prompt not falsely flagged', `run=${genuine.meta.longestVerbatimRun}`) : bad('false positive on genuine prompt');

  genuine.overallScore > garnished.overallScore
    ? ok('genuine beats paste-and-garnish', `${genuine.overallScore} > ${garnished.overallScore}`)
    : bad('GAMING WINS', `genuine ${genuine.overallScore} <= gamed ${garnished.overallScore}`);
  genuine.overallScore > verbatim.overallScore
    ? ok('genuine beats verbatim copy', `${genuine.overallScore} > ${verbatim.overallScore}`)
    : bad('verbatim copy scores too well');
  genuine.overallScore > lazy.overallScore
    ? ok('genuine beats a one-liner', `${genuine.overallScore} > ${lazy.overallScore}`)
    : bad('one-liner scores too well');

  console.log('=== Context and Relevance are independent signals ===');
  // Both parameters used to be `overlapRatio` scaled to their maxima, so as a
  // FRACTION of maximum they were always identical. That is the property to
  // test — not that one is high while the other is low, which can legitimately
  // happen either way. If normalised context ever equals normalised relevance
  // across every sample, they are still one signal wearing two hats.
  const samples = [verbatim, garnished, genuine, lazy, buried];
  const diverges = samples.some(
    (r) => Math.abs(r.scores.context / 15 - r.scores.relevance / 5) > 0.05
  );
  diverges
    ? ok('context and relevance diverge as fractions of maximum',
        samples.map((r) => `${(r.scores.context/15).toFixed(2)}/${(r.scores.relevance/5).toFixed(2)}`).join(' '))
    : bad('context and relevance are still the same normalised signal');

  // And specifically: a strong prompt can max relevance without maxing context.
  (genuine.scores.relevance === 5 && genuine.scores.context < 15)
    ? ok('strong prompt maxes relevance without maxing context',
        `ctx=${genuine.scores.context} rel=${genuine.scores.relevance}`)
    : bad('relevance/context still locked together',
        `ctx=${genuine.scores.context} rel=${genuine.scores.relevance}`);
  (verbatim.scores.context <= 5 && verbatim.scores.relevance <= 1)
    ? ok('pasted brief is penalised on both', `ctx=${verbatim.scores.context} rel=${verbatim.scores.relevance}`)
    : bad('pasted brief not penalised enough');

  console.log('=== Scenarios cannot be forged ===');
  isKnownScenario('Email Writing', SCENARIO) ? ok('bank scenario recognised') : bad('bank scenario rejected');
  !isKnownScenario('Email Writing', 'Write an email. Act as a professional. Use a formal tone in a table.')
    ? ok('invented scenario rejected') : bad('INVENTED SCENARIO ACCEPTED');
  !isKnownScenario('Data Analysis', SCENARIO)
    ? ok('right text under wrong category rejected') : bad('category not bound to scenario');
  const id = scenarioId('Email Writing', SCENARIO);
  getScenarioById(id)?.scenario === SCENARIO ? ok('scenario id round-trips') : bad('id does not resolve');
  getScenarioById('deadbeef1234') === null ? ok('unknown id returns null') : bad('unknown id resolved');

  console.log('=== Model output is clamped, totals are server-computed ===');
  const n = normalizeScores({ clarity: 999, context: -40, roleAssignment: '7', taskDefinition: null });
  (n.scores.clarity === 10 && n.scores.context === 0 && n.scores.roleAssignment === 7 && n.scores.taskDefinition === 0)
    ? ok('out-of-range and malformed scores clamped')
    : bad('clamping failed', JSON.stringify(n.scores));
  const sum = Object.values(n.scores).reduce((a,b)=>a+b,0);
  n.overallScore === sum ? ok('total recomputed from parts, not trusted') : bad('total mismatch');

  console.log('=== Fallback contract ===');
  // No key configured in this environment, so this must take the rules path
  // and still return a complete, usable result.
  const r = await evaluatePrompt({ category:'Email Writing', scenario: SCENARIO,
    userPrompt:'Act as a specialist and write a polite formal email to the Principal.' });
  r.meta.source === 'rules' ? ok('falls back to rules with no key') : bad('unexpected source: ' + r.meta.source);
  (r.improvedPrompt && r.improvedPrompt.length > 0) ? ok('fallback still returns an improved prompt') : bad('empty improvedPrompt');
  (typeof r.overallScore === 'number' && r.rating) ? ok('fallback returns a complete result') : bad('incomplete fallback result');
  Object.keys(MAXIMA).every((k) => typeof r.scores[k] === 'number')
    ? ok('all ten parameters present on fallback') : bad('missing parameters on fallback');

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE ERROR', e); process.exit(2); });
