import { parseDmLinkInstant } from './dm-link-time';
import { gateDmLinkObservationHistory, type DmLinkVerifiedRegistry } from './dm-link-attribution-gate';
/**
 * DM-LINK-03: read-only, fail-closed association from an authorized CRM
 * Instagram outbound message to a proposed opaque-link record.
 *
 * No database client, network call, redirect, task insert, model call or send.
 * The caller MUST independently authorize the staff member's active workspace
 * and selected lead and supply fresh tenant-scoped database records.
 */
import { summarizeDmLinkCoverage, type DmLinkObservation } from './dm-link-coverage';
import { evaluateDmLinkStaffAttention, type DmLinkOutboundState,
  type DmLinkClickCoverage, type StaffAttentionReason } from './dm-link-intelligence';

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const LINK_ID = /^[A-Za-z0-9_-]{8,128}$/;
const providerId = (id: unknown) => typeof id === 'string' && id.length >= 4 && id.length <= 256 && id.trim() === id && !/[\s\u0000-\u001f]/.test(id);

export type DmLinkCrmSnapshot = {
  activeOrganizationId: string;
  selectedLeadId: string;
  staffCanWorkLead: boolean;
  linkPurposePermitted: boolean;
  lead: { id: string; organization_id: string } | null;
  conversation: {
    id: string; organization_id: string; lead_id: string;
    channel: string; external_account_id: string | null;
    metadata: unknown;
  } | null;
  message: {
    id: string; organization_id: string; lead_id: string;
    conversation_id: string; direction: string;
    external_message_id: string | null; sent_at: string | null;
    /** Server-loaded CRM status/provenance; optional for older read-only consumers. */
    status?: string | null; metadata?: unknown;
  } | null;
  /** Proposed server-side link registry row, NOT an existing deployed table. */
  link: {
    id: string; organization_id: string; lead_id: string;
    conversation_id: string; crm_message_id: string;
    instagram_account_id: string; instagram_recipient_id: string;
    provider_message_id: string; issued_at: string;
    expires_at: string; revoked_at: string | null;
    /** Server-authoritative registry projection; do not synthesize from client fields. */
    state: 'reserved' | 'active' | 'retired'; activated_at: string | null;
    purpose: 'course_info_link';
  } | null;
};

export type DmLinkBinding = {
  status: 'linked' | 'restricted' | 'incomplete' | 'mismatch';
  /** These identifiers remain internal; never serialize the full binding to a customer. */
  linkId: string | null;
  organizationId: string | null;
  leadId: string | null;
  conversationId: string | null;
  messageEvidenceRef: string | null;
};
const rejected = (status: Exclude<DmLinkBinding['status'], 'linked'>): DmLinkBinding => ({
  status, linkId: null, organizationId: null, leadId: null,
  conversationId: null, messageEvidenceRef: null,
});

export function bindDmLinkToCrmMessage(snapshot: DmLinkCrmSnapshot): DmLinkBinding {
  if (!snapshot || !UUID.test(snapshot.activeOrganizationId) ||
      !UUID.test(snapshot.selectedLeadId) || snapshot.staffCanWorkLead !== true ||
      snapshot.linkPurposePermitted !== true) return rejected('restricted');
  const { lead, conversation, message, link } = snapshot;
  if (!lead || !conversation || !message || !link) return rejected('incomplete');
  const org = snapshot.activeOrganizationId;
  const selected = snapshot.selectedLeadId;
  if (!UUID.test(lead.id) || !UUID.test(conversation.id) || !UUID.test(message.id) ||
      !LINK_ID.test(link.id) ||
      [lead.organization_id, conversation.organization_id, message.organization_id, link.organization_id]
        .some(id => id !== org) ||
      [lead.id, conversation.lead_id, message.lead_id, link.lead_id].some(id => id !== selected) ||
      conversation.id !== message.conversation_id ||
      conversation.id !== link.conversation_id ||
      message.id !== link.crm_message_id ||
      conversation.channel !== 'instagram' || message.direction !== 'outbound' ||
      link.purpose !== 'course_info_link') return rejected('mismatch');
  const info = conversation.metadata;
  const meta = info && typeof info === 'object' && !Array.isArray(info)
    ? info as Record<string, unknown> : {};
  if (!providerId(conversation.external_account_id) ||
      !providerId(link.instagram_account_id) ||
      !providerId(link.instagram_recipient_id) ||
      !providerId(meta.instagram_user_id) ||
      !providerId(message.external_message_id) ||
      !providerId(link.provider_message_id) ||
      conversation.external_account_id !== link.instagram_account_id ||
      meta.instagram_user_id !== link.instagram_recipient_id ||
      message.external_message_id !== link.provider_message_id) return rejected('mismatch');
  const sent = parseDmLinkInstant(message.sent_at);
  const issued = parseDmLinkInstant(link.issued_at);
  const expires = parseDmLinkInstant(link.expires_at);
  if (link.revoked_at !== null || sent === null || issued === null || expires === null ||
      expires <= issued || sent < issued || sent > expires) return rejected('restricted');
  return {
    status: 'linked', linkId: link.id, organizationId: org, leadId: selected,
    conversationId: conversation.id, messageEvidenceRef: `message:${message.id}`,
  };
}

