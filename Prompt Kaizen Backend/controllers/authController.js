const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  generateOtp, hashOtp, verifyOtp, otpExpiry,
  OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS,
  generateResetToken, hashResetToken, resetExpiry, safeEqualHex, RESET_TTL_MINUTES,
} = require('../utils/otp');
const { sendOtpEmail, sendPasswordResetEmail, getMailHealth, allowConsoleFallback } = require('../utils/mailer');
const { getDictationStatus } = require('../utils/dictation');
const { recordAudit } = require('../utils/audit');
const { asyncHandler, badRequest, unauthorized, forbidden, tooMany } = require('../utils/asyncHandler');

// --- Account lockout --------------------------------------------------------
// Per-IP rate limiting does not stop a distributed attempt against a single
// account, so failures are also counted against the account. The lock is a
// timestamp rather than a flag, so it expires on its own.
const MAX_FAILED_LOGINS = Number(process.env.MAX_FAILED_LOGINS) || 8;
const LOCK_MINUTES = Number(process.env.LOCK_MINUTES) || 15;

const MIN_PASSWORD_LENGTH = 8;

const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, tv: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

const sanitize = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: user.emailVerified,
  dictation: getDictationStatus(user),
  createdAt: user.createdAt,
});

/**
 * Rejects passwords that are trivially guessable. Deliberately simple — a
 * length floor plus a blocklist of the values that actually show up in
 * credential-stuffing lists — rather than composition rules, which push
 * users toward predictable substitutions without adding real entropy.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'iloveyou', 'admin123', 'welcome1', 'letmein1', 'changeme',
  'promptkaizen', 'abc12345', 'passw0rd',
]);

function assertPasswordStrength(password, { email, name } = {}) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
  if (password.length > 200) {
    // bcrypt only considers the first 72 bytes; a very long input is just a
    // way to burn CPU on every login attempt.
    throw badRequest('Password must be at most 200 characters.');
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    throw badRequest('That password is too common. Please choose a less predictable one.');
  }
  const localPart = String(email || '').split('@')[0].toLowerCase();
  if (localPart.length >= 3 && lower.includes(localPart)) {
    throw badRequest('Password must not contain your email address.');
  }
  const firstName = String(name || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
  if (firstName.length >= 3 && lower.includes(firstName)) {
    throw badRequest('Password must not contain your name.');
  }
}

/**
 * Generate a fresh OTP for `user`, persist its hash + expiry, and dispatch the
 * plaintext code by email. Resets the per-OTP attempt counter so a new code
 * starts with a clean slate.
 *
 * The database write is awaited — the hash must be durable before we tell the
 * client to enter a code, or a fast user could submit before the write lands.
 * The *send* is deliberately not awaited: SMTP is a third-party network call,
 * and making signup wait on it meant a slow mail host directly became slow
 * registration (measured at 4s against merely-wrong credentials, and up to the
 * full SMTP timeout against an unreachable one). Delivery failures are logged
 * and the user can fall back to /resend-otp.
 */
/**
 * Describes how (or whether) a one-time code can actually reach the user.
 *
 * Telling someone to "check your email" when the mail transport is known to be
 * down strands them: signup returns 201, no code ever arrives, and login is
 * gated on emailVerified — so they have no way forward and no explanation.
 * This reports global transport state only, never anything account-specific,
 * so it cannot be used to probe whether an address is registered.
 */
function deliveryNotice() {
  if (allowConsoleFallback()) {
    return {
      channel: 'server-log',
      message: 'Email is not configured in this environment — the code has been printed to the server log.',
    };
  }
  const health = getMailHealth();
  if (!health.healthy) {
    return {
      channel: 'unavailable',
      message:
        'Email delivery is currently unavailable, so the code may not arrive. ' +
        'Please contact an administrator if you do not receive it.',
    };
  }
  return { channel: 'email', message: null };
}

async function issueOtpForUser(user) {
  const otp = generateOtp();
  user.otpHash = await hashOtp(otp);
  user.otpExpiresAt = otpExpiry();
  user.otpAttempts = 0;
  await user.save();

  // Fire-and-forget, with the rejection handled so it never becomes an
  // unhandled rejection (which now triggers a process shutdown).
  sendOtpEmail({ to: user.email, name: user.name, otp, ttlMinutes: OTP_TTL_MINUTES })
    .catch((err) => console.error(`[mail] OTP to ${user.email} failed:`, err?.message || err));
}

// --- Register ---------------------------------------------------------------

