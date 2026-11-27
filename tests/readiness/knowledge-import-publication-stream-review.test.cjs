const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const {load}=require('./helpers.cjs');
const upload=load('lib/knowledge-import-upload-contract.ts');
const api=load('lib/knowledge-import-gateway-review.ts',{'server-only':{},'node:crypto':crypto,'./knowledge-import-source-preparation':{prepareKnowledgeImportManifest:async()=>({ok:true,manifest:[]})},'./knowledge-import-upload-contract':upload});
const raw=Buffer.from('abc'),sha=crypto.createHash('sha256').update(raw).digest('hex');
const stream=(parts,fail=false,onClose=()=>{})=>(async function*(){try{for(const part of parts)yield part;if(fail)throw Error('stream identity changed');}finally{onClose();}})();
test('streamed and buffered observations require exact bytes, digest and version',async()=>{
 const verify=api.verifyKnowledgePublicationObservation;
 assert.equal(await verify({version:'v1',chunks:stream([Buffer.from('a'),Buffer.from('bc')])},3,sha),true);
 assert.equal(await verify({version:'v1',bytes:raw},3,sha),true);
 assert.equal(await verify({version:'v1',bytes:raw,chunks:stream([raw])},3,sha),false);
 assert.equal(await verify({version:'',chunks:stream([raw])},3,sha),false);
 assert.equal(await verify({version:'v1',chunks:stream([Buffer.from('ab')])},3,sha),false);
 assert.equal(await verify({version:'v1',chunks:stream([Buffer.from('xyz')])},3,sha),false);
 assert.equal(await verify({version:'v1',chunks:stream([raw],true)},3,sha),false);
 let closed=0;assert.equal(await verify({version:'v1',chunks:stream([Buffer.from('abcd'),raw],false,()=>closed++)},3,sha),false);assert.equal(closed,1);
});
test('uncertain stream after provider write never registers or retries',async()=>{
 const org='10000000-0000-4000-8000-000000000001',job='20000000-0000-4000-8000-000000000001',scope={organizationId:org,jobId:job},actor='30000000-0000-4000-8000-000000000001',session='40000000-0000-4000-8000-000000000001';
 let writes=0,registers=0;
 const a={reservation:async()=>({context:{organizationId:org,actorId:actor,sessionId:session,active:true,canManage:true},reservation:{...scope,actorId:actor,sessionId:session,objectPath:org+'/'+job+'/source.json',declaredBytes:3,expiresAtMs:2000}}),put:async()=>{writes++;},inspect:async()=>({version:'v1',chunks:stream([raw],true)}),digests:async()=>[],register:async()=>{registers++;return 'queued';}};
 assert.deepEqual(await api.publishKnowledgeGatewayReview(scope,raw,a,()=>1000),{state:'reconciliation_required'});
 assert.equal(writes,1);assert.equal(registers,0);
});
