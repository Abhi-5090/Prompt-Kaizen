const express = require('express');
const {
  analyze, history, getOne, remove,
  getScenarioForCategory, getDailyChallengeForToday, getDailyChallengeHistory,
  ALLOWED_CATEGORIES,
} = require('../controllers/promptController');
const { protect } = require('../middleware/authMiddleware');
const { validate, rules } = require('../middleware/validate');

const router = express.Router();

const idParam = { id: rules.objectId({ required: true }) };

router.get('/scenario', protect, validate({
  query: {
    category: rules.str({ required: true, oneOf: ALLOWED_CATEGORIES }),
    exclude:  rules.str({ max: 2000 }),
  },
}), getScenarioForCategory);

router.get('/daily-challenge/history', protect, getDailyChallengeHistory);
router.get('/daily-challenge', protect, getDailyChallengeForToday);

router.post('/analyze', protect, validate({
  body: {
    category:         rules.str({ required: true, oneOf: ALLOWED_CATEGORIES }),
    // Preferred: the id issued by GET /prompts/scenario. The raw text is still
    // accepted for older clients, but is verified against the bank either way.
    scenarioId:       rules.str({ max: 32 }),
    scenario:         rules.str({ required: true, min: 10, max: 2000 }),
    // Upper bound matters: the analyzer tokenizes and runs regexes over this
    // string, so an unbounded body was a cheap way to burn CPU per request.
    userPrompt:       rules.str({ required: true, min: 5, max: 10000 }),
    isDailyChallenge: rules.bool({ default: false }),
    usedDictation:    rules.bool({ default: false }),
  },
}), analyze);

router.get('/history', protect, validate({
  query: {
    page:     rules.int({ min: 1, max: 100000 }),
    limit:    rules.int({ min: 1, max: 100 }),
    search:   rules.str({ max: 100 }),
    category: rules.str({ oneOf: ALLOWED_CATEGORIES }),
  },
}), history);
router.get('/:id', protect, validate({ params: idParam }), getOne);
router.delete('/:id', protect, validate({ params: idParam }), remove);

module.exports = router;
