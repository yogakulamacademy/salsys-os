import type {
  Channel,
  FollowUp,
  LeadStage,
} from '@/types/crm';

import {
  getFollowUps,
  isMockMode,
} from '@/lib/data';

import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

export type FollowUpTaskType =
  | 'follow_up'
  | 'call'
  | 'payment_check'
  | 'human_review'
  | 'other';

export type FollowUpsWorkspaceTask = FollowUp & {
  taskType: FollowUpTaskType;
};

export type FollowUpsWorkspaceSummary = {
  dueNow: number;
  highIntentQueue: number;
  paymentChecks: number;
};

export type FollowUpsWorkspacePagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
};

export type FollowUpsWorkspace = {
  tasks: FollowUpsWorkspaceTask[];
  summary: FollowUpsWorkspaceSummary;
  pagination: FollowUpsWorkspacePagination;
  fallback: boolean;
  warning: string | null;
};

type RpcTask = {
  task_id?: string | null;
  lead_id?: string | null;
  lead_code?: string | null;
  lead_name?: string | null;
  title?: string | null;
  due_at?: string | null;
  task_type?: string | null;
  current_stage?: string | null;
  intent?: string | null;
  current_contact_channel?: string | null;
};

type RpcPayload = {
  tasks?: RpcTask[];
  summary?: {
    due_now?: number | string | null;
    high_intent_queue?: number | string | null;
    payment_checks?: number | string | null;
  };
  pagination?: {
    page?: number | string | null;
    page_size?: number | string | null;
    total?: number | string | null;
    total_pages?: number | string | null;
    from?: number | string | null;
    to?: number | string | null;
  };
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function getFollowUpsWorkspace({
  page = 1,
  pageSize = 50,
}: {
  page?: number;
  pageSize?: number;
} = {}): Promise<FollowUpsWorkspace> {
  const safePage = positiveInteger(page, 1);
  const safePageSize = Math.min(positiveInteger(pageSize, 50), 100);

  if (isMockMode()) {
    const tasks = await getFollowUps();
    return buildLocalWorkspace(tasks, safePage, safePageSize, false, null);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unable to load follow-ups: user is not authenticated.');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const first = await loadCanonicalWorkspace(
    supabase,
    organizationId,
    safePage,
    safePageSize,
  );

  if (first.error) {
    const tasks = await getFollowUps();
    return buildLocalWorkspace(
      tasks,
      safePage,
      safePageSize,
      true,
      `Optimized follow-up read model unavailable: ${first.error}`,
    );
  }

  let workspace = parseRpcWorkspace(first.payload, safePage, safePageSize);

  if (
    workspace.pagination.total > 0 &&
    workspace.pagination.page > workspace.pagination.totalPages
  ) {
    const lastPage = workspace.pagination.totalPages;
    const clamped = await loadCanonicalWorkspace(
      supabase,
      organizationId,
      lastPage,
      safePageSize,
    );

    if (clamped.error) {
      const tasks = await getFollowUps();
      return buildLocalWorkspace(
        tasks,
        lastPage,
        safePageSize,
        true,
        `Optimized follow-up read model became unavailable while clamping pagination: ${clamped.error}`,
      );
    }

    workspace = parseRpcWorkspace(clamped.payload, lastPage, safePageSize);
  }

  return workspace;
}

async function loadCanonicalWorkspace(
  supabase: SupabaseClient,
  organizationId: string,
  page: number,
  pageSize: number,
) {
  const { data, error } = await supabase.rpc('get_followups_workspace', {
    p_organization_id: organizationId,
    p_page: page,
    p_page_size: pageSize,
  });

  return {
    payload: (data ?? {}) as RpcPayload,
    error: error?.message ?? null,
  };
}

function parseRpcWorkspace(
  payload: RpcPayload,
  fallbackPage: number,
  fallbackPageSize: number,
): FollowUpsWorkspace {
  const tasks = (payload.tasks ?? [])
    .filter((row) => Boolean(row.task_id && row.lead_id && row.due_at))
    .map(mapRpcTask);

  const total = toNumber(payload.pagination?.total);
  const totalPages = Math.max(1, toNumber(payload.pagination?.total_pages, 1));

  return {
    tasks,
    summary: {
      dueNow: toNumber(payload.summary?.due_now),
      highIntentQueue: toNumber(payload.summary?.high_intent_queue),
      paymentChecks: toNumber(payload.summary?.payment_checks),
    },
    pagination: {
      page: Math.max(1, toNumber(payload.pagination?.page, fallbackPage)),
      pageSize: Math.max(
        1,
        toNumber(payload.pagination?.page_size, fallbackPageSize),
      ),
      total,
      totalPages,
      from: toNumber(payload.pagination?.from),
      to: toNumber(payload.pagination?.to),
    },
    fallback: false,
    warning: null,
  };
}

function mapRpcTask(row: RpcTask): FollowUpsWorkspaceTask {
  return {
    id: String(row.task_id),
    leadId: String(row.lead_id),
    leadCode: row.lead_code ?? '',
    leadName: row.lead_name ?? 'Lead',
    title: row.title ?? 'Follow-up',
    dueAt: String(row.due_at),
    taskType: safeTaskType(row.task_type),
    stage: (row.current_stage ?? 'new') as LeadStage,
    intent: row.intent as FollowUp['intent'],
    channel: (row.current_contact_channel ?? 'other') as Channel,
  };
}

function buildLocalWorkspace(
  allTasks: FollowUp[],
  page: number,
  pageSize: number,
  fallback: boolean,
  warning: string | null,
): FollowUpsWorkspace {
  const normalizedTasks: FollowUpsWorkspaceTask[] = allTasks.map((task) => ({
    ...task,
    taskType: 'follow_up',
  }));
  const total = normalizedTasks.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const tasks = normalizedTasks.slice(start, start + pageSize);

  return {
    tasks,
    summary: {
      dueNow: total,
      highIntentQueue: normalizedTasks.filter((task) =>
        ['high_intent', 'payment_pending'].includes(task.stage),
      ).length,
      paymentChecks: 0,
    },
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      from: total === 0 ? 0 : start + 1,
      to: total === 0 ? 0 : Math.min(start + pageSize, total),
    },
    fallback,
    warning,
  };
}

function safeTaskType(value: string | null | undefined): FollowUpTaskType {
  if (
    value === 'call' ||
    value === 'payment_check' ||
    value === 'human_review' ||
    value === 'other'
  ) {
    return value;
  }
  return 'follow_up';
}

function positiveInteger(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  const parsed = Math.floor(value);
  return parsed > 0 ? parsed : fallback;
}

function toNumber(
  value: number | string | null | undefined,
  fallback = 0,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
