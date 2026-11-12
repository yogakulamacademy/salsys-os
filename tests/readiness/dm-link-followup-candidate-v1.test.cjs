const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source=fs.readFileSync(path.resolve(__dirname,'../../lib/ai/dm-link-followup-candidate.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const api={};new Function('require','exports',code)(()=>{throw Error('No imports expected')},api);
const ID={o:'11111111-1111-4111-8111-111111111111',lead:'22222222-2222-4222-8222-222222222222',conv:'33333333-3333-4333-8333-333333333333',msg:'44444444-4444-4444-8444-444444444444',owner:'55555555-5555-4555-8555-555555555555'};
const baseline=()=>({
 activeOrganizationId:ID.o,organizationId:ID.o,leadId:ID.lead,conversationId:ID.conv,messageId:ID.msg,linkId:'opaqueLink_123456',channel:'instagram',staffCanWorkLead:true,
 processingPurposePermitted:true,linkRevoked:false,linkExpiresAt:'2026-11-15T10:00:00Z',deliveredAt:'2026-11-11T10:00:00Z',sourceReadAt:'2026-11-12T12:01:00Z',now:'2026-11-12T12:02:00Z',inboundCoverage:'verified_since_send',inboundAfterSend:false,taskCoverage:'complete',anyOpenFollowup:false,existingIdempotentTask:false,optedOut:false,humanAlreadyHandled:false,leadStage:'engaged',assignedUserId:ID.owner,providerDelivery:'delivered',allowedWaitHours:24,
 evidence:{status:'available',messageEvidenceRef:'message:'+ID.msg,linkVisitEvidence:'not_observed',attention:'staff_review_due',attentionReason:'no_verified_visit',canAutoSend:false},
});
const run=changes=>api.buildDmLinkHumanReviewCandidate({...baseline(),...changes});
test('fresh eligible exact no-open evidence proposes one human review only',()=>{
 const r=run({}); assert.equal(r.status,'ready'); assert.equal(r.automaticSendAllowed,false); assert.equal(r.task.taskType,'human_review');assert.equal(r.task.sourceMessageRef,'message:'+ID.msg);
 assert.equal(r.task.assignedUserId,ID.owner); assert.match(r.task.idempotencyKey,/^dm-link-review-v1:/);
});
test('no private network-country, identity, token or pricing leaked into task description',()=>{
 for(const value of ['instagram_user_id','+91','@','networkCountry','pricingEligibility','https://','opaqueLink_123456']) {
  assert.equal(run({}).task.description.includes(value),false);
 }
});
test('cross tenant and unauthorized staff fail closed',()=>{
 for(const delta of [{activeOrganizationId:ID.owner},{organizationId:ID.owner},{staffCanWorkLead:false},{processingPurposePermitted:false},{leadId:'bad-id'},{messageId:'bad'}]) {
  const r=run(delta); assert.equal(r.status,'restricted');assert.equal(r.task,null);
 }
});
test('a customer reply, opt-out, handled conversation and terminal stage suppress tasks',()=>{
 for(const delta of [{inboundAfterSend:true},{optedOut:true},{humanAlreadyHandled:true},{leadStage:'enrolled'},{leadStage:'lost'},{leadStage:'nurture'},{leadStage:'not_now'}]){
  const r=run(delta); assert.notEqual(r.status,'ready');assert.equal(r.task,null);
 }
});
test('already pending followup or existing idempotent task never creates second suggestion',()=>{
 for(const delta of [{anyOpenFollowup:true},{existingIdempotentTask:true}]) assert.equal(run(delta).status,'already_handled');
});
test('stale, future and missing CRM source read prevents followup',()=>{
 for(const delta of [{sourceReadAt:'2026-11-12T11:50:00Z'},{sourceReadAt:'2026-11-12T13:00:00Z'},{sourceReadAt:'garbage'}])assert.equal(run(delta).status,'insufficient_evidence');
});
test('partial or unknown inbound or task coverage fails closed',()=>{
 for(const delta of [{inboundCoverage:'partial'},{inboundCoverage:'unavailable'},{inboundAfterSend:null},{taskCoverage:'partial'},{taskCoverage:'unavailable'}])assert.equal(run(delta).status,'insufficient_evidence');
});
test('provider API acceptance alone never proves delivery',()=>{
 for(const delta of [{providerDelivery:'provider_accepted'},{providerDelivery:'unknown'},{providerDelivery:'failed'}])assert.equal(run(delta).status,'insufficient_evidence');
});
test('invalid or expired timeline and wait period fail closed',()=>{
 for(const delta of [{now:'invalid'},{linkExpiresAt:'2026-11-12T11:00:00Z'},{deliveredAt:'2026-11-15T00:00:00Z'},{allowedWaitHours:169},{allowedWaitHours:0},{allowedWaitHours:1.5}])assert.notEqual(run(delta).status,'ready');
});
test('before waiting period ends no task is proposed',()=>{
 assert.equal(run({now:'2026-11-11T11:00:00Z',sourceReadAt:'2026-11-11T10:59:00Z'}).status,'not_due');
});
test('visit observed, ambiguous click or tracking restricted never treated as did not click',()=>{
 for(const patch of [{linkVisitEvidence:'country_observed'},{linkVisitEvidence:'observed_country_unknown'},{linkVisitEvidence:'ambiguous_request'},{linkVisitEvidence:'restricted'},{status:'restricted'},{attention:'none'}]){
  const r=run({evidence:{...baseline().evidence,...patch}});assert.equal(r.status,'insufficient_evidence');
 }
});
test('source message must be exact current bound outbound message',()=>{
 const r=run({evidence:{...baseline().evidence,messageEvidenceRef:'message:'+ID.owner}});assert.equal(r.status,'insufficient_evidence');
});
test('revoked link and non-instagram channel are not eligible',()=>{
 for(const delta of [{linkRevoked:true},{channel:'whatsapp'},{channel:'other'}])assert.equal(run(delta).status,'ineligible');
});
test('invalid assignment is not silently re-assigned',()=>{
 assert.equal(run({assignedUserId:'unknown'}).status,'insufficient_evidence');
 assert.equal(run({assignedUserId:null}).status,'ready');
});
test('PostgreSQL microsecond timestamps are accepted',()=>{
 const r=run({deliveredAt:'2026-11-11T10:00:00.123456+00:00',sourceReadAt:'2026-11-12T12:01:00.123456+00:00',now:'2026-11-12T12:02:00.654321+00:00'});
 assert.equal(r.status,'ready');
});


test('provider-accepted outbound with no verified click produces truthful staff status review, not a delivery claim',()=>{
 const r=run({
  providerDelivery:'provider_accepted',
  deliveredAt:null,
  providerAcceptedAt:'2026-11-11T10:00:00Z',
  sourceSendEvidence:'exact_provider_message_id',
  evidence:{...baseline().evidence,attentionReason:'delivery_unconfirmed'},
 });
 assert.equal(r.status,'ready');
 assert.equal(r.reason,'delivery_unconfirmed_staff_review');
 assert.equal(r.task.title,'Review Instagram course-link status');
 assert.ok(r.task.description.includes('delivery is not verified'));
 assert.ok(r.task.description.includes('No website link visit was observed'));
 assert.equal(r.automaticSendAllowed,false);
});
test('Meta accepted is never silently promoted to delivered; wrong reason or provenance is rejected',()=>{
 const input={
  providerDelivery:'provider_accepted',deliveredAt:null,
  providerAcceptedAt:'2026-11-11T10:00:00Z',
  sourceSendEvidence:'exact_provider_message_id',
  evidence:{...baseline().evidence,attentionReason:'delivery_unconfirmed'},
 };
 for(const patch of [
  {sourceSendEvidence:'unverified'},
  {sourceSendEvidence:undefined},
  {providerAcceptedAt:null},
  {providerAcceptedAt:'invalid'},
  {deliveredAt:'2026-11-11T10:10:00Z'},
  {evidence:{...input.evidence,attentionReason:'no_verified_visit'}},
 ]) {
  const r=run({...input,...patch});
  assert.notEqual(r.status,'ready');
  assert.equal(r.task,null);
 }
});
test('accepted-only review still blocks replies, opt-outs, incomplete coverage, and observed visits',()=>{
 const input={
  providerDelivery:'provider_accepted',deliveredAt:null,
  providerAcceptedAt:'2026-11-11T10:00:00Z',
  sourceSendEvidence:'exact_provider_message_id',
  evidence:{...baseline().evidence,attentionReason:'delivery_unconfirmed'},
 };
 for(const patch of [
  {inboundAfterSend:true},{optedOut:true},{existingIdempotentTask:true},
  {taskCoverage:'partial'},{inboundCoverage:'partial'},
  {evidence:{...input.evidence,linkVisitEvidence:'country_observed'}},
 ]) {
  assert.notEqual(run({...input,...patch}).status,'ready');
 }
});
