import { parseDmLinkInstant } from './dm-link-time';
/**
 * DM-LINK-05: offline composition of the existing DM-link evidence safeguards.
 * No Supabase client, API route, identity merge, browser collector, scheduler,
 * customer send, or database write. The returned task is an INTERNAL proposal,
 * never an authorization for a write or a user-visible payload.
 *
 * All inputs must come from independently authorized, fresh, tenant-scoped,
 * server-side reads. Neither TypeScript types nor booleans are authorization.
 */
import {
  bindDmLinkToCrmMessage,
  projectDmLinkStaffEvidence,
  type DmLinkCrmSnapshot,
  type DmLinkStaffPreview,
} from './dm-link-crm-evidence';
import type { DmLinkObservation } from './dm-link-coverage';
import { gateDmLinkObservationHistory, type DmLinkVerifiedRegistry } from './dm-link-attribution-gate';
import { classifyInstagramAcceptedSend, type InstagramVerifiedProvenance } from './dm-link-instagram-send-evidence';
import type { DmLinkOutboundState, DmLinkClickCoverage } from './dm-link-intelligence';
import {
  buildDmLinkHumanReviewCandidate,
  type LinkReviewCandidate,
} from './dm-link-followup-candidate';

export type DmLinkReviewPipelineInput = {
  snapshot: DmLinkCrmSnapshot;
  /** Independently loaded, committed, consent-permitted registry row. */
  verifiedRegistry: DmLinkVerifiedRegistry | null;
  observations: readonly DmLinkObservation[];
  clickCoverage: DmLinkClickCoverage;
  outboundState: DmLinkOutboundState;
  /** Trusted server attestation of the verified Meta source; no client input. */
  verifiedInstagramProvenance: InstagramVerifiedProvenance | null;
  /** Secret from a privileged server process only; never browser/CRM metadata. */
  provenanceVerificationKey: string;
  /** Separately verified delivery timestamp, not the CRM sent_at timestamp. */
  deliveredAt: string | null;
  sourceReadAt: string;
  now: string;
  waitingHours: number;
  inboundCoverage: 'verified_since_send' | 'partial' | 'unavailable';
  inboundAfterSend: boolean | null;
  taskCoverage: 'complete' | 'partial' | 'unavailable';
  anyOpenFollowup: boolean;
  existingIdempotentTask: boolean;
  optedOut: boolean;
  humanAlreadyHandled: boolean;
  leadStage: string;
  assignedUserId: string | null;
};

export type DmLinkReviewPipelineOutput = {
  status: 'restricted' | 'available';
  linkVisitEvidence: DmLinkStaffPreview['linkVisitEvidence'];
  /** Coarse network observation, not residence/citizenship/price category. */
  observedNetworkCountry: string | null;
  messageEvidenceRef: string | null;
  humanReview: 'none' | 'candidate';
  reason: string;
  /** INTERNAL-only, cannot be copied directly to an API response or task table. */
  taskCandidate: LinkReviewCandidate['task'];
  automaticSendAllowed: false;
  countryOfResidenceVerified: false;
  pricingEligibility: 'undetermined';
};

function deny(reason: string): DmLinkReviewPipelineOutput {
  return {
    status: 'restricted', linkVisitEvidence: 'restricted',
    observedNetworkCountry: null, messageEvidenceRef: null,
    humanReview: 'none', reason, taskCandidate: null,
    automaticSendAllowed: false, countryOfResidenceVerified: false,
    pricingEligibility: 'undetermined',
  };
}

