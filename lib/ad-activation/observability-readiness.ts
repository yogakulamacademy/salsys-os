import "server-only";

import type { AdActivationExecutionReadiness } from "@/lib/ad-activation/execution-readiness";
import type { AdActivationScenarioComparisonReport } from "@/lib/ad-activation/simulation-scenario-executor";

export type AdActivationObservabilityStatus =
  | "simulation_verified"
  | "needs_attention"
  | "insufficient_evidence";

export type AdActivationDestinationObservability = {
  destinationId: string;
  provider: "meta" | "google" | "unsupported";
  action: "add" | "remove";
  configurationReady: boolean;
  credentialReady: boolean;
  structuralReady: boolean;
  authorizedToSend: false;
  blockers: string[];
};

export type AdActivationObservabilityProjection = {
  schemaVersion: 1;
  mode: "simulation_only";
  status: AdActivationObservabilityStatus;
  headline: string;
  authorizedToSend: false;
  transportEnabled: false;
  persistentFinalization: false;
  liveQueueObserved: false;
  simulation: {
    verified: boolean;
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    latestFinishedAt: string | null;
    delivered: 0;
    finalizedPersistently: 0;
    transportBlocked: number;
    validationRejected: number;
    preparationSkipped: number;
  };
  readiness: {
    destinationsObserved: number;
    structurallyReady: number;
    structurallyBlocked: number;
    credentialReady: number;
    configurationReady: number;
  };
  destinations: AdActivationDestinationObservability[];
  blockers: string[];
  notices: string[];
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Pure CRM-facing readiness projection for Phase 7C.
 *
 * It consumes already-derived execution-readiness and deterministic simulation
 * evidence. It performs no database reads, queue claims, credential decryption,
 * provider calls, or persistent writes. A green result means simulation/preflight
 * evidence is healthy only; it never authorizes live activation transport.
 */
export function projectAdActivationObservabilityReadiness(input: {
  executionReadiness: readonly AdActivationExecutionReadiness[];
  simulation: AdActivationScenarioComparisonReport;
}): AdActivationObservabilityProjection {
  const destinations = input.executionReadiness.map((item) => ({
    destinationId: item.destinationId,
    provider: item.provider,
    action: item.action,
    configurationReady: item.configurationReady,
    credentialReady: item.credentialReady,
    structuralReady: item.structuralReady,
    authorizedToSend: false as const,
    blockers: unique(item.reasons),
  }));

  const simulationSafe =
    input.simulation.allPassed &&
    input.simulation.transportEnabled === false &&
    input.simulation.persistentFinalization === false &&
    input.simulation.liveBindings === "absent" &&
    input.simulation.history.totals.delivered === 0 &&
    input.simulation.history.totals.finalizedPersistently === 0;

  const structurallyReady = destinations.filter((item) => item.structuralReady).length;
  const credentialReady = destinations.filter((item) => item.credentialReady).length;
  const configurationReady = destinations.filter((item) => item.configurationReady).length;
  const structurallyBlocked = destinations.length - structurallyReady;

  const blockers = unique([
    ...destinations.flatMap((item) => item.blockers),
    ...(simulationSafe ? [] : ["deterministic_simulation_not_verified"]),
    "provider_transport_disabled",
    "live_queue_not_observed",
    "live_activation_not_authorized",
  ]);

  const status: AdActivationObservabilityStatus = !simulationSafe
    ? "needs_attention"
    : destinations.length === 0
      ? "insufficient_evidence"
      : structurallyBlocked > 0
        ? "needs_attention"
        : "simulation_verified";

  const headline = status === "simulation_verified"
    ? "Activation preflight is structurally ready in simulation; live sending remains disabled."
    : status === "insufficient_evidence"
      ? "Simulation is healthy, but no destination readiness evidence was supplied."
      : "Activation preflight needs attention before any future live enablement review.";

  return {
    schemaVersion: 1,
    mode: "simulation_only",
    status,
    headline,
    authorizedToSend: false,
    transportEnabled: false,
    persistentFinalization: false,
    liveQueueObserved: false,
    simulation: {
      verified: simulationSafe,
      totalScenarios: input.simulation.totalScenarios,
      passedScenarios: input.simulation.passedScenarios,
      failedScenarios: input.simulation.failedScenarios,
      latestFinishedAt: input.simulation.history.latestFinishedAt,
      delivered: 0,
      finalizedPersistently: 0,
      transportBlocked: input.simulation.history.totals.transportBlocked,
      validationRejected: input.simulation.history.totals.validationRejected,
      preparationSkipped: input.simulation.history.totals.preparationSkipped,
    },
    readiness: {
      destinationsObserved: destinations.length,
      structurallyReady,
      structurallyBlocked,
      credentialReady,
      configurationReady,
    },
    destinations,
    blockers,
    notices: [
      "Simulation evidence is non-persistent and transport-disabled.",
      "Live delivery queue health is intentionally not inferred from simulation telemetry.",
      "A structurally ready destination still requires leased pre-send privacy validation before any future send.",
    ],
  };
}
