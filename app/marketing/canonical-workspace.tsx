import Link from "next/link";
import {
  Activity,
  BarChart3,
  CircleDollarSign,
  GitBranch,
  Megaphone,
  Route,
  Search,
  Target,
} from "lucide-react";

import { AnalyticsExplorer } from "@/components/analytics-explorer";
import { AttributionIntelligenceExplorer } from "@/components/attribution-intelligence-explorer";
import { CampaignsIntelligenceWorkspace } from "@/components/campaigns-intelligence-workspace";
import type { CampaignWorkspaceFilters } from "@/components/campaigns-workspace";
import { FunnelIntelligenceWorkspaceV2 } from "@/components/funnel-intelligence-workspace-v2";
import { ExecutiveDecisionBrief } from "@/components/marketing/executive-decision-brief";
import { MarketingOverview } from "@/components/marketing/marketing-overview";
import { Notice, PageHeader } from "@/components/ui";
import { getAnalyticsWorkspace } from "@/lib/analytics-data";
import { getAttributionWorkspace } from "@/lib/attribution-data";
import { getCampaignsWorkspace } from "@/lib/campaigns-data";
import { buildAttributionIntelligence } from "@/lib/commercial-intelligence";
import { isMockMode } from "@/lib/data";
import {
  getFunnelIntelligenceWorkspace,
  type FunnelIntelligenceWorkspace as FunnelWorkspace,
} from "@/lib/funnel-intelligence-data";

type MarketingView = "overview" | "campaigns" | "analytics" | "funnel" | "attribution";

type MarketingPageProps = {
  searchParams: Promise<{
    view?: string;
    q?: string;
    platform?: string;
    outcome?: string;
    sort?: string;
    page?: string;
    course?: string;
    location?: string;
    country?: string;
    stage?: string;
  }>;
};

const PAGE_SIZE = 50;
const validViews = new Set<MarketingView>([
  "overview",
  "campaigns",
  "analytics",
  "funnel",
  "attribution",
]);

export default async function MarketingPage({ searchParams }: MarketingPageProps) {
  const query = await searchParams;
  const requestedView = (query.view || "overview") as MarketingView;
  const view = validViews.has(requestedView) ? requestedView : "overview";

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Growth / Marketing"
        title="Marketing"
        description="One workspace for acquisition quality, campaign performance, analytics, funnel movement and attribution evidence."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/paid-media-leads" className="btn-secondary">
              <Megaphone size={15} /> Acquisition leads
            </Link>
            <Link href="/seo" className="btn-secondary">
              <Search size={15} /> Search intelligence
            </Link>
            <Link href="/revenue" className="btn-primary">
              <CircleDollarSign size={15} /> Revenue
            </Link>
          </div>
        }
      />

      <MarketingTabs view={view} />

      {view === "overview" ? <MarketingOverview /> : null}
      {view === "campaigns" ? <CampaignsView query={query} /> : null}
      {view === "analytics" ? <AnalyticsView /> : null}
      {view === "funnel" ? <FunnelView /> : null}
      {view === "attribution" ? <AttributionView query={query} /> : null}
    </div>
  );
}

