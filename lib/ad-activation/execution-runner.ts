import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  finalizeAdActivationDelivery,
  type ClaimedAdActivationDelivery,
} from "@/lib/ad-activation/delivery-queue";
import {
  claimAdActivationCanaryDelivery,
  renewAdActivationDeliveryLease,
} from "@/lib/ad-activation/provider-queue";
import { prepareAdActivationProviderDryRun } from "@/lib/ad-activation/provider-dry-run";
import { assessAdActivationProviderReadiness } from "@/lib/ad-activation/provider-readiness";
import { executeAdActivationTransport } from "@/lib/ad-activation/provider-transport-boundary";
import { metaCustomAudienceTransportAdapter } from "@/lib/ad-activation/providers/meta-transport";
import {
  acquireAdActivationRunnerLease,
  getAdActivationCanaryScope,
  isAdActivationRunnerEnabled,
  releaseAdActivationRunnerLease,
} from "@/lib/ad-activation/runner-controls";
import { AD_ACTIVATION_TRANSPORT_ENABLED } from "@/lib/ad-activation/transport-policy";
import type { AdActivationProviderResult } from "@/lib/ad-activation/types";

export type AdActivationExecutionSummary = {
  status: "disabled" | "busy" | "completed" | "failed";
  provider: "meta";
  claimed: number;
  delivered: number;
  retry: number;
  skipped: number;
  failed: number;
  leaseLost: number;
  reason?: string;
};

type DestinationContextRow = {
  id: string;
  organization_id: string;
  connection_id: string;
};

function emptySummary(
  status: AdActivationExecutionSummary["status"],
  reason?: string,
): AdActivationExecutionSummary {
  return {
    status,
    provider: "meta",
    claimed: 0,
    delivered: 0,
    retry: 0,
    skipped: 0,
    failed: 0,
    leaseLost: 0,
    ...(reason ? { reason } : {}),
  };
}

async function resolveMetaTransportContext(delivery: ClaimedAdActivationDelivery) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ad_audience_destinations")
    .select("id,organization_id,connection_id")
    .eq("id", delivery.destination_id)
    .eq("organization_id", delivery.organization_id)
    .maybeSingle();

  if (error) {
    throw new Error("Activation destination context lookup failed.");
  }

  if (!data?.connection_id) {
    return null;
  }

  const destination = data as DestinationContextRow;
  return {
    organizationId: delivery.organization_id,
    connectionId: destination.connection_id,
    destinationId: delivery.destination_id,
    outboxId: delivery.outbox_id,
  };
}

async function finalizeSafely(
  delivery: ClaimedAdActivationDelivery,
  result: AdActivationProviderResult,
  startedAt: number,
) {
  return finalizeAdActivationDelivery(delivery, result, {
    durationMs: Math.max(0, Date.now() - startedAt),
    retryAfterSeconds: 60,
  });
}

async function processMetaDelivery(
  delivery: ClaimedAdActivationDelivery,
  leaseSeconds: number,
): Promise<"delivered" | "retry" | "skipped" | "failed" | "lease_lost"> {
  const startedAt = Date.now();

  const renewed = await renewAdActivationDeliveryLease(delivery, leaseSeconds);
  if (!renewed.renewed) {
    return "lease_lost";
  }

  let context;
  try {
    context = await resolveMetaTransportContext(delivery);
  } catch {
    await finalizeSafely(
      delivery,
      {
        status: "retry",
        errorCode: "activation_context_lookup_failed",
        errorMessage: "Activation transport context could not be resolved.",
      },
      startedAt,
    );
    return "retry";
  }

  if (!context) {
    await finalizeSafely(
      delivery,
      {
        status: "failed",
        errorCode: "activation_destination_missing",
        errorMessage: "Activation destination is unavailable for transport.",
      },
      startedAt,
    );
    return "failed";
  }

  /*
   * Fail closed on provider configuration before resolving or hashing any
   * person identifiers. The readiness check is database/config-only and never
   * decrypts credentials or calls Meta.
   */
  let readiness;
  try {
    readiness = await assessAdActivationProviderReadiness({
      organizationId: delivery.organization_id,
      destinationId: delivery.destination_id,
    });
  } catch {
    await finalizeSafely(
      delivery,
      {
        status: "retry",
        errorCode: "activation_readiness_check_failed",
        errorMessage: "Activation provider readiness could not be verified.",
      },
      startedAt,
    );
    return "retry";
  }

  const actionReady =
    delivery.action === "add"
      ? readiness.addReady
      : readiness.removeReady;

  if (readiness.provider !== "meta" || !actionReady) {
    await finalizeSafely(
      delivery,
      {
        status: "failed",
        errorCode: "activation_provider_not_ready",
        errorMessage: "Meta activation destination is not ready for this action.",
      },
      startedAt,
    );
    return "failed";
  }

  let prepared;
  try {
    prepared = await prepareAdActivationProviderDryRun(delivery);
  } catch {
    await finalizeSafely(
      delivery,
      {
        status: "retry",
        errorCode: "activation_prepare_failed",
        errorMessage: "Activation provider preparation failed before send.",
      },
      startedAt,
    );
    return "retry";
  }

  if (prepared.status !== "ready") {
    // The canonical pre-send validator may already have marked an invalid row as
    // skipped and released its lease. Finalization is therefore best-effort.
    try {
      await finalizeSafely(
        delivery,
        { status: "skipped", reason: prepared.reason },
        startedAt,
      );
    } catch {
      // Do not convert an already-skipped canonical row into a retry.
    }
    return "skipped";
  }

  if (prepared.provider !== "meta") {
    await finalizeSafely(
      delivery,
      {
        status: "retry",
        errorCode: "activation_provider_mismatch",
        errorMessage: "Claimed Meta delivery prepared for a different provider.",
      },
      startedAt,
    );
    return "retry";
  }

  const result = await executeAdActivationTransport({
    context,
    prepared,
    adapters: [metaCustomAudienceTransportAdapter],
  });

  await finalizeSafely(delivery, result, startedAt);
  return result.status;
}

