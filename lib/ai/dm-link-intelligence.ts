/**
 * DM-LINK-01: pure, offline-only classification for Instagram DM course links.
 * This module performs no network requests, model calls, writes, or sends.
 * Authorization, trusted-edge geolocation, consent and token binding must be
 * established by separately reviewed server code BEFORE invoking it.
 */

export type VisitSignal = 'none' | 'http_request' | 'browser_observation';
export type VisitEvidenceStatus =
  | 'restricted'
  | 'none'
  | 'ambiguous_request'
  | 'observed_country_unknown'
  | 'country_observed';

export type DmLinkVisitInput = {
  organizationId: string;
  linkOrganizationId: string;
  conversationOrganizationId: string;
  visitOrganizationId: string;
  processingPurposePermitted: boolean;
  tokenRevoked: boolean;
  issuedAt: string;
  expiresAt: string;
  observedAt: string | null;
  signal: VisitSignal;
  suspectedPreviewOrBot: boolean;
  knownForwardedLink: boolean;
  networkCountry: string | null;
  networkCountrySource: 'trusted_server' | 'untrusted_header' | 'unknown';
};

export type DmLinkVisitResult = {
  status: VisitEvidenceStatus;
  /** Country of the network serving the visit, not verified residence. */
  observedVisitCountry: string | null;
  identityAssurance: 'token_link_only' | 'none';
  customerResidenceVerified: false;
  priceEligibility: 'undetermined';
};

const COUNTRY_RE = /^[A-Z]{2}$/;
const invalidVisitResult = (status: VisitEvidenceStatus): DmLinkVisitResult => ({
  status,
  observedVisitCountry: null,
  identityAssurance: 'none',
  customerResidenceVerified: false,
  priceEligibility: 'undetermined',
});

/** Offset-aware Unix microseconds, matching the committed registry gate.
 * Date.parse alone truncates PostgreSQL's last three fractional digits.
 */
function parseIsoInstant(value: string | null): bigint | null {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;
  const fraction = (parts[2] ?? '').padEnd(6, '0');
  const millis = Date.parse(`${parts[1]}.${fraction.slice(0, 3)}${parts[3]}`);
  if (!Number.isFinite(millis)) return null;
  return BigInt(millis) * BigInt(1000) + BigInt(fraction.slice(3));
}

/** Country is deliberately NEVER used to decide a price category here. */
export function evaluateDmLinkVisit(input: DmLinkVisitInput): DmLinkVisitResult {
  if (!input.organizationId || !input.linkOrganizationId ||
      !input.conversationOrganizationId || !input.visitOrganizationId ||
      input.organizationId !== input.linkOrganizationId ||
      input.organizationId !== input.conversationOrganizationId ||
      input.organizationId !== input.visitOrganizationId ||
      input.processingPurposePermitted !== true || input.tokenRevoked !== false) {
    return invalidVisitResult('restricted');
  }
  const issued = parseIsoInstant(input.issuedAt);
  const expiry = parseIsoInstant(input.expiresAt);
  if (issued === null || expiry === null || expiry <= issued) return invalidVisitResult('restricted');
  if (input.signal === 'none') return invalidVisitResult('none');
  const observed = parseIsoInstant(input.observedAt);
  if (observed === null || observed < issued || observed >= expiry) {
    return invalidVisitResult('restricted');
  }
  if (input.signal !== 'browser_observation' ||
      input.suspectedPreviewOrBot !== false || input.knownForwardedLink !== false) {
    return invalidVisitResult('ambiguous_request');
  }
  const base: DmLinkVisitResult = {
    status: 'observed_country_unknown',
    observedVisitCountry: null,
    identityAssurance: 'token_link_only',
    customerResidenceVerified: false,
    priceEligibility: 'undetermined',
  };
  if (input.networkCountrySource !== 'trusted_server' ||
      !input.networkCountry || !COUNTRY_RE.test(input.networkCountry)) return base;
  return { ...base, status: 'country_observed', observedVisitCountry: input.networkCountry };
}

export type DmLinkOutboundState =
  | 'draft' | 'queued' | 'provider_accepted' | 'delivered'
  | 'failed' | 'unknown' | 'revoked';