function MarketingTabs({ view }: { view: MarketingView }) {
  const tabs: Array<{
    value: MarketingView;
    label: string;
    icon: React.ReactNode;
  }> = [
    { value: "overview", label: "Overview", icon: <Activity size={13} /> },
    { value: "campaigns", label: "Campaigns", icon: <Target size={13} /> },
    { value: "analytics", label: "Analytics", icon: <BarChart3 size={13} /> },
    { value: "funnel", label: "Funnel", icon: <GitBranch size={13} /> },
    { value: "attribution", label: "Attribution", icon: <Route size={13} /> },
  ];

  return (
    <nav
      className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950"
      aria-label="Marketing workspace views"
    >
      <div className="flex min-w-max items-center gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === "overview" ? "/marketing" : `/marketing?view=${tab.value}`}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              view === tab.value
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
            }`}
          >
            {tab.icon}
            {tab.label}
          </Link>
        ))}
        <span className="mx-1 h-7 w-px bg-slate-200 dark:bg-slate-800" />
        <Link
          href="/paid-media-leads"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-900"
        >
          <Megaphone size={13} /> Acquisition
        </Link>
        <Link
          href="/seo"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-900"
        >
          <Search size={13} /> Search
        </Link>
      </div>
    </nav>
  );
}

async function CampaignsView({
  query,
}: {
  query: Awaited<MarketingPageProps["searchParams"]>;
}) {
  const filters = parseCampaignFilters(query);
  const workspace = await getCampaignsWorkspace(filters);
  const mock = isMockMode();

  return (
    <div className="space-y-4">
      <WorkspaceIntro
        eyebrow="Paid acquisition"
        title="Campaign performance"
        detail="Compare spend with qualified demand, enrollments and known revenue without leaving the Marketing workspace."
      />

      {workspace.googleError || workspace.metaError ? (
        <Notice tone="warning" title="Some paid-media evidence is temporarily unavailable">
          {[workspace.googleError ? `Google Ads: ${workspace.googleError}` : null, workspace.metaError ? `Meta Ads: ${workspace.metaError}` : null]
            .filter(Boolean)
            .join(" · ")}
        </Notice>
      ) : null}

      {workspace.warning ? (
        <Notice tone="warning">
          Campaign reporting is using a fallback path. Treat budget decisions as directional until the primary evidence path is healthy. {workspace.warning}
        </Notice>
      ) : null}

      <CampaignsIntelligenceWorkspace
        campaigns={workspace.campaigns}
        summary={workspace.summary}
        platforms={workspace.platforms}
        pagination={workspace.pagination}
        filters={filters}
        mock={mock}
      />
    </div>
  );
}

async function AnalyticsView() {
  const workspace = await getAnalyticsWorkspace();
  const { overview, sourceRows, landingRows, campaignRows, countryRows, reconciliation, health } = workspace;
  const brief = buildAnalyticsDecisionBrief(workspace);
  const dateRange =
    overview.range_start && overview.range_end
      ? `${formatDate(overview.range_start)} – ${formatDate(overview.range_end)}`
      : "Latest synced period";

  return (
    <div className="space-y-4">
      <WorkspaceIntro
        eyebrow="Traffic & behavior"
        title="Analytics"
        detail="Connect traffic and engagement with downstream CRM outcomes while keeping browser analytics and first-party identity distinct."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              {dateRange}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${health.latest_analytics_date ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400"}`}>
              <Activity size={12} />
              {health.latest_analytics_date ? `Synced ${formatDate(health.latest_analytics_date)}` : "Waiting for data"}
            </span>
          </div>
        }
      />

      <ExecutiveDecisionBrief
        eyebrow="Analytics decision brief"
        title={brief.title}
        summary={brief.summary}
        confidenceLabel={brief.confidenceLabel}
        confidenceDetail={brief.confidenceDetail}
        signals={brief.signals}
        actions={brief.actions}
      />

      {workspace.warning ? <Notice tone="warning">{workspace.warning}</Notice> : null}

      <AnalyticsExplorer
        overview={overview}
        reconciliation={reconciliation}
        sources={sourceRows}
        landing={landingRows}
        campaigns={campaignRows}
        countries={countryRows}
      />

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950">
        Data health · {health.latest_analytics_date ? `latest GA4 date ${formatDate(health.latest_analytics_date)}` : "waiting for GA4 data"} · {formatNumber(health.daily_rows)} daily rows · {formatNumber(health.landing_page_rows)} landing rows.
      </div>
    </div>
  );
}

async function FunnelView() {
  const workspace = await getFunnelIntelligenceWorkspace();
  const brief = buildFunnelDecisionBrief(workspace);

  return (
    <div className="space-y-4">
      <WorkspaceIntro
        eyebrow="Conversion"
        title="Funnel"
        detail="See where demand becomes revenue, where momentum is lost and which conversion step deserves investigation first."
      />

      {workspace.status.available && workspace.overview ? (
        <ExecutiveDecisionBrief
          title={brief.title}
          summary={brief.summary}
          confidenceLabel={brief.confidenceLabel}
          confidenceDetail={brief.confidenceDetail}
          signals={brief.signals}
          actions={brief.actions}
        />
      ) : null}

      <FunnelIntelligenceWorkspaceV2 workspace={workspace} />
    </div>
  );
}

