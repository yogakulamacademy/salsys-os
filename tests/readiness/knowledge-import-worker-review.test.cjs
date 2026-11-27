const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const api=load('lib/knowledge-import-worker-review.ts',{'server-only':{}});
const scope={organizationId:'10000000-0000-4000-8000-000000000001',jobId:'20000000-0000-4000-8000-000000000001'};
const doc='30000000-0000-4000-8000-000000000001',token='40000000-0000-4000-8000-000000000001';
const identity={objectPath:scope.organizationId+'/'+scope.jobId+'/source.json',objectVersion:'verified-fixture',byteLength:100,sha256:'a'.repeat(64),manifestSha256:'b'.repeat(64)};
const payload={title:'Fixture',category:'general',content:'Synthetic fixture content',source_name:'Manual',source_type:'manual',source_uri:null};
const prepared={ok:true,objectVersion:identity.objectVersion,sha256:identity.sha256,byteLength:100,manifest:[{index:0,status:'pending',payload_sha256:'c'.repeat(64)}],batches:[[{index:0,payload}]],mayExecute:false};
const claim={entry_index:0,lease_token:token,attempts:1};
function fixture(overrides={}){
  const calls=[];
  const a={readIdentity:async()=>identity,prepareVerifiedSource:async()=>prepared,verifyManifest:async()=>true,
    claim:async()=>{calls.push('claim');return [claim];},finalize:async()=>{calls.push('finalize');return {kind:'committed',documentId:doc};},
    result:async()=>{calls.push('result');return null;},settleFailure:async()=>{calls.push('settle');return 'pending';},...overrides};
  return {a,calls};
}
test('one bounded review tick commits an authorized claim',async()=>{
 const {a,calls}=fixture();const r=await api.runKnowledgeImportBatchReview(scope,a);
 assert.equal(r.created,1);assert.equal(r.stop,'batch_complete');assert.equal(r.mayExecute,false);
 assert.deepEqual(calls,['claim','finalize']);assert.equal(api.KNOWLEDGE_IMPORT_WORKER_RUNTIME_WIRED,false);
});
test('source mismatch and failed manifest verification stop before claiming',async()=>{
 for(const overrides of [{prepareVerifiedSource:async()=>({...prepared,sha256:'f'.repeat(64)})},{verifyManifest:async()=>false}]){
  const {a,calls}=fixture(overrides);assert.equal((await api.runKnowledgeImportBatchReview(scope,a)).stop,'source_rejected');assert.deepEqual(calls,[]);
 }
});
test('unknown response retrieves exact committed receipt; no repeat finalize',async()=>{
 const {a}=fixture({finalize:async()=>{throw Error('transport');},result:async()=>doc});
 const r=await api.runKnowledgeImportBatchReview(scope,a);assert.equal(r.recovered,1);assert.equal(r.created,0);
});
test('unknown without receipt never settles or blindly retries',async()=>{
 let settled=0;const {a}=fixture({finalize:async()=>({kind:'unknown'}),settleFailure:async()=>{settled++;return 'pending';}});
 assert.equal((await api.runKnowledgeImportBatchReview(scope,a)).stop,'uncertain_outcome');assert.equal(settled,0);
});
test('only confirmed classified rollback settles; permission/connection errors stop',async()=>{
 const {a}=fixture({finalize:async()=>({kind:'confirmed_rollback',sqlstate:'40001'})});
 assert.equal((await api.runKnowledgeImportBatchReview(scope,a)).retried,1);
 for(const state of ['42501','08006','XX000'])assert.equal(api.classifyConfirmedKnowledgeRollback(state),null);
 const x=fixture({finalize:async()=>({kind:'confirmed_rollback',sqlstate:'42501'})});
 assert.equal((await api.runKnowledgeImportBatchReview(scope,x.a)).stop,'unclassified_failure');
 assert.equal(x.calls.includes('settle'),false);
});
test('duplicate or out-of-scope claims fail before processing',async()=>{
 for(const rows of [[claim,claim],[{...claim,entry_index:1}]]){
  const {a,calls}=fixture({claim:async()=>rows});assert.equal((await api.runKnowledgeImportBatchReview(scope,a)).stop,'invalid_claim');assert.equal(calls.includes('finalize'),false);
 }
});

test('one verified source supports bounded sequential batches without re-reading',async()=>{
 let reads=0,claims=0;
 const {a}=fixture({prepareVerifiedSource:async()=>{reads++;return prepared;},claim:async()=>++claims===1?[claim]:[]});
 const r=await api.runKnowledgeImportBatchReview(scope,a,1,5);
 assert.equal(r.created,1);assert.equal(r.claimed,1);assert.equal(r.stop,'batch_complete');assert.equal(reads,1);assert.equal(claims,2);
 assert.equal((await api.runKnowledgeImportBatchReview(scope,a,1,6)).stop,'invalid_claim');
});
