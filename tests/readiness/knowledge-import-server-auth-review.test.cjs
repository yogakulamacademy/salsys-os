const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
const crypto=require('node:crypto'),origin='https://fixture.example',issuer=origin+'/auth/v1',actor='10000000-0000-4000-8000-000000000001',session='20000000-0000-4000-8000-000000000001',org='30000000-0000-4000-8000-000000000001';
const application=load('lib/knowledge-import-application-review.ts',{'server-only':{},'node:crypto':crypto,'./knowledge-import-gateway-http-review':{},'./knowledge-import-history-http-review':{createKnowledgeHistoryHttpReview:()=>async()=>new Response('ok')}});
const token='fixture.'+Buffer.from(JSON.stringify({iss:issuer,sub:actor,session_id:session,role:'authenticated',exp:2000})).toString('base64url')+'.signature';
function fixture({candidate=token,verified=actor,anonymous=false,deny=false}={}){
 let opened=0,closed=0,created=0;const verifiedTokens=[];
 const api=load('lib/knowledge-import-server-auth-review.ts',{'server-only':{},'@/lib/supabase/server':{createClient:async()=>{throw Error('hosted auth forbidden');}},'./knowledge-import-runtime-composition-review':{createKnowledgeRuntimeCompositionReview:o=>application.createKnowledgeApplicationReview({...o,connect:async()=>{opened++;return {query:async()=>{if(deny)throw Error('denied');return {rows:[{organization_id:org}]};},publicationFor:()=>{throw Error('unexpected publication');},close:async()=>{closed++;}};}})}});
 const bridge=api.createKnowledgeCookieRuntimeReview({origin,issuer,uploadSeconds:600,retentionSeconds:1200,now:()=>1000,
 createAuthClient:async()=>{created++;return {auth:{getSession:async()=>({data:{session:candidate?{access_token:candidate,user:{id:'untrusted'}}:null},error:null}),getUser:async t=>{verifiedTokens.push(t);return {data:{user:verified?{id:verified,is_anonymous:anonymous}:null},error:null};}}};}});
 return {bridge,verifiedTokens,counts:()=>[opened,closed,created]};
}
test('server-rendered marker and HTTP use identical exact verified token and DB scope',async()=>{
 const f=fixture(),key=application.knowledgeImportScopeKeyReview(actor,session,org);
 assert.equal(await f.bridge.resolveScope(),key);
 assert.equal((await f.bridge.handle(new Request(origin+'/api/knowledge-import-review/history',{headers:{'x-knowledge-scope':key}}))).status,200);
 assert.deepEqual(f.verifiedTokens,[token,token]);assert.deepEqual(f.counts(),[2,2,2]);
 assert.equal((await f.bridge.handle(new Request(origin+'/api/knowledge-import-review/history',{headers:{authorization:'Bearer override','x-knowledge-scope':key}}))).status,403);
 assert.deepEqual(f.verifiedTokens,[token,token]);assert.deepEqual(f.counts(),[2,2,3]);
});
test('unverified, anonymous, changed actor, missing cookie and denied DB scope fail closed',async()=>{
 for(const opts of [{candidate:null},{verified:null},{anonymous:true},{verified:org},{deny:true}]){
  const f=fixture(opts);assert.equal(await f.bridge.resolveScope(),null);
  assert.equal(f.counts()[0],opts.deny?1:0);assert.equal(f.counts()[0],f.counts()[1]);
 }
});
