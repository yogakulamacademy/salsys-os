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

export type FollowUpsWorkspaceSummary = {
  dueNow: number;
  highIntentQueue: number;
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
  tasks: FollowUp[];
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
  current_stage?: string | null;
  intent?: string | null;
  current_contact_channel?: string | null;
};

type RpcPayload = {
  tasks?: RpcTask[];
  summary?: {
    due_now?: number | string | null;
    high_intent_queue?: number | string | null;
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

export async function getFollowUpsWorkspace({
  page = 1,
  pageSize = 50,
}: {
  page?: number;
  pageSize?: number;
} = {}): Promise<FollowUpsWorkspace> {
  const safePage = positiveInteger(page, 1);
  const safePageSize = Math.min(
    positiveInteger(pageSize, 50),
    100,
  );

  if (isMockMode()) {
    const tasks = await getFollowUps();

    return buildLocalWorkspace(
      tasks,
      safePage,
      safePageSize,
      false,
      null,
    );
  }

  const supabase = await createClient();

  const {
    data,
    error,
  } = await supabase.rpc(
    'get_followups_workspace',
    {
      p_page: safePage,
      p_page_size: safePageSize,
    },
  );

  if (error) {
    /*
     * Safe fallback:
     * keep the page operational if the optimized
     * read model is unavailable for any reason.
     */
    const tasks = await getFollowUps();

    return buildLocalWorkspace(
      tasks,
      safePage,
      safePageSize,
      true,
      `Optimized follow-up read model unavailable: ${error.message}`,
    );
  }

  const payload =
    (data ?? {}) as RpcPayload;

  const tasks = (
    payload.tasks ?? []
  )
    .filter(
      (row) =>
        Boolean(
          row.task_id &&
            row.lead_id &&
            row.due_at,
        ),
    )
    .map(mapRpcTask);

  const summary = {
    dueNow: toNumber(
      payload.summary?.due_now,
    ),
    highIntentQueue: toNumber(
      payload.summary
        ?.high_intent_queue,
    ),
  };

  const total = toNumber(
    payload.pagination?.total,
  );

  const totalPages = Math.max(
    1,
    toNumber(
      payload.pagination
        ?.total_pages,
      1,
    ),
  );

  return {
    tasks,
    summary,
    pagination: {
      page: Math.max(
        1,
        toNumber(
          payload.pagination?.page,
          safePage,
        ),
      ),
      pageSize: Math.max(
        1,
        toNumber(
          payload.pagination
            ?.page_size,
          safePageSize,
        ),
      ),
      total,
      totalPages,
      from: toNumber(
        payload.pagination?.from,
      ),
      to: toNumber(
        payload.pagination?.to,
      ),
    },
    fallback: false,
    warning: null,
  };
}

function mapRpcTask(
  row: RpcTask,
): FollowUp {
  return {
    id: String(
      row.task_id,
    ),
    leadId: String(
      row.lead_id,
    ),
    leadCode:
      row.lead_code ??
      '',
    leadName:
      row.lead_name ??
      'Lead',
    title:
      row.title ??
      'Follow-up',
    dueAt: String(
      row.due_at,
    ),
    stage:
      (
        row.current_stage ??
        'new'
      ) as LeadStage,
    intent:
      row.intent as FollowUp['intent'],
    channel:
      (
        row.current_contact_channel ??
        'other'
      ) as Channel,
  };
}

function buildLocalWorkspace(
  allTasks: FollowUp[],
  page: number,
  pageSize: number,
  fallback: boolean,
  warning: string | null,
): FollowUpsWorkspace {
  const total =
    allTasks.length;

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        total / pageSize,
      ),
    );

  const safePage =
    Math.min(
      Math.max(
        page,
        1,
      ),
      totalPages,
    );

  const start =
    (
      safePage - 1
    ) * pageSize;

  const tasks =
    allTasks.slice(
      start,
      start + pageSize,
    );

  return {
    tasks,
    summary: {
      dueNow: total,
      highIntentQueue:
        allTasks.filter(
          (task) =>
            [
              'high_intent',
              'payment_pending',
            ].includes(
              task.stage,
            ),
        ).length,
    },
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      from:
        total === 0
          ? 0
          : start + 1,
      to:
        total === 0
          ? 0
          : Math.min(
              start +
                pageSize,
              total,
            ),
    },
    fallback,
    warning,
  };
}

function positiveInteger(
  value: number,
  fallback: number,
) {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return fallback;
  }

  const parsed =
    Math.floor(value);

  return parsed > 0
    ? parsed
    : fallback;
}

function toNumber(
  value:
    | number
    | string
    | null
    | undefined,
  fallback = 0,
) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : fallback;
}
