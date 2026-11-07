import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
function transpile(filename, imports) {
  const output = {};
  const compiled = ts.transpileModule(readFileSync(resolve(filename),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText;
  new Function('require','exports','process',compiled)(name=>{
    if(!(name in imports))throw new Error('Unexpected import '+name);
    return imports[name];
  },output,process);
  return output;
}
const pilot=transpile('lib/knowledge-discovery/pilot-gate.ts',{});
const policy=transpile('lib/knowledge-discovery/url-policy.ts',{
  'node:net':require('node:net'),
  'node:dns/promises':require('node:dns/promises'),
});
const bearer=transpile('lib/security/machine-bearer-auth.ts',{
  'server-only':{},
  'node:crypto':require('node:crypto'),
});
const NextResponse={json:(body,init={})=>({body,status:init.status??200,headers:init.headers??{}})};
let claim=null;
let adminCalls=0;
let processCalls=0;
let proofVerified=true;
let consentGranted=true;
let claimResponseOverride;
let claimError=null;
let verificationReads=0;
let processOutcome={ok:true,status:'processed'};
const api=transpile('app/api/knowledge/discovery/worker/route.ts',{
  'next/server':{NextResponse},
  '@/lib/supabase/admin':{createAdminClient:()=>{
    adminCalls++;
    return {rpc:async name=>{
      assert.equal(name,'claim_knowledge_discovery_job_v1');
      return {
        data:claimResponseOverride===undefined ? (claim?[claim]:[]) : claimResponseOverride,
        error:claimError,
      };
    },from: table=>{
      verificationReads++;
      assert.ok(['knowledge_discovery_domain_verifications',
        'knowledge_discovery_site_consents'].includes(table));
      if(table==='knowledge_discovery_site_consents')return {
        select:()=>({eq:()=>({eq:()=>({
          maybeSingle:async()=>({data:consentGranted?{
            organization_id:claim?.organization_id,
            hostname:'fixture.example.com',
            purpose:'website_discovery_review_only',status:'granted',
            policy_version:'synthetic-v1',
            granted_by:'20000000-0000-4000-8000-000000000001',
            granted_at:new Date(Date.now()-60_000).toISOString(),
            valid_until:new Date(Date.now()+60_000).toISOString(),
            withdrawn_at:null,
          }:null,error:null}),
        })})}),
      };
      return {select:()=>({eq:()=>({eq:()=>({
        maybeSingle:async()=>({data:proofVerified
          ? {verified_at:new Date(Date.now()-1000).toISOString(),
             verified_until:new Date(Date.now()+60_000).toISOString()}
          : null,error:null}),
      })})})};
    }};
  }},
  '@/lib/security/machine-bearer-auth':bearer,
  '@/lib/knowledge-discovery/runner':{processOneDiscoveryPage:async()=>{
    processCalls++;
    return processOutcome;
  }},
  '@/lib/knowledge-discovery/url-policy':policy,
  '@/lib/knowledge-discovery/pilot-gate':pilot,
  '@/lib/knowledge-discovery/site-consent':transpile('lib/knowledge-discovery/site-consent.ts',{}),
  '@/lib/knowledge-discovery/domain-verification':transpile('lib/knowledge-discovery/domain-verification.ts',{
    'node:crypto':require('node:crypto'),
  }),
});
const vars=['KNOWLEDGE_DISCOVERY_PILOT_ENABLED','KNOWLEDGE_DISCOVERY_PAUSED',
  'KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS','KNOWLEDGE_DISCOVERY_RUNNER_SECRET','CRON_SECRET'];
const before=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
test.after(()=>{for(const k of vars)before[k]===undefined?delete process.env[k]:process.env[k]=before[k];});
function reset() {
  for(const k of vars)delete process.env[k];
  adminCalls=0;processCalls=0;proofVerified=true;consentGranted=true;
  claimResponseOverride=undefined;claimError=null;verificationReads=0;
  processOutcome={ok:true,status:'processed'};
  claim={job_id:'10000000-0000-4000-8000-000000000001',
    organization_id:'20000000-0000-4000-8000-000000000001',
    seed_url:'https://fixture.example.com/',max_pages:10,
    lease_token:'30000000-0000-4000-8000-000000000001'};
}
function enable() {
  process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED='true';
  process.env.KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS='fixture.example.com';
  process.env.KNOWLEDGE_DISCOVERY_RUNNER_SECRET='local-synthetic-secret';
}
function request(secret=null) {
  return {headers:{get:name=>name.toLowerCase()==='authorization'&&secret?'Bearer '+secret:null}};
}
test('default-off worker rejects without claiming any job',async()=>{
  reset();
  const result=await api.POST(request());
  assert.equal(result.status,503);assert.equal(adminCalls,0);assert.equal(processCalls,0);
});
test('enabled worker requires configured secret and correct bearer',async()=>{
  reset();enable();
  delete process.env.KNOWLEDGE_DISCOVERY_RUNNER_SECRET;
  assert.equal((await api.POST(request())).status,503);
  assert.equal(adminCalls,0);
  process.env.KNOWLEDGE_DISCOVERY_RUNNER_SECRET='local-synthetic-secret';
  assert.equal((await api.POST(request('incorrect'))).status,401);
  assert.equal(adminCalls,0);
});
test('shared CRON_SECRET alone cannot authorize or configure the Knowledge discovery worker',async()=>{
  reset();enable();
  process.env.CRON_SECRET='shared-cron-secret';
  delete process.env.KNOWLEDGE_DISCOVERY_RUNNER_SECRET;
  const response=await api.POST(request('shared-cron-secret'));
  assert.equal(response.status,503);
  assert.match(response.body.error,/not configured/i);
  assert.equal(adminCalls,0);
  assert.equal(processCalls,0);
});

test('shared CRON_SECRET cannot substitute for dedicated discovery runner token',async()=>{
  reset();enable();
  process.env.CRON_SECRET='shared-cron-secret';
  const result=await api.POST(request('shared-cron-secret'));
  assert.equal(result.status,401);
  assert.equal(adminCalls,0);
  assert.equal(processCalls,0);
  const allowed=await api.POST(request('local-synthetic-secret'));
  assert.equal(allowed.status,200);
  assert.equal(allowed.body.state,'processed');
  assert.equal(adminCalls,1);
  assert.equal(processCalls,1);
});

test('GET is always read-only denial, including with correct dedicated token',async()=>{
  reset();enable();
  for(const token of ['local-synthetic-secret',null,'shared-cron-secret']){
    const response=await api.GET(request(token));
    assert.equal(response.status,405);
    assert.equal(response.headers.Allow,'POST');
    assert.equal(response.headers['Cache-Control'],'no-store');
    assert.equal(response.body.ok,false);
    assert.equal(adminCalls,0);
    assert.equal(processCalls,0);
  }
  process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED='false';
  assert.equal((await api.GET(request('local-synthetic-secret'))).status,405);
  assert.equal(adminCalls,0);
});

test('malformed or ambiguous claimed leases fail closed before verification or processing',async()=>{
  const good={
    job_id:'10000000-0000-4000-8000-000000000001',
    organization_id:'20000000-0000-4000-8000-000000000001',
    seed_url:'https://fixture.example.com/',
    max_pages:10,
    lease_token:'30000000-0000-4000-8000-000000000001',
  };
  const invalid=[
    null,{},'no-claim',{error:'not-a-table'},
    [good,good],[null],[{}],
    ...[
      {job_id:null},{job_id:'not-a-uuid'},
      {organization_id:null},{organization_id:'other-tenant'},
      {lease_token:null},{lease_token:'invalid'},
      {seed_url:null},{seed_url:''},{seed_url:'x'.repeat(2049)},
      {max_pages:null},{max_pages:0},{max_pages:51},{max_pages:1.25},
    ].map(change=>[{...good,...change}]),
  ];
  for(const data of invalid){
    reset();enable();
    claimResponseOverride=data;
    const response=await api.POST(request('local-synthetic-secret'));
    assert.equal(response.status,503,JSON.stringify(data).slice(0,100));
    assert.equal(response.body.ok,false);
    assert.equal(response.body.error,'Discovery claim unavailable');
    assert.equal(adminCalls,1);
    assert.equal(verificationReads,0);
    assert.equal(processCalls,0);
    assert.ok(!JSON.stringify(response.body).includes(good.lease_token));
  }
});

test('RPC failure cannot be represented as an idle queue',async()=>{
  reset();enable();
  claimError={message:'synthetic database claim failure'};
  const response=await api.POST(request('local-synthetic-secret'));
  assert.equal(response.status,503);
  assert.equal(response.body.error,'Discovery service unavailable');
  assert.equal(processCalls,0);
  assert.equal(verificationReads,0);
});

test('unsafe seed URL in an otherwise structured claim never invokes a network tick',async()=>{
  reset();enable();
  claim.seed_url='http://127.0.0.1/admin';
  const response=await api.POST(request('local-synthetic-secret'));
  assert.equal(response.status,500);
  assert.equal(processCalls,0);
  assert.equal(verificationReads,0);
});

test('pilot pause prohibits claims even with valid bearer',async()=>{
  reset();enable();
  process.env.KNOWLEDGE_DISCOVERY_PAUSED='true';
  assert.equal((await api.POST(request('local-synthetic-secret'))).status,503);
  assert.equal(adminCalls,0);assert.equal(processCalls,0);
});
test('allowlist removal blocks an already queued job before its fetcher executes',async()=>{
  reset();enable();
  claim.seed_url='https://unapproved.example.net/';
  const result=await api.POST(request('local-synthetic-secret'));
  assert.equal(result.status,403);
  assert.equal(adminCalls,1);
  assert.equal(processCalls,0);
});
test('allowed queued job invokes one worker tick and idle queue does not process',async()=>{
  reset();enable();
  let result=await api.POST(request('local-synthetic-secret'));
  assert.equal(result.status,200);
  assert.equal(result.body.state,'processed');
  assert.equal(processCalls,1);
  claim=null;
  result=await api.POST(request('local-synthetic-secret'));
  assert.equal(result.status,200);
  assert.equal(result.body.state,'idle');
  assert.equal(processCalls,1);
});


test('a previously queued job is refused if website ownership verification expires',async()=>{
  reset();enable();proofVerified=false;
  const result=await api.POST(request('local-synthetic-secret'));
  assert.equal(result.status,403);
  assert.match(result.body.error,/ownership proof/i);
  assert.equal(processCalls,0,'No outbound worker tick may run');
});


test('SQL-denied or malformed processing outcome never looks successfully processed',async()=>{
  const rejected=[
    {ok:false,reason:'inactive_or_stale_lease'},
    {ok:false,reason:'consent_not_active'},
    {ok:false,reason:'page_not_pending'},
    {ok:false,reason:'private-source-token'},
    null,
    undefined,
    {},
  ];
  for(const outcome of rejected){
    reset();enable();
    processOutcome=outcome;
    const response=await api.POST(request('local-synthetic-secret'));
    assert.equal(response.status,503,JSON.stringify(outcome));
    assert.equal(response.body.ok,false);
    assert.equal(response.body.error,'Discovery page commit was not acknowledged');
    assert.equal(response.headers['Cache-Control'],'no-store');
    assert.equal(adminCalls,1);
    assert.equal(processCalls,1,'The tick was already claimed and attempted');
    assert.ok(!JSON.stringify(response.body).includes(claim.lease_token));
    assert.ok(!JSON.stringify(response.body).includes('private-source-token'));
  }
});

test('worker refuses a leased job with revoked consent before a network tick',async()=>{
  reset();enable();consentGranted=false;
  const response=await api.POST(request('local-synthetic-secret'));
  assert.equal(response.status,403);
  assert.match(response.body.error,/consent/i);
  assert.equal(processCalls,0);
});
