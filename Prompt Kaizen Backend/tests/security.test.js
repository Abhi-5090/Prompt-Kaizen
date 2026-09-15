const mongoose = require('mongoose');
const API = 'http://127.0.0.1:5099/api';
const URI = 'mongodb://127.0.0.1:27055/pk_phase1_test';
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
  const Users = mongoose.connection.collection('users');
  const Audit = mongoose.connection.collection('auditlogs');
  await Users.deleteMany({});
  await Audit.deleteMany({});

  console.log('=== NoSQL injection ===');
  let r = await req('/auth/login', { method:'POST', body: JSON.stringify({ email:{$ne:''}, password:{$ne:''} }) });
  check('login with $ne operator rejected', 400, r.status, r.body);
  r = await req('/auth/login', { method:'POST', body: JSON.stringify({ email:['a@b.co'], password:'x' }) });
  check('login with array email rejected', 400, r.status);

  console.log('=== Mass assignment ===');
  r = await req('/auth/register', { method:'POST', body: JSON.stringify({ name:'Mallory', email:'mallory@example.com', password:'Str0ngPassw0rd!', role:'admin' }) });
  check('register accepted', 201, r.status, r.body);
  const m = await Users.findOne({ email:'mallory@example.com' });
  check('injected role:admin stripped', 'user', m?.role);
  check('tokenVersion initialised', 0, m?.tokenVersion);

  console.log('=== Password policy ===');
  for (const [label, pw, email] of [
    ['common password rejected','password123','w1@example.com'],
    ['short password rejected','short1','w2@example.com'],
    ['password containing email rejected','bob@example.comX1','bob@example.com'],
  ]) {
    r = await req('/auth/register', { method:'POST', body: JSON.stringify({ name:'W', email, password: pw }) });
    check(label, 400, r.status, r.body);
  }

  console.log('=== Account enumeration ===');
  r = await req('/auth/register', { method:'POST', body: JSON.stringify({ name:'Dup', email:'mallory@example.com', password:'An0therG00dPass!' }) });
  check('duplicate register returns 201 like a new one', 201, r.status, r.body);
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

  console.log('=== Password reset token is hashed at rest ===');
  const withReset = await Users.findOne({ email:'mallory@example.com' });
  withReset?.passwordResetTokenHash && /^[a-f0-9]{64}$/.test(withReset.passwordResetTokenHash)
    ? ok('reset token stored as SHA-256 digest, not plaintext')
    : bad('reset token not hashed', String(withReset?.passwordResetTokenHash).slice(0,40));

  console.log('=== Auth + invalid ObjectId ===');
  await Users.updateOne({ email:'mallory@example.com' }, { $set:{ emailVerified:true } });
  r = await req('/auth/login', { method:'POST', body: JSON.stringify({ email:'mallory@example.com', password:'Str0ngPassw0rd!' }) });
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
  r = await req('/auth/login', { method:'POST', body: JSON.stringify({ email:'mallory@example.com', password:'Str0ngPassw0rd!' }) });
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
