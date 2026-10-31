import "server-only";

import {
  AD_ACTIVATION_SIMULATION_FIXTURES,
  createAdActivationSimulationFixtureDependencies,
  type AdActivationSimulationFixtureName,
} from "@/lib/ad-activation/simulation-fixtures";
import {
  projectAdActivationSimulationRunHistory,
  type AdActivationSimulationRunHistoryProjection,
} from "@/lib/ad-activation/simulation-run-history";
import {
  runConfiguredAdActivationSimulation,
  type AdActivationSimulationTelemetry,
} from "@/lib/ad-activation/simulation-runner";
import type { AdActivationWorkerSimulationItem } from "@/lib/ad-activation/worker-simulation";

export type AdActivationScenarioExpectation = {
  stage:
    | "validation_rejected"
    | "preparation_skipped"
    | "transport_blocked"
    | "transport_non_delivery";
  wouldFinalize: "retry" | "skipped" | "failed";
  reason: string;
};

export type AdActivationScenarioComparison = {
  fixture: AdActivationSimulationFixtureName;
  passed: boolean;
  expected: AdActivationScenarioExpectation;
  actual: AdActivationScenarioExpectation | null;
  invariants: {
    claimedOne: boolean;
    processedOne: boolean;
    deliveredZero: boolean;
    finalizedPersistentlyZero: boolean;
    transportDisabled: boolean;
    persistentFinalizationDisabled: boolean;
    liveBindingsAbsent: boolean;
  };
};

export type AdActivationScenarioComparisonReport = {
  schemaVersion: 1;
  mode: "deterministic_simulation_comparison";
  transportEnabled: false;
  persistentFinalization: false;
  liveBindings: "absent";
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  allPassed: boolean;
  scenarios: AdActivationScenarioComparison[];
  history: AdActivationSimulationRunHistoryProjection;
};

const EXPECTATIONS: Readonly<
  Record<AdActivationSimulationFixtureName, AdActivationScenarioExpectation>
> = Object.freeze({
  meta_add_ready: {
    stage: "transport_blocked",
    wouldFinalize: "skipped",
    reason: "provider_transport_disabled",
  },
  google_remove_ready: {
    stage: "transport_blocked",
    wouldFinalize: "skipped",
    reason: "provider_transport_disabled",
  },
  privacy_rejected: {
    stage: "validation_rejected",
    wouldFinalize: "skipped",
    reason: "advertising_not_granted",
  },
  preparation_skipped: {
    stage: "preparation_skipped",
    wouldFinalize: "skipped",
    reason: "no_exportable_identifiers",
  },
});

const FIXTURE_ORDER: readonly AdActivationSimulationFixtureName[] = [
  "meta_add_ready",
  "google_remove_ready",
  "privacy_rejected",
  "preparation_skipped",
];

function actualOutcome(
  item: AdActivationWorkerSimulationItem | undefined,
): AdActivationScenarioExpectation | null {
  if (!item) return null;
  return {
    stage: item.stage,
    wouldFinalize: item.wouldFinalize.outcome,
    reason: item.wouldFinalize.reason,
  };
}

function sameOutcome(
  expected: AdActivationScenarioExpectation,
  actual: AdActivationScenarioExpectation | null,
): boolean {
  return Boolean(
    actual &&
      actual.stage === expected.stage &&
      actual.wouldFinalize === expected.wouldFinalize &&
      actual.reason === expected.reason,
  );
}

/**
 * Runs the deterministic synthetic fixtures through the configured simulation
 * orchestration and compares actual worker outcomes with declared expectations.
 * No live queue/database/provider dependency is reachable from these fixtures.
 */
export async function executeAdActivationSimulationScenarios(): Promise<AdActivationScenarioComparisonReport> {
  const comparisons: AdActivationScenarioComparison[] = [];
  const telemetryEvents: AdActivationSimulationTelemetry[] = [];

  for (const [index, fixture] of FIXTURE_ORDER.entries()) {
    // Assert the fixture remains declared before execution; this also makes a
    // missing fixture fail loudly instead of silently disappearing from a run.
    if (!AD_ACTIVATION_SIMULATION_FIXTURES[fixture]) {
      throw new Error(`Missing deterministic activation fixture: ${fixture}`);
    }

    const timestamp = new Date(Date.UTC(2026, 9, 31, 4, 30, index));
    const run = await runConfiguredAdActivationSimulation({
      dependencies: createAdActivationSimulationFixtureDependencies([fixture]),
      config: {
        limit: 1,
        leaseSeconds: 120,
        label: `fixture:${fixture}`,
      },
      now: () => timestamp,
      createRunId: () => `fixture-run-${fixture}`,
    });

    telemetryEvents.push(run.telemetry);

    const expected = EXPECTATIONS[fixture];
    const actual = actualOutcome(run.report.items[0]);
    const invariants = {
      claimedOne: run.report.claimed === 1,
      processedOne: run.report.processed === 1,
      deliveredZero: run.report.delivered === 0,
      finalizedPersistentlyZero: run.report.finalizedPersistently === 0,
      transportDisabled: run.telemetry.transportEnabled === false,
      persistentFinalizationDisabled:
        run.telemetry.persistentFinalization === false,
      liveBindingsAbsent: run.telemetry.liveBindings === "absent",
    };

    comparisons.push({
      fixture,
      expected,
      actual,
      invariants,
      passed:
        sameOutcome(expected, actual) &&
        Object.values(invariants).every(Boolean),
    });
  }

  const passedScenarios = comparisons.filter((item) => item.passed).length;

  return {
    schemaVersion: 1,
    mode: "deterministic_simulation_comparison",
    transportEnabled: false,
    persistentFinalization: false,
    liveBindings: "absent",
    totalScenarios: comparisons.length,
    passedScenarios,
    failedScenarios: comparisons.length - passedScenarios,
    allPassed: passedScenarios === comparisons.length,
    scenarios: comparisons,
    history: projectAdActivationSimulationRunHistory(telemetryEvents, 20),
  };
}
