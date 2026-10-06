const PromptEvaluation = require('../models/PromptEvaluation');
const ContestSubmission = require('../models/ContestSubmission');
const User = require('../models/User');
const { istDayKey, istDateTimeToUtc } = require('../utils/dailyChallenge');
const { paginate, withSearch } = require('../utils/pagination');

/**
 * Admin usage reporting.
 *
 * Answers two questions an operator actually asks: how much is each person
 * using this, and what happened on a given day.
 *
 * Everything is bucketed by IST calendar day, matching the rest of the
 * product (streaks, daily challenges, contest windows). Bucketing in UTC
 * would split an Indian evening across two dates and make the calendar
 * disagree with the streak counter.
 *
 * All aggregation happens in MongoDB rather than by pulling documents into
 * Node: a year of activity is a large number of rows, and the API should not
 * grow a memory footprint proportional to how long the product has been live.
 */

const IST_TZ = 'Asia/Kolkata';

/** Start/end UTC instants for an IST day, from a YYYY-MM-DD string. */
function istDayBounds(dateStr) {
  const start = istDateTimeToUtc(dateStr, '00:00');
  if (!start) return null;
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/**
 * GET /api/admin/usage/calendar?month=YYYY-MM
 *
 * One row per IST day in the month: how many prompts were analyzed, how many
 * distinct people were active, and how many contest submissions landed.
 * Drives the calendar heat colouring, so it must stay cheap — it is a grouped
 * count, never a document fetch.
 */
const calendar = async (req, res) => {
  try {
    const month = req.query.month || istDayKey().slice(0, 7);   // YYYY-MM
    const bounds = istDayBounds(`${month}-01`);
    if (!bounds) return res.status(400).json({ message: 'month must be YYYY-MM.' });

    // First instant of the following month, in IST terms.
    const [y, m] = month.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const end = istDateTimeToUtc(nextMonth, '00:00');

    const groupByIstDay = {
      $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: IST_TZ },
    };

    const [prompts, contests] = await Promise.all([
      PromptEvaluation.aggregate([
        { $match: { createdAt: { $gte: bounds.start, $lt: end } } },
        { $group: {
            _id: groupByIstDay,
            prompts: { $sum: 1 },
            users: { $addToSet: '$userId' },
            avgScore: { $avg: '$overallScore' },
            challenges: { $sum: { $cond: ['$isDailyChallenge', 1, 0] } },
        } },
        { $project: {
            _id: 0, date: '$_id', prompts: 1, challenges: 1,
            activeUsers: { $size: '$users' },
            avgScore: { $round: ['$avgScore', 1] },
        } },
      ]),
      ContestSubmission.aggregate([
        { $match: { submittedAt: { $gte: bounds.start, $lt: end } } },
        { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt', timezone: IST_TZ } },
            contestSubmissions: { $sum: 1 },
        } },
        { $project: { _id: 0, date: '$_id', contestSubmissions: 1 } },
      ]),
    ]);

    // Merge the two series into one row per day the UI can render directly.
    const byDate = new Map();
    for (const p of prompts) byDate.set(p.date, { ...p, contestSubmissions: 0 });
    for (const c of contests) {
      const row = byDate.get(c.date) || { date: c.date, prompts: 0, challenges: 0, activeUsers: 0, avgScore: 0 };
      row.contestSubmissions = c.contestSubmissions;
      byDate.set(c.date, row);
    }

    const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    const busiest = days.reduce((max, d) => (d.prompts > (max?.prompts || 0) ? d : max), null);
    // The calendar colours each cell relative to the busiest day IN VIEW, so
    // the scale has to travel with the data rather than being derived on the
    // client from a page of it.
    const peak = days.reduce((max, d) => Math.max(max, d.prompts), 0);

    return res.json({
      month,
      timezone: IST_TZ,
      days,
      totals: {
        prompts: days.reduce((a, d) => a + d.prompts, 0),
        contestSubmissions: days.reduce((a, d) => a + d.contestSubmissions, 0),
        challenges: days.reduce((a, d) => a + (d.challenges || 0), 0),
        activeDays: days.length,
        peak,
        // Distinct people across the month, not the sum of daily actives —
        // summing would count a daily user thirty times.
        busiestDay: busiest ? { date: busiest.date, prompts: busiest.prompts } : null,
      },
    });
  } catch (err) {
    console.error('usage calendar error:', err);
    return res.status(500).json({ message: 'Failed to load the usage calendar.' });
  }
};

/**
 * GET /api/admin/usage/day?date=YYYY-MM-DD
 *
 * Everything that happened on one IST day: a per-user breakdown, and the
 * individual requests in order. This is the view an operator opens when the
 * calendar shows an unusual spike.
 */
