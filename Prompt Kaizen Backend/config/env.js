/**
 * Boot-time environment validation.
 *
 * The app used to start happily with a missing or placeholder JWT_SECRET and
 * only fail later, per-request, inside jwt.sign() — which surfaced as a 500 on
 * login rather than as a deploy failure. Anything that makes the process
 * unsafe or non-functional must stop the boot instead, loudly, once.
 *
 * Rules are split into two tiers:
 *   - fatal   → refuse to start (secrets, database)
 *   - warning → start, but make the operator aware (email, CORS breadth)
 */

// Placeholder values shipped in .env.example. If one of these reaches a real
// deployment it means someone copied the example and never edited it — that
// must never be allowed to sign production tokens.
const PLACEHOLDER_SECRETS = new Set([
  'replace_this_with_a_strong_random_secret',
  'dev_super_secret_change_me_in_production',
  'changeme',
  'secret',
]);

const MIN_SECRET_LENGTH = 32;

function isProd() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Validates process.env. Returns a frozen, normalized config object.
 * Throws (after printing every problem, not just the first) when fatal.
 */
function loadEnv() {
  const fatal = [];
  const warn = [];

  // --- Database -----------------------------------------------------------
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    fatal.push('MONGO_URI is required (MongoDB connection string).');
  }

  // --- Auth ---------------------------------------------------------------
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    fatal.push('JWT_SECRET is required. Generate one with: openssl rand -base64 48');
  } else if (PLACEHOLDER_SECRETS.has(jwtSecret.toLowerCase().trim())) {
    fatal.push(
      'JWT_SECRET is still the placeholder value from .env.example. ' +
      'Generate a real one with: openssl rand -base64 48'
    );
  } else if (jwtSecret.length < MIN_SECRET_LENGTH) {
    const msg =
      `JWT_SECRET is only ${jwtSecret.length} characters; ` +
      `at least ${MIN_SECRET_LENGTH} is required for a signing key.`;
    // Short secrets are a hard stop in production, a warning locally so the
    // dev loop isn't blocked by a throwaway value.
    if (isProd()) fatal.push(msg);
    else warn.push(`${msg} (allowed outside production)`);
  }

  // --- CORS ---------------------------------------------------------------
  const rawOrigins = process.env.CLIENT_URL || 'http://localhost:5173,http://localhost:5174';
  const allowedOrigins = rawOrigins.split(',').map((s) => s.trim()).filter(Boolean);
  if (allowedOrigins.length === 0) {
    fatal.push('CLIENT_URL must list at least one allowed origin.');
  }
  if (allowedOrigins.includes('*')) {
    fatal.push('CLIENT_URL must not be "*" — credentialed CORS cannot use a wildcard origin.');
  }
  if (isProd()) {
    const localhostOrigins = allowedOrigins.filter((o) => /localhost|127\.0\.0\.1/.test(o));
    if (localhostOrigins.length) {
      warn.push(`CLIENT_URL contains localhost origins in production: ${localhostOrigins.join(', ')}`);
    }
    const insecure = allowedOrigins.filter((o) => o.startsWith('http://'));
    if (insecure.length) {
      warn.push(`CLIENT_URL contains non-HTTPS origins in production: ${insecure.join(', ')}`);
    }
  }

  // --- Email --------------------------------------------------------------
  // Not fatal: the API is usable without email, but registration cannot
  // complete (OTP never arrives), so the operator needs to know at boot
  // rather than discovering it from a user complaint.
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    warn.push(
      'EMAIL_USER / EMAIL_PASSWORD are not set — OTP and password-reset emails ' +
      'cannot be delivered, so new users will not be able to finish signing up.'
    );
  }

  // --- Report -------------------------------------------------------------
  for (const w of warn) console.warn(`[env] WARNING: ${w}`);

  if (fatal.length) {
    console.error('\n[env] Refusing to start — invalid configuration:\n');
    for (const f of fatal) console.error(`  ✗ ${f}`);
    console.error('\nSee .env.example for the full list of expected variables.\n');
    const err = new Error(`Invalid environment configuration (${fatal.length} problem(s)).`);
    err.code = 'ENV_INVALID';
    throw err;
  }

  return Object.freeze({
    isProd: isProd(),
    port: Number(process.env.PORT) || 5000,
    mongoUri,
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    allowedOrigins,
  });
}

module.exports = { loadEnv, PLACEHOLDER_SECRETS, MIN_SECRET_LENGTH };
