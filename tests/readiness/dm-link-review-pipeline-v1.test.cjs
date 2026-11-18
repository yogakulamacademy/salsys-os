const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const {createHmac}=require('node:crypto');
const PROOF_KEY='TEST_ONLY_pipeline_verified_provenance_secret_00001';
const clockSource=fs.readFileSync(path.resolve(__dirname,'../../lib/ai/dm-link-time.ts'),'utf8');
const clockCode=ts.transpileModule(clockSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const realClock={};
new Function('require','exports',clockCode)(()=>{throw Error('Unexpected clock import')},realClock);
const org='11111111-1111-4111-8111-111111111111', lead='22222222-2222-4222-8222-222222222222';
const conv='33333333-3333-4333-8333-333333333333', message='44444444-4444-4444-8444-444444444444';
const owner='55555555-5555-4555-8555-555555555555';
let bindCalls=0, projectionCalls=0, candidateCalls=0, lastProjection=null, lastCandidate=null;
const fakeCrm={
 bindDmLinkToCrmMessage(s){bindCalls++;
  if(!s||s.staffCanWorkLead!==true||s.linkPurposePermitted!==true||!s.link||!s.conversation||!s.message||!s.lead||
   s.activeOrganizationId!==s.link.organization_id || s.activeOrganizationId!==s.conversation.organization_id||
   s.selectedLeadId!==s.lead.id||s.selectedLeadId!==s.link.lead_id||
   s.link.crm_message_id!==s.message.id ||s.link.provider_message_id!==s.message.external_message_id||
   s.link.instagram_recipient_id!==s.conversation.metadata.instagram_user_id||
   s.link.instagram_account_id!==s.conversation.external_account_id)return {status:'mismatch'};
  return {status:'linked',linkId:s.link.id,leadId:s.selectedLeadId,organizationId:s.activeOrganizationId,conversationId:s.conversation.id,messageEvidenceRef:'message:'+s.message.id};
 },
 projectDmLinkStaffEvidence(arg){projectionCalls++;lastProjection=arg;
  if(arg.coverage!=='supported')return {status:'restricted'};
  const observation=arg.observations[0];
  return {status:'available',messageEvidenceRef:'message:'+arg.snapshot.message.id,canAutoSend:false,pricingEligibility:'undetermined',
   linkVisitEvidence:observation?'country_observed':'not_observed', observedNetworkCountry:observation?'AE':null,
   attention:!observation&&['delivered','provider_accepted'].includes(arg.outboundState)&&!arg.repliedSinceSend&&!arg.optedOut&&!arg.humanHandled&&!arg.existingTask&&!arg.leadClosedOrEnrolled?'staff_review_due':'none',attentionReason:observation?'visit_recorded':arg.outboundState==='provider_accepted'?'delivery_unconfirmed':'no_verified_visit'};
 }
};
// Unlike the CRM fixture, the candidate builder here is the actual production
// policy module, not a mock. This exercises the 04→05 integration boundary.
const candidateSource=fs.readFileSync(path.resolve(__dirname,'../../lib/ai/dm-link-followup-candidate.ts'),'utf8');
const compiledCandidate=ts.transpileModule(candidateSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const realCandidate={};
new Function('require','exports',compiledCandidate)(name=>{if(name==='./dm-link-time')return realClock;throw Error('Unexpected import '+name)},realCandidate);
const fakeCandidate={buildDmLinkHumanReviewCandidate(arg){
 candidateCalls++;lastCandidate=arg;
 return realCandidate.buildDmLinkHumanReviewCandidate(arg);
}};
const sendSource=fs.readFileSync(path.resolve(__dirname,'../../lib/ai/dm-link-instagram-send-evidence.ts'),'utf8');
const compiledSend=ts.transpileModule(sendSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const realSend={};
new Function('require','exports',compiledSend)(name=>{if(name==='./dm-link-time')return realClock;if(name==='node:crypto')return require('node:crypto');throw Error('Unexpected import '+name)},realSend);
const lifecycleSource=fs.readFileSync(path.resolve(__dirname,'../../lib/ai/dm-link-registry-lifecycle.ts'),'utf8');
const compiledLifecycle=ts.transpileModule(lifecycleSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const realLifecycle={};
new Function('require','exports',compiledLifecycle)(name=>{if(name==='./dm-link-time')return realClock;throw Error('Unexpected import '+name)},realLifecycle);
const gateSource=fs.readFileSync(path.resolve(__dirname,'../../lib/ai/dm-link-attribution-gate.ts'),'utf8');
const compiledGate=ts.transpileModule(gateSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const realGate={};
new Function('require','exports',compiledGate)(name=>{
 if(name==='./dm-link-registry-lifecycle')return realLifecycle;
 if(name==='./dm-link-time')return realClock;
 throw Error('Unexpected import '+name);
},realGate);
const source=fs.readFileSync(path.resolve(__dirname,'../../lib/ai/dm-link-review-pipeline.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const api={};
new Function('require','exports',compiled)(name=>{
 if(name==='./dm-link-crm-evidence')return fakeCrm;
 if(name==='./dm-link-followup-candidate')return fakeCandidate;
 if(name==='./dm-link-instagram-send-evidence')return realSend;
 if(name==='./dm-link-attribution-gate')return realGate;
 if(name==='./dm-link-time')return realClock;
 throw Error('Unexpected dependency '+name);
},api);
function sign(e,source='verified_send_api_response'){
 const p={source,organizationId:org,leadId:lead,conversationId:conv,messageId:message,
  providerMessageId:e.snapshot.message.external_message_id,
  acceptedAt:e.snapshot.message.sent_at,
  evidenceRef:(source==='verified_signed_webhook'?'webhook:':'send:')+'66666666-6666-4666-8666-666666666666'};
 const fields=['dm-link-instagram-evidence-v1',p.source,p.organizationId,
  p.leadId,p.conversationId,p.messageId,p.providerMessageId,p.acceptedAt,p.evidenceRef];
 p.signature=createHmac('sha256',PROOF_KEY).update(fields.join('\\n'),'utf8').digest('hex');
 return p;
}
function example(){const e={
 snapshot:{activeOrganizationId:org,selectedLeadId:lead,staffCanWorkLead:true,linkPurposePermitted:true,
  lead:{id:lead,organization_id:org},
  conversation:{id:conv,organization_id:org,lead_id:lead,channel:'instagram',external_account_id:'account_1',metadata:{instagram_user_id:'ig_sender_9'}},
  message:{id:message,organization_id:org,lead_id:lead,conversation_id:conv,direction:'outbound',external_message_id:'provider_mid_1',sent_at:'2026-11-11T10:02:00Z',status:'sent',metadata:{provider:'instagram',send_mode:'human_manual',policy_checked:true}},
  link:{id:'internal_link_9999',organization_id:org,lead_id:lead,conversation_id:conv,crm_message_id:message,instagram_account_id:'account_1',instagram_recipient_id:'ig_sender_9',provider_message_id:'provider_mid_1',issued_at:'2026-11-11T10:00:00Z',expires_at:'2026-11-14T10:00:00Z',revoked_at:null,state:'active',activated_at:'2026-11-11T10:03:00Z',purpose:'course_info_link'}},
 verifiedRegistry:{
  organizationId:org,leadId:lead,conversationId:conv,crmMessageId:message,
  linkId:'internal_link_9999',state:'active',sourceBindingCommitted:true,
  provenanceVerified:true,purposePermitted:true,revoked:false,
  tokenDigestMatched:true,linkIssuedAt:'2026-11-11T10:00:00Z',
  providerAcceptedAt:'2026-11-11T10:02:00Z',
  linkActivatedAt:'2026-11-11T10:03:00Z',
  linkExpiresAt:'2026-11-14T10:00:00Z'
 },
 observations:[],clickCoverage:'supported',outboundState:'delivered',deliveredAt:'2026-11-11T10:05:00Z',sourceReadAt:'2026-11-12T10:06:00Z',now:'2026-11-12T10:07:00Z',waitingHours:24,
 inboundCoverage:'verified_since_send',inboundAfterSend:false,taskCoverage:'complete',anyOpenFollowup:false,existingIdempotentTask:false,optedOut:false,humanAlreadyHandled:false,leadStage:'engaged',assignedUserId:owner
};e.provenanceVerificationKey=PROOF_KEY;e.verifiedInstagramProvenance=sign(e);return e;}
function observed(id='browser_event',at='2026-11-11T10:05:00Z'){
 return {eventId:id,linkId:'internal_link_9999',evidence:{
  organizationId:org,linkOrganizationId:org,conversationOrganizationId:org,
  visitOrganizationId:org,processingPurposePermitted:true,tokenRevoked:false,
  issuedAt:'2026-11-11T10:00:00Z',expiresAt:'2026-11-14T10:00:00Z',
  observedAt:at,signal:'browser_observation',suspectedPreviewOrBot:false,
  knownForwardedLink:false,networkCountry:'AE',networkCountrySource:'trusted_server'
 }};
}
function reset(){bindCalls=0;projectionCalls=0;candidateCalls=0;lastProjection=null;lastCandidate=null;}
function evalWith(changes={}){reset();return api.evaluateDmLinkReviewPipeline({...example(),...changes});}

test('eligible no-click case can propose an INTERNAL human task but never auto send',()=>{
 const r=evalWith();assert.equal(r.status,'available');assert.equal(r.humanReview,'candidate');assert.equal(r.taskCandidate.taskType,'human_review');assert.equal(r.automaticSendAllowed,false);
});
test('no source link and malformed snapshot fail closed without downstream calls',()=>{
 const r=evalWith({snapshot:{...example().snapshot,link:null}});assert.equal(r.status,'restricted');assert.equal(projectionCalls,0);assert.equal(candidateCalls,0);
});
test('mismatched lead, tenant, Instagram recipient, provider MID all fail binding before exposure',()=>{
 for(const mutate of [s=>s.snapshot.activeOrganizationId=owner,s=>s.snapshot.selectedLeadId=owner,s=>s.snapshot.link.instagram_recipient_id='intruder',s=>s.snapshot.link.provider_message_id='wrong_mid']){
  const x=example();mutate(x);const r=evalWith(x);assert.equal(r.status,'restricted');assert.equal(projectionCalls,0);assert.equal(candidateCalls,0);
 }
});
test('derived candidate IDs come from binding not separate client input',()=>{
 evalWith();assert.equal(lastCandidate.organizationId,org);assert.equal(lastCandidate.leadId,lead);assert.equal(lastCandidate.messageId,message);assert.equal(lastCandidate.linkId,'internal_link_9999');
});
test('delivery earlier than send is inconsistent, no review',()=>{
 const r=evalWith({deliveredAt:'2026-11-11T09:59:00Z'});assert.equal(r.status,'restricted');assert.equal(projectionCalls,0);
});
test('future delivery and missing independent delivery fail closed',()=>{
 for(const deliveredAt of ['2026-11-13T20:00:00Z',null]){
  const r=evalWith({deliveredAt});assert.equal(r.status,'restricted');assert.equal(candidateCalls,0);
 }
});
test('provider accepted without independent delivery produces a truthful status-review candidate only',()=>{
 const r=evalWith({outboundState:'provider_accepted',deliveredAt:null});
 assert.equal(r.humanReview,'candidate');
 assert.equal(r.reason,'delivery_unconfirmed_staff_review');
 assert.equal(r.taskCandidate.title,'Review Instagram course-link status');
 assert.ok(r.taskCandidate.description.includes('delivery is not verified'));
 assert.equal(r.automaticSendAllowed,false);
 assert.equal(lastCandidate.sourceSendEvidence,'exact_provider_message_id');
 assert.equal(lastCandidate.providerAcceptedAt,'2026-11-11T10:02:00Z');
});
test('provider delivery timestamp contradicting unconfirmed state is restricted',()=>{
 const r=evalWith({outboundState:'unknown'});assert.equal(r.status,'restricted');assert.equal(candidateCalls,0);
});
test('observed link suppresses no-click task without making a pricing determination',()=>{
 const r=evalWith({observations:[observed()]});assert.equal(r.status,'available');assert.equal(r.observedNetworkCountry,'AE');assert.equal(r.humanReview,'none');assert.equal(r.pricingEligibility,'undetermined');assert.equal(r.countryOfResidenceVerified,false);
});
test('partial inbound coverage is passed as reply unknown, never no-click',()=>{
 const r=evalWith({inboundCoverage:'partial'});assert.equal(lastProjection.repliedSinceSend,true);assert.equal(r.humanReview,'none');
});
test('verified customer reply suppresses review',()=>{
 const r=evalWith({inboundAfterSend:true});assert.equal(lastProjection.repliedSinceSend,true);assert.equal(r.humanReview,'none');
});
test('opt-out and human takeover suppress review',()=>{
 for(const opts of [{optedOut:true},{humanAlreadyHandled:true}]){
  const r=evalWith(opts);assert.equal(r.humanReview,'none');assert.equal(r.automaticSendAllowed,false);
 }
});
test('closed and deferred stages suppress review',()=>{
 for(const leadStage of ['enrolled','closed_won','nurture','not_now','lost']){
  const r=evalWith({leadStage});assert.equal(lastProjection.leadClosedOrEnrolled,true);assert.equal(r.humanReview,'none');
 }
});
test('existing task or followup suppresses duplicate proposal',()=>{
 for(const opts of [{anyOpenFollowup:true},{existingIdempotentTask:true}]){
  const r=evalWith(opts);assert.equal(lastProjection.existingTask,true);assert.equal(r.humanReview,'none');
 }
});
test('stale read and incomplete task coverage fail human review',()=>{
 for(const opts of [{sourceReadAt:'2026-11-12T09:00:00Z'},{taskCoverage:'partial'},{taskCoverage:'unavailable'}]){
  const r=evalWith(opts);assert.equal(r.humanReview,'none');assert.equal(r.taskCandidate,null);
 }
});
test('bounded staff projection never reflects recipient, link token, IP or pricing tier',()=>{
 const a=example();a.snapshot.conversation.metadata.private='private_message';
 const r=evalWith(a);const visible=JSON.stringify(r);
 for(const secret of ['private_message','ig_sender_9','account_1','external_message_id','token','+91','USD','INR'])assert.ok(!visible.includes(secret),secret);
});
test('ISO timestamps with six-digit fractions remain accepted as delivered evidence',()=>{
 const r=evalWith({deliveredAt:'2026-11-11T10:05:00.123456+00:00',now:'2026-11-12T10:07:00.123456+00:00'});
 assert.equal(r.status,'available');
});

test('unknown outbound state cannot create accepted-send status review',()=>{
 const r=evalWith({outboundState:'unknown',deliveredAt:null});
 assert.equal(r.humanReview,'none');
 assert.equal(r.taskCandidate,null);
});
test('Meta accepted with observed link visit is not a no-visit task',()=>{
 const r=evalWith({outboundState:'provider_accepted',deliveredAt:null,observations:[observed('observed_visit')]});
 assert.equal(r.status,'available');
 assert.equal(r.humanReview,'none');
 assert.equal(r.pricingEligibility,'undetermined');
});
test('Meta accepted with incomplete inbound coverage must not trigger review',()=>{
 const r=evalWith({outboundState:'provider_accepted',deliveredAt:null,inboundCoverage:'partial'});
 assert.equal(r.humanReview,'none');
});

test('provider-accepted staff review requires exact independently authenticated Meta provenance',()=>{
 for(const delta of [
  s=>s.snapshot.message.status='queued',
  s=>s.verifiedInstagramProvenance=null,
  s=>s.verifiedInstagramProvenance.signature='0'.repeat(64),
  s=>s.verifiedInstagramProvenance.providerMessageId='wrong_mid',
  s=>s.provenanceVerificationKey='invalid_client_key',
  s=>{s.verifiedInstagramProvenance=null;s.snapshot.message.metadata={
   provider:'instagram',source:'signed_outbound_echo',raw_event_id:'55555555-5555-4555-8555-555555555555'};}
 ]) {
  const s=example();delta(s);
  const r=evalWith({...s,outboundState:'provider_accepted',deliveredAt:null});
  assert.equal(r.status,'restricted');assert.equal(r.reason,'unverified_send_provenance');
  assert.equal(r.taskCandidate,null);
 }
});
test('signed outbound echo source can support accepted-only status review without a delivery claim',()=>{
 const s=example();
 s.snapshot.message.metadata={provider:'instagram',source:'signed_outbound_echo',raw_event_id:'55555555-5555-4555-8555-555555555555'};
 s.verifiedInstagramProvenance=sign(s,'verified_signed_webhook');
 const r=evalWith({...s,outboundState:'provider_accepted',deliveredAt:null});
 assert.equal(r.humanReview,'candidate');
 assert.equal(r.reason,'delivery_unconfirmed_staff_review');
 assert.equal(r.automaticSendAllowed,false);
});

test('no committed registry prevents all customer-linked visit projections and task candidates',()=>{
 const r=evalWith({verifiedRegistry:null});
 assert.equal(r.status,'restricted');assert.equal(r.reason,'unverified_activation_or_visit_evidence');
 assert.equal(projectionCalls,0);assert.equal(candidateCalls,0);assert.equal(r.taskCandidate,null);
});
test('reserved registry cannot generate a no-click staff review',()=>{
 const a=example();
 const r=evalWith({...a,verifiedRegistry:{...a.verifiedRegistry,state:'reserved'}});
 assert.equal(r.status,'restricted');assert.equal(candidateCalls,0);
});
test('premature visitor observation is never retrospectively linked to Instagram recipient',()=>{
 const r=evalWith({observations:[observed('early_visit','2026-11-11T10:02:59.999999Z')]});
 assert.equal(r.status,'restricted');assert.equal(projectionCalls,0);
 assert.equal(r.observedNetworkCountry,null);assert.equal(r.humanReview,'none');
});
test('withdrawn processing purpose or revoked token blocks both visit and no-click review',()=>{
 for(const patch of [{purposePermitted:false},{revoked:true},{tokenDigestMatched:false}]){
  const a=example();
  const r=evalWith({...a,verifiedRegistry:{...a.verifiedRegistry,...patch}});
  assert.equal(r.status,'restricted');assert.equal(candidateCalls,0);
 }
});
test('wrong CRM message or lead in committed registry is blocked before any projection',()=>{
 for(const patch of [{crmMessageId:owner},{leadId:owner},{linkId:'other_link_99'}]){
  const a=example();
  const r=evalWith({...a,verifiedRegistry:{...a.verifiedRegistry,...patch}});
  assert.equal(r.status,'restricted');assert.equal(projectionCalls,0);
 }
});

test('source lifecycle disagreement always suppresses country evidence and task proposals',()=>{
 const patches=[
  {issued_at:'2026-11-11T10:00:00.000001Z'},
  {expires_at:'2026-11-14T10:00:00.000001Z'},
  {state:'reserved'},
  {activated_at:'2026-11-11T10:03:00.000001Z'},
  {revoked_at:'2026-11-11T10:04:00Z'}
 ];
 for(const patch of patches){
  const s=example();Object.assign(s.snapshot.link,patch);
  const r=evalWith({...s,observations:[observed()]});
  assert.equal(r.status,'restricted');assert.equal(r.observedNetworkCountry,null);
  assert.equal(r.taskCandidate,null);assert.equal(projectionCalls,0);
 }
});
test('delivery one microsecond before sent timestamp is rejected even within same millisecond',()=>{
 const s=example();s.snapshot.message.sent_at='2026-11-11T10:02:00.000002Z';
 s.verifiedRegistry.providerAcceptedAt=s.snapshot.message.sent_at;
 s.verifiedInstagramProvenance=sign(s);
 const r=evalWith({...s,deliveredAt:'2026-11-11T10:02:00.000001Z'});
 assert.equal(r.status,'restricted');assert.equal(r.taskCandidate,null);
});
test('delivered status also requires source attestation; forged metadata cannot supply it',()=>{
 const s=example();s.verifiedInstagramProvenance=null;
 s.snapshot.message.metadata={provider:'instagram',policy_checked:true,send_mode:'human_manual'};
 const r=evalWith(s);
 assert.equal(r.status,'restricted');assert.equal(r.reason,'unverified_send_provenance');
 assert.equal(r.taskCandidate,null);assert.equal(r.observedNetworkCountry,null);
});
