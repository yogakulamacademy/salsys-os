import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import { getFollowUps, getLeads } from '@/lib/data';
import type { FollowUp, LeadOverview } from '@/types/crm';

type UnknownRecord = Record<string, unknown>;

export type AdmissionsSnapshotData = {
  user: Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>['auth']['getUser']>>['data']['user'];
  followups: unknown[];
  hotJourney: unknown[];
  reengaged: unknown[];
  paymentPending: unknown[];
  hotPaidMedia: unknown[];
  newLeads: unknown[];
  priorityQueue: unknown[];
  automationHealth: UnknownRecord | null;
  recentAutoTasks: unknown[];
  slaOverview: UnknownRecord | null;
  slaQueue: unknown[];
  leadContacts: unknown[];
  inboxAttention: unknown[];
  inboxReads: unknown[];
  leadOperational: unknown[];
  courseBatches: unknown[];
  teamMembers: unknown[];
  ownerWorkload: unknown[];
  batchCapacity: unknown[];
  needsReplyTotal: number | null;
  unreadTotal: number | null;
};

async function getCurrentOrganizationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  return requireCurrentOrganizationId(
    supabase,
    userId,
  );
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function unwrapPayload(value: unknown): UnknownRecord {
  const root = asRecord(value);

  if (!root) {
    throw new Error(
      'Admissions snapshot returned an unexpected payload. Expected a JSON object.'
    );
  }

  const nested =
    asRecord(root.admissions_snapshot) ||
    asRecord(root.snapshot) ||
    asRecord(root.data);

  return nested || root;
}

