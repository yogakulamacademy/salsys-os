import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadTs(path, imports = {}) {
  const source = readFileSync(resolve(path), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const output = {};
  new Function('require', 'exports', 'process', compiled)(
    spec => {
      if (!(spec in imports)) throw new Error('Unexpected module ' + spec);
      return imports[spec];
    }, output, process,
  );
  return output;
}

const gate = loadTs('lib/knowledge-discovery/pilot-gate.ts');
const scope = loadTs('lib/knowledge-discovery/url-policy.ts', {
  'node:net': require('node:net'),
  'node:dns/promises': require('node:dns/promises'),
});
const NextResponse = {
  json: (body, options = {}) => ({
    body, status: options.status ?? 200, headers: options.headers ?? {},
  }),
};
function request(method, body, headers = {}) {
  const url = 'https://salsysos.com/api/knowledge/discovery';
  const req = new Request(url, {
    method, headers: {
      origin: 'https://salsysos.com',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      ...headers,
    },
    ...(body == null ? {} : { body: JSON.stringify(body) }),
  });
  Object.defineProperty(req, 'nextUrl', { value: new URL(url) });
  return req;
}
const orgId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';
let authenticated = true;
let admin = true;
let adminClientCalls = 0;
let writes = [];
let reads = [];
let website = 'https://fixture.example.com/';
let ownershipVerified = true;
let consentGranted = true;
let enqueueError = null;
let enqueueResult = {ok:true,status:'queued',seed_inserted:true,
  job_id:'30000000-0000-4000-8000-000000000001'};
let enqueueCalls = [];
let cancellationError = null;
let cancellationResult = {ok:true,status:'cancelled',audit_recorded:true};
let cancelCalls = [];

function appClient() {
  return {
    auth: { getUser: async () => ({data:{user: authenticated ? { id:userId } : null},error:null}) },
    rpc: async (name, args) => {
      if (name === 'can_manage_organization') return {data:admin,error:null};
      if (name === 'enqueue_knowledge_discovery_job_v1') {
        enqueueCalls.push(args);
        return {data:enqueueResult,error:enqueueError};
      }
      assert.equal(name,'cancel_knowledge_discovery_job_v1');
      cancelCalls.push(args);
      return {data:cancellationResult,error:cancellationError};
    },
    from(table) {
      reads.push(table);
      if(table === 'organization_onboarding')return {
        select: () => ({ eq: () => ({
          maybeSingle: async () => ({data:{website_url:website},error:null}),
        }) }),
      };
      if(table === 'knowledge_discovery_jobs')return {
        select:()=>({eq:()=>({order:()=>({limit:async()=>({data:[],error:null})})})}),
      };
      if(table === 'knowledge_discovery_site_consents')return {
        select:()=>({eq:()=>({eq:()=>({
          maybeSingle:async()=>({data:consentGranted?{
            organization_id:orgId,hostname:'fixture.example.com',
            purpose:'website_discovery_review_only',status:'granted',
            policy_version:'synthetic-v1',granted_by:userId,
            granted_at:new Date(Date.now()-60_000).toISOString(),
            valid_until:new Date(Date.now()+60_000).toISOString(),
            withdrawn_at:null,
          }:null,error:null}),
        })})}),
      };
      if(table === 'knowledge_discovery_domain_verifications')return {
        select: () => ({ eq: () => ({ eq: () => ({
          maybeSingle: async () => ({data:ownershipVerified
            ? {verified_at:new Date(Date.now()-60_000).toISOString(),
              verified_until:new Date(Date.now()+60_000).toISOString()}
            : null,error:null}),
        }) }) }),
      };
      throw new Error('Unexpected read from '+table);
    },
  };
}
const route = loadTs('app/api/knowledge/discovery/route.ts', {
  'next/server': { NextResponse },
  '@/lib/supabase/server': {createClient:async()=>appClient()},
  '@/lib/workspace': {requireCurrentOrganizationId:async()=>orgId},
  '@/lib/security/bounded-json-body': {
    readBoundedJson:async (req)=>({ok:true,value:await req.json()}),
  },
  '@/lib/security/fetch-metadata': {
    isExplicitCrossSiteRequest:(req)=>req.headers.get('sec-fetch-site')==='cross-site',
  },
  '@/lib/knowledge-discovery/url-policy':scope,
  '@/lib/knowledge-discovery/pilot-gate':gate,
  '@/lib/knowledge-discovery/site-consent':loadTs('lib/knowledge-discovery/site-consent.ts'),
  '@/lib/knowledge-discovery/domain-verification':loadTs('lib/knowledge-discovery/domain-verification.ts',{
    'node:crypto':require('node:crypto'),
  }),
});
const vars = [
  'KNOWLEDGE_DISCOVERY_PILOT_ENABLED',
  'KNOWLEDGE_DISCOVERY_PAUSED',
  'KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS',
];
const original = Object.fromEntries(vars.map(key=>[key,process.env[key]]));
test.after(()=> {
  for(const key of vars) {
    if(original[key] === undefined)delete process.env[key];
    else process.env[key] = original[key];
  }
});

function reset() {
  authenticated = true;admin = true;adminClientCalls = 0;
  writes = []; reads = []; website = 'https://fixture.example.com/';
  enqueueError = null;
  enqueueResult = {ok:true,status:'queued',seed_inserted:true,
    job_id:'30000000-0000-4000-8000-000000000001'};
  enqueueCalls = [];
  cancellationError = null; cancellationResult = {ok:true,status:'cancelled',audit_recorded:true};
  cancelCalls = [];
  ownershipVerified = true; consentGranted = true;
  delete process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED;
  delete process.env.KNOWLEDGE_DISCOVERY_PAUSED;
  delete process.env.KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS;
}
function enabled() {
  process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED = 'true';
  process.env.KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS = 'fixture.example.com';
}

test('read-only GET reveals pause without touching undispatched discovery schema',async()=>{
  reset();
  const result=await route.GET();
  assert.equal(result.status,200);
  assert.equal(result.body.discoveryEnabled,false);
  assert.equal(result.body.historyAvailable,false);
  assert.deepEqual(reads,['organization_onboarding']);
  assert.equal(adminClientCalls,0);
});

test('POST refuses unauthenticated and non-admin callers before any service write',async()=>{
  reset();enabled();
  authenticated=false;
  let result=await route.POST(request('POST',{url:website,maxPages:10}));
  assert.equal(result.status,403);
  authenticated=true;admin=false;
  result=await route.POST(request('POST',{url:website,maxPages:10}));
  assert.equal(result.status,403);
  assert.equal(adminClientCalls,0);
  assert.deepEqual(writes,[]);
});

test('POST refuses cross-origin and disabled pilots before any write',async()=>{
  reset();enabled();
  const cross=request('POST',{url:website,maxPages:10},{
    origin:'https://attacker.example.net','sec-fetch-site':'cross-site',
  });
  assert.equal((await route.POST(cross)).status,403);
  process.env.KNOWLEDGE_DISCOVERY_PAUSED='true';
  const paused=await route.POST(request('POST',{url:website,maxPages:10}));
  assert.equal(paused.status,503);
  assert.equal(adminClientCalls,0);
});

test('POST refuses unapproved and lookalike websites despite authenticated admin',async()=>{
  reset();enabled();
  website='https://attacker.example.net/';
  assert.equal((await route.POST(request('POST',{url:website,maxPages:10}))).status,403);
  assert.equal(adminClientCalls,0);
  website='https://fixture.example.com/';
  const altered=await route.POST(request('POST',{
    url:'https://fixture.example.com.attacker.net/',maxPages:10,
  }));
  assert.equal(altered.status,400);
  assert.equal(adminClientCalls,0);
});

test('KB-09J approved pilot calls one signed-session atomic enqueue RPC',async()=>{
  reset();enabled();
  const result=await route.POST(request('POST',{url:website,maxPages:10}));
  assert.equal(result.status,202);
  assert.equal(result.body.status,'queued');
  assert.equal(result.body.jobId,enqueueResult.job_id);
  assert.equal(adminClientCalls,0);
  assert.deepEqual(writes,[]);
  assert.deepEqual(enqueueCalls,[{
    p_organization_id:orgId,
    p_seed_url:'https://fixture.example.com/',
    p_max_pages:10,
  }]);
});

test('database cooldown and daily limit surface as HTTP 429 without creating seed pages',async()=>{
  for(const errorText of ['discovery_scan_cooldown','discovery_daily_scan_limit']){
    reset();enabled();
    enqueueError={code:'P0001',message:errorText};
    const response=await route.POST(request('POST',{url:website,maxPages:10}));
    assert.equal(response.status,429);
    assert.match(response.body.error,/scan limit reached/i);
    assert.deepEqual(writes,[],'Denied requests must never use direct INSERT');
    assert.equal(enqueueCalls.length,1);
  }
});


test('unauthorized website ownership never allows a scan job to be created',async()=>{
  reset(); enabled(); ownershipVerified=false;
  const response=await route.POST(request('POST',{url:website,maxPages:10}));
  assert.equal(response.status,409);
  assert.match(response.body.error,/verify ownership/i);
  assert.equal(adminClientCalls,0);
  assert.deepEqual(writes,[]);
});



test('missing discovery consent blocks scan even after ownership verification',async()=>{
  reset();enabled();consentGranted=false;
  const response=await route.POST(request('POST',{url:website,maxPages:10}));
  assert.equal(response.status,403);
  assert.match(response.body.error,/consent/i);
  assert.equal(adminClientCalls,0);
  assert.deepEqual(writes,[]);
  const status=await route.GET();
  assert.equal(status.status,200);
  assert.equal(status.body.websiteVerified,true);
  assert.equal(status.body.consentActive,false);
  assert.equal(status.body.discoveryEnabled,false);
});

test('KB-09I DELETE cancels via signed tenant-admin RPC and never a service-role table update',async()=>{
  reset();enabled();
  const jobId='30000000-0000-4000-8000-000000000001';
  const response=await route.DELETE(request('DELETE',{jobId}));
  assert.equal(response.status,200);
  assert.equal(response.body.status,'cancelled');
  assert.deepEqual(cancelCalls,[{p_organization_id:orgId,p_job_id:jobId}]);
  assert.equal(adminClientCalls,0,'Cancellation must not instantiate a service-role client');
  assert.deepEqual(writes,[]);
});

test('KB-09I DELETE rejects non-admin, cross-origin and malformed jobs without privileged mutation',async()=>{
  reset();enabled();
  const jobId='30000000-0000-4000-8000-000000000001';
  assert.equal((await route.DELETE(request('DELETE',{jobId},{
    origin:'https://attacker.example.net','sec-fetch-site':'cross-site',
  }))).status,403);
  assert.equal((await route.DELETE(request('DELETE',{jobId:'bad'}))).status,400);
  admin=false;
  assert.equal((await route.DELETE(request('DELETE',{jobId}))).status,403);
  assert.deepEqual(cancelCalls,[]);
  assert.equal(adminClientCalls,0);
});

test('KB-09I DELETE fails closed on no-op, stale job, or missing authorized RPC',async()=>{
  reset();enabled();
  const jobId='30000000-0000-4000-8000-000000000001';
  cancellationResult={ok:false,reason:'not_active_or_not_found'};
  assert.equal((await route.DELETE(request('DELETE',{jobId}))).status,404);
  cancellationResult={ok:true,status:'cancelled',audit_recorded:false};
  assert.equal((await route.DELETE(request('DELETE',{jobId}))).status,404);
  cancellationError={code:'PGRST202',message:'RPC missing'};
  assert.equal((await route.DELETE(request('DELETE',{jobId}))).status,503);
  assert.equal(adminClientCalls,0);
  assert.deepEqual(writes,[]);
});


test('KB-09J transaction-side denial supersedes stale positive API checks',async()=>{
  for(const [reason,status,regex] of [
    ['ownership_proof_not_current',409,/verify ownership/i],
    ['consent_not_active',403,/consent/i],
    ['configured_domain_mismatch',409,/configured business website changed/i],
    ['invalid_scan_request',400,/invalid website scan request/i],
  ]){
    reset();enabled();
    enqueueResult={ok:false,reason};
    const response=await route.POST(request('POST',{url:website,maxPages:10}));
    assert.equal(response.status,status);
    assert.match(response.body.error,regex);
    assert.deepEqual(writes,[]);
    assert.equal(adminClientCalls,0);
    assert.equal(enqueueCalls.length,1);
  }
});

test('KB-09J missing or malformed atomic enqueue acknowledgement fails closed',async()=>{
  for(const scenario of ['missing_rpc','rejected','missing_seed','bad_job_id','wrong_status']){
    reset();enabled();
    if(scenario==='missing_rpc') enqueueError={code:'PGRST202',message:'RPC missing'};
    if(scenario==='rejected') enqueueResult={ok:false,reason:'unexpected'};
    if(scenario==='missing_seed') enqueueResult={...enqueueResult,seed_inserted:false};
    if(scenario==='bad_job_id') enqueueResult={...enqueueResult,job_id:'not-a-uuid'};
    if(scenario==='wrong_status') enqueueResult={...enqueueResult,status:'running'};
    const response=await route.POST(request('POST',{url:website,maxPages:10}));
    assert.equal(response.status,503);
    assert.equal(enqueueCalls.length,1);
    assert.deepEqual(writes,[]);
    assert.equal(adminClientCalls,0);
  }
});

test('KB-09J active scan uniqueness conflict is preserved without fallback',async()=>{
  reset();enabled();
  enqueueError={code:'23505',message:'knowledge_discovery_one_active_job_per_org'};
  const response=await route.POST(request('POST',{url:website,maxPages:10}));
  assert.equal(response.status,409);
  assert.match(response.body.error,/already in progress/i);
  assert.equal(enqueueCalls.length,1);
  assert.deepEqual(writes,[]);
});
