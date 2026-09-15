const express = require('express');
const multer = require('multer');
const {
  stats, listUsers, listPrompts,
  bulkUploadUsers, exportUsers, deleteUser, resetUserPassword, mailStatus, verifyUserEmail,
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminMiddleware');
const { validate, rules } = require('../middleware/validate');

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
router.post('/users/bulk-upload', upload.single('file'), bulkUploadUsers);
router.post('/users/:id/reset-password', withId, validate({
  // Admin-set passwords are held to the same floor as user-chosen ones.
  body: { password: rules.str({ required: true, min: 8, max: 200, trim: false }) },
}), resetUserPassword);
router.post('/users/:id/verify-email', withId, verifyUserEmail);
router.delete('/users/:id', withId, deleteUser);
router.get('/prompts', validate({ query: {
  ...listQuery,
  category: rules.str({ max: 60 }),
  sort:     rules.str({ oneOf: ['score', 'rating', 'date'] }),
  dir:      rules.str({ oneOf: ['asc', 'desc'] }),
} }), listPrompts);

module.exports = router;
