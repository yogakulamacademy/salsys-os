import { parseDmLinkInstant } from './dm-link-time';
/**
 * DM-LINK-06: offline classification of CRM-recorded Meta Instagram sends.
 * This does NOT prove handset delivery, a message view, a website click,
 * or price eligibility. No provider calls, DB reads, logs, or writes.
 *
 * Source records must be independently loaded by a trusted tenant-scoped
 * server adapter. Client-supplied metadata/status is NEVER authorization.
 */
export type InstagramSendEvidenceInput = {
  organizationId: string;
  leadId: string;
  conversationId: string;
  messageId: string;
  message: {
    id: string;
    organization_id: string;
    lead_id: string;
    conversation_id: string;
    direction: string;
    external_message_id: string | null;
    status: string | null | undefined;
    sent_at: string | null;
    metadata: unknown;
  };
  expectedProviderMessageId: string;
};

export type InstagramSendEvidence = {
  state: 'provider_accepted' | 'unverified';
  acceptedAt: string | null;
  provenance: 'policy_checked_manual_send' | 'signed_outbound_echo' | 'unverified';
  recipientDeliveryVerified: false;
  canAutoSend: false;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MID = /^[^\s\u0000-\u001f]{4,256}$/;
const unknown = (): InstagramSendEvidence => ({
  state:'unverified',acceptedAt:null,provenance:'unverified',
  recipientDeliveryVerified:false,canAutoSend:false,
});

export function classifyInstagramAcceptedSend(input: InstagramSendEvidenceInput): InstagramSendEvidence {
  if(!input || !input.message || !UUID.test(input.organizationId) ||
     !UUID.test(input.leadId) || !UUID.test(input.conversationId) ||
     !UUID.test(input.messageId)) return unknown();
  const m=input.message;
  if(m.id!==input.messageId ||m.organization_id!==input.organizationId ||
     m.lead_id!==input.leadId ||m.conversation_id!==input.conversationId ||
     m.direction!=='outbound' ||m.status!=='sent' ||
     !m.external_message_id || !MID.test(m.external_message_id) ||
     m.external_message_id!==input.expectedProviderMessageId ||
     parseDmLinkInstant(m.sent_at)===null) return unknown();
  const info=m.metadata && typeof m.metadata==='object' && !Array.isArray(m.metadata)
    ? m.metadata as Record<string,unknown> : {};
  const manual=info.provider==='instagram' &&
    info.send_mode==='human_manual' && info.policy_checked===true;
  // This is ONLY a source classifier; upstream must independently verify that
  // metadata.source/raw_event_id came from the signed webhook+reviewed processor.
  const echo=info.provider==='instagram' &&
    info.source==='signed_outbound_echo' &&
    typeof info.raw_event_id==='string' && UUID.test(info.raw_event_id);
  if(!manual && !echo) return unknown();
  return {state:'provider_accepted',acceptedAt:m.sent_at,
    provenance:manual?'policy_checked_manual_send':'signed_outbound_echo',
    recipientDeliveryVerified:false,canAutoSend:false};
}
