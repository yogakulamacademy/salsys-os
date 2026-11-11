'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createPlanReviewLedger } = require('../../research/r13-p1/plan-review-ledger-preview.cjs');

const proposal = JSON.parse(readFileSync(path.resolve(__dirname,
  '../../docs/commercial/r13-p1-pricing-proposal-v1.json'), 'utf8'));
const trustedSessions = new Map([
  ['author', { id:'author-1', authenticated:true, role:'platform_admin' }],
  ['different-admin', { id:'admin-2', authenticated:true, role:'platform_admin' }],
  ['reviewer', { id:'reviewer-2', authenticated:true, role:'independent_reviewer' }],
  ['self-review', { id:'author-1', authenticated:true, role:'independent_reviewer' }],
  ['tenant-a', { id:'tenant-member-a', authenticated:true, role:'member', organizationIds:['org-a'] }],
  ['tenant-b', { id:'tenant-member-b', authenticated:true, role:'member', organizationIds:['org-b'] }],
  ['unauthorized', { id:'other', authenticated:true, role:'member', organizationIds:[] }],
  ['revoked', { id:'former', authenticated:false, role:'independent_reviewer' }],
]);
const tenants = new Map([
  ['org-a', { organizationId:'org-a', readiness:'unmanaged_legacy', subscriptionStatus:null }],
  ['org-b', { organizationId:'org-b', readiness:'managed_attention', subscriptionStatus:'past_due' }],
]);
let timeNumber = 0;
function newLedger() {
  return createPlanReviewLedger({
    resolveSession: token => trustedSessions.get(token) ?? null,
    readTenantEvidence: organizationId => tenants.get(organizationId) ?? null,
    now: () => 'synthetic-clock-' + (++timeNumber),
  });
}

test('R13-P1 synthetic audit is append-only across author-submit-review', () => {
  const store = newLedger();
  const first = store.createDraft({
    session:'author', proposal, rationale:'Review tier packages without activation',
  });
  assert.equal(first.state,'draft');
  assert.equal(first.canActivate,false);
  const next = store.submit({
    session:'author', requestId:first.requestId, expectedRevision:first.revision,
  });
  assert.equal(next.state,'under_review');
  assert.equal(next.revision,2);
  assert.throws(() => store.review({
    session:'self-review', requestId:first.requestId, expectedRevision:2, decision:'approve',
  }),/self_review_forbidden/);
  assert.throws(() => store.review({
    session:'reviewer', requestId:first.requestId, expectedRevision:1, decision:'approve',
  }),/stale_review_revision/);
  const reviewed = store.review({
    session:'reviewer', requestId:first.requestId, expectedRevision:2, decision:'approve',
  });
  assert.equal(reviewed.state,'reviewed_for_design');
  assert.equal(reviewed.canActivate,false);
  assert.equal(store.verifyAudit(),true);

  const events = store.readAudit({session:'reviewer',requestId:first.requestId});
  assert.deepEqual(events.map(e=>e.action), ['created','submitted','reviewed_for_design']);
  assert.equal(events[0].previousHash,'GENESIS');
  assert.equal(events[1].previousHash,events[0].eventHash);
  assert.equal(events[2].previousHash,events[1].eventHash);
  assert.equal(events[2].revision,3);
  events[2].eventHash='tampered';
  assert.equal(store.verifyAudit(),true);
  assert.notEqual(store.readAudit({session:'author',requestId:first.requestId})[2].eventHash,'tampered');
  const draft = store.readDraft({session:'reviewer',requestId:first.requestId});
  assert.equal(draft.deployable,false);
  assert.equal(draft.billable,false);
  assert.equal(draft.runtimeEntitlementsEnabled,false);
  assert.throws(() => store.submit({
    session:'author',requestId:first.requestId,expectedRevision:3,
  }),/only_draft_can_be_submitted/);
});

