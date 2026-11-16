/**
 * Deskcomm-inspired inbound channel boundary for SalsysOS (pure projector).
 *
 * Based on the architectural pattern in DeskcommCRM lib/channels/inbound.ts:
 * verify provider authenticity and bind the channel session BEFORE interpreting
 * its contents. No Deskcomm runtime or WAHA sender is imported.
 *
 * This projector NEVER decides to acknowledge, replay, send, assign or mutate
 * consent. Existing SalsysOS Meta webhook is the only execution authority.
 * Output is intentionally limited to categorical metadata; no source keys,
 * phone numbers, contact identifiers, text or raw provider payloads escape.
 */

export type ShadowIntent =
  | 'none'
  | 'batch_information_request'
  | 'preferred_month_candidate'
  | 'opt_out_candidate'
  | 'human_handoff_candidate';

export type ShadowEventFamily =
  | 'inbound_message'
  | 'delivery_status'
  | 'unsupported_event'
  | 'untrusted';

export type DeskcommInboundShadow = {
  schema_version: 1;
  adapter: 'deskcomm_inspired_meta_ingress';
  event_family: ShadowEventFamily;
  evidence_state: 'verified' | 'incomplete' | 'untrusted' | 'unsupported';
  signature_verified: boolean;
  active_tenant_sender_binding: boolean;
  source_event_key_present: boolean;
  provider_message_id_present: boolean;
  sender_identity_present: boolean;
  intent_candidate: ShadowIntent;
  month_candidate: string | null;
  automation_authorized: false;
  replay_authorized: false;
  acknowledgement_strategy: 'existing_sync_after_processing';
};

export type ShadowIngressInput = {
  event_key?: unknown;
  event_type?: unknown;
  external_message_id?: unknown;
  contact_wa_id?: unknown;
  signature_valid?: unknown;
  payload?: unknown;
  organizationMapped: boolean;
};

const MONTHS: Readonly<Record<string, string>> = {
  jan: 'january', january: 'january',
  feb: 'february', february: 'february',
  mar: 'march', march: 'march',
  apr: 'april', april: 'april',
  may: 'may',
  jun: 'june', june: 'june',
  jul: 'july', july: 'july',
  aug: 'august', august: 'august',
  sep: 'september', sept: 'september', september: 'september',
  oct: 'october', october: 'october',
  nov: 'november', november: 'november',
  dec: 'december', december: 'december',
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Candidate intent, NOT confirmed consent or a request to send.
 * A month on its own may be ambiguous ("May"), and a template context may
 * be needed. We deliberately never store the original answer in shadow data.
 */
export function classifyDeskcommReplyCandidate(body: unknown): {
  intent: ShadowIntent;
  month: string | null;
} {
  const normalized = text(body).replace(/\s+/g, ' ').toLowerCase();
  if (!normalized || normalized.length > 180) return { intent: 'none', month: null };

  // Deskcomm's explicit-human-request approach is adapted conservatively.
  // Do NOT treat a numbered business auto-reply menu (or a quoted example)
  // as the customer explicitly requesting a human. Never silently transfer.
  const raw = text(body);
  const numberedItems = raw.match(/(?:^|\n)\s*\d{1,2}\s*[.)-]\s*[^\n]+/g) ?? [];
  const menuLike = numberedItems.length >= 2 ||
    /(?:choose|select|press|reply|type)\s+(?:the\s+)?(?:number|option|digit)/i.test(raw);
  const wantsHuman = /^(?:(?:hello|hi|hey)[,!\s]+)?(?:(?:please|kindly)\s+)?(?:i\s+(?:want|need|would\s+like)\s+to\s+|(?:can|could|may)\s+i\s+)(?:speak|talk|chat)\s+(?:to|with)\s+(?:(?:a|an|the|real)\s+)?(?:human|person|agent|representative|staff(?:\s+member)?|someone\s+from\s+(?:your|the)\s+team)\??[!.]?$/i.test(normalized) ||
    /^(?:please\s+)?(?:connect|transfer|pass|put)\s+me\s+(?:through\s+)?(?:to|with)\s+(?:(?:a|an|the|real)\s+)?(?:human|person|agent|representative|staff(?:\s+member)?|someone\s+from\s+(?:your|the)\s+team)\??[!.]?$/i.test(normalized) ||
    /^(?:human|real\s+person|live\s+agent|human\s+agent)\s*(?:please|needed)?[!.]?$/i.test(normalized);

  if (!menuLike && wantsHuman) {
    return { intent: 'human_handoff_candidate', month: null };
  }

  if (/^(stop|stop all|unsubscribe|opt out)$/i.test(normalized)) {
    return { intent: 'opt_out_candidate', month: null };
  }
  if (normalized === 'dates') {
    return { intent: 'batch_information_request', month: null };
  }

  const match = /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:[ .,-]+20\d{2})?\.?$/i.exec(normalized);
  if (!match) return { intent: 'none', month: null };

  const month = MONTHS[match[1].toLowerCase()] ?? null;
  return month
    ? { intent: 'preferred_month_candidate', month }
    : { intent: 'none', month: null };
}

/** Run ONLY after Meta HMAC verification and active phone -> tenant lookup. */
export function projectDeskcommInboundShadow(input: ShadowIngressInput): DeskcommInboundShadow {
  const eventType = text(input.event_type).toLowerCase();
  const keyPresent = text(input.event_key).length > 0;
  const messageIdPresent = text(input.external_message_id).length > 0;
  const senderPresent = text(input.contact_wa_id).length > 0;
  const signatureVerified = input.signature_valid === true;
  const trusted = signatureVerified && input.organizationMapped && keyPresent;

  const family: ShadowEventFamily = !trusted
    ? 'untrusted'
    : eventType.startsWith('message:')
      ? 'inbound_message'
      : eventType.startsWith('status:')
        ? 'delivery_status'
        : 'unsupported_event';

  const evidenceState: DeskcommInboundShadow['evidence_state'] =
    !trusted ? 'untrusted'
    : family === 'unsupported_event' ? 'unsupported'
    : !messageIdPresent || (family === 'inbound_message' && !senderPresent) ? 'incomplete'
    : 'verified';

  let candidate: ReturnType<typeof classifyDeskcommReplyCandidate> = {
    intent: 'none',
    month: null,
  };

  if (
    evidenceState === 'verified' &&
    eventType === 'message:text'
  ) {
    const payload = object(input.payload);
    const message = object(payload.message);
    const textPayload = object(message.text);
    candidate = classifyDeskcommReplyCandidate(textPayload.body);
  }

  return {
    schema_version: 1,
    adapter: 'deskcomm_inspired_meta_ingress',
    event_family: family,
    evidence_state: evidenceState,
    signature_verified: signatureVerified,
    active_tenant_sender_binding: input.organizationMapped,
    source_event_key_present: keyPresent,
    provider_message_id_present: messageIdPresent,
    sender_identity_present: senderPresent,
    intent_candidate: candidate.intent,
    month_candidate: candidate.month,
    automation_authorized: false,
    replay_authorized: false,
    acknowledgement_strategy: 'existing_sync_after_processing',
  };
}
