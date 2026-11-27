const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
const login='kb_worker_fixture',sql='select * from knowledge_import_review.worker_due_jobs($1)';
function fixture(scheduler,{restricted=true,fail=false}={}){
 let opens=0,closes=0;const calls=[];
 const api=load('lib/knowledge-import-worker-runtime-review.ts',{'server-only':{},'./knowledge-import-worker-adapters-review':{createKnowledgeWorkerSourceAdaptersReview:()=>({}),readSignedKnowledgeSource:()=>{throw Error('unexpected read');}},'./knowledge-import-scheduler-review':{runKnowledgeImportSchedulerReview:scheduler}});
 const options={expectedLogin:login,readSource:async()=>{throw Error('unexpected read');},openDedicatedWorker:async()=>{
  opens++;return {query:async(s,p)=>{calls.push([s,p]);if(s.startsWith('select session_user'))return {rows:[{login,restricted}]};if(fail&&s===sql&&opens===1)throw Error('uncertain transport');return {rows:[]};},destroy:async()=>{closes++;}};
 }};
 return {api,options,calls,counts:()=>[opens,closes]};
}
test('runtime permits only fixed worker statements, validates dedicated login and closes session',async()=>{
 const f=fixture(async(query,a,o)=>{
  assert.equal(o.jobs,1);assert.equal(o.windowBatches,200);
  await assert.rejects(query('select * from auth.sessions',[]),/operation denied/);
  await assert.rejects(query(sql,[1,2]),/operation denied/);
  assert.deepEqual(await query(sql,[1]),{rows:[]});return {stop:'complete'};
 });
 assert.equal((await f.api.runKnowledgeWorkerRuntimeReview(f.options)).stop,'complete');
 assert.deepEqual(f.counts(),[1,1]);assert.equal(f.calls.length,5);
});
test('elevated or wrong worker login never reaches scheduler operation',async()=>{
 const f=fixture(async(query)=>{await assert.rejects(query(sql,[1]),/worker login denied/);return {stop:'blocked'};},{restricted:false});
 assert.equal((await f.api.runKnowledgeWorkerRuntimeReview(f.options)).stop,'blocked');
 assert.deepEqual(f.counts(),[1,1]);assert.equal(f.calls.length,1);
});
test('failed transport discarded; only explicit new operation gets a fresh login',async()=>{
 const f=fixture(async(query)=>{await assert.rejects(query(sql,[1]),/uncertain transport/);assert.deepEqual(await query(sql,[1]),{rows:[]});return {stop:'complete'};},{fail:true});
 await f.api.runKnowledgeWorkerRuntimeReview(f.options);assert.deepEqual(f.counts(),[2,2]);
 assert.equal(f.calls.filter(c=>c[0]===sql).length,2);
});
