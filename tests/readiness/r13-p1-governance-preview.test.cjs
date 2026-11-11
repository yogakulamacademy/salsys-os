'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const policy = require('../../research/r13-p1/plan-governance-preview.cjs');
const proposal = JSON.parse(readFileSync(path.resolve(__dirname,
  '../../docs/commercial/r13-p1-pricing-proposal-v1.json'), 'utf8'));
const author = Object.freeze({ id: 'platform-author-a', authenticated: true, role: 'platform_admin' });
const reviewer = Object.freeze({ id: 'independent-reviewer-b', authenticated: true, role: 'independent_reviewer' });
const selfReviewer = Object.freeze({ ...reviewer, id: author.id });

test('R13-P1 design review requires independent reviewer and never activates billing', () => {
  const draft = policy.makeDraft({proposal, actor:author, rationale:'Four-tier pricing review, no production activation'});
  assert.equal(draft.status,'draft');
  assert.equal(draft.revision,1);
  assert.equal(draft.tenantWrites,false);
  assert.equal(draft.runtimeEntitlementsEnabled,false);
  const submitted = policy.submitDraft({draft, actor:author, proposal});
  assert.equal(submitted.status,'under_review');
  assert.equal(submitted.revision,2);
  assert.throws(() => policy.reviewDraft({
    draft:submitted, actor:selfReviewer, proposal, decision:'approve', expectedRevision:2,
  }),/self_review_forbidden/);
  assert.throws(() => policy.reviewDraft({
    draft:submitted, actor:reviewer, proposal, decision:'approve', expectedRevision:1,
  }),/stale_review_revision/);
  const reviewed = policy.reviewDraft({
    draft:submitted, actor:reviewer, proposal, decision:'approve', expectedRevision:2,
  });
  assert.equal(reviewed.status,'reviewed_for_design');
  assert.equal(reviewed.review.reviewerId,reviewer.id);
  assert.equal(reviewed.revision,3);
  assert.equal(reviewed.tenantWrites,false);
  assert.equal(reviewed.billable,false);
  assert.equal(reviewed.deployable,false);
  assert.equal(reviewed.runtimeEntitlementsEnabled,false);
  assert.throws(() => policy.reviewDraft({
    draft:reviewed, actor:reviewer, proposal, decision:'approve', expectedRevision:3,
  }),/review_only_submitted_draft/);
});

test('R13-P1 rejects unsigned/unauthorized or self-authored review actions', () => {
  assert.throws(()=>policy.makeDraft({
    proposal, actor:{id:'sales',authenticated:true,role:'sales_member'}, rationale:'Authorized plan proposal maybe',
  }),/unauthorized_role/);
  assert.throws(()=>policy.makeDraft({
    proposal, actor:{id:'admin',authenticated:false,role:'platform_admin'}, rationale:'Authorized plan proposal maybe',
  }),/unauthorized_role/);
  assert.throws(()=>policy.makeDraft({proposal, actor:author, rationale:'short'}),/rationale_required/);
  const draft=policy.makeDraft({proposal,actor:author,rationale:'Review the four proposed plans'});
  assert.throws(()=>policy.submitDraft({draft,actor:{...author,id:'another'},proposal}),/only_author_can_submit/);
  const submitted=policy.submitDraft({draft,actor:author,proposal});
  assert.throws(()=>policy.reviewDraft({
    draft:submitted,actor:author,proposal,decision:'approve',expectedRevision:2,
  }),/unauthorized_role/);
  assert.throws(()=>policy.reviewDraft({
    draft:submitted,actor:reviewer,proposal,decision:'activate',expectedRevision:2,
  }),/unsupported_review_decision/);
  const rejected=policy.reviewDraft({
    draft:submitted,actor:reviewer,proposal,decision:'reject',expectedRevision:2,
  });
  assert.equal(rejected.status,'rejected');
  assert.equal(rejected.billable,false);
});

test('R13-P1 digest freezes the entire proposal, not only the headline price', () => {
  const draft=policy.makeDraft({proposal,actor:author,rationale:'Audit all proposed scope and permission labels'});
  const tampered=JSON.parse(JSON.stringify(proposal));
  tampered.tiers[2].gated_integrations.push('approved_without_review');
  assert.notEqual(policy.digest(tampered),policy.digest(proposal));
  assert.throws(()=>policy.submitDraft({draft,actor:author,proposal:tampered}),/stale_or_tampered_proposal/);
  const priceTampered=JSON.parse(JSON.stringify(proposal));
  priceTampered.tiers[2].monthly_inr=0;
  assert.throws(()=>policy.submitDraft({draft,actor:author,proposal:priceTampered}),/invalid_proposed_price/);
});

test('R13-P1 entitlement preview is advisory even when a provider is marked eligible', () => {
  for(const tier of proposal.tiers){
    const eligible=policy.previewPlanEligibility({
      proposal,tierCode:tier.code,providerApprovals:tier.gated_integrations,
    });
    assert.equal(eligible.canBill,false);
    assert.equal(eligible.canEnableRuntimeCapability,false);
    assert.equal(eligible.canProvisionCustomer,false);
    assert.equal(eligible.priceApprovedForPublicSale,false);
    assert.equal(eligible.proposedUserLimit,tier.provisional_limits.named_users);
    assert.equal(eligible.providerFeatures.every(f => f.active===false),true);
  }
  assert.throws(()=>policy.previewPlanEligibility({proposal,tierCode:'enterprise'}),/unknown_proposed_tier/);
});
