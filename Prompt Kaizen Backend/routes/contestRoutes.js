const express = require('express');
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminMiddleware');
const { validate, rules } = require('../middleware/validate');
const { ALLOWED_CATEGORIES } = require('../controllers/promptController');
const {
  listContests,
  createContest,
  updateContest,
  deleteContest,
  uploadAllowedEmails,
  publishContest,
  closeContest,
  getContestDetail,
} = require('../controllers/contestAdminController');
const {
  listAvailable,
  getContestForUser,
  startContest,
  submitContest,
  getMyResult,
  leaderboard,
  getContestLeaderboard,
} = require('../controllers/contestUserController');

const router = express.Router();

// File upload buffer for Excel/CSV — capped at 2 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

// ----- Admin endpoints (/api/admin/contests) — mounted by server.js below.
const idParam = { id: rules.objectId({ required: true }) };
const withId = validate({ params: idParam });

// Shared body shape for create/update. Bounds matter here because these
// strings were previously unbounded — a contest title could be megabytes.
const contestBody = {
  title:           rules.str({ max: 160 }),
  description:     rules.str({ max: 2000 }),
  scheduledDate:   rules.str({ max: 40 }),
  startTime:       rules.time(),
  endTime:         rules.time(),
  durationMinutes: rules.int({ min: 5, max: 480 }),
  scenarios: rules.arrayOf(
    rules.shape({
      category: rules.str({ required: true, oneOf: ALLOWED_CATEGORIES }),
      scenario: rules.str({ required: true, min: 10, max: 2000 }),
    }),
    { min: 1, max: 10 }
  ),
};

const adminRouter = express.Router();
adminRouter.use(protect, adminOnly);
adminRouter.get('/',            listContests);
adminRouter.post('/',           validate({ body: { ...contestBody, title: rules.str({ required: true, min: 1, max: 160 }) } }), createContest);
adminRouter.get('/:id',         withId, validate({
  query: { page: rules.int({ min: 1, max: 100000 }), limit: rules.int({ min: 1, max: 100 }) },
}), getContestDetail);
adminRouter.put('/:id',         withId, validate({ body: contestBody }), updateContest);
adminRouter.delete('/:id',      withId, deleteContest);
adminRouter.post('/:id/emails', withId, upload.single('file'), uploadAllowedEmails);
adminRouter.post('/:id/publish', withId, publishContest);
adminRouter.post('/:id/close',   withId, closeContest);

// ----- User endpoints (/api/contests)
router.use(protect);
// `/leaderboard` must come BEFORE the catch-all `/:id` so it isn't matched
// as a Contest id.
router.get('/leaderboard',          leaderboard);
router.get('/',                     listAvailable);
router.get('/:id/leaderboard',      withId, getContestLeaderboard);
router.get('/:id/result',           withId, getMyResult);
router.get('/:id',                  withId, getContestForUser);
router.post('/:id/start',           withId, startContest);
router.post('/:id/submit',          withId, validate({
  body: {
    answers: rules.arrayOf(
      rules.shape({
        scenarioIndex: rules.int({ required: true, min: 0, max: 9 }),
        userPrompt:    rules.str({ max: 10000, default: '' }),
      }),
      { max: 10, default: [] }
    ),
  },
}), submitContest);

module.exports = { userRouter: router, adminRouter };