const register = asyncHandler(async (req, res) => {
  // Shape/type validation already ran in middleware; these are the rules that
  // need database or cross-field context.
  const { name, email, password, confirmPassword } = req.body;

  if (confirmPassword !== undefined && confirmPassword !== password) {
    throw badRequest('Passwords do not match.');
  }
  assertPasswordStrength(password, { email, name });

  const existing = await User.findOne({ email });

  // Account enumeration: this endpoint used to return 409 for a taken address
  // while /resend-otp returned a deliberately generic message. That asymmetry
  // let anyone test whether an address had an account. Both paths now return
  // the same 201 shape. A genuine returning user still gets a usable route
  // forward, because we send them a mail telling them the account exists.
  if (existing) {
    if (!existing.emailVerified) {
      // Unverified signup being retried — reissue the code so they can finish.
      try {
        await issueOtpForUser(existing);
      } catch (mailErr) {
        console.error('register: failed to reissue OTP:', mailErr?.message || mailErr);
      }
    }
    // A verified account gets no mail and no new code; the response is
    // identical either way so the caller learns nothing.
    return res.status(201).json({
      message: 'Account created. Check your email for the verification code.',
      email,
      needsVerification: true,
      otpTtlMinutes: OTP_TTL_MINUTES,
      delivery: deliveryNotice(),
    });
  }

  const user = await User.create({ name, email, password });

  try {
    await issueOtpForUser(user);
  } catch (mailErr) {
    console.error('register: failed to send OTP email:', mailErr?.message || mailErr);
    // Don't fail registration — the account exists and /resend-otp can retry.
  }

  return res.status(201).json({
    message: 'Account created. Check your email for the verification code.',
    email: user.email,
    needsVerification: true,
    otpTtlMinutes: OTP_TTL_MINUTES,
    delivery: deliveryNotice(),
  });
});

// --- OTP verification -------------------------------------------------------

const verifyOtpHandler = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email }).select('+otpHash');
  // Same generic failure whether the account is missing or the code is wrong,
  // so this endpoint can't be used to enumerate addresses either.
  const genericFailure = () => badRequest('That code is invalid or has expired.');

  if (!user) throw genericFailure();

  if (user.emailVerified) {
    // Already verified — issue a token so the client can proceed.
    const token = signToken(user);
    return res.json({ token, user: sanitize(user), alreadyVerified: true });
  }

  if (!user.otpHash || !user.otpExpiresAt) throw genericFailure();

  if (user.otpExpiresAt.getTime() < Date.now()) {
    user.otpHash = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    await user.save();
    throw genericFailure();
  }

  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    user.otpHash = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    await user.save();
    throw genericFailure();
  }

  const ok = await verifyOtp(otp, user.otpHash);
  if (!ok) {
    user.otpAttempts += 1;
    await user.save();
    // Deliberately the same message as every other failure path, including
    // "no such account". Reporting attempts-remaining here told an attacker
    // that the address had a pending registration, which re-opened the
    // enumeration hole that register/ forgot-password close.
    throw genericFailure();
  }

  user.emailVerified = true;
  user.otpHash = null;
  user.otpExpiresAt = null;
  user.otpAttempts = 0;
  await user.save();

  return res.json({ token: signToken(user), user: sanitize(user) });
});

const resendOtpHandler = asyncHandler(async (req, res) => {
  const { email } = req.body;
  // Constant response regardless of outcome.
  const generic = {
    message: 'If an account needs verification, a new code has been sent.',
    otpTtlMinutes: OTP_TTL_MINUTES,
    delivery: deliveryNotice(),
  };

  const user = await User.findOne({ email });
  if (!user || user.emailVerified) return res.json(generic);

  try {
    await issueOtpForUser(user);
  } catch (mailErr) {
    console.error('resendOtp: send failed:', mailErr?.message || mailErr);
  }
  return res.json(generic);
});

