const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');

test('signup origin fails closed and accepts only a configured canonical HTTPS origin',()=>{
 const old=process.env.SALSYSOS_APP_URL;
 try{
  const {getSignupOrigin}=load('lib/signup/origin.ts',{'server-only':{}});
  for(const bad of ['', 'http://localhost:3000','https://example.invalid/path','https://example.invalid/?next=https://other.invalid','https://user:pass@example.invalid','https://example.invalid/#x','//example.invalid','https://example.invalid/../']){
    process.env.SALSYSOS_APP_URL=bad;
    assert.equal(getSignupOrigin(),null,bad);
  }
  delete process.env.SALSYSOS_APP_URL;
  assert.equal(getSignupOrigin(),null);
  for(const good of ['https://salsysos.com','https://staging.example.invalid/']){
    process.env.SALSYSOS_APP_URL=good;
    assert.equal(getSignupOrigin(),new URL(good).origin);
  }
 }finally{if(old===undefined)delete process.env.SALSYSOS_APP_URL;else process.env.SALSYSOS_APP_URL=old;}
});

test('CAPTCHA requires exact configured hostname and signup action',async()=>{
 const previous=global.fetch;
 const old=process.env.SALSYS_SIGNUP_TURNSTILE_SECRET;
 try{
  process.env.SALSYS_SIGNUP_TURNSTILE_SECRET='synthetic-test-secret';
  let origin='https://staging.example.invalid';
  let reply={success:true,hostname:'staging.example.invalid',action:'signup'};
  let calls=0;
  global.fetch=async(url,opts)=>{calls++;assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');assert.equal(opts.method,'POST');return {ok:true,json:async()=>reply};};
  const {verifySignupCaptcha}=load('lib/signup/captcha.ts',{'server-only':{},'@/lib/signup/origin':{getSignupOrigin:()=>origin}});
  assert.equal(await verifySignupCaptcha('synthetic'),true);
  reply={...reply,hostname:'salsysos.com'};
  assert.equal(await verifySignupCaptcha('synthetic'),false);
  reply={success:true,hostname:'staging.example.invalid',action:'other'};
  assert.equal(await verifySignupCaptcha('synthetic'),false);
  origin=null;
  assert.equal(await verifySignupCaptcha('synthetic'),false);
  assert.equal(calls,3);
 }finally{global.fetch=previous;if(old===undefined)delete process.env.SALSYS_SIGNUP_TURNSTILE_SECRET;else process.env.SALSYS_SIGNUP_TURNSTILE_SECRET=old;}
});
