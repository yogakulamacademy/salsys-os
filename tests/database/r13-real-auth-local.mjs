// Real local GoTrue/PostgREST smoke, not an app browser/CAPTCHA test.
// Only a fresh, disposable GitHub-hosted runner may execute this fixture.
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||
   process.env.SALSYS_R13_DISPOSABLE_AUTH_TEST!=='1')throw new Error('Disposable CI runner required');
const envText=execFileSync('supabase',['status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const read=(name)=>envText.match(new RegExp('^'+name+'="?([^"\\r\\n]+)"?$', 'm'))?.[1];
const local=(raw,port)=>{
  const url=new URL(raw||'http://127.0.0.1:'+port);
  if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname)||
     url.port!==String(port)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)
    throw Error('Unexpected local service origin');
  return url.origin;
};
const api=local(read('API_URL'),54321);
const mail=local(read('MAILPIT_URL')||read('INBUCKET_URL'),54324);
const anon=read('ANON_KEY'),service=read('SERVICE_ROLE_KEY');
if(!anon||!service||anon===service)throw Error('Local legacy Auth keys unavailable');

async function request(origin,path,{method='GET',key,token,body}={}){
  const headers={'content-type':'application/json'};
  if(key)headers.apikey=key;
  if(token)headers.authorization='Bearer '+token;
  const r=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),
    redirect:'error',signal:AbortSignal.timeout(10000)});
  const raw=await r.text();
  let data=null;try{data=JSON.parse(raw)}catch{data=raw}
  return {ok:r.ok,status:r.status,data};
}
const rpc=(name,args={},token=service,key=service)=>request(api,'/rest/v1/rpc/'+name,{method:'POST',key,token,body:args});
const auth=(path,body,token=anon)=>request(api,'/auth/v1/'+path,{method:'POST',key:anon,token,body});
function good(r,label){if(!r.ok)throw Error(label+' failed (HTTP '+r.status+')');return r.data;}
function denied(r,label){if(r.ok)throw Error(label+' unexpectedly accepted');}
function verificationToken(message){
  const parts=typeof message==='string'?message:JSON.stringify(message);
  // Inspect only in memory. Never print a verification URL or code.
  const normalized=parts.replaceAll('&amp;','&').replaceAll('=3D','=').replace(/=\r?\n/g,'');
  const match=normalized.match(/[?&]token=([^&\s"'<>\\]+)/);
  return match?decodeURIComponent(match[1]):null;
}
async function capturedToken(email){
  const mailbox=email.split('@')[0];
  for(let n=0;n<45;n++){
    const list=await request(mail,'/api/v1/messages');
    if(list.ok&&Array.isArray(list.data?.messages)){
      for(const m of list.data.messages){
        if(!Array.isArray(m.To)||!m.To.some(x=>x.Address===email))continue;
        const msg=await request(mail,'/api/v1/message/'+encodeURIComponent(m.ID));
        if(msg.ok){const t=verificationToken(msg.data);if(t)return t;}
      }
    }else{
      // Older local Supabase versions use Inbucket instead of Mailpit.
      const box=await request(mail,'/api/v1/mailbox/'+encodeURIComponent(mailbox));
      if(box.ok&&Array.isArray(box.data))for(const m of box.data){
        const msg=await request(mail,'/api/v1/mailbox/'+encodeURIComponent(mailbox)+'/'+encodeURIComponent(m.id));
        if(msg.ok){const t=verificationToken(msg.data);if(t)return t;}
      }
    }
    await delay(1000);
  }
  throw Error('Controlled local verification email not captured');
}
async function register(label){
  const email='r13-'+label+'-'+randomUUID()+'@example.com';
  const password=randomBytes(24).toString('hex');
  const intent=randomUUID();
  assert.equal(good(await rpc('reserve_signup_intent_v1',{p_id:intent,p_email:email,p_full_name:'Synthetic customer',p_business_name:'Synthetic '+label}),'reserve'),true);
  const signup=good(await auth('signup',{email,password,data:{signup_intent_id:intent}}),'Auth signup');
  const user=signup.user||signup;
  if(!user.id||user.email_confirmed_at||signup.access_token||signup.session)throw Error('Signup did not require verification');
  assert.equal(good(await rpc('accept_signup_intent_v1',{p_id:intent,p_user_id:user.id}),'accept intent'),true);
  denied(await rpc('provision_verified_signup_v1',{p_user_id:user.id}),'Unconfirmed provisioning');
  denied(await auth('token?grant_type=password',{email,password}),'Unconfirmed sign-in');
  const token=await capturedToken(email);
  const session=good(await auth('verify',{type:'signup',token_hash:token}),'Real email verification');
  if(!session.access_token||session.user?.id!==user.id||!session.user?.email_confirmed_at)throw Error('Verified Auth session unavailable');
  const org=good(await rpc('provision_verified_signup_v1',{p_user_id:user.id}),'Verified provisioning');
  if(typeof org!=='string'||!org.match(/^[0-9a-f-]{36}$/i))throw Error('Organization identifier unavailable');
  assert.equal(good(await rpc('provision_verified_signup_v1',{p_user_id:user.id}),'Provision retry'),org);
  const login=good(await auth('token?grant_type=password',{email,password}),'Verified sign-in');
  if(!login.access_token||login.user?.id!==user.id)throw Error('Verified login session unavailable');
  good(await rpc('bind_current_tenant_session',{p_organization_id:org},login.access_token,anon),'Real JWT tenant binding');
  const state=good(await rpc('get_current_subscription_dashboard_v1',{},login.access_token,anon),'Tenant dashboard');
  if(state.state!=='pro_trial'||state.named_users!==1)throw Error('Unexpected trial dashboard');
  console.log(label+': verified local email, Auth-issued JWT, provisioning retry and trial dashboard PASS');
  return {org,token:login.access_token};
}
try{
  assert.equal(good(await rpc('signup_trial_available_v1'),'Local policy readiness'),true);
  denied(await rpc('get_current_subscription_dashboard_v1',{},anon,anon),'Anonymous dashboard');
  const a=await register('customer-a');
  const b=await register('customer-b');
  if(a.org===b.org)throw Error('Organizations collided');
  denied(await rpc('bind_current_tenant_session',{p_organization_id:b.org},a.token,anon),'Cross-tenant binding A to B');
  denied(await rpc('bind_current_tenant_session',{p_organization_id:a.org},b.token,anon),'Cross-tenant binding B to A');
  for(const user of [a,b]){
    const state=good(await rpc('get_current_subscription_dashboard_v1',{},user.token,anon),'Dashboard after denied binding');
    if(state.state!=='pro_trial')throw Error('Tenant dashboard changed');
    denied(await rpc('commercial_list_manual_assignments_v1',{p_actor:randomUUID()},user.token,anon),'Customer operator endpoint');
  }
  console.log('R13 actual local Auth + PostgREST smoke PASS; browser/CAPTCHA/HTTPS callback and production acceptance remain unverified.');
}catch(error){
  // No response payloads, JWTs, credentials, emails or links in CI logs.
  console.error('R13 local Auth smoke failed:',error instanceof Error&&/^[A-Za-z0-9 .:+_()/-]{1,150}$/.test(error.message)?error.message:'unexpected assertion or service response');
  process.exitCode=1;
}
