'use strict';

/**
 * R13-P1 synthetic, process-local review ledger.
 *
 * REVIEW-ONLY. NOT a production audit ledger, authentication service, database
 * repository, plan editor, payment gateway or plan activation API.
 *
 * Each caller supplies ONLY an opaque session handle. A privileged, external
 * session resolver (fake session registry in tests) supplies role/identity.
 * Production must replace this preview with trusted server-side auth, durable
 * database transactions, RLS/ACL validation, audit retention and tenancy tests.
 *
 * No runtime feature/tenant/price changes are possible in this module.
 */
const policy = require('./plan-governance-preview.cjs');

function fail(code) {
  throw new Error(code);
}
function requireCondition(value, code) {
  if (!value) fail(code);
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function frozenRecord(value) {
  return Object.freeze(clone(value));
}
function createPlanReviewLedger({ resolveSession, readTenantEvidence, now }) {
  requireCondition(typeof resolveSession === 'function', 'trusted_session_resolver_required');
  requireCondition(typeof readTenantEvidence === 'function', 'trusted_tenant_evidence_loader_required');
  requireCondition(typeof now === 'function', 'clock_required');

  const requests = new Map();
  const audit = [];
  let nextId = 1;

  function principal(session) {
    // Preview resolver MUST load actor/tenancy from an independent trusted fixture.
    // Production must resolve a verified server session, never trust request roles.
    requireCondition(typeof session === 'string' && session.length > 0,
      'opaque_session_required');
    const resolved = resolveSession(session);
    requireCondition(resolved && resolved.authenticated === true
      && typeof resolved.id === 'string' && resolved.id.trim()
      && typeof resolved.role === 'string', 'authenticated_session_required');
    return resolved;
  }
  function roleActor(actor, expected) {
    requireCondition(actor.role === expected, 'unauthorized_role');
  }
  function recordEvent(action, requestId, actor, snapshot) {
    const previousHash = audit.length === 0
      ? 'GENESIS'
      : audit[audit.length - 1].eventHash;
    const event = {
      sequence: audit.length + 1,
      action,
      requestId,
      actorId: actor.id,
      proposalDigest: snapshot.proposalDigest,
      revision: snapshot.revision,
      state: snapshot.status,
      occurredAt: now(),
      previousHash,
    };
    const eventHash = policy.digest(event);
    audit.push(frozenRecord({ ...event, eventHash }));
  }
  function getRequest(requestId) {
    requireCondition(typeof requestId === 'string', 'request_id_required');
    const value = requests.get(requestId);
    requireCondition(value, 'proposal_not_found');
    return value;
  }
  function requireExpected(record, revision) {
    requireCondition(Number.isSafeInteger(revision), 'expected_revision_required');
    requireCondition(record.revision === revision, 'stale_review_revision');
  }
  function checkPlanAuthorOrReviewer(actor, request) {
    requireCondition(
      (actor.role === 'platform_admin' && actor.id === request.authorId)
      || actor.role === 'independent_reviewer',
      'read_denied'
    );
  }
  function createDraft({ session, proposal, rationale }) {
    const actor = principal(session);
    roleActor(actor, 'platform_admin');
    // Keep a frozen copy of the submitted bytes, not a mutable reference.
    const initialProposal = clone(proposal);
    const snapshot = policy.makeDraft({ actor, proposal: initialProposal, rationale });
    const requestId = 'synthetic-r13-review-' + String(nextId++).padStart(4, '0');
    requests.set(requestId, frozenRecord({
      ...snapshot,
      requestId,
      proposal: initialProposal,
    }));
    recordEvent('created', requestId, actor, snapshot);
    return frozenRecord({ requestId, state: snapshot.status, revision: snapshot.revision,
      proposalDigest: snapshot.proposalDigest, canActivate: false });
  }
  function submit({ session, requestId, expectedRevision }) {
    const actor = principal(session);
    roleActor(actor, 'platform_admin');
    const stored = getRequest(requestId);
    requireExpected(stored, expectedRevision);
    const next = policy.submitDraft({
      draft: stored,
      actor,
      proposal: stored.proposal,
    });
    requests.set(requestId, frozenRecord({
      ...next,
      requestId,
      proposal: stored.proposal,
    }));
    recordEvent('submitted', requestId, actor, next);
    return frozenRecord({ requestId, state: next.status, revision: next.revision,
      proposalDigest: next.proposalDigest, canActivate: false });
  }
  function review({ session, requestId, expectedRevision, decision }) {
    const actor = principal(session);
    roleActor(actor, 'independent_reviewer');
    const stored = getRequest(requestId);
    requireExpected(stored, expectedRevision);
    const next = policy.reviewDraft({
      draft: stored,
      actor,
      proposal: stored.proposal,
      decision,
      expectedRevision,
    });
    requests.set(requestId, frozenRecord({
      ...next,
      requestId,
      proposal: stored.proposal,
    }));
    recordEvent(decision === 'approve' ? 'reviewed_for_design' : 'rejected',
      requestId, actor, next);
    return frozenRecord({ requestId, state: next.status, revision: next.revision,
      proposalDigest: next.proposalDigest, canActivate: false });
  }
  function readDraft({ session, requestId }) {
    const actor = principal(session);
    const stored = getRequest(requestId);
    checkPlanAuthorOrReviewer(actor, stored);
    return frozenRecord(stored);
  }
  function readAudit({ session, requestId }) {
    const actor = principal(session);
    const stored = getRequest(requestId);
    checkPlanAuthorOrReviewer(actor, stored);
    // This is a read-only copy, not a source of durable database history.
    return clone(audit.filter(event => event.requestId === requestId));
  }
  function readTenant({ session, organizationId }) {
    const actor = principal(session);
    requireCondition(typeof organizationId === 'string' && organizationId.trim(),
      'organization_id_required');
    // Preview tenant checking is intentionally tighter than just being signed in.
    // Do not accept client-provided tenantId or role claims as authorization.
    const allowed = actor.role === 'platform_admin' ||
      (Array.isArray(actor.organizationIds) && actor.organizationIds.includes(organizationId));
    requireCondition(allowed, 'cross_tenant_access_denied');
    const evidence = readTenantEvidence(organizationId);
    requireCondition(evidence && evidence.organizationId === organizationId,
      'tenant_evidence_mismatch');
    const returned = {
      organizationId,
      readiness: evidence.readiness,
      subscriptionStatus: evidence.subscriptionStatus ?? null,
      // No access to mutable plan assignment, billing or provider operations.
      readOnly: true,
      canEnableCapabilities: false,
      canAssignPlan: false,
      canModifySubscription: false,
    };
    return frozenRecord(returned);
  }
  function verifyAudit() {
    let previousHash = 'GENESIS';
    for (let i = 0; i < audit.length; i++) {
      const current = audit[i];
      const { eventHash, ...event } = current;
      if (event.sequence !== i + 1 || event.previousHash !== previousHash
        || policy.digest(event) !== eventHash) return false;
      previousHash = eventHash;
    }
    return true;
  }

  return Object.freeze({
    createDraft, submit, review, readDraft, readAudit, readTenant, verifyAudit,
  });
}

module.exports = Object.freeze({ createPlanReviewLedger });