/** Uses the SAME bound message/link for every stage. Never writes or sends. */
export function evaluateDmLinkReviewPipeline(input: DmLinkReviewPipelineInput): DmLinkReviewPipelineOutput {
  if (!input || !input.snapshot || !input.snapshot.message || !input.snapshot.link) {
    return deny('missing_source');
  }
  const binding = bindDmLinkToCrmMessage(input.snapshot);
  if (binding.status !== 'linked' || !binding.linkId || !binding.leadId ||
      !binding.organizationId || !binding.conversationId || !binding.messageEvidenceRef) {
    return deny('unverified_link_binding');
  }

  // A reserved/unbound/expired link must NEVER be turned into lead-linked
  // visitor/country evidence, even if a preview arrived before activation.
  const attributionGate = gateDmLinkObservationHistory({
    reference: {
      organizationId: binding.organizationId,
      leadId: binding.leadId,
      conversationId: binding.conversationId,
      crmMessageId: input.snapshot.message.id,
      linkId: binding.linkId,
    },
    sourceLink: input.snapshot.link,
    sourceMessageSentAt: input.snapshot.message.sent_at,
    registry: input.verifiedRegistry,
    observations: input.observations,
    now: input.now,
  });
  if (attributionGate.status !== 'permitted' ||
      attributionGate.eligibleForStaffProjection !== true) {
    return deny('unverified_activation_or_visit_evidence');
  }

  // Do not accept API "sent" acknowledgements as independent delivery.
  // The user-facing task must never be created on contradictory timestamps.
  const accepted = classifyInstagramAcceptedSend({
    organizationId: binding.organizationId,
    leadId: binding.leadId,
    conversationId: binding.conversationId,
    messageId: input.snapshot.message.id,
    message: {
      ...input.snapshot.message,
      status: input.snapshot.message.status ?? null,
      metadata: input.snapshot.message.metadata ?? null,
    },
    expectedProviderMessageId: input.snapshot.link.provider_message_id,
    verifiedProvenance: input.verifiedInstagramProvenance,
    provenanceVerificationKey: input.provenanceVerificationKey,
  });
  // This gate applies to BOTH Meta-accepted and delivered evidence.
  // Neither the CRM status nor a client-provided verification flag is proof.
  if (accepted.state !== 'provider_accepted' ||
      accepted.recipientDeliveryVerified !== false) {
    return deny('unverified_send_provenance');
  }
  const sentAt = parseDmLinkInstant(input.snapshot.message.sent_at);
  const deliveryAt = parseDmLinkInstant(input.deliveredAt);
  const now = parseDmLinkInstant(input.now);
  if (input.outboundState === 'delivered' &&
      (sentAt === null || deliveryAt === null || now === null ||
       deliveryAt < sentAt || deliveryAt > now)) {
    return deny('delivery_evidence_inconsistent');
  }
  if (input.outboundState !== 'delivered' && input.deliveredAt !== null) {
    return deny('delivery_evidence_inconsistent');
  }

  const preview = projectDmLinkStaffEvidence({
    snapshot: input.snapshot,
    verifiedRegistry: input.verifiedRegistry,
    observations: input.observations,
    coverage: input.clickCoverage,
    outboundState: input.outboundState,
    now: input.now,
    waitingHours: input.waitingHours,
    // Unknown inbound coverage cannot be turned into "no reply" evidence.
    repliedSinceSend: input.inboundCoverage !== 'verified_since_send' || input.inboundAfterSend !== false,
    optedOut: input.optedOut,
    humanHandled: input.humanAlreadyHandled,
    leadClosedOrEnrolled: !['new','contacted','engaged','qualified','high_intent','payment_pending'].includes(input.leadStage),
    existingTask: input.existingIdempotentTask || input.anyOpenFollowup,
  });
  if (preview.status !== 'available' ||
      preview.messageEvidenceRef !== binding.messageEvidenceRef ||
      preview.canAutoSend !== false || preview.pricingEligibility !== 'undetermined') {
    return deny('restricted_or_misaligned_visit_evidence');
  }

  // Derive *all* IDs from the exact bound source. No separate client-provided
  // link/lead ID may steer the downstream staff candidate decision.
  const decision = buildDmLinkHumanReviewCandidate({
    activeOrganizationId: binding.organizationId,
    organizationId: binding.organizationId,
    leadId: binding.leadId,
    conversationId: binding.conversationId,
    messageId: input.snapshot.message.id,
    linkId: binding.linkId,
    channel: 'instagram',
    staffCanWorkLead: input.snapshot.staffCanWorkLead,
    processingPurposePermitted: input.snapshot.linkPurposePermitted,
    linkRevoked: input.snapshot.link.revoked_at !== null,
    linkExpiresAt: input.snapshot.link.expires_at,
    deliveredAt: input.deliveredAt,
    // The exact CRM provider MID was already validated by bindDmLinkToCrmMessage.
    // An accepted Instagram send is NOT a delivery receipt.
    providerAcceptedAt: accepted?.acceptedAt ?? null,
    sourceSendEvidence: accepted?.state === 'provider_accepted'
      ? 'exact_provider_message_id' : 'unverified',
    sourceReadAt: input.sourceReadAt,
    now: input.now,
    inboundCoverage: input.inboundCoverage,
    inboundAfterSend: input.inboundAfterSend,
    taskCoverage: input.taskCoverage,
    anyOpenFollowup: input.anyOpenFollowup,
    existingIdempotentTask: input.existingIdempotentTask,
    optedOut: input.optedOut,
    humanAlreadyHandled: input.humanAlreadyHandled,
    leadStage: input.leadStage,
    assignedUserId: input.assignedUserId,
    providerDelivery: input.outboundState === 'delivered' ? 'delivered'
      : input.outboundState === 'provider_accepted' ? 'provider_accepted'
      : input.outboundState === 'failed' ? 'failed' : 'unknown',
    allowedWaitHours: input.waitingHours,
    evidence: preview,
  });

  return {
    status: 'available',
    linkVisitEvidence: preview.linkVisitEvidence,
    observedNetworkCountry: preview.observedNetworkCountry,
    messageEvidenceRef: binding.messageEvidenceRef,
    humanReview: decision.status === 'ready' && decision.task ? 'candidate' : 'none',
    reason: decision.reason,
    taskCandidate: decision.status === 'ready' ? decision.task : null,
    automaticSendAllowed: false,
    countryOfResidenceVerified: false,
    pricingEligibility: 'undetermined',
  };
}
