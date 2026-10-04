import Link from "next/link";

import { redirect } from "next/navigation";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Database,
  Megaphone,
  MessageCircle,
  RefreshCw,
  Settings,
  Webhook,
} from "lucide-react";

import type { ReactNode } from "react";

import { PageHeader, StatCard } from "@/components/ui";

import { isMockMode } from "@/lib/data";

import { createAdminClient } from "@/lib/supabase/admin";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/* =========================================================

   SYSTEM HEALTH

\========================================================= */

type HealthStatus = "healthy" | "warning" | "critical" | string;

type SystemHealthRow = {
  system_key: string;

  system_name: string;

  system_group: string;

  health_status: HealthStatus;

  latest_status: string | null;

  latest_activity_at: string | null;

  last_success_at: string | null;

  last_failure_at: string | null;

  activity_24h: number | string | null;

  failures_24h: number | string | null;

  pending_count: number | string | null;

  oldest_pending_at: string | null;

  oldest_pending_minutes: number | string | null;

  latest_error: string | null;

  stale_after_minutes: number | string | null;
};

type SystemHealthSummary = {
  total_systems: number | string | null;

  healthy_systems: number | string | null;

  warning_systems: number | string | null;

  critical_systems: number | string | null;

  latest_system_activity_at: string | null;

  checked_at: string | null;
};

type SystemActivityRow = {
  system_key: string;

  system_name: string;

  activity_count: number | string | null;

  successful_count: number | string | null;

  failure_count: number | string | null;

  pending_count: number | string | null;

  latest_activity_at: string | null;
};

type SystemFailureRow = {
  system_key: string;

  system_name: string;

  source_id: string;

  occurred_at: string | null;

  status: string | null;

  error_message: string | null;

  event_type: string | null;
};

type LoadResult = {
  health: SystemHealthRow[];

  summary: SystemHealthSummary | null;

  activity: SystemActivityRow[];

  failures: SystemFailureRow[];

  errors: string[];
};