function arrayFrom(
  source: UnknownRecord,
  ...keys: string[]
): unknown[] {
  for (const key of keys) {
    const value = source[key];

    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function objectFrom(
  source: UnknownRecord,
  ...keys: string[]
): UnknownRecord | null {
  for (const key of keys) {
    const value = source[key];
    const record = asRecord(value);

    if (record) {
      return record;
    }

    if (Array.isArray(value) && value.length > 0) {
      const first = asRecord(value[0]);

      if (first) {
        return first;
      }
    }
  }

  return null;
}

function nestedObject(
  source: UnknownRecord,
  parentKeys: string[],
  childKeys: string[]
): UnknownRecord | null {
  for (const parentKey of parentKeys) {
    const parent = objectFrom(source, parentKey);

    if (!parent) continue;

    const child = objectFrom(parent, ...childKeys);

    if (child) {
      return child;
    }
  }

  return null;
}

function nestedArray(
  source: UnknownRecord,
  parentKeys: string[],
  childKeys: string[]
): unknown[] {
  for (const parentKey of parentKeys) {
    const parent = objectFrom(source, parentKey);

    if (!parent) continue;

    const child = arrayFrom(parent, ...childKeys);

    if (child.length > 0) {
      return child;
    }
  }

  return [];
}

function numberFrom(
  source: UnknownRecord | null,
  ...keys: string[]
): number | null {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];

    if (
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      return value;
    }

    if (
      typeof value === 'string' &&
      value.trim() !== ''
    ) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function isStatementTimeout(message: string | null | undefined) {
  const normalized = String(message ?? '').toLowerCase();
  return (
    normalized.includes('statement timeout') ||
    normalized.includes('canceling statement due to statement timeout')
  );
}

function mapFallbackFollowUp(row: FollowUp) {
  return {
    task_id: row.id,
    lead_id: row.leadId,
    lead_code: row.leadCode,
    lead_name: row.leadName,
    title: row.title,
    due_at: row.dueAt,
    current_stage: row.stage,
    intent: row.intent,
    current_contact_channel: row.channel,
  };
}

function mapFallbackNewLead(row: LeadOverview) {
  const parts = String(row.name || '').trim().split(/\s+/).filter(Boolean);
  return {
    id: row.id,
    lead_code: row.leadCode,
    display_name: row.name,
    first_name: parts[0] ?? null,
    last_name: parts.length > 1 ? parts.slice(1).join(' ') : null,
    current_stage: row.stage,
    first_touch_source: row.firstTouchSource,
    preferred_location: row.location,
    created_at: row.createdAt,
  };
}

function mapFallbackPayment(row: LeadOverview) {
  return {
    lead_id: row.id,
    lead_code: row.leadCode,
    lead_name: row.name,
    current_stage: row.stage,
    potential_value: row.value ?? null,
    currency: row.currency ?? null,
    net_paid: null,
    outstanding_balance: null,
    payment_status: 'pending',
  };
}

function mapFallbackContact(row: LeadOverview) {
  return {
    lead_id: row.id,
    lead_code: row.leadCode,
    lead_name: row.name,
    email: row.email ?? null,
    whatsapp: row.currentContactChannel === 'whatsapp' ? row.phone ?? null : null,
    phone: row.phone ?? null,
  };
}

function mapFallbackOperational(row: LeadOverview) {
  return {
    id: row.id,
    preferred_batch_id: null,
    preferred_month: null,
    last_contacted_at: row.lastContactedAt ?? null,
    expected_close_date: null,
  };
}

async function getLightweightAdmissionsSnapshot(
  user: AdmissionsSnapshotData['user'],
): Promise<AdmissionsSnapshotData> {
  const [leadsResult, followupsResult] = await Promise.allSettled([
    getLeads(),
    getFollowUps(),
  ]);

  const leads =
    leadsResult.status === 'fulfilled'
      ? leadsResult.value
      : [];

  const followups =
    followupsResult.status === 'fulfilled'
      ? followupsResult.value
      : [];

  const newLeads = leads
    .filter((lead) => lead.stage === 'new')
    .slice(0, 30)
    .map(mapFallbackNewLead);

  const paymentPending = leads
    .filter((lead) => lead.stage === 'payment_pending')
    .slice(0, 30)
    .map(mapFallbackPayment);

  return {
    user,
    followups: followups.slice(0, 100).map(mapFallbackFollowUp),
    hotJourney: [],
    reengaged: [],
    paymentPending,
    hotPaidMedia: [],
    newLeads,
    priorityQueue: [],
    automationHealth: null,
    recentAutoTasks: [],
    slaOverview: null,
    slaQueue: [],
    leadContacts: leads.slice(0, 200).map(mapFallbackContact),
    inboxAttention: [],
    inboxReads: [],
    leadOperational: leads.slice(0, 200).map(mapFallbackOperational),
    courseBatches: [],
    teamMembers: [],
    ownerWorkload: [],
    batchCapacity: [],
    needsReplyTotal: null,
    unreadTotal: null,
  };
}

export async function getAdmissionsSnapshot(): Promise<AdmissionsSnapshotData> {
  const supabase = await createClient();

  const authResult = await supabase.auth.getUser();

  if (authResult.error) {
    throw new Error(
      `Unable to authenticate Admissions Desk: ${authResult.error.message}`
    );
  }

  if (!authResult.data.user) {
    throw new Error(
      'Unable to authenticate Admissions Desk: no signed-in user was returned.'
    );
  }

  const organizationId = await getCurrentOrganizationId(
    supabase,
    authResult.data.user.id,
  );

  const snapshotResult = await supabase.rpc(
    'get_admissions_snapshot',
    {
      p_organization_id: organizationId,
    },
  );

  if (snapshotResult.error) {
    if (isStatementTimeout(snapshotResult.error.message)) {
      return getLightweightAdmissionsSnapshot(authResult.data.user);
    }

    throw new Error(
      `Unable to load Admissions Desk snapshot: ${snapshotResult.error.message}`
    );
  }

  const payload = unwrapPayload(snapshotResult.data);

  const metrics =
    objectFrom(
      payload,
      'metrics',
      'summary',
      'inbox_summary',
      'inboxSummary'
    ) || {};

  const automationHealth =
    objectFrom(
      payload,
      'automation_health',
      'automationHealth'
    ) ||
    nestedObject(
      payload,
      ['automation'],
      ['health', 'automation_health', 'automationHealth']
    );

  const slaOverview =
    objectFrom(
      payload,
      'sla_overview',
      'slaOverview'
    ) ||
    nestedObject(
      payload,
      ['sla'],
      ['overview', 'sla_overview', 'slaOverview']
    );

  const slaQueueDirect =
    arrayFrom(
      payload,
      'sla_queue',
      'slaQueue'
    );

  const slaQueue =
    slaQueueDirect.length > 0
      ? slaQueueDirect
      : nestedArray(
          payload,
          ['sla'],
          ['queue', 'sla_queue', 'slaQueue']
        );

  return {
    user: authResult.data.user,

    followups: arrayFrom(
      payload,
      'followups',
      'followups_due',
      'followupsDue'
    ),

    hotJourney: arrayFrom(
      payload,
      'hot_journey',
      'hotJourney',
      'hot_leads',
      'hotLeads'
    ),

    reengaged: arrayFrom(
      payload,
      'reengaged',
      'reengaged_leads',
      'reengagedLeads'
    ),

    paymentPending: arrayFrom(
      payload,
      'payment_pending',
      'paymentPending'
    ),

    hotPaidMedia: arrayFrom(
      payload,
      'hot_paid_media',
      'hotPaidMedia',
      'hot_paid_media_leads',
      'hotPaidMediaLeads'
    ),

    newLeads: arrayFrom(
      payload,
      'new_leads',
      'newLeads',
      'fresh_leads',
      'freshLeads'
    ),

    priorityQueue: arrayFrom(
      payload,
      'priority_queue',
      'priorityQueue',
      'priority_leads',
      'priorityLeads'
    ),

    automationHealth,

    recentAutoTasks: arrayFrom(
      payload,
      'recent_auto_tasks',
      'recentAutoTasks'
    ),

    slaOverview,
    slaQueue,

    leadContacts: arrayFrom(
      payload,
      'lead_contacts',
      'leadContacts',
      'contacts'
    ),

    inboxAttention: arrayFrom(
      payload,
      'inbox_attention',
      'inboxAttention',
      'priority_inbox_attention',
      'priorityInboxAttention'
    ),

    inboxReads: arrayFrom(
      payload,
      'inbox_reads',
      'inboxReads',
      'inbox_read_state',
      'inboxReadState'
    ),

    leadOperational: arrayFrom(
      payload,
      'lead_operational',
      'leadOperational',
      'operational_leads',
      'operationalLeads'
    ),

    courseBatches: arrayFrom(
      payload,
      'course_batches',
      'courseBatches',
      'relevant_batches',
      'relevantBatches'
    ),

    teamMembers: arrayFrom(
      payload,
      'team_members',
      'teamMembers'
    ),

    ownerWorkload: arrayFrom(
      payload,
      'owner_workload',
      'ownerWorkload',
      'team_workload',
      'teamWorkload'
    ),

    batchCapacity: arrayFrom(
      payload,
      'batch_capacity',
      'batchCapacity'
    ),

    needsReplyTotal:
      numberFrom(
        metrics,
        'needs_reply',
        'needsReply',
        'needs_reply_count',
        'needsReplyCount'
      ) ??
      numberFrom(
        payload,
        'needs_reply',
        'needsReply',
        'needs_reply_count',
        'needsReplyCount'
      ),

    unreadTotal:
      numberFrom(
        metrics,
        'unread',
        'unread_count',
        'unreadCount'
      ) ??
      numberFrom(
        payload,
        'unread',
        'unread_count',
        'unreadCount'
      ),
  };
}
