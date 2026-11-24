const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers.cjs');
const keys=['SALSYS_PUBLIC_SIGNUP_ENABLED','SALSYS_SIGNUP_ADMISSION_MODE','SALSYS_SIGNUP_PILOT_EMAILS'];
const withEnv=(values,fn)=>{
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try {
    for(const k of keys){delete process.env[k];if(values[k]!==undefined)process.env[k]=values[k];}
    fn(load('lib/signup/admission.ts',{'server-only':{}}));
  } finally {
    for(const k of keys){delete process.env[k];if(old[k]!==undefined)process.env[k]=old[k];}
  }
};
const open={SALSYS_PUBLIC_SIGNUP_ENABLED:'true'};
test('signup admission defaults closed and global pause overrides public mode',()=>{
  for(const values of [{},open,{SALSYS_SIGNUP_ADMISSION_MODE:'public'},{...open,SALSYS_SIGNUP_ADMISSION_MODE:'typo'}]){
    withEnv(values,m=>{assert.equal(m.isSignupAdmissionConfigured(),false);assert.equal(m.isSignupEmailAdmitted('a@example.com'),false)});
  }
});
test('pilot admits only exact normalized addresses',()=>{
  withEnv({...open,SALSYS_SIGNUP_ADMISSION_MODE:'pilot',SALSYS_SIGNUP_PILOT_EMAILS:' a@example.com, B@example.com '},m=>{
    assert.equal(m.isSignupPilotMode(),true);
    assert.equal(m.isSignupAdmissionConfigured(),true);
    assert.equal(m.isSignupEmailAdmitted('A@EXAMPLE.COM'),true);
    assert.equal(m.isSignupEmailAdmitted('b@example.com'),true);
    for(const e of ['c@example.com','a+tag@example.com','a@example.com.evil.test','not an email',null])assert.equal(m.isSignupEmailAdmitted(e),false);
  });
});
test('invalid, wildcard, empty, or oversized pilot lists fail closed',()=>{
  for(const emails of ['', 'a@example.com,', '*@example.com', 'a@example.com,bad',Array.from({length:11},(_,i)=>i+'@example.com').join(',')]){
    withEnv({...open,SALSYS_SIGNUP_ADMISSION_MODE:'pilot',SALSYS_SIGNUP_PILOT_EMAILS:emails},m=>{
      assert.equal(m.isSignupAdmissionConfigured(),false);assert.equal(m.isSignupEmailAdmitted('a@example.com'),false);
    });
  }
});
test('public mode remains explicitly enabled only',()=>{
  withEnv({...open,SALSYS_SIGNUP_ADMISSION_MODE:'public'},m=>{
    assert.equal(m.isSignupAdmissionConfigured(),true);assert.equal(m.isSignupPilotMode(),false);
    assert.equal(m.isSignupEmailAdmitted('new@example.com'),true);assert.equal(m.isSignupEmailAdmitted('invalid'),false);
  });
});
test('server action admission runs before durable signup or resend reservations and verified provisioning',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const read=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');
  const actions=read('app/signup/actions.ts');
  const resend=actions.slice(actions.indexOf('export async function resendSignupVerificationAction'));
  assert.ok(actions.indexOf('await verifySignupCaptcha')<actions.indexOf('if (!isSignupEmailAdmitted(email))'));
  assert.ok(actions.indexOf('if (!isSignupEmailAdmitted(email))')<actions.indexOf('reserve_signup_intent_v1'));
  assert.ok(resend.indexOf('if (!isSignupEmailAdmitted(email))')>=0);
  assert.ok(resend.indexOf('if (!isSignupEmailAdmitted(email))')<resend.indexOf('reserve_signup_resend_v1'));
  const provision=read('lib/signup/provision.ts');
  assert.ok(provision.includes('!isSignupEmailAdmitted(user.email)'));
  assert.ok(provision.indexOf('!isSignupEmailAdmitted(user.email)')<provision.indexOf("rpc('provision_verified_signup_v1'"));
});