/**
 * Execute one Meta activation canary cycle.
 *
 * Initial live delivery requires all of the following:
 *  1. compile-time provider transport policy enabled by reviewed code
 *  2. runtime AD_ACTIVATION_RUNNER_ENABLED=true
 *  3. explicit AD_ACTIVATION_CANARY_DESTINATION_ID
 *  4. explicit AD_ACTIVATION_CANARY_PERSON_ID
 *
 * Even with those controls enabled, this phase can claim at most one outbox row
 * matching that exact destination/person pair. There is intentionally no broad
 * audience drain path in Phase 7D.4.
 */
export async function runMetaAdActivationExecutionCycle(input: {
  leaseSeconds?: number;
  runnerLeaseSeconds?: number;
} = {}): Promise<AdActivationExecutionSummary> {
  if (AD_ACTIVATION_TRANSPORT_ENABLED === false) {
    return emptySummary("disabled", "provider_transport_disabled");
  }

  if (!isAdActivationRunnerEnabled()) {
    return emptySummary("disabled", "runner_kill_switch_disabled");
  }

  const canaryScope = getAdActivationCanaryScope();
  if (!canaryScope) {
    return emptySummary("disabled", "canary_scope_not_configured");
  }

  const leaseSeconds = Math.max(60, Math.min(input.leaseSeconds ?? 300, 600));
  const runnerLeaseSeconds = Math.max(120, Math.min(input.runnerLeaseSeconds ?? 600, 900));

  const runnerLease = await acquireAdActivationRunnerLease("meta", runnerLeaseSeconds);
  if (!runnerLease.acquired) {
    return emptySummary("busy", runnerLease.reason);
  }

  const summary: AdActivationExecutionSummary = {
    status: "completed",
    provider: "meta",
    claimed: 0,
    delivered: 0,
    retry: 0,
    skipped: 0,
    failed: 0,
    leaseLost: 0,
  };

  try {
    const delivery = await claimAdActivationCanaryDelivery({
      provider: "meta",
      destinationId: canaryScope.destinationId,
      personId: canaryScope.personId,
      leaseSeconds,
    });

    if (delivery) {
      summary.claimed = 1;

      try {
        const outcome = await processMetaDelivery(delivery, leaseSeconds);
        if (outcome === "lease_lost") summary.leaseLost += 1;
        else summary[outcome] += 1;
      } catch {
        // Leave an unfinalized leased row to expire naturally rather than risk a
        // second provider call after an ambiguous execution failure.
        summary.leaseLost += 1;
      }
    }

    await releaseAdActivationRunnerLease({
      provider: "meta",
      leaseToken: runnerLease.leaseToken,
      telemetry: {
        status: "completed",
        claimed: summary.claimed,
        delivered: summary.delivered,
        retry: summary.retry,
        skipped: summary.skipped,
        failed: summary.failed,
        leaseLost: summary.leaseLost,
      },
    });

    return summary;
  } catch {
    summary.status = "failed";
    summary.reason = "runner_execution_failed";

    try {
      await releaseAdActivationRunnerLease({
        provider: "meta",
        leaseToken: runnerLease.leaseToken,
        telemetry: {
          status: "failed",
          claimed: summary.claimed,
          delivered: summary.delivered,
          retry: summary.retry,
          skipped: summary.skipped,
          failed: summary.failed,
          leaseLost: summary.leaseLost,
          errorCode: "runner_execution_failed",
        },
      });
    } catch {
      // The lease is bounded and will expire automatically if release fails.
    }

    return summary;
  }
}
