const XLSX = require('xlsx');
const User = require('../models/User');
const PromptEvaluation = require('../models/PromptEvaluation');
const ContestSubmission = require('../models/ContestSubmission');
const Contest = require('../models/Contest');
const { recordAudit } = require('../utils/audit');
const { getMailHealth, verifyMailConnection } = require('../utils/mailer');
const { getLlmHealth } = require('../utils/llmAnalyzer');
const { paginate, withSearch } = require('../utils/pagination');

// Safety caps for unbounded admin reads. Aggregations would be cleaner long
// term, but capping the find() result preserves the current response shape
// (no frontend changes needed) while preventing a single request from sweeping
// hundreds of thousands of docs as the platform grows.
const ADMIN_STATS_PROMPT_SAMPLE = 10000;

const stats = async (req, res) => {
  try {
    const [totalUsers, totalPrompts, all] = await Promise.all([
      User.countDocuments(),
      PromptEvaluation.countDocuments(),
      // Sample the most recent N prompts for the platform-wide aggregates
      // shown on the admin dashboard. Average + per-category counts are
      // representative; for an exact full-history total, use countDocuments.
      PromptEvaluation.find({}, 'overallScore category createdAt')
        .sort({ createdAt: -1 })
        .limit(ADMIN_STATS_PROMPT_SAMPLE)
        .lean(),
    ]);

    const averagePlatformScore = all.length
      ? Math.round((all.reduce((a, b) => a + (b.overallScore || 0), 0) / all.length) * 10) / 10
      : 0;

    const categoryCount = {};
    for (const it of all) {
      categoryCount[it.category] = (categoryCount[it.category] || 0) + 1;
    }

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .select('-password')
      .lean();

    const recentPrompts = await PromptEvaluation.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'name email')
      .lean();

    return res.json({
      totalUsers,
      totalPrompts,
      averagePlatformScore,
      categoryCount,
      recentUsers,
      recentPrompts,
    });
  } catch (err) {
    console.error('admin stats error:', err);
    return res.status(500).json({ message: 'Failed to load admin stats.' });
  }
};

/**
 * Paginated, server-side-searchable user list.
 *
 * Was `find().limit(1000)` with the browser filtering the result: past 1000
 * accounts the table silently truncated, and search could only ever match
 * within that window.
 */
const listUsers = async (req, res) => {
  try {
    const filter = withSearch({}, req.query.search, ['name', 'email']);
    const [{ items, pagination }, adminCount] = await Promise.all([
      paginate(User, {
        filter,
        sort: { createdAt: -1 },
        query: req.query,
        select: '-password',
      }),
      // Collection-wide counts cannot be derived from a single page, so they
      // are counted in the database rather than tallied from the rows shown.
      User.countDocuments({ role: 'admin' }),
    ]);
    // `users` is kept alongside `items` so an older client that has not been
    // updated for pagination still renders the current page.
    return res.json({ users: items, items, pagination, meta: { adminCount } });
  } catch (err) {
    console.error('admin listUsers error:', err);
    return res.status(500).json({ message: 'Failed to list users.' });
  }
};

const listPrompts = async (req, res) => {
  try {
    // Category filtering moves to the server for the same reason as search:
    // filtering a truncated page client-side gives wrong answers.
    const base = {};
    if (req.query.category) base.category = req.query.category;
    const filter = withSearch(base, req.query.search, ['scenario', 'userPrompt']);

    // Sorting also belongs on the server now. Ordering a single page client-side
    // reorders 25 rows out of thousands, which looks like a sort but is not one.
    // Whitelisted: a sort field taken straight from the query string would let a
    // caller sort by any indexed or unindexed field and trigger a collection scan.
    const SORTABLE = {
      score:  'overallScore',
      // Rating is derived from the score, so ranking by score gives the same
      // tier order with a sensible tiebreak inside each tier — and uses an
      // index instead of sorting on a string.
      rating: 'overallScore',
      date:   'createdAt',
    };
    const field = SORTABLE[req.query.sort] || 'createdAt';
    const dir = req.query.dir === 'asc' ? 1 : -1;
    const sort = field === 'createdAt' ? { createdAt: dir } : { [field]: dir, createdAt: -1 };

    const [{ items, pagination }, categories] = await Promise.all([
      paginate(PromptEvaluation, {
        filter,
        sort,
        query: req.query,
        populate: [['userId', 'name email']],
      }),
      // The category filter's options must describe the whole collection, not
      // whichever categories happen to appear on the current page.
      PromptEvaluation.distinct('category'),
    ]);
    return res.json({
      prompts: items,
      items,
      pagination,
      meta: { categories: categories.sort() },
    });
  } catch (err) {
    console.error('admin listPrompts error:', err);
    return res.status(500).json({ message: 'Failed to list prompts.' });
  }
};

