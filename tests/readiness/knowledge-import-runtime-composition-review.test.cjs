const {test}=require('node:test');const assert=require('node:assert/strict');const {load}=require('./helpers.cjs');
const api=load('lib/knowledge-import-application-broker-review.ts',{'server-only':{}});
const claims={sub:'10000000-0000-4000-8000-000000000001',session_id:'20000000-0000-4000-8000-000000000001',role:'authenticated',is_anonymous:false,exp:2000};
const scope='select knowledge_import_review.current_scope() as organization_id';
test('broker transaction opens only for allowed SQL, binds exact minimal claims and destroys every connection',async()=>{
 let opens=0,destroys=0;const calls=[];
 const query=api.createKnowledgeBrokerTransactionReview({...claims,organization_id:'untrusted'},async()=>{opens++;return {query:async(s,p)=>{calls.push([s,p]);return {rows:[]};},destroy:async()=>{destroys++;}};},()=>1000);
 await assert.rejects(query('select * from auth.sessions',[]),/operation denied/);assert.equal(opens,0);
 await query(scope,[]);await query(scope,[]);assert.equal(opens,2);assert.equal(destroys,2);
 assert.equal(calls[0][0],'begin isolation level read committed');
 assert.deepEqual(JSON.parse(calls[4][1][0]),claims);assert.equal(calls[5][0],'select knowledge_import_review.broker_current_scope() as organization_id');assert.equal(calls[6][0],'commit');
});
test('broker never retries uncertain commit; rollback and destruction remain mandatory',async()=>{
 let opens=0,destroys=0;const calls=[];
 const query=api.createKnowledgeBrokerTransactionReview(claims,async()=>{opens++;return {query:async(s)=>{calls.push(s);if(s==='commit'||s==='rollback')throw Error('uncertain');return {rows:[]};},destroy:async()=>{destroys++;}};},()=>1000);
 await assert.rejects(query(scope,[]),/uncertain/);assert.equal(opens,1);assert.equal(destroys,1);assert.deepEqual(calls.slice(-2),['commit','rollback']);
 const expired=api.createKnowledgeBrokerTransactionReview({...claims,exp:1},async()=>{throw Error('must not open');},()=>1000);
 await assert.rejects(expired(scope,[]),/expired/);
});

test('expected workspace is bound transaction-locally before broker operations',async()=>{
 const calls=[];
 const query=api.createKnowledgeBrokerTransactionReview(claims,async()=>({query:async(s,p)=>{calls.push([s,p]);return {rows:[]};},destroy:async()=>{}}),()=>1000,()=>claims.sub);
 await query(scope,[]);
 assert.deepEqual(calls[5],["select set_config('knowledge_import.expected_organization',$1,true)",[claims.sub]]);
 assert.equal(calls[6][0],'select knowledge_import_review.broker_current_scope() as organization_id');
});
