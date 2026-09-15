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
const API = 'http://127.0.0.1:5099/api';
const URI = 'mongodb://127.0.0.1:27055/pk_phase1_test';
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
  const U = mongoose.connection.collection('users');
  await U.deleteMany({ email: { $in: ['mailtest@example.com', 'mailadmin@example.com'] } });

  console.log('=== Mail never blocks the request path ===');
  let t0 = Date.now();
  let r = await req('/auth/register', { method:'POST', body: JSON.stringify({
    name:'Mail Test', email:'mailtest@example.com', password:'Str0ngPassw0rd!' }) });
  const registerMs = Date.now() - t0;
  check('register succeeds', 201, r.status, r.body);
  registerMs < 1000
    ? ok('register did not wait on SMTP', `${registerMs}ms`)
    : bad('register blocked on mail', `${registerMs}ms — should be well under 1s`);

  t0 = Date.now();
  r = await req('/auth/forgot-password', { method:'POST', body: JSON.stringify({ email:'mailtest@example.com' }) });
  const forgotMs = Date.now() - t0;
  check('forgot-password succeeds', 200, r.status);
  forgotMs < 1000
    ? ok('forgot-password did not wait on SMTP', `${forgotMs}ms`)
    : bad('forgot-password blocked on mail', `${forgotMs}ms`);

  console.log('=== The outage is reported, not hidden ===');
  r = await req('/auth/register', { method:'POST', body: JSON.stringify({
    name:'Mail Test 2', email:'mailtest2@example.com', password:'Str0ngPassw0rd!' }) });
  r.body?.delivery?.channel
    ? ok('register response declares the delivery channel', r.body.delivery.channel)
    : bad('no delivery notice in register response', JSON.stringify(r.body));

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
  await U.insertOne({ name:'Mail Admin', email:'mailadmin@example.com',
    password: await bcrypt.hash('Str0ngPassw0rd!', 10), role:'admin',
    emailVerified:true, tokenVersion:0, createdAt:new Date(), updatedAt:new Date() });
  const adminLogin = await req('/auth/login', { method:'POST', body: JSON.stringify({
    email:'mailadmin@example.com', password:'Str0ngPassw0rd!' }) });
  const H = { Authorization: `Bearer ${adminLogin.body.token}` };

  // Force the stranded state: registered, never verified.
  await U.updateOne({ email:'mailtest@example.com' }, { $set: { emailVerified: false } });
  r = await req('/auth/login', { method:'POST', body: JSON.stringify({
    email:'mailtest@example.com', password:'Str0ngPassw0rd!' }) });
  check('unverified user is blocked from logging in', 403, r.status);

  const target = await U.findOne({ email:'mailtest@example.com' });
  r = await req(`/admin/users/${target._id}/verify-email`, { method:'POST', headers: H });
  check('admin can verify the account', 200, r.status, r.body);

  r = await req('/auth/login', { method:'POST', body: JSON.stringify({
    email:'mailtest@example.com', password:'Str0ngPassw0rd!' }) });
  check('recovered user can now log in', 200, r.status);

  const audit = await mongoose.connection.collection('auditlogs')
    .findOne({ action:'user.email_verified_by_admin', targetLabel:'mailtest@example.com' });
  audit ? ok('manual verification is audited', `actor=${audit.actorEmail}`) : bad('not audited');

  r = await req(`/admin/users/${target._id}/verify-email`, { method:'POST', headers: H });
  r.body?.alreadyVerified === true ? ok('repeat verification is idempotent') : bad('not idempotent');

  console.log('=== Mail endpoints are admin-only ===');
  const userLogin = await req('/auth/login', { method:'POST', body: JSON.stringify({
    email:'mailtest@example.com', password:'Str0ngPassw0rd!' }) });
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