/**
 * Parse an uploaded Excel/CSV buffer where each row is
 * `[name, email, password]` with no header row.
 * Returns { rows: [...valid], skipped: [...rejected-with-reason] }.
 */
const parseUsersFromBuffer = (buffer) => {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const rows = [];
  const skipped = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
    for (let i = 0; i < grid.length; i++) {
      const row = grid[i] || [];
      const name = String(row[0] ?? '').trim();
      const email = String(row[1] ?? '').trim().toLowerCase();
      const password = String(row[2] ?? '');
      if (!name && !email && !password) continue; // blank line
      if (!name || !email || !password) {
        skipped.push({ row: i + 1, reason: 'Missing name, email, or password.' });
        continue;
      }
      if (password.length < 6) {
        skipped.push({ row: i + 1, email, reason: 'Password must be at least 6 characters.' });
        continue;
      }
      rows.push({ name, email, password });
    }
  }
  return { rows, skipped };
};

const bulkUploadUsers = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }
    const { rows, skipped } = parseUsersFromBuffer(req.file.buffer);

    // De-dup against existing emails in DB and within the file itself.
    const incomingEmails = Array.from(new Set(rows.map((r) => r.email)));
    const existing = await User.find({ email: { $in: incomingEmails } }, 'email').lean();
    const existingSet = new Set(existing.map((u) => u.email));

    const created = [];
    const duplicates = [];
    const seenInFile = new Set();

    for (const r of rows) {
      if (existingSet.has(r.email) || seenInFile.has(r.email)) {
        duplicates.push(r.email);
        continue;
      }
      seenInFile.add(r.email);
      try {
        const user = await User.create({
          name: r.name,
          email: r.email,
          password: r.password,
          // An operator creating the account and handing out the password IS
          // the verification step. Without this the account defaulted to
          // emailVerified:false, so login refused it and mailed an OTP
          // instead — the password the admin distributed simply did not work.
          emailVerified: true,
        });
        created.push({ _id: user._id, name: user.name, email: user.email });
      } catch (err) {
        skipped.push({ email: r.email, reason: err?.message || 'Failed to create.' });
      }
    }

    await recordAudit(req, {
      action: 'user.bulk_create',
      targetType: 'User',
      metadata: {
        parsed: rows.length,
        created: created.length,
        duplicates: duplicates.length,
        invalid: skipped.length,
      },
    });

    return res.json({
      parsed: rows.length,
      created: created.length,
      skippedDuplicates: duplicates.length,
      skippedInvalid: skipped.length,
      total: created.length,
      details: { created, duplicates, skipped },
    });
  } catch (err) {
    console.error('bulkUploadUsers error:', err);
    return res.status(500).json({ message: 'Failed to parse the uploaded file.' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (String(req.user._id) === String(id)) {
      return res.status(400).json({ message: 'You cannot delete your own account.' });
    }
    const target = await User.findById(id);
    if (!target) return res.status(404).json({ message: 'User not found.' });
    if (target.role === 'admin') {
      return res.status(400).json({ message: 'Cannot delete an admin account.' });
    }
    await Promise.all([
      PromptEvaluation.deleteMany({ userId: target._id }),
      ContestSubmission.deleteMany({ userId: target._id }),
      // Strip the deleted user's email from every contest's allowlist so a
      // future re-onboarding under the same email doesn't silently inherit
      // eligibility for old contests, and so the address doesn't linger as
      // PII on contest documents.
      Contest.updateMany(
        { allowedEmails: target.email },
        { $pull: { allowedEmails: target.email } }
      ),
    ]);
    await recordAudit(req, {
      action: 'user.delete',
      targetType: 'User',
      targetId: target._id,
      targetLabel: target.email,
      metadata: { name: target.name, role: target.role },
    });

    await target.deleteOne();
    return res.json({ message: 'User deleted.' });
  } catch (err) {
    console.error('deleteUser error:', err);
    return res.status(500).json({ message: 'Failed to delete user.' });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }
    const user = await User.findById(id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Block resetting another admin's password — that would let any admin
    // silently lock out a peer (including the seeded operator). An admin can
    // still rotate their own password via this endpoint.
    if (user.role === 'admin' && String(user._id) !== String(req.user._id)) {
      return res.status(403).json({
        message: 'You cannot reset another administrator\'s password.',
      });
    }

    user.password = String(password); // pre-save hook re-hashes
    await user.save();

    // Destructive admin action — recorded in the AuditLog collection, which
    // is queryable and survives log rotation (this used to be a console.warn).
    // Note the save above bumped tokenVersion, so every session the target
    // had open is now signed out.
    await recordAudit(req, {
      action: 'user.password_reset',
      targetType: 'User',
      targetId: user._id,
      targetLabel: user.email,
      metadata: { selfService: String(user._id) === String(req.user._id) },
    });

    return res.json({
      message: 'Password reset. The user has been signed out of all sessions.',
    });
  } catch (err) {
    console.error('resetUserPassword error:', err);
    return res.status(500).json({ message: 'Failed to reset password.' });
  }
};

/**
 * Streams an .xlsx of every user's Name + Email back to the browser as a
 * file download. Used by the admin "Export users" button alongside Bulk
 * upload — the two are symmetric: the export's column shape (Name, Email)
 * matches the bulk-upload parser, so the file can in principle be re-used
 * to top up another deployment.
 */
const exportUsers = async (req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .select('name email')
      .lean();

    // Exporting every user's name and address is a bulk PII read and is
    // recorded as one.
    await recordAudit(req, {
      action: 'user.export',
      targetType: 'User',
      metadata: { count: users.length },
    });

    const rows = [
      ['Name', 'Email'],
      ...users.map((u) => [u.name || '', u.email || '']),
    ];

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    // Reasonable starting column widths so the file is legible without manual
    // resizing in Excel / Numbers / Sheets.
    sheet['!cols'] = [{ wch: 24 }, { wch: 36 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Users');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Filename includes the IST date so multiple exports don't overwrite each
    // other in the operator's Downloads folder.
    const istNow = new Date(Date.now() + 330 * 60 * 1000);
    const stamp =
      istNow.getUTCFullYear() + '-' +
      String(istNow.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(istNow.getUTCDate()).padStart(2, '0');
    const filename = `prompt-kaizen-users-${stamp}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.end(buffer);
  } catch (err) {
    console.error('exportUsers error:', err);
    return res.status(500).json({ message: 'Failed to export users.' });
  }
};

/**
 * Manually mark a user's email as verified.
 *
 * Recovery path for accounts stranded by a mail outage: they registered
 * successfully, the verification code never arrived, and login refuses them
 * because `emailVerified` is false. Without this an operator's only option is
 * editing the database by hand. Recorded in the audit log because it bypasses
 * proof of address ownership.
 */
const verifyUserEmail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.emailVerified) {
      return res.json({ message: 'That account is already verified.', alreadyVerified: true });
    }

    user.emailVerified = true;
    // Clear any pending code so a stale one can't be replayed later.
    user.otpHash = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    await user.save();

    await recordAudit(req, {
      action: 'user.email_verified_by_admin',
      targetType: 'User',
      targetId: user._id,
      targetLabel: user.email,
      metadata: { reason: 'manual verification (bypasses email ownership proof)' },
    });

    return res.json({ message: `${user.email} can now sign in.` });
  } catch (err) {
    console.error('verifyUserEmail error:', err);
    return res.status(500).json({ message: 'Failed to verify user.' });
  }
};

/**
 * Mail delivery status for the admin console. Signup depends entirely on this
 * path, and its failures are asynchronous and otherwise invisible, so
 * operators need a direct read on it. `recheck=1` re-runs the SMTP handshake.
 */
const mailStatus = async (req, res) => {
  try {
    if (req.query.recheck === '1' || req.query.recheck === 'true') {
      await verifyMailConnection();
    }
    const health = getMailHealth();
    const llm = getLlmHealth();
    return res.json({
      mail: health,
      impact: health.healthy
        ? null
        : 'New users cannot receive verification codes and will be unable to sign in.',
      // Scoring engine status. When `enabled` is true but `fallbacks` is
      // climbing, submissions are silently being graded by the rule-based
      // engine instead of the LLM — scores stay valid but are less insightful,
      // and that is worth knowing before users report it.
      llm: {
        enabled: llm.enabled,
        model: llm.model,
        calls: llm.calls,
        failures: llm.failures,
        fallbacks: llm.fallbacks,
        lastError: llm.lastError,
        lastErrorAt: llm.lastErrorAt,
        tokens: {
          prompt: llm.totalPromptTokens,
          completion: llm.totalCompletionTokens,
        },
      },
    });
  } catch (err) {
    console.error('mailStatus error:', err);
    return res.status(500).json({ message: 'Failed to read mail status.' });
  }
};

module.exports = {
  stats,
  mailStatus,
  verifyUserEmail,
  listUsers,
  listPrompts,
  bulkUploadUsers,
  exportUsers,
  deleteUser,
  resetUserPassword,
};
