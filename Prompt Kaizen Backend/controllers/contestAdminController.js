const Contest = require('../models/Contest');
const ContestSubmission = require('../models/ContestSubmission');
const User = require('../models/User');
const { parseEmailsFromBuffer } = require('../utils/parseEmails');
const { ALLOWED_CATEGORIES } = require('./promptController');
const { istDateTimeToUtc } = require('../utils/dailyChallenge');
const { paginate } = require('../utils/pagination');

/**
 * Stores `scheduledDate` as the UTC instant of midnight on the chosen IST day,
 * regardless of what time component the admin's payload included.
 */
function toIstMidnight(input) {
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  // Shift to IST so we can read the IST date components, then reconstruct
  // midnight IST as a UTC instant.
  const IST_OFFSET_MS = 330 * 60 * 1000;
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const day = ist.getUTCDate();
  return new Date(Date.UTC(y, m, day, 0, 0, 0, 0) - IST_OFFSET_MS);
}

/**
 * Resolves the time-window for a contest from the admin's payload.
 * Returns `{ startsAt, endsAt, dateStr }` or `{ error }`.
 *
 * Accepts EITHER:
 *  - `scheduledDate` (YYYY-MM-DD) + `startTime` (HH:MM) + `endTime` (HH:MM), or
 *  - `scheduledDate` alone (legacy — the window defaults to the whole IST day).
 */
function resolveWindow({ scheduledDate, startTime, endTime }) {
  if (!scheduledDate) return { error: 'A scheduled date is required.' };
  const dateStr = String(scheduledDate).slice(0, 10); // tolerate ISO inputs
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { error: 'scheduledDate must be a YYYY-MM-DD string.' };
  }

  // If start/end provided, compute precise instants.
  if (startTime || endTime) {
    if (!startTime || !endTime) {
      return { error: 'Both start time and end time are required when one is provided.' };
    }
    const startsAt = istDateTimeToUtc(dateStr, startTime);
    const endsAt   = istDateTimeToUtc(dateStr, endTime);
    if (!startsAt || !endsAt) return { error: 'Invalid start or end time format (HH:MM).' };
    if (endsAt.getTime() <= startsAt.getTime()) {
      return { error: 'End time must be after start time.' };
    }
    return { startsAt, endsAt, dateStr };
  }

  // Legacy: full IST day window.
  const startsAt = istDateTimeToUtc(dateStr, '00:00');
  const endsAt   = istDateTimeToUtc(dateStr, '23:59');
  return { startsAt, endsAt, dateStr };
}

function validateScenarios(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return 'At least one scenario is required.';
  }
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i] || {};
    if (!s.category || !ALLOWED_CATEGORIES.includes(s.category))
      return `Scenario ${i + 1}: invalid category.`;
    if (!s.scenario || String(s.scenario).trim().length < 10)
      return `Scenario ${i + 1}: scenario text must be at least 10 characters.`;
  }
  return null;
}

const listContests = async (req, res) => {
  try {
    const items = await Contest.find()
      .sort({ scheduledDate: -1, createdAt: -1 })
      .lean();
    // Attach submission counts in a single round-trip.
    const ids = items.map((c) => c._id);
    const counts = await ContestSubmission.aggregate([
      { $match: { contestId: { $in: ids } } },
      {
        $group: {
          _id: '$contestId',
          total: { $sum: 1 },
          submitted: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
          scoreSum:  { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, '$averageScore', 0] } },
        },
      },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c]));
    const out = items.map((c) => {
      const cnt = countMap.get(String(c._id)) || { total: 0, submitted: 0, scoreSum: 0 };
      const avgScore = cnt.submitted > 0
        ? Math.round((cnt.scoreSum / cnt.submitted) * 10) / 10
        : 0;
      return {
        ...c,
        submissionCount: cnt.total,
        submittedCount: cnt.submitted,
        avgScore,
        scenariosCount: (c.scenarios || []).length,
        allowedCount: (c.allowedEmails || []).length,
      };
    });
    return res.json({ contests: out });
  } catch (err) {
    console.error('listContests error:', err);
    return res.status(500).json({ message: 'Failed to load contests.' });
  }
};

const createContest = async (req, res) => {
  try {
    const { title, description, scheduledDate, startTime, endTime, durationMinutes, scenarios } = req.body;
    if (!title || !title.trim())
      return res.status(400).json({ message: 'Title is required.' });

    const window = resolveWindow({ scheduledDate, startTime, endTime });
    if (window.error) return res.status(400).json({ message: window.error });

    const scenarioErr = validateScenarios(scenarios);
    if (scenarioErr) return res.status(400).json({ message: scenarioErr });

    const istMidnight = toIstMidnight(window.dateStr);
    const contest = await Contest.create({
      title: title.trim(),
      description: (description || '').trim(),
      scheduledDate: istMidnight,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      durationMinutes: durationMinutes || 60,
      scenarios,
      allowedEmails: [],
      status: 'draft',
      createdBy: req.user._id,
    });
    return res.status(201).json({ contest });
  } catch (err) {
    console.error('createContest error:', err);
    return res.status(500).json({ message: 'Failed to create contest.' });
  }
};

