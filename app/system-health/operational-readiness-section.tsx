import { AlertTriangle, CheckCircle2, CircleOff, Settings2, ShieldCheck } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

type ReadinessStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "inactive"
  | "configuration_blocked"
  | string;

type ReadinessRow = {
  organization_id: string;
  readiness_key: string;
  readiness_name: string;
  readiness_group: string;
  health_status: ReadinessStatus;
  operational_status: string | null;
  active: boolean | null;
  issue_count: number | string | null;
  details: Record<string, unknown> | null;
  checked_at: string | null;
};

export default async function OperationalReadinessSection({
  organizationId,
}: {
  organizationId: string;
}) {
  /*
   * The parent System Health layout resolves and authorizes the active
   * owner/admin workspace before rendering this component. Because the admin
   * client bypasses RLS, the service-role read remains explicitly scoped to
   * that already-authorized organizationId.
   */
  const admin = createAdminClient() as any;
  const result = await admin
    .from("v_system_operational_readiness_v1")
    .select("*")
    .eq("organization_id", organizationId);

  if (result.error) {
    return (
      <section className="card mt-4 overflow-hidden">
        <SectionHeader />
        <div className="m-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Operational readiness could not be loaded.</div>
            <div className="mt-1 text-xs leading-5">{result.error.message}</div>
          </div>
        </div>
      </section>
    );
  }

  const rows = ((result.data ?? []) as ReadinessRow[]).sort((a, b) => {
    const rank = readinessRank(a.health_status) - readinessRank(b.health_status);
    if (rank !== 0) return rank;
    return a.readiness_name.localeCompare(b.readiness_name);
  });

  return (
    <section className="card mt-4 overflow-hidden">
      <SectionHeader />
      {rows.length ? (
        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <ReadinessCard key={row.readiness_key} row={row} />
          ))}
        </div>
      ) : (
        <div className="px-5 py-10 text-center text-sm text-slate-500">
          No operational-readiness rows are available for this workspace.
        </div>
      )}
    </section>
  );
}

function SectionHeader() {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="eyebrow">Operational readiness</div>
        <div className="section-title mt-1">Runtime & configuration state</div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
          Distinguishes active incidents from capabilities that are intentionally inactive or blocked on configuration/provider access.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <ShieldCheck size={16} />
        Tenant-scoped admin view
      </div>
    </div>
  );
}

function ReadinessCard({ row }: { row: ReadinessRow }) {
  const status = normalizeReadinessStatus(row.health_status);
  const appearance = statusAppearance(status);
  const issueCount = safeNumber(row.issue_count);

  return (
    <article className={`rounded-2xl border p-4 ${appearance.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${appearance.icon}`}>
            <StatusIcon status={status} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {row.readiness_name}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400">
              {pretty(row.readiness_group)}
            </div>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.08em] ${appearance.badge}`}>
          {pretty(status)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Metric label="State" value={pretty(row.operational_status || "unknown")} />
        <Metric label="Issues" value={issueCount.toLocaleString()} warn={issueCount > 0 && status !== "inactive"} />
      </div>

      <div className="mt-3 rounded-xl border border-slate-100 bg-white/70 px-3 py-2.5">
        <div className="text-[9px] font-semibold uppercase tracking-[.08em] text-slate-400">
          Mode
        </div>
        <div className="mt-1 text-xs font-semibold text-slate-700">
          {row.active ? "Active capability" : "Inactive / manual capability"}
        </div>
      </div>

      {readinessNote(row) ? (
        <div className="mt-3 text-xs leading-5 text-slate-500">{readinessNote(row)}</div>
      ) : null}

      <div className="mt-3 text-[10px] font-semibold text-slate-400">
        Checked {formatDateTime(row.checked_at)}
      </div>
    </article>
  );
}

function StatusIcon({ status }: { status: ReturnType<typeof normalizeReadinessStatus> }) {
  if (status === "inactive") return <CircleOff size={18} />;
  if (status === "configuration_blocked") return <Settings2 size={18} />;
  if (status === "healthy") return <CheckCircle2 size={18} />;
  return <AlertTriangle size={18} />;
}

function Metric({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${warn ? "border-amber-100 bg-amber-50/80" : "border-slate-100 bg-white/80"}`}>
      <div className="text-[9px] font-semibold uppercase tracking-[.08em] text-slate-400">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${warn ? "text-amber-700" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function normalizeReadinessStatus(value: string | null | undefined) {
  if (value === "critical") return "critical" as const;
  if (value === "warning") return "warning" as const;
  if (value === "inactive") return "inactive" as const;
  if (value === "configuration_blocked") return "configuration_blocked" as const;
  return "healthy" as const;
}

function readinessRank(value: string | null | undefined) {
  const status = normalizeReadinessStatus(value);
  if (status === "critical") return 0;
  if (status === "configuration_blocked") return 1;
  if (status === "warning") return 2;
  if (status === "inactive") return 3;
  return 4;
}

function statusAppearance(status: ReturnType<typeof normalizeReadinessStatus>) {
  if (status === "critical") {
    return {
      card: "border-rose-200 bg-rose-50/30",
      icon: "bg-rose-100 text-rose-700",
      badge: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (status === "configuration_blocked") {
    return {
      card: "border-orange-200 bg-orange-50/30",
      icon: "bg-orange-100 text-orange-700",
      badge: "border-orange-200 bg-orange-50 text-orange-700",
    };
  }
  if (status === "warning") {
    return {
      card: "border-amber-200 bg-amber-50/25",
      icon: "bg-amber-100 text-amber-700",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  if (status === "inactive") {
    return {
      card: "border-slate-200 bg-slate-50/50",
      icon: "bg-slate-100 text-slate-500",
      badge: "border-slate-200 bg-slate-50 text-slate-500",
    };
  }
  return {
    card: "border-slate-200 bg-white",
    icon: "bg-emerald-50 text-emerald-700",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

function readinessNote(row: ReadinessRow) {
  const details = row.details ?? {};
  const blocker = typeof details.blocker_message === "string" ? details.blocker_message : null;
  if (blocker) return blocker;

  if (row.readiness_key === "search_indexing" && row.health_status === "inactive") {
    return `Indexing is disabled. ${safeNumber(details.pending).toLocaleString()} queued item(s) are informational until indexing is enabled.`;
  }
  if (row.readiness_key === "automation_runtime" && row.health_status === "inactive") {
    return "No active runtime workflows are configured, so the disabled scheduler is not an incident.";
  }
  if (row.readiness_key === "instagram_automation" && row.health_status === "inactive") {
    return "No active Instagram automation rules are configured.";
  }
  if (row.readiness_key === "conversion_feedback" && row.health_status === "inactive") {
    return "No active conversion-feedback routes are configured.";
  }
  if (row.readiness_key === "course_catalog_sync" && row.operational_status === "manual_success") {
    return "The latest manual course-catalog sync completed successfully; no scheduled freshness SLA is configured.";
  }
  if (row.readiness_key === "meta_ads_readiness") {
    const message = details.blocker_message;
    return typeof message === "string" ? message : null;
  }
  return null;
}

function safeNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function pretty(value: string) {
  return value.replaceAll(":", ": ").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
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
