import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  FlaskConical,
  LockKeyhole,
  RadioTower,
  ShieldCheck,
} from "lucide-react";

import {
  projectAdActivationObservabilityReadiness,
  type AdActivationObservabilityProjection,
} from "@/lib/ad-activation/observability-readiness";
import {
  assessAdActivationExecutionReadiness,
  type AdActivationExecutionReadiness,
} from "@/lib/ad-activation/execution-readiness";
import { executeAdActivationSimulationScenarios } from "@/lib/ad-activation/simulation-scenario-executor";
import { createAdminClient } from "@/lib/supabase/admin";

type DestinationRow = {
  id: string;
  external_audience_name: string | null;
  destination_kind: string;
  status: string;
};

type ActivationView = {
  projection: AdActivationObservabilityProjection;
  destinationNames: Map<string, string>;
  loadError: string | null;
};

export default async function AdActivationReadinessSection({
  organizationId,
}: {
  organizationId: string;
}) {
  const view = await loadActivationReadiness(organizationId);
  const { projection } = view;
  const appearance = statusAppearance(projection.status);

  return (
    <section className="card mt-4 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="eyebrow">Ad activation readiness</div>
          <div className="section-title mt-1">Meta + Google audience activation</div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Simulation and configuration preflight only. This view cannot send audiences,
            claim live delivery work, or authorize provider transport.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.08em] text-violet-700">
            <FlaskConical size={13} />
            Simulation only
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.08em] text-slate-600">
            <LockKeyhole size={13} />
            Sending disabled
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className={`rounded-2xl border p-4 ${appearance.card}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${appearance.icon}`}>
                <ActivationStatusIcon status={projection.status} />
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">{projection.headline}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  {projection.status === "simulation_verified"
                    ? "Deterministic scenarios and supplied destination preflight are healthy. Live delivery is still intentionally disabled."
                    : projection.status === "insufficient_evidence"
                      ? "Simulation is healthy, but no destination readiness evidence is currently available."
                      : "One or more simulation or destination preflight checks need review."}
                </div>
              </div>
            </div>
            <span className={`inline-flex w-fit shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.08em] ${appearance.badge}`}>
              {pretty(projection.status)}
            </span>
          </div>

          {view.loadError ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Destination readiness not loaded.</span>{" "}
                {view.loadError}
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ActivationMetric
              label="Simulation scenarios"
              value={`${projection.simulation.passedScenarios}/${projection.simulation.totalScenarios}`}
              note="deterministic pass rate"
              good={projection.simulation.verified}
            />
            <ActivationMetric
              label="Destinations"
              value={projection.readiness.destinationsObserved.toLocaleString()}
              note={`${projection.readiness.structurallyReady} structurally ready`}
            />
            <ActivationMetric
              label="Provider transport"
              value="Disabled"
              note="hard safety boundary"
              good
            />
            <ActivationMetric
              label="Live queue"
              value="Not observed"
              note="simulation is not live health"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Destination preflight</div>
                <div className="mt-1 text-xs text-slate-400">Add/remove readiness by configured audience destination.</div>
              </div>
              <RadioTower size={18} className="text-violet-500" />
            </div>

            {projection.destinations.length ? (
              <div className="mt-4 grid gap-2">
                {projection.destinations.map((destination) => (
                  <div
                    key={`${destination.destinationId}:${destination.action}`}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">
                          {view.destinationNames.get(destination.destinationId) || shortId(destination.destinationId)}
                        </div>
                        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400">
                          {pretty(destination.provider)} · {pretty(destination.action)}
                        </div>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[.08em] ${
                        destination.structuralReady
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}>
                        {destination.structuralReady ? "structurally ready" : "blocked"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold text-slate-500">
                      <SmallState label="Config" ready={destination.configurationReady} />
                      <SmallState label="Credential" ready={destination.credentialReady} />
                      <SmallState label="Authorized" ready={false} disabledLabel="No" />
                    </div>
                    {destination.blockers.length ? (
                      <div className="mt-2 text-[10px] leading-4 text-slate-400">
                        {destination.blockers.slice(0, 4).map(pretty).join(" · ")}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
                <CircleOff size={20} className="mx-auto text-slate-300" />
                <div className="mt-2 text-xs font-semibold text-slate-600">No destination readiness evidence</div>
                <div className="mt-1 text-[11px] leading-5 text-slate-400">
                  This is expected until Phase 7 activation tables/configuration are available for this workspace.
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Safety state</div>
                <div className="mt-1 text-xs text-slate-400">Controls that must remain true in Phase 7C.</div>
              </div>
              <ShieldCheck size={18} className="text-emerald-600" />
            </div>
            <div className="mt-4 grid gap-2">
              <SafetyRow label="Provider transport" value="Disabled" />
              <SafetyRow label="Authorized to send" value="No" />
              <SafetyRow label="Persistent finalization" value="Disabled" />
              <SafetyRow label="Live queue observed" value="No" />
              <SafetyRow label="Delivered in simulation" value="0" />
            </div>
            <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-3 text-[11px] leading-5 text-violet-800">
              Structural readiness is not send authorization. A future live phase still requires leased pre-send privacy/membership validation immediately before any provider call.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

async function loadActivationReadiness(organizationId: string): Promise<ActivationView> {
  const simulation = await executeAdActivationSimulationScenarios();
  const admin = createAdminClient() as any;
  const destinationResult = await admin
    .from("ad_audience_destinations")
    .select("id,external_audience_name,destination_kind,status")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(20);

  let loadError: string | null = null;
  const rows = destinationResult.error
    ? []
    : ((destinationResult.data ?? []) as DestinationRow[]);

  if (destinationResult.error) {
    loadError = destinationResult.error.message;
  }

  const readiness: AdActivationExecutionReadiness[] = [];
  if (!loadError) {
    for (const destination of rows) {
      for (const action of ["add", "remove"] as const) {
        try {
          readiness.push(
            await assessAdActivationExecutionReadiness({
              organizationId,
              destinationId: destination.id,
              action,
            }),
          );
        } catch (error) {
          loadError = error instanceof Error ? error.message : String(error);
          break;
        }
      }
      if (loadError) break;
    }
  }

  return {
    projection: projectAdActivationObservabilityReadiness({
      executionReadiness: loadError ? [] : readiness,
      simulation,
    }),
    destinationNames: new Map(
      rows.map((row) => [
        row.id,
        row.external_audience_name?.trim() || pretty(row.destination_kind),
      ]),
    ),
    loadError,
  };
}

function ActivationStatusIcon({
  status,
}: {
  status: AdActivationObservabilityProjection["status"];
}) {
  if (status === "simulation_verified") return <CheckCircle2 size={18} />;
  if (status === "insufficient_evidence") return <CircleOff size={18} />;
  return <AlertTriangle size={18} />;
}

function ActivationMetric({
  label,
  value,
  note,
  good = false,
}: {
  label: string;
  value: string;
  note: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white/85 px-3 py-3">
      <div className="text-[9px] font-semibold uppercase tracking-[.08em] text-slate-400">{label}</div>
      <div className={`mt-1 text-base font-semibold ${good ? "text-emerald-700" : "text-slate-800"}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-slate-400">{note}</div>
    </div>
  );
}

function SmallState({
  label,
  ready,
  disabledLabel = "Missing",
}: {
  label: string;
  ready: boolean;
  disabledLabel?: string;
}) {
  return (
    <span className={`rounded-full border px-2 py-1 ${
      ready
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-white text-slate-500"
    }`}>
      {label}: {ready ? "Ready" : disabledLabel}
    </span>
  );
}

function SafetyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <span className="text-xs font-semibold text-emerald-700">{value}</span>
    </div>
  );
}

function statusAppearance(status: AdActivationObservabilityProjection["status"]) {
  if (status === "simulation_verified") {
    return {
      card: "border-violet-200 bg-violet-50/35",
      icon: "bg-violet-100 text-violet-700",
      badge: "border-violet-200 bg-violet-50 text-violet-700",
    };
  }
  if (status === "insufficient_evidence") {
    return {
      card: "border-slate-200 bg-slate-50/60",
      icon: "bg-slate-100 text-slate-500",
      badge: "border-slate-200 bg-white text-slate-500",
    };
  }
  return {
    card: "border-amber-200 bg-amber-50/30",
    icon: "bg-amber-100 text-amber-700",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
  };
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function pretty(value: string) {
  return value
    .replaceAll(":", ": ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
