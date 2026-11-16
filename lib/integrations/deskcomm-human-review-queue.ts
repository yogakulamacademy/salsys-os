/**
 * Read-only Deskcomm-inspired human review queue. Inputs contain private
 * provider IDs, but outputs expose only verified SalsysOS lead/conversation
 * IDs, or an unmatched marker. Never derive identity from phone alone.
 *
 * No task creation, force-human flag, consent mutation, reply or send.
 */
type Json = Record<string, unknown>;

export type DeskcommCandidateSourceRow = {
  external_message_id: unknown;
  source_account_id: unknown;
  source_subject_id: unknown;
  received_at: unknown;
  metadata: unknown;
};

export type DeskcommMessageLink = {
  external_message_id: string;
  lead_id: string;
  conversation_id: string;
};

export type DeskcommMessageEvidence = {
  external_message_id: string;
  lead_id: string;
  conversation_id: string;
  direction: string;
};

export type DeskcommConversationEvidence = {
  id: string;
  lead_id: string;
  channel: string;
  external_account_id: string | null;
  external_conversation_id: string | null;
};

export type DeskcommReviewCandidate = {
  kind: 'human_request' | 'opt_out';
  observedAt: string;
  leadId: string | null;
  conversationId: string | null;
  match: 'verified_identity' | 'needs_identity_review';
};

type PrivateCandidate = {
  kind: DeskcommReviewCandidate['kind'];
  observedAt: string;
  providerMessageId: string;
  senderId: string;
  businessAccountId: string;
};

function obj(v: unknown): Json | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Json) : null;
}
function nonblank(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null;
}
function validIso(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 45 &&
    /^(?:19|20)\d\d-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
}

/**
 * Validate raw event shadow and extract the minimum temporary source evidence.
 * null = corrupt/unauthorized tag; [] = no handoff/STOP candidates.
 */
export function collectDeskcommReviewCandidates(
  rows: DeskcommCandidateSourceRow[],
): PrivateCandidate[] | null {
  if (!Array.isArray(rows) || rows.length > 1000) return null;
  const output: PrivateCandidate[] = [];
  for (const row of rows) {
    const metadata = obj(row.metadata);
    if (!metadata) return null;
    if (!Object.prototype.hasOwnProperty.call(metadata, 'deskcomm_inbound_shadow')) continue;
    const shadow = obj(metadata.deskcomm_inbound_shadow);
    if (!shadow ||
      shadow.schema_version !== 1 ||
      shadow.adapter !== 'deskcomm_inspired_meta_ingress' ||
      shadow.automation_authorized !== false ||
      shadow.replay_authorized !== false ||
      shadow.acknowledgement_strategy !== 'existing_sync_after_processing' ||
      shadow.signature_verified !== true ||
      shadow.active_tenant_sender_binding !== true ||
      shadow.evidence_state !== 'verified' ||
      shadow.event_family !== 'inbound_message' ||
      shadow.source_event_key_present !== true ||
      shadow.provider_message_id_present !== true ||
      shadow.sender_identity_present !== true
    ) {
      // Some signed events may legitimately be incomplete. They are not
      // review candidates, but do not fail the entire operator report.
      if (shadow &&
        shadow.schema_version === 1 &&
        shadow.adapter === 'deskcomm_inspired_meta_ingress' &&
        shadow.automation_authorized === false &&
        shadow.replay_authorized === false &&
        shadow.intent_candidate === 'none') continue;
      return null;
    }
    const kind: PrivateCandidate['kind'] | null =
      shadow.intent_candidate === 'human_handoff_candidate' ? 'human_request' :
      shadow.intent_candidate === 'opt_out_candidate' ? 'opt_out' : null;
    if (!kind) continue;
    const providerMessageId = nonblank(row.external_message_id, 300);
    const senderId = nonblank(row.source_subject_id, 150);
    const businessAccountId = nonblank(row.source_account_id, 150);
    if (!providerMessageId || !senderId || !businessAccountId || !validIso(row.received_at)) {
      return null;
    }
    output.push({
      kind,
      observedAt: row.received_at,
      providerMessageId,
      senderId,
      businessAccountId,
    });
  }
  return output.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}

function uniqueIndex<T>(items: T[], key: (item: T) => string): Map<string, T | null> {
  const index = new Map<string, T | null>();
  for (const item of items) {
    const id = key(item);
    if (!id) continue;
    if (index.has(id)) index.set(id, null);
    else index.set(id, item);
  }
  return index;
}

/**
 * Resolve only exact tenant-scoped CRM links, an inbound message, the same
 * conversation's lead/account/sender and an existing same-tenant lead.
 * Caller MUST query each evidence table with the active organization ID.
 */
export function reconcileDeskcommHumanReviewQueue(input: {
  candidates: PrivateCandidate[];
  links: DeskcommMessageLink[];
  messages: DeskcommMessageEvidence[];
  conversations: DeskcommConversationEvidence[];
  tenantLeadIds: string[];
}): DeskcommReviewCandidate[] {
  const links = uniqueIndex(input.links, (x) => x.external_message_id);
  const messages = uniqueIndex(input.messages, (x) => x.external_message_id);
  const conversations = uniqueIndex(input.conversations, (x) => x.id);
  const leads = new Set(input.tenantLeadIds);

  return input.candidates.map((candidate) => {
    const link = links.get(candidate.providerMessageId);
    const msg = messages.get(candidate.providerMessageId);
    const conversation = link ? conversations.get(link.conversation_id) : null;
    const matched = !!link && !!msg && !!conversation &&
      msg.direction === 'inbound' &&
      msg.lead_id === link.lead_id &&
      msg.conversation_id === link.conversation_id &&
      conversation.channel === 'whatsapp' &&
      conversation.lead_id === link.lead_id &&
      conversation.external_account_id === candidate.businessAccountId &&
      conversation.external_conversation_id === candidate.senderId &&
      leads.has(link.lead_id);

    return {
      kind: candidate.kind,
      observedAt: candidate.observedAt,
      leadId: matched ? link.lead_id : null,
      conversationId: matched ? link.conversation_id : null,
      match: matched ? 'verified_identity' : 'needs_identity_review',
    };
  });
}
