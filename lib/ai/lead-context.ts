import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCurrentOrganizationId } from '@/lib/workspace';

/**
 * Phase C / C1: bounded, tenant-checked evidence snapshot for one CRM lead.
 *
 * This is a READ-ONLY source bundle, not an LLM output or a predicted score.
 * Never expose the staff_insight bundle in a customer-facing prompt or endpoint.
 * All model outputs must cite the immutable source row IDs below.
 */
export type LeadContextAudience = 'staff_insight' | 'customer_draft';
export type LeadContextSource = 'message' | 'activity' | 'task' | 'stage_change' | 'payment';
export type LeadContextEvidence = {
  ref: string;
  kind: LeadContextSource;
  occurredAt: string | null;
};
export type LeadContextMessage = LeadContextEvidence & {
  conversationId: string;
  channel: string;
  direction: string;
  messageType: string;
  body: string | null;
};
export type LeadContextStaffItem = LeadContextEvidence & {
  title: string;
  detail: string | null;
  status?: string;
  dueAt?: string | null;
};
export type LeadContextPayment = LeadContextEvidence & {
  status: string;
  kindCode: string;
  amount: number | null;
  currency: string | null;
  // A recorded payment status is not, by itself, proof of provider settlement.
  verification: 'recorded_status_only';
};

export type LeadContextV1 = {
  schemaVersion: 'lead_context_v1';
  generatedAt: string;
  audience: LeadContextAudience;
  lead: {
    id: string;
    organizationId: string;
    displayName: string | null;
    stage: string | null;
    storedIntent: string | null;
    currentChannel: string | null;
    courseId: string | null;
    batchId: string | null;
    preferredLocation: string | null;
    preferredMode: string | null;
    preferredMonth: string | null;
    lastInboundAt: string | null;
    lastOutboundAt: string | null;
    nextFollowupAt: string | null;
  };
  conversation: {
    messages: LeadContextMessage[];
    newestFirst: true;
    limitedTo: number;
    mayBeTruncated: boolean;
    channelsIncluded: string[];
  };
  // Only populated for the staff_insight audience.
  staffOnly: {
    existingSummary: string | null;
    privateNotes: string | null;
    activities: LeadContextStaffItem[];
    tasks: LeadContextStaffItem[];
    stageChanges: LeadContextStaffItem[];
    paymentRecords: LeadContextPayment[];
  } | null;
  limitations: string[];
};

const MAX_CONVERSATIONS = 20;
const MAX_MESSAGES = 100;
const MAX_ACTIVITIES = 30;
const MAX_TASKS = 30;
const MAX_STAGE_CHANGES = 30;
const MAX_PAYMENTS = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function bounded(value: unknown, limit: number): string | null {
  const text = str(value);
  return text ? text.replace(/\u0000/g, '').slice(0, limit) : null;
}
function numberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function expectRows<T>(result: { data: T[] | null; error: { message: string } | null }, section: string): T[] {
  if (result.error) throw new Error(`Lead context ${section} is unavailable.`);
  return result.data ?? [];
}
function ref(kind: LeadContextSource, id: unknown): string {
  const parsed = str(id);
  if (!parsed || !UUID_RE.test(parsed)) throw new Error(`Invalid ${kind} evidence identifier.`);
  return `${kind}:${parsed}`;
}

/**
 * Returns null for inaccessible/missing leads without leaking their existence.
 * Any incomplete required read throws instead of presenting missing facts as empty.
 */
