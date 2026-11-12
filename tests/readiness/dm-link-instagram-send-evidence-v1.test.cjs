const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
function load(relative,deps={}){
 const source=fs.readFileSync(path.resolve(__dirname,'../../'+relative),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const out={};new Function('require','exports',compiled)(name=>{
  if(Object.hasOwn(deps,name))return deps[name];
  throw Error('Unexpected import '+name);
 },out);return out;
}
const clock=load('lib/ai/dm-link-time.ts');
const api=load('lib/ai/dm-link-instagram-send-evidence.ts',{
 './dm-link-time':clock,'node:crypto':require('node:crypto')
});
const ORG='11111111-1111-4111-8111-111111111111';
const LEAD='22222222-2222-4222-8222-222222222222';
const CONV='33333333-3333-4333-8333-333333333333';
const MSG='44444444-4444-4444-8444-444444444444';
const EVENT='55555555-5555-4555-8555-555555555555';
const SECRET='TEST_ONLY_provenance_HMAC_key_never_for_production_001';
const baseline=()=>({
 organizationId:ORG,leadId:LEAD,conversationId:CONV,messageId:MSG,
 expectedProviderMessageId:'mid_accepted_10',
 provenanceVerificationKey:SECRET,verifiedProvenance:null,
 message:{
  id:MSG,organization_id:ORG,lead_id:LEAD,conversation_id:CONV,
  direction:'outbound',external_message_id:'mid_accepted_10',
  status:'sent',sent_at:'2026-11-11T10:00:00.123456+00:00',
  metadata:{provider:'instagram',send_mode:'human_manual',policy_checked:true}
 }
});
function verified(input,source='verified_send_api_response'){
 const p={
  source,organizationId:input.organizationId,leadId:input.leadId,
  conversationId:input.conversationId,messageId:input.messageId,
  providerMessageId:input.expectedProviderMessageId,
  acceptedAt:input.message.sent_at,
  evidenceRef:(source==='verified_signed_webhook'?'webhook:':'send:')+EVENT,
 };
 // The test issuer models a privileged server which has ALREADY independently
 // checked the provider API response or Meta webhook signature.
 const fields=['dm-link-instagram-evidence-v1',p.source,p.organizationId,
  p.leadId,p.conversationId,p.messageId,p.providerMessageId,p.acceptedAt,p.evidenceRef];
 p.signature=createHmac('sha256',SECRET).update(fields.join('\\n'),'utf8').digest('hex');
 return p;
}
const run=(patch={},messagePatch={})=>{
 const base=baseline();base.verifiedProvenance=verified(base);
 return api.classifyInstagramAcceptedSend({
  ...base,...patch,message:{...base.message,...messagePatch}
 });
};
test('trusted signed send attestation permits accepted-only classification, NEVER recipient delivery',()=>{
 const r=run();
 assert.equal(r.state,'provider_accepted');
 assert.equal(r.provenance,'policy_checked_manual_send');
 assert.equal(r.recipientDeliveryVerified,false);assert.equal(r.canAutoSend,false);
});
test('exact signed webhook attestation is accepted but does not establish recipient delivery',()=>{
 const b=baseline();b.verifiedProvenance=verified(b,'verified_signed_webhook');
 b.message.metadata={provider:'instagram',source:'signed_outbound_echo',raw_event_id:EVENT};
 const r=api.classifyInstagramAcceptedSend(b);
 assert.equal(r.state,'provider_accepted');assert.equal(r.provenance,'signed_outbound_echo');
 assert.equal(r.recipientDeliveryVerified,false);
});
test('fabricated CRM manual policy flags and arbitrary UUID echo are never provenance by themselves',()=>{
 for(const metadata of [
  {provider:'instagram',send_mode:'human_manual',policy_checked:true},
  {provider:'instagram',source:'signed_outbound_echo',raw_event_id:EVENT},
  {provider:'instagram',source:'signed_outbound_echo',raw_event_id:'66666666-6666-4666-8666-666666666666'}
 ]){
  const b=baseline();b.message.metadata=metadata;
  assert.equal(api.classifyInstagramAcceptedSend(b).state,'unverified');
 }
});
test('tampered source, UUID, MID, signature and server verification key fail closed',()=>{
 const baselineProof=run();
 assert.equal(baselineProof.state,'provider_accepted');
 const b=baseline();const signed=verified(b);
 for(const changed of [
  {signature:'0'.repeat(64)},{evidenceRef:'webhook:'+EVENT},
  {evidenceRef:'send:66666666-6666-4666-8666-666666666666'},
  {source:'verified_signed_webhook'},{providerMessageId:'wrong_mid'},
  {organizationId:LEAD},{leadId:ORG},{messageId:LEAD},
  {acceptedAt:'2026-11-11T10:00:00.123455+00:00'},
 ]){
  assert.equal(run({verifiedProvenance:{...signed,...changed}}).state,'unverified');
 }
 assert.equal(run({provenanceVerificationKey:'short'}).state,'unverified');
 assert.equal(run({provenanceVerificationKey:'a'.repeat(40)}).state,'unverified');
});
test('wrong tenant, lead, CRM message, conversation and provider MID fail even with a signed proof',()=>{
 for(const patch of [{organizationId:LEAD},{leadId:ORG},{conversationId:LEAD},
  {messageId:LEAD},{expectedProviderMessageId:'different'}]){
  assert.equal(run(patch).state,'unverified');
 }
 for(const patch of [{organization_id:LEAD},{lead_id:ORG},{conversation_id:LEAD},
  {id:ORG},{external_message_id:'changed_mid'}]){
  assert.equal(run({},patch).state,'unverified');
 }
});
test('queued, failed, read and inbound CRM rows never inherit an accepted attestation',()=>{
 for(const status of ['received','failed','queued','delivered','read']){
  assert.equal(run({},{status}).state,'unverified');
 }
 assert.equal(run({},{direction:'inbound'}).state,'unverified');
});
test('invalid timestamp, missing source and wrong evidence type fail closed',()=>{
 for(const sent_at of [null,'bad time','2026-11-11','2026-11-11T10:00:00']){
  assert.equal(run({},{sent_at}).state,'unverified');
 }
 assert.equal(run({verifiedProvenance:null}).state,'unverified');
 assert.equal(run({verifiedProvenance:{...verified(baseline()),evidenceRef:'bad'}}).state,'unverified');
});
test('microsecond-aware verified receipt rejects a one-microsecond acceptedAt mismatch',()=>{
 const b=baseline();
 const p=verified(b);
 assert.equal(run({verifiedProvenance:{...p,acceptedAt:'2026-11-11T10:00:00.123455Z'}}).state,'unverified');
 const withOffset={...p,acceptedAt:'2026-11-11T15:30:00.123456+05:30'};
 const parts=['dm-link-instagram-evidence-v1',withOffset.source,withOffset.organizationId,
  withOffset.leadId,withOffset.conversationId,withOffset.messageId,
  withOffset.providerMessageId,withOffset.acceptedAt,withOffset.evidenceRef];
 withOffset.signature=createHmac('sha256',SECRET).update(parts.join('\\n'),'utf8').digest('hex');
 assert.equal(run({verifiedProvenance:withOffset}).state,'provider_accepted');
});
test('mutated CRM metadata cannot fabricate acceptance, and authentic attestation is not derived from it',()=>{
 for(const metadata of [{},{provider:'whatsapp'},
  {provider:'instagram',source:'signed_outbound_echo',raw_event_id:EVENT}]){
  assert.equal(run({}, {metadata}).state,'provider_accepted');
 }
 assert.equal(run({verifiedProvenance:null},{
  metadata:{provider:'instagram',send_mode:'human_manual',policy_checked:true}
 }).state,'unverified');
});
test('bounded projection emits no secret verification key or personal information',()=>{
 const b=baseline();b.verifiedProvenance=verified(b);
 b.message.body='PRIVATE_MESSAGE_BODY';
 b.message.metadata.customerPhone='+919876543210';
 b.message.metadata.clientIP='192.0.2.45';
 const result=api.classifyInstagramAcceptedSend(b);
 assert.deepEqual(Object.keys(result).sort(),[
  'acceptedAt','canAutoSend','provenance','recipientDeliveryVerified','state'
 ].sort());
 const json=JSON.stringify(result);
 for(const secret of ['PRIVATE_MESSAGE_BODY','+919876543210','192.0.2.45',
  SECRET,'customerPhone','clientIP','rawToken','provider_mid'])assert.equal(json.includes(secret),false);
});
test('a missing HMAC receipt emits an exact unverified safe projection',()=>{
 const b=baseline();
 assert.deepEqual(api.classifyInstagramAcceptedSend(b),{
  state:'unverified',acceptedAt:null,provenance:'unverified',
  recipientDeliveryVerified:false,canAutoSend:false
 });
});
