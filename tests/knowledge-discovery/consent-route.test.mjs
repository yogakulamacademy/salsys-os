import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const require=createRequire(import.meta.url);
const ts=require('typescript');
function load(path,imports={}){
  const output={};
  const compiled=ts.transpileModule(readFileSync(resolve(path),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText;
  new Function('require','exports','process',compiled)(name=>{
    if(!(name in imports))throw Error('Unapproved import '+name);
    return imports[name];
  },output,process);
  return output;
}
const organizationId='10000000-0000-4000-8000-000000000001';
const ownerId='20000000-0000-4000-8000-000000000001';
const host='fixture.example.com';
const policySha='a'.repeat(64);
const policyVersion='synthetic-reviewed-test-v1';
const acknowledgement='I authorize read-only website discovery for this domain';
let authenticated=true,admin=true,strictSession=true,site='https://fixture.example.com/';
let rpcError=null,rpcReturn=null,rpcCalls=[],reads=[],authCalls=0;
const scope=load('lib/knowledge-discovery/url-policy.ts',{
  'node:net':require('node:net'),
  'node:dns/promises':require('node:dns/promises'),
});
const domain=load('lib/knowledge-discovery/domain-verification.ts',{
  'node:crypto':require('node:crypto'),
});
function client(){
  return {
    auth:{getUser:async()=>{
      authCalls++;
      return {data:{user:authenticated?{id:ownerId}:null},error:null};
    }},
    rpc:async(name,args)=>{
      rpcCalls.push({name,args});
      if(name==='can_manage_organization')return {data:admin,error:null};
      if(name==='kb_discovery_consent_actor_v1')
        return {data:strictSession?ownerId:null,error:null};
      if(rpcError)return {data:null,error:rpcError};
      if(name==='grant_knowledge_discovery_consent_v1')
        return {data:rpcReturn??{ok:true,revision:1},error:null};
      if(name==='withdraw_knowledge_discovery_consent_v1')
        return {data:rpcReturn??{ok:true,revision:2,jobsCancelled:1},error:null};
      throw Error('Unexpected RPC '+name);
    },
    from:table=>{
      reads.push(table);
      if(table==='organization_onboarding')return {
        select:()=>({eq:()=>({maybeSingle:async()=>({data:{website_url:site},error:null})})}),
      };
      if(table==='knowledge_discovery_site_consents')return{
        select:()=>({eq:()=>({limit:async()=>({data:[],error:null})})}),
      };
      if(table==='knowledge_discovery_consent_audit')return {
        select:()=>({eq:()=>({order:()=>({limit:async()=>({data:[],error:null})})})}),
      };
      throw Error('Unexpected table '+table);
    },
  };
}
const NextResponse={json:(body,options={})=>({
  body,status:options.status??200,headers:options.headers??{},
})};
const routes=load('app/api/knowledge/discovery/consent/route.ts',{
  'next/server':{NextResponse},
  '@/lib/supabase/server':{createClient:async()=>client()},
  '@/lib/workspace':{requireCurrentOrganizationId:async()=>organizationId},
  '@/lib/security/bounded-json-body':{
    readBoundedJson:async request=>({ok:true,value:await request.json()}),
  },
  '@/lib/security/fetch-metadata':{
    isExplicitCrossSiteRequest:request=>
      request.headers.get('sec-fetch-site')==='cross-site',
  },
  '@/lib/knowledge-discovery/url-policy':scope,
  '@/lib/knowledge-discovery/domain-verification':domain,
});
const key='KNOWLEDGE_DISCOVERY_CONSENT_MANAGEMENT_ENABLED';
const readKey='KNOWLEDGE_DISCOVERY_CONSENT_READ_ENABLED';
const was=process.env[key];
const wasRead=process.env[readKey];
test.after(()=>{
  was===undefined?delete process.env[key]:process.env[key]=was;
  wasRead===undefined?delete process.env[readKey]:process.env[readKey]=wasRead;
});
function reset(){
  delete process.env[key];delete process.env[readKey];authenticated=true;admin=true;strictSession=true;site='https://fixture.example.com/';
  rpcError=null;rpcReturn=null;rpcCalls=[];reads=[];authCalls=0;
}
function req(method,body,headers={}){
  const url='https://salsysos.test/api/knowledge/discovery/consent';
  const request=new Request(url,{
    method,headers:{
      origin:'https://salsysos.test','sec-fetch-site':'same-origin',
      'content-type':'application/json',...headers,
    },
    ...(body==null?{}:{body:JSON.stringify(body)}),
  });
  Object.defineProperty(request,'nextUrl',{value:new URL(url)});
  return request;
}
function grantBody(){
  return {policyVersion,policySha256:policySha,
    validUntil:new Date(Date.now()+24*60*60*1000).toISOString().replace(/\.\d+Z$/,'Z'),
    acknowledgement};
}

test('grant defaults OFF before any login or database read',async()=>{
  reset();
  const result=await routes.POST(req('POST',grantBody()));
  assert.equal(result.status,503);
  assert.equal(authCalls,0);
  assert.deepEqual(rpcCalls,[]);
  assert.deepEqual(reads,[]);
});
test('GET is tenant-authenticated and avoids uninstalled tables when disabled',async()=>{
  reset();
  const result=await routes.GET();
  assert.equal(result.status,200);
  assert.equal(result.body.managementEnabled,false);
  assert.equal(result.body.readEnabled,false);
  assert.deepEqual(reads,[]);
  authenticated=false;
  assert.equal((await routes.GET()).status,403);
  process.env[key]='true';authenticated=true;
  const active=await routes.GET();
  assert.equal(active.status,200);
  assert.equal(active.body.readEnabled,true);
  assert.deepEqual(reads,[
    'knowledge_discovery_site_consents','knowledge_discovery_consent_audit',
  ]);
});
test('KB-06D read-only review requires separate flag and does not enable grant writes',async()=>{
  reset();
  process.env[readKey]='true';
  const visible=await routes.GET();
  assert.equal(visible.status,200);
  assert.equal(visible.body.managementEnabled,false);
  assert.equal(visible.body.readEnabled,true);
  assert.deepEqual(reads,[
    'knowledge_discovery_site_consents','knowledge_discovery_consent_audit',
  ]);
  const baseline=reads.length;
  assert.equal((await routes.POST(req('POST',grantBody()))).status,503);
  assert.equal(authCalls,1,'grant disabled before extra auth calls');
  assert.deepEqual(rpcCalls.filter(x=>x.name==='grant_knowledge_discovery_consent_v1'),[]);
  assert.equal(reads.length,baseline);
  authenticated=false;
  assert.equal((await routes.GET()).status,403);
  admin=false;authenticated=true;
  assert.equal((await routes.GET()).status,403);
  assert.equal(reads.length,baseline);
  authenticated=true;admin=true;strictSession=false;
  assert.equal((await routes.GET()).status,403);
  assert.equal(reads.length,baseline,'Revoked session cannot read any consent or audit rows');
});
test('CSRF and unauthenticated/non-admin denial precede write RPC',async()=>{
  reset();process.env[key]='true';
  const cross=await routes.POST(req('POST',grantBody(),{
    origin:'https://attacker.example.net','sec-fetch-site':'cross-site',
  }));
  assert.equal(cross.status,403);
  assert.deepEqual(rpcCalls,[]);
  authenticated=false;
  assert.equal((await routes.POST(req('POST',grantBody()))).status,403);
  authenticated=true;admin=false;
  assert.equal((await routes.POST(req('POST',grantBody()))).status,403);
  assert.equal(rpcCalls.filter(x=>x.name==='grant_knowledge_discovery_consent_v1').length,0);
});
test('grant requires fixed explicit acknowledgement and bounded expiry',async()=>{
  reset();process.env[key]='true';
  const invalid=[
    {...grantBody(),acknowledgement:'Yes'},
    {...grantBody(),policyVersion:''},
    {...grantBody(),policySha256:'not-sha'},
    {...grantBody(),validUntil:'not-a-date'},
    {...grantBody(),validUntil:new Date(Date.now()+9*86400_000).toISOString().replace(/\.\d+Z$/,'Z')},
  ];
  for(const body of invalid)
    assert.equal((await routes.POST(req('POST',body))).status,400);
  assert.equal(authCalls,0);
});
test('grant only configured exact HTTPS host using caller-bound authenticated RPC',async()=>{
  reset();process.env[key]='true';
  const result=await routes.POST(req('POST',grantBody()));
  assert.equal(result.status,201);
  const grant=rpcCalls.find(x=>x.name==='grant_knowledge_discovery_consent_v1');
  assert.ok(grant);
  assert.deepEqual(grant.args,{
    p_organization_id:organizationId,
    p_hostname:host,
    p_policy_version:policyVersion,
    p_policy_sha256:policySha,
    p_valid_until:grantBody().validUntil,
    p_acknowledgement:acknowledgement,
  });
  assert.equal(result.body.revision,1);
  reset();process.env[key]='true';site='http://fixture.example.com/';
  assert.equal((await routes.POST(req('POST',grantBody()))).status,400);
  assert.equal(rpcCalls.filter(x=>x.name==='grant_knowledge_discovery_consent_v1').length,0);
});
test('database policy rejection cannot be converted to granted consent',async()=>{
  reset();process.env[key]='true';
  rpcError={code:'42501'};
  assert.equal((await routes.POST(req('POST',grantBody()))).status,403);
  rpcError=null;rpcReturn={ok:false,reason:'unapproved'};
  assert.equal((await routes.POST(req('POST',grantBody()))).status,403);
});
test('withdrawal remains available with grant feature OFF but needs exact version and origin',async()=>{
  reset();
  const response=await routes.DELETE(req('DELETE',{
    hostname:host,expectedRevision:1,
  }));
  assert.equal(response.status,200);
  assert.equal(response.body.status,'withdrawn');
  assert.equal(response.body.jobsCancelled,1);
  const change=rpcCalls.find(x=>x.name==='withdraw_knowledge_discovery_consent_v1');
  assert.deepEqual(change.args,{
    p_organization_id:organizationId,p_hostname:host,p_expected_revision:1,
  });
  for(const bad of [
    {hostname:host,expectedRevision:0},
    {hostname:'fixture.example.com.evil.net',expectedRevision:null},
    {hostname:'https://fixture.example.com/',expectedRevision:1},
    {hostname:'fixture.example.com:443',expectedRevision:1},
    {hostname:host,expectedRevision:1.5},
  ])assert.equal((await routes.DELETE(req('DELETE',bad))).status,400);
  const cross=await routes.DELETE(req('DELETE',
    {hostname:host,expectedRevision:1},{
      origin:'https://attacker.example.net','sec-fetch-site':'cross-site',
    }));
  assert.equal(cross.status,403);
});
test('withdrawal requires authenticated owner/admin and honors stale database result',async()=>{
  reset();authenticated=false;
  assert.equal((await routes.DELETE(req('DELETE',{hostname:host,expectedRevision:1}))).status,403);
  authenticated=true;admin=false;
  assert.equal((await routes.DELETE(req('DELETE',{hostname:host,expectedRevision:1}))).status,403);
  admin=true;rpcReturn={ok:false,reason:'stale_revision'};
  assert.equal((await routes.DELETE(req('DELETE',{hostname:host,expectedRevision:1}))).status,409);
  rpcReturn=null;rpcError={code:'42501'};
  assert.equal((await routes.DELETE(req('DELETE',{hostname:host,expectedRevision:1}))).status,403);
});