test('R13-P1 authorization only uses resolver, not client role assertions', () => {
  const store = newLedger();
  const d=store.createDraft({session:'author',proposal,rationale:'Review pricing and limits safely'});
  for(const forged of [
    {id:'author-1',authenticated:true,role:'platform_admin'},
    {token:'author',role:'platform_admin'},
    'revoked',
    'invalid-token'
  ]) {
    assert.throws(()=>store.createDraft({
      session:forged,proposal,rationale:'This should fail authorization',
    }),/(opaque_session_required|authenticated_session_required)/);
  }
  assert.throws(()=>store.createDraft({
    session:'tenant-a',proposal,rationale:'Tenant cannot edit global prices',
  }),/unauthorized_role/);
  assert.throws(()=>store.readDraft({session:'tenant-a',requestId:d.requestId}),/read_denied/);
  assert.throws(()=>store.submit({
    session:'different-admin',requestId:d.requestId,expectedRevision:1,
  }),/only_author_can_submit/);
  assert.throws(()=>store.review({
    session:'reviewer',requestId:d.requestId,expectedRevision:1,decision:'approve',
  }),/review_only_submitted_draft/);
  assert.equal(store.verifyAudit(),true);
  assert.equal(store.readAudit({session:'author',requestId:d.requestId}).length,1);
});

test('R13-P1 session-bound tenant read denies cross-organization evidence', () => {
  const store=newLedger();
  assert.deepEqual(store.readTenant({session:'tenant-a',organizationId:'org-a'}),{
    organizationId:'org-a',readiness:'unmanaged_legacy',
    subscriptionStatus:null,readOnly:true,canEnableCapabilities:false,
    canAssignPlan:false,canModifySubscription:false,
  });
  assert.throws(()=>store.readTenant({
    session:'tenant-a',organizationId:'org-b',
  }),/cross_tenant_access_denied/);
  assert.throws(()=>store.readTenant({
    session:'tenant-b',organizationId:'org-a',
  }),/cross_tenant_access_denied/);
  assert.throws(()=>store.readTenant({
    session:'unauthorized',organizationId:'org-b',
  }),/cross_tenant_access_denied/);
  const other=store.readTenant({session:'tenant-b',organizationId:'org-b'});
  assert.equal(other.subscriptionStatus,'past_due');
  assert.equal(other.canAssignPlan,false);
  assert.equal(other.canModifySubscription,false);
  assert.equal(store.readTenant({session:'author',organizationId:'org-b'}).readOnly,true);
  assert.throws(()=>store.readTenant({
    session:{id:'tenant-member-a',role:'platform_admin',organizationIds:['org-b']},
    organizationId:'org-b',
  }),/opaque_session_required/);
  assert.throws(()=>store.readTenant({
    session:'tenant-a',organizationId:'missing',
  }),/cross_tenant_access_denied/);
});

test('R13-P1 tenant evidence loader is independently scoped and mismatch rejected', () => {
  const store=createPlanReviewLedger({
    resolveSession:token=>trustedSessions.get(token)??null,
    readTenantEvidence:requested=>({organizationId:'org-b',readiness:'managed_healthy'}),
    now:()=> 'test-clock',
  });
  assert.throws(()=>store.readTenant({
    session:'tenant-a',organizationId:'org-a',
  }),/tenant_evidence_mismatch/);
  assert.throws(()=>createPlanReviewLedger({
    resolveSession:null,readTenantEvidence:()=>null,now:()=> '',
  }),/trusted_session_resolver_required/);
});

test('R13-P1 rejects stale proposal changes after review submit and records rejection', () => {
  const store=newLedger();
  const draft=store.createDraft({
    session:'author',proposal,rationale:'Review all published tiers and external fees',
  });
  proposal.tiers[0].description=''; // Fixture mutability must not affect stored copy.
  const submitted=store.submit({
    session:'author',requestId:draft.requestId,expectedRevision:1,
  });
  assert.equal(submitted.revision,2);
  const rejected=store.review({
    session:'reviewer',requestId:draft.requestId,expectedRevision:2,decision:'reject',
  });
  assert.equal(rejected.state,'rejected');
  assert.equal(store.readAudit({session:'author',requestId:draft.requestId}).length,3);
  assert.equal(store.verifyAudit(),true);
  assert.throws(()=>store.review({
    session:'reviewer',requestId:draft.requestId,expectedRevision:3,decision:'approve',
  }),/review_only_submitted_draft/);
});