export async function getLeadContextV1(
  leadId: string,
  audience: LeadContextAudience = 'staff_insight',
): Promise<LeadContextV1 | null> {
  if (!UUID_RE.test(leadId) || !['staff_insight', 'customer_draft'].includes(audience)) {
    return null;
  }

  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) return null;

  // Bind the current session to its active workspace before checking lead access.
  const organizationId = await requireCurrentOrganizationId(session, user.id);
  const { data: canWorkLead, error: accessError } = await session.rpc('can_work_lead', {
    p_lead_id: leadId,
  });
  if (accessError || canWorkLead !== true) return null;

  // Privileged reads begin only after BOTH the active organization and lead
  // authorization have been verified. Every tenant-aware query repeats both.
  const admin = createAdminClient();
  const { data: lead, error: leadError } = await admin.from('leads')
    .select('id,organization_id,display_name,current_stage,intent,current_contact_channel,interested_course_id,preferred_batch_id,preferred_location,preferred_mode,preferred_month,last_inbound_at,last_outbound_at,next_followup_at,summary,notes')
    .eq('id', leadId).eq('organization_id', organizationId).maybeSingle();
  if (leadError) throw new Error('Lead context record is unavailable.');
  if (!lead || lead.organization_id !== organizationId) return null;

  const conversationRows = expectRows(await admin.from('conversations')
    .select('id,channel,last_message_at')
    .eq('organization_id', organizationId).eq('lead_id', leadId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(MAX_CONVERSATIONS), 'conversations');
  const conversationIds = conversationRows.map(row => row.id);
  const channelByConversation = new Map(conversationRows.map(row => [row.id, String(row.channel)]));

  const messageRows = conversationIds.length
    ? expectRows(await admin.from('messages')
      .select('id,conversation_id,direction,message_type,body,created_at,received_at,sent_at')
      .eq('organization_id', organizationId).eq('lead_id', leadId)
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false }).limit(MAX_MESSAGES), 'messages')
    : [];

  const messages: LeadContextMessage[] = messageRows.map(row => ({
    ref: ref('message', row.id),
    kind: 'message',
    occurredAt: str(row.direction === 'inbound' ? row.received_at : row.sent_at) || str(row.created_at),
    conversationId: row.conversation_id,
    channel: channelByConversation.get(row.conversation_id) || 'unknown',
    direction: String(row.direction),
    messageType: String(row.message_type || 'unknown'),
    body: bounded(row.body, 1500),
  }));

  let staffOnly: LeadContextV1['staffOnly'] = null;
  const limitations = [
    'Evidence is bounded to recent CRM records; older activity may not be included.',
    'Conversation text, notes and activities are untrusted claims, not authoritative commercial or financial facts.',
    'Payment rows show recorded statuses only; verification and net revenue require trusted financial event reconciliation.',
    'No predicted payment probability or invented intent score is provided by this context builder.',
  ];

  if (audience === 'staff_insight') {
    // activities and lead_stage_history are legacy lead-keyed tables without
    // organization_id. Their lead_id is safe only after the parent lead is
    // authorized and resolved inside the active organization above.
    const [activityResult, taskResult, stageResult, paymentResult] = await Promise.all([
      admin.from('activities')
        .select('id,activity_type,title,details,occurred_at')
        .eq('lead_id', leadId).order('occurred_at', { ascending: false })
        .limit(MAX_ACTIVITIES),
      admin.from('tasks')
        .select('id,title,description,status,due_at,created_at')
        .eq('organization_id', organizationId).eq('lead_id', leadId)
        .order('created_at', { ascending: false }).limit(MAX_TASKS),
      admin.from('lead_stage_history')
        .select('id,from_stage,to_stage,reason,changed_at')
        .eq('lead_id', leadId).order('changed_at', { ascending: false })
        .limit(MAX_STAGE_CHANGES),
      admin.from('payments')
        .select('id,status,payment_kind,amount,currency,paid_at,created_at')
        .eq('organization_id', organizationId).eq('lead_id', leadId)
        .order('created_at', { ascending: false }).limit(MAX_PAYMENTS),
    ]);
    const activities = expectRows(activityResult, 'activities');
    const tasks = expectRows(taskResult, 'tasks');
    const changes = expectRows(stageResult, 'stage history');
    const payments = expectRows(paymentResult, 'payments');

    staffOnly = {
      existingSummary: bounded(lead.summary, 2000),
      privateNotes: bounded(lead.notes, 2000),
      activities: activities.map(a => ({
        kind: 'activity',
        ref: ref('activity', a.id),
        occurredAt: str(a.occurred_at),
        title: bounded(a.title, 240) || String(a.activity_type || 'Activity'),
        detail: bounded(a.details, 1200),
      })),
      tasks: tasks.map(t => ({
        kind: 'task',
        ref: ref('task', t.id),
        occurredAt: str(t.created_at),
        title: bounded(t.title, 240) || 'Follow-up',
        detail: bounded(t.description, 1200),
        status: String(t.status),
        dueAt: str(t.due_at),
      })),
      stageChanges: changes.map(s => ({
        kind: 'stage_change',
        ref: ref('stage_change', s.id),
        occurredAt: str(s.changed_at),
        title: `${String(s.from_stage ?? 'unknown')} -> ${String(s.to_stage ?? 'unknown')}`,
        detail: bounded(s.reason, 500),
      })),
      paymentRecords: payments.map(p => ({
        kind: 'payment',
        ref: ref('payment', p.id),
        occurredAt: str(p.paid_at) || str(p.created_at),
        status: String(p.status || 'unknown'),
        kindCode: String(p.payment_kind || 'unknown'),
        amount: numberOrNull(p.amount),
        currency: str(p.currency),
        verification: 'recorded_status_only',
      })),
    };
    if (activities.length === MAX_ACTIVITIES) limitations.push('Activity list may be truncated.');
    if (tasks.length === MAX_TASKS) limitations.push('Task list may be truncated.');
    if (changes.length === MAX_STAGE_CHANGES) limitations.push('Stage history may be truncated.');
    if (payments.length === MAX_PAYMENTS) limitations.push('Payment list may be truncated.');
  }

  if (conversationRows.length === MAX_CONVERSATIONS) limitations.push('Conversation list may be truncated.');

  return {
    schemaVersion: 'lead_context_v1',
    generatedAt: new Date().toISOString(),
    audience,
    lead: {
      id: lead.id,
      organizationId,
      displayName: bounded(lead.display_name, 240),
      stage: str(lead.current_stage),
      storedIntent: str(lead.intent),
      currentChannel: str(lead.current_contact_channel),
      courseId: str(lead.interested_course_id),
      batchId: str(lead.preferred_batch_id),
      preferredLocation: bounded(lead.preferred_location, 160),
      preferredMode: str(lead.preferred_mode),
      preferredMonth: str(lead.preferred_month),
      lastInboundAt: str(lead.last_inbound_at),
      lastOutboundAt: str(lead.last_outbound_at),
      nextFollowupAt: str(lead.next_followup_at),
    },
    conversation: {
      messages,
      newestFirst: true,
      limitedTo: MAX_MESSAGES,
      mayBeTruncated: messages.length === MAX_MESSAGES || conversationRows.length === MAX_CONVERSATIONS,
      channelsIncluded: Array.from(new Set(conversationRows.map(row => String(row.channel)))),
    },
    staffOnly,
    limitations,
  };
}
