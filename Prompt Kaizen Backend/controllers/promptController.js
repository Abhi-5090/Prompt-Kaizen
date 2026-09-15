const PromptEvaluation = require('../models/PromptEvaluation');
const User = require('../models/User');
const { evaluatePrompt } = require('../utils/llmAnalyzer');
const { getScenario, SCENARIO_BANK, scenarioId, getScenarioById, isKnownScenario } = require('../utils/scenarioBank');
const { paginate, withSearch } = require('../utils/pagination');
const { getDailyChallenge, istMidnightToday, isSameIstDay } = require('../utils/dailyChallenge');
const {
  consumeDictation,
  getDictationStatus,
  DICTATION_DAILY_LIMIT,
} = require('../utils/dictation');

const ALLOWED_CATEGORIES = [
  'Academic Writing',
  'Email Writing',
  'Resume and LinkedIn',
  'Coding and Debugging',
  'Data Analysis',
  'Business Communication',
  'Interview Preparation',
  'Research and Summarization',
  'Content Creation',
  'Social Media Post',
  'Image Generation Prompt',
  'Other',
];

/**
 * Returns every Daily Challenge submission the caller has ever made, newest
 * first. Used by the /challenge page to render the streak calendar and the
 * past-attempts list.
 */
const getDailyChallengeHistory = async (req, res) => {
  try {
    const items = await PromptEvaluation.find(
      { userId: req.user._id, isDailyChallenge: true },
      'category scenario userPrompt scores overallScore rating challengeDate createdAt',
    )
      .sort({ challengeDate: -1, createdAt: -1 })
      .lean();
    return res.json({ items, total: items.length });
  } catch (err) {
    console.error('getDailyChallengeHistory error:', err);
    return res.status(500).json({ message: 'Failed to load daily challenge history.' });
  }
};

const getScenarioForCategory = (req, res) => {
  const { category } = req.query;
  const { exclude } = req.query;
  if (!category) {
    return res.status(400).json({ message: 'category query param is required.' });
  }
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ message: 'Invalid category.' });
  }
  const scenario = getScenario(category, { exclude });
  return res.json({
    category,
    scenario,
    scenarioId: scenarioId(category, scenario),
    total: (SCENARIO_BANK[category] || []).length,
  });
};

/**
 * Today's Daily Challenge — same (category, scenario) for everyone in the
 * same UTC day. Response also indicates whether the caller has already
 * completed today's challenge, and includes their score if so.
 */
const getDailyChallengeForToday = async (req, res) => {
  try {
    const challenge = getDailyChallenge();
    const completedToday = isSameIstDay(req.user.lastChallengeDate, istMidnightToday());

    let mySubmission = null;
    if (completedToday) {
      mySubmission = await PromptEvaluation.findOne({
        userId: req.user._id,
        isDailyChallenge: true,
        challengeDate: req.user.lastChallengeDate,
      })
        .sort({ createdAt: -1 })
        .lean();
    }

    return res.json({
      ...challenge,
      completedToday,
      totalCompleted: req.user.dailyChallengesCompleted || 0,
      mySubmission: mySubmission
        ? {
            _id: mySubmission._id,
            overallScore: mySubmission.overallScore,
            rating: mySubmission.rating,
          }
        : null,
    });
  } catch (err) {
    console.error('getDailyChallengeForToday error:', err);
    return res.status(500).json({ message: 'Failed to load daily challenge.' });
  }
};

