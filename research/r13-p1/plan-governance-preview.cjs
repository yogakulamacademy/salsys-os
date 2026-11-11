'use strict';

/**
 * R13-P1 REVIEW-ONLY governance proof-of-concept.
 *
 * This deliberately has no database client, network transport, payment adapter,
 * public API handler, or production import. Never use it to activate a plan.
 * P0 must be independently accepted before production P1 work can be authorized.
 */
const { createHash } = require('node:crypto');

const ALLOWED_ROLES = Object.freeze({
  author: 'platform_admin',
  reviewer: 'independent_reviewer',
});
const DECISIONS = new Set(['approve', 'reject']);

function assert(condition, reason) {
  if (!condition) throw new Error(reason);
}

function assertActor(actor, role) {
  assert(actor && typeof actor === 'object', 'authenticated_actor_required');
  assert(typeof actor.id === 'string' && actor.id.trim(), 'authenticated_actor_required');
  assert(actor.authenticated === true && actor.role === role, 'unauthorized_role');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function assertProposal(value) {
  assert(value && value.status === 'PROPOSED_NOT_COMMERCIALLY_APPROVED',
    'not_a_review_only_pricing_proposal');
  assert(value.policy === 'NON_RUNTIME_DOCUMENTATION_ONLY_DO_NOT_SEED_OR_ENFORCE',
    'activation_or_persistence_contract_forbidden');
  assert(value.auto_billing === false && value.public_self_serve_enabled === false,
    'activation_or_billing_forbidden');
  assert(Array.isArray(value.tiers) && value.tiers.length === 4, 'four_tiers_required');
  assert(JSON.stringify(value.tiers.map(t => t.code)) ===
    JSON.stringify(['free', 'basic', 'growth', 'pro']), 'invalid_plan_order');
  assert(JSON.stringify(value.tiers.map(t => t.monthly_inr)) ===
    JSON.stringify([0, 1499, 3499, 6999]), 'invalid_proposed_price');
  assert(value.tiers[0].setup_fee_inr?.optional === true, 'free_setup_must_be_optional');
  assert(value.rules?.integrations_are_eligibility_only_not_auto_enabled === true,
    'external_provider_activation_forbidden');
  assert(value.rules?.existing_tenant_data_never_deleted_on_downgrade === true,
    'destructive_downgrade_forbidden');
  assert(value.managed_pilot?.automatic_renewal === false, 'pilot_autorenew_forbidden');
}

function makeDraft({ proposal, actor, rationale }) {
  assertActor(actor, ALLOWED_ROLES.author);
  assertProposal(proposal);
  assert(typeof rationale === 'string' && rationale.trim().length >= 10,
    'rationale_required');
  const pricingDigest = digest(proposal);
  return Object.freeze({
    kind: 'R13_P1_REVIEW_ONLY_PLAN_PROPOSAL',
    status: 'draft',
    revision: 1,
    authorId: actor.id,
    proposalDigest: pricingDigest,
    rationale: rationale.trim(),
    review: null,
    tenantWrites: false,
    billable: false,
    deployable: false,
    runtimeEntitlementsEnabled: false,
  });
}

function submitDraft({ draft, actor, proposal }) {
  assertActor(actor, ALLOWED_ROLES.author);
  assert(draft?.kind === 'R13_P1_REVIEW_ONLY_PLAN_PROPOSAL',
    'draft_contract_required');
  assert(draft.status === 'draft', 'only_draft_can_be_submitted');
  assert(draft.authorId === actor.id, 'only_author_can_submit');
  assertProposal(proposal);
  assert(draft.proposalDigest === digest(proposal), 'stale_or_tampered_proposal');
  return Object.freeze({
    ...draft,
    status: 'under_review',
    revision: draft.revision + 1,
  });
}

function reviewDraft({ draft, actor, proposal, decision, expectedRevision }) {
  assertActor(actor, ALLOWED_ROLES.reviewer);
  assert(draft?.kind === 'R13_P1_REVIEW_ONLY_PLAN_PROPOSAL',
    'draft_contract_required');
  assert(draft.status === 'under_review', 'review_only_submitted_draft');
  assert(draft.revision === expectedRevision, 'stale_review_revision');
  assert(draft.authorId !== actor.id, 'self_review_forbidden');
  assert(DECISIONS.has(decision), 'unsupported_review_decision');
  assertProposal(proposal);
  assert(draft.proposalDigest === digest(proposal), 'stale_or_tampered_proposal');
  return Object.freeze({
    ...draft,
    status: decision === 'approve' ? 'reviewed_for_design' : 'rejected',
    revision: draft.revision + 1,
    review: Object.freeze({
      reviewerId: actor.id,
      decision,
      proposalDigest: draft.proposalDigest,
    }),
    // Reviewed-for-design is NOT published, billable or executable.
    tenantWrites: false,
    billable: false,
    deployable: false,
    runtimeEntitlementsEnabled: false,
  });
}

function previewPlanEligibility({ proposal, tierCode, providerApprovals = [] }) {
  assertProposal(proposal);
  const tier = proposal.tiers.find(t => t.code === tierCode);
  assert(tier, 'unknown_proposed_tier');
  assert(Array.isArray(providerApprovals), 'provider_approvals_must_be_array');
  const requestedApprovals = new Set(providerApprovals);
  const gated = tier.gated_integrations.map(code => Object.freeze({
    code,
    reviewedAsEligible: requestedApprovals.has(code),
    active: false, // No provider activation or integration writes.
  }));
  return Object.freeze({
    tierCode,
    indicativeMonthlyInr: tier.monthly_inr,
    proposedUserLimit: tier.provisional_limits.named_users,
    proposedLeadLimit: tier.provisional_limits.lead_records,
    providerFeatures: gated,
    priceApprovedForPublicSale: false,
    canBill: false,
    canEnableRuntimeCapability: false,
    canProvisionCustomer: false,
  });
}

module.exports = Object.freeze({
  digest,
  makeDraft,
  submitDraft,
  reviewDraft,
  previewPlanEligibility,
});
