const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const EMAIL_USER = process.env.EMAIL_USER;
// App passwords are usually copied with spaces (Google shows them as
// "xxxx xxxx xxxx xxxx"). Gmail accepts either form; we strip whitespace so
// the user can paste verbatim.
const EMAIL_PASSWORD = String(process.env.EMAIL_PASSWORD || '').replace(/\s+/g, '');
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Prompt Kaizen';

let transporter = null;

/**
 * Mail health, tracked so a delivery outage is observable instead of silent.
 *
 * Email sends are fire-and-forget (they must not block HTTP responses), which
 * means a broken SMTP config produces a perfectly successful-looking signup
 * whose verification code never arrives — and because login is gated on
 * `emailVerified`, that user is permanently locked out with nothing in the
 * response to indicate why. This state is surfaced by /api/ready and the
 * admin mail-status endpoint so the failure is caught by monitoring rather
 * than by user complaints.
 */
const mailHealth = {
  configured: Boolean(EMAIL_USER && EMAIL_PASSWORD),
  verified: null,          // null = not checked yet, true/false = verify() result
  lastError: null,
  lastErrorAt: null,
  lastSuccessAt: null,
  consecutiveFailures: 0,
  sent: 0,
  failed: 0,
};

function getMailHealth() {
  return {
    ...mailHealth,
    // `healthy` is what monitoring should alert on: configured, not currently
    // failing repeatedly, and not known-broken at startup.
    healthy:
      mailHealth.configured &&
      mailHealth.verified !== false &&
      mailHealth.consecutiveFailures < 3,
  };
}

function noteMailSuccess() {
  mailHealth.sent += 1;
  mailHealth.consecutiveFailures = 0;
  mailHealth.lastSuccessAt = new Date().toISOString();
}

function noteMailFailure(err) {
  mailHealth.failed += 1;
  mailHealth.consecutiveFailures += 1;
  mailHealth.lastError = String(err?.message || err).slice(0, 300);
  mailHealth.lastErrorAt = new Date().toISOString();
}

/**
 * Verifies the SMTP connection at boot. Non-fatal — the API is useful without
 * mail — but it turns "nobody can sign up and we don't know why" into a line
 * in the startup log.
 */
async function verifyMailConnection() {
  if (!mailHealth.configured) {
    console.warn(
      '[mailer] EMAIL_USER / EMAIL_PASSWORD are not set. Verification codes and ' +
      'password-reset links cannot be delivered, so NO NEW USER CAN COMPLETE SIGNUP.'
    );
    if (allowConsoleFallback()) {
      console.warn(
        '[mailer] Non-production environment: one-time codes will be printed to ' +
        'this console instead, so the signup flow remains testable.'
      );
    }
    mailHealth.verified = false;
    return false;
  }
  const t = getTransporter();
  if (!t) { mailHealth.verified = false; return false; }
  try {
    await t.verify();
    mailHealth.verified = true;
    console.log(`[mailer] SMTP connection verified as ${EMAIL_USER}.`);
    return true;
  } catch (err) {
    mailHealth.verified = false;
    mailHealth.lastError = String(err?.message || err).slice(0, 300);
    mailHealth.lastErrorAt = new Date().toISOString();
    console.error(
      '[mailer] SMTP verification FAILED — new users will not receive their ' +
      `verification codes and will be unable to sign in. Reason: ${mailHealth.lastError}`
    );
    return false;
  }
}

/**
 * Whether it is acceptable to print a one-time code to the server log.
 *
 * Only outside production, and only when no mail transport is configured.
 * Printing a live OTP in production would put account-takeover material into
 * the log stream, so this is gated on NODE_ENV and cannot be switched on by
 * an env var alone.
 */
function allowConsoleFallback() {
  return process.env.NODE_ENV !== 'production' && !mailHealth.configured;
}

/**
 * Lazy singleton transporter — Gmail SMTP over port 465 (TLS).
 * If `EMAIL_USER` / `EMAIL_PASSWORD` are missing in env, returns null and
 * callers should treat the email as undeliverable (and log it).
 */
function getTransporter() {
  if (transporter) return transporter;
  if (!EMAIL_USER || !EMAIL_PASSWORD) {
    console.warn('[mailer] EMAIL_USER or EMAIL_PASSWORD is not set — emails will not be sent.');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: EMAIL_USER, pass: EMAIL_PASSWORD },

    // Without explicit timeouts nodemailer inherits the OS TCP timeout, which
    // is on the order of 75 seconds. An SMTP host that is slow, unreachable,
    // or silently dropping packets would then hold the Express request open
    // for that entire time — registration measured at 4s against merely
    // *wrong* credentials, and a network partition would pin every request
    // that sends mail until the connection pool was exhausted. These caps
    // turn a mail outage into a fast, logged failure instead of an outage of
    // the whole API.
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 10_000,
    greetingTimeout:   Number(process.env.SMTP_GREETING_TIMEOUT_MS)   || 10_000,
    socketTimeout:     Number(process.env.SMTP_SOCKET_TIMEOUT_MS)     || 15_000,

    // Reuse one connection for bursts (a contest invite run) instead of
    // paying a TLS handshake per message.
    pool: true,
    maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS) || 3,
    maxMessages: 50,
  });
  return transporter;
}