const analyze = async (req, res) => {
  try {
    const {
      category, scenario, userPrompt,
      isDailyChallenge, usedDictation,
    } = req.body;

    if (!category || !scenario || !userPrompt) {
      return res.status(400).json({
        message: 'category, scenario, and userPrompt are required.',
      });
    }
    // Reject any non-string input early. Without this guard a malicious client
    // could send `{ "$ne": "" }` as userPrompt; that reaches Mongo as a query
    // object and throws CastError → 500. Strict typing keeps the failure at
    // the validation layer.
    if (typeof category !== 'string' || typeof scenario !== 'string' || typeof userPrompt !== 'string') {
      return res.status(400).json({
        message: 'category, scenario, and userPrompt must all be strings.',
      });
    }
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Invalid category.' });
    }
    if (userPrompt.trim().length < 5) {
      return res.status(400).json({ message: 'Prompt is too short (min 5 characters).' });
    }
    if (scenario.trim().length < 10) {
      return res.status(400).json({ message: 'Scenario is too short (min 10 characters).' });
    }

    // Resolve the scenario server-side.
    //
    // The scenario was previously taken verbatim from the request body, and
    // because the rule-based score is largely keyword overlap against it, a
    // caller could submit a "scenario" identical to their own prompt and score
    // close to 100. Preferred path is the id issued by /prompts/scenario; the
    // raw text is still accepted for older clients but must match the bank.
    let resolvedScenario = scenario;
    let resolvedCategory = category;

    if (req.body.scenarioId) {
      const found = getScenarioById(req.body.scenarioId);
      if (!found) {
        return res.status(400).json({ message: 'Unknown scenario. Please request a new one.' });
      }
      resolvedScenario = found.scenario;
      resolvedCategory = found.category;
    } else if (!isKnownScenario(category, scenario)) {
      return res.status(400).json({
        message: 'That scenario was not issued by Prompt Kaizen. Please request a scenario before submitting.',
      });
    }

    const today = istMidnightToday();

    // Daily Challenge enforcement runs BEFORE the dictation consume so a user
    // who already finished today can't silently burn dictation slots by
    // re-submitting. Validate scenario match, then atomically claim today's
    // slot — two concurrent submits can't both pass.
    if (isDailyChallenge) {
      const challenge = getDailyChallenge();
      if (
        challenge.category !== resolvedCategory ||
        String(challenge.scenario).trim() !== String(resolvedScenario).trim()
      ) {
        return res.status(400).json({
          message: 'Submitted scenario does not match today\'s Daily Challenge.',
        });
      }

      // Only match users who have NOT yet completed today (in IST terms).
      // The `$lt: today` covers everyone whose last completion was on a
      // previous IST day; the explicit null check covers first-time entrants.
      const claim = await User.findOneAndUpdate(
        {
          _id: req.user._id,
          $or: [{ lastChallengeDate: null }, { lastChallengeDate: { $lt: today } }],
        },
        {
          $set: { lastChallengeDate: today },
          $inc: { dailyChallengesCompleted: 1 },
        },
        { new: true }
      );
      if (!claim) {
        return res.status(409).json({
          message: 'You have already completed today\'s Daily Challenge. Come back tomorrow!',
        });
      }
      // Keep the in-memory user in sync for downstream middleware / responses.
      req.user.lastChallengeDate = claim.lastChallengeDate;
      req.user.dailyChallengesCompleted = claim.dailyChallengesCompleted;
    }

    // Dictation quota — consumed AFTER all gating checks so rejected requests
    // never burn a user's daily quota. Only ticks when the client actually
    // dictated this prompt; typed prompts never affect the counter. The
    // atomic update inside consumeDictation persists the change in one
    // MongoDB round-trip, so there's no separate save() to fail silently.
    let dictation = getDictationStatus(req.user);
    if (usedDictation === true) {
      try {
        dictation = await consumeDictation(req.user._id);
        // Keep the in-memory user in sync for any downstream code that reads
        // these counters in this same request.
        req.user.dictationsUsedToday = dictation.usedToday;
        req.user.dictationUsedDate = istMidnightToday();
      } catch (e) {
        if (e.code === 'DICTATION_LIMIT_REACHED') {
          return res.status(429).json({
            message: e.message,
            dictation: getDictationStatus(req.user),
          });
        }
        throw e;
      }
    }

    // Hybrid evaluation: rule-based scoring always runs as the floor, and the
    // LLM layer refines it when configured. evaluatePrompt never throws — a
    // vendor outage degrades the insight, not the request.
    const analysis = await evaluatePrompt({
      category: resolvedCategory,
      scenario: resolvedScenario,
      userPrompt,
    });
    const improvedPrompt = analysis.improvedPrompt;

    const doc = await PromptEvaluation.create({
      userId: req.user._id,
      category: resolvedCategory,
      scenario: resolvedScenario,
      userPrompt,
      scores: analysis.scores,
      overallScore: analysis.overallScore,
      rating: analysis.rating,
      missingParameters: analysis.missingParameters,
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      suggestions: analysis.suggestions,
      improvedPrompt,
      isDailyChallenge: !!isDailyChallenge,
      challengeDate: isDailyChallenge ? today : null,
      scoredBy: analysis.meta?.source || 'rules',
      scoringModel: analysis.meta?.model || null,
    });

    // No req.user.save() here — both counter writes (daily challenge,
    // dictation) are persisted atomically before we reach this point.

    return res.status(201).json({
      evaluation: doc,
      meta: analysis.meta,
      dictation,
    });
  } catch (err) {
    console.error('analyze error:', err);
    return res.status(500).json({ message: 'Failed to analyze prompt.' });
  }
};

const history = async (req, res) => {
  try {
    const base = { userId: req.user._id };
    if (req.query.category) base.category = req.query.category;
    const filter = withSearch(base, req.query.search, ['scenario', 'userPrompt']);

    const { items, pagination } = await paginate(PromptEvaluation, {
      filter,
      sort: { createdAt: -1 },
      query: req.query,
    });
    return res.json({ items, pagination });
  } catch (err) {
    console.error('history error:', err);
    return res.status(500).json({ message: 'Failed to load history.' });
  }
};

const getOne = async (req, res) => {
  try {
    const doc = await PromptEvaluation.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Evaluation not found.' });
    if (String(doc.userId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }
    return res.json({ evaluation: doc });
  } catch (err) {
    console.error('getOne error:', err);
    return res.status(500).json({ message: 'Failed to load evaluation.' });
  }
};

const remove = async (req, res) => {
  try {
    const doc = await PromptEvaluation.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Evaluation not found.' });
    if (String(doc.userId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }
    await doc.deleteOne();
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error('remove error:', err);
    return res.status(500).json({ message: 'Failed to delete.' });
  }
};

module.exports = {
  analyze,
  history,
  getOne,
  remove,
  getScenarioForCategory,
  getDailyChallengeForToday,
  getDailyChallengeHistory,
  ALLOWED_CATEGORIES,
};
