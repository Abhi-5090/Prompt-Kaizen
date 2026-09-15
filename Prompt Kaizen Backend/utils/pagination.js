/**
 * Shared list pagination.
 *
 * The admin lists previously ran `find().limit(1000)` and returned everything
 * to the browser, which then filtered in JavaScript. Two consequences: past
 * 1000 records the UI silently showed a truncated set with no indication, and
 * "search" only ever searched that truncated window — so a user who signed up
 * 1001 accounts ago was simply unfindable. Response size also grew without
 * bound until the cap.
 *
 * Offset paging (rather than cursors) is the right fit here: these are
 * admin-facing tables with page numbers and jump-to-page, the collections are
 * moderate, and a stable total count is part of the UI.
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Reads `page` and `limit` from a validated query object.
 * Returns `{ page, limit, skip }`, all clamped to sane bounds.
 */
function getPageParams(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const requested = Number(query.limit) || DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_LIMIT, requested));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Runs a count and a page of results against the same filter, concurrently,
 * and returns both plus the navigation metadata the UI needs.
 *
 * @param {import('mongoose').Model} Model
 * @param {object} opts
 * @param {object} opts.filter   Mongo filter.
 * @param {object} opts.sort     Sort spec.
 * @param {object} opts.query    The request query (for page/limit).
 * @param {string} [opts.select] Projection.
 * @param {Array}  [opts.populate] Populate specs, applied in order.
 */
async function paginate(Model, { filter = {}, sort = { createdAt: -1 }, query = {}, select, populate = [] }) {
  const { page, limit, skip } = getPageParams(query);

  let q = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (select) q = q.select(select);
  for (const p of populate) q = q.populate(...(Array.isArray(p) ? p : [p]));

  const [items, total] = await Promise.all([
    q.lean(),
    Model.countDocuments(filter),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Builds a case-insensitive OR-match across several fields.
 *
 * The search term is escaped before it reaches the regex engine. Without that,
 * an admin typing `(` produces an invalid-regex 500, and a crafted pattern such
 * as `(a+)+$` is a ReDoS against the database.
 */
function searchFilter(term, fields) {
  const trimmed = String(term || '').trim();
  if (!trimmed) return null;
  // Cap the length so an enormous pattern can't be used to burn CPU.
  const safe = trimmed.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(safe, 'i');
  return { $or: fields.map((f) => ({ [f]: re })) };
}

/** Merges a search filter into a base filter, skipping empty searches. */
function withSearch(base, term, fields) {
  const search = searchFilter(term, fields);
  if (!search) return base;
  const keys = Object.keys(base || {});
  return keys.length ? { $and: [base, search] } : search;
}

module.exports = {
  paginate,
  getPageParams,
  searchFilter,
  withSearch,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
