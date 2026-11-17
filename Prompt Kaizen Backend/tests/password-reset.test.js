const mongoose = require('mongoose');
const { generateOtp, hashOtp, RESET_OTP_MAX_ATTEMPTS } = require('../utils/otp');
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

  // Plant a reset code the way forgotPassword would (email delivery is not
  // configured in this environment, so we write the hash directly).
  const plant = async (code, expiresAt) => U.updateOne({email:'reset@example.com'},
    {$set:{passwordResetOtpHash:await hashOtp(code),passwordResetExpiresAt:expiresAt,passwordResetOtpAttempts:0}});

  // A code that is NOT the planted one, for the wrong-guess cases.
  let otp = generateOtp();
  let wrong = String((Number(otp) + 1) % 1000000).padStart(6,'0');
  await plant(otp, new Date(Date.now()+10*60000));

  console.log('=== Reset code validation ===');
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',otp:'12345',password:'BrandNewPass!9'})});
  check('non-6-digit code rejected by validation', 400, r.status, r.body);
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',otp:wrong,password:'BrandNewPass!9'})});
  check('wrong code rejected', 400, r.status, r.body);
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',otp,password:'OldPassw0rd!'})});
  check('reusing current password rejected', 400, r.status, r.body);
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',otp,password:'password123'})});
  check('weak new password rejected', 400, r.status, r.body);

  // The wrong guess above incremented the counter; a correct code must still
  // work while budget remains. Re-plant to a clean state for the success path.
  await plant(otp, new Date(Date.now()+10*60000));

  console.log('=== Successful reset ===');
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',otp,password:'BrandNewPass!9',confirmPassword:'BrandNewPass!9'})});
  check('reset succeeds', 200, r.status, r.body);
  r.body?.token ? ok('new session token returned') : bad('no token after reset');

  const after = await U.findOne({email:'reset@example.com'});
  after.passwordResetOtpHash === null ? ok('reset code cleared (single use)') : bad('reset code still present');
  after.passwordResetOtpAttempts === 0 ? ok('attempt counter cleared') : bad('attempt counter not cleared', `n=${after.passwordResetOtpAttempts}`);
  after.tokenVersion === 1 ? ok('tokenVersion bumped by password change', `tv=${after.tokenVersion}`) : bad('tokenVersion not bumped', `tv=${after.tokenVersion}`);

  console.log('=== Old sessions are dead ===');
  r = await req('/auth/me',{headers:{Authorization:`Bearer ${oldTok}`}});
  check('pre-reset token now rejected', 401, r.status, r.body);

  console.log('=== Code cannot be replayed ===');
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',otp,password:'YetAnotherPass!7'})});
  check('same reset code refused second time', 400, r.status);

  console.log('=== New password works, old does not ===');
  r = await req('/auth/login',{method:'POST',body:JSON.stringify({email:'reset@example.com',password:'BrandNewPass!9'})});
  check('login with new password', 200, r.status);
  r = await req('/auth/login',{method:'POST',body:JSON.stringify({email:'reset@example.com',password:'OldPassw0rd!'})});
  check('login with old password refused', 401, r.status);

  console.log('=== Expired code ===');
  const otp2 = generateOtp();
  await U.updateOne({email:'reset@example.com'},{$set:{passwordResetOtpHash:await hashOtp(otp2),passwordResetExpiresAt:new Date(Date.now()-1000),passwordResetOtpAttempts:0}});
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',otp:otp2,password:'ExpiredTest!5'})});
  check('expired code rejected', 400, r.status, r.body);

  // A 6-digit code is guessable, so the attempt cap is the control that makes
  // it safe. Without this test a regression that stopped counting wrong
  // guesses would leave brute force wide open and every other test passing.
  console.log('=== Brute force is capped ===');
  const otp3 = generateOtp();
  const wrong3 = String((Number(otp3) + 1) % 1000000).padStart(6,'0');
  await plant(otp3, new Date(Date.now()+10*60000));
  for (let i = 0; i < RESET_OTP_MAX_ATTEMPTS; i += 1) {
    await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',otp:wrong3,password:'CappedTest!7'})});
  }
  const spent = await U.findOne({email:'reset@example.com'});
  spent.passwordResetOtpHash === null
    ? ok(`code discarded after ${RESET_OTP_MAX_ATTEMPTS} wrong guesses`)
    : bad('code survived the attempt cap');
  r = await req('/auth/reset-password',{method:'POST',body:JSON.stringify({email:'reset@example.com',otp:otp3,password:'CappedTest!7'})});
  check('correct code refused once budget is spent', 400, r.status, r.body);

  console.log('=== Enumeration ===');
  const a = await req('/auth/forgot-password',{method:'POST',body:JSON.stringify({email:'reset@example.com'})});
  const b = await req('/auth/forgot-password',{method:'POST',body:JSON.stringify({email:'definitely-not-a-user@example.com'})});
  a.status === b.status && JSON.stringify(a.body?.message) === JSON.stringify(b.body?.message)
    ? ok('forgot-password reveals nothing about account existence')
    : bad('forgot-password responses differ', `${a.status}/${b.status}`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.connection.close(); process.exit(fail?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
