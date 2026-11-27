const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto=require('node:crypto');
const {load}=require('./helpers.cjs');
const api=load('lib/knowledge-import-source-preparation.ts',{'server-only':{},'node:crypto':crypto,'./knowledge-bulk-import-preflight':load('lib/knowledge-bulk-import-preflight.ts'),'./knowledge-import-upload-contract':load('lib/knowledge-import-upload-contract.ts')});
const org='10000000-0000-4000-8000-000000000001', actor='20000000-0000-4000-8000-000000000001', session='30000000-0000-4000-8000-000000000001', job='40000000-0000-4000-8000-000000000001';
const context={organizationId:org,actorId:actor,sessionId:session,active:true,canManage:true};
const row={title:'Policy',content:'Synthetic knowledge 日本語',source_name:'Manual',review_flag:'Check'};
const raw=Buffer.from(JSON.stringify({version:1,drafts:[row,row,null]}));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const reservation={organizationId:org,actorId:actor,sessionId:session,jobId:job,objectPath:org+'/'+job+'/source.json',declaredBytes:raw.length,expiresAtMs:5000};
// The mock digest adapter is deliberately not a PostgreSQL implementation.
const digests=async rows=>rows.map(r=>hash(JSON.stringify(r)));
const source=(bytes=raw,overrides={})=>({bucket:'knowledge-import-private-v1',objectPath:reservation.objectPath,version:'synthetic-v1',contentType:'application/json',chunks:(async function*(){for(let i=0;i<bytes.length;i+=3)yield bytes.subarray(i,i+3)})(),...overrides});
const run=(s=source(),pin={version:'synthetic-v1'},r=reservation,c=context,d=digests,now=()=>1000)=>api.prepareKnowledgeImportSource(c,r,pin,s,d,now);
test('actual bytes, split UTF-8 and complete manifest map to review-only payload',async()=>{
 const x=await run();assert.equal(x.ok,true);assert.equal(x.mayExecute,false);assert.equal(x.sha256,hash(raw));assert.equal(x.byteLength,raw.length);
 assert.deepEqual(x.manifest.map(r=>r.status),['pending','duplicate','invalid']);const p=x.batches[0][0].payload;
 assert.equal(p.title,'⚠ Policy');assert.equal(p.source_name,'Manual · Review: Check');assert.equal(p.content,row.content);assert.equal(Object.hasOwn(p,'p_approve'),false);
 assert.equal(api.KNOWLEDGE_IMPORT_SOURCE_RUNTIME_WIRED,false);
});
test('wrong source version, path, digest or tenant refuses processing',async()=>{
 assert.equal((await run(source(),{version:'different'})).reason,'object_version_mismatch');
 assert.equal((await run(source(raw,{objectPath:'other'}))).reason,'object_mismatch');
 assert.equal((await run(source(),{version:'synthetic-v1',sha256:'a'.repeat(64)})).reason,'source_digest_mismatch');
 assert.equal((await run(source(),{version:'synthetic-v1'},reservation,{...context,active:false})).reason,'access_denied');
});
test('truncated, oversized, invalid UTF-8 and broken stream fail closed',async()=>{
 assert.equal((await run(source(raw.subarray(0,raw.length-1)))).ok,false);
 assert.equal((await run(source(Buffer.concat([raw,Buffer.from('x')])))).reason,'file_too_large');
 const invalid=Buffer.from([255]);assert.equal((await run(source(invalid),{version:'synthetic-v1'},{...reservation,declaredBytes:1})).ok,false);
 assert.equal((await run(source(raw,{chunks:(async function*(){throw Error('synthetic transport error')})()}))).reason,'source_preparation_failed');
});
test('bad digest adapter and expired reservation fail closed',async()=>{
 assert.equal((await run(source(),{version:'synthetic-v1'},reservation,context,async()=>[])).reason,'invalid_payload_digest');
 let t=0;assert.equal((await run(source(),{version:'synthetic-v1'},reservation,context,digests,()=>++t===3?5000:1000)).reason,'reservation_no_longer_valid');
});

test('manifest-only publication matches full source preparation without retaining mapped payloads',async()=>{
 const many=Buffer.from(JSON.stringify({version:1,drafts:[...Array.from({length:101},(_,i)=>({...row,title:'Policy '+i})),row,row,null]}));
 const res={...reservation,declaredBytes:many.length};
 const full=await run(source(many),{version:'synthetic-v1'},res);
 const counts=[];
 const reduced=await api.prepareKnowledgeImportManifest(context,res,{version:'synthetic-v1'},source(many),async rows=>{counts.push(rows.length);return digests(rows);},()=>1000);
 assert.equal(full.ok,true);assert.equal(reduced.ok,true);assert.equal(Object.hasOwn(reduced,'batches'),false);
 const {batches,...metadata}=full;assert.deepEqual(reduced,metadata);
 assert.equal(counts.reduce((a,b)=>a+b,0),102);assert.ok(counts.every(n=>n<=50));assert.equal(counts.length,3);
 const bad=await api.prepareKnowledgeImportManifest(context,res,{version:'synthetic-v1'},source(many),async()=>[],()=>1000);
 assert.equal(bad.ok,false);assert.equal(bad.reason,'invalid_payload_digest');
});
