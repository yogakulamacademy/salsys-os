import "server-only";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  runConfiguredConversionFeedbackWorker,
  type RunConfiguredConversionFeedbackWorkerOptions,
} from "@/lib/conversion-feedback/configured-worker";

import type {
  ConversionFeedbackWorkerReport,
} from "@/lib/conversion-feedback/types";


const DEFAULT_ENQUEUE_LIMIT =
  500;

const MAX_ACTIVE_ROUTE_ROWS =
  5000;


type EnqueueConversionFeedbackReport = {
  organizationId: string;
  candidateCount: number;
  insertedCount: number;
  alreadyQueuedCount: number;
};

export type RunConfiguredConversionFeedbackCycleOptions =
  RunConfiguredConversionFeedbackWorkerOptions & {
    enqueueLimit?: number;
  };

export type RunConfiguredConversionFeedbackCycleReport = {
  organizationId: string;
  enqueue: EnqueueConversionFeedbackReport;
  worker: ConversionFeedbackWorkerReport;
};

export type ScheduledConversionFeedbackReport = {
  organizations: number;
  successful: number;
  failed: number;

  enqueue: {
    candidateCount: number;
    insertedCount: number;
    alreadyQueuedCount: number;
  };

  worker: Omit<
    ConversionFeedbackWorkerReport,
    "organizationId"
  >;
};


function recordValue(
  value: unknown,
): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as
    Record<string, unknown>;
}


function integerValue(
  value: unknown,
) {
  if (
    typeof value === "number" &&
    Number.isInteger(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    /^\d+$/.test(value)
  ) {
    return Number(value);
  }

  return null;
}


function parseEnqueueReport(
  value: unknown,
  organizationId: string,
): EnqueueConversionFeedbackReport {
  const record =
    recordValue(value);

  const responseOrganizationId =
    typeof record?.organization_id ===
      "string"
      ? record.organization_id
      : null;

  const candidateCount =
    integerValue(
      record?.candidate_count,
    );

  const insertedCount =
    integerValue(
      record?.inserted_count,
    );

  const alreadyQueuedCount =
    integerValue(
      record?.already_queued_count,
    );

  if (
    record?.ok !== true ||
    responseOrganizationId !==
      organizationId ||
    candidateCount === null ||
    insertedCount === null ||
    alreadyQueuedCount === null
  ) {
    throw new Error(
      "Conversion feedback enqueue returned invalid data.",
    );
  }

  return {
    organizationId,
    candidateCount,
    insertedCount,
    alreadyQueuedCount,
  };
}


async function enqueueConversionFeedback({
  organizationId,
  enqueueLimit,
}: {
  organizationId: string;
  enqueueLimit: number;
}) {
  const admin =
    createAdminClient();

  const {
    data,
    error,
  } =
    await admin.rpc(
      "enqueue_conversion_feedback",
      {
        p_organization_id:
          organizationId,

        p_conversion_fact_key:
          null,

        p_limit:
          enqueueLimit,
      },
    );

  if (error) {
    throw new Error(
      error.message,
    );
  }

  return parseEnqueueReport(
    data,
    organizationId,
  );
}


export async function runConfiguredConversionFeedbackCycle(
  options:
    RunConfiguredConversionFeedbackCycleOptions,
): Promise<
  RunConfiguredConversionFeedbackCycleReport
> {
  const organizationId =
    options.organizationId?.trim();

  if (!organizationId) {
    throw new Error(
      "organizationId is required.",
    );
  }

  const enqueueLimit =
    options.enqueueLimit ??
    DEFAULT_ENQUEUE_LIMIT;

  if (
    !Number.isInteger(
      enqueueLimit,
    ) ||
    enqueueLimit < 1 ||
    enqueueLimit > 5000
  ) {
    throw new Error(
      "enqueueLimit must be an integer between 1 and 5000.",
    );
  }

  /*
   * Queue materialization is deliberately separated from provider delivery.
   * The RPC is idempotent on route_id + conversion_fact_key, so every worker
   * cycle can safely discover newly-created canonical conversion facts first.
   */
  const enqueue =
    await enqueueConversionFeedback({
      organizationId,
      enqueueLimit,
    });

  const worker =
    await runConfiguredConversionFeedbackWorker({
      organizationId,
      limit:
        options.limit,
      leaseSeconds:
        options.leaseSeconds,
    });

  return {
    organizationId,
    enqueue,
    worker,
  };
}


async function activeRouteOrganizationIds() {
  const admin =
    createAdminClient();

  const {
    data,
    error,
  } =
    await admin
      .from(
        "conversion_feedback_routes",
      )
      .select(
        "organization_id",
      )
      .eq(
        "status",
        "active",
      )
      .limit(
        MAX_ACTIVE_ROUTE_ROWS + 1,
      );

  if (error) {
    throw new Error(
      error.message,
    );
  }

  if (
    (data?.length ?? 0) >
    MAX_ACTIVE_ROUTE_ROWS
  ) {
    throw new Error(
      "Conversion feedback active-route scan exceeded its safety limit.",
    );
  }

  const organizationIds =
    new Set<string>();

  for (const row of data ?? []) {
    const organizationId =
      typeof row.organization_id ===
        "string"
        ? row.organization_id.trim()
        : "";

    if (organizationId) {
      organizationIds.add(
        organizationId,
      );
    }
  }

  return [
    ...organizationIds,
  ].sort();
}


export async function runScheduledConversionFeedback(
  options: {
    limit?: number;
    leaseSeconds?: number;
    enqueueLimit?: number;
  } = {},
): Promise<
  ScheduledConversionFeedbackReport
> {
  const organizationIds =
    await activeRouteOrganizationIds();

  const report:
    ScheduledConversionFeedbackReport = {
      organizations:
        organizationIds.length,

      successful:
        0,

      failed:
        0,

      enqueue: {
        candidateCount:
          0,

        insertedCount:
          0,

        alreadyQueuedCount:
          0,
      },

      worker: {
        claimed:
          0,

        delivered:
          0,

        skipped:
          0,

        retryableFailed:
          0,

        permanentFailed:
          0,

        leaseLost:
          0,

        finalizationErrors:
          0,
      },
    };

  for (const organizationId of organizationIds) {
    try {
      const cycle =
        await runConfiguredConversionFeedbackCycle({
          organizationId,
          limit:
            options.limit,
          leaseSeconds:
            options.leaseSeconds,
          enqueueLimit:
            options.enqueueLimit,
        });

      report.successful +=
        1;

      report.enqueue.candidateCount +=
        cycle.enqueue.candidateCount;

      report.enqueue.insertedCount +=
        cycle.enqueue.insertedCount;

      report.enqueue.alreadyQueuedCount +=
        cycle.enqueue.alreadyQueuedCount;

      report.worker.claimed +=
        cycle.worker.claimed;

      report.worker.delivered +=
        cycle.worker.delivered;

      report.worker.skipped +=
        cycle.worker.skipped;

      report.worker.retryableFailed +=
        cycle.worker.retryableFailed;

      report.worker.permanentFailed +=
        cycle.worker.permanentFailed;

      report.worker.leaseLost +=
        cycle.worker.leaseLost;

      report.worker.finalizationErrors +=
        cycle.worker.finalizationErrors;
    } catch (error) {
      report.failed +=
        1;

      console.error(
        "Scheduled conversion feedback organization run failed.",
        {
          organizationId,
          error,
        },
      );
    }
  }

  return report;
}
