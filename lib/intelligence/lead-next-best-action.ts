import type {
  IntelligenceOwnerSignalRow,
  SystemIntelligenceContext,
} from '@/lib/intelligence/system-intelligence-context';

const ACTIVE_STAGES = new Set(['new', 'contacted', 'engaged', 'qualified', 'high_intent', 'payment_pending']);

export type LeadNextBestActionKind =
  | 'reply_now'
  | 'send_payment_link'
  | 'follow_up_today'
  | 'assign_owner'
  | 'first_touch'
  | 'nurture';

export type LeadNextBestAction = {
  leadId: string;
  leadName: string | null;
  kind: LeadNextBestActionKind;
  label: string;
  reason: string;
  score: number;
  href: string;
  evidence: string[];
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hoursSince(value: string | null, now: Date) {
  if (!value) return null;
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, (now.getTime() - at) / (60 * 60 * 1000));
}

function leadName(context: SystemIntelligenceContext, leadId: string) {
  return context.journey.find((row) => row.lead_id === leadId)?.lead_name ?? null;
}

function actionForRow(
  row: IntelligenceOwnerSignalRow,
  context: SystemIntelligenceContext,
  now: Date,
): LeadNextBestAction | null {
  const stage = String(row.current_stage || '');
  if (!ACTIVE_STAGES.has(stage)) return null;

  const priority = clamp(numberValue(row.priority_score));
  const waitingHours = hoursSince(row.last_inbound_at, now);
  const isUnowned = !row.owner_user_id;
  const name = leadName(context, row.lead_id);
  const href = `/leads/${row.lead_id}`;

  const evidence = [
    `Stage: ${stage.replace(/_/g, ' ')}`,
    `Priority score: ${priority}`,
  ];

  if (row.needs_reply === true && stage === 'payment_pending') {
    if (waitingHours != null) evidence.push(`Inbound waiting: ${waitingHours >= 1 ? `${Math.floor(waitingHours)}h` : '<1h'}`);
    if (isUnowned) evidence.push('No owner assigned');
    return {
      leadId: row.lead_id,
      leadName: name,
      kind: 'send_payment_link',
      label: isUnowned ? 'Assign owner and resolve payment reply' : 'Resolve payment reply now',
      reason: 'The lead is already payment-pending and has an unanswered inbound message, so payment friction should be removed before lower-stage work.',
      score: clamp(96 + Math.min(priority / 25, 4) + (waitingHours != null && waitingHours >= 1 ? 2 : 0)),
      href,
      evidence,
    };
  }

  if (row.needs_reply === true && stage === 'high_intent') {
    if (waitingHours != null) evidence.push(`Inbound waiting: ${waitingHours >= 1 ? `${Math.floor(waitingHours)}h` : '<1h'}`);
    if (isUnowned) evidence.push('No owner assigned');
    return {
      leadId: row.lead_id,
      leadName: name,
      kind: 'reply_now',
      label: isUnowned ? 'Assign owner and reply now' : 'Reply now',
      reason: 'An unanswered high-intent conversation combines response-time risk with near-term conversion potential.',
      score: clamp(94 + Math.min(priority / 30, 3) + (waitingHours != null && waitingHours >= 1 ? 2 : 0)),
      href,
      evidence,
    };
  }

  if (row.needs_reply === true) {
    if (waitingHours != null) evidence.push(`Inbound waiting: ${waitingHours >= 1 ? `${Math.floor(waitingHours)}h` : '<1h'}`);
    return {
      leadId: row.lead_id,
      leadName: name,
      kind: 'reply_now',
      label: isUnowned ? 'Assign owner and reply' : 'Reply now',
      reason: 'The latest customer message is waiting for a response, making reply coverage the clearest immediate action.',
      score: clamp(88 + Math.min(priority / 20, 5) + (waitingHours != null && waitingHours >= 1 ? 3 : 0)),
      href,
      evidence: isUnowned ? [...evidence, 'No owner assigned'] : evidence,
    };
  }

  if (stage === 'payment_pending') {
    if (numberValue(row.outstanding_balance) > 0) {
      evidence.push(`Outstanding balance: ${row.currency || ''} ${numberValue(row.outstanding_balance).toLocaleString('en-IN')}`.trim());
    }
    return {
      leadId: row.lead_id,
      leadName: name,
      kind: 'send_payment_link',
      label: isUnowned ? 'Assign owner and progress payment' : 'Progress payment',
      reason: 'The lead is already in payment pending, so the next operational step is to remove payment friction or confirm settlement.',
      score: clamp(86 + Math.min(priority / 20, 5)),
      href,
      evidence: isUnowned ? [...evidence, 'No owner assigned'] : evidence,
    };
  }

  if (row.has_overdue_followup === true) {
    return {
      leadId: row.lead_id,
      leadName: name,
      kind: 'follow_up_today',
      label: isUnowned ? 'Assign owner and follow up today' : 'Follow up today',
      reason: 'A scheduled follow-up is overdue, so the existing commitment should be cleared before creating new outreach work.',
      score: clamp(82 + Math.min(priority / 15, 7) + (stage === 'high_intent' ? 4 : 0)),
      href,
      evidence: isUnowned ? [...evidence, 'No owner assigned', 'Follow-up overdue'] : [...evidence, 'Follow-up overdue'],
    };
  }

  if (isUnowned && (priority >= 70 || stage === 'high_intent')) {
    return {
      leadId: row.lead_id,
      leadName: name,
      kind: 'assign_owner',
      label: 'Assign owner',
      reason: 'This active lead has elevated priority but no accountable owner, creating avoidable execution risk.',
      score: clamp(78 + Math.min(priority / 10, 10) + (stage === 'high_intent' ? 4 : 0)),
      href,
      evidence: [...evidence, 'No owner assigned'],
    };
  }

  if (stage === 'new' && !row.last_contacted_at) {
    return {
      leadId: row.lead_id,
      leadName: name,
      kind: 'first_touch',
      label: 'Make first contact',
      reason: 'The lead is still new and has no recorded first contact, so initial outreach is the next deterministic sales step.',
      score: clamp(72 + Math.min(priority / 10, 10)),
      href,
      evidence: [...evidence, 'No first contact recorded'],
    };
  }

  const journey = context.journey.find((item) => item.lead_id === row.lead_id);
  if (journey?.is_reengaged === true) {
    return {
      leadId: row.lead_id,
      leadName: name,
      kind: 'follow_up_today',
      label: 'Follow up while re-engaged',
      reason: 'The lead has returned after earlier activity, creating a warmer follow-up window than routine nurture.',
      score: clamp(70 + Math.min(numberValue(journey.engagement_score) / 10, 10) + Math.min(priority / 20, 5)),
      href,
      evidence: [...evidence, 'Recent behavioural re-engagement detected'],
    };
  }

  if (stage === 'engaged' || stage === 'qualified') {
    return {
      leadId: row.lead_id,
      leadName: name,
      kind: 'nurture',
      label: 'Continue nurture',
      reason: 'No overdue reply, payment step or follow-up is currently detected, so this lead can remain in structured nurture.',
      score: clamp(45 + Math.min(priority / 5, 15)),
      href,
      evidence,
    };
  }

  return null;
}

export function buildLeadNextBestActions(
  context: SystemIntelligenceContext,
  now = new Date(),
  limit = 8,
): LeadNextBestAction[] {
  return context.ownerSignals
    .map((row) => actionForRow(row, context, now))
    .filter((row): row is LeadNextBestAction => row !== null)
    .sort((left, right) => right.score - left.score || left.leadId.localeCompare(right.leadId))
    .slice(0, Math.max(1, Math.min(25, Math.round(limit))));
}