async function AttributionView({
  query,
}: {
  query: Awaited<MarketingPageProps["searchParams"]>;
}) {
  const filters = {
    query: query.q?.trim() ?? "",
    course: query.course?.trim() || "all",
    location: query.location?.trim() || "all",
    country: query.country?.trim() || "all",
    stage: query.stage?.trim() || "all",
  };
  const { workspace, warning } = await getAttributionWorkspace(filters);
  const intelligence = buildAttributionIntelligence(workspace);

  return (
    <div className="space-y-4">
      <WorkspaceIntro
        eyebrow="Attribution"
        title="Source credit & evidence"
        detail="Compare attribution models, known-vs-unknown coverage and downstream outcomes in the same Marketing workspace."
      />

      <ExecutiveDecisionBrief
        eyebrow="Attribution decision brief"
        title={intelligence.summary}
        summary={buildAttributionNarrative(intelligence.readinessScore, intelligence.readinessDetail)}
        confidenceLabel={`${Math.round(intelligence.readinessScore)}/100 evidence readiness`}
        confidenceDetail={intelligence.methodology}
        signals={intelligence.signals.slice(0, 4).map((signal) => ({
          label: signal.label,
          value: signal.value,
          detail: signal.detail,
          tone: mapTone(signal.tone),
        }))}
        actions={intelligence.actions
          .filter((action) => action.href)
          .slice(0, 3)
          .map((action) => ({
            label: action.title,
            href: marketingActionHref(action.href!),
            detail: action.detail,
          }))}
      />

      <AttributionIntelligenceExplorer workspace={workspace} filters={filters} warning={warning} />
    </div>
  );
}

function WorkspaceIntro({
  eyebrow,
  title,
  detail,
  meta,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  meta?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">{eyebrow}</div>
        <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{detail}</p>
      </div>
      {meta ? <div className="shrink-0">{meta}</div> : null}
    </section>
  );
}

function parseCampaignFilters(query: Awaited<MarketingPageProps["searchParams"]>): CampaignWorkspaceFilters {
  const allowedOutcomes = new Set(["all", "with_leads", "no_leads", "qualified", "enrolled", "revenue"]);
  const allowedSorts = new Set(["spend_desc", "leads_desc", "qualified_desc", "enrolled_desc", "roas_desc", "cac_asc", "name"]);
  const outcome = allowedOutcomes.has(query.outcome ?? "") ? query.outcome! : "all";
  const sortMode = allowedSorts.has(query.sort ?? "") ? query.sort! : "spend_desc";
  const page = Number.parseInt(query.page ?? "1", 10);

  return {
    query: query.q?.trim() ?? "",
    platform: query.platform?.trim() || "all",
    outcome: outcome as CampaignWorkspaceFilters["outcome"],
    sortMode: sortMode as CampaignWorkspaceFilters["sortMode"],
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: PAGE_SIZE,
  };
}

