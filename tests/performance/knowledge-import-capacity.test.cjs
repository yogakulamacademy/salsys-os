const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {load}=require('../readiness/helpers.cjs');
const preflight=load('lib/knowledge-bulk-import-preflight.ts');
const prep=load('lib/knowledge-import-source-preparation.ts',{'server-only':{},'node:crypto':crypto,'./knowledge-bulk-import-preflight':preflight,'./knowledge-import-upload-contract':load('lib/knowledge-import-upload-contract.ts')});
test('50 MiB / 10,000-entry source preparation capacity fixture',{timeout:120000},async t=>{
 const started=performance.now(), before=process.memoryUsage().rss;
 const org='10000000-0000-4000-8000-000000000001',job='20000000-0000-4000-8000-000000000001',path=org+'/'+job+'/source.json';
 const rawText=JSON.stringify({version:1,drafts:Array.from({length:10000},(_,i)=>({title:'Fixture '+i,content:'x'.repeat(5100),source_name:'Synthetic fixture'}))});
 const max=50*1024*1024;
 assert.ok(Buffer.byteLength(rawText)<=max);
 const raw=Buffer.alloc(max,32);raw.write(rawText,0,'utf8');
 const digest=crypto.createHash('sha256').update(raw).digest('hex');
 const identity={objectPath:path,objectVersion:'synthetic-capacity',byteLength:max,sha256:digest};
 const r=await prep.prepareKnowledgeWorkerSource({organizationId:org,jobId:job},identity,
  {bucket:'knowledge-import-private-v1',objectPath:path,version:identity.objectVersion,contentType:'application/json',chunks:(async function*(){for(let i=0;i<raw.length;i+=65536)yield raw.subarray(i,i+65536)})()},
  async rows=>rows.map(row=>crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex')));
 assert.equal(r.ok,true);assert.equal(r.byteLength,max);assert.equal(r.manifest.length,10000);
 assert.equal(r.manifest.every(x=>x.status==='pending'),true);
 assert.equal(r.batches.flat().length,10000);
 for(const batch of r.batches){assert.ok(batch.length<=50);assert.ok(Buffer.byteLength(JSON.stringify(batch))<=512*1024);}
 t.diagnostic(JSON.stringify({bytes:max,entries:10000,batches:r.batches.length,elapsedMs:Math.round(performance.now()-started),rssBeforeMiB:Math.round(before/1048576),rssAfterMiB:Math.round(process.memoryUsage().rss/1048576),maxRssKiB:process.resourceUsage().maxRSS,scope:'local synthetic parser and mock digest only'}));
});