const day = async (req, res) => {
  try {
    const date = req.query.date || istDayKey();
    const bounds = istDayBounds(date);
    if (!bounds) return res.status(400).json({ message: 'date must be YYYY-MM-DD.' });

    const window = { $gte: bounds.start, $lt: bounds.end };

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 8));

    const [perUser, contestCount] = await Promise.all([
      // Per-user totals for the day.
      PromptEvaluation.aggregate([
        { $match: { createdAt: window } },
        { $group: {
            _id: '$userId',
            requests: { $sum: 1 },
            avgScore: { $avg: '$overallScore' },
            bestScore: { $max: '$overallScore' },
            challenges: { $sum: { $cond: ['$isDailyChallenge', 1, 0] } },
            categories: { $addToSet: '$category' },
            firstAt: { $min: '$createdAt' },
            lastAt: { $max: '$createdAt' },
        } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        // A deleted user's rows must not vanish from the audit, so the lookup
        // is preserved rather than inner-joined.
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: {
            _id: 0,
            userId: '$_id',
            name: { $ifNull: ['$user.name', 'Deleted user'] },
            email: { $ifNull: ['$user.email', '—'] },
            requests: 1, challenges: 1, categories: 1, firstAt: 1, lastAt: 1,
            avgScore: { $round: ['$avgScore', 1] },
            bestScore: 1,
        } },
        { $sort: { requests: -1, name: 1 } },
      ]),
      ContestSubmission.countDocuments({ submittedAt: window }),
    ]);

    // Paged in memory: the grouping already collapsed the day to one row per
    // active user, which is a small set even on a busy day. Paging inside the
    // pipeline would cost a second aggregation to get the total.
    const totalUsers = perUser.length;
    const pagedUsers = perUser.slice((page - 1) * limit, page * limit);

    return res.json({
      date,
      timezone: IST_TZ,
      summary: {
        totalRequests: perUser.reduce((a, u) => a + u.requests, 0),
        activeUsers: totalUsers,
        dailyChallenges: perUser.reduce((a, u) => a + u.challenges, 0),
        contestSubmissions: contestCount,
        // Busiest person that day, for the summary line.
        topUser: perUser[0] ? { name: perUser[0].name, requests: perUser[0].requests } : null,
      },
      perUser: pagedUsers,
      pagination: {
        page, limit, total: totalUsers,
        totalPages: Math.max(1, Math.ceil(totalUsers / limit)),
        hasNext: page * limit < totalUsers,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    console.error('usage day error:', err);
    return res.status(500).json({ message: 'Failed to load the day.' });
  }
};

/**
 * GET /api/admin/usage/users?from=&to=&page=&limit=&search=
 *
 * Per-user totals over a date range — the "how many requests has each person
 * made" view, paginated like every other admin list.
 */
const byUser = async (req, res) => {
  try {
    const to = req.query.to || istDayKey();
    // Default window is the last 30 IST days inclusive.
    const from = req.query.from
      || istDayKey(new Date(Date.now() - 29 * 86_400_000));

    const start = istDateTimeToUtc(from, '00:00');
    const endBounds = istDayBounds(to);
    if (!start || !endBounds) {
      return res.status(400).json({ message: 'from and to must be YYYY-MM-DD.' });
    }
    const window = { $gte: start, $lt: endBounds.end };

    const rows = await PromptEvaluation.aggregate([
      { $match: { createdAt: window } },
      { $group: {
          _id: '$userId',
          requests: { $sum: 1 },
          avgScore: { $avg: '$overallScore' },
          bestScore: { $max: '$overallScore' },
          challenges: { $sum: { $cond: ['$isDailyChallenge', 1, 0] } },
          lastActive: { $max: '$createdAt' },
          activeDays: { $addToSet: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: IST_TZ },
          } },
      } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: {
          _id: 0,
          userId: '$_id',
          name: { $ifNull: ['$user.name', 'Deleted user'] },
          email: { $ifNull: ['$user.email', '—'] },
          role: { $ifNull: ['$user.role', 'user'] },
          requests: 1, challenges: 1, bestScore: 1, lastActive: 1,
          avgScore: { $round: ['$avgScore', 1] },
          activeDays: { $size: '$activeDays' },
      } },
      { $sort: { requests: -1, name: 1 } },
      { $limit: 500 },
    ]);

    const term = String(req.query.search || '').trim().toLowerCase();
    const filtered = term
      ? rows.filter((r) => r.name.toLowerCase().includes(term) || r.email.toLowerCase().includes(term))
      : rows;

    return res.json({
      from, to, timezone: IST_TZ,
      users: filtered,
      totals: {
        requests: filtered.reduce((a, u) => a + u.requests, 0),
        users: filtered.length,
      },
    });
  } catch (err) {
    console.error('usage byUser error:', err);
    return res.status(500).json({ message: 'Failed to load per-user usage.' });
  }
};

/**
 * GET /api/admin/usage/timeline?date=YYYY-MM-DD&page=&limit=&userId=
 *
 * The individual requests on one IST day, newest first.
 *
 * Separate from /usage/day so paging through the timeline does not re-run the
 * per-user aggregation, and so clicking a user in the breakdown can filter
 * this list without disturbing the rest of the view.
 */
const timeline = async (req, res) => {
  try {
    const date = req.query.date || istDayKey();
    const bounds = istDayBounds(date);
    if (!bounds) return res.status(400).json({ message: 'date must be YYYY-MM-DD.' });

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));

    const filter = { createdAt: { $gte: bounds.start, $lt: bounds.end } };
    if (req.query.userId) filter.userId = req.query.userId;

    const [items, total] = await Promise.all([
      PromptEvaluation.find(filter,
        'userId category scenario userPrompt overallScore rating isDailyChallenge scoredBy createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'name email')
        .lean(),
      PromptEvaluation.countDocuments(filter),
    ]);

    return res.json({
      date,
      timezone: IST_TZ,
      items: items.map((t) => ({
        _id: t._id,
        at: t.createdAt,
        userId: t.userId?._id || null,
        name: t.userId?.name || 'Deleted user',
        email: t.userId?.email || '—',
        category: t.category,
        scenario: t.scenario,
        // Trimmed: the table shows a preview, and a full prompt can be long.
        promptPreview: String(t.userPrompt || '').slice(0, 160),
        score: t.overallScore,
        rating: t.rating,
        isDailyChallenge: t.isDailyChallenge,
        scoredBy: t.scoredBy,
      })),
      pagination: {
        page, limit, total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    console.error('usage timeline error:', err);
    return res.status(500).json({ message: 'Failed to load the timeline.' });
  }
};

module.exports = { calendar, day, byUser, timeline };
