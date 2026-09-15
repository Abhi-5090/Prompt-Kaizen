const mongoose = require('mongoose');
const { generateResetToken, hashResetToken } = require('../utils/otp');
// Endpoints and database under test. Both are overridable so CI can point the
// suite at the same database the server was started against — hardcoding them
// let the two drift apart, and the failure mode was silent: the API returned
// 201 while the test read an empty collection from a different database.
const API = process.env.TEST_API_URL || 'http://127.0.0.1:5099/api';
const URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27055/pk_phase1_test';
let pass=0,fail=0;
const ok=(n,e='')=>{console.log(`  PASS  ${n}${e?' — '+e:''}`);pass++;};
const bad=(n,e='')=>{console.log(`  FAIL  ${n}${e?' — '+e:''}`);fail++;};
const check=(n,exp,got,b)=>exp===got?ok(n,`${got}`):bad(n,`expected ${exp} got ${got} ${JSON.stringify(b||'').slice(0,160)}`);
async function req(p,o={}){const r=await fetch(API+p,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})}});let b=null;try{b=await r.json()}catch{};return{status:r.status,body:b};}

(async()=>{
  await mongoose.connect(URI);
  const U = mongoose.connection.collection('users');
  const bcrypt=require('bcryptjs');
  await U.deleteMany({email:'reset@example.com'});
  await U.insertOne({name:'Reset User',email:'reset@example.com',password:await bcrypt.hash('OldPassw0rd!',10),
    role:'user',emailVerified:true,tokenVersion:0,failedLoginAttempts:0,lockUntil:null,createdAt:new Date(),updatedAt:new Date()});

  // Log in to get a token we can later prove was revoked by the reset.
  let r = await req('/auth/login',{method:'POST',body:JSON.stringify({email:'reset@example.com',password:'OldPassw0rd!'})});
  const oldTok = r.body.token;
  check('login with old password', 200, r.status);

  // Plant a reset token the way forgotPassword would (email delivery is not
  // configured in this environment, so we write the hash directly).
  const { token, hash } = generateResetToken();
  await U.updateOne({email:'reset@example.com'},{$set:{passwordResetTokenHash:hash,passwordResetExpiresAt:new Date(Date.now()+30*60000)}});

  console.log('=== Reset token validation ===');
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',token:'w'.repeat(43),password:'BrandNewPass!9'})});
  check('wrong token rejected', 400, r.status, r.body);
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',token,password:'OldPassw0rd!'})});
  check('reusing current password rejected', 400, r.status, r.body);
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',token,password:'password123'})});
  check('weak new password rejected', 400, r.status, r.body);

  console.log('=== Successful reset ===');
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',token,password:'BrandNewPass!9',confirmPassword:'BrandNewPass!9'})});
  check('reset succeeds', 200, r.status, r.body);
  r.body?.token ? ok('new session token returned') : bad('no token after reset');

  const after = await U.findOne({email:'reset@example.com'});
  after.passwordResetTokenHash === null ? ok('reset token cleared (single use)') : bad('reset token still present');
  after.tokenVersion === 1 ? ok('tokenVersion bumped by password change', `tv=${after.tokenVersion}`) : bad('tokenVersion not bumped', `tv=${after.tokenVersion}`);

  console.log('=== Old sessions are dead ===');
  r = await req('/auth/me',{headers:{Authorization:`Bearer ${oldTok}`}});
  check('pre-reset token now rejected', 401, r.status, r.body);

  console.log('=== Token cannot be replayed ===');
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',token,password:'YetAnotherPass!7'})});
  check('same reset token refused second time', 400, r.status);

  console.log('=== New password works, old does not ===');
  r = await req('/auth/login',{method:'POST',body:JSON.stringify({email:'reset@example.com',password:'BrandNewPass!9'})});
  check('login with new password', 200, r.status);
  r = await req('/auth/login',{method:'POST',body:JSON.stringify({email:'reset@example.com',password:'OldPassw0rd!'})});
  check('login with old password refused', 401, r.status);

  console.log('=== Expired token ===');
  const t2 = generateResetToken();
  await U.updateOne({email:'reset@example.com'},{$set:{passwordResetTokenHash:t2.hash,passwordResetExpiresAt:new Date(Date.now()-1000)}});
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',token:t2.token,password:'ExpiredTest!5'})});
  check('expired token rejected', 400, r.status, r.body);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.connection.close(); process.exit(fail?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
