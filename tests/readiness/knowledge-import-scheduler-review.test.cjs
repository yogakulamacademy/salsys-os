const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
const org='10000000-0000-4000-8000-000000000001',job='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
const rows=[{organization_id:org,job_id:job},{organization_id:org,job_id:other}];
const fixture=(stop='batch_complete',found=rows)=>{
 const calls=[];const api=load('lib/knowledge-import-scheduler-review.ts',{'server-only':{},'./knowledge-import-worker-review':{runKnowledgeImportBatchReview:async(s,a,n,b)=>{calls.push([s,n,b]);return {stop};}}});
 const query=async(sql,params)=>{assert.match(sql,/worker_due_jobs/);assert.deepEqual(params,[2]);return {rows:found};};
 return {api,query,calls};
};
test('scheduler uses bounded assigned discovery and existing runner',async()=>{
 const {api,query,calls}=fixture();const result=await api.runKnowledgeImportSchedulerReview(query,{},{jobs:2,batchSize:3,batches:2});assert.equal(result.stop,'complete');assert.equal(calls.length,2);assert.deepEqual(calls[0],[{organizationId:org,jobId:job},3,2]);
});
test('scheduler stops before another job on uncertain result or malformed discovery',async()=>{
 const a=fixture('uncertain_outcome');assert.equal((await a.api.runKnowledgeImportSchedulerReview(a.query,{},{jobs:2})).stop,'blocked');assert.equal(a.calls.length,1);
 const b=fixture('batch_complete',[rows[0],rows[0]]);assert.equal((await b.api.runKnowledgeImportSchedulerReview(b.query,{},{jobs:2})).stop,'blocked');assert.equal(b.calls.length,0);
});
test('scheduler budget is checked before processing and options are capped',async()=>{
 const a=fixture();let time=0;assert.equal((await a.api.runKnowledgeImportSchedulerReview(a.query,{},{jobs:2,budgetMs:1000,now:()=>time+=1000})).stop,'budget');assert.equal(a.calls.length,0);
 assert.equal((await a.api.runKnowledgeImportSchedulerReview(a.query,{},{jobs:4})).stop,'invalid_options');
});

test('window is explicitly single-job, bounded and reports budget separately',async()=>{
 const calls=[],api=load('lib/knowledge-import-scheduler-review.ts',{'server-only':{},'./knowledge-import-worker-review':{runKnowledgeImportBatchReview:async()=>{throw Error('wrong runner');},runKnowledgeImportWindowReview:async(s,a,o)=>{calls.push([s,o]);return {stop:'budget'};}}});
 const query=async(sql,params)=>{assert.deepEqual(params,[1]);return {rows:[rows[0]]};};
 const result=await api.runKnowledgeImportSchedulerReview(query,{},{jobs:1,windowBatches:200,now:()=>0});
 assert.equal(result.stop,'budget');assert.equal(result.reports.length,1);assert.equal(calls[0][1].maxBatches,200);
 for(const options of [{jobs:2,windowBatches:100},{windowBatches:201},{windowBatches:100,batches:5}])assert.equal((await api.runKnowledgeImportSchedulerReview(query,{},options)).stop,'invalid_options');
});