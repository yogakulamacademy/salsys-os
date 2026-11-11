import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require=createRequire(import.meta.url);
const ts=require('typescript');
class WebsiteFetchError extends Error {
  constructor(code){super(code);this.code=code;}
}
let outbound=0;
const output={};
const compiled=ts.transpileModule(
  readFileSync(resolve('lib/knowledge-discovery/run-core.ts'),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2022,esModuleInterop:true}},
).outputText;
new Function('require','exports',compiled)(name=>{
  if(name==='./url-policy')return {
    parseWebsiteSeed:s=>new URL(s),
    scopedDiscoveredUrl:()=>true,
  };
  if(name==='./public-fetch')return {
    WebsiteFetchError,
    fetchPublicWeb:async()=>{outbound++;throw Error('Unexpected network access');},
    evaluateRobots:()=>({allowed:true,delaySeconds:0}),
    discoverHtmlLinks:()=>[],discoverSitemapLinks:()=>[],
    readHtmlTitle:()=>null,
  };
  throw Error('Unexpected run-core import '+name);
},output);
const {runDiscoveryPageCore}=output;
const claim={
  organization_id:'20000000-0000-4000-8000-000000000001',
  job_id:'10000000-0000-4000-8000-000000000001',
  lease_token:'30000000-0000-4000-8000-000000000001',
  seed_url:'https://fixture.example.com/',max_pages:10,
};

async function runCommit(commitResult){
  let commits=0,pendingCalls=0;
  const store={
    async pending(got){
      pendingCalls++;assert.deepEqual(got,claim);
      return null;
    },
    async commit(args){
      commits++;
      assert.equal(args.p_organization_id,claim.organization_id);
      assert.equal(args.p_job_id,claim.job_id);
      assert.equal(args.p_lease_token,claim.lease_token);
      assert.equal(args.p_page_id,null);
      assert.equal(args.p_page_status,'skipped');
      return commitResult;
    },
  };
  outbound=0;
  const result=await runDiscoveryPageCore(claim,store);
  assert.equal(pendingCalls,1);
  assert.equal(commits,1);
  assert.equal(outbound,0);
  return result;
}

test('denied tenant/lease/page/consent SQL commits are never acknowledged as a successful tick',async()=>{
  for(const reason of [
    'inactive_or_stale_lease','consent_not_active','page_not_pending',
  ]){
    assert.deepEqual(await runCommit({ok:false,reason}),{ok:false,reason});
  }
});
test('malformed SQL commit result fails closed without fabricating successful processing',async()=>{
  for(const bad of [null,undefined,{},[],{ok:false},{ok:null},{ok:'true'}]){
    assert.deepEqual(await runCommit(bad),{
      ok:false,reason:'commit_not_acknowledged',
    });
  }
});
test('actual acknowledged SQL commit remains a successful tick with returned status',async()=>{
  const confirmed={ok:true,status:'completed',pages_fetched:1};
  assert.deepEqual(await runCommit(confirmed),{ok:true,job:confirmed});
});
test('SQL transport failure remains a thrown error, never a fabricated success',async()=>{
  outbound=0;
  await assert.rejects(runDiscoveryPageCore(claim,{
    async pending(){return null;},
    async commit(){throw Error('database unavailable');},
  }),/database unavailable/);
  assert.equal(outbound,0);
});
