const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
const history=load('lib/knowledge-import-history-review.ts');
const api=load('lib/knowledge-import-history-polling-review.ts',{'./knowledge-import-history-review':history});
const origin='https://fixture.example',id='10000000-0000-4000-8000-000000000001';
const row={job_id:id,job_status:'processing',created_at:'2026-11-27T12:00:00.123456Z',file_bytes:100,total_entries:1,pending:1,leased:0,created:0,invalid:0,duplicate:0,failed:0,cancelled:0};
const page={jobs:history.projectKnowledgeImportHistory([row])};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
function fixture(fetcher){let visible=true,seq=0;const timers=new Map(),snapshots=[];const poll=api.createKnowledgeHistoryPollingReview({origin,fetcher,emit:x=>snapshots.push(x),visible:()=>visible,setTimer:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},clearTimer:id=>timers.delete(id)});return {poll,timers,snapshots,hide:()=>{visible=false;poll.visibilityChanged();}};}
test('history polling uses validated rows and active cadence, clears on authorization denial',async()=>{
 let calls=0;const f=fixture(async(url,opts)=>{assert.equal(url,origin+'/api/knowledge-import-review/history');assert.equal(opts.credentials,'same-origin');assert.equal(opts.cache,'no-store');return ++calls===1?json(page):json({},403);});
 await f.poll.refresh();assert.deepEqual(f.snapshots.at(-1),{state:'ready',rows:[row]});assert.deepEqual([...f.timers.values()].map(x=>x.ms),[5000]);
 await f.poll.refresh();assert.deepEqual(f.snapshots.at(-1),{state:'unavailable',rows:null});assert.equal(f.timers.size,0);
 await f.poll.refresh();assert.equal(calls,2);
});
test('hidden tab discards pending response and cancels subsequent polling',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>{resolve=r;}));const pending=f.poll.refresh();f.hide();resolve(json(page));await pending;
 assert.deepEqual(f.snapshots.at(-1),{state:'loading',rows:null});assert.equal(f.timers.size,0);
});
test('malformed response clears data, retries with bounded backoff; stop prevents late updates',async()=>{
 const f=fixture(async()=>json({jobs:[{...page.jobs[0],counts:{...page.jobs[0].counts,created:9}}]}));await f.poll.refresh();assert.equal(f.snapshots.at(-1).state,'unavailable');assert.equal(f.snapshots.at(-1).rows,null);assert.deepEqual([...f.timers.values()].map(x=>x.ms),[10000]);f.poll.stop();assert.equal(f.timers.size,0);
});
