import "server-only";

import {
  runAdActivationWorkerSimulation,
  type AdActivationWorkerSimulationDependencies,
  type AdActivationWorkerSimulationReport,
} from "@/lib/ad-activation/worker-simulation";
import { assertAdActivationTransportDisabled } from "@/lib/ad-activation/transport-policy";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DEFAULT_LEASE_SECONDS = 120;
const MIN_LEASE_SECONDS = 30;
const MAX_LEASE_SECONDS = 300;

export type AdActivationSimulationConfigInput = {
  limit?: number | string | null;
  leaseSeconds?: number | string | null;
  label?: string | null;
};

export type AdActivationSimulationConfig = {
  limit: number;
  leaseSeconds: number;
  label: string;
  liveBindings: "absent";
};

export type AdActivationSimulationTelemetry = {
  schemaVersion: 1;
  mode: "simulation";
  transportEnabled: false;
  persistentFinalization: false;
  liveBindings: "absent";
  runId: string;
  label: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  config: {
    limit: number;
    leaseSeconds: number;
  };
  counts: {
    claimed: number;
    processed: number;
    delivered: 0;
    finalizedPersistently: 0;
    validationRejected: number;
    preparationSkipped: number;
    transportBlocked: number;
    transportNonDelivery: number;
  };
  wouldFinalize: {
    retry: number;
    skipped: number;
    failed: number;
  };
};

export type AdActivationSimulationTelemetrySink = (
  event: AdActivationSimulationTelemetry,
) => void | Promise<void>;

export type AdActivationSimulationRunResult = {
  report: AdActivationWorkerSimulationReport;
  telemetry: AdActivationSimulationTelemetry;
};

function boundedInteger(
  value: number | string | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizeLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "manual-simulation")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || "manual-simulation";
}

export function resolveAdActivationSimulationConfig(
  input: AdActivationSimulationConfigInput = {},
): AdActivationSimulationConfig {
  return {
    limit: boundedInteger(input.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
    leaseSeconds: boundedInteger(
      input.leaseSeconds,
      DEFAULT_LEASE_SECONDS,
      MIN_LEASE_SECONDS,
      MAX_LEASE_SECONDS,
    ),
    label: normalizeLabel(input.label),
    liveBindings: "absent",
  };
}

function summarizeSimulationTelemetry(input: {
  runId: string;
  config: AdActivationSimulationConfig;
  report: AdActivationWorkerSimulationReport;
  startedAt: Date;
  finishedAt: Date;
}): AdActivationSimulationTelemetry {
  const stages = {
    validationRejected: 0,
    preparationSkipped: 0,
    transportBlocked: 0,
    transportNonDelivery: 0,
  };
  const wouldFinalize = {
    retry: 0,
    skipped: 0,
    failed: 0,
  };

  for (const item of input.report.items) {
    if (item.stage === "validation_rejected") stages.validationRejected += 1;
    if (item.stage === "preparation_skipped") stages.preparationSkipped += 1;
    if (item.stage === "transport_blocked") stages.transportBlocked += 1;
    if (item.stage === "transport_non_delivery") stages.transportNonDelivery += 1;
    wouldFinalize[item.wouldFinalize.outcome] += 1;
  }

  return {
    schemaVersion: 1,
    mode: "simulation",
    transportEnabled: false,
    persistentFinalization: false,
    liveBindings: "absent",
    runId: input.runId,
    label: input.config.label,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    durationMs: Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime()),
    config: {
      limit: input.config.limit,
      leaseSeconds: input.config.leaseSeconds,
    },
    counts: {
      claimed: input.report.claimed,
      processed: input.report.processed,
      delivered: 0,
      finalizedPersistently: 0,
      ...stages,
    },
    wouldFinalize,
  };
}

/**
 * Configured Phase 7C simulation runner.
 *
 * All data/lease dependencies must be explicitly injected by the caller. This
 * module intentionally has no production queue, database, credential, scheduler, or
 * provider binding. The optional telemetry sink receives only aggregate run
 * metadata and never raw identifiers or provider credentials.
 */
export async function runConfiguredAdActivationSimulation(input: {
  dependencies: AdActivationWorkerSimulationDependencies;
  config?: AdActivationSimulationConfigInput;
  telemetrySink?: AdActivationSimulationTelemetrySink;
  now?: () => Date;
  createRunId?: () => string;
}): Promise<AdActivationSimulationRunResult> {
  assertAdActivationTransportDisabled();

  const config = resolveAdActivationSimulationConfig(input.config);
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const runId = input.createRunId?.() ?? `sim-${startedAt.getTime().toString(36)}`;

  const report = await runAdActivationWorkerSimulation({
    dependencies: input.dependencies,
    limit: config.limit,
    leaseSeconds: config.leaseSeconds,
  });

  const finishedAt = now();
  const telemetry = summarizeSimulationTelemetry({
    runId,
    config,
    report,
    startedAt,
    finishedAt,
  });

  if (input.telemetrySink) {
    await input.telemetrySink(telemetry);
  }

  return { report, telemetry };
}
