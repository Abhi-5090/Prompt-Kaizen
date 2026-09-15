const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES) || 2;
const OTP_MAX_ATTEMPTS = 5;

// Password-reset links live longer than a login OTP — the user has to leave
// the app, open a mail client and come back — but not so long that a leaked
// mailbox stays exploitable.
const RESET_TTL_MINUTES = Number(process.env.RESET_TTL_MINUTES) || 30;

/**
 * Generate a uniformly-distributed 6-digit OTP as a string. Uses crypto
 * (not Math.random) so OTPs aren't predictable.
 */
function generateOtp() {
  // crypto.randomInt is exclusive of the upper bound. 100000–999999 inclusive.
  return String(crypto.randomInt(100_000, 1_000_000));
}

async function hashOtp(otp) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(String(otp), salt);
}

async function verifyOtp(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(String(plain), hash);
}

function otpExpiry() {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
}

/**
 * Password-reset token: 32 random bytes, URL-safe. Unlike the 6-digit OTP
 * this has enough entropy that it needs no attempt counter — but it is only
 * ever stored as a SHA-256 digest, so a database read does not yield a
 * usable link. SHA-256 rather than bcrypt is correct here: the token is
 * already high-entropy, so there is nothing to brute-force, and the digest
 * must be deterministic to be looked up.
 */
function generateResetToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashResetToken(token) };
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function resetExpiry() {
  return new Date(Date.now() + RESET_TTL_MINUTES * 60_000);
}

/** Constant-time comparison for two hex digests of equal length. */
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtp,
  otpExpiry,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  generateResetToken,
  hashResetToken,
  resetExpiry,
  safeEqualHex,
  RESET_TTL_MINUTES,
};
