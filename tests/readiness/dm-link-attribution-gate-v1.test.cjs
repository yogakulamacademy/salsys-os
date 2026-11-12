const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(relative, dependencies = {}) {
 const contents = fs.readFileSync(path.join(root, relative), 'utf8');
 const result = ts.transpileModule(contents, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
 });
 const errors = (result.diagnostics || []).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length, 0, relative);
 const exports = {};
 new Function('require', 'exports', result.outputText)(name=>{
  if(Object.hasOwn(dependencies,name))return dependencies[name];
  throw Error('Unexpected dependency '+name);
 },exports);
 return exports;
}
const clock=load('lib/ai/dm-link-time.ts');
const lifecycle=load('lib/ai/dm-link-registry-lifecycle.ts',{'./dm-link-time':clock});
const gate=load('lib/ai/dm-link-attribution-gate.ts', {'./dm-link-registry-lifecycle':lifecycle,'./dm-link-time':clock});
const org='11111111-1111-4111-8111-111111111111';
const lead='22222222-2222-4222-8222-222222222222';
const conv='33333333-3333-4333-8333-333333333333';
const msg='44444444-4444-4444-8444-444444444444';
const link='internal_link_9999';
const registry=()=>({
 linkId:link,leadId:lead,conversationId:conv,crmMessageId:msg,
 organizationId:org,state:'active',sourceBindingCommitted:true,
 provenanceVerified:true,purposePermitted:true,revoked:false,
 tokenDigestMatched:true,linkIssuedAt:'2026-11-11T10:00:00Z',
 providerAcceptedAt:'2026-11-11T10:02:00Z',
 linkActivatedAt:'2026-11-11T10:03:00Z',
 linkExpiresAt:'2026-11-15T10:00:00Z',
});
const ref=()=>({organizationId:org,leadId:lead,conversationId:conv,crmMessageId:msg,linkId:link});
const sourceLink=()=>({
 id:link,organization_id:org,lead_id:lead,conversation_id:conv,crm_message_id:msg,
 instagram_account_id:'account_1',instagram_recipient_id:'ig_sender_9',
 provider_message_id:'provider_mid_1',issued_at:'2026-11-11T10:00:00Z',
 expires_at:'2026-11-15T10:00:00Z',revoked_at:null,purpose:'course_info_link',
 state:'active',activated_at:'2026-11-11T10:03:00Z',
});
const event=(date='2026-11-11T10:05:00Z')=>({
 eventId:'evidence_111111',linkId:link,evidence:{
  organizationId:org,linkOrganizationId:org,
  conversationOrganizationId:org,visitOrganizationId:org,
  processingPurposePermitted:true,tokenRevoked:false,
  issuedAt:'2026-11-11T10:00:00Z',
  expiresAt:'2026-11-15T10:00:00Z',
  observedAt:date,signal:'browser_observation',
  suspectedPreviewOrBot:false,knownForwardedLink:false,
  networkCountry:'AE',networkCountrySource:'trusted_server',
 }
});
const run=(changes={})=>gate.gateDmLinkObservationHistory({
 reference:ref(),sourceLink:sourceLink(),
 sourceMessageSentAt:'2026-11-11T10:02:00Z',
 registry:registry(),observations:[],
 now:'2026-11-12T12:02:00Z',...changes,
});
test('active committed source-matched registry permits empty click history for staff policy only',()=>{
 const r=run();assert.equal(r.status,'permitted');
 assert.equal(r.eligibleForStaffProjection,true);
 assert.equal(r.automaticSendAllowed,false);
 assert.equal(r.residenceVerified,false);
 assert.equal(r.pricingEligibility,'undetermined');
});
test('active committed source-matched registry permits postactivation observation',()=>{
 const r=run({observations:[event()]});
 assert.equal(r.status,'permitted');
});
test('missing registry or wrong message/lead/conversation/tenant/link rejects',()=>{
 assert.equal(run({registry:null}).status,'restricted');
 for(const changes of [
  {reference:{...ref(),organizationId:lead}},
  {reference:{...ref(),leadId:msg}},
  {reference:{...ref(),conversationId:msg}},
  {reference:{...ref(),crmMessageId:conv}},
  {reference:{...ref(),linkId:'different_link'}}
 ])assert.equal(run(changes).reason,'source_mismatch');
});
test('uncommitted reserved link cannot support no-click staff proposal',()=>{
 for(const changes of [
  {state:'reserved'}, {sourceBindingCommitted:false},
  {provenanceVerified:false},{purposePermitted:false},
  {revoked:true},{tokenDigestMatched:false}
 ]) {
  assert.equal(run({registry:{...registry(),...changes}}).status,'restricted');
 }
});
test('expired registry now cannot support misleading no-click task',()=>{
 assert.equal(run({now:'2026-11-15T10:00:00Z'}).status,'restricted');
});
test('even plausible visit before activation rejects entire history',()=>{
 const r=run({observations:[event('2026-11-11T10:02:59.999999Z')]});
 assert.equal(r.status,'restricted');assert.equal(r.reason,'preactivation_or_expired_event');
});
test('visit at activation microsecond is eligible but earlier microsecond is not',()=>{
 const r=registry();r.linkActivatedAt='2026-11-11T10:03:00.000002Z';
 assert.equal(run({registry:r,observations:[event('2026-11-11T10:03:00.000001Z')]}).status,'restricted');
 assert.equal(run({registry:r,observations:[event('2026-11-11T10:03:00.000002Z')]}).status,'permitted');
});
test('historical observations outside expiry are not retroactively attributed',()=>{
 assert.equal(run({observations:[event('2026-11-15T10:00:00Z')]}).status,'restricted');
});
test('unknown bot or forwarded event before activation is not linked either',()=>{
 const e=event('2026-11-11T10:01:00Z');
 e.evidence.signal='http_request';e.evidence.suspectedPreviewOrBot=true;
 assert.equal(run({observations:[e]}).status,'restricted');
});
test('event from another tenant/link or revoked-purpose observation fails closed',()=>{
 for(const e of [
  {...event(),linkId:'different_link'},
  {...event(),evidence:{...event().evidence,organizationId:lead}},
  {...event(),evidence:{...event().evidence,visitOrganizationId:lead}},
  {...event(),evidence:{...event().evidence,processingPurposePermitted:false}},
  {...event(),evidence:{...event().evidence,tokenRevoked:true}}
 ]) assert.equal(run({observations:[e]}).status,'restricted');
});
test('invalid, missing, or oversized event history fails closed',()=>{
 for(const observations of [null, Array(101).fill(event()),[{}],[{linkId:link,evidence:{}}]]) {
  assert.equal(run({observations}).status,'restricted');
 }
});
test('a mixed valid + preactivation history cannot be reduced to a false no-click',()=>{
 const r=run({observations:[event(),{...event('2026-11-11T10:01:00Z'),eventId:'evidence_22222'}]});
 assert.equal(r.status,'restricted');
 assert.equal(r.eligibleForStaffProjection,false);
});

test('source lifecycle mismatch blocks all staff evidence including empty history',()=>{
 const mismatch=[
  {sourceLink:{...sourceLink(),issued_at:'2026-11-11T09:59:59.999999Z'}},
  {sourceLink:{...sourceLink(),expires_at:'2026-11-15T10:00:00.000001Z'}},
  {sourceLink:{...sourceLink(),state:'reserved'}},
  {sourceLink:{...sourceLink(),activated_at:'2026-11-11T10:03:00.000001Z'}},
  {sourceLink:{...sourceLink(),revoked_at:'2026-11-11T10:04:00Z'}},
  {sourceMessageSentAt:'2026-11-11T10:01:59.999999Z'},
  {sourceLink:null}
 ];
 for(const delta of mismatch){
  const r=run(delta);assert.equal(r.status,'restricted');
  assert.equal(r.eligibleForStaffProjection,false);
  assert.equal(r.pricingEligibility,'undetermined');
 }
});
test('equivalent offset-aware timestamp is valid without trusting different lifecycle records',()=>{
 const r=run({sourceLink:{...sourceLink(),activated_at:'2026-11-11T15:33:00+05:30'}});
 assert.equal(r.status,'permitted');
});
