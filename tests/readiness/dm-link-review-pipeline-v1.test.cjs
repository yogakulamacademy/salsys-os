const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
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
   attention:!observation&&arg.outboundState==='delivered'&&!arg.repliedSinceSend&&!arg.optedOut&&!arg.humanHandled&&!arg.existingTask&&!arg.leadClosedOrEnrolled?'staff_review_due':'none',attentionReason:!observation?'no_verified_visit':'visit_recorded'};
 }
};
const fakeCandidate={buildDmLinkHumanReviewCandidate(arg){candidateCalls++;lastCandidate=arg;
 if(arg.evidence.status!=='available'||arg.evidence.attention!=='staff_review_due'||arg.providerDelivery!=='delivered'||
   !arg.deliveredAt||arg.inboundCoverage!=='verified_since_send'||arg.inboundAfterSend!==false||arg.taskCoverage!=='complete'||
   arg.optedOut||arg.humanAlreadyHandled||arg.anyOpenFollowup||arg.existingIdempotentTask)return {status:'insufficient_evidence',reason:'not_eligible',task:null};
 const due=Date.parse(arg.now)-Date.parse(arg.deliveredAt)>=arg.allowedWaitHours*3600000;
 const fresh=Date.parse(arg.now)-Date.parse(arg.sourceReadAt)<=300000;
 if(!due||!fresh)return {status:'not_due',reason:'not_due',task:null};
 return {status:'ready',reason:'staff_attention_due',task:{taskType:'human_review',idempotencyKey:'dm-link-review-v1:'+arg.organizationId+':'+arg.linkId+':'+arg.allowedWaitHours, leadId:arg.leadId,sourceMessageRef:arg.evidence.messageEvidenceRef}};
 }};
const source=fs.readFileSync(path.resolve(__dirname,'../../lib/ai/dm-link-review-pipeline.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const api={};
new Function('require','exports',compiled)(name=>{
 if(name==='./dm-link-crm-evidence')return fakeCrm;
 if(name==='./dm-link-followup-candidate')return fakeCandidate;
 throw Error('Unexpected dependency '+name);
},api);
function example(){return {
 snapshot:{activeOrganizationId:org,selectedLeadId:lead,staffCanWorkLead:true,linkPurposePermitted:true,
  lead:{id:lead,organization_id:org},
  conversation:{id:conv,organization_id:org,lead_id:lead,channel:'instagram',external_account_id:'account_1',metadata:{instagram_user_id:'ig_sender_9'}},
  message:{id:message,organization_id:org,lead_id:lead,conversation_id:conv,direction:'outbound',external_message_id:'provider_mid_1',sent_at:'2026-11-11T10:02:00Z'},
  link:{id:'internal_link_9999',organization_id:org,lead_id:lead,conversation_id:conv,crm_message_id:message,instagram_account_id:'account_1',instagram_recipient_id:'ig_sender_9',provider_message_id:'provider_mid_1',issued_at:'2026-11-11T10:00:00Z',expires_at:'2026-11-14T10:00:00Z',revoked_at:null,purpose:'course_info_link'}},
 observations:[],clickCoverage:'supported',outboundState:'delivered',deliveredAt:'2026-11-11T10:05:00Z',sourceReadAt:'2026-11-12T10:06:00Z',now:'2026-11-12T10:07:00Z',waitingHours:24,
 inboundCoverage:'verified_since_send',inboundAfterSend:false,taskCoverage:'complete',anyOpenFollowup:false,existingIdempotentTask:false,optedOut:false,humanAlreadyHandled:false,leadStage:'engaged',assignedUserId:owner
};}
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
test('provider accepted without independent delivery cannot create task',()=>{
 const r=evalWith({outboundState:'provider_accepted',deliveredAt:null});assert.equal(r.humanReview,'none');assert.equal(r.taskCandidate,null);
});
test('provider delivery timestamp contradicting unconfirmed state is restricted',()=>{
 const r=evalWith({outboundState:'unknown'});assert.equal(r.status,'restricted');assert.equal(candidateCalls,0);
});
test('observed link suppresses no-click task without making a pricing determination',()=>{
 const r=evalWith({observations:[{eventId:'browser_event'}]});assert.equal(r.status,'available');assert.equal(r.observedNetworkCountry,'AE');assert.equal(r.humanReview,'none');assert.equal(r.pricingEligibility,'undetermined');assert.equal(r.countryOfResidenceVerified,false);
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
