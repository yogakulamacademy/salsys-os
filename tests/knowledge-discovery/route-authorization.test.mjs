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
let simulatedInsertError = null;

function appClient() {
  return {
    auth: { getUser: async () => ({data:{user: authenticated ? { id:userId } : null},error:null}) },
    rpc: async name => {
      assert.equal(name,'can_manage_organization');
      return {data:admin,error:null};
    },
    from(table) {
      reads.push(table);
      if(table === 'organization_onboarding')return {
        select: () => ({ eq: () => ({
          maybeSingle: async () => ({data:{website_url:website},error:null}),
        }) }),
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
function privilegedClient() {
  adminClientCalls++;
  return {
    from(table) {
      assert.ok(['knowledge_discovery_jobs','knowledge_discovery_pages'].includes(table));
      return {
        insert(value) {
          writes.push({ table, value });
          return {
            select: () => ({
              single: async () => simulatedInsertError
                ? {data:null,error:simulatedInsertError}
                : {data:{id:'30000000-0000-4000-8000-000000000001'},error:null},
            }),
            then(resolve) { return Promise.resolve({error:null}).then(resolve); },
          };
        },
      };
    },
  };
}
const route = loadTs('app/api/knowledge/discovery/route.ts', {
  'next/server': { NextResponse },
  '@/lib/supabase/server': {createClient:async()=>appClient()},
  '@/lib/supabase/admin': {createAdminClient:privilegedClient},
  '@/lib/workspace': {requireCurrentOrganizationId:async()=>orgId},
  '@/lib/security/bounded-json-body': {
    readBoundedJson:async (req)=>({ok:true,value:await req.json()}),
  },
  '@/lib/security/fetch-metadata': {
    isExplicitCrossSiteRequest:(req)=>req.headers.get('sec-fetch-site')==='cross-site',
  },
  '@/lib/knowledge-discovery/url-policy':scope,
  '@/lib/knowledge-discovery/pilot-gate':gate,
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
  writes = []; reads = []; website = 'https://fixture.example.com/'; simulatedInsertError = null; ownershipVerified = true;
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

test('approved pilot creates exactly one job and seed page within the authorized organization',async()=>{
  reset();enabled();
  const result=await route.POST(request('POST',{url:website,maxPages:10}));
  assert.equal(result.status,202);
  assert.equal(result.body.status,'queued');
  assert.equal(adminClientCalls,1);
  assert.deepEqual(writes.map(x=>x.table),['knowledge_discovery_jobs','knowledge_discovery_pages']);
  assert.equal(writes[0].value.organization_id,orgId);
  assert.equal(writes[0].value.created_by,userId);
  assert.equal(writes[0].value.max_pages,10);
  assert.equal(writes[1].value.organization_id,orgId);
  assert.equal(writes[1].value.job_id,result.body.jobId);
  assert.equal(writes[1].value.url,website);
});


test('database cooldown and daily limit surface as HTTP 429 without creating seed pages',async()=>{
  for(const errorText of ['discovery_scan_cooldown','discovery_daily_scan_limit']){
    reset();enabled();
    simulatedInsertError={code:'P0001',message:errorText};
    const response=await route.POST(request('POST',{url:website,maxPages:10}));
    assert.equal(response.status,429);
    assert.match(response.body.error,/scan limit reached/i);
    assert.deepEqual(writes.map(entry=>entry.table),['knowledge_discovery_jobs'],
      'No seed page should be inserted for rejected job');
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
