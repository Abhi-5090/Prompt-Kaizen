/**
 * Mail-path resilience.
 *
 * Email is a third-party network dependency on the critical signup path, and
 * its failures are asynchronous. These assertions cover the three properties
 * that keep a mail outage from becoming an invisible, unrecoverable one:
 *   1. a slow or broken SMTP host never delays an HTTP response
 *   2. the outage is observable (boot log, /api/ready, admin endpoint)
 *   3. users stranded by it can be recovered without touching the database
 *
 * Requires the server booted WITHOUT EMAIL_USER/EMAIL_PASSWORD and with
 * NODE_ENV=development, which is the local-dev configuration.
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
// Endpoints and database under test. Both are overridable so CI can point the
// suite at the same database the server was started against — hardcoding them
// let the two drift apart, and the failure mode was silent: the API returned
// 201 while the test read an empty collection from a different database.
const API = process.env.TEST_API_URL || 'http://127.0.0.1:5099/api';
const URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27055/pk_phase1_test';
let pass = 0, fail = 0;
const ok  = (n, e='') => { console.log(`  PASS  ${n}${e ? ' — ' + e : ''}`); pass++; };
const bad = (n, e='') => { console.log(`  FAIL  ${n}${e ? ' — ' + e : ''}`); fail++; };
const check = (n, exp, got, b) => exp === got ? ok(n, `${got}`) : bad(n, `expected ${exp} got ${got} ${JSON.stringify(b||'').slice(0,160)}`);

async function req(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { 'Content-Type':'application/json', ...(opts.headers||{}) } });
  let body = null; try { body = await res.json(); } catch {}
  return { status: res.status, body };
}

(async () => {
  await mongoose.connect(URI);
  await require('./_sameDatabase')(API, mongoose);
  const U = mongoose.connection.collection('users');
  await U.deleteMany({});
  const bcryptSeed = require('bcryptjs');
  await U.insertOne({ name:'Mail Admin', email:'mailadmin@example.com',
    password: await bcryptSeed.hash('MailAdminPass!9', 10), role:'admin',
    emailVerified:true, tokenVersion:0, createdAt:new Date(), updatedAt:new Date() });

  console.log('=== Mail never blocks the request path ===');
  // Registration is closed, so the account is created the way an operator
  // does it. Granting access must not wait on SMTP either.
  const adminToken = (await req('/auth/login', { method:'POST', body: JSON.stringify({
    email: 'mailadmin@example.com', password: 'MailAdminPass!9' }) })).body.token;
  const AH = { Authorization: `Bearer ${adminToken}` };

  let t0 = Date.now();
  let r = await req('/admin/users', { method:'POST', headers: AH, body: JSON.stringify({
    name:'Mail Test', email:'mailtest@example.com' }) });
  const grantMs = Date.now() - t0;
  check('granting access succeeds', 201, r.status, r.body);
  grantMs < 1000
    ? ok('granting access did not wait on SMTP', `${grantMs}ms`)
    : bad('granting access blocked on mail', `${grantMs}ms — should be well under 1s`);
  const mailTestPassword = r.body.initialPassword;

  t0 = Date.now();
  r = await req('/auth/forgot-password', { method:'POST', body: JSON.stringify({ email:'mailtest@example.com' }) });
  const forgotMs = Date.now() - t0;
  check('forgot-password succeeds', 200, r.status);
  forgotMs < 1000
    ? ok('forgot-password did not wait on SMTP', `${forgotMs}ms`)
    : bad('forgot-password blocked on mail', `${forgotMs}ms`);

  console.log('=== The outage is reported, not hidden ===');
  // forgot-password is now the user-facing path that sends mail, so it is the
  // one that must declare how (or whether) the message can be delivered.
  r = await req('/auth/forgot-password', { method:'POST', body: JSON.stringify({
    email:'mailtest@example.com' }) });
  r.body?.delivery?.channel
    ? ok('forgot-password declares the delivery channel', r.body.delivery.channel)
    : bad('no delivery notice in forgot-password response', JSON.stringify(r.body));

  r = await req('/ready');
  ['degraded','not_ready'].includes(r.body?.status)
    ? ok('/api/ready reports degraded when mail is down', r.body.status)
    : bad('/api/ready hides the mail outage', JSON.stringify(r.body));
  r.body?.mail?.impact
    ? ok('readiness states the user-facing impact')
    : bad('readiness gives no impact statement');

  console.log('=== A one-time code is never logged in production ===');
  // allowConsoleFallback() must be false whenever NODE_ENV is production,
  // regardless of mail configuration.
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  delete require.cache[require.resolve('../utils/mailer')];
  const prodMailer = require('../utils/mailer');
  prodMailer.allowConsoleFallback() === false
    ? ok('console fallback disabled under NODE_ENV=production')
    : bad('PRODUCTION WOULD PRINT LIVE OTPs TO THE LOG');
  process.env.NODE_ENV = saved;

  console.log('=== Stranded users are recoverable by an admin ===');
  // The admin was seeded during setup; reuse that session.
  const H = AH;

  // Force the stranded state: registered, never verified.
  await U.updateOne({ email:'mailtest@example.com' }, { $set: { emailVerified: false } });
  r = await req('/auth/login', { method:'POST', body: JSON.stringify({
    email:'mailtest@example.com', password: mailTestPassword }) });
  check('unverified user is blocked from logging in', 403, r.status, r.body);

  const target = await U.findOne({ email:'mailtest@example.com' });
  r = await req(`/admin/users/${target._id}/verify-email`, { method:'POST', headers: H });
  check('admin can verify the account', 200, r.status, r.body);

  r = await req('/auth/login', { method:'POST', body: JSON.stringify({
    email:'mailtest@example.com', password: mailTestPassword }) });
  check('recovered user can now log in', 200, r.status, r.body);

  const audit = await mongoose.connection.collection('auditlogs')
    .findOne({ action:'user.email_verified_by_admin', targetLabel:'mailtest@example.com' });
  audit ? ok('manual verification is audited', `actor=${audit.actorEmail}`) : bad('not audited');

  r = await req(`/admin/users/${target._id}/verify-email`, { method:'POST', headers: H });
  r.body?.alreadyVerified === true ? ok('repeat verification is idempotent') : bad('not idempotent');

  console.log('=== Mail endpoints are admin-only ===');
  const userLogin = await req('/auth/login', { method:'POST', body: JSON.stringify({
    email:'mailtest@example.com', password: mailTestPassword }) });
  const UH = { Authorization: `Bearer ${userLogin.body.token}` };
  r = await req('/admin/mail-status', { headers: UH });
  check('non-admin blocked from mail-status', 403, r.status);
  r = await req(`/admin/users/${target._id}/verify-email`, { method:'POST', headers: UH });
  check('non-admin blocked from verify-email', 403, r.status);

  r = await req('/admin/mail-status', { headers: H });
  check('admin can read mail-status', 200, r.status);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.connection.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE ERROR', e); process.exit(2); });
