import {
  AlertTriangle,
  CheckCircle2,
  Database,
  ShieldCheck,
} from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/ui";
import { isMockMode } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContextForUser } from "@/lib/workspace";
import OperationalReadinessSection from "./operational-readiness-section";
import "./system-health-mobile.css";

type IntegrityStatus = "healthy" | "warning" | "unknown";

type SystemIntegrityRow = {
  integrity_key: string;
  integrity_name: string;
  integrity_group: string;
  source_status: string | null;
  health_status: string | null;
  issue_count: number | string | null;
  details: Record<string, unknown> | null;
  checked_at: string | null;
};

type IntegrityLoadResult = {
  rows: SystemIntegrityRow[];
  error: string | null;
};

type BaseOperationalEvidence = {
  available: boolean;
  error: string | null;
  unknownStatuses: string[];
  monitoredSystems: number;
};

const BASE_HEALTH_STATUSES = new Set(["healthy", "warning", "critical"]);

export default async function SystemHealthLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (isMockMode()) {
    return <>{children}</>;
  }

  const organizationId = await requireIntegrityAdminAccess();
  const [baseEvidence, integrity] = await Promise.all([
    loadBaseOperationalEvidence(organizationId),
    loadIntegrityHealth(organizationId),
  ]);

  return (
    <>
      {baseEvidence.available ? (
        children
      ) : (
        <OperationalEvidenceUnavailable evidence={baseEvidence} />
      )}
      <div className="system-health-polish mt-4">
        <DataIntegritySection rows={integrity.rows} error={integrity.error} />
        <OperationalReadinessSection organizationId={organizationId} />
      </div>
    </>
  );
}

async function requireIntegrityAdminAccess(): Promise<string> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    redirect("/login");
  }

  const workspace = await getWorkspaceContextForUser(supabase, user.id);

  if (workspace.memberships.length === 0) {
    throw new Error(
      "Unable to resolve current organization: no active organization membership found.",
    );
  }

  if (!workspace.activeWorkspace) {
    redirect("/workspace");
  }

  if (
    workspace.activeWorkspace.role !== "owner" &&
    workspace.activeWorkspace.role !== "admin"
  ) {
    redirect("/dashboard");
  }

  return workspace.activeWorkspace.organizationId;
}

async function loadBaseOperationalEvidence(
  organizationId: string,
): Promise<BaseOperationalEvidence> {
  /*
   * This is a fail-closed presentation gate for the mature base System Health
   * page. The page still owns the detailed monitoring queries. The layout
   * independently verifies that the canonical health rows are readable and use
   * only the status vocabulary the page knows how to render before allowing a
   * green/amber/red overview to appear.
   *
   * Because service_role bypasses RLS, the read is explicitly tenant-scoped.
   */
  const admin = createAdminClient() as any;
  const result = await admin
    .from("v_system_health")
    .select("health_status")
    .eq("organization_id", organizationId);

  if (result.error) {
    return {
      available: false,
      error: `Operational health evidence could not be verified: ${result.error.message}`,
      unknownStatuses: [],
      monitoredSystems: 0,
    };
  }

  const rows = (result.data ?? []) as Array<{ health_status: string | null }>;
  const unknownStatuses = Array.from(
    new Set(
      rows
        .map((row) => String(row.health_status ?? "").trim().toLowerCase())
        .filter((status) => !BASE_HEALTH_STATUSES.has(status)),
    ),
  ).sort();

  if (rows.length === 0) {
    return {
      available: false,
      error:
        "No canonical operational-health rows are available. The workspace will not infer zero incidents or a healthy state from missing evidence.",
      unknownStatuses,
      monitoredSystems: 0,
    };
  }

  if (unknownStatuses.length > 0) {
    return {
      available: false,
      error:
        "One or more operational-health states are not recognized by the current System Health contract. Verify the source view before treating the workspace as healthy.",
      unknownStatuses,
      monitoredSystems: rows.length,
    };
  }

  return {
    available: true,
    error: null,
    unknownStatuses: [],
    monitoredSystems: rows.length,
  };
}

