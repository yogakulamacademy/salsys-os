const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const {load}=require('./helpers.cjs');
const api=load('lib/knowledge-import-reconciliation-review.ts',{'server-only':{},'node:crypto':crypto,'./knowledge-import-upload-contract':load('lib/knowledge-import-upload-contract.ts')});
const scope={organizationId:'10000000-0000-4000-8000-000000000001',jobId:'20000000-0000-4000-8000-000000000001'},path=scope.organizationId+'/'+scope.jobId+'/source.json',raw=Buffer.from('abc');
const snap={object_path:path,job_status:'cancelled',phase:'publishing',expected_bytes:3,expected_sha:crypto.createHash('sha256').update(raw).digest('hex'),registered_version:null,staged_bytes:3};
const object=(version='v1',bytes=raw)=>({kind:'present',version,chunks:(async function*(){yield bytes;})()});
const inspect=(snapshot,observe)=>api.inspectKnowledgeStorageReconciliationReview(scope,{snapshot,observe});
test('matching orphan is read-only; absent does not prove cleanup',async()=>{
 const a=await inspect(async()=>snap,async(bucket,p)=>{assert.equal(bucket,'knowledge-import-private-v1');assert.equal(p,path);return object();});
 assert.deepEqual(a,{state:'matching_orphan',observedVersion:'v1',mayDelete:false,mayReleaseQuota:false});
 assert.equal((await inspect(async()=>snap,async()=>({kind:'absent_observed'}))).state,'absent_unproven');
});
test('version/byte conflicts, changed snapshot and provider errors fail closed',async()=>{
 assert.equal((await inspect(async()=>({...snap,phase:'registered',registered_version:'v2',staged_bytes:0}),async()=>object())).state,'identity_conflict');
 assert.equal((await inspect(async()=>snap,async()=>object('v1',Buffer.from('xyz')))).state,'identity_conflict');
 let i=0;assert.equal((await inspect(async()=>({...snap,staged_bytes:i++?0:3}),async()=>object())).state,'uncertain');
 assert.equal((await inspect(async()=>snap,async()=>{throw Error('provider');})).state,'uncertain');
 assert.equal((await inspect(async()=>null,async()=>{throw Error('must not read');})).state,'not_eligible');
});
