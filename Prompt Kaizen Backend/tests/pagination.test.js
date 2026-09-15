/**
 * Pagination and server-side search.
 *
 * The admin lists previously returned up to 1000 records and filtered in the
 * browser, so beyond that cap the table silently truncated and search could
 * not match anything outside the window. These assertions cover paging
 * correctness, that search reaches records past the old cap, and that the
 * search term cannot be used as a regex injection or ReDoS vector.
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
  await U.deleteMany({ email: /paginate-/ });
  await U.deleteMany({ email: 'padmin@example.com' });

  const hash = await bcrypt.hash('Str0ngPassw0rd!', 10);
  await U.insertOne({ name:'PAdmin', email:'padmin@example.com', password:hash, role:'admin',
    emailVerified:true, tokenVersion:0, createdAt:new Date(), updatedAt:new Date() });

  // 1205 users: more than the old hard cap of 1000, so a record beyond it
  // exists to search for.
  const bulk = [];
  for (let i = 0; i < 1205; i++) {
    bulk.push({ name: `Paginate User ${i}`, email: `paginate-${String(i).padStart(4,'0')}@example.com`,
      password: hash, role: 'user', emailVerified: true, tokenVersion: 0,
      createdAt: new Date(Date.now() - i * 1000), updatedAt: new Date() });
  }
  // The needle sorts last by createdAt, i.e. well past position 1000.
  bulk.push({ name: 'Zebedee Needle', email: 'paginate-needle@example.com', password: hash,
    role:'user', emailVerified:true, tokenVersion:0,
    createdAt: new Date(Date.now() - 999999000), updatedAt: new Date() });
  await U.insertMany(bulk);
  console.log(`  (seeded ${bulk.length} users)`);

  const login = await req('/auth/login', { method:'POST', body: JSON.stringify({
    email:'padmin@example.com', password:'Str0ngPassw0rd!' }) });
  const H = { Authorization: `Bearer ${login.body.token}` };

  console.log('=== Paging ===');
  let r = await req('/admin/users?page=1&limit=10', { headers: H });
  check('page 1 returns 200', 200, r.status);
  r.body.users?.length === 10 ? ok('returns exactly `limit` rows') : bad('wrong page size', String(r.body.users?.length));
  const p = r.body.pagination;
  p && p.total > 1200 ? ok('reports a full total, not a truncated one', `total=${p.total}`) : bad('total looks truncated', JSON.stringify(p));
  p?.hasNext === true && p?.hasPrev === false ? ok('navigation flags correct on first page') : bad('bad nav flags', JSON.stringify(p));

  const page1 = (await req('/admin/users?page=1&limit=10', { headers: H })).body.users.map(u => u.email);
  const page2 = (await req('/admin/users?page=2&limit=10', { headers: H })).body.users.map(u => u.email);
  page1.some(e => page2.includes(e)) ? bad('pages overlap') : ok('consecutive pages do not overlap');

  const last = await req(`/admin/users?page=${p.totalPages}&limit=10`, { headers: H });
  last.body.pagination.hasNext === false ? ok('last page reports no next') : bad('last page nav wrong');

  console.log('=== Limits are clamped, not trusted ===');
  r = await req('/admin/users?page=1&limit=100000', { headers: H });
  check('absurd limit rejected by validation', 400, r.status, r.body);
  r = await req('/admin/users?page=1&limit=100', { headers: H });
  r.body.users.length <= 100 ? ok('max allowed limit honoured', String(r.body.users.length)) : bad('limit exceeded');
  r = await req('/admin/users?page=99999&limit=10', { headers: H });
  (r.status === 200 && r.body.users.length === 0) ? ok('page past the end returns empty, not an error') : bad('bad out-of-range page', String(r.status));

  console.log('=== Search reaches past the old 1000-record cap ===');
  r = await req('/admin/users?search=Zebedee', { headers: H });
  const found = (r.body.users || []).some(u => u.email === 'paginate-needle@example.com');
  found ? ok('finds a record that sorts beyond position 1000') : bad('NEEDLE NOT FOUND — search is still windowed');
  r.body.pagination.total === 1 ? ok('search total reflects matches, not collection size') : bad('search total wrong', String(r.body.pagination.total));

  r = await req('/admin/users?search=paginate-0001', { headers: H });
  r.body.users.length === 1 ? ok('search matches on email') : bad('email search failed', String(r.body.users.length));

  console.log('=== Search input cannot break or hang the query ===');
  for (const [label, term] of [
    ['unbalanced paren', '('],
    ['ReDoS pattern', '(a+)+$'],
    ['regex metachars', '.*'],
    ['NoSQL-ish', '{"$ne":""}'],
  ]) {
    const t0 = Date.now();
    const rr = await req(`/admin/users?search=${encodeURIComponent(term)}`, { headers: H });
    const ms = Date.now() - t0;
    (rr.status === 200 && ms < 3000)
      ? ok(`${label} handled safely`, `${rr.status} in ${ms}ms, ${rr.body.pagination.total} matches`)
      : bad(`${label} broke the query`, `${rr.status} in ${ms}ms`);
  }
  // `.*` must not match everything — it should be escaped to a literal.
  r = await req('/admin/users?search=' + encodeURIComponent('.*'), { headers: H });
  r.body.pagination.total === 0 ? ok('regex metacharacters treated as literals') : bad('regex injected: .* matched ' + r.body.pagination.total);

  console.log('=== Response size is bounded ===');
  r = await req('/admin/users', { headers: H });
  const bytes = JSON.stringify(r.body).length;
  bytes < 200_000 ? ok('default page is small', `${(bytes/1024).toFixed(1)} KB`) : bad('response too large', `${(bytes/1024).toFixed(1)} KB`);

  await U.deleteMany({ email: /paginate-/ });
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.connection.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE ERROR', e); process.exit(2); });
