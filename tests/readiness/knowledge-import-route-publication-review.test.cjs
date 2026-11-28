const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
const org='10000000-0000-4000-8000-000000000001',job='20000000-0000-4000-8000-000000000001',actor='30000000-0000-4000-8000-000000000001',session='40000000-0000-4000-8000-000000000001',path=org+'/'+job+'/source.json';
const upload=load('lib/knowledge-import-upload-contract.ts');
const api=load('lib/knowledge-import-publication-adapter-review.ts',{'server-only':{},'./knowledge-import-upload-contract':upload});
test('publication adapter permits only exact scoped source and refuses direct registration',async()=>{
 const calls=[];const q=async(sql,params)=>({rows:sql.includes('digest_payloads')?[{entry_index:'0',payload_sha256:'a'.repeat(64)}]:[{organization_id:org,id:job,requested_by:actor,request_session_id:session,object_path:path,declared_bytes:'3',upload_expires_at:new Date(2000),status:'awaiting_upload'}]});
 const a=api.createKnowledgePublicationAdapterReview(q,{createOnly:async(s,b)=>calls.push([s,b]),inspectExact:async()=>({version:'v1',bytes:Buffer.from('abc')})},{organizationId:org,jobId:job},()=>1000);
 await assert.rejects(a.put('other/source.json',Buffer.from('abc')));await assert.rejects(a.put(path,Buffer.from('abcd')));assert.equal(calls.length,0);
 await a.put(path,Buffer.from('abc'));assert.equal(calls.length,1);assert.equal(calls[0][0].bucket,'knowledge-import-private-v1');
 assert.equal((await a.inspect(path)).version,'v1');assert.deepEqual(await a.digests([{}]),['a'.repeat(64)]);
 await assert.rejects(a.register({},{}),/fenced registration required/);
});
test('disabled mounted route returns 404 without composing authenticated application',async()=>{
 const boundary=load('lib/knowledge-import-route-boundary-review.ts',{'server-only':{},'./knowledge-import-application-review':{createKnowledgeApplicationReview:()=>{throw Error('must never initialize');}}});
 const route=load('app/api/knowledge-import-review/[...operation]/route.ts',{'@/lib/knowledge-import-route-boundary-review':boundary,'@/lib/knowledge-import-server-runtime':{getKnowledgeImportServerRuntime:()=>null}});
 for(const method of ['GET','POST']){const result=await route[method](new Request('https://fixture.example/api/knowledge-import-review/history',{method}));assert.equal(result.status,404);assert.equal(result.headers.get('cache-control'),'no-store');}
});

test('mounted route dispatches to the configured authenticated runtime and fails closed on configuration errors',async()=>{
 let calls=0,bad=false;
 const route=load('app/api/knowledge-import-review/[...operation]/route.ts',{
  '@/lib/knowledge-import-route-boundary-review':{knowledgeImportDisabledRoute:()=>{throw Error('unexpected disabled route');}},
  '@/lib/knowledge-import-server-runtime':{getKnowledgeImportServerRuntime:()=>{
   if(bad)throw Error('sensitive configuration');
   return {handle:async request=>{calls++;return new Response(request.method);}};
  }},
 });
 for(const method of ['GET','POST']){
  const request=new Request('https://fixture.example/api/knowledge-import-review/history',{method});
  assert.equal(await (await route[method](request)).text(),method);
 }
 bad=true;
 const response=await route.GET(new Request('https://fixture.example/api/knowledge-import-review/history'));
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{error:'import_unavailable'});
 assert.equal(calls,2);
});
