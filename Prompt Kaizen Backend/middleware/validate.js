/**
 * Minimal, dependency-free request validation.
 *
 * Purpose beyond tidiness: every field is coerced to a known primitive type
 * before it reaches Mongoose. Without that, a client can post
 * `{"email": {"$ne": ""}}` and have the object reach `User.findOne()` as a
 * query operator — the classic NoSQL injection. `str()` rejects non-strings
 * outright rather than stringifying them, so `{$ne:...}` fails validation
 * instead of becoming the literal "[object Object]".
 *
 * Usage:
 *   router.post('/login', validate({ body: {
 *     email:    rules.email({ required: true }),
 *     password: rules.str({ required: true, max: 200 }),
 *   }}), login);
 *
 * The validated, coerced values replace req.body / req.query / req.params,
 * so controllers never see the raw input.
 */
const { badRequest } = require('../utils/asyncHandler');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** A string field. Rejects any non-string input (objects, arrays, numbers). */
const str = (opts = {}) => (value, field) => {
  if (value === undefined || value === null || value === '') {
    if (opts.required) throw badRequest(`${field} is required.`);
    return opts.default !== undefined ? opts.default : undefined;
  }
  if (typeof value !== 'string') {
    throw badRequest(`${field} must be a string.`);
  }
  const trimmed = opts.trim === false ? value : value.trim();
  if (opts.required && trimmed.length === 0) {
    throw badRequest(`${field} is required.`);
  }
  if (opts.min !== undefined && trimmed.length < opts.min) {
    throw badRequest(`${field} must be at least ${opts.min} characters.`);
  }
  if (opts.max !== undefined && trimmed.length > opts.max) {
    throw badRequest(`${field} must be at most ${opts.max} characters.`);
  }
  if (opts.oneOf && !opts.oneOf.includes(trimmed)) {
    throw badRequest(`${field} is not a valid value.`);
  }
  if (opts.pattern && !opts.pattern.test(trimmed)) {
    throw badRequest(opts.patternMessage || `${field} has an invalid format.`);
  }
  return opts.lowercase ? trimmed.toLowerCase() : trimmed;
};

const email = (opts = {}) =>
  str({
    ...opts,
    lowercase: true,
    max: opts.max || 254,
    pattern: EMAIL_RE,
    patternMessage: 'Please provide a valid email address.',
  });

/**
 * A sign-in identifier: either a real email address or a short operator
 * username.
 *
 * `User.email` is documented as doubling as the login identifier — real
 * addresses for self-registered users, plain usernames (e.g. "Admin") for
 * accounts created by `seed:admin`. Validating the login route with the strict
 * `email` rule silently locked every operator-seeded account out of the API.
 *
 * Registration deliberately keeps the strict rule: self-service signup must
 * use a deliverable address, both so the OTP arrives and so nobody can squat a
 * username before the seed runs.
 *
 * Still a strict string check, so `{"$ne": ""}` is rejected exactly as before.
 */
const loginIdentifier = (opts = {}) =>
  str({
    ...opts,
    lowercase: true,
    min: 3,
    max: 254,
    pattern: /^[^\s@]+(@[^\s@]+)?$/,
    patternMessage: 'Please provide a valid email address or username.',
  });

const objectId = (opts = {}) =>
  str({
    ...opts,
    pattern: OBJECT_ID_RE,
    patternMessage: 'Not found.',
  });

const isoDate = (opts = {}) =>
  str({ ...opts, pattern: DATE_RE, patternMessage: 'Date must be YYYY-MM-DD.' });

const time = (opts = {}) =>
  str({ ...opts, pattern: TIME_RE, patternMessage: 'Time must be HH:MM (24-hour).' });

const int = (opts = {}) => (value, field) => {
  if (value === undefined || value === null || value === '') {
    if (opts.required) throw badRequest(`${field} is required.`);
    return opts.default;
  }
  // Accept only numbers and numeric strings — not arrays or objects.
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw badRequest(`${field} must be a number.`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest(`${field} must be a number.`);
  const i = Math.trunc(n);
  if (opts.min !== undefined && i < opts.min) {
    throw badRequest(`${field} must be at least ${opts.min}.`);
  }
  if (opts.max !== undefined && i > opts.max) {
    throw badRequest(`${field} must be at most ${opts.max}.`);
  }
  return i;
};

const bool = (opts = {}) => (value, field) => {
  if (value === undefined || value === null || value === '') {
    return opts.default !== undefined ? opts.default : undefined;
  }
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw badRequest(`${field} must be true or false.`);
};

/** An array whose items are each validated by `itemRule`. */
const arrayOf = (itemRule, opts = {}) => (value, field) => {
  if (value === undefined || value === null) {
    if (opts.required) throw badRequest(`${field} is required.`);
    return opts.default;
  }
  if (!Array.isArray(value)) throw badRequest(`${field} must be an array.`);
  if (opts.min !== undefined && value.length < opts.min) {
    throw badRequest(`${field} must contain at least ${opts.min} item(s).`);
  }
  if (opts.max !== undefined && value.length > opts.max) {
    throw badRequest(`${field} must contain at most ${opts.max} item(s).`);
  }
  return value.map((item, i) => itemRule(item, `${field}[${i}]`));
};

/** An object validated against a nested shape. */
const shape = (fields, opts = {}) => (value, field) => {
  if (value === undefined || value === null) {
    if (opts.required) throw badRequest(`${field} is required.`);
    return opts.default;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(`${field} must be an object.`);
  }
  return applyShape(value, fields, field);
};

function applyShape(source, fields, prefix = '') {
  const out = {};
  for (const [key, rule] of Object.entries(fields)) {
    const label = prefix ? `${prefix}.${key}` : key;
    const result = rule(source ? source[key] : undefined, label);
    if (result !== undefined) out[key] = result;
  }
  return out;
}

/**
 * Express middleware factory. `spec` may contain `body`, `query` and `params`.
 * Unlisted keys are dropped — a field the API doesn't declare can never reach
 * a controller or a Mongo query.
 */
function validate(spec = {}) {
  return (req, res, next) => {
    try {
      if (spec.params) {
        // A malformed path parameter means the addressed resource cannot
        // exist, so this is a 404 rather than a 400 — and it matches what the
        // client would have seen for a well-formed id that simply isn't there,
        // which avoids turning the id format into an existence oracle.
        try {
          req.params = applyShape(req.params, spec.params);
        } catch (paramErr) {
          paramErr.status = 404;
          paramErr.message = 'Not found.';
          throw paramErr;
        }
      }
      if (spec.query) {
        const cleaned = applyShape(req.query, spec.query);
        // req.query is a getter-only property on Express 5 / some versions —
        // redefine rather than assign so this works on both.
        Object.defineProperty(req, 'query', {
          value: cleaned, writable: true, configurable: true, enumerable: true,
        });
      }
      if (spec.body) req.body = applyShape(req.body, spec.body);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  validate,
  rules: { str, email, loginIdentifier, objectId, isoDate, time, int, bool, arrayOf, shape },
  EMAIL_RE,
  OBJECT_ID_RE,
};
