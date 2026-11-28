const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
const crypto=require('node:crypto');
const org='10000000-0000-4000-8000-000000000001',job='20000000-0000-4000-8000-000000000001',writer='30000000-0000-4000-8000-000000000001',origin='https://fixture.example';
const fixture=(publish=async()=>({state:'registered',status:'queued'}))=>{
 const calls=[];
 const api=load('lib/knowledge-import-gateway-http-review.ts',{'server-only':{},'node:crypto':crypto,'./knowledge-import-gateway-review':{publishKnowledgeGatewayReview:publish}});
 const handle=api.createKnowledgeGatewayHttpReview({origin,authenticate:async req=>req.headers.get('authorization')==='Bearer fixture'?{organizationId:org,publication:{},query:async(sql,params)=>{calls.push([sql,params]);if(sql.includes('gateway_acquire'))return {rows:[{generation:'1',received_bytes:'0'}]};if(sql.includes('gateway_append'))return {rows:[{n:'3'}]};if(sql.includes('gateway_begin_publication'))return {rows:[{bytes:Buffer.from('abc')}]};throw Error('unexpected');}}:null});
 return {handle,calls};
};
const request=(headers={},body=null)=>new Request(origin+'/review',{method:'POST',headers:{origin,authorization:'Bearer fixture','content-length':body===null?'0':'3',...headers},body});
test('HTTP acquire and append derive tenant from verified context, never tenant header',async()=>{
 const {handle,calls}=fixture();const start=await handle(request({'x-knowledge-writer':writer,'x-organization-id':'other'}),job,'acquire');
 assert.equal(start.status,200);assert.deepEqual(await start.json(),{writer,generation:1,receivedBytes:0});
 const append=await handle(request({'x-knowledge-writer':writer,'x-knowledge-generation':'1','x-knowledge-offset':'0','content-type':'application/octet-stream'},Buffer.from('abc')),job,'append');
 assert.equal(append.status,200);assert.deepEqual(await append.json(),{receivedBytes:3});assert.deepEqual(calls[1][1].slice(0,5),[org,job,writer,1,0]);
});
test('HTTP rejects wrong origin, missing auth, oversized or misleading body before SQL',async()=>{
 const {handle,calls}=fixture();assert.equal((await handle(request({origin:'https://evil.example'}),job,'acquire')).status,403);
 assert.equal((await handle(request({authorization:'bad'}),job,'acquire')).status,403);
 const h={'x-knowledge-writer':writer,'x-knowledge-generation':'1','x-knowledge-offset':'0','content-type':'application/octet-stream'};
 assert.equal((await handle(request({...h,'content-length':'1048577'},Buffer.from('abc')),job,'append')).status,413);
 assert.equal((await handle(request({...h,'content-length':'2'},Buffer.from('abc')),job,'append')).status,400);
 assert.equal((await handle(request({...h,'content-length':'4'},Buffer.from('abc')),job,'append')).status,400);
 assert.equal(calls.length,0);
});
test('HTTP publication never returns staged bytes or blindly retries',async()=>{
 const {handle,calls}=fixture(async()=>{throw Error('unknown');});
 const response=await handle(request({'x-knowledge-writer':writer,'x-knowledge-generation':'1'}),job,'publish');
 assert.equal(response.status,409);assert.deepEqual(await response.json(),{state:'reconciliation_required'});assert.equal(calls.length,1);
});
