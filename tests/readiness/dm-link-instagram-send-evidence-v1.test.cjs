const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const source=fs.readFileSync(path.resolve(__dirname,'../../lib/ai/dm-link-instagram-send-evidence.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const api={};new Function('require','exports',compiled)(name=>{throw Error('Unexpected import '+name)},api);
const ORG='11111111-1111-4111-8111-111111111111';
const LEAD='22222222-2222-4222-8222-222222222222';
const CONV='33333333-3333-4333-8333-333333333333';
const MSG='44444444-4444-4444-8444-444444444444';
const RAW='55555555-5555-4555-8555-555555555555';
const baseline=()=>({organizationId:ORG,leadId:LEAD,conversationId:CONV,messageId:MSG,expectedProviderMessageId:'mid_accepted_10',
 message:{id:MSG,organization_id:ORG,lead_id:LEAD,conversation_id:CONV,direction:'outbound',external_message_id:'mid_accepted_10',
  status:'sent',sent_at:'2026-11-11T10:00:00.123456+00:00',metadata:{provider:'instagram',send_mode:'human_manual',policy_checked:true}}});
const run=(patch={},messagePatch={})=>{const base=baseline();return api.classifyInstagramAcceptedSend({...base,...patch,message:{...base.message,...messagePatch}})};
test('exact provider MID plus policy-checked manual send yields accepted not delivered',()=>{
 const r=run();assert.equal(r.state,'provider_accepted');assert.equal(r.provenance,'policy_checked_manual_send');
 assert.equal(r.recipientDeliveryVerified,false);assert.equal(r.canAutoSend,false);
 assert.equal(r.acceptedAt,'2026-11-11T10:00:00.123456+00:00');
});
test('source-identified signed outbound echo yields accepted not delivery',()=>{
 const r=run({}, {metadata:{provider:'instagram',source:'signed_outbound_echo',raw_event_id:RAW}});
 assert.equal(r.state,'provider_accepted');assert.equal(r.provenance,'signed_outbound_echo');
 assert.equal(r.recipientDeliveryVerified,false);
});
test('unrecognized event source cannot claim acceptance',()=>{
 for(const metadata of [{},null,{provider:'instagram'},{provider:'instagram',send_mode:'human_manual',policy_checked:false},
  {provider:'whatsapp',send_mode:'human_manual',policy_checked:true},
  {source:'signed_outbound_echo',raw_event_id:RAW},
  {provider:'instagram',source:'signed_outbound_echo',raw_event_id:'bad-id'}]){
  assert.equal(run({}, {metadata}).state,'unverified');
 }
});
test('wrong tenant, lead, message and conversation identity all fail closed',()=>{
 for(const patch of [{organizationId:LEAD},{leadId:ORG},{conversationId:LEAD},{messageId:LEAD}]){
  assert.equal(run(patch).state,'unverified');
 }
 for(const patch of [{organization_id:LEAD},{lead_id:ORG},{conversation_id:LEAD},{id:ORG}]){
  assert.equal(run({},patch).state,'unverified');
 }
});
test('missing, changed or whitespace provider ID cannot claim acceptance',()=>{
 for(const patch of [{external_message_id:null},{external_message_id:'wrong_mid'},{external_message_id:'bad mid'}]){
  assert.equal(run({},patch).state,'unverified');
 }
 assert.equal(run({expectedProviderMessageId:'different'}).state,'unverified');
});
test('inbound, failed, queued or unsupported message status cannot claim acceptance',()=>{
 for(const status of ['received','failed','queued','delivered','read']){
  assert.equal(run({},{status}).state,'unverified');
 }
 assert.equal(run({},{direction:'inbound'}).state,'unverified');
});
test('invalid or missing sent timestamp rejects source',()=>{
 for(const sent_at of [null,'bad time','2026-11-11','2026-11-11T10:00:00']){
  assert.equal(run({},{sent_at}).state,'unverified');
 }
});
test('no raw client IP, country, phone, message body or raw token is returned',()=>{
 const json=JSON.stringify(run());
 for(const s of ['country','phone','ip','raw_token','recipient','provider_mid'])assert.equal(json.includes(s),false);
});
test('metadata must be a plain object to be considered',()=>{
 assert.equal(run({},{metadata:[]}).state,'unverified');
 assert.equal(run({},{metadata:'approved'}).state,'unverified');
});
test('unverified result never carries accepted timestamp or authorization',()=>{
 const r=run({},{status:'failed'});
 assert.deepEqual(r,{state:'unverified',acceptedAt:null,provenance:'unverified',recipientDeliveryVerified:false,canAutoSend:false});
});
