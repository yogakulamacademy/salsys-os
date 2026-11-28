const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
const browser=load('lib/knowledge-import-browser-review.ts');
const api=load('lib/knowledge-import-upload-flow-review.ts',{'./knowledge-import-browser-review':browser});
const origin='https://fixture.example',jobId='10000000-0000-4000-8000-000000000001',file=new File(['abc'],'fixture.json',{type:'application/json'});
const json=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
test('lost reserve acknowledgment retries exact same job then uploads once',async()=>{
 const calls=[],states=[];let reserve=0;
 const f=api.createKnowledgeUploadFlowReview({origin,jobId,file,emit:s=>states.push(s.state),fetcher:async(u,o)=>{
  assert.ok(u.startsWith(origin+'/api/knowledge-import-review/'+jobId+'/'));assert.equal(o.credentials,'same-origin');assert.equal(o.redirect,'error');
  const op=u.split('/').at(-1);calls.push(op);
  if(op==='reserve'){assert.equal(o.headers['x-knowledge-file-bytes'],'3');if(++reserve===1)throw Error('lost ack');return json({jobId,status:'awaiting_upload'});}
  if(op==='acquire')return json({writer:o.headers['x-knowledge-writer'],generation:1,receivedBytes:0});
  if(op==='append')return json({receivedBytes:3});
  return json({state:'registered',status:'queued'});
 }});
 await f.start();assert.equal(f.snapshot().state,'interrupted');await f.start();await f.start();
 assert.equal(f.snapshot().state,'registered');assert.deepEqual(calls,['reserve','reserve','acquire','append','publish']);assert.ok(states.includes('uploading'));
});
test('uncertain publication is receipt-only and cancellation needs confirmed response',async()=>{
 let publishes=0,cancels=0;
 const f=api.createKnowledgeUploadFlowReview({origin,jobId,file,emit:()=>{},fetcher:async(u,o)=>{
  const op=u.split('/').at(-1);
  if(op==='reserve')return json({jobId,status:'awaiting_upload'});
  if(op==='acquire')return json({writer:o.headers['x-knowledge-writer'],generation:1,receivedBytes:0});
  if(op==='append')return json({receivedBytes:3});
  if(op==='publish'){publishes++;throw Error('lost publish');}
  if(op==='receipt')return json({state:'registered',jobStatus:'processing'});
  if(++cancels===1)throw Error('lost cancel');return json({status:'cancelled'});
 }});
 await f.start();await f.start();assert.equal(f.snapshot().state,'reconciliation_required');assert.equal(publishes,1);
 await f.check();assert.equal(f.snapshot().state,'registered');await f.cancel();assert.equal(f.snapshot().state,'registered');await f.cancel();assert.equal(f.snapshot().state,'cancelled');
});
test('invalid file and stopped flow make no new request',async()=>{
 const f=api.createKnowledgeUploadFlowReview({origin,jobId,file:new File(['abc'],'fixture.csv'),emit:()=>{},fetcher:async()=>{throw Error('must not call');}});
 assert.equal(f.snapshot().state,'rejected');await f.start();await f.cancel();f.stop();await f.start();
});