/**
 * Brand logo, shipped as a pre-rendered 144x144 PNG at assets/logo.png
 * (2x density for a 36x36 CSS render). Attached by CID because Gmail and
 * most webmail strip inline <svg> from email HTML and refuse data: URIs in
 * <img src>.
 *
 * This used to be rasterized at runtime with sharp. sharp is a heavy native
 * dependency that pulled in four high-severity libvips CVEs and slowed cold
 * starts, all to redraw the same static 72px icon on every boot — so the
 * PNG is generated once and committed. Regenerate it only if the logo in
 * the frontend <Logo> component changes.
 *
 * Read lazily and memoized. A missing or unreadable file must not break
 * account signup, so failure degrades to an email with no logo.
 */
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');
let logoPngBuffer;

function getLogoPngBuffer() {
  if (logoPngBuffer === undefined) {
    try {
      logoPngBuffer = fs.readFileSync(LOGO_PATH);
    } catch (err) {
      console.warn(`[mailer] logo not found at ${LOGO_PATH} — sending without it.`);
      logoPngBuffer = null;
    }
  }
  return logoPngBuffer;
}

/**
 * Shared chrome for every transactional email, so the OTP and password-reset
 * messages cannot drift apart visually.
 */
function renderShell({ eyebrow, bodyHtml }) {
  const year = new Date().getFullYear();
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;padding:32px 16px;color:#212529;">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e5e5e5;overflow:hidden;">
        <div style="padding:24px 28px;border-bottom:1px solid #f5f5f5;">
          <img src="cid:pk-logo" alt="" width="36" height="36"
               style="width:36px;height:36px;border-radius:10px;display:inline-block;vertical-align:middle;margin-right:12px;" />
          <span style="display:inline-block;vertical-align:middle;">
            <span style="font-weight:700;color:#F15D23;font-size:15px;">Prompt Kaizen</span><br/>
            <span style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#212529;font-weight:600;">${eyebrow}</span>
          </span>
        </div>
        <div style="padding:28px;">${bodyHtml}</div>
        <div style="padding:16px 28px;border-top:1px solid #f5f5f5;font-size:11px;color:#6c757d;line-height:1.6;">
          <div style="color:#495057;font-weight:600;">Prompt Kaizen &middot; Compatibility Analyzer</div>
          <div style="margin-top:2px;">
            &copy; ${year} <span style="color:#F15D23;font-weight:600;">Torii Minds LLP</span>. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Escapes text interpolated into email HTML. A display name is user-supplied
 * and must not be able to inject markup into a message we send on their behalf.
 */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Upper bound on any single send, enforced here rather than trusting the
 * transport's own timeouts to fire. Belt and braces: the SMTP options above
 * cover connect/greeting/socket stalls, this covers anything else that could
 * leave the promise pending.
 */
const SEND_TIMEOUT_MS = Number(process.env.SMTP_SEND_TIMEOUT_MS) || 20_000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Builds the sendMail payload, attaching the logo only when available. */
function buildMessage({ to, subject, text, html }) {
  const logo = getLogoPngBuffer();
  return {
    from: `"${EMAIL_FROM_NAME}" <${EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
    ...(logo
      ? {
          attachments: [{
            filename: 'prompt-kaizen-logo.png',
            content: logo,
            cid: 'pk-logo',
            contentDisposition: 'inline',
          }],
        }
      : {}),
  };
}

/**
 * Send the 6-digit OTP to a user's inbox. Returns a Promise that resolves
 * with the Nodemailer info on success or rejects with the SMTP error.
 *
 * The email contains both an HTML body (for graphical clients) and a plain
 * text fallback. The OTP is shown as the headline number, with a short
 * expiry hint and a do-not-share notice. The brand logo is attached as a
 * CID image (`cid:pk-logo`) instead of inline SVG so Gmail renders it.
 */
async function sendOtpEmail({ to, name, otp, ttlMinutes }) {
  const t = getTransporter();
  if (!t) {
    // Development convenience: with no SMTP configured, print the code so the
    // signup flow can be exercised end-to-end locally. Never in production —
    // see allowConsoleFallback().
    if (allowConsoleFallback()) {
      console.log(
        `\n[mailer:dev] ── verification code for ${to}: ${otp} ` +
        `(expires in ${Number(ttlMinutes) || 2} min) ──\n`
      );
      return { devFallback: true };
    }
    const err = new Error('Email service is not configured.');
    noteMailFailure(err);
    throw err;
  }

  const safeName = esc((name || '').trim() || 'there');
  const safeTtl = Number(ttlMinutes) || 2;
  const year = new Date().getFullYear();

  const text =
    `Hi ${(name || '').trim() || 'there'},\n\n` +
    `Your Prompt Kaizen verification code is: ${otp}\n\n` +
    `This code expires in ${safeTtl} minutes. ` +
    `If you didn't request this, you can safely ignore this email.\n\n` +
    `Never share this code with anyone — Prompt Kaizen will never ask you for it.\n\n` +
    `— Prompt Kaizen\n\n` +
    `© ${year} Torii Minds LLP. All rights reserved.`;

  const html = renderShell({
    eyebrow: 'Verify your email',
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:15px;">Hi ${safeName},</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:#495057;">
        Use the code below to finish creating your Prompt Kaizen account.
      </p>
      <div style="background:#fff7f3;border:1px dashed #F15D23;border-radius:14px;padding:18px;text-align:center;margin:18px 0;">
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#212529;font-weight:600;margin-bottom:6px;">Your code</div>
        <div style="font-size:34px;letter-spacing:8px;font-weight:800;color:#F15D23;font-family:'Menlo','Monaco',monospace;">${esc(otp)}</div>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#495057;">
        This code expires in <strong>${safeTtl} minutes</strong>.
      </p>
      <p style="margin:0;font-size:12px;color:#6c757d;">
        Didn't request this? You can ignore this email. Never share this code with anyone — Prompt Kaizen will never ask you for it.
      </p>`,
  });

  return withTimeout(
    t.sendMail(buildMessage({ to, subject: `Your Prompt Kaizen verification code: ${otp}`, text, html })),
    SEND_TIMEOUT_MS,
    'OTP email send'
  ).then((info) => { noteMailSuccess(); return info; },
         (err) => { noteMailFailure(err); throw err; });
}

/**
 * Password-reset link. The URL points at the user-facing SPA, which reads the
 * token from the query string and posts it to /api/auth/reset-password.
 *
 * The token appears only in this email — the server stores just its SHA-256
 * digest — so this message is the single copy of a working link.
 */
async function sendPasswordResetEmail({ to, name, resetUrl, ttlMinutes }) {
  const t = getTransporter();
  if (!t) {
    if (allowConsoleFallback()) {
      console.log(`\n[mailer:dev] ── password reset link for ${to}:\n${resetUrl}\n──\n`);
      return { devFallback: true };
    }
    const err = new Error('Email service is not configured.');
    noteMailFailure(err);
    throw err;
  }

  const safeName = esc((name || '').trim() || 'there');
  const safeTtl = Number(ttlMinutes) || 30;
  const year = new Date().getFullYear();

  const text =
    `Hi ${(name || '').trim() || 'there'},\n\n` +
    `Someone requested a password reset for your Prompt Kaizen account.\n\n` +
    `Reset your password: ${resetUrl}\n\n` +
    `This link expires in ${safeTtl} minutes and can only be used once.\n\n` +
    `If you didn't request this, ignore this email — your password will not change.\n\n` +
    `— Prompt Kaizen\n\n` +
    `© ${year} Torii Minds LLP. All rights reserved.`;

  const html = renderShell({
    eyebrow: 'Reset your password',
    bodyHtml: `
      <p style="margin:0 0 12px;font-size:15px;">Hi ${safeName},</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:#495057;">
        Someone requested a password reset for your Prompt Kaizen account.
        Click the button below to choose a new one.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${esc(resetUrl)}"
           style="display:inline-block;background:#F15D23;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 28px;border-radius:12px;">
          Reset my password
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#495057;">
        This link expires in <strong>${safeTtl} minutes</strong> and can only be used once.
      </p>
      <p style="margin:0 0 14px;font-size:12px;color:#6c757d;">
        If the button doesn't work, paste this into your browser:<br/>
        <span style="word-break:break-all;color:#495057;">${esc(resetUrl)}</span>
      </p>
      <p style="margin:0;font-size:12px;color:#6c757d;">
        Didn't request this? Ignore this email — your password will not change.
      </p>`,
  });

  return withTimeout(
    t.sendMail(buildMessage({ to, subject: 'Reset your Prompt Kaizen password', text, html })),
    SEND_TIMEOUT_MS,
    'Password reset email send'
  ).then((info) => { noteMailSuccess(); return info; },
         (err) => { noteMailFailure(err); throw err; });
}

module.exports = {
  getTransporter,
  sendOtpEmail,
  sendPasswordResetEmail,
  verifyMailConnection,
  getMailHealth,
  allowConsoleFallback,
};
