const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../../lib/ai/dm-link-registry-lifecycle.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const api = {};
const clockCode=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../lib/ai/dm-link-time.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const clock={};new Function('require','exports',clockCode)(()=>{throw Error('Unexpected clock import')},clock);
new Function('require', 'exports', compiled.outputText)((name) => {if(name==='./dm-link-time')return clock;throw Error('Unexpected dependency '+name);}, api);

const org='11111111-1111-4111-8111-111111111111';
const lead='22222222-2222-4222-8222-222222222222';
const conversation='33333333-3333-4333-8333-333333333333';
const link='44444444-4444-4444-8444-444444444444';
const attempt='55555555-5555-4555-8555-555555555555';
const message='66666666-6666-4666-8666-666666666666';
const base=()=>({
  reservation:{
    id:link, organizationId:org, leadId:lead, conversationId:conversation,
    instagramAccountId:'account123',instagramRecipientId:'customer123',
    dispatchAttemptId:attempt,tokenDigest:'a'.repeat(64),state:'reserved',
    rowVersion:2,issuedAt:'2026-11-12T10:00:00Z',expiresAt:'2026-11-15T10:00:00Z',
  },
  activeOrganizationId:org,now:'2026-11-12T10:10:00Z',
  policyMaxLifetimeHours:72,purposePermitted:true,dispatchState:'provider_accepted',
  proof:{
    dispatchAttemptId:attempt,organizationId:org,leadId:lead,conversationId:conversation,
    instagramAccountId:'account123',instagramRecipientId:'customer123',
    crmMessageId:message,providerMessageId:'mid_9999',acceptedAt:'2026-11-12T10:04:00Z',
    sourceVerified:true,
  },
});
const transitions=[
 ['exact accepted message can plan activation',()=>{},'activate'],
 ['missing CRM proof requires manual review',x=>{x.proof=null;},'manual_review'],
 ['unverified provenance requires manual review',x=>{x.proof.sourceVerified=false;},'manual_review'],
 ['wrong Instagram recipient cannot bind',x=>{x.proof.instagramRecipientId='other';},'manual_review'],
 ['wrong proof tenant cannot bind',x=>{x.proof.organizationId=lead;},'manual_review'],
 ['wrong dispatch attempt cannot bind',x=>{x.proof.dispatchAttemptId=message;},'manual_review'],
 ['invalid provider message ID cannot bind',x=>{x.proof.providerMessageId='';},'manual_review'],
 ['HTTP timeout or unknown send must hold',x=>{x.dispatchState='unknown';},'hold'],
 ['unsent reservation must hold',x=>{x.dispatchState='not_sent';},'hold'],
 ['trusted definitive send failure plans retire',x=>{
   x.dispatchState='definitive_failure';x.proof=null;
   x.failureProof={dispatchAttemptId:attempt,organizationId:org,leadId:lead,
     conversationId:conversation,instagramAccountId:'account123',
     instagramRecipientId:'customer123',rejectedAt:'2026-11-12T10:04:00Z',
     outcome:'explicit_provider_rejection',sourceVerified:true};
 },'retire'],
 ['a status flag alone cannot retire a link',x=>{x.dispatchState='definitive_failure';x.proof=null;},'hold'],
 ['an accepted message plus a claimed rejection requires review',x=>{
   x.dispatchState='definitive_failure';
   x.failureProof={dispatchAttemptId:attempt,organizationId:org,leadId:lead,
     conversationId:conversation,instagramAccountId:'account123',
     instagramRecipientId:'customer123',rejectedAt:'2026-11-12T10:04:00Z',
     outcome:'explicit_provider_rejection',sourceVerified:true};
 },'manual_review'],
 ['a rejection with unverified lineage cannot retire a link',x=>{
   x.dispatchState='definitive_failure';x.proof=null;
   x.failureProof={dispatchAttemptId:attempt,organizationId:org,leadId:lead,
     conversationId:conversation,instagramAccountId:'account123',
     instagramRecipientId:'customer123',rejectedAt:'2026-11-12T10:04:00Z',
     outcome:'explicit_provider_rejection',sourceVerified:false};
 },'manual_review'],
 ['a rejection for another dispatch attempt cannot retire a link',x=>{
   x.dispatchState='definitive_failure';x.proof=null;
   x.failureProof={dispatchAttemptId:message,organizationId:org,leadId:lead,
     conversationId:conversation,instagramAccountId:'account123',
     instagramRecipientId:'customer123',rejectedAt:'2026-11-12T10:04:00Z',
     outcome:'explicit_provider_rejection',sourceVerified:true};
 },'manual_review'],
 ['a rejection for another recipient cannot retire a link',x=>{
   x.dispatchState='definitive_failure';x.proof=null;
   x.failureProof={dispatchAttemptId:attempt,organizationId:org,leadId:lead,
     conversationId:conversation,instagramAccountId:'account123',
     instagramRecipientId:'different_customer',rejectedAt:'2026-11-12T10:04:00Z',
     outcome:'explicit_provider_rejection',sourceVerified:true};
 },'manual_review'],
 ['a rejection for another tenant cannot retire a link',x=>{
   x.dispatchState='definitive_failure';x.proof=null;
   x.failureProof={dispatchAttemptId:attempt,organizationId:lead,leadId:lead,
     conversationId:conversation,instagramAccountId:'account123',
     instagramRecipientId:'customer123',rejectedAt:'2026-11-12T10:04:00Z',
     outcome:'explicit_provider_rejection',sourceVerified:true};
 },'manual_review'],
 ['a rejection before reservation issue requires review',x=>{
   x.dispatchState='definitive_failure';x.proof=null;
   x.failureProof={dispatchAttemptId:attempt,organizationId:org,leadId:lead,
     conversationId:conversation,instagramAccountId:'account123',
     instagramRecipientId:'customer123',rejectedAt:'2026-11-12T09:00:00Z',
     outcome:'explicit_provider_rejection',sourceVerified:true};
 },'manual_review'],
 ['a rejection timestamp in the future requires review',x=>{
   x.dispatchState='definitive_failure';x.proof=null;
   x.failureProof={dispatchAttemptId:attempt,organizationId:org,leadId:lead,
     conversationId:conversation,instagramAccountId:'account123',
     instagramRecipientId:'customer123',rejectedAt:'2026-11-12T11:00:00Z',
     outcome:'explicit_provider_rejection',sourceVerified:true};
 },'manual_review'],
 ['a retry timeout is never definitive failure',x=>{
   x.dispatchState='unknown';x.proof=null;
   x.failureProof={dispatchAttemptId:attempt,organizationId:org,leadId:lead,
     conversationId:conversation,instagramAccountId:'account123',
     instagramRecipientId:'customer123',rejectedAt:'2026-11-12T10:04:00Z',
     outcome:'explicit_provider_rejection',sourceVerified:true};
 },'hold'],
 ['cross tenant request must hold',x=>{x.activeOrganizationId=lead;},'hold'],
 ['digest format must be HMAC-like',x=>{x.reservation.tokenDigest='secret';},'hold'],
 ['expired reservation plans retirement',x=>{x.now='2026-11-16T10:00:00Z';},'retire'],
 ['disallowed TTL must hold',x=>{x.policyMaxLifetimeHours=24;},'hold'],
 ['already active reservation cannot activate twice',x=>{x.reservation.state='active';},'hold'],
 ['unpermitted processing prevents activation',x=>{x.purposePermitted=false;},'hold'],
 ['acceptance before reservation is inconsistent',x=>{x.proof.acceptedAt='2026-11-12T09:00:00Z';},'manual_review'],
 ['acceptance after evaluation time is inconsistent',x=>{x.proof.acceptedAt='2026-11-12T11:00:00Z';},'manual_review'],
 ['rejection supplied along with accepted send prevents activation',x=>{
   x.failureProof={dispatchAttemptId:attempt,organizationId:org,leadId:lead,
     conversationId:conversation,instagramAccountId:'account123',
     instagramRecipientId:'customer123',rejectedAt:'2026-11-12T10:05:00Z',
     outcome:'explicit_provider_rejection',sourceVerified:true};
 },'manual_review'],
 ['acceptance one microsecond before issuance requires review',x=>{
   x.reservation.issuedAt='2026-11-12T10:00:00.000003Z';
   x.proof.acceptedAt='2026-11-12T10:00:00.000002Z';
 },'manual_review'],
 ['rejection one microsecond before issuance requires review',x=>{
   x.dispatchState='definitive_failure';x.proof=null;
   x.reservation.issuedAt='2026-11-12T10:00:00.000003Z';
   x.failureProof={dispatchAttemptId:attempt,organizationId:org,leadId:lead,
     conversationId:conversation,instagramAccountId:'account123',
     instagramRecipientId:'customer123',rejectedAt:'2026-11-12T10:00:00.000002Z',
     outcome:'explicit_provider_rejection',sourceVerified:true};
 },'manual_review'],
 ['TTL exceeded by a single microsecond fails closed',x=>{
   x.reservation.expiresAt='2026-11-15T10:00:00.000001Z';
 },'hold'],
 ['exact seventy-two hour TTL remains valid',x=>{
   x.reservation.issuedAt='2026-11-12T10:00:00.000001Z';
   x.reservation.expiresAt='2026-11-15T10:00:00.000001Z';
 },'activate'],
];
for(const [name,change,expected] of transitions){
  test(name,()=>{
    const i=base();change(i);
    const r=api.planDmLinkReservationTransition(i);
    assert.equal(r.action,expected);
    assert.equal(r.attributionAuthorized,false);
    assert.equal(r.automaticSendAllowed,false);
    if(expected==='activate'){
      assert.equal(r.expectedRowVersion,2);
      assert.equal(r.projectedState,'active');
    }
    assert.equal('tokenDigest' in r,false);
    assert.equal('recipientId' in r,false);
  });
}
const committed=()=>({
  organizationId:org,requestedOrganizationId:org,state:'active',
  sourceBindingCommitted:true,provenanceVerified:true,purposePermitted:true,
  revoked:false,tokenDigestMatched:true,
  linkIssuedAt:'2026-11-12T10:00:00Z',
  providerAcceptedAt:'2026-11-12T10:04:00Z',
  linkActivatedAt:'2026-11-12T10:06:00Z',
  linkExpiresAt:'2026-11-15T10:00:00Z',observedAt:'2026-11-12T11:00:00Z',
});
const observations=[
 ['exact committed activation permits token-level observation',{},true],
 ['reserved state cannot establish an identified observation',{state:'reserved'},false],
 ['cross tenant token cannot establish identity',{requestedOrganizationId:lead},false],
 ['source binding must be committed',{sourceBindingCommitted:false},false],
 ['provider source must be verified',{provenanceVerified:false},false],
 ['purpose consent withdrawal denies association',{purposePermitted:false},false],
 ['revoked token denies association',{revoked:true},false],
 ['mismatching token digest denies association',{tokenDigestMatched:false},false],
 ['visit after expiry denies association',{observedAt:'2026-11-16T11:00:00Z'},false],
 ['visit before issuance denies association',{observedAt:'2026-11-12T09:00:00Z'},false],
 ['visit during reservation after issuance is not retrospectively attributed',{observedAt:'2026-11-12T10:02:00Z'},false],
 ['visit after Meta acceptance but before committed activation remains unattributed',{observedAt:'2026-11-12T10:05:00Z'},false],
 ['visit at exact committed activation time is eligible',{observedAt:'2026-11-12T10:06:00Z'},true],
 ['missing activation timestamp denies association',{linkActivatedAt:null},false],
 ['missing accepted-send timestamp denies association',{providerAcceptedAt:null},false],
 ['activation earlier than accepted-send evidence denies association',{linkActivatedAt:'2026-11-12T10:03:00Z'},false],
 ['activation at link expiry denies association',{linkActivatedAt:'2026-11-15T10:00:00Z'},false],
 ['accepted-send timestamp before issue denies association',{providerAcceptedAt:'2026-11-12T09:59:00Z'},false],
 ['accepted-send timestamp after expiry denies association',{providerAcceptedAt:'2026-11-16T10:00:00Z'},false],
 ['microsecond timestamp ordering is supported',{
   providerAcceptedAt:'2026-11-12T10:04:00.123456+00:00',
   linkActivatedAt:'2026-11-12T10:06:00.999999+00:00',
   observedAt:'2026-11-12T10:07:00.654321+00:00'
 },true],
 ['visit a microsecond before activation cannot be retroactively attributed',{
   linkActivatedAt:'2026-11-12T10:06:00.000002Z',
   observedAt:'2026-11-12T10:06:00.000001Z'
 },false],
 ['visit exactly at activation microsecond is eligible',{
   linkActivatedAt:'2026-11-12T10:06:00.000002Z',
   observedAt:'2026-11-12T10:06:00.000002Z'
 },true],
 ['activation microsecond before provider acceptance is rejected',{
   providerAcceptedAt:'2026-11-12T10:06:00.000002Z',
   linkActivatedAt:'2026-11-12T10:06:00.000001Z'
 },false],
 ['activation exactly at provider acceptance microsecond is eligible',{
   providerAcceptedAt:'2026-11-12T10:06:00.000002Z',
   linkActivatedAt:'2026-11-12T10:06:00.000002Z',
   observedAt:'2026-11-12T10:06:00.000003Z'
 },true],
 ['observation a microsecond before expiry is eligible',{
   observedAt:'2026-11-15T09:59:59.999999Z'
 },true],
 ['observation exactly at expiry microsecond is rejected',{
   observedAt:'2026-11-15T10:00:00.000000Z'
 },false],
 ['acceptance a microsecond earlier than issuance is rejected',{
   linkIssuedAt:'2026-11-12T10:04:00.000002Z',
   providerAcceptedAt:'2026-11-12T10:04:00.000001Z'
 },false],
 ['timezone-offset microseconds compare as actual instants',{
   providerAcceptedAt:'2026-11-12T15:34:00.000002+05:30',
   linkActivatedAt:'2026-11-12T10:04:00.000003Z',
   observedAt:'2026-11-12T10:04:00.000004Z'
 },true],
];
for(const [name,changes,expected] of observations){
  test(name,()=>{
    const r=api.evaluateDmLinkCommittedAttribution({...committed(),...changes});
    assert.equal(r.associationPermitted,expected);
    assert.equal(r.residenceVerified,false);
    assert.equal(r.pricingEligibility,'undetermined');
    assert.equal(r.identityClaim,expected?'token_link_only':'none');
  });
}
