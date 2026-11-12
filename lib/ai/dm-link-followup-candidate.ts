/**
 * DM-LINK-04: a read-only, deterministic candidate for the EXISTING CRM
 * Tasks & Follow-ups queue. It DOES NOT insert tasks, schedule sends, inspect
 * live conversations, fetch geolocation or authorize a message.
 *
 * All inputs are server-produced evidence; callers must independently verify
 * workspace/lead membership, exact message binding, consent purpose, complete
 * recent inbound status and task idempotency under the current DB transaction.
 */
export type LinkReviewEvidence = {
  status: 'available' | 'restricted';
  messageEvidenceRef: string | null;
  linkVisitEvidence: 'not_observed' | 'ambiguous_request' | 'country_observed' |
    'observed_country_unknown' | 'conflicting_countries' | 'restricted';
  attention: 'none' | 'staff_review_due';
  attentionReason: string | null;
  canAutoSend: false;
};

export type LinkReviewInput = {
  activeOrganizationId: string;
  organizationId: string;
  leadId: string;
  conversationId: string;
  messageId: string;
  linkId: string;
  channel: 'instagram' | 'whatsapp' | 'other';
  staffCanWorkLead: boolean;
  processingPurposePermitted: boolean;
  linkRevoked: boolean;
  linkExpiresAt: string;
  deliveredAt: string | null;
  sourceReadAt: string;
  now: string;
  /** A fresh, authoritative inbound read covering the message-to-now window. */
  inboundCoverage: 'verified_since_send' | 'partial' | 'unavailable';
  inboundAfterSend: boolean | null;
  /** Tasks query must include all open/snoozed tasks for this lead. */
  taskCoverage: 'complete' | 'partial' | 'unavailable';
  anyOpenFollowup: boolean;
  existingIdempotentTask: boolean;
  optedOut: boolean;
  humanAlreadyHandled: boolean;
  leadStage: string;
  assignedUserId: string | null;
  providerDelivery: 'delivered' | 'provider_accepted' | 'failed' | 'unknown';
  allowedWaitHours: number;
  evidence: LinkReviewEvidence;
};

export type LinkReviewCandidate = {
  status: 'ready' | 'restricted' | 'not_due' | 'already_handled' |
    'insufficient_evidence' | 'ineligible';
  reason: string;
  task: null | {
    idempotencyKey: string;
    organizationId: string;
    leadId: string;
    conversationId: string;
    taskType: 'human_review';
    title: 'Review Instagram course-link follow-up';
    /** Staff-only display text, no raw visitor/client identifiers. */
    description: string;
    dueAt: string;
    sourceMessageRef: string;
    assignedUserId: string | null;
    source: 'dm_link_staff_review_v1';
  };
  automaticSendAllowed: false;
};

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const LINK_RE = /^[A-Za-z0-9_-]{8,128}$/;
const ACTIVE_STAGES = new Set(['new','contacted','engaged','qualified','high_intent','payment_pending']);
function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}
function deny(status: LinkReviewCandidate['status'], reason: string): LinkReviewCandidate {
  return {status, reason, task:null, automaticSendAllowed:false};
}

/** Proposal only; actual creation needs a separate atomic, authorized DB writer. */
export function buildDmLinkHumanReviewCandidate(input: LinkReviewInput): LinkReviewCandidate {
  if (!input || !UUID_RE.test(input.activeOrganizationId) ||
      !UUID_RE.test(input.organizationId) || input.activeOrganizationId !== input.organizationId ||
      !UUID_RE.test(input.leadId) || !UUID_RE.test(input.conversationId) ||
      !UUID_RE.test(input.messageId) || !LINK_RE.test(input.linkId) ||
      input.staffCanWorkLead !== true || input.processingPurposePermitted !== true) {
    return deny('restricted', 'authorization_or_identity');
  }
  if (input.channel !== 'instagram' || input.linkRevoked || input.optedOut ||
      input.humanAlreadyHandled || !ACTIVE_STAGES.has(input.leadStage)) {
    return deny('ineligible', 'channel_or_contact_suppression');
  }
  if (input.anyOpenFollowup || input.existingIdempotentTask) {
    return deny('already_handled', 'existing_followup');
  }
  const now = parseTime(input.now);
  const sourceRead = parseTime(input.sourceReadAt);
  const expiry = parseTime(input.linkExpiresAt);
  const delivered = parseTime(input.deliveredAt);
  if (now === null || sourceRead === null || expiry === null || delivered === null ||
      expiry <= delivered || now >= expiry || delivered > now ||
      !Number.isInteger(input.allowedWaitHours) || input.allowedWaitHours < 1 ||
      input.allowedWaitHours > 168) {
    return deny('insufficient_evidence', 'invalid_or_expired_timeline');
  }
  if (sourceRead > now + 60_000 || now - sourceRead > 5 * 60_000 || sourceRead < delivered ||
      input.inboundCoverage !== 'verified_since_send' || input.inboundAfterSend === null ||
      input.taskCoverage !== 'complete' || input.providerDelivery !== 'delivered') {
    return deny('insufficient_evidence', 'stale_or_incomplete_recheck');
  }
  if (input.inboundAfterSend === true) {
    return deny('already_handled', 'customer_replied');
  }
  if (now - delivered < input.allowedWaitHours * 3_600_000) {
    return deny('not_due', 'waiting_period');
  }
  const ev = input.evidence;
  if (!ev || ev.status !== 'available' || ev.canAutoSend !== false ||
      ev.messageEvidenceRef !== `message:${input.messageId}` ||
      ev.linkVisitEvidence !== 'not_observed' || ev.attention !== 'staff_review_due' ||
      ev.attentionReason !== 'no_verified_visit') {
    return deny('insufficient_evidence', 'no_verified_open_not_established');
  }
  if (input.assignedUserId !== null && !UUID_RE.test(input.assignedUserId)) {
    return deny('insufficient_evidence', 'invalid_assignment');
  }
  return {
    status:'ready', reason:'staff_attention_due', automaticSendAllowed:false,
    task:{
      // The future writer must add an atomic unique constraint and recheck all
      // source state in the same transaction; this key alone does not dedupe.
      idempotencyKey:`dm-link-review-v1:${input.organizationId}:${input.linkId}:${input.allowedWaitHours}`,
      organizationId:input.organizationId, leadId:input.leadId,
      conversationId:input.conversationId, taskType:'human_review',
      title:'Review Instagram course-link follow-up',
      description:'No verified link visit was observed in the permitted coverage window. Check the conversation and Instagram reply eligibility before choosing any response. A missing visit does not prove the customer did not click.',
      dueAt:input.now, sourceMessageRef:ev.messageEvidenceRef,
      assignedUserId:input.assignedUserId,
      source:'dm_link_staff_review_v1',
    },
  };
}
