/**
 * DM-LINK-07 — two-phase, offline-only tracked-link registry lifecycle.
 *
 * A unique link can be reserved BEFORE an Instagram send. It becomes eligible
 * for source-linked visitor evidence ONLY AFTER the exact outbound CRM message
 * and provider acceptance have been independently reconciled and a reviewed
 * atomic activation has actually committed. Until then, the course page may be
 * opened without per-lead attribution. No IO, tracking, DB write or Meta send.
 *
 * Values such as purposePermitted, sendProof.sourceVerified and
 * committedRecord.provenanceVerified MUST come from privileged server-side
 * authorization/provenance checks; they are NEVER browser-authoritative.
 */
export type DmLinkReservation = {
  id: string;
  organizationId: string;
  leadId: string;
  conversationId: string;
  instagramAccountId: string;
  instagramRecipientId: string;
  dispatchAttemptId: string;
  /** HMAC-SHA256 digest only. Never persist a raw URL bearer token. */
  tokenDigest: string;
  state: 'reserved' | 'active' | 'retired';
  rowVersion: number;
  issuedAt: string;
  expiresAt: string;
};
export type DmLinkSendProof = {
  dispatchAttemptId: string;
  organizationId: string;
  leadId: string;
  conversationId: string;
  instagramAccountId: string;
  instagramRecipientId: string;
  crmMessageId: string;
  providerMessageId: string;
  acceptedAt: string;
  /** Exact-MID provider acceptance independently reconciled by trusted server. */
  sourceVerified: boolean;
};
/** Explicit, independently verified provider rejection for this exact attempt.
 * A client flag, generic HTTP timeout, or unrelated failed message is NOT proof.
 */
