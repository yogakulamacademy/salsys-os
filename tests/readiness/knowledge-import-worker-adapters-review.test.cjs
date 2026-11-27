const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {load}=require('./helpers.cjs');
const upload=load('lib/knowledge-import-upload-contract.ts');
const source=load('lib/knowledge-import-source-preparation.ts',{'server-only':{},'node:crypto':crypto,'./knowledge-bulk-import-preflight':load('lib/knowledge-bulk-import-preflight.ts'),'./knowledge-import-upload-contract':upload});
const api=load('lib/knowledge-import-worker-adapters-review.ts',{'server-only':{},'./knowledge-import-source-preparation':source,'./knowledge-import-upload-contract':upload});
const runner=load('lib/knowledge-import-worker-review.ts',{'server-only':{}});
const scope={organizationId:'10000000-0000-4000-8000-000000000001',jobId:'20000000-0000-4000-8000-000000000001'};
const doc='30000000-0000-4000-8000-000000000001',token='40000000-0000-4000-8000-000000000001';
const raw=Buffer.from(JSON.stringify({version:1,drafts:[{title:'Policy',content:'Synthetic source data',source_name:'Manual'}]}));
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const identity={objectPath:scope.organizationId+'/'+scope.jobId+'/source.json',objectVersion:'fixture-v1',byteLength:raw.length,sha256:hash(raw),manifestSha256:'b'.repeat(64)};
const origin='https://fixture.supabase.co', url=origin+'/storage/v1/object/sign/knowledge-import-private-v1/'+identity.objectPath+'?token=fixture';
const response=()=>new Response(raw,{headers:{'content-type':'application/json','content-length':String(raw.length)}});
test('signed-read consumer rejects alternate origins, paths and redirects before processing',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return response();};
 for(const u of [url.replace('fixture.supabase.co','elsewhere.example'),url.replace('/source.json','/other.json'),url+'&extra=yes']){
   await assert.rejects(api.readSignedKnowledgeSource(scope,identity,origin,async()=>u,fetcher),/read URL rejected/);
 }assert.equal(calls,0);
 const got=await api.readSignedKnowledgeSource(scope,identity,origin,async()=>url,async(u,options)=>{assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');return response();});
 const p=await source.prepareKnowledgeWorkerSource(scope,identity,got,async rows=>rows.map(r=>hash(JSON.stringify(r))));
 assert.equal(p.ok,true);assert.equal(p.sha256,identity.sha256); // no upload reservation or expiry used
});
test('worker byte verification rejects changed content and wrong length',async()=>{
 const got=await api.readSignedKnowledgeSource(scope,identity,origin,async()=>url,async()=>response());
 assert.equal((await source.prepareKnowledgeWorkerSource(scope,{...identity,sha256:'f'.repeat(64)},got,async()=>[])).reason,'source_digest_mismatch');
 await assert.rejects(api.readSignedKnowledgeSource(scope,identity,origin,async()=>url,async()=>new Response(raw,{headers:{'content-type':'text/html'}})),/source response rejected/);
});
test('parameterized restricted SQL adapter connects worker review tick end to end with mock transport',async()=>{
 const calls=[];
 const query=async(sql,p)=>{calls.push(sql);assert.equal(p[0],scope.organizationId);assert.equal(p[1],scope.jobId);
   if(sql.includes('worker_source_identity'))return {rows:[{object_path:identity.objectPath,object_version:identity.objectVersion,byte_length:String(raw.length),source_sha256:identity.sha256,manifest_sha256:identity.manifestSha256}]};
   if(sql.includes('worker_digest_payloads'))return {rows:JSON.parse(p[2]).map((r,i)=>({entry_index:String(i),payload_sha256:hash(JSON.stringify(r))}))};
   if(sql.includes('worker_verify_manifest'))return {rows:[{ok:true}]};
   if(sql.includes('worker_claim'))return {rows:[{entry_index:0,lease_token:token,attempts:1}]};
   if(sql.includes('worker_finalize'))return {rows:[{id:doc}]};
   throw Error('unexpected query');};
 const a=api.createKnowledgeWorkerReviewAdapters(query,origin,async()=>url,async()=>response());
 const result=await runner.runKnowledgeImportBatchReview(scope,a);
 assert.equal(result.created,1);assert.equal(result.stop,'batch_complete');assert.equal(calls.length,5);
 assert.equal(api.KNOWLEDGE_IMPORT_ADAPTER_RUNTIME_WIRED,false);
});
test('finalize transport exception remains unknown, even if error has SQLSTATE',async()=>{
 const a=api.createKnowledgeWorkerReviewAdapters(async()=>{throw Object.assign(Error('transport'),{code:'40001'});},origin,async()=>url);
 assert.deepEqual(await a.finalize(scope,{entry_index:0,lease_token:token,attempts:1},{}),{kind:'unknown'});
});
