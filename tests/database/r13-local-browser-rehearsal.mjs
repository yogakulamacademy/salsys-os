// Real browser/PKCE callback on a disposable CI stack. No valid CAPTCHA
// is fabricated: the positive registration intent is prepared via trusted RPC.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createServerClient } from '@supabase/ssr';
import { chromium } from '@playwright/test';

if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||
   process.env.SALSYS_R13_BROWSER_TEST!=='1')throw Error('Disposable CI runner required');
const status=execFileSync('supabase',['status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const read=(n)=>status.match(new RegExp('^'+n+'="?([^"\\r\\n]+)"?$','m'))?.[1];
const check=(condition,label)=>{if(!condition)throw Error(label)};
const local=(s,port)=>{
  const u=new URL(s||'http://127.0.0.1:'+port);
  check(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)&&u.port===String(port)&&
    u.pathname==='/'&&!u.username&&!u.password&&!u.search&&!u.hash,'Unexpected local service origin');
  return u.origin;
};
const api=local(read('API_URL'),54321),mail=local(read('MAILPIT_URL')||read('INBUCKET_URL'),54324);
const anon=read('ANON_KEY'),service=read('SERVICE_ROLE_KEY');
check(anon&&service&&anon!==service,'Local Auth keys unavailable');
const origin='https://localhost:3000';
const callback=origin+'/signup/verify';
const temporary=mkdtempSync(join(tmpdir(),'r13-browser-'));
let child,browser;
let phase='setup';
async function json(url,options={}){
  const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('Local HTTP request failed: '+r.status);
  return r.json();
}
const rpc=(name,args={})=>json(api+'/rest/v1/rpc/'+name,{method:'POST',
  headers:{apikey:service,authorization:'Bearer '+service,'content-type':'application/json'},body:JSON.stringify(args)});