export type DmLinkClickCoverage =
  | 'supported' | 'missing' | 'ambiguous';
export type StaffAttentionReason =
  | 'no_verified_visit'
  | 'delivery_unconfirmed'
  | 'visit_ambiguous'
  | 'none'
  | 'tenant_mismatch'
  | 'purpose_not_permitted'
  | 'suppressed'
  | 'existing_task'
  | 'not_due'
  | 'not_delivered'
  | 'visit_recorded'
  | 'tracking_unavailable'
  | 'invalid_input';

export type DmLinkStaffAttentionInput = {
  organizationId: string;
  linkOrganizationId: string;
  conversationOrganizationId: string;
  linkId: string;
  channel: 'instagram' | 'whatsapp' | 'other';
  purposePermitted: boolean;
  linkRevoked: boolean;
  outboundState: DmLinkOutboundState;
  linkSentAt: string | null;
  linkExpiresAt: string;
  now: string;
  waitingHours: number;
  clickCoverage: DmLinkClickCoverage;
  clickStatus: VisitEvidenceStatus;
  repliedSinceSend: boolean;
  optedOut: boolean;
  humanHandled: boolean;
  leadClosedOrEnrolled: boolean;
  existingTask: boolean;
};
export type DmLinkStaffAttentionResult = {
  action: 'none' | 'staff_review_due';
  reason: StaffAttentionReason;
  /** Idempotency scope, not an execution instruction. */
  taskKey: string | null;
  /** This helper never authorizes an outbound DM. */
  automaticSendAllowed: false;
};

function noTask(reason: StaffAttentionReason): DmLinkStaffAttentionResult {
  return { action: 'none', reason, taskKey: null, automaticSendAllowed: false };
}

/**
 * Advice-only. Caller must revalidate membership, contactability, reply state,
 * idempotency and consent in a transaction before EVER creating a staff task.
 * This module must never be connected directly to Instagram send actions.
 */
export function evaluateDmLinkStaffAttention(
  input: DmLinkStaffAttentionInput,
): DmLinkStaffAttentionResult {
  if (!input.organizationId || !input.linkOrganizationId ||
      !input.conversationOrganizationId ||
      input.organizationId !== input.linkOrganizationId ||
      input.organizationId !== input.conversationOrganizationId) return noTask('tenant_mismatch');
  if (input.channel !== 'instagram' || input.purposePermitted !== true) {
    return noTask('purpose_not_permitted');
  }
  if (input.linkRevoked || input.optedOut || input.repliedSinceSend ||
      input.humanHandled || input.leadClosedOrEnrolled) return noTask('suppressed');
  if (input.existingTask) return noTask('existing_task');
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(input.linkId) ||
      !Number.isInteger(input.waitingHours) || input.waitingHours < 1 || input.waitingHours > 168) {
    return noTask('invalid_input');
  }
  const sent = parseIsoInstant(input.linkSentAt);
  const now = parseIsoInstant(input.now);
  const expiry = parseIsoInstant(input.linkExpiresAt);
  if (sent === null || now === null || expiry === null || expiry <= sent || now < sent) {
    return noTask('invalid_input');
  }
  if (now >= expiry) return noTask('suppressed');
  if (now - sent < BigInt(input.waitingHours) * BigInt(3600000000)) return noTask('not_due');
  if (input.outboundState === 'draft' || input.outboundState === 'queued' ||
      input.outboundState === 'failed' || input.outboundState === 'revoked') {
    return noTask('not_delivered');
  }
  if (input.clickStatus === 'country_observed' ||
      input.clickStatus === 'observed_country_unknown') return noTask('visit_recorded');
  if (input.clickCoverage !== 'supported' || input.clickStatus === 'restricted') {
    return noTask('tracking_unavailable');
  }
  const reason: StaffAttentionReason =
    input.clickStatus === 'ambiguous_request'
      ? 'visit_ambiguous'
      : input.outboundState === 'delivered' && input.clickStatus === 'none'
        ? 'no_verified_visit' : 'delivery_unconfirmed';
  return {
    action: 'staff_review_due',
    reason,
    taskKey: `dm-link-review-v1:${input.organizationId}:${input.linkId}:${input.waitingHours}`,
    automaticSendAllowed: false,
  };
}
