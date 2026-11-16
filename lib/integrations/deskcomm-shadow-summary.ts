/**
 * Pure aggregate for operator diagnostics of the opt-in Deskcomm-inspired
 * WhatsApp ingress shadow. No customer or source event identifiers are emitted.
 * Incomplete/corrupt metadata invalidates the report, not counted as success.
 */

type ShadowRow = { metadata: unknown; received_at: unknown };

export type DeskcommShadowSummary = {
  observedRawReceipts: number;
  taggedReceipts: number;
  untaggedReceipts: number;
  inboundMessages: number;
  deliveryStatuses: number;
  unsupportedEvents: number;
  incompleteEvidence: number;
  untrustedEvidence: number;
  candidateBatchDates: number;
  candidateMonths: number;
  candidateOptOuts: number;
  lastTaggedAt: string | null;
};

const FAMILY = new Set(['inbound_message', 'delivery_status', 'unsupported_event', 'untrusted']);
const EVIDENCE = new Set(['verified', 'incomplete', 'untrusted', 'unsupported']);
const INTENT = new Set(['none', 'batch_information_request', 'preferred_month_candidate', 'opt_out_candidate']);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function summarizeDeskcommInboundShadow(rows: ShadowRow[]): DeskcommShadowSummary | null {
  if (!Array.isArray(rows) || rows.length > 1000) return null;

  const output: DeskcommShadowSummary = {
    observedRawReceipts: rows.length,
    taggedReceipts: 0,
    untaggedReceipts: 0,
    inboundMessages: 0,
    deliveryStatuses: 0,
    unsupportedEvents: 0,
    incompleteEvidence: 0,
    untrustedEvidence: 0,
    candidateBatchDates: 0,
    candidateMonths: 0,
    candidateOptOuts: 0,
    lastTaggedAt: null,
  };

  for (const row of rows) {
    const metadata = record(row.metadata);
    if (!metadata) return null;
    if (!Object.prototype.hasOwnProperty.call(metadata, 'deskcomm_inbound_shadow')) {
      output.untaggedReceipts += 1;
      continue;
    }

    const shadow = record(metadata.deskcomm_inbound_shadow);
    if (
      !shadow ||
      shadow.schema_version !== 1 ||
      shadow.adapter !== 'deskcomm_inspired_meta_ingress' ||
      !FAMILY.has(shadow.event_family as string) ||
      !EVIDENCE.has(shadow.evidence_state as string) ||
      !INTENT.has(shadow.intent_candidate as string) ||
      shadow.automation_authorized !== false ||
      shadow.replay_authorized !== false ||
      shadow.acknowledgement_strategy !== 'existing_sync_after_processing' ||
      typeof shadow.signature_verified !== 'boolean' ||
      typeof shadow.active_tenant_sender_binding !== 'boolean' ||
      typeof shadow.source_event_key_present !== 'boolean' ||
      typeof shadow.provider_message_id_present !== 'boolean' ||
      typeof shadow.sender_identity_present !== 'boolean' ||
      (shadow.month_candidate !== null && (typeof shadow.month_candidate !== 'string' || shadow.month_candidate.length > 16))
    ) return null;

    const receivedAt = typeof row.received_at === 'string' ? row.received_at : '';
    if (!receivedAt || !Number.isFinite(Date.parse(receivedAt))) return null;

    output.taggedReceipts += 1;
    if (shadow.event_family === 'inbound_message') output.inboundMessages += 1;
    else if (shadow.event_family === 'delivery_status') output.deliveryStatuses += 1;
    else output.unsupportedEvents += 1;

    if (shadow.evidence_state === 'incomplete') output.incompleteEvidence += 1;
    if (shadow.evidence_state === 'untrusted') output.untrustedEvidence += 1;
    if (shadow.intent_candidate === 'batch_information_request') output.candidateBatchDates += 1;
    if (shadow.intent_candidate === 'preferred_month_candidate') output.candidateMonths += 1;
    if (shadow.intent_candidate === 'opt_out_candidate') output.candidateOptOuts += 1;

    if (!output.lastTaggedAt || receivedAt > output.lastTaggedAt) {
      output.lastTaggedAt = receivedAt;
    }
  }

  return output;
}