const updateContest = async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    if (contest.status === 'closed')
      return res.status(409).json({ message: 'Closed contests cannot be edited.' });

    const { title, description, scheduledDate, startTime, endTime, durationMinutes, scenarios } = req.body;
    if (title !== undefined) contest.title = String(title).trim();
    if (description !== undefined) contest.description = String(description).trim();
    if (scheduledDate !== undefined || startTime !== undefined || endTime !== undefined) {
      const window = resolveWindow({
        scheduledDate: scheduledDate ?? (contest.scheduledDate
          ? new Date(contest.scheduledDate).toISOString().slice(0, 10)
          : null),
        startTime,
        endTime,
      });
      if (window.error) return res.status(400).json({ message: window.error });
      contest.scheduledDate = toIstMidnight(window.dateStr);
      contest.startsAt = window.startsAt;
      contest.endsAt = window.endsAt;
    }
    if (durationMinutes !== undefined) contest.durationMinutes = durationMinutes;
    if (scenarios !== undefined) {
      const err = validateScenarios(scenarios);
      if (err) return res.status(400).json({ message: err });

      // Changing the questions after people have started is not an edit, it
      // is a different exam. Anyone who already answered would be scored
      // against a scenario they never saw, and anyone mid-attempt would have
      // the paper swapped underneath them. Allowed only while no one has
      // started; otherwise the admin must close this contest and create a
      // new one.
      const scenariosChanged =
        JSON.stringify((contest.scenarios || []).map((x) => ({ c: x.category, s: x.scenario }))) !==
        JSON.stringify(scenarios.map((x) => ({ c: x.category, s: String(x.scenario).trim() })));

      if (scenariosChanged) {
        const attempts = await ContestSubmission.countDocuments({ contestId: contest._id });
        if (attempts > 0) {
          return res.status(409).json({
            message:
              `Scenarios cannot be changed — ${attempts} participant(s) have already started ` +
              'this contest. Close it and create a new one instead.',
          });
        }
        contest.scenarios = scenarios;
      }
    }
    await contest.save();
    return res.json({ contest });
  } catch (err) {
    console.error('updateContest error:', err);
    return res.status(500).json({ message: 'Failed to update contest.' });
  }
};

const deleteContest = async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    await ContestSubmission.deleteMany({ contestId: contest._id });
    await contest.deleteOne();
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error('deleteContest error:', err);
    return res.status(500).json({ message: 'Failed to delete contest.' });
  }
};

const uploadAllowedEmails = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });

    const { emails, skipped, capped } = parseEmailsFromBuffer(req.file.buffer);

    // Default mode is 'append' — uploading a second file should ADD to the
    // existing allowlist, never silently wipe it. The admin must explicitly
    // opt in to 'replace' (the UI does this with a confirm dialog). If the
    // mode field is missing or unrecognised, we default to the safe behavior
    // so a buggy or older client can't accidentally destroy the allowlist.
    const rawMode = String(req.body.mode || '').toLowerCase();
    const mode = rawMode === 'replace' ? 'replace' : 'append';

    let added = 0;
    if (mode === 'append') {
      const existing = new Set(contest.allowedEmails || []);
      const before = existing.size;
      for (const e of emails) existing.add(e);
      added = existing.size - before;
      contest.allowedEmails = Array.from(existing);
    } else {
      contest.allowedEmails = emails;
      added = emails.length;
    }
    await contest.save();
    return res.json({
      contest,
      mode,
      parsed: emails.length,
      added,                       // how many NEW unique emails landed
      skipped,
      capped,
      total: contest.allowedEmails.length,
    });
  } catch (err) {
    console.error('uploadAllowedEmails error:', err);
    return res.status(500).json({ message: 'Failed to parse the uploaded file.' });
  }
};

const publishContest = async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    if (!contest.allowedEmails || contest.allowedEmails.length === 0)
      return res.status(400).json({ message: 'Upload an allowlist before publishing.' });
    if (!contest.scenarios || contest.scenarios.length === 0)
      return res.status(400).json({ message: 'Add at least one scenario before publishing.' });
    contest.status = 'published';
    await contest.save();
    return res.json({ contest });
  } catch (err) {
    console.error('publishContest error:', err);
    return res.status(500).json({ message: 'Failed to publish contest.' });
  }
};

const closeContest = async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    contest.status = 'closed';
    await contest.save();
    return res.json({ contest });
  } catch (err) {
    console.error('closeContest error:', err);
    return res.status(500).json({ message: 'Failed to close contest.' });
  }
};

const getContestDetail = async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id).lean();
    if (!contest) return res.status(404).json({ message: 'Contest not found.' });
    // A popular contest can have thousands of submissions; the detail page
    // renders a ranked table, so it pages like every other admin list.
    const { items, pagination } = await paginate(ContestSubmission, {
      filter: { contestId: contest._id },
      sort: { averageScore: -1, submittedAt: -1 },
      query: req.query,
      populate: [['userId', 'name email']],
    });
    return res.json({ contest, submissions: items, items, pagination });
  } catch (err) {
    console.error('getContestDetail error:', err);
    return res.status(500).json({ message: 'Failed to load contest.' });
  }
};

module.exports = {
  listContests,
  createContest,
  updateContest,
  deleteContest,
  uploadAllowedEmails,
  publishContest,
  closeContest,
  getContestDetail,
};
