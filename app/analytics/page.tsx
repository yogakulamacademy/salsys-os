import type { ReactNode } from "react";

import {
  Activity,
  BarChart3,
  CircleDollarSign,
  Eye,
  FileText,
  Globe2,
  MousePointerClick,
  RefreshCw,
  Route,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/ui";

import { getAnalyticsWorkspace } from "@/lib/analytics-data";

export default async function AnalyticsPage() {
  const workspace = await getAnalyticsWorkspace();

  const {
    overview,
    sourceRows,
    landingRows,
    campaignRows,
    countryRows,
    reconciliation,
    health,
    syncRuns,
  } = workspace;

  const ga4Sessions = toNumber(overview.ga4_sessions);

  const crmSessions = toNumber(overview.crm_sessions);

  const crmVisitors = toNumber(overview.crm_visitors);

  const crmWebLeads = toNumber(overview.crm_web_leads);

  const sessionDifference = differencePercent(
    crmSessions,

    ga4Sessions,
  );

  const dateRange =
    overview.range_start && overview.range_end
      ? `${formatDate(overview.range_start)} – ${formatDate(
          overview.range_end,
        )}`
      : "Latest 30 synced GA4 days";

  return (
    <>
      <PageHeader
        title="Analytics"
        description="GA4 traffic, first-party CRM tracking, lead conversion and acquisition performance in one view."
      />

      {workspace.warning && (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          Analytics loaded through the legacy fallback. {workspace.warning}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span
          className="

            rounded-full

            border

            border-slate-200

            bg-white

            px-3

            py-1.5

            font-semibold

          "
        >
          {dateRange}
        </span>

        <span>
          Latest synced GA4 date:{" "}
          <strong className="font-semibold text-slate-600">
            {health.latest_analytics_date
              ? formatDate(health.latest_analytics_date)
              : "—"}
          </strong>
        </span>
      </div>

      {/* ===================================================

          GA4 OVERVIEW

      =================================================== */}

      <section className="card-pad mt-6">
        <div className="eyebrow">Website performance</div>

        <div className="section-title mt-1">GA4 overview</div>

        <div
          className="

            mt-5

            grid

            gap-3

            sm:grid-cols-2

            xl:grid-cols-4

          "
        >
          <MetricCard
            icon={<Route size={17} />}
            label="GA4 sessions"
            value={formatNumber(overview.ga4_sessions)}
          />

          <MetricCard
            icon={<Eye size={17} />}
            label="Page views"
            value={formatNumber(overview.ga4_page_views)}
          />

          <MetricCard
            icon={<Users size={17} />}
            label="New users"
            value={formatNumber(overview.ga4_new_users)}
          />

          <MetricCard
            icon={<Users size={17} />}
            label="Avg daily users"
            value={formatNumber(
              overview.ga4_avg_daily_users,

              1,
            )}
            sub="Average of GA4 daily users, not 30-day unique users"
          />

          <MetricCard
            icon={<Activity size={17} />}
            label="Engagement rate"
            value={formatFractionPercent(overview.ga4_engagement_rate)}
          />

          <MetricCard
            icon={<TrendingUp size={17} />}
            label="Engaged sessions"
            value={formatNumber(overview.ga4_engaged_sessions)}
          />

          <MetricCard
            icon={<Activity size={17} />}
            label="Avg session duration"
            value={formatDuration(overview.ga4_avg_session_duration)}
          />

          <MetricCard
            icon={<MousePointerClick size={17} />}
            label="GA4 key events"
            value={formatNumber(overview.ga4_key_events)}
          />
        </div>
      </section>

      {/* ===================================================

          CRM FUNNEL

      =================================================== */}

      <section className="card-pad mt-4">
        <div className="eyebrow">First-party tracking</div>

        <div className="section-title mt-1">CRM website funnel</div>

        <div
          className="

            mt-5

            grid

            gap-3

            sm:grid-cols-2

            xl:grid-cols-4

          "
        >
          <MetricCard
            icon={<Route size={17} />}
            label="CRM sessions"
            value={formatNumber(overview.crm_sessions)}
          />

          <MetricCard
            icon={<Users size={17} />}
            label="CRM visitors"
            value={formatNumber(overview.crm_visitors)}
          />

          <MetricCard
            icon={<Eye size={17} />}
            label="Tracked page views"
            value={formatNumber(overview.crm_page_views)}
          />

          <MetricCard
            icon={<FileText size={17} />}
            label="Form submissions"
            value={formatNumber(overview.crm_form_submits)}
          />

          <MetricCard
            icon={<Target size={17} />}
            label="Website leads"
            value={formatNumber(overview.crm_web_leads)}
          />

          <MetricCard
            icon={<TrendingUp size={17} />}
            label="Qualified leads"
            value={formatNumber(overview.crm_qualified_leads)}
          />

          <MetricCard
            icon={<CircleDollarSign size={17} />}
            label="Enrolled leads"
            value={formatNumber(overview.crm_enrolled_leads)}
          />

          <MetricCard
            icon={<MousePointerClick size={17} />}
            label="Session → lead"
            value={formatHundredPercent(overview.website_lead_conversion_rate)}
          />
        </div>
      </section>

      {/* ===================================================

          RECONCILIATION

      =================================================== */}

      <section className="card-pad mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Reconciliation</div>

            <div className="section-title mt-1">GA4 vs CRM tracking</div>
          </div>

          <BarChart3 size={20} className="text-slate-400" />
        </div>

        <div
          className="

            mt-5

            grid

            gap-3

            md:grid-cols-3

          "
        >
          <ComparisonCard
            label="Sessions"
            leftLabel="GA4"
            leftValue={formatNumber(ga4Sessions)}
            rightLabel="CRM"
            rightValue={formatNumber(crmSessions)}
            detail={`${signedPercent(sessionDifference)} CRM vs GA4`}
          />

          <ComparisonCard
            label="Visitors"
            leftLabel="GA4 avg daily users"
            leftValue={formatNumber(
              overview.ga4_avg_daily_users,

              1,
            )}
            rightLabel="CRM unique visitors"
            rightValue={formatNumber(crmVisitors)}
            detail="Different identity definitions; use as a directional comparison"
          />

          <ComparisonCard
            label="Conversions"
            leftLabel="GA4 key events"
            leftValue={formatNumber(overview.ga4_key_events)}
            rightLabel="CRM website leads"
            rightValue={formatNumber(crmWebLeads)}
            detail="GA4 key events may contain actions beyond CRM lead creation"
          />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-3">Date</th>

                <th className="px-3 py-3 text-right">GA4 sessions</th>

                <th className="px-3 py-3 text-right">CRM sessions</th>

                <th className="px-3 py-3 text-right">GA4 views</th>

                <th className="px-3 py-3 text-right">CRM views</th>

                <th className="px-3 py-3 text-right">CRM visitors</th>

                <th className="px-3 py-3 text-right">Forms</th>

                <th className="px-3 py-3 text-right">Leads</th>
              </tr>
            </thead>

            <tbody>
              {reconciliation

                .slice(0, 14)

                .map((row) => (
                  <tr
                    key={row.analytics_date}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="px-3 py-3 font-semibold text-slate-700">
                      {formatDate(row.analytics_date)}
                    </td>

                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatNumber(row.ga4_sessions)}
                    </td>

                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatNumber(row.crm_sessions)}
                    </td>

                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatNumber(row.ga4_page_views)}
                    </td>

                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatNumber(row.crm_page_views)}
                    </td>

                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatNumber(row.crm_visitors)}
                    </td>

                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatNumber(row.crm_form_submits)}
                    </td>

                    <td className="px-3 py-3 text-right font-bold text-slate-800">
                      {formatNumber(row.crm_web_leads)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================================================

          SOURCE / MEDIUM

      =================================================== */}

      <section className="card-pad mt-4">
        <div>
          <div className="eyebrow">Acquisition</div>

          <div className="section-title mt-1">Source / medium performance</div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-3">Source / medium</th>

                <th className="px-3 py-3 text-right">Sessions</th>

                <th className="px-3 py-3 text-right">Engaged</th>

                <th className="px-3 py-3 text-right">Leads</th>

                <th className="px-3 py-3 text-right">Qualified</th>

                <th className="px-3 py-3 text-right">Enrolled</th>

                <th className="px-3 py-3 text-right">Lead rate</th>

                <th className="px-3 py-3 text-right">INR revenue</th>

                <th className="px-3 py-3 text-right">USD revenue</th>
              </tr>
            </thead>

            <tbody>
              {sourceRows.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-slate-50 last:border-0"
                >
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-800">
                      {row.source}
                    </div>

                    <div className="mt-0.5 text-xs text-slate-400">
                      {row.medium}
                    </div>
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatNumber(row.sessions)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatNumber(row.engaged)}
                  </td>

                  <td className="px-3 py-3 text-right font-bold text-slate-800">
                    {formatNumber(row.leads)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatNumber(row.qualified)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatNumber(row.enrolled)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatHundredPercent(
                      row.sessions > 0 ? (row.leads / row.sessions) * 100 : 0,
                    )}
                  </td>

                  <td className="px-3 py-3 text-right font-semibold text-slate-700">
                    {formatMoney(
                      row.inrRevenue,

                      "INR",
                    )}
                  </td>

                  <td className="px-3 py-3 text-right font-semibold text-slate-700">
                    {formatMoney(
                      row.usdRevenue,

                      "USD",
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================================================

          LANDING PAGES

      =================================================== */}

      <section className="card-pad mt-4">
        <div>
          <div className="eyebrow">Content</div>

          <div className="section-title mt-1">Landing page performance</div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-3">Landing page</th>

                <th className="px-3 py-3 text-right">Sessions</th>

                <th className="px-3 py-3 text-right">Engaged</th>

                <th className="px-3 py-3 text-right">Leads</th>

                <th className="px-3 py-3 text-right">Qualified</th>

                <th className="px-3 py-3 text-right">Enrolled</th>

                <th className="px-3 py-3 text-right">Lead rate</th>
              </tr>
            </thead>

            <tbody>
              {landingRows.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-slate-50 last:border-0"
                >
                  <td className="max-w-[560px] px-3 py-3">
                    <div className="truncate font-semibold text-slate-800">
                      {row.page}
                    </div>
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatNumber(row.sessions)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatNumber(row.engaged)}
                  </td>

                  <td className="px-3 py-3 text-right font-bold text-slate-800">
                    {formatNumber(row.leads)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatNumber(row.qualified)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatNumber(row.enrolled)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatHundredPercent(
                      row.sessions > 0 ? (row.leads / row.sessions) * 100 : 0,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================================================

          CAMPAIGNS / COUNTRIES

      =================================================== */}

      <div
        className="

          mt-4

          grid

          gap-4

          xl:grid-cols-2

        "
      >
        <CompactTableCard
          eyebrow="Campaigns"
          title="Campaign performance"
          icon={<Target size={18} />}
          headers={["Campaign", "Sessions", "Leads", "Enrolled"]}
          rows={campaignRows.map((row) => [
            row.name,

            formatNumber(row.sessions),

            formatNumber(row.leads),

            formatNumber(row.enrolled),
          ])}
        />

        <CompactTableCard
          eyebrow="Geography"
          title="Country performance"
          icon={<Globe2 size={18} />}
          headers={["Country", "Sessions", "Leads", "Enrolled"]}
          rows={countryRows.map((row) => [
            row.name,

            formatNumber(row.sessions),

            formatNumber(row.leads),

            formatNumber(row.enrolled),
          ])}
        />
      </div>

      {/* ===================================================

          SYNC HEALTH

      =================================================== */}

      <section className="card-pad mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Data health</div>

            <div className="section-title mt-1">GA4 sync status</div>
          </div>

          <RefreshCw size={19} className="text-slate-400" />
        </div>

        <div
          className="

            mt-5

            grid

            gap-3

            sm:grid-cols-2

            xl:grid-cols-4

          "
        >
          <MetricCard
            icon={<Activity size={17} />}
            label="Latest GA4 date"
            value={
              health.latest_analytics_date
                ? formatDate(health.latest_analytics_date)
                : "—"
            }
          />

          <MetricCard
            icon={<RefreshCw size={17} />}
            label="Last successful sync"
            value={
              health.last_successful_sync
                ? formatDateTime(health.last_successful_sync)
                : "—"
            }
          />

          <MetricCard
            icon={<Route size={17} />}
            label="Daily rows"
            value={formatNumber(health.daily_rows)}
          />

          <MetricCard
            icon={<FileText size={17} />}
            label="Landing-page rows"
            value={formatNumber(health.landing_page_rows)}
          />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-3">Status</th>

                <th className="px-3 py-3">Range</th>

                <th className="px-3 py-3 text-right">Rows</th>

                <th className="px-3 py-3">Started</th>

                <th className="px-3 py-3">Error</th>
              </tr>
            </thead>

            <tbody>
              {syncRuns.map((run) => (
                <tr
                  key={run.id}
                  className="border-b border-slate-50 last:border-0"
                >
                  <td className="px-3 py-3">
                    <StatusBadge status={run.status} />
                  </td>

                  <td className="px-3 py-3 text-slate-600">
                    {run.from_date ? formatDate(run.from_date) : "—"}

                    {" → "}

                    {run.to_date ? formatDate(run.to_date) : "—"}
                  </td>

                  <td className="px-3 py-3 text-right font-semibold text-slate-700">
                    {formatNumber(run.total_rows)}
                  </td>

                  <td className="px-3 py-3 text-slate-500">
                    {formatDateTime(run.started_at)}
                  </td>

                  <td className="max-w-[360px] px-3 py-3 text-xs text-slate-500">
                    {run.error_message || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div
        className="

          mt-4

          rounded-xl

          border

          border-slate-100

          bg-slate-50

          px-4

          py-3

          text-xs

          leading-5

          text-slate-500

        "
      >
        GA4 and CRM will not match exactly. Consent choices, blockers, GA4
        identity rules, session definitions and first-party tracking coverage
        can create legitimate differences. Use reconciliation to identify
        meaningful gaps rather than expecting a 100% match.
      </div>
    </>
  );
}

/* =========================================================

   COMPONENTS

========================================================= */

function MetricCard({
  icon,

  label,

  value,

  sub,
}: {
  icon: ReactNode;

  label: string;

  value: string;

  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        {icon}

        {label}
      </div>

      <div className="mt-2 text-xl font-bold text-slate-800">{value}</div>

      {sub && (
        <div className="mt-1 text-[11px] leading-4 text-slate-400">{sub}</div>
      )}
    </div>
  );
}

function ComparisonCard({
  label,

  leftLabel,

  leftValue,

  rightLabel,

  rightValue,

  detail,
}: {
  label: string;

  leftLabel: string;

  leftValue: string;

  rightLabel: string;

  rightValue: string;

  detail: string;
}) {
  return (
    <div
      className="

        rounded-xl

        border

        border-slate-100

        bg-slate-50

        p-4

      "
    >
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-slate-400">{leftLabel}</div>

          <div className="mt-1 text-lg font-bold text-slate-800">
            {leftValue}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-400">{rightLabel}</div>

          <div className="mt-1 text-lg font-bold text-slate-800">
            {rightValue}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] leading-4 text-slate-400">{detail}</div>
    </div>
  );
}

function CompactTableCard({
  eyebrow,

  title,

  icon,

  headers,

  rows,
}: {
  eyebrow: string;

  title: string;

  icon: ReactNode;

  headers: string[];

  rows: string[][];
}) {
  return (
    <section className="card-pad">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow">{eyebrow}</div>

          <div className="section-title mt-1">{title}</div>
        </div>

        <div className="text-slate-400">{icon}</div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              {headers.map(
                (
                  header,

                  index,
                ) => (
                  <th
                    key={`${header}-${index}`}
                    className={
                      index === 0 ? "px-3 py-3" : "px-3 py-3 text-right"
                    }
                  >
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-3 py-8 text-center text-sm text-slate-400"
                >
                  No data yet.
                </td>
              </tr>
            )}

            {rows.map(
              (
                row,

                rowIndex,
              ) => (
                <tr
                  key={rowIndex}
                  className="border-b border-slate-50 last:border-0"
                >
                  {row.map(
                    (
                      cell,

                      index,
                    ) => (
                      <td
                        key={`${rowIndex}-${index}`}
                        className={
                          index === 0
                            ? "px-3 py-3 font-semibold text-slate-700"
                            : "px-3 py-3 text-right text-slate-600"
                        }
                      >
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = String(status || "").toLowerCase();

  const className =
    normalized === "completed"
      ? "bg-emerald-50 text-emerald-700"
      : normalized === "failed"
        ? "bg-rose-50 text-rose-700"
        : "bg-amber-50 text-amber-700";

  return (
    <span
      className={`

        inline-flex

        rounded-full

        px-2.5

        py-1

        text-xs

        font-bold

        ${className}

      `}
    >
      {pretty(status)}
    </span>
  );
}

/* =========================================================

   HELPERS

========================================================= */

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}

function formatNumber(
  value: number | string | null | undefined,

  maximumFractionDigits = 0,
) {
  return new Intl.NumberFormat(
    "en-IN",

    {
      maximumFractionDigits,
    },
  ).format(toNumber(value));
}

function formatFractionPercent(value: number | string | null | undefined) {
  return `${(toNumber(value) * 100).toFixed(1)}%`;
}

function formatHundredPercent(value: number | string | null | undefined) {
  return `${toNumber(value).toFixed(1)}%`;
}

function differencePercent(
  actual: number,

  reference: number,
) {
  if (reference === 0) {
    return 0;
  }

  return ((actual - reference) / reference) * 100;
}

function signedPercent(value: number) {
  const number = Number.isFinite(value) ? value : 0;

  const sign = number > 0 ? "+" : "";

  return `${sign}${number.toFixed(1)}%`;
}

function formatDuration(value: number | string | null | undefined) {
  const seconds = Math.max(
    0,

    Math.round(toNumber(value)),
  );

  const minutes = Math.floor(seconds / 60);

  const remainder = seconds % 60;

  if (minutes === 0) {
    return `${remainder}s`;
  }

  return `${minutes}m ${remainder}s`;
}

function formatMoney(
  value: number | string | null | undefined,

  currency: string,
) {
  const code = String(currency || "INR").toUpperCase();

  return new Intl.NumberFormat(
    code === "INR" ? "en-IN" : "en-US",

    {
      style: "currency",

      currency: code,

      maximumFractionDigits: 0,
    },
  ).format(toNumber(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(
    `${value.slice(
      0,

      10,
    )}T00:00:00Z`,
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-IN",

    {
      day: "numeric",

      month: "short",

      year: "numeric",

      timeZone: "UTC",
    },
  ).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-IN",

    {
      day: "numeric",

      month: "short",

      hour: "numeric",

      minute: "2-digit",

      timeZone: "Asia/Kolkata",
    },
  ).format(date);
}

function pretty(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return String(value)
    .replaceAll(
      "_",

      " ",
    )

    .replace(
      /\b\w/g,

      (letter) => letter.toUpperCase(),
    );
}
