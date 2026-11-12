/**
 * DM-LINK-08: mandatory offline attribution gate between a committed
 * link registry and all CRM-facing observation/country projections.
 *
 * This module performs no database queries, network requests, sends, writes,
 * redirects or IP lookups. Every value MUST originate from a fresh, authorized
 * tenant-scoped server read; booleans and timestamps supplied by clients
 * are never sufficient to establish provenance.
 */
import { sameDmLinkInstant } from './dm-link-time';
import type { DmLinkCrmSnapshot } from './dm-link-crm-evidence';
import {
  evaluateDmLinkCommittedAttribution,
  type DmLinkCommittedActivation,
} from './dm-link-registry-lifecycle';
import type { DmLinkObservation } from './dm-link-coverage';

export type DmLinkVerifiedRegistry = Omit<
  DmLinkCommittedActivation,
  'observedAt' | 'requestedOrganizationId'
> & {
  /** Internal registry ID; NEVER the public URL bearer token. */
  linkId: string;
  leadId: string;
  conversationId: string;
  crmMessageId: string;
};

export type DmLinkEvidenceReference = {
  organizationId: string;
  leadId: string;
  conversationId: string;
  crmMessageId: string;
  linkId: string;
};

export type DmLinkAttributionGateResult = {
  status: 'permitted' | 'restricted';
  reason:
    | 'verified_active_link'
    | 'no_registry'
    | 'source_mismatch'
    | 'invalid_history'
    | 'unverified_activation'
    | 'preactivation_or_expired_event';
  /** Never expose raw registry/event records in a client response. */
  eligibleForStaffProjection: boolean;
  automaticSendAllowed: false;
  residenceVerified: false;
  pricingEligibility: 'undetermined';
};

/**
 * Must run BEFORE feeding observations into summarizeDmLinkCoverage or
 * projectDmLinkStaffEvidence. Reject an entire unsafe history rather than
 * silently dropping pre-activation events and mislabeling "no observed click".
 */
export function gateDmLinkObservationHistory(input: {
  reference: DmLinkEvidenceReference;
  /** The same server-loaded lifecycle record used for CRM message binding. */
  sourceLink: DmLinkCrmSnapshot['link'];
  sourceMessageSentAt: string | null;
  registry: DmLinkVerifiedRegistry | null;
  observations: readonly DmLinkObservation[];
  now: string;
}): DmLinkAttributionGateResult {
  const refuse = (reason: DmLinkAttributionGateResult['reason']): DmLinkAttributionGateResult => ({
    status: 'restricted',
    reason,
    eligibleForStaffProjection: false,
    automaticSendAllowed: false,
    residenceVerified: false,
    pricingEligibility: 'undetermined',
  });
  if (!input || !input.registry || !input.reference) return refuse('no_registry');
  const {reference, registry, observations, sourceLink} = input;
  // No parallel lifecycle interpretation: both views must refer to the same
  // authoritative active record and exact committed activation instant.
  if (!sourceLink || sourceLink.id !== reference.linkId ||
      sourceLink.organization_id !== reference.organizationId ||
      sourceLink.lead_id !== reference.leadId ||
      sourceLink.conversation_id !== reference.conversationId ||
      sourceLink.crm_message_id !== reference.crmMessageId ||
      sourceLink.purpose !== 'course_info_link' ||
      sourceLink.state !== registry.state || sourceLink.state !== 'active' ||
      sourceLink.revoked_at !== null || registry.revoked !== false ||
      !sameDmLinkInstant(sourceLink.issued_at, registry.linkIssuedAt) ||
      !sameDmLinkInstant(sourceLink.expires_at, registry.linkExpiresAt) ||
      !sameDmLinkInstant(sourceLink.activated_at, registry.linkActivatedAt) ||
      !sameDmLinkInstant(input.sourceMessageSentAt, registry.providerAcceptedAt)) {
    return refuse('source_mismatch');
  }
  if (!reference.organizationId || !reference.leadId ||
      !reference.conversationId || !reference.crmMessageId ||
      !reference.linkId ||
      registry.organizationId !== reference.organizationId ||
      registry.leadId !== reference.leadId ||
      registry.conversationId !== reference.conversationId ||
      registry.crmMessageId !== reference.crmMessageId ||
      registry.linkId !== reference.linkId) {
    return refuse('source_mismatch');
  }
  if (!Array.isArray(observations) || observations.length > 100 ||
      typeof input.now !== 'string') return refuse('invalid_history');
  const checkAt = (observedAt: string) => evaluateDmLinkCommittedAttribution({
    ...registry,
    requestedOrganizationId: reference.organizationId,
    observedAt,
  }).associationPermitted;
  // Also make sure the registry is still active and permitted *now*.
  // Historical events do not grant permission after withdrawal/expiry.
  if (!checkAt(input.now)) return refuse('unverified_activation');

  for (const event of observations) {
    if (!event || event.linkId !== reference.linkId || !event.evidence ||
        event.evidence.organizationId !== reference.organizationId ||
        event.evidence.linkOrganizationId !== reference.organizationId ||
        event.evidence.conversationOrganizationId !== reference.organizationId ||
        event.evidence.visitOrganizationId !== reference.organizationId ||
        event.evidence.processingPurposePermitted !== true ||
        event.evidence.tokenRevoked !== false ||
        typeof event.evidence.observedAt !== 'string') {
      return refuse('invalid_history');
    }
    if (!checkAt(event.evidence.observedAt)) {
      return refuse('preactivation_or_expired_event');
    }
  }
  return {
    status: 'permitted',
    reason: 'verified_active_link',
    eligibleForStaffProjection: true,
    automaticSendAllowed: false,
    residenceVerified: false,
    pricingEligibility: 'undetermined',
  };
}