function emailLink(data){
  const s=(typeof data==='string'?data:JSON.stringify(data)).replaceAll('&amp;','&').replaceAll('=3D','=').replace(/=\r?\n/g,'');
  for(const match of s.matchAll(/https?:\/\/[^\s"'<>\\]+/g)){
    try{
      const u=new URL(match[0]);
      if(['http://localhost:54321','http://127.0.0.1:54321'].includes(u.origin)&&
        u.pathname==='/auth/v1/verify'&&u.searchParams.get('type')==='signup'&&
        u.searchParams.get('redirect_to')===callback&&u.searchParams.get('token'))return u.href;
    }catch{}
  }
  return null;
}
async function captured(email){
  for(let i=0;i<45;i++){
    try{
      const list=await json(mail+'/api/v1/messages');
      if(Array.isArray(list.messages))for(const m of list.messages){
        if(!m.To?.some(x=>x.Address===email))continue;
        const link=emailLink(await json(mail+'/api/v1/message/'+encodeURIComponent(m.ID)));
        if(link)return link;
      }
    }catch{
      try{
        const root=mail+'/api/v1/mailbox/'+encodeURIComponent(email.split('@')[0]);
        for(const m of await json(root)){
          const link=emailLink(await json(root+'/'+encodeURIComponent(m.id)));
          if(link)return link;
        }
      }catch{}
    }
    await delay(1000);
  }
  throw Error('Controlled email with exact callback not captured');
}
async function main(){
  // Local self-signed certificate only. Never change TLS verification globally.
  const key=join(temporary,'key.pem'),cert=join(temporary,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost',
    '-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',key,'-out',cert],{stdio:'ignore'});
  // Do not inherit cloud credentials or deploy-related environment.
  child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3000',
    '--experimental-https','--experimental-https-key',key,'--experimental-https-cert',cert],{
    env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',
      NEXT_PUBLIC_USE_MOCK_DATA:'false',NEXT_PUBLIC_SUPABASE_URL:api,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,
      SUPABASE_SERVICE_ROLE_KEY:service,SALSYSOS_APP_URL:origin,
      SALSYS_PUBLIC_SIGNUP_ENABLED:'true',SALSYS_COMMERCIAL_ACCESS_ENABLED:'true',
      SALSYS_TRIAL_RECONCILIATION_ENABLED:'true',SALSYS_SIGNUP_TURNSTILE_SITE_KEY:'local-negative-only',
      SALSYS_SIGNUP_TURNSTILE_SECRET:'local-negative-only'},stdio:'ignore'});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({ignoreHTTPSErrors:true});
  // Only local app/Auth traffic. Do not send test data to any provider.
  await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    return [origin,api,'http://localhost:54321','http://127.0.0.1:54321'].includes(u.origin)?route.continue():route.abort();
  });
  const page=await context.newPage();
  page.setDefaultTimeout(90000);
  phase='app startup';
  for(let i=0;i<60;i++){
    if(child.exitCode!==null)throw Error('Local app exited');
    try{await page.goto(origin+'/signup',{waitUntil:'domcontentloaded',timeout:10000});break;}catch{if(i===59)throw Error('Local HTTPS app unavailable');await delay(1000);}
  }
  phase='anonymous protected onboarding';
  await page.goto(origin+'/signup/onboarding',{waitUntil:'domcontentloaded'});
  await page.waitForURL(u=>u.origin===origin&&u.pathname==='/login');
  console.log('B06 partial: unauthenticated browser denied protected onboarding');
  phase='missing CAPTCHA';
  await page.goto(origin+'/signup',{waitUntil:'domcontentloaded'});
  await page.locator('input[name=full_name]').fill('Synthetic Browser');
  await page.locator('input[name=business_name]').fill('Synthetic Browser Negative');
  await page.locator('input[name=email]').fill('r13-negative-'+randomUUID()+'@example.com');
  await page.locator('input[name=password]').fill(randomBytes(24).toString('hex'));
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Security verification failed'}).waitFor();
  const containers=execFileSync('docker',['ps','--format','{{.Names}}'],{encoding:'utf8'}).trim().split('\n').filter(n=>/^supabase_db_[a-zA-Z0-9_-]+$/.test(n));
  check(containers.length===1,'Expected one local database');
  const sql=q=>execFileSync('docker',['exec',containers[0],'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-Atc',q],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  check(sql('select count(*) from public.signup_registration_intents')==='0','Missing CAPTCHA created an intent');
  console.log('B02 partial: actual browser server action rejects missing CAPTCHA without registration intent');
  phase='trusted PKCE signup fixture';
  const email='r13-browser-'+randomUUID()+'@example.com',password=randomBytes(24).toString('hex'),intent=randomUUID();
  check(await rpc('reserve_signup_intent_v1',{p_id:intent,p_email:email,p_full_name:'Synthetic Browser',p_business_name:'Synthetic Browser Workspace'})===true,'Intent reservation failed');
  const jar=new Map();
  const ssr=createServerClient(api,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),
    setAll:items=>items.forEach(({name,value})=>value?jar.set(name,value):jar.delete(name))}});
  const {data,error}=await ssr.auth.signUp({email,password,options:{emailRedirectTo:callback,data:{signup_intent_id:intent}}});
  check(!error&&data.user?.id&&!data.session&&!data.user.email_confirmed_at,'Real PKCE signup not unconfirmed');
  check(await rpc('accept_signup_intent_v1',{p_id:intent,p_user_id:data.user.id})===true,'Intent acceptance failed');
  check([...jar.keys()].some(n=>n.includes('code-verifier')),'PKCE verifier cookie missing');
  check(sql('select count(*) from public.signup_registration_intents where organization_id is not null')==='0','Premature workspace');
  await context.addCookies([...jar].map(([name,value])=>({name,value,url:origin,httpOnly:true,secure:true,sameSite:'Lax'})));
  phase='real verification link and callback';
  const link=await captured(email);
  await page.goto(link,{waitUntil:'domcontentloaded'});
  await page.waitForURL(u=>u.origin===origin&&u.pathname==='/signup/onboarding');
  await page.getByRole('heading',{name:'Tell us about your business.'}).waitFor();
  check(sql('select count(*) from public.signup_registration_intents where organization_id is not null')==='1','Expected one verified workspace');
  console.log('B04: local captured verification link, real PKCE code exchange, exact HTTPS callback and protected onboarding PASS');
  phase='required onboarding and customer admin protection';
  await page.goto(origin+'/settings/subscription',{waitUntil:'domcontentloaded'});
  await page.waitForURL(u=>u.origin===origin&&u.pathname==='/signup/onboarding');
  console.log('B06 partial: verified browser is routed to required onboarding');
  // A replay/missing-code test uses an independent browser with no cookies.
  const fresh=await browser.newContext({ignoreHTTPSErrors:true});
  await fresh.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const replay=await fresh.newPage();
  phase='invalid callback';
  await replay.goto(callback,{waitUntil:'domcontentloaded'});
  await replay.waitForURL(u=>u.origin===origin&&u.pathname==='/signup'&&u.searchParams.get('mode')==='resend');
  check(sql('select count(*) from public.signup_registration_intents where organization_id is not null')==='1','Invalid callback changed workspace count');
  console.log('B05 partial: missing code denied without duplicate workspace');
  await fresh.close();
  console.log('R13 actual local browser/HTTPS/PKCE smoke PASS. Valid CAPTCHA signup, full onboarding and operator browser remain unverified.');
}
try{await main()}catch(e){console.error('R13 local browser failed at '+phase);process.exitCode=1}
finally{if(browser)await browser.close();if(child)child.kill('SIGTERM');rmSync(temporary,{recursive:true,force:true})}