// --- Login ------------------------------------------------------------------

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');

  // Uniform message for "no such account" and "wrong password" so neither
  // reveals which one it was.
  const invalid = () => unauthorized('Invalid email or password.');

  if (!user) {
    // Spend comparable time to a real bcrypt comparison so response timing
    // doesn't distinguish a missing account from a wrong password.
    await new Promise((r) => setTimeout(r, 120));
    throw invalid();
  }

  if (user.isLocked()) {
    const mins = Math.max(1, Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000));
    throw tooMany(
      `Too many failed attempts. This account is locked for another ${mins} minute${mins === 1 ? '' : 's'}.`
    );
  }

  const match = await user.matchPassword(password);
  if (!match) {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const update = { failedLoginAttempts: attempts };
    let locked = false;
    if (attempts >= MAX_FAILED_LOGINS) {
      update.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      update.failedLoginAttempts = 0; // start the next window clean
      locked = true;
    }
    await User.updateOne({ _id: user._id }, { $set: update });

    if (locked) {
      await recordAudit(req, {
        action: 'auth.lockout',
        targetType: 'User',
        targetId: user._id,
        targetLabel: user.email,
        metadata: { lockMinutes: LOCK_MINUTES, threshold: MAX_FAILED_LOGINS },
      });
      throw tooMany(
        `Too many failed attempts. This account is locked for ${LOCK_MINUTES} minutes.`
      );
    }
    throw invalid();
  }

  // Block login for users who never finished email verification. Strict
  // equality against false avoids retro-blocking legacy users created before
  // this feature shipped (no field → undefined → treated as verified).
  if (user.emailVerified === false) {
    try {
      await issueOtpForUser(user);
    } catch (mailErr) {
      console.error('login: failed to (re-)issue OTP:', mailErr?.message || mailErr);
    }
    const notice = deliveryNotice();
    throw forbidden('Please verify your email to continue. We just sent you a new code.', {
      details: notice.message ? [notice.message] : undefined,
    });
  }

  // Successful login clears any accumulated failure state.
  if (user.failedLoginAttempts || user.lockUntil) {
    await User.updateOne(
      { _id: user._id },
      { $set: { failedLoginAttempts: 0, lockUntil: null } }
    );
  }

  return res.json({ token: signToken(user), user: sanitize(user) });
});

// --- Password reset ---------------------------------------------------------

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Always the same response — this endpoint must not confirm which
  // addresses have accounts.
  const generic = {
    message: 'If an account exists for that email, a reset link has been sent.',
    ttlMinutes: RESET_TTL_MINUTES,
    delivery: deliveryNotice(),
  };

  const user = await User.findOne({ email });
  if (!user) return res.json(generic);

  const { token, hash } = generateResetToken();
  user.passwordResetTokenHash = hash;
  user.passwordResetExpiresAt = resetExpiry();
  await user.save();

  // Link points at the user-facing SPA. First configured origin is the user
  // app by convention (the admin app is second).
  const base = (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')[0].trim().replace(/\/$/, '');
  const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`;

  // Not awaited, for the same reason as the OTP send: a mail outage must not
  // hold the request open. The response is generic regardless of outcome, so
  // a failure here also cannot become an enumeration oracle.
  sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl, ttlMinutes: RESET_TTL_MINUTES })
    .catch((err) => console.error(`[mail] reset link to ${user.email} failed:`, err?.message || err));

  await recordAudit(req, {
    action: 'auth.password_reset_requested',
    targetType: 'User', targetId: user._id, targetLabel: user.email,
  });

  return res.json(generic);
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, token, password, confirmPassword } = req.body;

  if (confirmPassword !== undefined && confirmPassword !== password) {
    throw badRequest('Passwords do not match.');
  }

  const user = await User.findOne({ email }).select('+passwordResetTokenHash +password');
  const invalidToken = () =>
    badRequest('That reset link is invalid or has expired. Request a new one.');

  if (!user || !user.passwordResetTokenHash || !user.passwordResetExpiresAt) {
    throw invalidToken();
  }
  if (user.passwordResetExpiresAt.getTime() < Date.now()) {
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();
    throw invalidToken();
  }
  if (!safeEqualHex(hashResetToken(token), user.passwordResetTokenHash)) {
    throw invalidToken();
  }

  assertPasswordStrength(password, { email: user.email, name: user.name });

  // Reject reusing the current password — a reset that changes nothing gives
  // a false sense of remediation after a suspected compromise.
  if (await user.matchPassword(password)) {
    throw badRequest('Please choose a password you have not used before.');
  }

  user.password = password;              // pre-save hook hashes + bumps tokenVersion
  user.passwordResetTokenHash = null;    // single use
  user.passwordResetExpiresAt = null;
  user.failedLoginAttempts = 0;          // a successful reset clears the lock
  user.lockUntil = null;
  // Completing an emailed reset proves control of the address.
  user.emailVerified = true;
  await user.save();

  await recordAudit(req, {
    action: 'auth.password_reset_completed',
    targetType: 'User', targetId: user._id, targetLabel: user.email,
  });

  // Every previously-issued token is now invalid (tokenVersion changed), so
  // hand back a fresh one rather than forcing an immediate re-login.
  return res.json({
    message: 'Password updated. All other sessions have been signed out.',
    token: signToken(user),
    user: sanitize(user),
  });
});

const me = asyncHandler(async (req, res) => res.json({ user: sanitize(req.user) }));

module.exports = {
  register,
  login,
  me,
  verifyOtp: verifyOtpHandler,
  resendOtp: resendOtpHandler,
  forgotPassword,
  resetPassword,
  assertPasswordStrength,
  MIN_PASSWORD_LENGTH,
  MAX_FAILED_LOGINS,
  LOCK_MINUTES,
};
