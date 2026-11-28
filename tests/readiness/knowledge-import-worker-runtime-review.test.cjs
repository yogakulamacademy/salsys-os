const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
const upload=load('lib/knowledge-import-upload-contract.ts');
const login='kb_worker_fixture',sql='select * from knowledge_import_review.worker_due_jobs($1)';
function fixture(scheduler,{restricted=true,fail=false,adapters=()=>({}),readSigned=()=>{throw Error('unexpected read');}}={}){
 let opens=0,closes=0;const calls=[];
 const api=load('lib/knowledge-import-worker-runtime-review.ts',{'server-only':{},'./knowledge-import-upload-contract':upload,'./knowledge-import-worker-adapters-review':{createKnowledgeWorkerSourceAdaptersReview:adapters,readSignedKnowledgeSource:readSigned},'./knowledge-import-scheduler-review':{runKnowledgeImportSchedulerReview:scheduler}});
 const options={expectedLogin:login,readSource:async()=>{throw Error('unexpected read');},openDedicatedWorker:async()=>{
  opens++;return {query:async(s,p)=>{calls.push([s,p]);if(s.startsWith('select session_user'))return {rows:[{login,restricted}]};if(fail&&s===sql&&opens===1)throw Error('uncertain transport');return {rows:[]};},destroy:async()=>{closes++;}};
 }};
 return {api,options,calls,counts:()=>[opens,closes]};
}
test('runtime permits only fixed worker statements, validates dedicated login and closes session',async()=>{
 const f=fixture(async(query,a,o)=>{
  assert.equal(o.jobs,1);assert.equal(o.windowBatches,200);
  await assert.rejects(query('select * from auth.sessions',[]),/operation denied/);
  await assert.rejects(query(sql,[1,2]),/operation denied/);
  assert.deepEqual(await query(sql,[1]),{rows:[]});return {stop:'complete'};
 });
 assert.equal((await f.api.runKnowledgeWorkerRuntimeReview(f.options)).stop,'complete');
 assert.deepEqual(f.counts(),[1,1]);assert.equal(f.calls.length,5);
});
test('elevated or wrong worker login never reaches scheduler operation',async()=>{
 const f=fixture(async(query)=>{await assert.rejects(query(sql,[1]),/worker login denied/);return {stop:'blocked'};},{restricted:false});
 assert.equal((await f.api.runKnowledgeWorkerRuntimeReview(f.options)).stop,'blocked');
 assert.deepEqual(f.counts(),[1,1]);assert.equal(f.calls.length,1);
});
test('failed transport discarded; only explicit new operation gets a fresh login',async()=>{
 const f=fixture(async(query)=>{await assert.rejects(query(sql,[1]),/uncertain transport/);assert.deepEqual(await query(sql,[1]),{rows:[]});return {stop:'complete'};},{fail:true});
 await f.api.runKnowledgeWorkerRuntimeReview(f.options);assert.deepEqual(f.counts(),[2,2]);
 assert.equal(f.calls.filter(c=>c[0]===sql).length,2);
});

test('versioned runtime signs only a matching, unexpired source grant',async()=>{
 const scope={
  organizationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  jobId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 };
 const path=upload.knowledgeImportObjectPath(scope.organizationId,scope.jobId);
 const identity={objectPath:path,objectVersion:'v1',byteLength:4,sha256:'a'.repeat(64),manifestSha256:'b'.repeat(64)};
 const now=1000;
 let grant={identity,expiresAtMs:now+100000};
 const signingCalls=[];
 const f=fixture(async(_query,adapter)=>adapter.read(scope,identity),{
  adapters:(_query,read)=>({readIdentity:async()=>identity,read}),
  readSigned:async(s,id,_origin,issue)=>{
   assert.equal(await issue(s,id),'signed-source');
   return {chunks:[]};
  },
 });
 const {readSource,...options}=f.options;
 const run=()=>f.api.runKnowledgeVersionedWorkerRuntimeReview({
  ...options,projectOrigin:'https://example.supabase.co',
  issuer:{
   now:()=>now,
   resolveGrant:async s=>{assert.deepEqual(s,scope);return grant;},
   storage:{from:bucket=>({createSignedUrl:async(...args)=>{
    signingCalls.push([bucket,...args]);
    return {data:{signedUrl:'signed-source'},error:null};
   }})},
  },
 });
 await run();
 assert.deepEqual(signingCalls,[[upload.KNOWLEDGE_IMPORT_BUCKET,path,30,{versionId:'v1'}]]);
 grant={identity,expiresAtMs:now+4500};
 await run();
 assert.equal(signingCalls[1][2],4);
 grant={identity:{...identity,objectVersion:'v2'},expiresAtMs:now+100000};
 await assert.rejects(run(),/source read grant denied/);
 grant={identity,expiresAtMs:now+999};
 await assert.rejects(run(),/source read grant expired/);
 grant=null;
 await assert.rejects(run(),/source read grant denied/);
 assert.equal(signingCalls.length,2);
});

test('versioned runtime resolves the grant through a separate restricted database session',async()=>{
 const scope={organizationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',jobId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
 const path=upload.knowledgeImportObjectPath(scope.organizationId,scope.jobId);
 const identity={objectPath:path,objectVersion:'v1',byteLength:4,sha256:'a'.repeat(64),manifestSha256:'b'.repeat(64)};
 const f=fixture(async(_query,adapter)=>adapter.read(scope,identity),{
  adapters:(_query,read)=>({readIdentity:async()=>identity,read}),
  readSigned:async(s,id,_origin,issue)=>{assert.equal(await issue(s,id),'signed-source');return {chunks:[]};},
 });
 let restricted=true, destroyed=0, lookups=0, signed=0;
 const {readSource,...options}=f.options;
 const run=()=>f.api.runKnowledgeVersionedWorkerRuntimeReview({
  ...options,projectOrigin:'https://example.supabase.co',
  issuer:{
   now:()=>1000,
   openIssuerConnection:async()=>({
    query:async(statement,params)=>{
     if(statement.startsWith('select session_user'))return {rows:[{login,restricted}]};
     if(statement==="set statement_timeout='5s'")return {rows:[]};
     assert.equal(statement,'select * from knowledge_import_review.worker_source_identity($1,$2)');
     assert.deepEqual(params,[scope.organizationId,scope.jobId]);
     lookups++;
     return {rows:[{object_path:path,object_version:'v1',byte_length:'4',
      source_sha256:identity.sha256,manifest_sha256:identity.manifestSha256,read_expires_at_ms:'6500'}]};
    },
    destroy:async()=>{destroyed++;},
   }),
   storage:{from:bucket=>({createSignedUrl:async(...args)=>{
    assert.deepEqual([bucket,...args],[upload.KNOWLEDGE_IMPORT_BUCKET,path,5,{versionId:'v1'}]);
    assert.equal(destroyed,1);
    signed++;
    return {data:{signedUrl:'signed-source'},error:null};
   }})},
  },
 });
 await run();
 restricted=false;
 await assert.rejects(run(),/issuer login denied/);
 assert.deepEqual([lookups,signed,destroyed],[1,1,2]);
});
