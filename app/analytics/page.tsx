import { Activity, RefreshCw } from "lucide-react";

import { AnalyticsExplorer } from "@/components/analytics-explorer";
import { PageHeader } from "@/components/ui";
import { getAnalyticsWorkspace } from "@/lib/analytics-data";

export default async function AnalyticsPage() {
  const workspace = await getAnalyticsWorkspace();
  const { overview, sourceRows, landingRows, campaignRows, countryRows, reconciliation, health, syncRuns } = workspace;

  const dateRange =
    overview.range_start && overview.range_end
      ? `${formatDate(overview.range_start)} – ${formatDate(overview.range_end)}`
      : "Latest synced period";

  const latestRun = syncRuns[0] ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Intelligence"
        title="Analytics"
        description="Explore traffic, conversion and CRM outcomes."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              {dateRange}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${
                health.latest_analytics_date
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400"
              }`}
            >
              <Activity size={12} />
              {health.latest_analytics_date ? `Synced ${formatDate(health.latest_analytics_date)}` : "Waiting for data"}
            </span>
          </div>
        }
      />

      {workspace.warning ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          {workspace.warning}
        </div>
      ) : null}

      <AnalyticsExplorer
        overview={overview}
        reconciliation={reconciliation}
        sources={sourceRows}
        landing={landingRows}
        campaigns={campaignRows}
        countries={countryRows}
      />

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 sm:px-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
            <RefreshCw size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-black text-slate-900 dark:text-white">Data health</span>
            <span className="mt-0.5 block truncate text-[10px] text-slate-500">
              {latestRun
                ? `${pretty(latestRun.status)} · ${formatNumber(latestRun.total_rows)} rows · ${formatDateTime(latestRun.started_at)}`
                : "No sync run recorded"}
            </span>
          </span>
          <span className="text-[10px] font-bold text-slate-400 group-open:hidden">Show</span>
          <span className="hidden text-[10px] font-bold text-slate-400 group-open:inline">Hide</span>
        </summary>

        <div className="border-t border-slate-100 px-4 py-4 sm:px-5 dark:border-slate-900">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HealthMetric label="Latest GA4 date" value={health.latest_analytics_date ? formatDate(health.latest_analytics_date) : "—"} />
            <HealthMetric label="Last successful sync" value={health.last_successful_sync ? formatDateTime(health.last_successful_sync) : "—"} />
            <HealthMetric label="Daily rows" value={formatNumber(health.daily_rows)} />
            <HealthMetric label="Landing rows" value={formatNumber(health.landing_page_rows)} />
          </div>

          {syncRuns.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[9px] font-black uppercase tracking-[0.08em] text-slate-400 dark:border-slate-900">
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Range</th>
                    <th className="px-2 py-2 text-right">Rows</th>
                    <th className="px-2 py-2">Started</th>
                    <th className="px-2 py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {syncRuns.slice(0, 6).map((run) => (
                    <tr key={run.id} className="border-b border-slate-50 last:border-0 dark:border-slate-900/60">
                      <td className="px-2 py-2.5 font-bold text-slate-700 dark:text-slate-200">{pretty(run.status)}</td>
                      <td className="px-2 py-2.5 text-slate-500">{run.from_date ? formatDate(run.from_date) : "—"} → {run.to_date ? formatDate(run.to_date) : "—"}</td>
                      <td className="px-2 py-2.5 text-right font-bold tabular-nums text-slate-700 dark:text-slate-200">{formatNumber(run.total_rows)}</td>
                      <td className="px-2 py-2.5 text-slate-500">{formatDateTime(run.started_at)}</td>
                      <td className="max-w-[320px] truncate px-2 py-2.5 text-slate-400">{run.error_message || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </details>

      <div className="px-1 text-[10px] leading-4 text-slate-400">
        GA4 and first-party CRM tracking use different identity, consent and session definitions. Differences are evidence to investigate, not automatically errors.
      </div>
    </div>
  );
}

function HealthMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-900/60">
      <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</div>
      <div className="mt-1 text-xs font-black text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  );
}

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return toNumber(value).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function pretty(value: string | null | undefined) {
  if (!value) return "—";
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
