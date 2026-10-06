const mongoose = require('mongoose');
// Endpoints and database under test. Both are overridable so CI can point the
// suite at the same database the server was started against — hardcoding them
// let the two drift apart, and the failure mode was silent: the API returned
// 201 while the test read an empty collection from a different database.
const API = process.env.TEST_API_URL || 'http://127.0.0.1:5099/api';
const URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27055/pk_phase1_test';
let pass = 0, fail = 0;

const ok  = (n, extra='') => { console.log(`  PASS  ${n}${extra ? ' — ' + extra : ''}`); pass++; };
const bad = (n, extra='') => { console.log(`  FAIL  ${n}${extra ? ' — ' + extra : ''}`); fail++; };
const check = (n, exp, got, body) => (exp === got ? ok(n, `${got}`) : bad(n, `expected ${exp} got ${got} ${JSON.stringify(body||'').slice(0,160)}`));

/**
 * Strips fields that are expected to differ between two otherwise-identical
 * responses. `requestId` is random per request and carries no information
 * about whether an account exists, so comparing it would fail an enumeration
 * check that is actually passing.
 */
function comparable(body) {
  if (!body || typeof body !== 'object') return body;
  const { requestId, ...rest } = body;
  return rest;
}

async function req(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}

(async () => {
  await mongoose.connect(URI);
  await require('./_sameDatabase')(API, mongoose);
  const Users = mongoose.connection.collection('users');
  const Audit = mongoose.connection.collection('auditlogs');
  await Users.deleteMany({});
  await Audit.deleteMany({});

  // Self-registration is closed, so accounts come from an administrator.
  // Seed one directly, then use the API the way an operator would.
  const bcrypt = require('bcryptjs');
  await Users.insertOne({
    name: 'Suite Admin', email: 'suiteadmin@example.com',
    password: await bcrypt.hash('SuiteAdminPass!9', 10),
    role: 'admin', emailVerified: true, tokenVersion: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });
  const adminToken = (await req('/auth/login', { method: 'POST', body: JSON.stringify({
    email: 'suiteadmin@example.com', password: 'SuiteAdminPass!9' }) })).body.token;
  const AH = { Authorization: `Bearer ${adminToken}` };

  /** Grants access the way the admin console does, returning credentials. */
  async function grant(name, email, role) {
    const g = await req('/admin/users', { method: 'POST', headers: AH,
      body: JSON.stringify({ name, email, ...(role ? { role } : {}) }) });
    if (g.status !== 201) throw new Error(`grant failed for ${email}: ${g.status} ${JSON.stringify(g.body)}`);
    return { email, password: g.body.initialPassword };
  }

  console.log('=== NoSQL injection ===');
  let r = await req('/auth/login', { method:'POST', body: JSON.stringify({ email:{$ne:''}, password:{$ne:''} }) });
  check('login with $ne operator rejected', 400, r.status, r.body);
  r = await req('/auth/login', { method:'POST', body: JSON.stringify({ email:['a@b.co'], password:'x' }) });
  check('login with array email rejected', 400, r.status);

  console.log('=== Self-registration is closed ===');
  r = await req('/auth/register', { method:'POST', body: JSON.stringify({
    name:'Outsider', email:'outsider@example.com', password:'Quokka7!Harbour', confirmPassword:'Quokka7!Harbour' }) });
  check('register refused', 403, r.status, r.body);
  (await Users.findOne({ email:'outsider@example.com' })) === null
    ? ok('no account was created by the attempt')
    : bad('an account was created despite registration being closed');
  r = await req('/auth/login', { method:'POST', body: JSON.stringify({
    email:'outsider@example.com', password:'Quokka7!Harbour' }) });
  check('an unknown address cannot sign in', 401, r.status);

  console.log('=== Admin-granted access ===');
  const mallory = await grant('Mallory', 'mallory@example.com');
  const m = await Users.findOne({ email:'mallory@example.com' });
  check('granted account defaults to the user role', 'user', m?.role);
  check('granted account is pre-verified', true, m?.emailVerified);
  check('granted account must change its password', true, m?.mustChangePassword);
  check('tokenVersion initialised', 0, m?.tokenVersion);
  (await Audit.findOne({ action:'user.access_granted' }))
    ? ok('granting access is audited') : bad('no audit record for the grant');
  // Mass assignment. An unrecognised role is rejected by route validation
  // before the controller ever runs, so no account is created at all.
  r = await req('/admin/users', { method:'POST', headers: AH, body: JSON.stringify({
    name:'Sneaky', email:'sneaky@example.com', role:'superuser' }) });
  check('unrecognised role rejected', 400, r.status, r.body);
  (await Users.findOne({ email:'sneaky@example.com' })) === null
    ? ok('no account created by the rejected request') : bad('account created anyway');
  // A field the API does not declare must never reach the document.
  await req('/admin/users', { method:'POST', headers: AH, body: JSON.stringify({
    name:'Extra', email:'extra@example.com', tokenVersion: 99, role: 'admin' }) });
  const extra = await Users.findOne({ email:'extra@example.com' });
  check('undeclared field is dropped', 0, extra?.tokenVersion);
  check('declared role is honoured', 'admin', extra?.role);

  console.log('=== Password policy (enforced on change) ===');
  {
    const lg = await req('/auth/login', { method:'POST', body: JSON.stringify(mallory) });
    const MH = { Authorization: `Bearer ${lg.body.token}` };
    for (const [label, pw] of [
      ['common password rejected', 'password123'],
      ['short password rejected', 'short1'],
      ['password containing the email rejected', 'mallory@example.comX1'],
      ['password containing the name rejected', 'Mallory2026!'],
    ]) {
      const rr = await req('/auth/change-password', { method:'POST', headers: MH, body: JSON.stringify({
        currentPassword: mallory.password, newPassword: pw, confirmPassword: pw }) });
      check(label, 400, rr.status, rr.body);
    }
    const rr = await req('/auth/change-password', { method:'POST', headers: MH, body: JSON.stringify({
      currentPassword:'definitely-not-it', newPassword:'Quokka7!Harbour', confirmPassword:'Quokka7!Harbour' }) });
    check('wrong current password rejected', 400, rr.status);
  }

  console.log('=== Account enumeration ===');
  const a = await req('/auth/forgot-password', { method:'POST', body: JSON.stringify({ email:'ghost@example.com' }) });
  const b = await req('/auth/forgot-password', { method:'POST', body: JSON.stringify({ email:'mallory@example.com' }) });
  JSON.stringify(comparable(a.body)) === JSON.stringify(comparable(b.body))
    ? ok('forgot-password response identical for real vs fake account')
    : bad('forgot-password leaks existence', `${JSON.stringify(a.body)} vs ${JSON.stringify(b.body)}`);
  const c = await req('/auth/verify-otp', { method:'POST', body: JSON.stringify({ email:'ghost@example.com', otp:'123456' }) });
  const d = await req('/auth/verify-otp', { method:'POST', body: JSON.stringify({ email:'mallory@example.com', otp:'123456' }) });
  (c.status === d.status && JSON.stringify(comparable(c.body)) === JSON.stringify(comparable(d.body)))
    ? ok('verify-otp response identical for real vs fake account')
    : bad('verify-otp leaks existence', `${c.status}:${JSON.stringify(c.body)} vs ${d.status}:${JSON.stringify(d.body)}`);

  console.log('=== verify-otp cannot be used to authenticate ===');
  // Regression: this endpoint used to return a signed session token whenever
  // the account was already verified, so knowing an address was enough to log
  // in as that person — including administrators.
  for (const [label, email] of [
    ['a verified user', 'mallory@example.com'],
    ['an administrator', 'suiteadmin@example.com'],
  ]) {
    r = await req('/auth/verify-otp', { method:'POST', body: JSON.stringify({ email, otp:'000000' }) });
    check(`${label}: no session from a wrong code`, 400, r.status, r.body);
    r.body?.token ? bad(`${label}: A TOKEN WAS ISSUED`) : ok(`${label}: no token issued`);
  }

  console.log('=== Password reset token is hashed at rest ===');
  const withReset = await Users.findOne({ email:'mallory@example.com' });
  withReset?.passwordResetTokenHash && /^[a-f0-9]{64}$/.test(withReset.passwordResetTokenHash)
    ? ok('reset token stored as SHA-256 digest, not plaintext')
    : bad('reset token not hashed', String(withReset?.passwordResetTokenHash).slice(0,40));

  console.log('=== Auth + invalid ObjectId ===');
  r = await req('/auth/login', { method:'POST', body: JSON.stringify(mallory) });
  check('login succeeds', 200, r.status, r.body);
  const TOK = r.body?.token;
  const auth = { Authorization: `Bearer ${TOK}` };
  TOK ? ok('token issued') : bad('no token');

  for (const [label, path] of [
    ['GET /prompts/<garbage>', '/prompts/not-an-objectid'],
    ['GET /contests/<garbage>', '/contests/zzzz'],
    ['DELETE /prompts/<garbage>', '/prompts/xyz'],
  ]) {
    const m2 = label.startsWith('DELETE') ? 'DELETE' : 'GET';
    r = await req(path, { method: m2, headers: auth });
    check(label + ' -> 404 not 500', 404, r.status, r.body);
  }

  console.log('=== Oversized / malformed input ===');
  r = await req('/prompts/analyze', { method:'POST', headers: auth, body: JSON.stringify({
    category:'Email Writing', scenario:'A reasonable scenario for testing purposes.', userPrompt:'x'.repeat(20000) }) });
  check('20k-char prompt rejected', 400, r.status, r.body);
  r = await req('/prompts/analyze', { method:'POST', headers: auth, body: JSON.stringify({
    category:'Nonexistent Category', scenario:'A reasonable scenario for testing purposes.', userPrompt:'Write an email.' }) });
  check('unknown category rejected', 400, r.status);
  r = await req('/prompts/analyze', { method:'POST', headers: auth, body: '{not valid json' });
  check('malformed JSON -> 400 not 500', 400, r.status, r.body);

  console.log('=== Account lockout (MAX_FAILED_LOGINS=3) ===');
  for (let i = 0; i < 3; i++) {
    await req('/auth/login', { method:'POST', body: JSON.stringify({ email:'mallory@example.com', password:'WrongPassword!1' }) });
  }
  r = await req('/auth/login', { method:'POST', body: JSON.stringify(mallory) });
  check('correct password refused while locked', 429, r.status, r.body);
  const lockAudit = await Audit.findOne({ action:'auth.lockout' });
  lockAudit ? ok('lockout written to audit log') : bad('no audit record for lockout');

  console.log('=== Token revocation ===');
  await Users.updateOne({ email:'mallory@example.com' }, { $set:{ lockUntil:null, failedLoginAttempts:0 } });
  r = await req('/auth/me', { headers: auth });
  check('token valid before revocation', 200, r.status);
  await Users.updateOne({ email:'mallory@example.com' }, { $inc:{ tokenVersion:1 } });
  r = await req('/auth/me', { headers: auth });
  check('token rejected after tokenVersion bump', 401, r.status, r.body);

  console.log('=== Operator usernames can sign in ===');
  // `User.email` doubles as the login identifier: real addresses for
  // self-registered users, plain usernames for accounts created by
  // `npm run seed:admin`. Validating the login route with the strict email
  // rule once locked every seeded operator account out of the API, with no
  // error anywhere except a 400 at sign-in.
  const bcryptLib = require('bcryptjs');
  await Users.deleteMany({ email: { $in: ['opuser', 'admin@pk'] } });
  await Users.insertMany([
    { name: 'Op', email: 'opuser', password: await bcryptLib.hash('OperatorPass!9', 10),
      role: 'admin', emailVerified: true, tokenVersion: 0, createdAt: new Date(), updatedAt: new Date() },
    { name: 'Op2', email: 'admin@pk', password: await bcryptLib.hash('OperatorPass!9', 10),
      role: 'admin', emailVerified: true, tokenVersion: 0, createdAt: new Date(), updatedAt: new Date() },
  ]);
  for (const id of ['opuser', 'OPUSER', 'admin@pk', 'Admin@PK']) {
    r = await req('/auth/login', { method: 'POST', body: JSON.stringify({ email: id, password: 'OperatorPass!9' }) });
    check(`login as "${id}"`, 200, r.status, r.body);
  }
  // Registration must still demand a deliverable address, so nobody can squat
  // a username before the seed runs.
  r = await req('/auth/register', { method: 'POST', body: JSON.stringify({
    name: 'Squatter', email: 'operator', password: 'Quokka7!Harbour', confirmPassword: 'Quokka7!Harbour' }) });
  check('registration still rejects a bare username', 400, r.status, r.body);
  // And the loosened rule must not reopen injection.
  r = await req('/auth/login', { method: 'POST', body: JSON.stringify({ email: { $ne: '' }, password: { $ne: '' } }) });
  check('login identifier still rejects a NoSQL operator', 400, r.status);

  console.log('=== CORS ===');
  const evil = await fetch(API + '/auth/login', { method:'POST',
    headers:{ 'Content-Type':'application/json', Origin:'https://evil.example.com' },
    body: JSON.stringify({ email:'a@b.co', password:'x' }) });
  check('disallowed origin blocked', 403, evil.status);
  const good = await fetch(API + '/health', { headers:{ Origin:'http://localhost:5173' } });
  check('allowed origin passes', 200, good.status);

  console.log('=== Secrets never serialised ===');
  r = await req('/auth/me', { headers: auth });
  const leaked = JSON.stringify(r.body || {});
  /password|otpHash|passwordResetTokenHash/i.test(leaked)
    ? bad('response leaks a secret field', leaked.slice(0,200))
    : ok('no password/otp/reset fields in any user payload');

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.connection.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE ERROR', e); process.exit(2); });