export type DmLinkRejectionProof = {
  dispatchAttemptId: string;
  organizationId: string;
  leadId: string;
  conversationId: string;
  instagramAccountId: string;
  instagramRecipientId: string;
  rejectedAt: string;
  outcome: 'explicit_provider_rejection';
  sourceVerified: boolean;
};
export type DmLinkTransitionInput = {
  reservation: DmLinkReservation;
  activeOrganizationId: string;
  now: string;
  policyMaxLifetimeHours: number;
  purposePermitted: boolean;
  dispatchState: 'not_sent' | 'provider_accepted' | 'definitive_failure' | 'unknown';
  proof: DmLinkSendProof | null;
  /** Required for definitive_failure. Never infer from a timeout. */
  failureProof?: DmLinkRejectionProof | null;
};
export type DmLinkTransition = {
  action: 'hold' | 'activate' | 'retire' | 'manual_review';
  reason: string;
  projectedState: 'reserved' | 'active' | 'retired' | null;
  expectedRowVersion: number | null;
  /** The caller must commit a conditional DB transaction before using a new state. */
  attributionAuthorized: false;
  automaticSendAllowed: false;
};
export type DmLinkCommittedActivation = {
  organizationId: string;
  requestedOrganizationId: string;
  state: 'reserved' | 'active' | 'retired';
  sourceBindingCommitted: boolean;
  provenanceVerified: boolean;
  purposePermitted: boolean;
  revoked: boolean;
  tokenDigestMatched: boolean;
  linkIssuedAt: string;
  /** Verified provider acceptance time from the exact outbound message. */
  providerAcceptedAt: string;
  /** Actual committed activation timestamp, never the planning timestamp. */
  linkActivatedAt: string;
  linkExpiresAt: string;
  observedAt: string;
};
export type DmLinkAttributionDecision = {
  associationPermitted: boolean;
  identityClaim: 'none' | 'token_link_only';
  residenceVerified: false;
  pricingEligibility: 'undetermined';
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[a-f0-9]{64}$/;
const PROVIDER = /^[^\s\u0000-\u001f]{4,256}$/;
/**
 * Preserve PostgreSQL's six fractional digits instead of using Date.parse()
 * alone, which truncates microseconds to milliseconds. Return Unix microseconds
 * for exact, offset-aware ordering in this offline policy.
 */
function parseTime(input: unknown): bigint | null {
  if (typeof input !== 'string') return null;
  const parts = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(input);
  if (!parts) return null;
  const fraction = (parts[2] ?? '').padEnd(6, '0');
  const millis = Date.parse(`${parts[1]}.${fraction.slice(0, 3)}${parts[3]}`);
  if (!Number.isFinite(millis)) return null;
  return BigInt(millis) * 1000n + BigInt(fraction.slice(3));
}
const result = (action: DmLinkTransition['action'], reason: string, state: DmLinkTransition['projectedState'] = null, version: number | null = null): DmLinkTransition =>
  ({action,reason,projectedState:state,expectedRowVersion:version,attributionAuthorized:false,automaticSendAllowed:false});

/**
 * A plan, not the database transaction. "activate" requires an atomic CAS
 * update at expectedRowVersion AND exact source identity + permission checks.
 * A timeout/unknown provider outcome is NEVER interpreted as a failed send.
 */
export function planDmLinkReservationTransition(input: DmLinkTransitionInput): DmLinkTransition {
  const r = input?.reservation;
  if (!r || !UUID.test(input.activeOrganizationId) || !UUID.test(r.id) ||
      !UUID.test(r.organizationId) || !UUID.test(r.leadId) ||
      !UUID.test(r.conversationId) || !UUID.test(r.dispatchAttemptId) ||
      input.activeOrganizationId !== r.organizationId || !DIGEST.test(r.tokenDigest) ||
      !PROVIDER.test(r.instagramAccountId) || !PROVIDER.test(r.instagramRecipientId) ||
      !Number.isSafeInteger(r.rowVersion) || r.rowVersion < 1 ||
      !Number.isInteger(input.policyMaxLifetimeHours) ||
      input.policyMaxLifetimeHours < 1 || input.policyMaxLifetimeHours > 720 ||
      input.purposePermitted !== true) {
    return result('hold','invalid_scope_or_purpose');
  }
  const issued=parseTime(r.issuedAt), expiry=parseTime(r.expiresAt), now=parseTime(input.now);
  if (issued === null || expiry === null || now === null || expiry <= issued ||
      expiry - issued > BigInt(input.policyMaxLifetimeHours) * 3_600_000_000n ||
      now < issued) return result('hold','invalid_or_overlong_lifetime');
  if (r.state !== 'reserved') return result('hold','already_finalized');
  if (now >= expiry) return result('retire','expired_without_activation','retired',r.rowVersion);
  if (input.dispatchState === 'definitive_failure') {
    // An accepted MID and a failure are contradictory: never retire blindly.
    if (input.proof !== null) return result('manual_review','conflicting_send_outcomes');
    const failure = input.failureProof;
    if (!failure) return result('hold','missing_verified_failure');
    if (failure.sourceVerified !== true ||
        failure.outcome !== 'explicit_provider_rejection' ||
        failure.dispatchAttemptId !== r.dispatchAttemptId ||
        failure.organizationId !== r.organizationId ||
        failure.leadId !== r.leadId ||
        failure.conversationId !== r.conversationId ||
        failure.instagramAccountId !== r.instagramAccountId ||
        failure.instagramRecipientId !== r.instagramRecipientId) {
      return result('manual_review','rejection_not_safely_bound');
    }
    const rejected = parseTime(failure.rejectedAt);
    if (rejected === null || rejected < issued || rejected > now || rejected >= expiry) {
      return result('manual_review','rejection_time_conflict');
    }
    return result('retire','verified_provider_rejection','retired',r.rowVersion);
  }
  if (input.dispatchState === 'unknown' || input.dispatchState === 'not_sent') {
    return result('hold','unconfirmed_or_not_dispatched');
  }
  if (input.dispatchState !== 'provider_accepted') return result('hold','unknown_send_state');
  // Competing accepted/rejected outcomes must be independently reconciled;
  // never activate a reserved link while negative send evidence is present.
  if (input.failureProof != null) return result('manual_review','conflicting_send_outcomes');
  const p=input.proof;
  if (!p || p.sourceVerified !== true || !UUID.test(p.crmMessageId) ||
      !PROVIDER.test(p.providerMessageId) ||
      p.dispatchAttemptId !== r.dispatchAttemptId ||
      p.organizationId !== r.organizationId ||
      p.leadId !== r.leadId ||
      p.conversationId !== r.conversationId ||
      p.instagramAccountId !== r.instagramAccountId ||
      p.instagramRecipientId !== r.instagramRecipientId) {
    return result('manual_review','accepted_but_not_safely_bound');
  }
  const accepted=parseTime(p.acceptedAt);
  if (accepted === null || accepted < issued || accepted > now || accepted >= expiry) {
    return result('manual_review','accepted_time_conflict');
  }
  return result('activate','exact_accepted_message_bound','active',r.rowVersion);
}

/**
 * Only an actual committed, non-revoked, purpose-permitted registry row can
 * support an observation recorded ON OR AFTER activation. Never retroactively
 * attribute a visitor who opened the link while it was reserved or before
 * Meta acknowledged the actual outbound message. Even then, a visit belongs
 * to the URL token, not provably to its intended Instagram recipient.
 */
export function evaluateDmLinkCommittedAttribution(input: DmLinkCommittedActivation): DmLinkAttributionDecision {
  const fail: DmLinkAttributionDecision = {
    associationPermitted:false,identityClaim:'none',
    residenceVerified:false,pricingEligibility:'undetermined',
  };
  if (!input || !UUID.test(input.organizationId) ||
      input.requestedOrganizationId !== input.organizationId ||
      input.state !== 'active' || input.sourceBindingCommitted !== true ||
      input.provenanceVerified !== true || input.purposePermitted !== true ||
      input.revoked !== false || input.tokenDigestMatched !== true) return fail;
  const issued=parseTime(input.linkIssuedAt);
  const accepted=parseTime(input.providerAcceptedAt);
  const activated=parseTime(input.linkActivatedAt);
  const expiry=parseTime(input.linkExpiresAt);
  const at=parseTime(input.observedAt);
  if (issued===null || accepted===null || activated===null ||
      expiry===null || at===null || expiry<=issued ||
      accepted<issued || accepted>=expiry ||
      activated<accepted || activated>=expiry ||
      at<activated || at>=expiry) return fail;
  return {associationPermitted:true,identityClaim:'token_link_only',
    residenceVerified:false,pricingEligibility:'undetermined'};
}
