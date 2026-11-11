const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const load = (relative, deps={}) => {
 const code = ts.transpileModule(fs.readFileSync(path.join(root, relative),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={}; new Function('require','exports',code)(n => {if(Object.hasOwn(deps,n))return deps[n];throw Error(`Unexpected dependency ${n}`)},exports);return exports;
};
const intel=load('lib/ai/dm-link-intelligence.ts');
const coverage=load('lib/ai/dm-link-coverage.ts',{'./dm-link-intelligence':intel});
const crm=load('lib/ai/dm-link-crm-evidence.ts',{'./dm-link-intelligence':intel,'./dm-link-coverage':coverage});
const ids={org:'11111111-1111-4111-8111-111111111111',lead:'22222222-2222-4222-8222-222222222222',conv:'33333333-3333-4333-8333-333333333333',msg:'44444444-4444-4444-8444-444444444444'};
const snap=()=>({
 activeOrganizationId:ids.org, selectedLeadId:ids.lead,staffCanWorkLead:true,linkPurposePermitted:true,
 lead:{id:ids.lead,organization_id:ids.org},
 conversation:{id:ids.conv,organization_id:ids.org,lead_id:ids.lead,channel:'instagram',external_account_id:'igbusiness_123',metadata:{instagram_user_id:'iguser_999',irrelevantName:'Same Name'}},
 message:{id:ids.msg,organization_id:ids.org,lead_id:ids.lead,conversation_id:ids.conv,direction:'outbound',external_message_id:'igmid_121212',sent_at:'2026-11-11T11:00:00Z'},
 link:{id:'opaqueLink_123456',organization_id:ids.org,lead_id:ids.lead,conversation_id:ids.conv,crm_message_id:ids.msg,instagram_account_id:'igbusiness_123',instagram_recipient_id:'iguser_999',provider_message_id:'igmid_121212',issued_at:'2026-11-11T10:50:00Z',expires_at:'2026-11-13T11:00:00Z',revoked_at:null,purpose:'course_info_link'},
});
const observation=(patch={})=>({eventId:'event_222222222',linkId:'opaqueLink_123456',evidence:{
 organizationId:ids.org,linkOrganizationId:ids.org,conversationOrganizationId:ids.org,visitOrganizationId:ids.org,
 processingPurposePermitted:true,tokenRevoked:false,issuedAt:'2026-11-11T10:50:00Z',expiresAt:'2026-11-13T11:00:00Z',
 observedAt:'2026-11-11T13:00:00Z',signal:'browser_observation',suspectedPreviewOrBot:false,knownForwardedLink:false,networkCountry:'AE',networkCountrySource:'trusted_server',...patch}});
const project=(snapshot=snap(),obs=[],options={})=>crm.projectDmLinkStaffEvidence({
 snapshot, observations:obs, coverage:'supported',outboundState:'delivered',now:'2026-11-12T12:00:00Z',waitingHours:24,
 repliedSinceSend:false,optedOut:false,humanHandled:false,leadClosedOrEnrolled:false,existingTask:false,...options,
});

test('binds exact approved tenant, Instagram account, recipient, outbound CRM message and provider MID',()=>{
 const r=crm.bindDmLinkToCrmMessage(snap());
 assert.equal(r.status,'linked');assert.equal(r.organizationId,ids.org);assert.equal(r.messageEvidenceRef,`message:${ids.msg}`);
 assert.equal('instagram_recipient_id' in r,false);assert.equal('token' in r,false);
});
test('denied staff and disallowed processing purpose fail before any association',()=>{
 for(const patch of [{staffCanWorkLead:false},{linkPurposePermitted:false},{activeOrganizationId:null}]){
  const r=crm.bindDmLinkToCrmMessage({...snap(),...patch});assert.equal(r.status,'restricted');assert.equal(r.leadId,null);
 }
});
test('missing message/conversation/lead/link fails closed',()=>{
 for(const field of ['lead','conversation','message','link']){
  assert.equal(crm.bindDmLinkToCrmMessage({...snap(),[field]:null}).status,'incomplete');
 }
});
test('cross-tenant and cross-lead records never associate',()=>{
 for(const field of ['lead','conversation','message','link']){
  const a=snap();a[field].organization_id='55555555-5555-4555-8555-555555555555';
  assert.equal(crm.bindDmLinkToCrmMessage(a).status,'mismatch',field);
 }
 for(const field of ['conversation','message','link']){
  const a=snap();a[field].lead_id='66666666-6666-4666-8666-666666666666';
  assert.equal(crm.bindDmLinkToCrmMessage(a).status,'mismatch',field);
 }
});
test('same display name and similar timestamps cannot override explicit provider recipient mismatch',()=>{
 const a=snap();a.link.instagram_recipient_id='iguser_888';
 assert.equal(crm.bindDmLinkToCrmMessage(a).status,'mismatch');
});
test('provider account, message MID and CRM conversation ID must match exactly',()=>{
 for(const [section,field,value] of [
  ['link','instagram_account_id','igbusiness_888'],['message','external_message_id','igmid_8888'],
  ['link','crm_message_id','77777777-7777-4777-8777-777777777777'],
  ['message','conversation_id','77777777-7777-4777-8777-777777777777'],
  ['link','provider_message_id','igmid_9898']]){
  const a=snap();a[section][field]=value;assert.equal(crm.bindDmLinkToCrmMessage(a).status,'mismatch');
 }
});
test('inbound messages, another channel and absent recipient metadata cannot be linked',()=>{
 for(const [section,field,value] of [['message','direction','inbound'],['conversation','channel','whatsapp'],['conversation','metadata',{}]]){
  const a=snap();a[section][field]=value;assert.equal(crm.bindDmLinkToCrmMessage(a).status,'mismatch');
 }
});
test('links require accepted provider MID and nonrevoked bounded send/issue timestamps',()=>{
 for(const [section,field,value] of [
  ['message','external_message_id',null],['link','revoked_at','2026-11-11T12:00:00Z'],
  ['message','sent_at','2026-11-10T10:00:00Z'],['message','sent_at','2026-11-15T10:00:00Z'],
  ['link','issued_at','not-a-time']]){
  const a=snap();a[section][field]=value;assert.notEqual(crm.bindDmLinkToCrmMessage(a).status,'linked');
 }
});
test('observed network country appears in staff preview but not customer residence or pricing eligibility',()=>{
 const r=project(snap(),[observation()]);assert.equal(r.status,'available');
 assert.equal(r.observedNetworkCountry,'AE');assert.equal(r.countryOfResidenceVerified,false);
 assert.equal(r.pricingEligibility,'undetermined');assert.equal(r.attention,'none');assert.equal(r.canAutoSend,false);
});
test('no click after delivered message yields staff-review only, never automated send',()=>{
 const r=project();assert.equal(r.attention,'staff_review_due');assert.equal(r.attentionReason,'no_verified_visit');assert.equal(r.canAutoSend,false);
});
test('reply/optout/takeover/enrollment/no coverage prohibit staff-review recommendation',()=>{
 for(const patch of [{repliedSinceSend:true},{optedOut:true},{humanHandled:true},{leadClosedOrEnrolled:true},{coverage:'missing'}]){
  const r=project(snap(),[],patch);assert.equal(r.attention,'none');
 }
});
test('preview cannot expose a raw link token, phone number, Instagram sender ID or metadata',()=>{
 const a=snap();a.conversation.metadata.privateNote='secretpass';
 const result=JSON.stringify(project(a,[observation()]));
 for(const secret of ['secretpass','iguser_999','igbusiness_123','opaqueLink_123456'])assert.equal(result.includes(secret),false,secret);
});
test('conflicting country visits never become a definitive region or a price category',()=>{
 const r=project(snap(),[observation(),{...observation({networkCountry:'IN',observedAt:'2026-11-11T14:00:00Z'}),eventId:'event_333333333'}]);
 assert.equal(r.linkVisitEvidence,'conflicting_countries');assert.equal(r.observedNetworkCountry,null);assert.equal(r.pricingEligibility,'undetermined');
});
test('foreign link evidence and malformed event histories suppress staff projection',()=>{
 const e=observation({visitOrganizationId:'55555555-5555-4555-8555-555555555555'});
 const r=project(snap(),[e]);assert.equal(r.status,'restricted');assert.equal(r.messageEvidenceRef,null);
});
test('unavailable tracking must not be misreported as no click',()=>{
 const r=project(snap(),[],{coverage:'ambiguous'});assert.equal(r.status,'restricted');assert.equal(r.attention,'none');
});


test('PostgreSQL microsecond timestamps from Supabase do not falsely reject exact binding',()=>{
 const a=snap();
 a.message.sent_at='2026-11-11T11:00:00.123456+00:00';
 a.link.issued_at='2026-11-11T10:50:00.000001+00:00';
 a.link.expires_at='2026-11-13T11:00:00.999999+00:00';
 assert.equal(crm.bindDmLinkToCrmMessage(a).status,'linked');
});
