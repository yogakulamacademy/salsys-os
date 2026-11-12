import { parseDmLinkInstant, sameDmLinkInstant } from './dm-link-time';
import { createHmac, timingSafeEqual } from 'node:crypto';
/**
 * DM-LINK-06: offline classification of CRM-recorded Meta Instagram sends.
 * This does NOT prove handset delivery, a message view, a website click,
 * or price eligibility. No provider calls, DB reads, logs, or writes.
 *
 * Source records must be independently loaded by a trusted tenant-scoped
 * server adapter. Client-supplied metadata/status is NEVER authorization.
 */
/**
 * Signed attestation produced ONLY after a privileged server verifier has
 * independently witnessed the Meta Send API response or verified a webhook
 * signature and exact provider MID. Mere mutable CRM metadata, an arbitrary
 * UUID, and a boolean `sourceVerified` are never valid provenance.
 *
 * This HMAC authenticates the server verifier's attestation, not Meta itself.
 * The future server adapter must verify the actual provider evidence before
 * issuing any receipt and keep the verification key outside client inputs.
 */
export type InstagramVerifiedProvenance = {
  source: 'verified_send_api_response' | 'verified_signed_webhook';
  organizationId: string;
  leadId: string;
  conversationId: string;
  messageId: string;
  providerMessageId: string;
  acceptedAt: string;
  evidenceRef: string;
  signature: string;
};
export type InstagramSendEvidenceInput = {
  verifiedProvenance: InstagramVerifiedProvenance | null;
  /** Server-only verifier key, never derived from CRM fields or user input. */
  provenanceVerificationKey: string;
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

  const proof=input.verifiedProvenance;
  const key=input.provenanceVerificationKey;
  if (!proof || typeof key !== 'string' ||
      Buffer.byteLength(key, 'utf8') < 32 ||
      !['verified_send_api_response','verified_signed_webhook'].includes(proof.source) ||
      !/^(?:send|webhook):[0-9a-f-]{36}$/i.test(proof.evidenceRef) ||
      (proof.source === 'verified_send_api_response' && !proof.evidenceRef.startsWith('send:')) ||
      (proof.source === 'verified_signed_webhook' && !proof.evidenceRef.startsWith('webhook:')) ||
      proof.organizationId !== input.organizationId || proof.leadId !== input.leadId ||
      proof.conversationId !== input.conversationId || proof.messageId !== input.messageId ||
      proof.providerMessageId !== m.external_message_id ||
      !sameDmLinkInstant(proof.acceptedAt, m.sent_at) ||
      typeof proof.signature !== 'string' ||
      !/^[0-9a-f]{64}$/.test(proof.signature)) return unknown();
  const signedFields = [
    'dm-link-instagram-evidence-v1', proof.source, proof.organizationId,
    proof.leadId, proof.conversationId, proof.messageId,
    proof.providerMessageId, proof.acceptedAt, proof.evidenceRef,
  ].join('\\n');
  const expected=createHmac('sha256',key).update(signedFields,'utf8').digest();
  const supplied=Buffer.from(proof.signature,'hex');
  if (!timingSafeEqual(expected,supplied)) return unknown();
  return {state:'provider_accepted',acceptedAt:m.sent_at,
    provenance:proof.source==='verified_send_api_response'
      ? 'policy_checked_manual_send' : 'signed_outbound_echo',
    recipientDeliveryVerified:false,canAutoSend:false};
}
