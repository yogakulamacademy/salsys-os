import type { ReactNode } from "react";

import {
  Activity,
  BarChart3,
  CircleDollarSign,
  Eye,
  FileSearch,
  Gauge,
  Globe2,
  Laptop,
  MousePointerClick,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/ui";

import { getSeoWorkspace } from "@/lib/seo-data";

type SeoOverviewRow = {
  range_start: string | null;

  range_end: string | null;

  clicks: number | string | null;

  impressions: number | string | null;

  ctr: number | string | null;

  avg_position: number | string | null;

  organic_leads: number | string | null;

  organic_qualified_leads: number | string | null;

  organic_enrolled_leads: number | string | null;

  organic_revenue_inr: number | string | null;

  organic_revenue_usd: number | string | null;

  click_to_lead_rate: number | string | null;
};

type DailyRow = {
  date: string;

  clicks: number | string | null;

  impressions: number | string | null;

  ctr: number | string | null;

  avg_position: number | string | null;
};

type QueryRow = {
  query: string;

  clicks: number | string | null;

  impressions: number | string | null;

  ctr: number | string | null;

  avg_position: number | string | null;
};

type PageRow = {
  page: string;

  clicks: number | string | null;

  impressions: number | string | null;

  ctr: number | string | null;

  avg_position: number | string | null;
};

type CountryRow = {
  country: string;

  clicks: number | string | null;

  impressions: number | string | null;

  ctr: number | string | null;

  avg_position: number | string | null;
};

type DeviceRow = {
  device: string;

  clicks: number | string | null;

  impressions: number | string | null;

  ctr: number | string | null;

  avg_position: number | string | null;
};

type SearchAppearanceRow = {
  search_appearance: string;

  clicks: number | string | null;

  impressions: number | string | null;

  ctr: number | string | null;

  avg_position: number | string | null;
};

type OpportunityRow = {
  query: string;

  clicks: number | string | null;

  impressions: number | string | null;

  ctr: number | string | null;

  avg_position: number | string | null;

  opportunity_type: string;

  recommendation: string;
};

type SyncHealthRow = {
  latest_gsc_date: string | null;

  latest_data_update: string | null;

  last_successful_sync: string | null;

  daily_rows: number | string | null;

  query_rows: number | string | null;

  page_rows: number | string | null;

  country_rows: number | string | null;

  device_rows: number | string | null;

  search_appearance_rows: number | string | null;
};

type SyncRunRow = {
  id: string;

  site_url: string;

  start_date: string;

  end_date: string;

  status: string;

  triggered_by: string;

  total_rows: number | string | null;

  error_message: string | null;

  started_at: string;

  completed_at: string | null;
};

export default async function SeoPage() {
  const workspace = await getSeoWorkspace();

  const {
    overview,

    daily,

    queries,

    pages,

    countries,

    devices,

    appearances,

    opportunities,

    health,

    syncRuns,
  } = workspace;

  const periodComparison = calculatePeriodComparison(daily);

  const dateRange =
    overview.range_start && overview.range_end
      ? `${formatDate(overview.range_start)} – ${formatDate(
          overview.range_end,
        )}`
      : "Latest 30 finalized Search Console days";

  const maxDailyClicks = Math.max(
    1,

    ...daily.map((row) => toNumber(row.clicks)),
  );

  const maxDailyImpressions = Math.max(
    1,

    ...daily.map((row) => toNumber(row.impressions)),
  );

  return (
    <div className="seo-polish">
      <PageHeader
        eyebrow="Organic growth"
        title="SEO"
        description="Google Search Console performance, organic-search opportunities, CRM leads, enrollments and revenue."
      />

      {workspace.warning && (
        <div className="seo-warning mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          SEO loaded through the legacy fallback. {workspace.warning}
        </div>
      )}

      <div className="seo-range-meta mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
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
          Latest finalized GSC date:{" "}
          <strong className="font-semibold text-slate-600">
            {health.latest_gsc_date ? formatDate(health.latest_gsc_date) : "—"}
          </strong>
        </span>
      </div>

      {/* ===================================================



          SEARCH PERFORMANCE



      =================================================== */}

      <section className="seo-search-performance card-pad mt-6">
        <div className="eyebrow">Google Search Console</div>

        <div className="section-title mt-1">Organic search performance</div>

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
            icon={<MousePointerClick size={17} />}
            label="Organic clicks"
            value={formatNumber(overview.clicks)}
            sub={comparisonText(
              periodComparison.clicksChange,

              "vs previous 15 days",
            )}
          />

          <MetricCard
            icon={<Eye size={17} />}
            label="Impressions"
            value={formatNumber(overview.impressions)}
            sub={comparisonText(
              periodComparison.impressionsChange,

              "vs previous 15 days",
            )}
          />

          <MetricCard
            icon={<Gauge size={17} />}
            label="CTR"
            value={formatFractionPercent(overview.ctr)}
            sub={comparisonText(periodComparison.ctrChange, "relative change")}
          />

          <MetricCard
            icon={<TrendingUp size={17} />}
            label="Average position"
            value={formatDecimal(overview.avg_position, 1)}
            sub={positionComparisonText(periodComparison.positionChange)}
          />
        </div>
      </section>

      {/* ===================================================



          ORGANIC → CRM



      =================================================== */}

      <section className="seo-crm-attribution card-pad mt-4">
        <div className="eyebrow">Search → CRM</div>

        <div className="section-title mt-1">
          Organic lead and revenue attribution
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
            icon={<Users size={17} />}
            label="Organic leads"
            value={formatNumber(overview.organic_leads)}
          />

          <MetricCard
            icon={<Target size={17} />}
            label="Qualified leads"
            value={formatNumber(overview.organic_qualified_leads)}
          />

          <MetricCard
            icon={<CircleDollarSign size={17} />}
            label="Enrolled leads"
            value={formatNumber(overview.organic_enrolled_leads)}
          />

          <MetricCard
            icon={<MousePointerClick size={17} />}
            label="Click → lead"
            value={formatHundredPercent(overview.click_to_lead_rate)}
          />

          <MetricCard
            icon={<CircleDollarSign size={17} />}
            label="Organic revenue · INR"
            value={formatMoney(overview.organic_revenue_inr, "INR")}
          />

          <MetricCard
            icon={<CircleDollarSign size={17} />}
            label="Organic revenue · USD"
            value={formatMoney(overview.organic_revenue_usd, "USD")}
          />
        </div>

        <div
          className="



            mt-5



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
          Organic CRM attribution uses first-touch source Google / google.com
          with an organic medium. Search Console clicks and CRM leads are
          different measurement systems, so the click-to-lead rate is
          directional rather than an exact identity match.
        </div>
      </section>

      {/* ===================================================



          DAILY TREND



      =================================================== */}

      <section className="seo-trend-card card-pad mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Trend</div>

            <div className="section-title mt-1">Daily search performance</div>
          </div>

          <BarChart3 size={20} className="text-slate-400" />
        </div>

        <div className="mt-6 space-y-3">
          {daily.map((row) => {
            const clicks = toNumber(row.clicks);

            const impressions = toNumber(row.impressions);

            return (
              <div
                key={row.date}
                className="



                    grid



                    grid-cols-[92px_minmax(0,1fr)_72px_86px]



                    items-center



                    gap-3



                  "
              >
                <div className="text-xs font-semibold text-slate-500">
                  {formatShortDate(row.date)}
                </div>

                <div className="space-y-1.5">
                  <ProgressBar value={clicks} max={maxDailyClicks} />

                  <ProgressBar
                    value={impressions}
                    max={maxDailyImpressions}
                    muted
                  />
                </div>

                <div className="text-right">
                  <div className="text-xs font-semibold text-slate-700">
                    {formatNumber(clicks)}
                  </div>

                  <div className="text-[10px] text-slate-400">clicks</div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-semibold text-slate-700">
                    {formatNumber(impressions)}
                  </div>

                  <div className="text-[10px] text-slate-400">impressions</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===================================================



          TOP QUERIES



      =================================================== */}

      <section className="seo-table-card seo-query-card card-pad mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Keywords</div>

            <div className="section-title mt-1">Top search queries</div>
          </div>

          <Search size={20} className="text-slate-400" />
        </div>

        <div className="seo-table-wrap mt-5 overflow-x-auto">
          <table className="seo-data-table min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-3">Query</th>

                <th className="px-3 py-3 text-right">Clicks</th>

                <th className="px-3 py-3 text-right">Impressions</th>

                <th className="px-3 py-3 text-right">CTR</th>

                <th className="px-3 py-3 text-right">Position</th>
              </tr>
            </thead>

            <tbody>
              {queries.slice(0, 25).map((row) => (
                <tr
                  key={row.query}
                  className="border-b border-slate-50 last:border-0"
                >
                  <td className="px-3 py-3 font-semibold text-slate-800">
                    {row.query}
                  </td>

                  <td className="px-3 py-3 text-right font-semibold text-slate-800">
                    {formatNumber(row.clicks)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatNumber(row.impressions)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatFractionPercent(row.ctr)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatDecimal(row.avg_position, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================================================



          SEO OPPORTUNITIES



      =================================================== */}

      <section className="seo-opportunities-card card-pad mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Opportunities</div>

            <div className="section-title mt-1">SEO optimization queue</div>
          </div>

          <Sparkles size={20} className="text-slate-400" />
        </div>

        {opportunities.length === 0 ? (
          <div
            className="



              mt-5



              rounded-xl



              border



              border-dashed



              border-slate-200



              px-5



              py-10



              text-center



              text-sm



              text-slate-400



            "
          >
            No queries currently match the opportunity thresholds.
          </div>
        ) : (
          <div className="seo-opportunity-list mt-5 space-y-3">
            {opportunities.slice(0, 20).map((row) => (
              <div
                key={`${row.opportunity_type}-${row.query}`}
                className="



                      rounded-xl



                      border



                      border-slate-100



                      bg-slate-50



                      p-4



                    "
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <OpportunityBadge type={row.opportunity_type} />

                      <span className="text-xs text-slate-400">
                        {formatNumber(row.impressions)} impressions
                      </span>
                    </div>

                    <div className="mt-2 font-semibold text-slate-800">
                      {row.query}
                    </div>

                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      {row.recommendation}
                    </div>
                  </div>

                  <div
                    className="



                          grid



                          shrink-0



                          grid-cols-3



                          gap-5



                          text-right



                        "
                  >
                    <MiniStat label="Clicks" value={formatNumber(row.clicks)} />

                    <MiniStat
                      label="CTR"
                      value={formatFractionPercent(row.ctr)}
                    />

                    <MiniStat
                      label="Position"
                      value={formatDecimal(row.avg_position, 1)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===================================================



          TOP PAGES



      =================================================== */}

      <section className="seo-table-card seo-pages-card card-pad mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Content</div>

            <div className="section-title mt-1">Top organic landing pages</div>
          </div>

          <FileSearch size={20} className="text-slate-400" />
        </div>

        <div className="seo-table-wrap mt-5 overflow-x-auto">
          <table className="seo-data-table min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-3">Page</th>

                <th className="px-3 py-3 text-right">Clicks</th>

                <th className="px-3 py-3 text-right">Impressions</th>

                <th className="px-3 py-3 text-right">CTR</th>

                <th className="px-3 py-3 text-right">Position</th>
              </tr>
            </thead>

            <tbody>
              {pages.slice(0, 20).map((row) => (
                <tr
                  key={row.page}
                  className="border-b border-slate-50 last:border-0"
                >
                  <td className="max-w-[640px] px-3 py-3">
                    <div className="truncate font-semibold text-slate-800">
                      {shortPage(row.page)}
                    </div>
                  </td>

                  <td className="px-3 py-3 text-right font-semibold text-slate-800">
                    {formatNumber(row.clicks)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatNumber(row.impressions)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatFractionPercent(row.ctr)}
                  </td>

                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatDecimal(row.avg_position, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===================================================



          COUNTRY / DEVICE



      =================================================== */}

      <div
        className="seo-breakdown-grid 



          mt-4



          grid



          gap-4



          xl:grid-cols-2



        "
      >
        <PerformanceTableCard
          eyebrow="Geography"
          title="Country performance"
          icon={<Globe2 size={18} />}
          labelHeader="Country"
          rows={countries.map((row) => ({
            label: countryLabel(row.country),

            clicks: row.clicks,

            impressions: row.impressions,

            ctr: row.ctr,

            position: row.avg_position,
          }))}
        />

        <PerformanceTableCard
          eyebrow="Devices"
          title="Device performance"
          icon={<Smartphone size={18} />}
          labelHeader="Device"
          rows={devices.map((row) => ({
            label: pretty(row.device),

            clicks: row.clicks,

            impressions: row.impressions,

            ctr: row.ctr,

            position: row.avg_position,
          }))}
        />
      </div>

      {/* ===================================================



          SEARCH APPEARANCE



      =================================================== */}

      <section className="seo-appearance-card card-pad mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">SERP features</div>

            <div className="section-title mt-1">Search appearance</div>
          </div>

          <Laptop size={19} className="text-slate-400" />
        </div>

        <div
          className="



            mt-5



            grid



            gap-3



            sm:grid-cols-2



            xl:grid-cols-3



          "
        >
          {appearances.length === 0 ? (
            <div className="text-sm text-slate-400">
              No search appearance data available for this period.
            </div>
          ) : (
            appearances.map((row) => (
              <div
                key={row.search_appearance}
                className="



                    rounded-xl



                    border



                    border-slate-100



                    bg-slate-50



                    p-4



                  "
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {pretty(row.search_appearance)}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <MiniStat label="Clicks" value={formatNumber(row.clicks)} />

                  <MiniStat
                    label="Impressions"
                    value={formatNumber(row.impressions)}
                  />

                  <MiniStat
                    label="CTR"
                    value={formatFractionPercent(row.ctr)}
                  />

                  <MiniStat
                    label="Position"
                    value={formatDecimal(row.avg_position, 1)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ===================================================



          SYNC HEALTH



      =================================================== */}

      <section className="seo-sync-card card-pad mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Data health</div>

            <div className="section-title mt-1">Search Console sync status</div>
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
            label="Latest GSC date"
            value={
              health.latest_gsc_date ? formatDate(health.latest_gsc_date) : "—"
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
            icon={<Search size={17} />}
            label="Query rows"
            value={formatNumber(health.query_rows)}
          />

          <MetricCard
            icon={<FileSearch size={17} />}
            label="Page rows"
            value={formatNumber(health.page_rows)}
          />
        </div>

        <div className="seo-table-wrap mt-5 overflow-x-auto">
          <table className="seo-data-table min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-3">Status</th>

                <th className="px-3 py-3">Trigger</th>

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
                    <SyncStatusBadge status={run.status} />
                  </td>

                  <td className="px-3 py-3 text-slate-600">
                    {pretty(run.triggered_by)}
                  </td>

                  <td className="px-3 py-3 text-slate-600">
                    {formatDate(run.start_date)}

                    {" → "}

                    {formatDate(run.end_date)}
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
    </div>
  );
}

/* =========================================================



   COMPONENTS



\\========================================================= */

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
    <div className="seo-metric-card rounded-xl bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        {icon}

        {label}
      </div>

      <div className="mt-2 text-xl font-semibold text-slate-800">{value}</div>

      {sub && (
        <div className="mt-1 text-[11px] leading-4 text-slate-400">{sub}</div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="seo-mini-label text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-1 text-sm font-semibold text-slate-700">{value}</div>
    </div>
  );
}

function ProgressBar({
  value,

  max,

  muted = false,
}: {
  value: number;

  max: number;

  muted?: boolean;
}) {
  const width = Math.max(1, Math.min(100, (value / Math.max(max, 1)) * 100));

  return (
    <div className="seo-progress-track h-1.5 overflow-hidden rounded-full bg-slate-100">
      <div
        className={
          muted
            ? "seo-progress-fill seo-progress-fill-muted h-full rounded-full bg-slate-300"
            : "seo-progress-fill h-full rounded-full bg-slate-700"
        }
        style={{
          width: `${width}%`,
        }}
      />
    </div>
  );
}

function OpportunityBadge({ type }: { type: string }) {
  const normalized = String(type || "");

  const label =
    normalized === "low_ctr_page_1"
      ? "Page 1 · Low CTR"
      : normalized === "striking_distance"
        ? "Striking distance"
        : normalized === "high_impressions_low_rank"
          ? "High demand"
          : pretty(normalized);

  return (
    <span
      className="



        seo-opportunity-badge



        inline-flex



        rounded-full



        bg-white



        px-2.5



        py-1



        text-[11px]



        font-semibold



        text-slate-600



        ring-1



        ring-inset



        ring-slate-200



      "
    >
      {label}
    </span>
  );
}

function SyncStatusBadge({ status }: { status: string }) {
  const normalized = String(status || "").toLowerCase();

  const className =
    normalized === "success"
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



        font-semibold



        ${className}



      `}
    >
      {pretty(status)}
    </span>
  );
}

function PerformanceTableCard({
  eyebrow,

  title,

  icon,

  labelHeader,

  rows,
}: {
  eyebrow: string;

  title: string;

  icon: ReactNode;

  labelHeader: string;

  rows: Array<{
    label: string;

    clicks: number | string | null;

    impressions: number | string | null;

    ctr: number | string | null;

    position: number | string | null;
  }>;
}) {
  return (
    <section className="seo-performance-card card-pad">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow">{eyebrow}</div>

          <div className="section-title mt-1">{title}</div>
        </div>

        <div className="text-slate-400">{icon}</div>
      </div>

      <div className="seo-table-wrap mt-5 overflow-x-auto">
        <table className="seo-data-table min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-3">{labelHeader}</th>

              <th className="px-3 py-3 text-right">Clicks</th>

              <th className="px-3 py-3 text-right">Impressions</th>

              <th className="px-3 py-3 text-right">CTR</th>

              <th className="px-3 py-3 text-right">Position</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.label}-${index}`}
                className="border-b border-slate-50 last:border-0"
              >
                <td className="px-3 py-3 font-semibold text-slate-700">
                  {row.label}
                </td>

                <td className="px-3 py-3 text-right font-semibold text-slate-800">
                  {formatNumber(row.clicks)}
                </td>

                <td className="px-3 py-3 text-right text-slate-600">
                  {formatNumber(row.impressions)}
                </td>

                <td className="px-3 py-3 text-right text-slate-600">
                  {formatFractionPercent(row.ctr)}
                </td>

                <td className="px-3 py-3 text-right text-slate-600">
                  {formatDecimal(row.position, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* =========================================================



   PERIOD COMPARISON



\\========================================================= */

function calculatePeriodComparison(rows: DailyRow[]) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 2) {
    return {
      clicksChange: 0,

      impressionsChange: 0,

      ctrChange: 0,

      positionChange: 0,
    };
  }

  const split = Math.floor(sorted.length / 2);

  const previous = sorted.slice(0, split);

  const current = sorted.slice(split);

  const previousTotals = summarizePeriod(previous);

  const currentTotals = summarizePeriod(current);

  return {
    clicksChange: relativeChange(currentTotals.clicks, previousTotals.clicks),

    impressionsChange: relativeChange(
      currentTotals.impressions,

      previousTotals.impressions,
    ),

    ctrChange: relativeChange(currentTotals.ctr, previousTotals.ctr),

    /*



     * Negative is improvement because a lower average



     * Search Console position is better.



     */

    positionChange: currentTotals.position - previousTotals.position,
  };
}

function summarizePeriod(rows: DailyRow[]) {
  const clicks = rows.reduce((total, row) => total + toNumber(row.clicks), 0);

  const impressions = rows.reduce(
    (total, row) => total + toNumber(row.impressions),

    0,
  );

  const ctr = impressions > 0 ? clicks / impressions : 0;

  const weightedPositionNumerator = rows.reduce(
    (total, row) =>
      total + toNumber(row.avg_position) * toNumber(row.impressions),

    0,
  );

  const position =
    impressions > 0 ? weightedPositionNumerator / impressions : 0;

  return {
    clicks,

    impressions,

    ctr,

    position,
  };
}

/* =========================================================



   HELPERS



\\========================================================= */

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}

function relativeChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return ((current - previous) / previous) * 100;
}

function comparisonText(value: number, suffix: string) {
  const sign = value > 0 ? "+" : "";

  return `${sign}${value.toFixed(1)}% ${suffix}`;
}

function positionComparisonText(value: number) {
  if (Math.abs(value) < 0.05) {
    return "Position essentially unchanged";
  }

  if (value < 0) {
    return `${Math.abs(value).toFixed(1)} positions better vs previous period`;
  }

  return `${value.toFixed(1)} positions lower vs previous period`;
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatDecimal(value: number | string | null | undefined, digits = 1) {
  return toNumber(value).toFixed(digits);
}

function formatFractionPercent(value: number | string | null | undefined) {
  return `${(toNumber(value) * 100).toFixed(1)}%`;
}

function formatHundredPercent(value: number | string | null | undefined) {
  return `${toNumber(value).toFixed(1)}%`;
}

function formatMoney(
  value: number | string | null | undefined,

  currency: string,
) {
  const code = String(currency || "INR").toUpperCase();

  return new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-US", {
    style: "currency",

    currency: code,

    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",

    month: "short",

    year: "numeric",

    timeZone: "UTC",
  }).format(date);
}

function formatShortDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",

    month: "short",

    timeZone: "UTC",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",

    month: "short",

    hour: "numeric",

    minute: "2-digit",

    timeZone: "Asia/Kolkata",
  }).format(date);
}

function pretty(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return String(value)
    .replaceAll("_", " ")

    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortPage(value: string) {
  try {
    const url = new URL(value);

    return url.pathname + url.search || "/";
  } catch {
    return value;
  }
}

function countryLabel(value: string) {
  if (!value) {
    return "Unknown";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "unknown" || normalized === "(not set)") {
    return "Unknown";
  }

  if (/^[a-z]{3}$/.test(normalized)) {
    try {
      const displayNames = new Intl.DisplayNames(["en"], {
        type: "region",
      });

      /*



       * GSC usually stores ISO alpha-3 country codes.



       * Intl.DisplayNames expects alpha-2, so keep alpha-3 readable



       * instead of presenting an incorrect country name.



       */

      return normalized.toUpperCase();
    } catch {
      return normalized.toUpperCase();
    }
  }

  return pretty(value);
}
