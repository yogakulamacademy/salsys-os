import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  finalizeAdActivationDelivery,
  type ClaimedAdActivationDelivery,
} from "@/lib/ad-activation/delivery-queue";
import {
  claimAdActivationDeliveriesForProvider,
  renewAdActivationDeliveryLease,
} from "@/lib/ad-activation/provider-queue";
import { prepareAdActivationProviderDryRun } from "@/lib/ad-activation/provider-dry-run";
import { executeAdActivationTransport } from "@/lib/ad-activation/provider-transport-boundary";
import { metaCustomAudienceTransportAdapter } from "@/lib/ad-activation/providers/meta-transport";
import { AD_ACTIVATION_TRANSPORT_ENABLED } from "@/lib/ad-activation/transport-policy";
import type { AdActivationProviderResult } from "@/lib/ad-activation/types";

export type AdActivationExecutionSummary = {
  status: "disabled" | "completed";
  provider: "meta";
  claimed: number;
  delivered: number;
  retry: number;
  skipped: number;
  failed: number;
  leaseLost: number;
};

type DestinationContextRow = {
  id: string;
  organization_id: string;
  connection_id: string;
};

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

  const result = await executeAdActivationTransport({
    context,
    prepared,
    adapters: [metaCustomAudienceTransportAdapter],
  });

  await finalizeSafely(delivery, result, startedAt);
  return result.status;
}

/**
 * Execute one bounded Meta activation cycle.
 *
 * Critical safety property: while the compile-time transport policy is false,
 * this function returns before claiming or mutating any queue row. Enabling a
 * future live send therefore requires an explicit reviewed code change.
 */
export async function runMetaAdActivationExecutionCycle(input: {
  limit?: number;
  leaseSeconds?: number;
} = {}): Promise<AdActivationExecutionSummary> {
  if (AD_ACTIVATION_TRANSPORT_ENABLED === false) {
    return {
      status: "disabled",
      provider: "meta",
      claimed: 0,
      delivered: 0,
      retry: 0,
      skipped: 0,
      failed: 0,
      leaseLost: 0,
    };
  }

  const limit = Math.max(1, Math.min(input.limit ?? 10, 25));
  const leaseSeconds = Math.max(60, Math.min(input.leaseSeconds ?? 300, 600));
  const deliveries = await claimAdActivationDeliveriesForProvider(
    "meta",
    limit,
    leaseSeconds,
  );

  const summary: AdActivationExecutionSummary = {
    status: "completed",
    provider: "meta",
    claimed: deliveries.length,
    delivered: 0,
    retry: 0,
    skipped: 0,
    failed: 0,
    leaseLost: 0,
  };

  // Sequential delivery keeps provider pressure and lease behavior predictable.
  // Batch size is deliberately bounded above to 25.
  for (const delivery of deliveries) {
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

  return summary;
}
