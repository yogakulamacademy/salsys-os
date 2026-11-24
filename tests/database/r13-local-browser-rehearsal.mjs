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
const cronSecret=randomBytes(32).toString('hex');
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
  const containers=execFileSync('docker',['ps','--format','{{.Names}}'],{encoding:'utf8'}).trim().split('\n').filter(n=>/^supabase_db_[a-zA-Z0-9_-]+$/.test(n));
  check(containers.length===1,'Expected one local database');
  const sql=q=>execFileSync('docker',['exec',containers[0],'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-Atc',q],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const platform=sql("select id from public.organizations where slug='salsysos' and status='active'");
  check(/^[0-9a-f-]{36}$/.test(platform),'Local platform fixture missing');
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
      SALSYS_PUBLIC_SIGNUP_ENABLED:'true',SALSYS_SIGNUP_ADMISSION_MODE:'public',SALSYS_COMMERCIAL_ACCESS_ENABLED:'true',
      SALSYS_TRIAL_RECONCILIATION_ENABLED:'true',SALSYS_MANUAL_RECONCILIATION_ENABLED:'true',SALSYS_PLAN_ADMIN_ENABLED:'true',SALSYS_COMMERCIAL_PLATFORM_ORG_ID:platform,SALSYS_MANUAL_PILOT_ENABLED:'true',SALSYS_MANUAL_ACTIVATION_ENABLED:'true',SALSYS_PLAN_CHANGE_REQUESTS_ENABLED:'true',CRON_SECRET:cronSecret,SALSYS_SIGNUP_TURNSTILE_SITE_KEY:'local-negative-only',
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
  check(sql('select count(*) from public.signup_registration_intents')==='0','Missing CAPTCHA created an intent');
  console.log('B02 partial: actual browser server action rejects missing CAPTCHA without registration intent');
  phase='trusted PKCE signup fixture';
  const email='r13-browser-'+randomUUID()+'@example.com',password='Aa9!'+randomBytes(24).toString('hex'),intent=randomUUID();
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
  phase='B06 business form fields';
  await page.locator('input[name=business_name]').fill('Synthetic Browser Workspace');
  await page.locator('select[name=industry]').selectOption('professional_services');
  await page.locator('select[name=country_code]').selectOption('IN');
  await page.locator('select[name=timezone]').selectOption('Asia/Kolkata');
  phase='B06 submit business form';
  await page.getByRole('button',{name:'Save & continue'}).click();
  phase='B06 goals page after business submit';
  await page.getByRole('heading',{name:'What do you want SalsysOS to improve?'}).waitFor();
  phase='B06 select goal through visible card label';
  await page.locator('label').filter({has:page.locator('input[name=goals][value=lead_management]')}).click();
  check(await page.locator('input[name=goals][value=lead_management]').isChecked(),'Goal selection did not persist in form');
  phase='B06 submit goals form';
  await page.getByRole('button',{name:'Save priorities'}).click();
  phase='B06 website page after goals submit';
  await page.getByRole('heading',{name:'Connect your website to SalsysOS.'}).waitFor();
  phase='optional setup and finish';
  phase='B06 website skip';
  await page.getByRole('button',{name:'Skip for now',exact:true}).click();
  await page.waitForURL(u=>u.pathname.endsWith('/onboarding/channels'));
  phase='B06 channel skip';
  await page.getByRole('button',{name:'Skip for now',exact:true}).click();
  await page.waitForURL(u=>u.pathname.endsWith('/onboarding/team'));
  phase='B06 solo team skip';
  await page.getByRole('button',{name:/working solo for now/}).click();
  await page.waitForURL(u=>u.pathname.endsWith('/onboarding/finish'));
  phase='B06 complete onboarding action';
  await page.getByRole('button',{name:'Complete onboarding'}).click();
  await page.waitForURL(u=>u.pathname.endsWith('/onboarding/finish')&&u.searchParams.get('completed')==='1');
  await page.getByText('Workspace onboarding is complete.',{exact:true}).waitFor();
  phase='B06 persisted completion checks';
  check(sql("select count(*) from public.organization_onboarding o join public.signup_registration_intents i on i.organization_id=o.organization_id where i.id='"+intent+"' and o.status='completed' and o.completed_steps @> array['business','goals','finish']::text[] and not(o.completed_steps && array['website','channels','team']::text[])")==='1','Optional setup was incorrectly marked complete');
  console.log('B06: actual customer business/goals forms, optional setup skipped honestly, completion persisted');
  phase='actual subscription browser';
  await page.goto(origin+'/settings/subscription',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Subscription & Billing'}).waitFor();
  await page.getByRole('heading',{name:'Pro trial',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Subscription history'}).waitFor();
  await page.getByRole('heading',{name:'Active named users'}).waitFor();
  await page.getByText('Self-service paid upgrades are not yet available.',{exact:false}).waitFor();
  check(await page.getByRole('button',{name:/checkout|pay now/i}).count()===0,'Unexpected paid checkout');
  console.log('B07: real subscription UI shows trial, usage, history, no checkout');
  phase='customer operator route denial';
  const operatorUrl=origin+'/settings/commercial-plans/pilot';
  await page.goto(operatorUrl,{waitUntil:'domcontentloaded'});
  // Next.js can stream a rendered not-found boundary with HTTP 200.
  // Require actual access-denied UI or a known protected redirect instead
  // of treating an arbitrary status/redirect as evidence of authorization.
  phase='B08 actual access-denied boundary';
  const denied=page.getByRole('heading',{name:'This page isn’t available',exact:true});
  const privileged=page.getByRole('heading',{name:'Manual subscription approvals',exact:true});
  await Promise.race([
    denied.waitFor({state:'visible'}),
    privileged.waitFor({state:'visible'}),
    page.waitForURL(u=>u.origin===origin&&['/dashboard','/home','/login','/workspace'].includes(u.pathname))
  ]);
  check(!await privileged.isVisible(),'Customer operator UI exposed');
  check(await denied.isVisible()||['/dashboard','/home','/login','/workspace'].includes(new URL(page.url()).pathname),'Customer operator access denial not witnessed');
  check(sql('select count(*) from saas_governance.manual_pilot_organizations')==='0','Customer route changed pilot capacity');
  console.log('B08 partial: actual customer direct operator page denied without pilot mutation; customer RPC denial covered separately');
  phase='independent customer sign in';
  const loginContext=await browser.newContext({ignoreHTTPSErrors:true});
  await loginContext.route('**/*',route=>[origin,api,'http://localhost:54321','http://127.0.0.1:54321'].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
  const loginPage=await loginContext.newPage();
  loginPage.setDefaultTimeout(90000);
  const login=async(p,e,pw,next,label)=>{
    // Independent local Auth API preflight using the SAME auto-binding RPC as
    // signInAction. Tokens remain in memory; never log raw responses or errors.
    phase=label+' password grant';
    const authHeaders={apikey:anon,authorization:'Bearer '+anon,'content-type':'application/json'};
    const grant=await json(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:authHeaders,body:JSON.stringify({email:e,password:pw})});
    check(typeof grant.access_token==='string'&&grant.user?.email_confirmed_at,'Local confirmed password grant failed');
    phase=label+' automatic tenant binding';
    const bearer={...authHeaders,authorization:'Bearer '+grant.access_token};
    const bound=await json(api+'/rest/v1/rpc/bind_current_tenant_session_for_current_user',{method:'POST',headers:bearer,body:'{}'});
    check(/^[0-9a-f-]{36}$/.test(bound),'Automatic tenant binding missing');
    const workspace=await json(api+'/rest/v1/rpc/get_current_workspace_context_v1',{method:'POST',headers:bearer,body:'{}'});
    check((workspace.active_organization_id??workspace.organization_id)===bound,'Automatic binding context mismatch');
    console.log(label+': actual password grant and automatic tenant binding PASS');
    phase=label+' browser form';
    await p.goto(origin+'/login?next='+encodeURIComponent(next),{waitUntil:'domcontentloaded'});
    await p.locator('input[name=email]').fill(e);
    await p.locator('input[name=password]').fill(pw);
    check(await p.locator('input[name=next]').inputValue()===next,'Login destination lost');
    phase=label+' browser sign-in submission';
    await p.getByRole('button',{name:'Sign in',exact:true}).click();
    phase=label+' browser destination';
    try{
      await p.waitForURL(u=>u.origin===origin&&(
        u.pathname===next||u.pathname==='/login'&&u.searchParams.has('error')||
        ['/onboarding/security','/signup/onboarding','/onboarding','/workspace'].includes(u.pathname)
      ),{timeout:30000});
    }catch{
      // Report only a fixed classification; never log URLs, form values or response text.
      const u=new URL(p.url());
      const known=['/login','/dashboard','/home','/workspace','/signup/onboarding','/onboarding','/onboarding/security',next];
      console.log(label+' destination classification: '+(u.origin===origin&&known.includes(u.pathname)?u.pathname:'unexpected route'));
      throw Error('Expected browser destination not reached');
    }
    const u=new URL(p.url());
    if(u.pathname!==next){
      const error=u.searchParams.get('error')??'';
      const category=/Invalid email or password/.test(error)?'invalid credentials':
        /password must be changed/.test(error)?'password policy':
        /not assigned|multiple organizations/.test(error)?'membership':
        /establish your organization session/.test(error)?'tenant binding':
        /temporarily unavailable/.test(error)?'dependency unavailable':'other or no login error';
      const known=['/login','/workspace','/onboarding/security','/signup/onboarding','/onboarding'];
      console.log(label+' denied/redirected: '+(known.includes(u.pathname)?u.pathname:'unexpected route')+'; '+category);
      throw Error('Unexpected sign-in route');
    }
  };
  await login(loginPage,email,password,'/settings/subscription','B06 customer');
  await loginPage.getByRole('heading',{name:'Pro trial',exact:true}).waitFor();
  check(sql("select count(*) from public.signup_registration_intents where id='"+intent+"' and organization_id is not null")==='1','Sign-in duplicated workspace');
  console.log('B06: separate actual browser sign-in reaches subscription after completed onboarding');
  phase='interactive platform approver';
  const opEmail='r13-operator-'+randomUUID()+'@example.com',opPassword='Aa9!'+randomBytes(24).toString('hex');
  // The SQL-created publisher has no guaranteed Auth identity row. Use a new
  // Auth-created operator and transfer only the pilot-approval permission in
  // this disposable fixture, preserving original authorship/publication audit.
  phase='B09 create actual local Auth operator';
  const created=await json(api+'/auth/v1/admin/users',{method:'POST',
    headers:{apikey:service,authorization:'Bearer '+service,'content-type':'application/json'},
    body:JSON.stringify({email:opEmail,password:opPassword,email_confirm:true})});
  const operatorId=(created.user||created).id;
  check(/^[0-9a-f-]{36}$/.test(operatorId),'Local Auth-created operator missing');
  phase='B09 bind synthetic operator governance';
  sql("begin; insert into public.profiles(id,full_name,role,active) values ('"+operatorId+"','Synthetic browser operator','admin',true) on conflict(id) do update set active=true,role='admin'; insert into public.organization_members(organization_id,user_id,role,active) values ('"+platform+"','"+operatorId+"','owner',true) on conflict(organization_id,user_id) do update set role='owner',active=true; update saas_governance.operators set may_approve_pilot=false where active and may_approve_pilot; insert into saas_governance.operators(user_id,platform_organization_id,may_author,may_review,may_publish,may_approve_pilot,active) values ('"+operatorId+"','"+platform+"',false,false,true,true,true); commit;");
  check(sql('select user_id from saas_governance.operators where active and may_approve_pilot')===operatorId,'Expected single local pilot approver');
  const operatorContext=await browser.newContext({ignoreHTTPSErrors:true});
  await operatorContext.route('**/*',route=>[origin,api,'http://localhost:54321','http://127.0.0.1:54321'].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
  const operatorPage=await operatorContext.newPage();
  operatorPage.setDefaultTimeout(90000);
  await login(operatorPage,opEmail,opPassword,'/settings/commercial-plans/pilot','B09 approver');
  await operatorPage.getByRole('heading',{name:'Manual subscription approvals'}).waitFor();
  const customerCard=operatorPage.locator('article').filter({has:operatorPage.getByRole('heading',{name:'Synthetic Browser Workspace',exact:true})});
  await customerCard.locator('input[name=reason]').fill('Synthetic local browser enrollment');
  await customerCard.getByRole('button',{name:'Enable plan requests'}).click();
  await operatorPage.waitForURL(u=>u.pathname==='/settings/commercial-plans/pilot'&&u.searchParams.get('result')==='enrolled');
  await operatorPage.getByRole('status').filter({hasText:'Plan requests enabled'}).waitFor();
  check(sql('select count(*) from saas_governance.manual_pilot_organizations')==='0','Interactive enrollment consumed pilot capacity');
  await loginPage.reload({waitUntil:'domcontentloaded'});
  await loginPage.getByRole('heading',{name:'Pro trial',exact:true}).waitFor();
  await loginPage.getByRole('link',{name:'Request plan change or renewal'}).waitFor();
  console.log('B09: actual local platform approver sign-in and enrollment server action, customer trial and pilot capacity unchanged');
  // Retain the isolated operator/customer sessions for post-expiry lifecycle acceptance.


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
  phase='expiry endpoint synthetic fixtures';
  const trialOrg=sql("select organization_id from public.signup_registration_intents where id='"+intent+"'");
  check(/^[0-9a-f-]{36}$/.test(trialOrg),'Trial fixture missing');
  // Second real local Auth user. No external email or CAPTCHA provider.
  const email2='r13-expiry-'+randomUUID()+'@example.com',password2=randomBytes(24).toString('hex'),intent2=randomUUID();
  check(await rpc('reserve_signup_intent_v1',{p_id:intent2,p_email:email2,p_full_name:'Synthetic Expiry',p_business_name:'Synthetic Expiry Workspace'})===true,'Second intent reservation failed');
  const authHeaders={apikey:anon,authorization:'Bearer '+anon,'content-type':'application/json'};
  const signup2=await json(api+'/auth/v1/signup',{method:'POST',headers:authHeaders,body:JSON.stringify({email:email2,password:password2,data:{signup_intent_id:intent2}})});
  const user2=signup2.user||signup2;
  check(user2.id&&!user2.email_confirmed_at&&!signup2.access_token,'Second local user not unconfirmed');
  check(await rpc('accept_signup_intent_v1',{p_id:intent2,p_user_id:user2.id})===true,'Second intent acceptance failed');
  // Local default signup mail may use site_url instead of explicit redirect.
  // Confirm via the controlled local mailbox, using only its token in memory.
  let token2=null;
  for(let i=0;i<45&&!token2;i++){
    const list=await json(mail+'/api/v1/messages');
    for(const m of list.messages||[]){
      if(!m.To?.some(x=>x.Address===email2))continue;
      const msg=await json(mail+'/api/v1/message/'+encodeURIComponent(m.ID));
      const raw=JSON.stringify(msg).replaceAll('&amp;','&').replaceAll('=3D','=').replace(/=\\r?\\n/g,'');
      const match=raw.match(/[?&]token=([^&\s"'<>\\]+)/);
      if(match)token2=decodeURIComponent(match[1]);
    }
    if(!token2)await delay(1000);
  }
  check(token2,'Second local verification token missing');
  const verified2=await json(api+'/auth/v1/verify',{method:'POST',headers:authHeaders,body:JSON.stringify({type:'signup',token_hash:token2})});
  check(verified2.user?.id===user2.id&&verified2.user?.email_confirmed_at,'Second user not verified');
  const manualOrg=await rpc('provision_verified_signup_v1',{p_user_id:user2.id});
  check(/^[0-9a-f-]{36}$/.test(manualOrg)&&manualOrg!==trialOrg,'Manual fixture organization missing');
  const actor=sql('select user_id from saas_governance.operators where active and may_approve_pilot');
  check(/^[0-9a-f-]{36}$/.test(actor),'Synthetic approver missing');
  check(await rpc('commercial_enable_manual_pilot_requests_v1',{p_actor:actor,p_org:manualOrg,p_reason:'Synthetic scheduler enrollment'})===true,'Manual enrollment failed');
  const queue=await rpc('commercial_list_manual_assignments_v1',{p_actor:actor});
  const target=queue.offers.find(x=>x.code==='growth'),current=queue.organizations.find(x=>x.id===manualOrg);
  check(target&&current,'Manual expiry assignment missing');
  const end=Date.now()+20000;
  const contract=await rpc('commercial_assign_manual_plan_v1',{p_actor:actor,p_org:manualOrg,p_expected:current.revision,p_plan:target.id,p_version:target.version,p_digest:target.digest,p_key:randomUUID(),p_mode:'complimentary',p_reference:null,p_reason:'Synthetic scheduler short term contract',p_ends_at:new Date(end).toISOString()});
  check(/^[0-9a-f-]{36}$/.test(contract),'Manual contract not created');
  // Advance only disposable trial fixture timestamps, preserving trial duration.
  // Manual expiry occurs naturally; immutable contract records are never edited.
  sql("begin; update public.signup_registration_intents set trial_ends_at=now()-interval '1 minute' where organization_id='"+trialOrg+"'; update public.saas_organization_subscriptions set trial_started_at=now()-interval '720 hours 1 minute',trial_ends_at=now()-interval '1 minute' where organization_id='"+trialOrg+"'; commit;");
  const effective=org=>sql("select public.resolve_signup_plan_internal_v1('"+org+"')->>'state'");
  // Parenthesize concatenation operands in SQL (JSON operator precedence).
  const state=org=>sql("select status||':'||(metadata->>'origin') from public.saas_organization_subscriptions where organization_id='"+org+"'");
  check(effective(trialOrg)==='free_pending_reconciliation'&&state(trialOrg)==='trialing:verified_self_signup','Trial fallback before scheduler missing');
  await delay(Math.max(0,end-Date.now()+1500));
  check(effective(manualOrg)==='free_pending_reconciliation'&&state(manualOrg)==='active:manual_pilot_contract','Manual fallback before scheduler missing');
  const before=sql("select count(*) from public.organization_members where organization_id in ('"+trialOrg+"','"+manualOrg+"')");
  const endpoint=origin+'/api/commercial/trial-expiry';
  phase='actual protected expiry HTTP route';
  const client=context.request;
  const deny=await client.get(endpoint,{timeout:90000,maxRedirects:0});
  check(deny.status()===401,'Missing scheduler bearer accepted');
  const wrong=await client.get(endpoint,{headers:{authorization:'Bearer incorrect-local-only'},timeout:90000,maxRedirects:0});
  check(wrong.status()===401,'Invalid scheduler bearer accepted');
  check(effective(trialOrg)==='free_pending_reconciliation'&&effective(manualOrg)==='free_pending_reconciliation','Unauthorized scheduler modified state');
  const call=()=>client.get(endpoint,{headers:{authorization:'Bearer '+cronSecret},timeout:90000,maxRedirects:0});
  const first=await call(),summary=await first.json();
  check(first.status()===200&&summary.ok===true&&summary.checked===2&&summary.converted===2&&summary.failed===0,'Expiry HTTP reconciliation failed');
  for(const org of [trialOrg,manualOrg])check(effective(org)==='free'&&state(org)==='active:verified_self_signup_free_fallback','Canonical Free state missing');
  for(const org of [trialOrg,manualOrg]){
    check(await rpc('signup_integration_allowed_v1',{p_organization_id:org,p_code:'instagram'})===true,'Free lost Instagram after expiry');
    check(await rpc('signup_automation_allowed_v1',{p_organization_id:org,p_channel:'instagram'})===false,'Free unexpectedly enabled Instagram automation');
  }
  console.log('Owner policy: Instagram retained on Free after expiry; automation still denied');
  const second=await call(),repeat=await second.json();
  check(second.status()===200&&repeat.ok===true&&repeat.checked===0&&repeat.converted===0&&repeat.failed===0,'Expiry HTTP repeat not idempotent');
  check(sql("select count(*) from public.organization_members where organization_id in ('"+trialOrg+"','"+manualOrg+"')")===before,'Expiry changed membership count');
  check(sql("select count(*) from saas_governance.manual_subscription_contracts where organization_id='"+manualOrg+"'")==='1','Expiry removed immutable contract');
  console.log('B12 local HTTP: missing/invalid bearer denied, effective Free before reconciliation, both trial and manual converted, repeat no-op and member/contract retention PASS. Hosted scheduling not tested.');
  phase='B10 actual customer request and platform override';
  // Trial fixture is now Free after B12; it remains enrolled for requests.
  // Keep the separately expired manual tenant as the negative control.
  const otherSnapshot=()=>sql("select jsonb_build_object('subscription',to_jsonb(s),'usage',to_jsonb(u),'history',(select count(*) from public.saas_subscription_events e where e.organization_id=s.organization_id),'requests',(select count(*) from saas_governance.subscription_change_requests r where r.organization_id=s.organization_id))::text from public.saas_organization_subscriptions s join public.signup_usage_counters u on u.organization_id=s.organization_id where s.organization_id='"+manualOrg+"'");
  const otherBefore=otherSnapshot();
  check(otherBefore.length>0,'Other tenant snapshot unavailable');
  await loginPage.goto(origin+'/settings/subscription/changes',{waitUntil:'domcontentloaded'});
  await loginPage.getByRole('heading',{name:'Plan change requests'}).waitFor();
  const basicCard=loginPage.locator('article').filter({has:loginPage.getByRole('heading',{name:/Synthetic basic.*version/i})});
  await basicCard.locator('input[name=confirm]').check();
  await basicCard.getByRole('button',{name:'Request plan change'}).click();
  await loginPage.waitForURL(u=>u.pathname==='/settings/subscription/changes'&&u.searchParams.get('result')==='requested');
  await loginPage.getByRole('status').filter({hasText:'Request recorded'}).waitFor();
  check(effective(trialOrg)==='free','Customer request changed current plan');
  const requestId=sql("select r.id from saas_governance.subscription_change_requests r join public.saas_plans p on p.id=r.target_plan_id where r.organization_id='"+trialOrg+"' and r.request_origin='customer' and r.status='requested' and p.code='basic'");
  check(/^[0-9a-f-]{36}$/.test(requestId),'Customer Basic request not persisted');
  const assignFromBrowser=async(code,mode,days)=>{
    await operatorPage.goto(operatorUrl,{waitUntil:'domcontentloaded'});
    const card=operatorPage.locator('article').filter({has:operatorPage.getByRole('heading',{name:'Synthetic Browser Workspace',exact:true})});
    await card.locator('select[name=offer]').selectOption({label:await card.locator('select[name=offer] option').filter({hasText:new RegExp('^'+code.toUpperCase()+' ·')}).textContent()});
    await card.locator('select[name=mode]').selectOption(mode);
    await card.locator('input[name=ends_at]').fill(days===null?'':new Date(Date.now()+days*86400000).toISOString().slice(0,16));
    await card.locator('input[name=reference]').fill(mode==='offline_confirmation'?'SYNTHETIC-LOCAL-ONLY':'');
    await card.locator('textarea[name=reason]').fill('Synthetic browser lifecycle acceptance');
    await card.locator('input[name=confirmation]').fill('ASSIGN PLAN');
    await card.getByRole('button',{name:'Assign and activate selected plan'}).click();
    await operatorPage.waitForURL(u=>u.pathname==='/settings/commercial-plans/pilot'&&u.searchParams.get('result')==='activated');
    await operatorPage.getByRole('status').filter({hasText:'Subscription activated'}).waitFor();
  };
  await operatorPage.goto(operatorUrl,{waitUntil:'domcontentloaded'});
  await operatorPage.locator('article').filter({has:operatorPage.getByRole('heading',{name:'Synthetic Browser Workspace',exact:true})}).getByText('basic',{exact:true}).waitFor();
  await assignFromBrowser('growth','complimentary',10);
  await loginPage.goto(origin+'/settings/subscription',{waitUntil:'domcontentloaded'});
  await loginPage.getByRole('heading',{name:'Growth',exact:true}).waitFor();
  check(sql("select status from saas_governance.subscription_change_requests where id='"+requestId+"'")==='superseded','Original request not superseded');
  check(sql("select count(*) from saas_governance.subscription_change_requests r join public.saas_plans p on p.id=r.target_plan_id where r.organization_id='"+trialOrg+"' and r.request_origin='admin' and r.status='activated' and p.code='growth'")==='1','Operator Growth assignment not audited');
  console.log('B10: actual browser customer Basic request and platform Growth override preserved original request PASS');
  phase='B11 actual renewal and permanent Free downgrade';
  const accessEnd=()=>sql("select current_period_ends_at::text from public.saas_organization_subscriptions where organization_id='"+trialOrg+"'");
  const priorEnd=accessEnd();
  await assignFromBrowser('growth','offline_confirmation',20);
  check(Date.parse(accessEnd())>Date.parse(priorEnd),'Renewal did not extend access');
  // Synthetic CRM data is created only in this disposable database. The actual
  // quota trigger is active. Two records exceed the Free fixture limit of one.
  const lead1=randomUUID(),lead2=randomUUID();
  sql("insert into public.leads(id,organization_id,first_name,first_touch_source,current_stage,status) values ('"+lead1+"','"+trialOrg+"','Synthetic retained A','direct','new','open'),('"+lead2+"','"+trialOrg+"','Synthetic retained B','direct','new','open');");
  await assignFromBrowser('free','free',null);
  await loginPage.goto(origin+'/settings/subscription',{waitUntil:'domcontentloaded'});
  await loginPage.getByRole('heading',{name:'Free',exact:true}).waitFor();
  await loginPage.getByText('Over limit. Existing records remain; additional usage is restricted.',{exact:true}).waitFor();
  check(sql("select count(*) from public.leads where organization_id='"+trialOrg+"' and id in ('"+lead1+"','"+lead2+"')")==='2','Downgrade removed CRM records');
  check(sql("select count(*) from saas_governance.manual_pilot_organizations where organization_id='"+trialOrg+"'")==='1','Customer consumed extra pilot slots');
  check(sql("select count(*) from public.saas_organization_subscriptions s join public.saas_plans p on p.id=s.plan_id where s.organization_id='"+trialOrg+"' and s.status='active' and p.code='free' and s.current_period_ends_at is null")==='1','Permanent Free contract missing');
  check(otherSnapshot()===otherBefore,'Unrelated managed tenant subscription or history changed');
  console.log('B11: interactive renewal, permanent Free, retained CRM records, one distinct customer slot and unrelated tenant unchanged PASS');
  await loginPage.goto(origin+'/settings/subscription/changes',{waitUntil:'domcontentloaded'});
  await loginPage.getByText(/basic · version .*Your request/i).waitFor();
  const original=loginPage.locator('article').filter({hasText:/basic · version .*Your request/i});
  await original.getByText(/superseded/).waitFor();
  await operatorContext.close();
  await loginContext.close();
  console.log('R13 local browser/HTTPS/PKCE, expiry and interactive plan lifecycle smoke PASS. Valid CAPTCHA, full two-browser CRM isolation and pause acceptance remain unverified.');
}
try{await main()}catch(e){console.error('R13 local browser failed at '+phase);process.exitCode=1}
finally{if(browser)await browser.close();if(child)child.kill('SIGTERM');rmSync(temporary,{recursive:true,force:true})}
