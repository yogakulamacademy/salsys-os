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

    keywordIntelligence,

    keywordSummary,

    contentSummary,

    contentPageActions,

    contentGaps,

    internalLinkOpportunities,

    contentWarning,

    revenueOverview,

    revenueSummary,

    revenueValuePages,

    revenueTrafficGaps,

    revenueWarning,

    aeoSummary,

    aeoAnswerClasses,

    aeoQueryOpportunities,

    aeoPageReadiness,

    aeoWarning,

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

  const contentDecisionActions = contentPageActions
    .filter((row) => row.recommended_action !== "crawl_page")
    .slice(0, 12);

  const crawlCoveragePercent =
    toNumber(contentSummary.total_pages) > 0
      ? Math.round(
          (toNumber(contentSummary.crawled_pages) /
            toNumber(contentSummary.total_pages)) *
            100,
        )
      : 0;

  const aeoCrawlCoveragePercent =
    toNumber(aeoSummary.total_pages) > 0
      ? Math.round(
          (toNumber(aeoSummary.crawled_pages) /
            toNumber(aeoSummary.total_pages)) *
            100,
        )
      : 0;

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

          REVENUE-AWARE ORGANIC INTELLIGENCE

      =================================================== */}

      <section className="seo-table-card card-pad mt-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="eyebrow">Revenue-aware organic intelligence</div>

            <div className="section-title mt-1">Which organic pages create business value?</div>

            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
              First-touch Google organic leads are mapped back to captured landing
              pages, then compared with Search Console visibility and paid revenue.
              INR and USD remain separate; no FX conversion or modeled revenue is
              introduced.
            </p>
          </div>

          <CircleDollarSign size={20} className="shrink-0 text-slate-400" />
        </div>

        {revenueWarning && (
          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-medium leading-5 text-amber-700">
            {revenueWarning}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KeywordSummaryCard
            label="Organic leads"
            value={formatNumber(revenueOverview.organic_leads)}
            sub={`${formatNumber(revenueSummary.pages_with_leads)} landing pages produced leads`}
            tone="emerald"
          />

          <KeywordSummaryCard
            label="Landing-page coverage"
            value={formatHundredPercent(revenueSummary.landing_page_attribution_coverage)}
            sub={`${formatNumber(revenueSummary.mapped_organic_leads)} of ${formatNumber(revenueOverview.organic_leads)} organic leads mapped`}
          />

          <KeywordSummaryCard
            label="High-traffic gaps"
            value={formatNumber(revenueSummary.high_traffic_without_leads)}
            sub="10+ organic clicks with no observed first-touch lead"
            tone="amber"
          />

          <KeywordSummaryCard
            label="Observed organic revenue"
            value={`${formatMoney(revenueOverview.organic_revenue_inr, "INR")} · ${formatMoney(
              revenueOverview.organic_revenue_usd,
              "USD",
            )}`}
            sub={`${formatNumber(revenueSummary.pages_with_revenue)} landing pages with paid revenue`}
          />
        </div>

        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
          <span className="font-semibold text-slate-600">Current evidence:</span>{" "}
          {formatNumber(revenueOverview.organic_qualified_leads)} qualified ·{" "}
          {formatNumber(revenueOverview.organic_enrolled_leads)} enrolled ·{" "}
          {formatNumber(revenueSummary.pages_with_revenue)} revenue-producing landing
          pages in the latest finalized 30-day window. Zero is treated as observed
          absence, not estimated missing revenue.
        </div>

        <div className="mt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Organic value pages
              </div>

              <div className="mt-1 text-sm font-semibold text-slate-800">
                Pages that have already produced first-touch organic leads
              </div>
            </div>

            <div className="text-xs text-slate-400">
              Ranked by observed business value + search upside
            </div>
          </div>

          {revenueValuePages.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-400">
              No landing-page-level organic business signals are available yet.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {revenueValuePages.slice(0, 8).map((row) => (
                <article
                  key={row.page_id}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <RevenueSignalBadge type={row.business_value_signal} />

                        <span className="text-xs text-slate-400">
                          priority {formatNumber(row.revenue_priority_score_v1)}
                        </span>

                        <span className="text-xs text-slate-400">
                          {pretty(row.recommended_action)}
                        </span>
                      </div>

                      <div className="mt-2 truncate text-sm font-semibold text-slate-800">
                        {row.title || shortPage(row.normalized_url)}
                      </div>

                      <div
                        className="mt-1 truncate text-xs text-slate-400"
                        title={row.normalized_url}
                      >
                        {shortPage(row.normalized_url)}
                      </div>
                    </div>

                    <div className="grid shrink-0 grid-cols-4 gap-5 text-right">
                      <MiniStat label="Clicks" value={formatNumber(row.gsc_clicks)} />
                      <MiniStat label="Leads" value={formatNumber(row.organic_leads)} />
                      <MiniStat
                        label="Position"
                        value={formatDecimal(row.gsc_avg_position, 1)}
                      />
                      <MiniStat
                        label="Lead rate"
                        value={formatHundredPercent(row.click_to_lead_rate_directional)}
                      />
                    </div>
                  </div>

                  <div className="mt-3 text-xs leading-5 text-slate-500">
                    {row.recommendation}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="mt-7 border-t border-slate-100 pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Traffic without observed leads
              </div>

              <div className="mt-1 text-sm font-semibold text-slate-800">
                Search visibility that is not yet translating into first-touch leads
              </div>
            </div>

            <div className="text-xs text-slate-400">
              Review intent and conversion path before chasing more traffic
            </div>
          </div>

          {revenueTrafficGaps.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-400">
              No high-traffic organic conversion gaps are observed.
            </div>
          ) : (
            <div className="seo-table-wrap mt-4 overflow-x-auto">
              <table className="seo-data-table min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-3">Page</th>
                    <th className="px-3 py-3 text-right">Clicks</th>
                    <th className="px-3 py-3 text-right">Impressions</th>
                    <th className="px-3 py-3 text-right">Position</th>
                    <th className="px-3 py-3">Recommended action</th>
                  </tr>
                </thead>

                <tbody>
                  {revenueTrafficGaps.slice(0, 10).map((row) => (
                    <tr
                      key={row.page_id}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="max-w-[520px] px-3 py-3">
                        <div className="truncate font-semibold text-slate-800">
                          {row.title || shortPage(row.normalized_url)}
                        </div>
                        <div
                          className="mt-1 truncate text-xs text-slate-400"
                          title={row.normalized_url}
                        >
                          {shortPage(row.normalized_url)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">
                        {formatNumber(row.gsc_clicks)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600">
                        {formatNumber(row.gsc_impressions)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600">
                        {formatDecimal(row.gsc_avg_position, 1)}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500">
                        {row.recommendation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ===================================================

          ANSWER ENGINE INTELLIGENCE

      =================================================== */}

      <section className="seo-table-card card-pad mt-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="eyebrow">Answer Engine intelligence</div>

            <div className="section-title mt-1">
              Which questions can we answer better?
            </div>

            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
              Deterministic AEO signals from observed Search Console demand,
              current leader pages, crawl evidence, answer-oriented headings,
              topic/entity coverage and structured data. This layer does not
              generate answers or assume schema markup improves visibility by
              itself.
            </p>
          </div>

          <Target size={20} className="shrink-0 text-slate-400" />
        </div>

        {aeoWarning && (
          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-medium leading-5 text-amber-700">
            {aeoWarning}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KeywordSummaryCard
            label="Answer demand"
            value={formatNumber(aeoSummary.answer_queries)}
            sub={`${formatNumber(aeoSummary.answer_impressions)} observed impressions`}
            tone="emerald"
          />

          <KeywordSummaryCard
            label="High-opportunity queries"
            value={formatNumber(aeoSummary.high_opportunity_queries)}
            sub={`${formatNumber(aeoSummary.striking_answer_queries)} striking-distance answer queries`}
            tone="amber"
          />

          <KeywordSummaryCard
            label="Answer sections"
            value={formatNumber(aeoSummary.pages_with_answer_sections)}
            sub={`${formatNumber(aeoSummary.crawled_pages)} of ${formatNumber(aeoSummary.total_pages)} pages crawled`}
          />

          <KeywordSummaryCard
            label="Answer-specific schema"
            value={formatNumber(aeoSummary.answer_specific_schema_pages)}
            sub="Observed FAQPage / HowTo markup; not required by default"
          />
        </div>

        <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-700">
          Coverage guardrail: {formatNumber(aeoSummary.uncrawled_pages)} of {formatNumber(
            aeoSummary.total_pages,
          )} discovered pages do not yet have crawl evidence ({aeoCrawlCoveragePercent}%
          observed). AEO readiness is evidence-based only. FAQPage or HowTo
          markup should be considered only when the visible content genuinely
          supports it.
        </div>

        <div className="mt-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Answer opportunities
              </div>

              <div className="mt-1 text-sm font-semibold text-slate-800">
                Search demand where a clearer direct answer may improve usefulness
              </div>
            </div>

            <div className="text-xs text-slate-400">
              {formatNumber(aeoSummary.pages_with_high_opportunity_demand)} leader pages with high-opportunity demand
            </div>
          </div>

          {aeoQueryOpportunities.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-400">
              No answer-seeking query evidence is available yet.
            </div>
          ) : (
            <div className="seo-table-wrap mt-4 overflow-x-auto">
              <table className="seo-data-table min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-3">Query</th>
                    <th className="px-3 py-3">Class</th>
                    <th className="px-3 py-3 text-right">Impressions</th>
                    <th className="px-3 py-3 text-right">Position</th>
                    <th className="px-3 py-3 text-right">Score</th>
                    <th className="px-3 py-3">Current leader</th>
                  </tr>
                </thead>

                <tbody>
                  {aeoQueryOpportunities.slice(0, 12).map((row) => (
                    <tr
                      key={`${row.query}-${row.leader_page}`}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="max-w-[360px] px-3 py-3">
                        <div className="font-semibold text-slate-800">
                          {row.query}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          {formatAeoAction(row.recommended_action)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <AeoClassBadge type={row.answer_class} />
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">
                        {formatNumber(row.impressions)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-600">
                        {formatDecimal(row.avg_position, 1)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700">
                        {formatNumber(row.answer_opportunity_score_v1)}
                      </td>
                      <td className="max-w-[320px] px-3 py-3">
                        <div
                          className="truncate text-xs font-medium text-slate-600"
                          title={row.leader_page}
                        >
                          {shortPage(row.leader_page)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-7 border-t border-slate-100 pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Demand mix
              </div>

              <div className="mt-1 text-sm font-semibold text-slate-800">
                What people are asking search engines to resolve
              </div>
            </div>

            <div className="text-xs text-slate-400">
              {formatNumber(aeoSummary.answer_clicks)} observed clicks across answer demand
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {aeoAnswerClasses.slice(0, 8).map((row) => (
              <div
                key={row.answer_class}
                className="rounded-xl border border-slate-100 bg-slate-50 p-4"
              >
                <AeoClassBadge type={row.answer_class} />
                <div className="mt-3 text-lg font-semibold text-slate-800">
                  {formatNumber(row.query_count)} queries
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {formatNumber(row.impressions)} impressions · {formatNumber(
                    row.high_opportunity_queries,
                  )} high opportunity
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-7 border-t border-slate-100 pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Page readiness
              </div>

              <div className="mt-1 text-sm font-semibold text-slate-800">
                Crawled pages where answer structure and semantic clarity can improve
              </div>
            </div>

            <div className="text-xs text-slate-400">
              {formatNumber(aeoSummary.priority_page_actions)} priority page actions
            </div>
          </div>

          {aeoPageReadiness.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-400">
              No crawled AEO page-readiness evidence is available yet.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {aeoPageReadiness.slice(0, 10).map((row) => (
                <article
                  key={row.page_id}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <AeoActionBadge type={row.recommended_action} />
                    <span className="text-xs text-slate-400">
                      readiness {formatNumber(row.answer_readiness_score_v1)}
                    </span>
                    <span className="text-xs text-slate-400">
                      priority {formatNumber(row.action_priority)}
                    </span>
                  </div>

                  <div className="mt-2 truncate text-sm font-semibold text-slate-800">
                    {row.title || shortPage(row.normalized_url)}
                  </div>

                  <div
                    className="mt-1 truncate text-xs text-slate-400"
                    title={row.normalized_url}
                  >
                    {shortPage(row.normalized_url)}
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-3">
                    <MiniStat
                      label="Queries"
                      value={formatNumber(row.answer_query_count)}
                    />
                    <MiniStat
                      label="Impressions"
                      value={formatNumber(row.answer_impressions)}
                    />
                    <MiniStat
                      label="Answer sections"
                      value={formatNumber(row.answer_heading_count)}
                    />
                    <MiniStat
                      label="Semantic"
                      value={formatNumber(row.semantic_coverage_score_v1)}
                    />
                  </div>

                  <div className="mt-3 text-xs leading-5 text-slate-500">
                    {row.recommendation}
                  </div>
                </article>
              ))}
            </div>
          )}
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



          KEYWORD + SERP INTELLIGENCE



      =================================================== */}

      <section className="seo-table-card card-pad mt-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="eyebrow">SERP intelligence</div>

            <div className="section-title mt-1">Query → page overlap</div>

            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
              Observed Search Console overlap across the latest 30 finalized
              days. Multi-page visibility is not automatically
              cannibalization: branded coverage and clear leaders are
              separated from queries that need review.
            </p>
          </div>

          <FileSearch size={20} className="shrink-0 text-slate-400" />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KeywordSummaryCard
            label="Observed overlaps"
            value={formatNumber(keywordSummary.overlap_queries)}
            sub={`${formatNumber(
              keywordSummary.high_impression_overlaps,
            )} with 50+ impressions`}
          />

          <KeywordSummaryCard
            label="Likely cannibalization"
            value={formatNumber(keywordSummary.likely_cannibalization)}
            sub="Highest-priority overlap signals"
            tone="rose"
          />

          <KeywordSummaryCard
            label="Needs review"
            value={formatNumber(keywordSummary.needs_review)}
            sub="Meaningful visibility split"
            tone="amber"
          />

          <KeywordSummaryCard
            label="Branded coverage"
            value={formatNumber(keywordSummary.branded_coverage)}
            sub="Excluded from cannibalization"
            tone="emerald"
          />
        </div>

        {keywordIntelligence.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-400">
            Page + query intelligence is not available yet.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {keywordIntelligence.slice(0, 16).map((row) => (
              <article
                key={`${row.site_url}-${row.query}`}
                className="rounded-xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <KeywordSignalBadge type={row.signal_type} />

                      <span className="text-xs text-slate-400">
                        {formatNumber(row.impressions)} impressions
                      </span>

                      <span className="text-xs text-slate-400">
                        {formatNumber(row.page_count)} ranking pages
                      </span>

                      <span className="text-xs text-slate-400">
                        position {formatDecimal(row.avg_position, 1)}
                      </span>
                    </div>

                    <div className="mt-2 text-sm font-semibold text-slate-800">
                      {row.query}
                    </div>
                  </div>

                  <div className="grid shrink-0 grid-cols-3 gap-5 text-right">
                    <MiniStat
                      label="Clicks"
                      value={formatNumber(row.clicks)}
                    />

                    <MiniStat
                      label="CTR"
                      value={formatFractionPercent(row.ctr)}
                    />

                    <MiniStat
                      label="Active days"
                      value={formatNumber(row.active_days)}
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Current leader
                      </span>

                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {pretty(row.leader_surface)}
                      </span>
                    </div>

                    <div
                      className="mt-2 truncate text-xs font-semibold text-slate-700"
                      title={row.leader_page}
                    >
                      {shortPage(row.leader_page)}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span>
                        {formatNumber(row.leader_impressions)} impressions
                      </span>

                      <span>
                        {formatFractionPercent(row.leader_share)} share
                      </span>

                      <span>
                        position{" "}
                        {formatDecimal(row.leader_avg_position, 1)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Secondary page
                      </span>

                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {pretty(row.runner_up_surface)}
                      </span>
                    </div>

                    <div
                      className="mt-2 truncate text-xs font-semibold text-slate-700"
                      title={row.runner_up_page || undefined}
                    >
                      {row.runner_up_page
                        ? shortPage(row.runner_up_page)
                        : "—"}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span>
                        {formatNumber(row.runner_up_impressions)} impressions
                      </span>

                      <span>
                        {formatFractionPercent(row.runner_up_share)} share
                      </span>

                      <span>
                        position{" "}
                        {formatDecimal(row.runner_up_avg_position, 1)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs leading-5 text-slate-500">
                  {row.recommendation}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ===================================================

          CONTENT INTELLIGENCE

      =================================================== */}

      <section className="seo-table-card card-pad mt-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="eyebrow">Content intelligence</div>

            <div className="section-title mt-1">What should we improve next?</div>

            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
              Deterministic recommendations from crawl evidence, Search Console,
              semantic mappings, technical signals and the internal-link graph.
              Content gaps are treated as evidence to review, not automatic
              instructions to publish a new page.
            </p>
          </div>

          <Target size={20} className="shrink-0 text-slate-400" />
        </div>

        {contentWarning && (
          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-medium leading-5 text-amber-700">
            {contentWarning}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KeywordSummaryCard
            label="Crawl evidence"
            value={`${formatNumber(contentSummary.crawled_pages)} / ${formatNumber(
              contentSummary.total_pages,
            )}`}
            sub={`${crawlCoveragePercent}% of discovered pages have observed crawl snapshots`}
          />

          <KeywordSummaryCard
            label="Potential new content"
            value={formatNumber(contentSummary.create_content_topics)}
            sub="Demand-backed topics with no mapped crawled page"
            tone="amber"
          />

          <KeywordSummaryCard
            label="Expand topic"
            value={formatNumber(contentSummary.expand_topic_topics)}
            sub="Demand-backed topics relying on one mapped page"
          />

          <KeywordSummaryCard
            label="Internal-link opportunities"
            value={formatNumber(contentSummary.internal_link_opportunities)}
            sub="Semantic source → target opportunities"
            tone="emerald"
          />
        </div>

        {toNumber(contentSummary.uncrawled_pages) > 0 && (
          <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-700">
            <span className="font-semibold">Coverage guardrail:</span>{" "}
            {formatNumber(contentSummary.uncrawled_pages)} discovered pages do
            not yet have crawl snapshots. “Potential new content” means no
            mapped crawled page was observed; it does not prove that a relevant
            page does not already exist. Complete crawl coverage before acting
            on those suggestions.
          </div>
        )}

        <div className="mt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Priority page actions
              </div>

              <div className="mt-1 text-sm font-semibold text-slate-800">
                Improve observed pages before creating duplicates
              </div>
            </div>

            <div className="text-xs text-slate-400">
              {formatNumber(contentDecisionActions.length)} shown ·{" "}
              {formatNumber(contentSummary.uncrawled_pages)} awaiting crawl
              evidence
            </div>
          </div>

          {contentDecisionActions.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-400">
              No observed page actions are available yet.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {contentDecisionActions.map((row) => (
                <article
                  key={row.page_id}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <ContentActionBadge type={row.recommended_action} />

                        <span className="text-xs text-slate-400">
                          priority {formatNumber(row.action_priority_score)}
                        </span>

                        <span className="text-xs text-slate-400">
                          {formatNumber(row.gsc_impressions)} impressions
                        </span>
                      </div>

                      <div className="mt-2 truncate text-sm font-semibold text-slate-800">
                        {row.title || shortPage(row.normalized_url)}
                      </div>

                      <div
                        className="mt-1 truncate text-xs text-slate-400"
                        title={row.normalized_url}
                      >
                        {shortPage(row.normalized_url)}
                      </div>
                    </div>

                    <div className="grid shrink-0 grid-cols-3 gap-5 text-right">
                      <MiniStat
                        label="Position"
                        value={formatDecimal(row.gsc_avg_position, 1)}
                      />

                      <MiniStat
                        label="Semantic"
                        value={formatNumber(row.semantic_coverage_score_v1)}
                      />

                      <MiniStat
                        label="Link gaps"
                        value={formatNumber(row.internal_link_opportunities)}
                      />
                    </div>
                  </div>

                  <div className="mt-3 text-xs leading-5 text-slate-500">
                    {row.action_reason}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="mt-7 border-t border-slate-100 pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Topic coverage
              </div>

              <div className="mt-1 text-sm font-semibold text-slate-800">
                Demand-backed content gaps
              </div>
            </div>

            <div className="text-xs text-slate-400">
              Search demand + semantic coverage
            </div>
          </div>

          {contentGaps.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-400">
              No content-gap signals are available yet.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {contentGaps.slice(0, 10).map((row) => (
                <article
                  key={row.topic_id}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ContentGapBadge type={row.gap_type} />

                    <span className="text-xs text-slate-400">
                      priority {formatNumber(row.priority_score_v1)}
                    </span>

                    <span className="text-xs text-slate-400">
                      {pretty(row.topic_type)}
                    </span>
                  </div>

                  <div className="mt-2 text-sm font-semibold text-slate-800">
                    {row.topic_name}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <MiniStat
                      label="Impressions"
                      value={formatNumber(row.gsc_impressions)}
                    />

                    <MiniStat
                      label="Queries"
                      value={formatNumber(row.query_count)}
                    />

                    <MiniStat
                      label="Mapped pages"
                      value={formatNumber(row.mapped_pages)}
                    />
                  </div>

                  {Array.isArray(row.top_queries) &&
                    row.top_queries.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {row.top_queries.slice(0, 3).map((query) => (
                          <span
                            key={query.query}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600"
                          >
                            {query.query} ·{" "}
                            {formatNumber(query.impressions)} imp.
                          </span>
                        ))}
                      </div>
                    )}

                  <div className="mt-3 text-xs leading-5 text-slate-500">
                    {row.recommendation}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="mt-7 border-t border-slate-100 pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Internal links
              </div>

              <div className="mt-1 text-sm font-semibold text-slate-800">
                Highest-confidence source → target opportunities
              </div>
            </div>

            <div className="text-xs text-slate-400">
              Top {formatNumber(Math.min(10, internalLinkOpportunities.length))}
            </div>
          </div>

          {internalLinkOpportunities.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-400">
              No internal-link opportunities are available yet.
            </div>
          ) : (
            <div className="seo-table-wrap mt-4 overflow-x-auto">
              <table className="seo-data-table min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3">Target</th>
                    <th className="px-3 py-3 text-right">Shared topics</th>
                    <th className="px-3 py-3 text-right">Confidence</th>
                    <th className="px-3 py-3 text-right">Score</th>
                  </tr>
                </thead>

                <tbody>
                  {internalLinkOpportunities.slice(0, 10).map((row) => (
                    <tr
                      key={`${row.source_page_id}-${row.target_page_id}`}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="max-w-[320px] px-3 py-3">
                        <div
                          className="truncate font-semibold text-slate-700"
                          title={row.source_url}
                        >
                          {shortPage(row.source_url)}
                        </div>
                      </td>

                      <td className="max-w-[320px] px-3 py-3">
                        <div
                          className="truncate font-semibold text-slate-700"
                          title={row.target_url}
                        >
                          {shortPage(row.target_url)}
                        </div>
                      </td>

                      <td className="px-3 py-3 text-right text-slate-600">
                        {formatNumber(row.shared_topic_count)}
                      </td>

                      <td className="px-3 py-3 text-right text-slate-600">
                        {formatFractionPercent(row.semantic_confidence)}
                      </td>

                      <td className="px-3 py-3 text-right font-semibold text-slate-800">
                        {formatNumber(row.opportunity_score_v1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

function KeywordSummaryCard({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "slate" | "rose" | "amber" | "emerald";
}) {
  const toneClass =
    tone === "rose"
      ? "border-rose-100 bg-rose-50"
      : tone === "amber"
        ? "border-amber-100 bg-amber-50"
        : tone === "emerald"
          ? "border-emerald-100 bg-emerald-50"
          : "border-slate-100 bg-slate-50";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-xl font-semibold text-slate-800">{value}</div>

      <div className="mt-1 text-[11px] leading-4 text-slate-500">{sub}</div>
    </div>
  );
}

function KeywordSignalBadge({ type }: { type: string }) {
  const normalized = String(type || "").toLowerCase();

  const label =
    normalized === "likely_cannibalization"
      ? "Likely cannibalization"
      : normalized === "needs_review"
        ? "Needs review"
        : normalized === "healthy_leader"
          ? "Healthy leader"
          : normalized === "branded_coverage"
            ? "Branded coverage"
            : normalized === "observed_overlap"
              ? "Observed overlap"
              : pretty(normalized);

  const className =
    normalized === "likely_cannibalization"
      ? "bg-rose-50 text-rose-700 ring-rose-100"
      : normalized === "needs_review"
        ? "bg-amber-50 text-amber-700 ring-amber-100"
        : normalized === "healthy_leader"
          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
          : normalized === "branded_coverage"
            ? "bg-sky-50 text-sky-700 ring-sky-100"
            : "bg-white text-slate-600 ring-slate-200";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}

function RevenueSignalBadge({ type }: { type: string }) {
  const normalized = String(type || "");

  const label =
    normalized === "revenue_proven"
      ? "Revenue proven"
      : normalized === "enrollment_proven"
        ? "Enrollment proven"
        : normalized === "qualified_demand"
          ? "Qualified demand"
          : normalized === "lead_demand"
            ? "Lead demand"
            : normalized === "traffic_without_leads"
              ? "Traffic gap"
              : pretty(normalized);

  const classes =
    normalized === "revenue_proven" || normalized === "enrollment_proven"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "qualified_demand" || normalized === "lead_demand"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${classes}`}
    >
      {label}
    </span>
  );
}


function AeoClassBadge({ type }: { type: string }) {
  const normalized = String(type || "").toLowerCase();

  const label =
    normalized === "direct_question"
      ? "Direct question"
      : normalized === "location_discovery"
        ? "Location"
        : normalized === "comparison_choice"
          ? "Comparison"
          : normalized === "eligibility_certification"
            ? "Eligibility / certification"
            : normalized === "cost_fees"
              ? "Cost / fees"
              : normalized === "duration_schedule"
                ? "Duration / schedule"
                : normalized === "informational_discovery"
                  ? "Informational"
                  : pretty(normalized);

  const classes =
    normalized === "direct_question"
      ? "border-violet-200 bg-violet-50 text-violet-700"
      : normalized === "cost_fees" || normalized === "eligibility_certification"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : normalized === "location_discovery"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-sky-200 bg-sky-50 text-sky-700";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${classes}`}
    >
      {label}
    </span>
  );
}

function AeoActionBadge({ type }: { type: string }) {
  const normalized = String(type || "").toLowerCase();
  const important =
    normalized === "add_direct_answers" ||
    normalized === "strengthen_answer_sections" ||
    normalized === "strengthen_semantic_clarity";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        important
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-sky-200 bg-sky-50 text-sky-700"
      }`}
    >
      {formatAeoAction(normalized)}
    </span>
  );
}

function formatAeoAction(value: string) {
  const normalized = String(value || "").toLowerCase();

  return normalized === "strengthen_answer"
    ? "Strengthen answer"
    : normalized === "improve_answer_match"
      ? "Improve answer match"
      : normalized === "clarify_answer_owner"
        ? "Clarify answer owner"
        : normalized === "review_answer_coverage"
          ? "Review answer coverage"
          : normalized === "add_direct_answers"
            ? "Add direct answers"
            : normalized === "strengthen_semantic_clarity"
              ? "Strengthen semantic clarity"
              : normalized === "strengthen_answer_sections"
                ? "Strengthen answer sections"
                : normalized === "align_answer_sections"
                  ? "Align answer sections"
                  : normalized === "review_structured_data"
                    ? "Review structured data"
                    : normalized === "fix_indexability"
                      ? "Fix indexability"
                      : pretty(normalized);
}

function ContentActionBadge({ type }: { type: string }) {
  const normalized = String(type || "").toLowerCase();

  const label =
    normalized === "fix_indexability"
      ? "Fix indexability"
      : normalized === "improve_snippet"
        ? "Improve snippet"
        : normalized === "expand_content"
          ? "Expand content"
          : normalized === "strengthen_internal_links"
            ? "Strengthen internal links"
            : normalized === "improve_existing"
              ? "Improve existing"
              : normalized === "crawl_page"
                ? "Needs crawl"
                : pretty(normalized);

  const className =
    normalized === "fix_indexability"
      ? "bg-rose-50 text-rose-700 ring-rose-100"
      : normalized === "improve_snippet"
        ? "bg-amber-50 text-amber-700 ring-amber-100"
        : normalized === "expand_content"
          ? "bg-sky-50 text-sky-700 ring-sky-100"
          : normalized === "strengthen_internal_links"
            ? "bg-violet-50 text-violet-700 ring-violet-100"
            : normalized === "improve_existing"
              ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
              : "bg-white text-slate-600 ring-slate-200";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}

function ContentGapBadge({ type }: { type: string }) {
  const normalized = String(type || "").toLowerCase();

  const label =
    normalized === "create_content"
      ? "Potential new content"
      : normalized === "expand_topic"
        ? "Expand topic"
        : normalized === "restore_coverage"
          ? "Restore coverage"
          : pretty(normalized);

  const className =
    normalized === "create_content"
      ? "bg-amber-50 text-amber-700 ring-amber-100"
      : normalized === "restore_coverage"
        ? "bg-rose-50 text-rose-700 ring-rose-100"
        : normalized === "expand_topic"
          ? "bg-sky-50 text-sky-700 ring-sky-100"
          : "bg-white text-slate-600 ring-slate-200";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${className}`}
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