function buildAnalyticsDecisionBrief(workspace: Awaited<ReturnType<typeof getAnalyticsWorkspace>>) {
  const overview = workspace.overview;
  const sessions = toNumber(overview.ga4_sessions);
  const engaged = toNumber(overview.ga4_engaged_sessions);
  const leads = toNumber(overview.crm_web_leads);
  const qualified = toNumber(overview.crm_qualified_leads);
  const enrolled = toNumber(overview.crm_enrolled_leads);
  const engagementRate = toRatePercent(overview.ga4_engagement_rate);
  const conversionRate = toRatePercent(overview.website_lead_conversion_rate);
  const bestSource = [...workspace.sourceRows].sort((a, b) => {
    if (b.enrolled !== a.enrolled) return b.enrolled - a.enrolled;
    if (b.qualified !== a.qualified) return b.qualified - a.qualified;
    return b.leads - a.leads;
  })[0];
  const hasFreshData = Boolean(workspace.health.latest_analytics_date);
  const crmSessions = toNumber(overview.crm_sessions);
  const sessionDelta = sessions > 0 && crmSessions > 0 ? (Math.abs(sessions - crmSessions) / Math.max(sessions, crmSessions)) * 100 : null;

  return {
    title: bestSource?.source
      ? `${pretty(bestSource.source)} is the strongest observed source by downstream CRM outcome.`
      : sessions > 0
        ? "Traffic is visible; downstream source evidence is still developing."
        : "Analytics evidence is waiting for a complete synced period.",
    summary: bestSource
      ? `${bestSource.leads.toLocaleString("en-IN")} CRM leads, ${bestSource.qualified.toLocaleString("en-IN")} qualified and ${bestSource.enrolled.toLocaleString("en-IN")} enrolled are currently associated with ${pretty(bestSource.source)}${bestSource.medium ? ` / ${pretty(bestSource.medium)}` : ""}. Compare traffic contribution with business outcomes rather than optimizing on sessions alone.`
      : "SalsysOS will surface source, landing-page, campaign and country patterns as connected analytics and CRM evidence becomes available.",
    confidenceLabel: hasFreshData ? "Synced analytics evidence" : "Sync evidence incomplete",
    confidenceDetail: sessionDelta == null
      ? "GA4 and CRM use different identity and session definitions. Reconciliation remains explicit instead of forcing the two systems to match."
      : `GA4 and CRM session totals differ by ${sessionDelta.toFixed(1)}% in the visible scope. This is a reconciliation signal, not automatically a tracking error.`,
    signals: [
      { label: "GA4 sessions", value: sessions.toLocaleString("en-IN"), detail: `${engaged.toLocaleString("en-IN")} engaged sessions · ${engagementRate == null ? "engagement unknown" : `${engagementRate.toFixed(1)}% engagement`}.`, tone: sessions > 0 ? ("positive" as const) : ("neutral" as const) },
      { label: "Website lead conversion", value: conversionRate == null ? "—" : `${conversionRate.toFixed(1)}%`, detail: `${leads.toLocaleString("en-IN")} CRM web leads from the current analytics scope.`, tone: conversionRate != null && conversionRate > 0 ? ("positive" as const) : ("neutral" as const) },
      { label: "Qualified outcomes", value: qualified.toLocaleString("en-IN"), detail: leads > 0 ? `${((qualified / leads) * 100).toFixed(1)}% of CRM web leads.` : "No valid lead denominator yet.", tone: qualified > 0 ? ("positive" as const) : ("neutral" as const) },
      { label: "Enrollments", value: enrolled.toLocaleString("en-IN"), detail: bestSource ? `${bestSource.enrolled.toLocaleString("en-IN")} currently associated with the strongest source.` : "No source leader yet.", tone: enrolled > 0 ? ("positive" as const) : ("neutral" as const) },
    ],
    actions: [
      { label: "Inspect funnel", href: "/marketing?view=funnel", detail: "See where traffic becomes CRM outcomes." },
      { label: "Compare attribution", href: "/marketing?view=attribution", detail: "Separate analytics source labels from attribution credit." },
      { label: "Review data coverage", href: "/tracking/data-coverage", detail: "Check evidence completeness before diagnosing differences." },
    ],
  };
}