export type DmLinkStaffPreview = {
  status: 'available' | 'restricted';
  messageEvidenceRef: string | null;
  linkVisitEvidence: 'not_observed' | 'ambiguous_request' | 'country_observed' |
    'observed_country_unknown' | 'conflicting_countries' | 'restricted';
  observedNetworkCountry: string | null;
  observedVisitAt: string | null;
  visitCount: number;
  attention: 'none' | 'staff_review_due';
  attentionReason: StaffAttentionReason | null;
  canAutoSend: false;
  countryOfResidenceVerified: false;
  pricingEligibility: 'undetermined';
};
const restrictedPreview = (): DmLinkStaffPreview => ({
  status:'restricted', messageEvidenceRef:null, linkVisitEvidence:'restricted',
  observedNetworkCountry:null, observedVisitAt:null, visitCount:0,
  attention:'none', attentionReason:null, canAutoSend:false,
  countryOfResidenceVerified:false, pricingEligibility:'undetermined',
});

/** Read-only staff projection. Never create tasks directly from this result. */
export function projectDmLinkStaffEvidence(input: {
  snapshot: DmLinkCrmSnapshot;
  observations: readonly DmLinkObservation[];
  /** Mandatory: direct projector callers cannot bypass committed activation. */
  verifiedRegistry: DmLinkVerifiedRegistry | null;
  coverage: DmLinkClickCoverage;
  outboundState: DmLinkOutboundState;
  now: string;
  waitingHours: number;
  repliedSinceSend: boolean;
  optedOut: boolean;
  humanHandled: boolean;
  leadClosedOrEnrolled: boolean;
  existingTask: boolean;
}): DmLinkStaffPreview {
  const binding = bindDmLinkToCrmMessage(input.snapshot);
  if (binding.status !== 'linked' || !input.snapshot.link || !input.snapshot.message ||
      input.coverage !== 'supported') return restrictedPreview();
  const link = input.snapshot.link;
  const gate = gateDmLinkObservationHistory({
    reference: {
      organizationId: binding.organizationId!, leadId: binding.leadId!,
      conversationId: binding.conversationId!,
      crmMessageId: input.snapshot.message.id, linkId: binding.linkId!,
    },
    sourceLink: link,
    sourceMessageSentAt: input.snapshot.message.sent_at,
    registry: input.verifiedRegistry,
    observations: input.observations,
    now: input.now,
  });
  if (gate.status !== 'permitted' || gate.eligibleForStaffProjection !== true) {
    return restrictedPreview();
  }
  const summary = summarizeDmLinkCoverage({
    organizationId: binding.organizationId!, linkId: binding.linkId!,
    processingPurposePermitted: input.snapshot.linkPurposePermitted,
    events: input.observations,
  });
  if (summary.state === 'restricted') return restrictedPreview();
  const attention = evaluateDmLinkStaffAttention({
    organizationId:binding.organizationId!,
    linkOrganizationId:link.organization_id,
    conversationOrganizationId:input.snapshot.conversation!.organization_id,
    linkId:link.id, channel:'instagram',
    purposePermitted:input.snapshot.linkPurposePermitted,
    linkRevoked:link.revoked_at !== null, outboundState:input.outboundState,
    linkSentAt:input.snapshot.message!.sent_at, linkExpiresAt:link.expires_at,
    now:input.now, waitingHours:input.waitingHours,
    clickCoverage:input.coverage, clickStatus:summary.clickStatus,
    repliedSinceSend:input.repliedSinceSend,
    optedOut:input.optedOut,
    humanHandled:input.humanHandled,
    leadClosedOrEnrolled:input.leadClosedOrEnrolled,
    existingTask:input.existingTask,
  });
  return {
    status:'available', messageEvidenceRef:binding.messageEvidenceRef,
    linkVisitEvidence:summary.state,
    observedNetworkCountry:summary.observedVisitCountry,
    observedVisitAt:summary.observedVisitAt,
    visitCount:summary.qualifyingVisitCount,
    attention:attention.action, attentionReason:attention.reason,
    canAutoSend:false, countryOfResidenceVerified:false,
    pricingEligibility:'undetermined',
  };
}