async function loadIntegrityHealth(
  organizationId: string,
): Promise<IntegrityLoadResult> {
  /*
   * Service-role access is created only after the signed-in user has passed
   * the same active-profile + owner/admin + active-workspace guard used by
   * the System Health page. Because service_role bypasses RLS, this read is
   * always explicitly constrained to the resolved organizationId.
   */
  const supabase = createAdminClient() as any;

  const result = await supabase
    .from("v_system_integrity_health_v1")
    .select("*")
    .eq("organization_id", organizationId);

  if (result.error) {
    return {
      rows: [],
      error: `Data integrity: ${result.error.message}`,
    };
  }

  const rows = ((result.data ?? []) as SystemIntegrityRow[]).sort((a, b) => {
    const rankDifference =
      integrityRank(a.health_status) - integrityRank(b.health_status);

    if (rankDifference !== 0) return rankDifference;
    return a.integrity_name.localeCompare(b.integrity_name);
  });

  return { rows, error: null };
}

function OperationalEvidenceUnavailable({
  evidence,
}: {
  evidence: BaseOperationalEvidence;
}) {
  return (
    <div className="system-health-polish">
      <PageHeader
        eyebrow="Operations monitoring"
        title="System health"
        description="Operational health evidence is unavailable or outside the current status contract. SalsysOS will not convert missing or unrecognized monitoring evidence into a healthy state."
      />

      <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <AlertTriangle size={18} />
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Operational health evidence needs verification
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {evidence.error ||
                "The canonical operational-health evidence could not be verified."}
            </p>
            <div className="mt-3 text-xs font-semibold text-slate-500">
              Monitored rows: {evidence.monitoredSystems || "—"}
            </div>
            {evidence.unknownStatuses.length > 0 ? (
              <div className="mt-1 text-xs text-amber-800">
                Unrecognized state(s): {evidence.unknownStatuses.join(", ")}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function DataIntegritySection({
  rows,
  error,
}: {
  rows: SystemIntegrityRow[];
  error: string | null;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="eyebrow">Data integrity</div>
          <div className="section-title mt-1">Core integrity checks</div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Snapshot checks for CRM Core and Customer 360. These are kept
            separate from sync activity so retained identity history is not
            mislabelled as a runtime failure.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <ShieldCheck size={16} />
          Tenant-scoped admin view
        </div>
      </div>

      {error ? (
        <div className="m-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Data integrity could not be loaded.</div>
            <div className="mt-1 text-xs leading-5">{error}</div>
          </div>
        </div>
      ) : rows.length ? (
        <div className="grid gap-4 p-4 md:grid-cols-2">
          {rows.map((row) => (
            <IntegrityCard key={row.integrity_key} row={row} />
          ))}
        </div>
      ) : (
        <div className="px-5 py-10 text-center">
          <Database size={24} className="mx-auto text-slate-300" />
          <div className="mt-2 text-sm font-semibold text-slate-700">
            No integrity-health rows available
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Missing integrity evidence is not treated as healthy. Verify the
            normalized integrity-health view in Supabase.
          </div>
        </div>
      )}
    </section>
  );
}

function IntegrityCard({ row }: { row: SystemIntegrityRow }) {
  const status = normalizeIntegrityStatus(row.health_status);
  const details = row.details ?? {};
  const issueCount = safeNumber(row.issue_count);
  const warning = status === "warning";
  const unknown = status === "unknown";

  return (
    <article
      className={`rounded-2xl border p-4 ${
        warning
          ? "border-amber-200 bg-amber-50/25"
          : unknown
            ? "border-slate-300 bg-slate-50/60"
            : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              warning
                ? "bg-amber-100 text-amber-700"
                : unknown
                  ? "bg-slate-200 text-slate-700"
                  : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {status === "healthy" ? (
              <CheckCircle2 size={18} />
            ) : (
              <AlertTriangle size={18} />
            )}
          </span>

          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {row.integrity_name}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400">
              {pretty(row.integrity_group)}
            </div>
          </div>
        </div>

        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.08em] ${
            warning
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : unknown
                ? "border-slate-300 bg-slate-100 text-slate-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <IntegrityMetric
          label="Actionable issues"
          value={issueCount.toLocaleString()}
          warn={issueCount > 0}
        />
        <IntegrityMetric
          label="Source status"
          value={pretty(row.source_status || "unknown")}
        />
      </div>

      {unknown ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
          Integrity status is not recognized by the current System Health
          contract. Verify the source view before treating this check as healthy.
        </div>
      ) : null}

      {row.integrity_key === "crm_core" ? (
        <div className="mt-4 grid gap-2 border-t border-slate-200/70 pt-3 sm:grid-cols-2">
          <IntegrityDetail
            label="Stage / status mismatches"
            value={detailNumber(details, "stage_status_mismatch")}
          />
          <IntegrityDetail
            label="Stage history mismatches"
            value={detailNumber(details, "stage_history_mismatch")}
          />
          <IntegrityDetail
            label="Invalid lead owners"
            value={detailNumber(details, "invalid_lead_owner")}
          />
          <IntegrityDetail
            label="Message lineage mismatches"
            value={detailNumber(details, "message_lineage_mismatch")}
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-2 border-t border-slate-200/70 pt-3 sm:grid-cols-2">
          <IntegrityDetail
            label="Open identity conflicts"
            value={detailNumber(details, "open_identity_conflicts")}
            warn={detailNumber(details, "open_identity_conflicts") > 0}
          />
          <IntegrityDetail
            label="Actionable orphan persons"
            value={detailNumber(details, "actionable_orphan_persons")}
          />
          <IntegrityDetail
            label="Missing journey coverage"
            value={detailNumber(
              details,
              "actionable_persons_missing_complete_journey",
            )}
          />
          <IntegrityDetail
            label="Retained identities"
            value={detailNumber(details, "retained_deleted_lead_persons")}
            note="informational"
          />
        </div>
      )}

      <div className="mt-3 text-[10px] font-semibold text-slate-400">
        Checked {formatDateTime(row.checked_at)}
      </div>
    </article>
  );
}

function IntegrityMetric({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        warn
          ? "border-amber-100 bg-amber-50/80"
          : "border-slate-100 bg-white/80"
      }`}
    >
      <div className="text-[9px] font-semibold uppercase tracking-[.08em] text-slate-400">
        {label}
      </div>
      <div
        className={`mt-1 text-base font-semibold ${
          warn ? "text-amber-700" : "text-slate-800"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function IntegrityDetail({
  label,
  value,
  warn = false,
  note,
}: {
  label: string;
  value: number;
  warn?: boolean;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white/80 px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[.08em] text-slate-400">
        {label}
      </div>
      <div
        className={`mt-1 text-sm font-semibold ${
          warn ? "text-amber-700" : "text-slate-800"
        }`}
      >
        {value.toLocaleString()}
      </div>
      {note ? <div className="mt-0.5 text-[10px] text-slate-400">{note}</div> : null}
    </div>
  );
}

function normalizeIntegrityStatus(
  value: string | null | undefined,
): IntegrityStatus {
  if (value === "healthy") return "healthy";
  if (value === "warning") return "warning";
  return "unknown";
}

function integrityRank(value: string | null | undefined) {
  const status = normalizeIntegrityStatus(value);
  if (status === "warning") return 0;
  if (status === "unknown") return 1;
  return 2;
}

function detailNumber(details: Record<string, unknown>, key: string) {
  return safeNumber(details[key]);
}

function safeNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function pretty(value: string) {
  return value
    .replaceAll(":", ": ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}