export default async function SystemHealthPage() {
  if (isMockMode()) {
    return <MockSystemHealth />;
  }

  const organizationId =
  await requireAdminAccess();

const { health, summary, activity, failures, errors } =
  await loadSystemHealth(
    organizationId
  );

  const derivedSummary = summary ?? deriveSummary(health);

  const activityBySystem = new Map(
    activity.map((row) => [row.system_key, row]),
  );

  const orderedHealth = [...health].sort((a, b) => {
    const difference =
      healthRank(a.health_status) - healthRank(b.health_status);

    if (difference !== 0) return difference;

    return a.system_name.localeCompare(b.system_name);
  });

  const hasIncident = safeNumber(derivedSummary.critical_systems) > 0;

  const hasWarning = safeNumber(derivedSummary.warning_systems) > 0;

  return (
    <div className="system-health-polish">
      <PageHeader
        eyebrow="Operations monitoring"
        title="System health"
        description="Monitor CRM integrations, scheduled syncs, webhook processing, and operational failures from one admin-only view."
        actions={
          <>
            <Link className="btn-secondary" href="/settings">
              <Settings size={15} />
              Settings
            </Link>

            <a className="btn-primary" href="/system-health">
              <RefreshCw size={15} />
              Refresh
            </a>
          </>
        }
      />

      {errors.length > 0 ? (
        <div className="system-health-load-warning mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />

          <div>
            <div className="font-semibold">
              Some monitoring data could not be loaded.
            </div>

            <div className="mt-1 text-xs leading-5">{errors.join(" · ")}</div>
          </div>
        </div>
      ) : null}

      <section
        className={`system-health-overview mb-4 overflow-hidden rounded-2xl border shadow-sm ${
          hasIncident
            ? "border-rose-200 bg-rose-50/40"
            : hasWarning
              ? "border-amber-200 bg-amber-50/40"
              : "border-emerald-200 bg-emerald-50/40"
        }`}
      >
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                hasIncident
                  ? "bg-rose-100 text-rose-700"
                  : hasWarning
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {hasIncident ? (
                <AlertTriangle size={18} />
              ) : (
                <CheckCircle2 size={18} />
              )}
            </span>

            <div>
              <div className="text-sm font-semibold text-slate-900">
                {hasIncident
                  ? "Operational attention required"
                  : hasWarning
                    ? "Systems running with warnings"
                    : "All monitored systems healthy"}
              </div>

              <div className="mt-1 text-xs leading-5 text-slate-500">
                {safeNumber(derivedSummary.critical_systems)} critical ·{" "}
                {safeNumber(derivedSummary.warning_systems)} warning ·{" "}
                {safeNumber(derivedSummary.healthy_systems)} healthy
              </div>
            </div>
          </div>

          <div className="text-xs font-semibold text-slate-500">
            Checked {formatDateTime(derivedSummary.checked_at)}
          </div>
        </div>
      </section>

      <div className="system-health-stat-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Monitored systems"
          value={safeNumber(derivedSummary.total_systems).toLocaleString()}
          note="operational integrations"
          icon={<Database size={19} />}
        />

        <StatCard
          label="Healthy"
          value={safeNumber(derivedSummary.healthy_systems).toLocaleString()}
          note="working within expected thresholds"
          icon={<CheckCircle2 size={19} />}
        />

        <StatCard
          label="Warnings"
          value={safeNumber(derivedSummary.warning_systems).toLocaleString()}
          note="needs review, not currently critical"
          icon={<Clock3 size={19} />}
        />

        <StatCard
          label="Critical"
          value={safeNumber(derivedSummary.critical_systems).toLocaleString()}
          note="stuck or latest run failed"
          icon={<AlertTriangle size={19} />}
        />
      </div>

      <section className="system-health-systems-card card mt-4 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="eyebrow">Live operational state</div>

            <div className="section-title mt-1">Monitored systems</div>

            <p className="mt-1 text-xs leading-5 text-slate-400">
              Scheduled data syncs are checked for stale successful runs.
              Event-driven systems become critical when an event is stuck or
              fails processing.
            </p>
          </div>

          <div className="text-xs font-semibold text-slate-400">
            Latest system activity{" "}
            {formatDateTime(derivedSummary.latest_system_activity_at)}
          </div>
        </div>

        {orderedHealth.length ? (
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {orderedHealth.map((row) => (
              <SystemHealthCard
                key={row.system_key}
                row={row}
                activity={activityBySystem.get(row.system_key)}
              />
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <Database size={24} className="mx-auto text-slate-300" />

            <div className="mt-2 text-sm font-semibold text-slate-700">
              No system-health rows available
            </div>

            <div className="mt-1 text-xs text-slate-400">
              Verify the operational monitoring views in Supabase.
            </div>
          </div>
        )}
      </section>

      <section className="system-health-failures-card card mt-4 overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="eyebrow">Operational log</div>

            <div className="section-title mt-1">
              Recent failures & stuck events
            </div>

            <p className="mt-1 text-xs leading-5 text-slate-400">
              Includes historical failures as well as webhook events that
              remained pending beyond the monitoring threshold.
            </p>
          </div>

          <AlertTriangle size={19} className="mt-1 shrink-0 text-amber-500" />
        </div>

        {failures.length ? (
          <div className="system-health-table-wrap overflow-x-auto">
            <table className="system-health-table min-w-[940px] w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] uppercase tracking-[.1em] text-slate-400">
                  <th className="px-4 py-3">System</th>

                  <th className="px-4 py-3">Event</th>

                  <th className="px-4 py-3">Status</th>

                  <th className="px-4 py-3">Occurred</th>

                  <th className="px-4 py-3">Problem</th>
                </tr>
              </thead>

              <tbody>
                {failures.map((row) => (
                  <tr
                    key={`${row.system_key}:${row.source_id}`}
                    className="border-b border-slate-100 align-top last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-slate-800">
                        {row.system_name}
                      </div>

                      <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                        {shortId(row.source_id)}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                      {row.event_type ? pretty(row.event_type) : "—"}
                    </td>

                    <td className="px-4 py-3">
                      <span className={problemStatusClass(row.status)}>
                        {pretty(row.status || "unknown")}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDateTime(row.occurred_at)}
                    </td>

                    <td className="max-w-xl px-4 py-3 text-xs leading-5 text-slate-600">
                      <div className="break-words">
                        {row.error_message ||
                          (row.status === "received"
                            ? "Event remained unprocessed beyond the allowed threshold."
                            : "No provider error message was recorded.")}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <CheckCircle2 size={23} className="mx-auto text-emerald-400" />

            <div className="mt-2 text-sm font-semibold text-slate-700">
              No recent operational problems
            </div>

            <div className="mt-1 text-xs text-slate-400">
              Failed and stuck events will appear here automatically.
            </div>
          </div>
        )}
      </section>

      <section className="system-health-rules-card card-pad mt-4">
        <div className="eyebrow">Monitoring rules</div>

        <div className="section-title mt-1">How health is classified</div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <HealthRule
            icon={<CheckCircle2 size={16} />}
            title="Healthy"
            text="Latest scheduled sync succeeded and no event-driven processing is stuck."
            tone="healthy"
          />

          <HealthRule
            icon={<Clock3 size={16} />}
            title="Warning"
            text="No run history, a scheduled sync is stale, or a recent failure recovered afterward."
            tone="warning"
          />

          <HealthRule
            icon={<AlertTriangle size={16} />}
            title="Critical"
            text="Latest scheduled run failed, or WhatsApp / website ingestion has an event stuck beyond 15 minutes."
            tone="critical"
          />
        </div>
      </section>
    </div>
  );
}

async function requireAdminAccess(): Promise<string> {
  const supabase =
    await createClient();


  const {
    data: {
      user,
    },

    error:
      authError,
  } =
    await supabase
      .auth
      .getUser();


  if (
    authError ||
    !user
  ) {
    redirect(
      "/login"
    );
  }


  const {
    data:
      profile,

    error:
      profileError,
  } =
    await supabase
      .from(
        "profiles"
      )
      .select(
        "role,active"
      )
      .eq(
        "id",
        user.id
      )
      .maybeSingle();


  if (
    profileError ||
    !profile ||
    profile.active !== true
  ) {
    redirect(
      "/login"
    );
  }


  if (
    profile.role !==
    "admin"
  ) {
    redirect(
      "/dashboard"
    );
  }


  const {
    data:
      memberships,

    error:
      membershipError,
  } =
    await supabase
      .from(
        "organization_members"
      )
      .select(
        "organization_id"
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "active",
        true
      )
      .limit(
        2
      );


  if (
    membershipError
  ) {
    throw new Error(
      `Unable to resolve current organization: ${membershipError.message}`
    );
  }


  if (
    !memberships ||
    memberships.length === 0
  ) {
    throw new Error(
      "Unable to resolve current organization: no active organization membership found."
    );
  }


  if (
    memberships.length > 1
  ) {
    throw new Error(
      "Unable to resolve current organization: multiple active organization memberships found. Workspace switching is required."
    );
  }


  return memberships[0]
    .organization_id;
}

async function loadSystemHealth(
  organizationId: string
): Promise<LoadResult> {

  /*
   * The service-role client is created only after requireAdminAccess() has
   * validated the signed-in user and resolved the current organization.
   *
   * Because the service-role client bypasses RLS, every operational read
   * below is explicitly scoped to organizationId.
   */

  const supabase =
    createAdminClient() as any;


  const [
    healthResult,
    summaryResult,
    activityResult,
    failuresResult,
  ] =
    await Promise.all([

      supabase
        .from(
          "v_system_health"
        )
        .select(
          "*"
        )
        .eq(
          "organization_id",
          organizationId
        ),


      supabase
        .from(
          "v_system_health_summary"
        )
        .select(
          "*"
        )
        .eq(
          "organization_id",
          organizationId
        )
        .maybeSingle(),


      supabase
        .from(
          "v_system_activity_24h"
        )
        .select(
          "*"
        )
        .eq(
          "organization_id",
          organizationId
        ),


      supabase
        .from(
          "v_system_recent_failures"
        )
        .select(
          "*"
        )
        .eq(
          "organization_id",
          organizationId
        )
        .order(
          "occurred_at",
          {
            ascending:
              false,
          }
        )
        .limit(
          20
        ),
    ]);


  const errors: string[] =
    [];


  if (
    healthResult.error
  ) {
    errors.push(
      `System health: ${healthResult.error.message}`
    );
  }


  if (
    summaryResult.error
  ) {
    errors.push(
      `Health summary: ${summaryResult.error.message}`
    );
  }


  if (
    activityResult.error
  ) {
    errors.push(
      `24h activity: ${activityResult.error.message}`
    );
  }


  if (
    failuresResult.error
  ) {
    errors.push(
      `Recent problems: ${failuresResult.error.message}`
    );
  }


  return {
    health:
      (
        healthResult.data ??
        []
      ) as SystemHealthRow[],

    summary:
      (
        summaryResult.data ??
        null
      ) as SystemHealthSummary | null,

    activity:
      (
        activityResult.data ??
        []
      ) as SystemActivityRow[],

    failures:
      (
        failuresResult.data ??
        []
      ) as SystemFailureRow[],

    errors,
  };
}

function SystemHealthCard({
  row,

  activity,
}: {
  row: SystemHealthRow;

  activity?: SystemActivityRow;
}) {
  const status = normalizeHealth(row.health_status);

  const tone = healthTone(status);

  const pending = safeNumber(row.pending_count);

  const failures24h = safeNumber(row.failures_24h);

  const activity24h = safeNumber(activity?.activity_count ?? row.activity_24h);

  const successes24h = safeNumber(activity?.successful_count);

  const oldestPendingMinutes = safeNumber(row.oldest_pending_minutes);

  return (
    <article
      className={`system-health-system-card rounded-2xl border p-4 ${tone.card}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone.icon}`}
          >
            {systemIcon(row.system_key)}
          </span>

          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {row.system_name}
            </div>

            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400">
              {pretty(row.system_group)}
            </div>
          </div>
        </div>

        <HealthBadge status={status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniMetric label="24h activity" value={activity24h.toLocaleString()} />

        <MiniMetric label="24h success" value={successes24h.toLocaleString()} />

        <MiniMetric
          label="Open pending"
          value={pending.toLocaleString()}
          warn={pending > 0}
        />

        <MiniMetric
          label="24h failures"
          value={failures24h.toLocaleString()}
          warn={failures24h > 0}
        />
      </div>

      <div className="mt-4 space-y-2 border-t border-slate-200/70 pt-3 text-xs">
        <HealthDetail
          label="Latest status"
          value={pretty(row.latest_status || "No activity")}
        />

        <HealthDetail
          label="Latest activity"
          value={formatDateTime(row.latest_activity_at)}
        />

        <HealthDetail
          label="Last success"
          value={formatDateTime(row.last_success_at)}
        />

        {row.stale_after_minutes != null ? (
          <HealthDetail
            label="Stale after"
            value={formatDurationMinutes(safeNumber(row.stale_after_minutes))}
          />
        ) : null}

        {pending > 0 && row.oldest_pending_at ? (
          <HealthDetail
            label="Oldest pending"
            value={`${formatDurationMinutes(oldestPendingMinutes)} ago`}
            emphasis
          />
        ) : null}
      </div>

      {row.latest_error ? (
        <div className="system-health-latest-error mt-3 rounded-xl border border-rose-100 bg-white/80 px-3 py-2.5 text-[11px] leading-5 text-rose-700">
          <div className="font-semibold">Latest error</div>

          <div className="mt-0.5 break-words">{row.latest_error}</div>
        </div>
      ) : status === "warning" && !row.latest_activity_at ? (
        <div className="system-health-no-activity mt-3 rounded-xl border border-amber-100 bg-white/80 px-3 py-2.5 text-[11px] leading-5 text-amber-700">
          No activity has been recorded for this system yet.
        </div>
      ) : null}
    </article>
  );
}

function HealthBadge({
  status,
}: {
  status: "healthy" | "warning" | "critical";
}) {
  const classes =
    status === "critical"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : status === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <span
      className={`system-health-badge inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.08em] ${classes}`}
    >
      {status}
    </span>
  );
}

function MiniMetric({
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
      className={`system-health-mini-metric rounded-xl border px-3 py-2.5 ${
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

function HealthDetail({
  label,

  value,

  emphasis = false,
}: {
  label: string;

  value: string;

  emphasis?: boolean;
}) {
  return (
    <div className="system-health-detail flex items-start justify-between gap-4">
      <span className="font-semibold text-slate-400">{label}</span>

      <span
        className={`text-right font-semibold ${
          emphasis ? "text-rose-700" : "text-slate-700"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function HealthRule({
  icon,

  title,

  text,

  tone,
}: {
  icon: ReactNode;

  title: string;

  text: string;

  tone: "healthy" | "warning" | "critical";
}) {
  const classes =
    tone === "critical"
      ? "border-rose-100 bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "border-amber-100 bg-amber-50 text-amber-700"
        : "border-emerald-100 bg-emerald-50 text-emerald-700";

  return (
    <div className={`system-health-rule rounded-xl border p-4 ${classes}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}

        {title}
      </div>

      <p className="mt-1.5 text-xs leading-5 opacity-80">{text}</p>
    </div>
  );
}

function MockSystemHealth() {
  return (
    <div className="system-health-polish">
      <PageHeader
        eyebrow="Operations monitoring"
        title="System health"
        description="System Health reads live sync logs and webhook processing tables, so it is available when the CRM is connected to Supabase live data."
      />

      <section className="system-health-mock-card card-pad">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
            <AlertTriangle size={18} />
          </span>

          <div>
            <div className="text-sm font-semibold text-slate-900">
              Development mock mode is active
            </div>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Set NEXT_PUBLIC_USE_MOCK_DATA=false and use the live Supabase
              environment to view operational health.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function deriveSummary(health: SystemHealthRow[]): SystemHealthSummary {
  return {
    total_systems: health.length,

    healthy_systems: health.filter(
      (row) => normalizeHealth(row.health_status) === "healthy",
    ).length,

    warning_systems: health.filter(
      (row) => normalizeHealth(row.health_status) === "warning",
    ).length,

    critical_systems: health.filter(
      (row) => normalizeHealth(row.health_status) === "critical",
    ).length,

    latest_system_activity_at:
      health

        .map((row) => row.latest_activity_at)

        .filter(Boolean)

        .sort()

        .at(-1) ?? null,

    checked_at: new Date().toISOString(),
  };
}

function normalizeHealth(value: string | null | undefined) {
  if (value === "critical") return "critical" as const;

  if (value === "warning") return "warning" as const;

  return "healthy" as const;
}

function healthRank(value: string | null | undefined) {
  const status = normalizeHealth(value);

  if (status === "critical") return 1;

  if (status === "warning") return 2;

  return 3;
}

function healthTone(status: "healthy" | "warning" | "critical") {
  if (status === "critical") {
    return {
      card: "border-rose-200 bg-rose-50/25",

      icon: "bg-rose-100 text-rose-700",
    };
  }

  if (status === "warning") {
    return {
      card: "border-amber-200 bg-amber-50/25",

      icon: "bg-amber-100 text-amber-700",
    };
  }

  return {
    card: "border-slate-200 bg-white",

    icon: "bg-emerald-50 text-emerald-700",
  };
}

function systemIcon(systemKey: string) {
  if (systemKey === "ga4" || systemKey === "gsc") {
    return <BarChart3 size={18} />;
  }

  if (systemKey === "google_ads" || systemKey === "meta_ads") {
    return <Megaphone size={18} />;
  }

  if (systemKey === "admissions") {
    return <ClipboardCheck size={18} />;
  }

  if (systemKey === "whatsapp") {
    return <MessageCircle size={18} />;
  }

  if (systemKey === "lead_capture") {
    return <Webhook size={18} />;
  }

  return <Activity size={18} />;
}

function safeNumber(value: unknown) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}

function formatDurationMinutes(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";

  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  const hours = Math.floor(minutes / 60);

  const remainingMinutes = Math.round(minutes % 60);

  if (hours < 24) {
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);

  const remainingHours = hours % 24;

  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
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

function pretty(value: string) {
  return value

    .replaceAll(":", ": ")

    .replaceAll("_", " ")

    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function shortId(value: string) {
  if (!value) return "—";

  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function problemStatusClass(value?: string | null) {
  const status = String(value ?? "").toLowerCase();

  if (status === "failed" || status === "error") {
    return "inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.06em] text-rose-700";
  }

  if (["received", "pending", "processing", "running"].includes(status)) {
    return "inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.06em] text-amber-700";
  }

  return "inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.06em] text-slate-600";
}
