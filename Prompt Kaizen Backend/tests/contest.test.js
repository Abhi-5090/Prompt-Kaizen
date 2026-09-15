const mongoose = require('mongoose');
// Endpoints and database under test. Both are overridable so CI can point the
// suite at the same database the server was started against — hardcoding them
// let the two drift apart, and the failure mode was silent: the API returned
// 201 while the test read an empty collection from a different database.
const API = process.env.TEST_API_URL || 'http://127.0.0.1:5099/api';
const URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27055/pk_phase1_test';
let pass=0, fail=0;
const ok=(n,e='')=>{console.log(`  PASS  ${n}${e?' — '+e:''}`);pass++;};
const bad=(n,e='')=>{console.log(`  FAIL  ${n}${e?' — '+e:''}`);fail++;};
const check=(n,exp,got,b)=>exp===got?ok(n,`${got}`):bad(n,`expected ${exp} got ${got} ${JSON.stringify(b||'').slice(0,200)}`);

async function req(path, opts={}) {
  const res = await fetch(API+path, { ...opts, headers:{'Content-Type':'application/json', ...(opts.headers||{})} });
  let body=null; try { body = await res.json(); } catch {}
  return { status:res.status, body };
}

(async () => {
  await mongoose.connect(URI);
  const db = mongoose.connection;
  await db.collection('contests').deleteMany({});
  await db.collection('contestsubmissions').deleteMany({});
  await db.collection('users').deleteMany({ email: { $in:['player@example.com','boss@example.com'] } });

  // Seed a verified player and an admin directly.
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('Str0ngPassw0rd!', 10);
  await db.collection('users').insertMany([
    { name:'Player', email:'player@example.com', password:hash, role:'user',  emailVerified:true, tokenVersion:0, createdAt:new Date(), updatedAt:new Date() },
    { name:'Boss',   email:'boss@example.com',   password:hash, role:'admin', emailVerified:true, tokenVersion:0, createdAt:new Date(), updatedAt:new Date() },
  ]);
  const login = async (email) => (await req('/auth/login',{method:'POST',body:JSON.stringify({email,password:'Str0ngPassw0rd!'})})).body.token;
  const playerTok = await login('player@example.com');
  const adminTok  = await login('boss@example.com');
  const P = { Authorization:`Bearer ${playerTok}` };
  const A = { Authorization:`Bearer ${adminTok}` };

  console.log('=== Scenario leak before a contest opens ===');
  // Contest that starts in the FUTURE, published, player allow-listed.
  const future = new Date(Date.now() + 3600_000);
  const later  = new Date(Date.now() + 7200_000);
  const ins = await db.collection('contests').insertOne({
    title:'Future Contest', description:'', scheduledDate:new Date(),
    startsAt:future, endsAt:later, durationMinutes:30,
    scenarios:[{category:'Email Writing',scenario:'Write a formal email to the principal requesting permission.'},
               {category:'Data Analysis',scenario:'Analyze quarterly sales data and report the top three drivers.'}],
    allowedEmails:['player@example.com'], status:'published',
    createdAt:new Date(), updatedAt:new Date(),
  });
  const cid = ins.insertedId.toString();

  let r = await req(`/contests/${cid}`, { headers:P });
  check('upcoming contest is reachable', 200, r.status, r.body);
  const scen = r.body?.contest?.scenarios;
  (Array.isArray(scen) && scen.length === 0)
    ? ok('scenarios withheld before start', `locked=${r.body.contest.scenariosLocked}, count=${r.body.contest.scenariosCount}`)
    : bad('SCENARIOS LEAKED before contest opens', JSON.stringify(scen).slice(0,200));

  console.log('=== Cannot start or submit before the window ===');
  r = await req(`/contests/${cid}/start`, { method:'POST', headers:P });
  check('start rejected before window', 409, r.status, r.body);
  r = await req(`/contests/${cid}/submit`, { method:'POST', headers:P, body: JSON.stringify({answers:[{scenarioIndex:0,userPrompt:'Act as a writer. Write a formal email.'}]}) });
  check('submit rejected before window', 409, r.status);

  console.log('=== Live contest releases scenarios ===');
  await db.collection('contests').updateOne({_id:ins.insertedId},
    { $set:{ startsAt:new Date(Date.now()-60_000), endsAt:new Date(Date.now()+3600_000) } });
  r = await req(`/contests/${cid}`, { headers:P });
  (r.body?.contest?.scenarios?.length === 2)
    ? ok('scenarios released once live')
    : bad('scenarios missing while live', JSON.stringify(r.body?.contest?.scenarios));

  console.log('=== Per-user duration is enforced server-side ===');
  r = await req(`/contests/${cid}/start`, { method:'POST', headers:P });
  check('start accepted while live', 200, r.status, r.body);
  r.body?.deadline ? ok('server returns authoritative deadline') : bad('no deadline returned');

  // Backdate startedAt so the user's 30-minute personal cap has expired,
  // while the contest window itself is still wide open.
  await db.collection('contestsubmissions').updateOne(
    { contestId: ins.insertedId },
    { $set: { startedAt: new Date(Date.now() - 45*60_000) } }
  );
  r = await req(`/contests/${cid}/submit`, { method:'POST', headers:P, body: JSON.stringify({answers:[{scenarioIndex:0,userPrompt:'Act as a professional writer and draft a formal email to the principal.'}]}) });
  check('submit refused after personal time limit (window still open)', 409, r.status, r.body);

  console.log('=== Normal submit still works ===');
  await db.collection('contestsubmissions').updateOne({ contestId: ins.insertedId }, { $set:{ startedAt:new Date() } });
  r = await req(`/contests/${cid}/submit`, { method:'POST', headers:P, body: JSON.stringify({answers:[
    {scenarioIndex:0,userPrompt:'Act as a professional communication specialist. Write a formal email to the principal requesting permission for an AI workshop, in a polite tone, under 200 words.'},
    {scenarioIndex:1,userPrompt:'Act as a data analyst. Analyze the quarterly sales data and report the top three revenue drivers as a bulleted list for stakeholders.'}]}) });
  check('in-time submit accepted', 200, r.status, r.body);
  typeof r.body?.submission?.averageScore === 'number' ? ok(`scored, avg=${r.body.submission.averageScore}`) : bad('no score');

  r = await req(`/contests/${cid}/submit`, { method:'POST', headers:P, body: JSON.stringify({answers:[]}) });
  check('double-submit refused', 409, r.status);

  console.log('=== Admin cannot rewrite questions after attempts exist ===');
  r = await req(`/admin/contests/${cid}`, { method:'PUT', headers:A, body: JSON.stringify({
    scenarios:[{category:'Email Writing',scenario:'A completely different question that nobody answered.'}] }) });
  check('scenario edit blocked once attempts exist', 409, r.status, r.body);
  r = await req(`/admin/contests/${cid}`, { method:'PUT', headers:A, body: JSON.stringify({ title:'Renamed Contest' }) });
  check('non-scenario edit still allowed', 200, r.status, r.body);

  console.log('=== Allow-list enforcement + leaderboard PII ===');
  const outsider = await db.collection('users').insertOne({ name:'Out', email:'out@example.com', password:hash, role:'user', emailVerified:true, tokenVersion:0, createdAt:new Date(), updatedAt:new Date() });
  const outTok = await login('out@example.com');
  r = await req(`/contests/${cid}`, { headers:{ Authorization:`Bearer ${outTok}` } });
  check('non-allow-listed user blocked', 403, r.status);
  r = await req(`/contests/${cid}/leaderboard`, { headers:P });
  check('leaderboard readable by participant', 200, r.status);
  const rows = r.body?.leaderboard || [];
  const others = rows.filter(x => !x.isMe);
  others.every(x => x.email.includes('***')) ? ok('other participants\' emails masked') : bad('unmasked emails on leaderboard');

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await db.close();
  process.exit(fail?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
