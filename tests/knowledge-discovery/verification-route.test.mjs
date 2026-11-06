import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const ts = require('typescript');

function load(file, imports) {
  const exports = {};
  const js = ts.transpileModule(readFileSync(resolve(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop:true },
  }).outputText;
  new Function('require','exports','process',js)(name => {
    if (!(name in imports)) throw new Error('Unexpected import: ' + name);
    return imports[name];
  }, exports, process);
  return exports;
}
const crypto = require('node:crypto');
const proofHelpers = load('lib/knowledge-discovery/domain-verification.ts', {
  'node:crypto':crypto,
});
const pilot = load('lib/knowledge-discovery/pilot-gate.ts',{});
const scope = load('lib/knowledge-discovery/url-policy.ts',{
  'node:net':require('node:net'), 'node:dns/promises':require('node:dns/promises'),
});
const nextResponse = {json:(body,init={})=>({status:init.status??200,body})};
let userAllowed=true, roleAllowed=true, configured='https://fixture.example.com/';
let stored=null, fileBody='', outboundRequests=0, adminWrites=0;
const orgId='10000000-0000-4000-8000-000000000001';
const userId='20000000-0000-4000-8000-000000000001';
const client = {
  auth:{getUser:async()=>({data:{user:userAllowed?{id:userId}:null},error:null})},
  rpc:async name=>{
    assert.equal(name,'can_manage_organization');
    return {data:roleAllowed,error:null};
  },
  from:table=>{
    assert.equal(table,'organization_onboarding');
    return {select:()=>({eq:()=>({maybeSingle:async()=>({
      data:{website_url:configured},error:null,
    })})})};
  },
};
const proofAdmin={
  async rpc(name,args) {
    if(name==='issue_knowledge_discovery_domain_challenge_v1'){
      const now=new Date();
      if(stored?.verified_until && Date.parse(stored.verified_until)>now.getTime())
        return {data:null,error:{code:'P0001',message:'domain_already_verified'}};
      if(stored?.issued_at && Date.parse(stored.issued_at)>now.getTime()-5*60_000)
        return {data:null,error:{code:'P0001',message:'domain_challenge_cooldown'}};
      const expires=new Date(now.getTime()+24*60*60_000).toISOString();
      stored={
        organization_id:args.p_organization_id,hostname:args.p_hostname,
        created_by:args.p_created_by,challenge_hash:args.p_challenge_hash,
        issued_at:now.toISOString(),challenge_expires_at:expires,
        verified_at:null,verified_until:null,last_check_at:null,
      };
      adminWrites++;
      return {data:expires,error:null};
    }
    if(name==='claim_knowledge_discovery_proof_check_v1'){
      const now=Date.now();
      if(!stored || stored.challenge_hash!==args.p_challenge_hash
        || Date.parse(stored.challenge_expires_at)<=now
        || (stored.last_check_at && Date.parse(stored.last_check_at)>now-30_000)){
        return {data:false,error:null};
      }
      stored.last_check_at=new Date(now).toISOString();
      return {data:true,error:null};
    }
    throw new Error('Unexpected proof RPC '+name);
  },
  from:table=>{
    assert.equal(table,'knowledge_discovery_domain_verifications');
    return {
      select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:stored,error:null})})})}),
      update(value) {
        return {
          eq:()=>({eq:()=>({eq:()=>({gt:()=>({select:()=>({
            maybeSingle:async()=>{
              if (!stored || stored.challenge_expires_at <= new Date().toISOString()) {
                return {data:null,error:null};
              }
              adminWrites++;
              stored={...stored,...value};
              return {data:{id:'30000000-0000-4000-8000-000000000001'},error:null};
            },
          })})})})}),
        };
      },
    };
  },
};
const api=load('app/api/knowledge/discovery/verification/route.ts',{
  'next/server':{NextResponse:nextResponse},
  '@/lib/supabase/server':{createClient:async()=>client},
  '@/lib/supabase/admin':{createAdminClient:()=>proofAdmin},
  '@/lib/workspace':{requireCurrentOrganizationId:async()=>orgId},
  '@/lib/security/fetch-metadata':{isExplicitCrossSiteRequest:request=>request.headers.get('sec-fetch-site')==='cross-site'},
  '@/lib/knowledge-discovery/url-policy':scope,
  '@/lib/knowledge-discovery/pilot-gate':pilot,
  '@/lib/knowledge-discovery/public-fetch':{
    evaluateRobots:()=>({allowed:true,delaySeconds:0}),
    fetchPublicWeb:async(_seed,url,kind)=>{
      outboundRequests++;
      if(kind==='robots')return {url:url.href,status:404,contentType:'text/plain',body:''};
      assert.equal(kind,'verification');
      assert.equal(url.href,'https://fixture.example.com/.well-known/salsysos-verification.txt');
      return {url:url.href,status:200,contentType:'text/plain',body:fileBody};
    },
  },
  '@/lib/knowledge-discovery/domain-verification':proofHelpers,
});
function req(overrides={}) {
  const headers=new Map([['origin','https://salsysos.com'],['sec-fetch-site','same-origin']]);
  for(const [key,val] of Object.entries(overrides))headers.set(key,val);
  return {nextUrl:new URL('https://salsysos.com/api/knowledge/discovery/verification'),
    headers:{get:key=>headers.get(key)??null}};
}
const vars=['KNOWLEDGE_DISCOVERY_PILOT_ENABLED','KNOWLEDGE_DISCOVERY_PAUSED','KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS'];
const old=Object.fromEntries(vars.map(x=>[x,process.env[x]]));
test.after(()=>{for(const v of vars)old[v]===undefined?delete process.env[v]:process.env[v]=old[v];});
function reset(){
  userAllowed=true;roleAllowed=true;configured='https://fixture.example.com/';
  stored=null;fileBody='';outboundRequests=0;adminWrites=0;
  for(const name of vars)delete process.env[name];
  process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED='true';
  process.env.KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS='fixture.example.com';
}
test('ownership challenge can only be issued by an authenticated organization admin',async()=>{
  reset();userAllowed=false;
  assert.equal((await api.POST(req())).status,403);
  userAllowed=true;roleAllowed=false;
  assert.equal((await api.POST(req())).status,403);
  roleAllowed=true;
  assert.equal((await api.POST(req({'origin':'https://evil.example.net','sec-fetch-site':'cross-site'}))).status,403);
  process.env.KNOWLEDGE_DISCOVERY_PAUSED='true';
  assert.equal((await api.POST(req())).status,403);
  assert.equal(adminWrites,0);
  assert.equal(outboundRequests,0);
});
test('issue stores only hash; incorrect proof cannot verify and correct proof can',async()=>{
  reset();
  const issued=await api.POST(req());
  assert.equal(issued.status,201);
  assert.equal(adminWrites,1);
  assert.equal(stored.hostname,'fixture.example.com');
  assert.equal(stored.organization_id,orgId);
  assert.equal(stored.challenge_hash,proofHelpers.digestDomainChallenge(issued.body.token));
  assert.equal(stored.challenge_hash.includes(issued.body.token),false);
  assert.equal(issued.body.proofPath,proofHelpers.DOMAIN_PROOF_PATH);
  assert.equal((await api.POST(req())).status,429,'challenge generation cooldown');

  fileBody='wrong';
  assert.equal((await api.PUT(req())).status,422);
  assert.equal(adminWrites,1);
  fileBody=issued.body.token+'\n';
  const throttled=await api.PUT(req());
  assert.equal(throttled.status,429,'immediate verify retry must not fetch again');
  stored.last_check_at=new Date(Date.now()-31_000).toISOString();
  const confirmed=await api.PUT(req());
  assert.equal(confirmed.status,200);
  assert.equal(confirmed.body.status,'verified');
  assert.equal(adminWrites,2);
  assert.equal(proofHelpers.discoveryDomainVerified(stored),true);
  const status=await api.GET();
  assert.equal(status.body.status,'verified');
  assert.equal((await api.POST(req())).status,409,'already-verified challenge cannot be regenerated');
});
test('expired challenges and hostname changes fail without fetching untrusted domains',async()=>{
  reset();
  const issued=await api.POST(req());
  stored.challenge_expires_at=new Date(Date.now()-1000).toISOString();
  fileBody=issued.body.token;
  assert.equal((await api.PUT(req())).status,409);
  assert.equal(outboundRequests,0);
  configured='https://unapproved.other.example.net/';
  assert.equal((await api.PUT(req())).status,403);
  assert.equal(outboundRequests,0);
});
