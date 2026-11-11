import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require=createRequire(import.meta.url);
const ts=require('typescript');
const path='lib/knowledge-discovery/runner.ts';
const source=readFileSync(resolve(path),'utf8');
const checked='commit_knowledge_discovery_page_with_proof_v1';
const legacy='commit_knowledge_discovery_page_v1';
const args={
  p_organization_id:'10000000-0000-4000-8000-000000000001',
  p_job_id:'30000000-0000-4000-8000-000000000001',
  p_page_id:'40000000-0000-4000-8000-000000000001',
  p_lease_token:'50000000-0000-4000-8000-000000000001',
  p_page_status:'fetched',
  p_http_status:200,p_content_type:'text/html',p_page_title:'Test',
  p_failure_code:null,p_links:[],p_delay_seconds:2,
};
let rpcResult={data:{ok:true,status:'completed'},error:null};
let calls=[];
const admin={
  rpc:async (name,input)=>{
    calls.push({name,input});
    assert.notEqual(name,legacy,'Unsafe old commit RPC must never be invoked');
    assert.equal(name,checked);
    return rpcResult;
  },
  from:table=>{throw new Error('Unexpected direct table access: '+table);},
};
const imports={
  '@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/knowledge-discovery/public-fetch':{fetchPublicWeb:()=>{},WebsiteFetchError:class extends Error{}},
  '@/lib/knowledge-discovery/consent-fetch':{withDiscoveryConsent:fn=>fn},
  '@/lib/knowledge-discovery/site-consent':{discoverySiteConsentActive:()=>true},
  '@/lib/knowledge-discovery/run-core':{
    runDiscoveryPageCore:async (_claim,store)=>store.commit(args),
  },
};
const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText;
const exports={};
new Function('require','exports',compiled)(name=>{
  if(!(name in imports))throw new Error('Unapproved module: '+name);
  return imports[name];
},exports);

test('KB-09M worker uses exact proof-checked PUBLIC RPC and unchanged lease args',async()=>{
  rpcResult={data:{ok:true,status:'completed'},error:null};
  calls=[];
  const reply=await exports.processOneDiscoveryPage({
    job_id:args.p_job_id,organization_id:args.p_organization_id,
    lease_token:args.p_lease_token,seed_url:'https://fixture.example.com/',max_pages:1,
  });
  assert.deepEqual(reply,rpcResult.data);
  assert.deepEqual(calls,[{name:checked,input:args}]);
  assert.equal(source.includes(`admin.rpc('${legacy}'`),false);
  assert.equal(source.includes(`admin.rpc('${checked}'`),true);
});

test('KB-09M missing or denied checked RPC fails closed, never falling back',async()=>{
  for(const error of [
    {code:'PGRST202',message:'Missing RPC'},
    {code:'42501',message:'Proof absent or service-role denied'},
  ]){
    calls=[];
    rpcResult={data:null,error};
    await assert.rejects(exports.processOneDiscoveryPage({
      job_id:args.p_job_id,organization_id:args.p_organization_id,
      lease_token:args.p_lease_token,seed_url:'https://fixture.example.com/',max_pages:1,
    }),e=>e===error);
    assert.deepEqual(calls,[{name:checked,input:args}]);
  }
});

test('KB-09M only the checked worker RPC can call the original consent-aware commit',()=>{
  const sql=readFileSync(resolve('docs/sql/KB-09M-proof-checked-worker-commit-bridge-REHEARSAL-DRAFT.sql'),'utf8');
  const fSql=readFileSync(resolve('docs/sql/KB-09F-commit-side-ownership-guard-REHEARSAL-DRAFT.sql'),'utf8');
  assert.match(sql,/KB09M_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
  assert.match(sql,/^\s*create function public\.commit_knowledge_discovery_page_with_proof_v1\(/m);
  assert.match(sql,/grant execute on function public\.commit_knowledge_discovery_page_with_proof_v1/);
  assert.match(sql,/revoke execute on function public\.commit_knowledge_discovery_page_v1/);
  assert.match(sql,/kb09f_fixture\.commit_page_with_current_proof_v1/);
  assert.match(fSql,/select public\.commit_knowledge_discovery_page_v1\(/);
  assert.match(fSql,/v_proof\.verified_until<=clock_timestamp\(\)/);
});