function buildFunnelDecisionBrief(workspace: FunnelWorkspace) {
  if (!workspace.status.available || !workspace.overview) {
    return {
      title: "Funnel evidence is unavailable",
      summary: "SalsysOS is withholding funnel conclusions until the current cohort can be read safely.",
      confidenceLabel: "Evidence unavailable",
      confidenceDetail: "Unavailable reporting is not treated as zero performance.",
      signals: [],
      actions: [],
    };
  }

  const overview = workspace.overview;
  const businessJourney = workspace.journeys.find((journey) => journey.key === "business") ?? workspace.journeys[0];
  const drops = businessJourney
    ? businessJourney.stages.flatMap((stage, index) => {
        if (index === 0) return [];
        const previous = businessJourney.stages[index - 1];
        if (previous.unit !== stage.unit || previous.count <= 0) return [];
        const rate = (stage.count / previous.count) * 100;
        return [{ from: previous.label, to: stage.label, rate, lost: Math.max(0, previous.count - stage.count) }];
      })
    : [];
  const largestDrop = [...drops].sort((a, b) => a.rate - b.rate)[0] ?? null;
  const strongestSource = [...workspace.sources].sort((a, b) => {
    if (b.enrolled !== a.enrolled) return b.enrolled - a.enrolled;
    if (b.qualified !== a.qualified) return b.qualified - a.qualified;
    return b.leads - a.leads;
  })[0];
  const coverage = workspace.measurement?.first_touch_coverage ?? null;
  const coveragePct = coverage == null ? null : coverage <= 1 ? coverage * 100 : coverage;
  const enrolledRate = overview.leads > 0 ? (overview.enrolled / overview.leads) * 100 : null;
  const qualifiedRate = overview.leads > 0 ? (overview.qualified / overview.leads) * 100 : null;

  return {
    title: largestDrop ? `${largestDrop.from} → ${largestDrop.to} is the conversion step to investigate first.` : "The funnel is connected; focus on the strongest observed conversion evidence.",
    summary: largestDrop ? `${largestDrop.lost.toLocaleString("en-IN")} records are currently between those two comparable stages. SalsysOS is surfacing the observed gap, not assuming why it happened.` : "No comparable stage produces a clear dominant drop in the current cohort. Use source performance and measurement coverage to decide where to inspect next.",
    confidenceLabel: coveragePct == null ? "Coverage unknown" : `${coveragePct.toFixed(0)}% first-touch coverage`,
    confidenceDetail: coveragePct == null ? "The current read does not contain a reliable first-touch coverage denominator." : `${workspace.measurement?.known_first_touch.toLocaleString("en-IN") ?? 0} of ${workspace.measurement?.total_leads.toLocaleString("en-IN") ?? 0} leads have known first-touch evidence.`,
    signals: [
      { label: "Largest comparable drop", value: largestDrop ? `${largestDrop.rate.toFixed(1)}% continue` : "No dominant drop", detail: largestDrop ? `${largestDrop.from} → ${largestDrop.to}` : "No valid adjacent-stage denominator stands out.", tone: largestDrop && largestDrop.rate < 35 ? ("risk" as const) : ("watch" as const) },
      { label: "Lead → qualified", value: qualifiedRate == null ? "—" : `${qualifiedRate.toFixed(1)}%`, detail: `${overview.qualified.toLocaleString("en-IN")} qualified from ${overview.leads.toLocaleString("en-IN")} leads.`, tone: qualifiedRate != null && qualifiedRate >= 35 ? ("positive" as const) : ("neutral" as const) },
      { label: "Lead → enrolled", value: enrolledRate == null ? "—" : `${enrolledRate.toFixed(1)}%`, detail: `${overview.enrolled.toLocaleString("en-IN")} enrollments in the current cohort.`, tone: enrolledRate != null && enrolledRate > 0 ? ("positive" as const) : ("neutral" as const) },
      { label: "Strongest observed source", value: strongestSource?.source || "Unknown", detail: strongestSource ? `${strongestSource.qualified.toLocaleString("en-IN")} qualified · ${strongestSource.enrolled.toLocaleString("en-IN")} enrolled.` : "No source-level CRM evidence is available.", tone: strongestSource?.enrolled ? ("positive" as const) : ("neutral" as const) },
    ],
    actions: [
      { label: "Inspect attribution", href: "/marketing?view=attribution", detail: "Compare source evidence across attribution models." },
      { label: "Review re-engaged leads", href: "/re-engaged", detail: "Prioritize returning leads with current intent evidence." },
      { label: "Check tracking health", href: "/tracking/data-coverage", detail: "Validate evidence completeness before diagnosing performance." },
    ],
  };
}

function buildAttributionNarrative(score: number, readinessDetail: string) {
  if (score >= 85) return `Attribution evidence is strong enough for directional source decisions. ${readinessDetail}`;
  if (score >= 60) return `The model is useful, but source comparisons should still be read with visible coverage gaps in mind. ${readinessDetail}`;
  return `Attribution is currently incomplete. Prioritize evidence repair before making aggressive channel or budget changes. ${readinessDetail}`;
}

function mapTone(tone: "positive" | "info" | "watch" | "risk") {
  if (tone === "positive") return "positive" as const;
  if (tone === "watch") return "watch" as const;
  if (tone === "risk") return "risk" as const;
  return "neutral" as const;
}

function marketingActionHref(href: string) {
  if (href === "/funnel") return "/marketing?view=funnel";
  if (href === "/attribution") return "/marketing?view=attribution";
  if (href === "/campaigns") return "/marketing?view=campaigns";
  if (href === "/analytics") return "/marketing?view=analytics";
  return href;
}

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function toRatePercent(value: number | string | null | undefined) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number <= 1 ? number * 100 : number;
}

function formatNumber(value: number | string | null | undefined) {
  return toNumber(value).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function pretty(value: string | null | undefined) {
  if (!value) return "—";
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
