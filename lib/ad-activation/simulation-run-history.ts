import "server-only";

import type { AdActivationSimulationTelemetry } from "@/lib/ad-activation/simulation-runner";

export type AdActivationSimulationRunHistoryItem = {
  runId: string;
  label: string;
  finishedAt: string;
  durationMs: number;
  claimed: number;
  processed: number;
  blockedOrRejected: number;
  wouldRetry: number;
  wouldSkip: number;
  wouldFail: number;
  safetyInvariant: "transport_disabled_and_non_persistent";
};

export type AdActivationSimulationRunHistoryProjection = {
  schemaVersion: 1;
  mode: "simulation_history";
  persistentStorage: false;
  totalRunsObserved: number;
  latestFinishedAt: string | null;
  totals: {
    claimed: number;
    processed: number;
    delivered: 0;
    finalizedPersistently: 0;
    validationRejected: number;
    preparationSkipped: number;
    transportBlocked: number;
    transportNonDelivery: number;
    wouldRetry: number;
    wouldSkip: number;
    wouldFail: number;
  };
  items: AdActivationSimulationRunHistoryItem[];
};

function validTelemetry(event: AdActivationSimulationTelemetry): boolean {
  return (
    event.mode === "simulation" &&
    event.transportEnabled === false &&
    event.persistentFinalization === false &&
    event.liveBindings === "absent" &&
    event.counts.delivered === 0 &&
    event.counts.finalizedPersistently === 0
  );
}

/**
 * Pure in-memory read projection over already-produced simulation telemetry.
 * It does not read or write a database, queue, filesystem, or provider API.
 */
export function projectAdActivationSimulationRunHistory(
  events: readonly AdActivationSimulationTelemetry[],
  limit = 20,
): AdActivationSimulationRunHistoryProjection {
  const safeEvents = events.filter(validTelemetry);
  const ordered = [...safeEvents].sort((a, b) =>
    b.finishedAt.localeCompare(a.finishedAt) || b.runId.localeCompare(a.runId),
  );
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

  const totals = {
    claimed: 0,
    processed: 0,
    delivered: 0 as const,
    finalizedPersistently: 0 as const,
    validationRejected: 0,
    preparationSkipped: 0,
    transportBlocked: 0,
    transportNonDelivery: 0,
    wouldRetry: 0,
    wouldSkip: 0,
    wouldFail: 0,
  };

  for (const event of safeEvents) {
    totals.claimed += event.counts.claimed;
    totals.processed += event.counts.processed;
    totals.validationRejected += event.counts.validationRejected;
    totals.preparationSkipped += event.counts.preparationSkipped;
    totals.transportBlocked += event.counts.transportBlocked;
    totals.transportNonDelivery += event.counts.transportNonDelivery;
    totals.wouldRetry += event.wouldFinalize.retry;
    totals.wouldSkip += event.wouldFinalize.skipped;
    totals.wouldFail += event.wouldFinalize.failed;
  }

  return {
    schemaVersion: 1,
    mode: "simulation_history",
    persistentStorage: false,
    totalRunsObserved: safeEvents.length,
    latestFinishedAt: ordered[0]?.finishedAt ?? null,
    totals,
    items: ordered.slice(0, boundedLimit).map((event) => ({
      runId: event.runId,
      label: event.label,
      finishedAt: event.finishedAt,
      durationMs: event.durationMs,
      claimed: event.counts.claimed,
      processed: event.counts.processed,
      blockedOrRejected:
        event.counts.validationRejected +
        event.counts.preparationSkipped +
        event.counts.transportBlocked +
        event.counts.transportNonDelivery,
      wouldRetry: event.wouldFinalize.retry,
      wouldSkip: event.wouldFinalize.skipped,
      wouldFail: event.wouldFinalize.failed,
      safetyInvariant: "transport_disabled_and_non_persistent",
    })),
  };
}
