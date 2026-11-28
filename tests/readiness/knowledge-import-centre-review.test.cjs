const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
const tus=load('lib/knowledge-import-tus-review.ts',{'./knowledge-import-upload-contract':load('lib/knowledge-import-upload-contract.ts')});
const history=load('lib/knowledge-import-history-review.ts');
const org='10000000-0000-4000-8000-000000000001',job='20000000-0000-4000-8000-000000000001';
const reservation={organizationId:org,jobId:job,objectPath:org+'/'+job+'/source.json',declaredBytes:50*1024*1024,expiresAtMs:5000};
const file={name:'Knowledge.JSON',type:'application/json',size:reservation.declaredBytes};
const options=(r=reservation,f=file,origin='https://fixture.supabase.co',token='test-token',now=1000)=>tus.buildKnowledgeTusReviewOptions(origin,r,f,token,now);
test('TUS options use exact reserved path, 6 MiB chunks and no overwrite or persistent fingerprint',()=>{
 const p=options();assert.equal(p.endpoint,'https://fixture.storage.supabase.co/storage/v1/upload/resumable');
 assert.equal(p.chunkSize,6*1024*1024);assert.equal(p.metadata.objectName,reservation.objectPath);assert.equal(p.metadata.bucketName,'knowledge-import-private-v1');
 assert.equal(p.headers.authorization,'Bearer test-token');assert.equal(Object.hasOwn(p.headers,'x-upsert'),false);
 assert.equal(p.storeFingerprintForResuming,false);assert.equal(tus.KNOWLEDGE_IMPORT_TUS_RUNTIME_WIRED,false);
});
test('reject expired, changed location, size, type, project and credential inputs',()=>{
 for(const p of [options({...reservation,objectPath:'other'}),options({...reservation,expiresAtMs:1000}),options(reservation,{...file,size:file.size+1}),options(reservation,{...file,type:'text/html'}),options(reservation,{...file,name:'x.csv'}),options(reservation,file,'https://fixture.supabase.co.evil.example'),options(reservation,file,'https://fixture.supabase.co','bad token')])assert.equal(p,null);
});
const row={job_id:job,job_status:'completed',created_at:'2026-11-27T12:30:00.123456Z',file_bytes:'100',total_entries:10,pending:0,leased:0,created:7,invalid:1,duplicate:1,failed:1,cancelled:0};
test('history distinguishes processed from successful and strips extra sensitive metadata',()=>{
 const [x]=history.projectKnowledgeImportHistory([{...row,lease_token:'secret',object_path:'private',content:'raw'}]);
 assert.equal(x.percent,100);assert.equal(x.counts.created,7);assert.equal(x.needsAttention,true);assert.equal(x.createdAt,row.created_at);
 assert.equal(Object.hasOwn(x,'lease_token'),false);assert.equal(Object.hasOwn(x,'content'),false);
});
test('unknown total remains unknown; inconsistent ledger and malformed rows fail closed',()=>{
 const [x]=history.projectKnowledgeImportHistory([{...row,job_status:'awaiting_upload',total_entries:null,created:0,invalid:0,duplicate:0,failed:0}]);assert.equal(x.percent,null);assert.equal(x.remaining,null);
 for(const v of [[{...row,created:8}],[{...row,job_status:'completed',pending:1,created:6}],[{...row,file_bytes:'1e2'}],[row,row],Array(26).fill(row),null])assert.equal(history.projectKnowledgeImportHistory(v),null);
});
