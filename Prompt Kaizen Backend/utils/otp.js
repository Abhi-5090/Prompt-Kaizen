const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES) || 2;
const OTP_MAX_ATTEMPTS = 5;

// Password-reset codes live longer than a login OTP — the user has to leave
// the app, open a mail client and come back — but not so long that a leaked
// mailbox stays exploitable. Shorter than the 30 minutes the old emailed
// link used: a link carried 32 random bytes and could not be guessed, while
// a 6-digit code has a million possibilities, so its window must be small.
const RESET_TTL_MINUTES = Number(process.env.RESET_TTL_MINUTES) || 10;

// Wrong guesses allowed against a single reset code before it is thrown away.
// With this cap, the email rate limit (5 requests per 15 minutes) bounds an
// attacker to 25 guesses per quarter hour against a 1-in-1,000,000 code.
const RESET_OTP_MAX_ATTEMPTS = 5;

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
 * Expiry stamp for a password-reset code.
 *
 * The reset path deliberately reuses generateOtp/hashOtp/verifyOtp above
 * rather than carrying its own crypto. Those already produce a uniformly
 * distributed 6-digit code from crypto.randomInt and store only a bcrypt
 * hash, so a database read yields nothing usable.
 */
function resetExpiry() {
  return new Date(Date.now() + RESET_TTL_MINUTES * 60_000);
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtp,
  otpExpiry,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  resetExpiry,
  RESET_TTL_MINUTES,
  RESET_OTP_MAX_ATTEMPTS,
};
