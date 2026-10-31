import "server-only";

import type {
  AdActivationPreSendValidation,
  ClaimedAdActivationDelivery,
} from "@/lib/ad-activation/delivery-queue";
import type { AdActivationProviderDryRun } from "@/lib/ad-activation/provider-dry-run";
import { executeAdActivationTransport } from "@/lib/ad-activation/provider-transport-boundary";
import { assertAdActivationTransportDisabled } from "@/lib/ad-activation/transport-policy";
import type { AdActivationProviderResult } from "@/lib/ad-activation/types";

export type AdActivationWorkerSimulationDependencies = {
  /** Phase 7C requires an injected claim implementation; no live queue claimer is wired here. */
  claimDeliveries(input: {
    limit: number;
    leaseSeconds: number;
  }): Promise<ClaimedAdActivationDelivery[]>;
  /** Injected so simulation cannot silently touch the production lease validator. */
  validateBeforeSend(
    delivery: ClaimedAdActivationDelivery,
  ): Promise<AdActivationPreSendValidation>;
  /** Must prepare from an already validated lease; validation is not repeated. */
  prepareAfterValidation(
    delivery: ClaimedAdActivationDelivery,
    validation: AdActivationPreSendValidation,
  ): Promise<AdActivationProviderDryRun>;
};

export type SimulatedAdActivationFinalization = {
  outcome: "retry" | "skipped" | "failed";
  reason: string;
  persisted: false;
};

export type AdActivationWorkerSimulationItem = {
  outboxId: string;
  attemptNumber: number;
  stage:
    | "validation_rejected"
    | "preparation_skipped"
    | "transport_blocked"
    | "transport_non_delivery";
  transportResult: AdActivationProviderResult | null;
  wouldFinalize: SimulatedAdActivationFinalization;
};

export type AdActivationWorkerSimulationReport = {
  mode: "simulation";
  transportEnabled: false;
  claimed: number;
  processed: number;
  delivered: 0;
  finalizedPersistently: 0;
  items: AdActivationWorkerSimulationItem[];
};

function simulatedFinalizationForResult(
  result: AdActivationProviderResult,
): SimulatedAdActivationFinalization {
  if (result.status === "retry") {
    return { outcome: "retry", reason: result.errorCode, persisted: false };
  }
  if (result.status === "failed") {
    return { outcome: "failed", reason: result.errorCode, persisted: false };
  }
  if (result.status === "skipped") {
    return { outcome: "skipped", reason: result.reason, persisted: false };
  }

  throw new Error(
    "Phase 7C simulation received an impossible delivered result while transport is disabled.",
  );
}

/**
 * Execute the Phase 7C worker sequence without a live queue/finalizer binding.
 *
 * Sequence: injected claim -> injected leased validation -> injected preparation
 * -> hard-disabled transport boundary -> in-memory finalization preview.
 *
 * The absence of production claim/finalize imports is intentional: simply
 * importing or invoking this worker can never consume the real queue or persist
 * a delivery outcome. A later explicitly authorized live phase must supply a
 * separate configured runner.
 */
export async function runAdActivationWorkerSimulation(input: {
  dependencies: AdActivationWorkerSimulationDependencies;
  limit?: number;
  leaseSeconds?: number;
}): Promise<AdActivationWorkerSimulationReport> {
  assertAdActivationTransportDisabled();

  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const leaseSeconds = Math.min(Math.max(input.leaseSeconds ?? 120, 30), 900);
  const deliveries = await input.dependencies.claimDeliveries({ limit, leaseSeconds });
  const items: AdActivationWorkerSimulationItem[] = [];

  for (const delivery of deliveries) {
    const validation = await input.dependencies.validateBeforeSend(delivery);
    if (!validation.valid) {
      items.push({
        outboxId: delivery.outbox_id,
        attemptNumber: delivery.attempt_number,
        stage: "validation_rejected",
        transportResult: null,
        wouldFinalize: {
          outcome: "skipped",
          reason: validation.reason || "pre_send_validation_failed",
          persisted: false,
        },
      });
      continue;
    }

    const prepared = await input.dependencies.prepareAfterValidation(delivery, validation);
    if (prepared.status !== "ready") {
      items.push({
        outboxId: delivery.outbox_id,
        attemptNumber: delivery.attempt_number,
        stage: "preparation_skipped",
        transportResult: null,
        wouldFinalize: {
          outcome: "skipped",
          reason: prepared.reason,
          persisted: false,
        },
      });
      continue;
    }

    const transportResult = await executeAdActivationTransport({
      context: {
        organizationId: delivery.organization_id,
        connectionId: prepared.connectionId,
        destinationId: delivery.destination_id,
        outboxId: delivery.outbox_id,
      },
      prepared,
    });

    const wouldFinalize = simulatedFinalizationForResult(transportResult);
    items.push({
      outboxId: delivery.outbox_id,
      attemptNumber: delivery.attempt_number,
      stage:
        transportResult.status === "skipped" &&
        transportResult.reason === "provider_transport_disabled"
          ? "transport_blocked"
          : "transport_non_delivery",
      transportResult,
      wouldFinalize,
    });
  }

  return {
    mode: "simulation",
    transportEnabled: false,
    claimed: deliveries.length,
    processed: items.length,
    delivered: 0,
    finalizedPersistently: 0,
    items,
  };
}
