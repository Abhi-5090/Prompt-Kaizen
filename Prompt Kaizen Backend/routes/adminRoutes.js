const express = require('express');
const multer = require('multer');
const {
  stats, listUsers, listPrompts,
  bulkUploadUsers, exportUsers, deleteUser, resetUserPassword, mailStatus, verifyUserEmail, createUser,
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminMiddleware');
const { validate, rules } = require('../middleware/validate');
const { calendar, day, byUser } = require('../controllers/usageController');

const router = express.Router();

// File upload buffer for Excel/CSV — capped at 2 MB.
// `files: 1` and a field-count cap close the multer DoS vector where a body
// with thousands of deeply-nested field names burns CPU during parsing.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
    fields: 10,
    fieldNameSize: 100,
  },
  fileFilter: (req, file, cb) => {
    // Only spreadsheet types reach the XLSX parser. Anything else is
    // rejected before a single byte is handed to it.
    const ok = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
      'text/plain',
      'application/octet-stream', // some browsers send this for .xlsx
    ].includes(file.mimetype) || /\.(xlsx|xls|csv)$/i.test(file.originalname || '');
    if (!ok) {
      return cb(new Error('Only .xlsx, .xls or .csv files are accepted.'));
    }
    return cb(null, true);
  },
});

router.use(protect, adminOnly);

const withId = validate({ params: { id: rules.objectId({ required: true }) } });

// Shared list query shape. `limit` is clamped again inside paginate(), but
// validating here rejects nonsense early and keeps the contract explicit.
const listQuery = {
  page:   rules.int({ min: 1, max: 100000 }),
  limit:  rules.int({ min: 1, max: 100 }),
  search: rules.str({ max: 100 }),
};

router.get('/stats', stats);
router.get('/mail-status', mailStatus);
router.get('/users', validate({ query: listQuery }), listUsers);
router.get('/users/export', exportUsers);

// Grant an email address access. With self-registration closed this is the
// only way an account is created, so the users collection is the access list.
router.post('/users', validate({
  body: {
    name:  rules.str({ required: true, min: 1, max: 80 }),
    email: rules.email({ required: true }),
    // Optional: one is generated and returned once if omitted.
    password: rules.str({ min: 8, max: 200, trim: false }),
    role:  rules.str({ oneOf: ['user', 'admin'] }),
  },
}), createUser);
router.post('/users/bulk-upload', upload.single('file'), bulkUploadUsers);
router.post('/users/:id/reset-password', withId, validate({
  // Admin-set passwords are held to the same floor as user-chosen ones.
  body: { password: rules.str({ required: true, min: 8, max: 200, trim: false }) },
}), resetUserPassword);
router.post('/users/:id/verify-email', withId, verifyUserEmail);
router.delete('/users/:id', withId, deleteUser);
// --- Usage reporting -------------------------------------------------------
// All three bucket by IST calendar day, matching streaks, daily challenges and
// contest windows. A UTC bucket would split an Indian evening across two dates.
// The month and day parts are range-bounded, not just "two digits". A loose
// \d{2} accepts 2026-13, and Date.UTC(2026, 12, 1) silently rolls forward into
// January 2027 — so the caller would get a successful response describing the
// wrong month.
const dateRule  = rules.str({
  pattern: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  patternMessage: 'Date must be YYYY-MM-DD.',
});
const monthRule = rules.str({
  pattern: /^\d{4}-(0[1-9]|1[0-2])$/,
  patternMessage: 'Month must be YYYY-MM.',
});

router.get('/usage/calendar', validate({ query: { month: monthRule } }), calendar);
router.get('/usage/day', validate({ query: { date: dateRule, limit: rules.int({ min: 1, max: 500 }) } }), day);
router.get('/usage/users', validate({ query: {
  from: dateRule, to: dateRule, search: rules.str({ max: 100 }),
} }), byUser);

router.get('/prompts', validate({ query: {
  ...listQuery,
  category: rules.str({ max: 60 }),
  sort:     rules.str({ oneOf: ['score', 'rating', 'date'] }),
  dir:      rules.str({ oneOf: ['asc', 'desc'] }),
} }), listPrompts);

module.exports = router;
