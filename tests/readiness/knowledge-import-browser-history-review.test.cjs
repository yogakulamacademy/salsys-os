const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
const browser=load('lib/knowledge-import-browser-review.ts');
const history=load('lib/knowledge-import-history-http-review.ts',{'server-only':{},'./knowledge-import-history-review':load('lib/knowledge-import-history-review.ts')});
const origin='https://fixture.example',job='10000000-0000-4000-8000-000000000001';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('browser replays prior chunks after interruption and never repeats publish',async()=>{
 const file=new File([new Uint8Array(1048576),new Uint8Array([1,2,3])],'fixture.json',{type:'application/json'});
 const calls=[];let committed=0,fail=true;
 const run=browser.createKnowledgeBrowserUploadReview({file,jobId:job,origin,fetcher:async(u,o)=>{
  const op=u.split('/').at(-1);calls.push(op);assert.equal(o.credentials,'same-origin');assert.equal(o.redirect,'error');
  assert.equal(Object.hasOwn(o.headers,'content-length'),false);
  if(op==='acquire')return json({writer:o.headers['x-knowledge-writer'],generation:1,receivedBytes:committed});
  if(op==='append'){const offset=Number(o.headers['x-knowledge-offset']);committed=Math.max(committed,offset+o.body.size);if(fail){fail=false;throw Error('lost response');}return json({receivedBytes:committed});}
  return json({state:'registered',status:'queued'});
 }});
 assert.equal((await run()).state,'interrupted');assert.equal((await run()).state,'registered');assert.equal((await run()).state,'registered');
 assert.deepEqual(calls,['acquire','append','acquire','append','append','publish']);
});
test('unknown publication response is terminal for browser instance',async()=>{
 const file=new File(['abc'],'fixture.json',{type:'application/json'});let count=0;
 const run=browser.createKnowledgeBrowserUploadReview({file,jobId:job,origin,fetcher:async(u,o)=>{
  if(u.endsWith('/acquire'))return json({writer:o.headers['x-knowledge-writer'],generation:1,receivedBytes:0});
  if(u.endsWith('/append'))return json({receivedBytes:3});
  if(u.endsWith('/receipt'))return json({state:'registered',jobStatus:'processing'});
  count++;throw Error('lost publish');
 }});
 assert.equal((await run()).state,'reconciliation_required');assert.equal((await run()).state,'reconciliation_required');assert.deepEqual(await run.checkPublication(),{state:'registered',jobStatus:'processing'});assert.equal(count,1);
});
test('history HTTP derives tenant in SQL, strips private fields and preserves microsecond cursor',async()=>{
 const calls=[];const ts='2026-11-27T12:00:00.123456Z';
 const row={job_id:job,job_status:'completed',created_at:ts,file_bytes:'100',total_entries:1,pending:0,leased:0,created:1,invalid:0,duplicate:0,failed:0,cancelled:0,object_path:'private',token:'secret'};
 const handle=history.createKnowledgeHistoryHttpReview({origin,authenticate:async()=>({query:async(s,p)=>{calls.push([s,p]);return {rows:[row]};}})});
 assert.equal((await handle(new Request(origin+'/history?organizationId=other'))).status,400);
 assert.equal((await handle(new Request(origin+'/history',{headers:{'sec-fetch-site':'cross-site'}}))).status,403);
 const result=await handle(new Request(origin+'/history?before='+encodeURIComponent(ts)+'&beforeId='+job));assert.equal(result.status,200);
 const body=await result.json();assert.equal(body.jobs[0].createdAt,ts);assert.equal(body.jobs[0].percent,100);assert.equal(Object.hasOwn(body.jobs[0],'object_path'),false);assert.deepEqual(calls[0][1],[25,ts,job]);
});
