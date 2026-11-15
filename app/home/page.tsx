import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Inbox,
  Sparkles,
  Megaphone,
  MessageCircle,
  Target,
  GitBranch,
  Zap,
  UserRoundCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { DecisionMetricCard } from "@/components/intelligence/decision-metric-card";
import { LeadActivityChart } from "@/components/home/lead-activity-chart";
import { QualificationCohortPanel } from "@/components/home/qualification-cohort-panel";
import { HomeGeographyReadiness } from "@/components/home/home-geography-readiness";
import { HomeReportingCoverage, type HomeReportingEvidence } from "@/components/home/home-reporting-coverage";
import { HomeEmptyState } from "@/components/home/home-empty-state";
import { isMockMode } from "@/lib/data";
import { getHomeV1MetricTruth, type HomeV1MetricTruth } from "@/lib/home-v1-metric-truth";
import { percentageWidth, sourceLabel } from "@/lib/ui-format";
import { buildHomeSourceSignals, reconcileHomeSourceQualification } from "@/lib/home-source-intelligence";
import { buildHomeNextActions, type HomeNextAction, type HomeActionId } from "@/lib/home-next-actions";
import { calculateHomeReplyWaitingBreakdown } from "@/lib/home-reply-waiting";
import {
  getDashboardSnapshot,
  type DashboardBatchDemand,
  type DashboardSnapshot,
} from "@/lib/dashboard-data";
import {
  getDashboardPeriodAnalytics,
  resolveDashboardPeriod,
  type DashboardPeriodAnalytics,
  type DashboardPeriodSource,
} from "@/lib/dashboard-period-data";

type HomePageProps = {
  searchParams: Promise<{
    period?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
};

type AttentionItem = HomeNextAction & { icon: LucideIcon };
const actionIcons: Record<HomeActionId, LucideIcon> = {
  "reply-queue": Inbox,
  "overdue-followups": Clock3,
  "first-touch": UserRoundCheck,
  "payment-stage": CreditCard,
  "missing-valuation": CircleDollarSign,
};

type ChangeSignal = {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "negative" | "neutral" | "attention";
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const query = await searchParams;
  const mock = isMockMode();
  const periodFallback = resolveDashboardPeriod(query);

  const [snapshot, periodAnalytics, metricTruth] = await Promise.all([
    getDashboardSnapshot(),
    mock
      ? Promise.resolve<DashboardPeriodAnalytics>({
          period: periodFallback,
          available: { leads: false, revenue: false, enrollments: false },
          revenue: [],
          primaryCurrency: null,
          revenueSeries: [],
          leadSeries: [],
          leads: {
            current: 0,
            previous: 0,
            changePercent: null,
            qualified: 0,
            conversionRate: null,
          },
          enrollments: { current: 0, previous: 0, changePercent: null },
          sources: [],
          geography: null,
        })
      : getDashboardPeriodAnalytics(query),
    mock
      ? Promise.resolve<HomeV1MetricTruth>({ qualification: null, pipeline: null })
      : getHomeV1MetricTruth(periodFallback),
  ]);

  const {
    metrics,
    counts,
    revenueSummary,
    upcomingBatches,
  } = snapshot;

  const primaryRevenue =
    revenueSummary.find((row) => row.collected > 0) ?? revenueSummary[0] ?? null;

  const pipelineTruth = metricTruth.pipeline;
  const unvaluedCurrentOpen = pipelineTruth
    ? pipelineTruth.missingValueCount + pipelineTruth.missingCurrencyCount
    : null;
  const valuationCoverage = pipelineTruth && pipelineTruth.eligibleCount > 0
    ? Math.round((pipelineTruth.valuedCount / pipelineTruth.eligibleCount) * 1000) / 10
    : null;
  const openPipelineValue = !pipelineTruth || pipelineTruth.valuedCount === 0
    ? "—"
    : pipelineTruth.currencies.length === 1
      ? formatMoney(pipelineTruth.currencies[0].amount, pipelineTruth.currencies[0].currency)
      : "—";
  const openPipelineDetail = !pipelineTruth
    ? "Verified opportunity snapshot unavailable"
    : pipelineTruth.currencies.length > 1
      ? "Multiple currencies · inspect each separately"
      : `${pipelineTruth.valuedCount} of ${pipelineTruth.eligibleCount} open leads valued · ${valuationCoverage == null ? "No coverage baseline" : valuationCoverage + "% value coverage"}`;
  const historicalQualification =
    periodAnalytics.available.leads &&
    metricTruth.qualification &&
    metricTruth.qualification.cohortLeads === periodAnalytics.leads.current &&
    metricTruth.qualification.historyCovered === metricTruth.qualification.cohortLeads
      ? metricTruth.qualification
      : null;
  const periodPrimaryRevenue = periodAnalytics.available.revenue
    ? pickPeriodRevenue(periodAnalytics, primaryRevenue?.currency ?? null)
    : null;

  const acquisitionSources: DashboardPeriodSource[] = periodAnalytics.available.leads
    ? periodAnalytics.sources
    : [];
  const validatedSourceQuality = historicalQualification
    ? reconcileHomeSourceQualification(
        acquisitionSources,
        historicalQualification.sources,
        historicalQualification.cohortLeads,
        historicalQualification.qualifiedLeads,
      )
    : null;
  const sourceSignals = buildHomeSourceSignals(
    periodAnalytics.available.leads ? periodAnalytics.leads.current : null,
    acquisitionSources,
    historicalQualification?.qualifiedLeads ?? null,
  );

  const totalLeads = periodAnalytics.available.leads
    ? periodAnalytics.leads.current
    : null;
  const qualifiedLeads = historicalQualification?.qualifiedLeads ?? null;
  const qualifiedRate = historicalQualification && historicalQualification.cohortLeads > 0
    ? Math.round((historicalQualification.qualifiedLeads / historicalQualification.cohortLeads) * 1000) / 10
    : null;
  const enrolledLeads = periodAnalytics.available.enrollments
    ? periodAnalytics.enrollments.current
    : null;

  const collectedValue = periodPrimaryRevenue
    ? formatMoney(periodPrimaryRevenue.current, periodPrimaryRevenue.currency)
    : "—";
  const activeAttention: AttentionItem[] = buildHomeNextActions({
    needsReply: metrics.needsReply,
    waitingOverHour: metrics.waitingOverHour,
    followupsDue: metrics.followupsDue,
    needsFirstTouch: metrics.needsFirstTouch,
    paymentPending: metrics.paymentPending,
    missingOpportunityValue: unvaluedCurrentOpen,
  }).map((item) => ({ ...item, icon: actionIcons[item.id] }));
  const changeSignals = buildChangeSignals(periodAnalytics, metrics.waitingOverHour);
  const executiveBrief = buildExecutiveBrief({
    analytics: periodAnalytics,
    sources: validatedSourceQuality ?? [],
    attention: activeAttention,
    qualifiedRate,
  });
  const sourceDetailParams = new URLSearchParams(
    periodAnalytics.period.preset === "custom"
      ? {
          period: "custom",
          from: periodAnalytics.period.startDate,
          to: periodAnalytics.period.endDate,
        }
      : { period: periodAnalytics.period.preset },
  );
  const sourceDetailHref = "/home/sources?" + sourceDetailParams.toString();
  const visibleUpcomingBatches = upcomingBatches.slice(0, 3);
  const maxUpcomingDemand = Math.max(1, ...visibleUpcomingBatches.map((batch) => batch.activeDemand));
  const reportingEvidence: HomeReportingEvidence[] = [
    { id: "lead-acquisition", label: "Lead acquisition", available: periodAnalytics.available.leads, basis: "Period event" },
    { id: "qualification-cohort", label: "Qualification milestones", available: historicalQualification != null, basis: "Period cohort" },
    { id: "recorded-payments", label: "Recorded payment ledger", available: periodAnalytics.available.revenue, basis: "Period event" },
    { id: "enrolled-stage", label: "Enrolled-stage history", available: periodAnalytics.available.enrollments, basis: "Period event" },
    { id: "open-valuation", label: "Open opportunity values", available: pipelineTruth != null, basis: "Current snapshot" },
  ];

  return (
    <div className="command-center-v2 w-full min-w-0 space-y-3 pb-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold tracking-[-0.045em] text-copy-strong">Command Center</h1>
          <p className="mt-1 text-[13px] leading-5 text-copy-muted">Real-time performance and growth</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPresets selected={periodAnalytics.period.preset} />
          <span className="hidden text-[11px] text-copy-subtle sm:inline" title="Date boundaries currently use UTC, not the organization's business timezone.">UTC reporting days</span>
          <details className="relative group">
            <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-ui border border-line bg-surface px-3 text-xs font-medium text-copy-muted hover:border-line-strong">
              <CalendarDays size={14} className="text-brand-700" />
              <span className="max-w-[170px] truncate">{periodAnalytics.period.label}</span>
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-[min(310px,calc(100vw-40px))] rounded-card border border-line bg-surface p-4 shadow-panel">
              <form action="/home" method="get" className="space-y-3">
                <input type="hidden" name="period" value="custom" />
                <DateField id="dashboard-from" name="from" label="From" defaultValue={periodAnalytics.period.startDate} />
                <DateField id="dashboard-to" name="to" label="To" defaultValue={periodAnalytics.period.endDate} />
                <p className="text-[11px] leading-5 text-copy-subtle">Custom ranges are capped at 366 days. Comparisons use the previous equal-length period when available.</p>
                <button type="submit" className="h-10 w-full rounded-ui bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800">Apply date range</button>
              </form>
            </div>
          </details>
          <Link href="/marketing" className="inline-flex h-10 items-center gap-2 rounded-ui border border-line bg-surface px-3 text-xs font-semibold text-copy-strong shadow-sm hover:border-brand-600 hover:text-brand-700"><Sparkles size={15} className="text-brand-700" />Explore intelligence</Link>
        </div>
      </header>

      <section aria-label="Business pulse" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="command-kpi min-w-0">
          <DecisionMetricCard
            compact
            icon={<Users size={17} />}
            label="Leads"
            value={totalLeads == null ? "—" : totalLeads.toLocaleString("en-IN")}
            detail="Created in the selected period"
            delta={periodAnalytics.available.leads ? periodAnalytics.leads.changePercent : undefined}
            deltaDirection="neutral"
            trend={periodAnalytics.leadSeries.map((point) => point.current)}
            comparisonLabel="vs previous comparable period"
            href="/leads"
            evidenceLabel={periodAnalytics.available.leads ? "CRM lead evidence" : "Evidence unavailable"}
            definition="Leads created in the selected period. Missing period evidence stays unknown rather than substituting current snapshot totals."
          />
        </div>
        <div className="command-kpi min-w-0">
          <DecisionMetricCard
            compact
            icon={<UserRoundCheck size={17} />}
            label="Qualified leads"
            value={qualifiedLeads == null ? "—" : qualifiedLeads.toLocaleString("en-IN")}
            detail={qualifiedLeads == null ? "Period-end qualification evidence unavailable" : qualifiedRate == null ? "No qualifying leads in the cohort" : qualifiedRate + "% reached a qualification milestone by period end"}
            href="/leads"
            evidenceLabel={historicalQualification ? "Qualification-stage history" : "Evidence unavailable"}
            evidenceState={historicalQualification ? "derived" : "unknown"}
            definition="New leads in the selected acquisition cohort that reached qualified, high intent, payment pending, or enrolled by the selected period-end cutoff. Counts qualifying milestones, not their present-day stage. Requires complete recorded stage history."
          />
        </div>
        <div className="command-kpi min-w-0">
          <DecisionMetricCard
            compact
            icon={<GitBranch size={17} />}
            label="Open pipeline value"
            value={openPipelineValue}
            detail={openPipelineDetail}
            statusLabel="As of now"
            href="/revenue"
            evidenceLabel={pipelineTruth ? "Open-lead valuation evidence" : "Evidence unavailable"}
            evidenceState={pipelineTruth ? (pipelineTruth.eligibleCount === pipelineTruth.valuedCount ? "derived" : "partial") : "unknown"}
            definition="Sum of positive explicit potential values for currently open, nonarchived sales leads in new, contacted, engaged, qualified, high-intent, or payment-pending stages. Values require an explicit currency; multi-currency amounts are never merged. Missing values are excluded, disclosed in coverage, and must not be interpreted as zero potential. As-of-now, not period-based."
          />
        </div>
        <div className="command-kpi min-w-0">
          <DecisionMetricCard
            compact
            icon={<CreditCard size={17} />}
            label="Recorded collections"
            value={collectedValue}
            detail={!periodAnalytics.available.revenue ? "Selected-period payment evidence unavailable" : periodPrimaryRevenue ? periodPrimaryRevenue.currency + " net paid in CRM ledger · settlement review pending" : "No paid ledger entries · reconciliation pending"}
            delta={periodPrimaryRevenue?.changePercent}
            deltaDirection="higher_is_better"
            comparisonLabel="vs previous comparable period"
            href="/revenue"
            evidenceLabel={periodAnalytics.available.revenue ? "Recorded payment ledger · unverified" : "Evidence unavailable"}
            evidenceState="partial"
            definition="Net paid-status payment records less refund records in the selected period and displayed currency. The CRM ledger has not been reconciled to external settlement evidence; do not treat this as independently verified total business collections."
          />
        </div>
      </section>


      <nav aria-label="Home section shortcuts" className="flex flex-wrap gap-2 xl:hidden">
        {[
          { href: "#home-action-queue", label: "Work queue" },
          { href: "#home-conversion", label: "Conversion" },
          { href: "#home-business-breakdown", label: "Business breakdown" },
        ].map((shortcut) => (
          <Link
            key={shortcut.href}
            href={shortcut.href}
            className="inline-flex min-h-10 items-center rounded-ui border border-line bg-surface px-3 py-2 text-xs font-semibold text-copy-strong transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            {shortcut.label}
          </Link>
        ))}
      </nav>

      <section aria-label="Performance and work queue" className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.28fr)_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
          <SectionHeader eyebrow="Performance · period" title="Lead activity" actionHref="/leads" actionLabel="Open leads" />
          <div className="px-4 pb-3 pt-1 sm:px-5">
            <LeadActivityChart
              compact
              points={periodAnalytics.leadSeries}
              available={periodAnalytics.available.leads}
              currentTotal={totalLeads}
              previousTotal={periodAnalytics.available.leads ? periodAnalytics.leads.previous : null}
              periodLabel={periodAnalytics.period.label}
            />
            <details className="mt-2 border-t border-line pt-2">
              <summary className="cursor-pointer text-[11px] font-medium text-brand-700">Financial context</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <SnapshotMetric label="Enrolled leads" value={enrolledLeads == null ? "—" : enrolledLeads.toLocaleString("en-IN")} />
                <SnapshotMetric label="Active pipeline · now" value={metrics.activePipeline.toLocaleString("en-IN")} />
                <SnapshotMetric label="High intent · now" value={metrics.highIntent.toLocaleString("en-IN")} />
              </div>
              <p className="mt-2 text-[11px] text-copy-subtle">Enrolled leads reflect CRM stage-history entries in the period, not the authoritative operational Enrollment-record count.</p>
              <div className="mt-3">
              <div className="mt-3 grid gap-4 rounded-xl bg-surface-muted p-3 sm:grid-cols-2">
                <SnapshotMetric label="Recorded collections · period" value={collectedValue} change={periodPrimaryRevenue?.changePercent ?? null} />
                <SnapshotMetric label="Eligible open value · now" value={openPipelineValue} />
              </div>
              <p className="mt-2 text-[11px] leading-5 text-copy-subtle">
                Current snapshot revenue has not been substituted into the selected reporting period.
                Recorded collections are CRM ledger entries pending external settlement reconciliation.
                Open pipeline values are current commercial estimates, not recognized revenue.
              </p>
              </div>
            </details>
          </div>
        </section>
        <section id="home-action-queue" className="min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-surface">
          <SectionHeader eyebrow="Needs attention · current" title="Action queue" actionHref="/admissions" actionLabel="View all" />
          {activeAttention.length ? (
            <div className="command-priority-evidence mx-4 mt-1 border-t border-line pt-1 text-[10px] leading-3">
              <p className="font-semibold text-brand-700">{activeAttention[0].value.toLocaleString("en-IN")} · {recommendedActionTitle(activeAttention[0])}</p>
              <p className="mt-1 text-copy-muted">{activeAttention[0].reason}</p>
              <p className="mt-0.5 text-copy-subtle">{activeAttention[0].evidence} · {activeAttention[0].timing}</p>
            </div>
          ) : null}
          {metrics.needsReply > 0 ? (
            <details className="mx-4 mt-1 text-[10px]">
              <summary className="cursor-pointer font-medium text-brand-700">Reply waiting-time breakdown</summary>
              <ReplyPressure total={metrics.needsReply} overHour={metrics.waitingOverHour} />
            </details>
          ) : null}
          <div className="space-y-0.5 px-3 pb-3 pt-1 sm:px-4">
            {activeAttention.length ? activeAttention.slice(0, 4).map((item) => <AttentionRow key={item.id} item={item} />) : <HomeEmptyState variant="queue" compact title={mock ? "Queue evidence unavailable" : "No recorded action backlog"} description={mock ? "Current conversation and follow-up evidence cannot be verified in this environment." : "No current reply, overdue follow-up, first-touch, payment-stage, or valuation actions were returned by the CRM snapshot."} unavailable={mock} />}
          </div>
        </section>
      </section>

      <section id="home-conversion" aria-label="Conversion and collections" className="min-w-0 scroll-mt-24 space-y-3">
        <div className="grid min-w-0 gap-3 lg:grid-cols-[1.08fr_1fr_1.12fr]">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
            <SectionHeader eyebrow="Current CRM stage distribution" title="Pipeline health" actionHref="/admissions?view=pipeline" actionLabel="Open pipeline" />
            <div className="px-4 pb-4 pt-1">
              <PipelineSnapshot active={metrics.activePipeline} highIntent={metrics.highIntent} payment={metrics.paymentPending} enrolled={counts.enrolled ?? 0} counts={counts} />
            </div>
          </section>
          <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
            <SectionHeader eyebrow="Selected acquisition cohort" title="Qualification" actionHref={sourceDetailHref} actionLabel="Inspect" />
            <div className="flex min-h-[142px] items-center justify-center gap-3 px-3 pb-3 pt-1">
              <div className="relative grid h-[108px] w-[108px] shrink-0 place-items-center rounded-full" style={{background: qualifiedRate == null ? "conic-gradient(#e9e3fb 0 100%)" : `conic-gradient(#5a19d8 0 ${qualifiedRate}%, #e9e3fb ${qualifiedRate}% 100%)`}}>
                <div className="grid h-[78px] w-[78px] place-content-center rounded-full bg-surface text-center">
                  <span className="text-[23px] font-bold text-copy-strong">{qualifiedRate == null ? "—" : qualifiedRate.toFixed(1) + "%"}</span>
                  <span className="text-[10px] text-copy-muted">Qualified</span>
                </div>
              </div>
              <div className="min-w-0 space-y-3 text-xs">
                <div><p className="text-xl font-bold text-copy-strong">{qualifiedLeads == null ? "—" : qualifiedLeads.toLocaleString("en-IN")}</p><p className="text-copy-muted">Qualified by period end</p></div>
                <div className="border-t border-line pt-2"><p className="text-xl font-bold text-copy-strong">{totalLeads == null || qualifiedLeads == null ? "—" : (totalLeads-qualifiedLeads).toLocaleString("en-IN")}</p><p className="text-copy-muted">Without milestone</p></div>
              </div>
            </div>
          </section>
          <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
            <SectionHeader eyebrow="Current opportunity valuation" title="Opportunity pipeline" actionHref="/revenue/valuation" actionLabel="Review values" />
            <div className="space-y-3 px-4 pb-4 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-2xl font-bold tracking-tight text-copy-strong">{openPipelineValue}</p>
                <span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-semibold text-brand-700">{pipelineTruth ? valuationCoverage == null ? "Coverage unknown" : valuationCoverage.toFixed(1) + "% valued" : "Valuation unavailable"}</span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-center">
                {[
                  {label:"New",value:counts.new},
                  {label:"Contacted",value:counts.contacted},
                  {label:"Qualified",value:counts.qualified},
                  {label:"Enrolled",value:counts.enrolled ?? 0},
                ].map((step) => <div key={step.label} className="min-w-0 rounded-lg bg-brand-50 px-1 py-3 text-brand-900"><p className="text-[10px] font-semibold">{step.label}</p><p className="mt-2 text-[15px] font-bold tabular-nums">{step.value.toLocaleString("en-IN")}</p></div>)}
              </div>
              <p className="text-[10px] leading-4 text-copy-subtle">Current independent stage counts, not a sequential conversion funnel. Missing or mixed-currency values are excluded.</p>
            </div>
          </section>
        </div>

        <div id="home-business-breakdown" aria-label="Business breakdown" className="grid min-w-0 scroll-mt-24 gap-3 lg:grid-cols-[0.95fr_1.55fr]">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
            <SectionHeader eyebrow="Acquisition · period" title="Lead sources" actionHref={sourceDetailHref} actionLabel="Analyze sources" />
            <div className="p-3 sm:p-4">
              {acquisitionSources.length ? (
                <div className="grid items-center gap-3 sm:grid-cols-[130px_minmax(0,1fr)]">
                  <SourceMixRing sources={acquisitionSources} total={totalLeads} />
                  <div className="min-w-0">
                    {acquisitionSources.slice(0, 4).map((source) => (
                      <SourceRow key={source.source} source={validatedSourceQuality?.find((item) => item.source === source.source) ?? source} qualificationAvailable={validatedSourceQuality != null} periodTotal={totalLeads} href={sourceDetailHref} />
                    ))}
                  </div>
                </div>
              ) : (
                <HomeEmptyState variant="sources" compact unavailable={!periodAnalytics.available.leads} title={periodAnalytics.available.leads ? "No source activity yet" : "Source data unavailable"} description={periodAnalytics.available.leads ? "No acquisition data is recorded for this period yet." : "Selected-period acquisition evidence is unavailable. Current all-time source totals have not been substituted."} />
              )}
              {sourceSignals.length > 0 ? <details className="mt-2 text-[11px] text-copy-muted"><summary className="cursor-pointer font-semibold text-brand-700">Inspect {sourceSignals.length} source insight{sourceSignals.length === 1 ? "" : "s"}</summary><div className="mt-2 space-y-2">{sourceSignals.map(signal=><p key={signal.title}><strong>{signal.title}:</strong> {signal.detail}</p>)}</div></details> : null}
            </div>
          </section>
          <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
            <SectionHeader eyebrow="Acquisition cohort · period" title="Qualification milestones" actionHref={sourceDetailHref} actionLabel="Inspect cohort" />
            <QualificationCohortPanel total={totalLeads} qualified={qualifiedLeads} periodLabel={periodAnalytics.period.label} href={sourceDetailHref} />
          </section>
        </div>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[0.9fr_1.5fr]">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
            <SectionHeader eyebrow="CRM ledger · period" title="Recorded collections trend" actionHref="/revenue" actionLabel="Review ledger" />
            <div className="p-4">
              <RevenueTrend points={periodAnalytics.revenueSeries} currency={periodAnalytics.primaryCurrency} available={periodAnalytics.available.revenue} />
              {periodAnalytics.available.revenue && periodAnalytics.revenue.length > 1 ? (
                <p className="mt-2 text-[11px] text-copy-subtle">This trend uses {periodAnalytics.primaryCurrency ?? "one currency"} only; other currency ledgers are excluded without approved FX evidence.</p>
              ) : null}
            </div>
          </section>
          <HomeGeographyReadiness coverage={periodAnalytics.geography} periodLabel={periodAnalytics.period.label} />
        </div>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[0.9fr_1.5fr]">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
            <SectionHeader eyebrow="Operations · current" title="Upcoming batch demand" actionHref="/course-management" actionLabel="See batches" />
            <div className="p-3 sm:p-4">
              {visibleUpcomingBatches.length ? visibleUpcomingBatches.map((batch) => <BatchCard key={batch.id} batch={batch} maxDemand={maxUpcomingDemand} />) : <HomeEmptyState variant="batches" compact title="No upcoming batches" description="No future-start batches are currently available in this workspace." action={{ href: "/course-management", label: "View courses" }} />}
              <p className="mt-2 text-[10px] leading-4 text-copy-subtle">Course-level collections require verified payment-to-enrollment links; demand indicators may overlap.</p>
            </div>
          </section>
          <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="px-4 pb-1 pt-4"><h2 className="text-sm font-bold text-copy-strong">Trends &amp; momentum</h2><p className="mt-1 text-[11px] text-copy-subtle">Recorded comparable changes only</p></div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
              <div className="rounded-xl bg-brand-50 p-3"><p className="text-[11px] text-copy-muted">Lead momentum</p><p className="mt-2 text-xl font-bold text-brand-700">{changeSignals[0].value}</p><p className="mt-1 text-[10px] text-copy-muted">{changeSignals[0].detail}</p></div>
              <div className="rounded-xl bg-brand-50 p-3"><p className="text-[11px] text-copy-muted">Qualification rate</p><p className="mt-2 text-xl font-bold text-brand-700">{qualifiedRate == null ? "—" : qualifiedRate.toFixed(1) + "%"}</p><p className="mt-1 text-[10px] text-copy-muted">Recorded cohort milestone share</p></div>
              <div className="rounded-xl bg-brand-50 p-3"><p className="text-[11px] text-copy-muted">Valuation coverage</p><p className="mt-2 text-xl font-bold text-brand-700">{valuationCoverage == null ? "—" : valuationCoverage.toFixed(1) + "%"}</p><p className="mt-1 text-[10px] text-copy-muted">Open opportunities with recorded values</p></div>
            </div>
          </section>
        </div>
      </section>

      <section aria-label="Daily workspace" className="grid min-w-0 gap-3 lg:grid-cols-3">
        <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-copy-strong">Operational insights</h2>
          <p className="mt-1 text-xs leading-5 text-copy-muted">Evidence from your CRM, not a predicted outcome.</p>
          <div className="mt-4 space-y-2">
            {changeSignals.slice(0, 2).map((signal) => <ChangeSignalCard key={signal.label} signal={signal} />)}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-copy-subtle">{executiveBrief.summary}</p>
        </section>
        <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-copy-strong">System health</h2>
          <p className="mt-1 text-xs leading-5 text-copy-muted">Provider status and sync freshness are checked in the live health monitor.</p>
          <div className="mt-4">
            <HomeEmptyState variant="status" compact unavailable title="Status not loaded here" description="Open System Health for verified connection conditions." />
          </div>
          <Link href="/system-health" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
            View system health <ArrowRight size={13} />
          </Link>
        </section>
        <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-copy-strong">Quick actions</h2>
          <p className="mt-1 text-xs leading-5 text-copy-muted">Open the workspace you need.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { href: "/conversations", label: "Conversations", icon: MessageCircle },
              { href: "/leads", label: "Leads", icon: Target },
              { href: "/campaigns", label: "Campaigns", icon: Megaphone },
            ].map((action) => (
              <Link key={action.href} href={action.href} className="flex min-h-[85px] flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-brand-50 px-2 text-center text-[11px] font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-100">
                <action.icon size={20} aria-hidden="true" />
                <span className="truncate">{action.label}</span><ArrowRight size={12} className="shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      </section>

      <section aria-label="Recommended actions" className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-copy-subtle">Recommended actions</p>
            <h2 className="mt-1 text-sm font-semibold text-copy-strong">Deterministic CRM guidance</h2>
            <p className="mt-1 text-[11px] text-copy-muted">Prioritized from recorded conversations, follow-ups, and opportunity state.</p>
          </div>
          <span className="rounded-full border border-line bg-surface-muted px-3 py-1 text-[11px] font-semibold text-copy-strong">Observed evidence</span>
        </div>
        {activeAttention.length ? (
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {activeAttention.slice(0, 3).map((item) => (
              <Link key={item.id} href={item.href} title={item.evidence + " · " + item.reason} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-3 text-xs text-copy-strong transition hover:border-brand-600 hover:bg-brand-100">
                <span className="min-w-0"><span className="block font-semibold">{recommendedActionTitle(item)}</span><span className="mt-1 block text-[11px] text-copy-muted">{item.value.toLocaleString("en-IN")} to review</span></span>
                <ArrowRight size={15} className="shrink-0 text-brand-700" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-line bg-surface-muted px-3 py-4 text-xs text-copy-muted">No evidence-backed recommendation is available from the current action snapshot.</p>
        )}
      </section>

      <details className="rounded-lg px-1 text-[11px] text-copy-subtle">
        <summary className="w-fit cursor-pointer text-brand-700">Metric definitions and reporting scope</summary>
        <p className="mt-2 max-w-4xl leading-5">
          Leads and recorded collections refer to the selected UTC period. Qualified leads reached a recorded milestone by period end.
          Open pipeline is a current-state estimate and does not change with the period filter.
        </p>
      </details>


      <HomeReportingCoverage items={reportingEvidence} />
    </div>
  );
}

function ChangeSignalCard({ signal }: { signal: ChangeSignal }) {
  const signalTone =
    signal.tone === "attention" ? "text-amber-700 dark:text-amber-300" :
    signal.tone === "positive" ? "text-emerald-700 dark:text-emerald-300" :
    signal.tone === "negative" ? "text-rose-700 dark:text-rose-300" : "text-copy-strong";

  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/70 pb-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-medium text-copy-strong">{signal.label}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-copy-muted">{signal.detail}</p>
      </div>
      <span className={"shrink-0 text-xs font-semibold tabular-nums " + signalTone}>{signal.value}</span>
    </div>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const Icon = item.icon;
  const tone = item.tone === "critical" ? "text-rose-600" :
    item.tone === "warning" ? "text-amber-600" : "text-brand-700";

  return (
    <Link
      href={item.href}
      className="group flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      title={item.reason + " · " + item.evidence}
    >
      <span className={"grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-muted " + tone}>
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold leading-4 text-copy-strong">{recommendedActionTitle(item)}</span>
        <span className="mt-0.5 block truncate text-[10px] leading-3 text-copy-muted">{item.reason}</span>
        <span className="mt-0.5 block truncate text-[9px] leading-3 text-copy-subtle">{item.priority} · {item.evidence}</span>
      </span>
      <span className="shrink-0 rounded-lg bg-surface-muted px-2 py-1 text-xs font-semibold tabular-nums text-copy-strong">
        {item.value.toLocaleString("en-IN")}
      </span>
      <ArrowRight size={13} className="shrink-0 text-copy-subtle group-hover:text-brand-700" />
    </Link>
  );
}

function ReplyPressure({ total, overHour }: { total: number; overHour: number }) {
  const breakdown = calculateHomeReplyWaitingBreakdown(total, overHour);
  if (!breakdown) {
    return (
      <div data-testid="home-reply-pressure" data-evidence-state="unavailable" className="mx-4 mt-2 rounded-xl border border-line bg-surface-muted px-3 py-3 sm:mx-5">
        <p className="text-xs font-semibold text-copy-strong">Reply waiting-time breakdown unavailable</p>
        <p className="mt-1 text-[11px] leading-5 text-copy-muted">
          The recorded waiting-time count is missing or inconsistent with the reply queue. No waiting percentage can be verified.
        </p>
        <Link href="/conversations" className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
          Work reply queue <ArrowRight size={12} />
        </Link>
      </div>
    );
  }
  const { older, recent, percentOverHour: share } = breakdown;

  return (
    <div data-testid="home-reply-pressure" data-evidence-state="available" className="mx-4 mt-2 rounded-xl border border-line bg-surface-muted px-3 py-3 sm:mx-5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-copy-strong">Reply waiting time</span>
        <span className="font-semibold tabular-nums text-copy-strong">{share.toFixed(0)}% over 1h</span>
      </div>
      <div
        role="img"
        aria-label={older + " conversations waiting over an hour, " + recent + " waiting up to an hour"}
        className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      >
        <div className="h-full bg-amber-500 dark:bg-amber-400" style={{ width: percentageWidth(share) + "%" }} />
        <div className="h-full bg-brand-700/70" style={{ width: percentageWidth(100 - share) + "%" }} />
      </div>
      <div className="mt-2.5 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px] text-copy-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" /> Over 1h · {older.toLocaleString("en-IN")}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-700" /> Up to 1h · {recent.toLocaleString("en-IN")}</span>
      </div>
      <Link href="/conversations" className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
        Work reply queue <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function PipelineSnapshot({
  active, highIntent, payment, enrolled, counts,
}: {
  active: number;
  highIntent: number;
  payment: number;
  enrolled: number;
  counts: DashboardSnapshot["counts"];
}) {
  const rows = [
    {label:"New", value:counts.new},
    {label:"Contacted", value:counts.contacted + counts.engaged},
    {label:"High intent", value:counts.high_intent + counts.qualified},
    {label:"Payment pending", value:counts.payment_pending},
    {label:"Enrolled", value:counts.enrolled ?? 0},
  ];
  const max = Math.max(1, ...rows.map((item) => item.value));
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl font-bold tabular-nums text-copy-strong">{active.toLocaleString("en-IN")}</span>
        <span className="text-[10px] text-copy-muted">Active pipeline · now</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[88px_minmax(0,1fr)_36px] items-center gap-2 text-[10px]">
          <span className="truncate font-medium text-copy-strong">{row.label}</span>
          <div role="progressbar" aria-label={row.label + " current stage share"} aria-valuenow={Math.round(row.value / max * 100)} aria-valuemin={0} aria-valuemax={100} className="h-[7px] overflow-hidden rounded-full bg-brand-100">
            <div className="h-full rounded-full bg-brand-700" style={{width: percentageWidth(row.value / max * 100) + "%"}} />
          </div>
          <span className="text-right font-semibold tabular-nums text-copy-strong">{row.value.toLocaleString("en-IN")}</span>
        </div>
      ))}
      <details className="pt-1 text-[10px] text-copy-subtle">
        <summary className="cursor-pointer text-brand-700">Stage definitions and overlap</summary>
        <p className="mt-1 leading-4">Current CRM stage counts, not a sequential conversion funnel. High intent and qualification are combined in this view. Payment pending: {payment.toLocaleString("en-IN")}; enrolled: {enrolled.toLocaleString("en-IN")}; high intent: {highIntent.toLocaleString("en-IN")}.</p>
      </details>
    </div>
  );
}

function DateField({
  id,
  name,
  label,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-copy-subtle"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="date"
        defaultValue={defaultValue}
        className="mt-1 h-10 w-full rounded-ui border border-line bg-surface px-3 text-sm text-copy-strong outline-none transition focus:border-brand-700 focus:ring-2 focus:ring-brand-700/10"
      />
    </div>
  );
}

function PeriodPresets({
  selected,
}: {
  selected: DashboardPeriodAnalytics["period"]["preset"];
}) {
  const options = [
    ["7d", "7D"],
    ["30d", "30D"],
    ["90d", "90D"],
    ["ytd", "YTD"],
  ] as const;

  return (
    <div className="inline-flex h-10 items-center rounded-ui border border-line bg-surface p-1 shadow-sm">
      {options.map(([value, label]) => (
        <Link
          key={value}
          href={`/home?period=${value}`}
          className={`inline-flex h-8 min-w-10 items-center justify-center rounded-md px-2.5 text-[11px] font-semibold transition ${
            selected === value
              ? "bg-brand-700 text-white"
              : "text-copy-muted hover:bg-brand-50 hover:text-brand-700"
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function SectionHeader({
  eyebrow, title, actionHref, actionLabel,
}: {
  eyebrow: string;
  title: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-copy-strong">{title}</h2>
        <p className="mt-1 text-[11px] leading-4 text-copy-subtle">{eyebrow}</p>
      </div>
      <Link href={actionHref} className="inline-flex shrink-0 items-center gap-1 py-1 text-[11px] font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300">
        {actionLabel}<ArrowRight size={12} />
      </Link>
    </div>
  );
}

function SnapshotMetric({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change?: number | null;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-copy-subtle">
        {label}
      </div>
      <div className="mt-1 truncate text-xl font-semibold tracking-[-0.035em] text-copy-strong">
        {value}
      </div>
      {change !== undefined ? (
        <div className="mt-1">
          <TrendPill value={change ?? null} compact />
        </div>
      ) : null}
    </div>
  );
}

function RevenueTrend({
  points, currency, available,
}: {
  points: DashboardPeriodAnalytics["revenueSeries"];
  currency: string | null;
  available: boolean;
}) {
  if (!available) {
    return (
      <div className="mt-4">
        <HomeEmptyState
          variant="revenue"
          compact
          unavailable
          title="Revenue evidence unavailable"
          description="Selected-period payment evidence is unavailable. Current snapshot revenue has not been substituted into this period trend."
        />
      </div>
    );
  }
  if (!points.length || !currency) {
    return (
      <div className="mt-4">
        <HomeEmptyState
          variant="revenue"
          compact
          title="No paid ledger activity yet"
          description="The recorded trend will appear when paid-status transactions exist in the selected period. Independent settlement evidence is not yet available."
          action={{ href: "/revenue", label: "Open revenue" }}
        />
      </div>
    );
  }
  let running = 0;
  const cumulative = points.map(point => ({ ...point, cumulative: (running += point.value) }));
  const min = Math.min(0, ...cumulative.map(point => point.cumulative));
  const max = Math.max(0, ...cumulative.map(point => point.cumulative));
  const range = Math.max(1, max - min);
  const width = 560;
  const height = 140;
  const y = (value: number) => 12 + (max - value) / range * (height - 24);
  const coords = cumulative.map((point, i) => ({
    x: 7 + i / Math.max(1, cumulative.length - 1) * (width - 14),
    y: y(point.cumulative),
  }));
  const path = coords.map((point, i) => (i === 0 ? "M" : "L") + " " + point.x.toFixed(2) + " " + point.y.toFixed(2)).join(" ");

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] text-copy-muted">Cumulative recorded net payments · {currency}</p>
          <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-copy-strong">{formatMoney(running, currency)}</p>
        </div>
        <span className="text-[11px] text-copy-subtle">CRM ledger · refunds netted where recorded</span>
      </div>
      <svg className="mt-4 block h-[150px] w-full overflow-visible text-brand-700 dark:text-brand-300" viewBox="0 0 560 140" preserveAspectRatio="none" role="img" aria-label={"Cumulative recorded net payments " + currency + " for the selected period; settlement unverified"}>
        <title>Cumulative recorded net payments {currency} for the selected period, settlement unverified</title>
        {[0, 0.5, 1].map((p, index) => (
          <line key={index} x1="7" x2="553" y1={12 + p * 116} y2={12 + p * 116} stroke="currentColor" strokeOpacity="0.09" strokeWidth="1" />
        ))}
        <line x1="7" x2="553" y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.18" strokeDasharray="3 4" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {coords.length > 0 ? <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="4" fill="currentColor" /> : null}
      </svg>
      <div className="mt-1 flex justify-between gap-3 text-[11px] text-copy-subtle">
        <span>{formatShortDate(points[0]?.date)}</span><span>{formatShortDate(points[points.length - 1]?.date)}</span>
      </div>
    </div>
  );
}

/** Visual emphasis for the dominant source, without hiding the other sources. */
function SourceMixRing({ sources, total }: { sources: DashboardPeriodSource[]; total: number | null }) {
  if (total === null || total <= 0 || sources.length === 0) return null;
  const validSources = sources.filter((source) => Number.isSafeInteger(source.leads) && source.leads >= 0);
  const used = validSources.reduce((sum, source) => sum + source.leads, 0);
  if (used > total) return null;
  const palette = ["#5216D3", "#8D52EB", "#AE84F4", "#D4BFF9", "#E8DDFB"];
  const circumference = 2 * Math.PI * 43;
  let offset = 0;
  const segments = validSources.slice(0, 4).map((source, index) => {
    const length = circumference * (source.leads / total);
    const result = { name: sourceLabel(source.source), length, offset, color: palette[index] };
    offset += length;
    return result;
  });
  return (
    <div data-testid="home-source-mix-ring" role="img" aria-label={"Distribution of " + total + " selected-period leads across recorded sources"} className="relative mx-auto grid h-[118px] w-[118px] shrink-0 place-items-center">
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true" focusable="false">
        <circle cx="60" cy="60" r="43" fill="none" strokeWidth="12" stroke="#eee9fa" />
        {segments.map((segment) => (
          <circle key={segment.name} cx="60" cy="60" r="43" fill="none" stroke={segment.color} strokeWidth="12" strokeDasharray={segment.length + " " + (circumference - segment.length)} strokeDashoffset={-segment.offset} />
        ))}
      </svg>
      <div className="relative z-10 text-center"><p className="text-xl font-bold tabular-nums text-copy-strong">{total.toLocaleString("en-IN")}</p><p className="text-[10px] text-copy-muted">Leads</p></div>
    </div>
  );
}

function SourceRow({ source, periodTotal, href = "/home/sources", qualificationAvailable = false }: { source: DashboardPeriodSource; periodTotal: number | null; href?: string; qualificationAvailable?: boolean }) {
  const share = periodTotal != null && periodTotal > 0 ? (source.leads / periodTotal) * 100 : null;
  const displaySource = sourceLabel(source.source);
  return (
    <Link href={href} className="group block rounded-xl px-2 py-1 transition hover:bg-surface-muted">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block truncate text-xs font-medium text-copy-strong" title={"CRM source: " + source.source}>{displaySource}</span>
          <span className="sr-only">{qualificationAvailable ? source.qualified.toLocaleString("en-IN") + " qualified by period end" : "Qualification evidence unavailable"}</span>
        </div>
        <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-copy-strong">
          {source.leads.toLocaleString("en-IN")}
          <span className="ml-2 font-normal text-copy-subtle">{share == null ? "—" : share.toFixed(1) + "%"}</span>
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-muted">
        <div role="progressbar" aria-label={displaySource + " share of selected-period leads"} aria-valuenow={share == null ? undefined : Math.round(share * 10) / 10} aria-valuemin={0} aria-valuemax={100} className="h-full rounded-full bg-brand-700" style={{ width: percentageWidth(share) + "%" }} />
      </div>
    </Link>
  );
}

function BatchCard({ batch, maxDemand }: { batch: DashboardBatchDemand; maxDemand: number }) {
  const capacityKnown = batch.capacity != null && batch.capacity > 0;
  const capacityText = !capacityKnown
    ? "Capacity not set"
    : batch.seatsRemaining != null
      ? String(batch.seatsRemaining) + " seats left"
      : String(batch.capacity) + " capacity";

  const indicators = [
    { label: "High intent", value: batch.hotDemand },
    { label: "Payment stage", value: batch.paymentPending },
    { label: "Enrolled stage", value: batch.enrolled },
  ].filter((indicator) => indicator.value > 0);
  const comparisonShare = Math.max(0, Math.min(100, (batch.activeDemand / maxDemand) * 100));

  return (
    <Link
      href="/course-management"
      className="group block rounded-xl px-2 py-3 transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block line-clamp-1 text-xs font-semibold text-copy-strong">{batch.courseName}</span>
          <span className="mt-0.5 block text-[11px] leading-4 text-copy-subtle">
            {batch.batchCode} · {batch.startDate ? formatDate(batch.startDate) : "Date not set"} · {batch.location}
          </span>
          <span className="mt-1 block text-[10px] text-copy-subtle">{capacityText}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[17px] font-semibold tabular-nums text-copy-strong">{batch.activeDemand.toLocaleString("en-IN")}</span>
          <span className="block text-[10px] text-copy-subtle">active leads</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={batch.courseName + " relative active lead demand among displayed upcoming batches"}
        aria-valuenow={Math.round(comparisonShare)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-muted"
      >
        <div className="h-full rounded-full bg-brand-700" style={{ width: comparisonShare + "%" }} />
      </div>
      {indicators.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-copy-muted">
          {indicators.map((indicator) => (
            <span key={indicator.label} className="rounded-md border border-line px-1.5 py-1">
              {indicator.label} · <span className="font-semibold tabular-nums text-copy-strong">{indicator.value.toLocaleString("en-IN")}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-copy-subtle">No advanced-stage demand recorded for this batch.</p>
      )}
    </Link>
  );
}

function TrendPill({
  value,
  compact = false,
}: {
  value: number | null;
  compact?: boolean;
}) {
  if (value == null) {
    return (
      <span
        className={`${compact ? "text-[9px]" : "text-[10px]"} font-semibold text-copy-subtle`}
      >
        No baseline
      </span>
    );
  }

  const positive = value > 0;
  const negative = value < 0;
  const tone = positive
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
    : negative
      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
      : "bg-surface-muted text-copy-muted";

  return (
    <span
      className={`inline-flex items-center rounded-full ${
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"
      } font-semibold ${tone}`}
    >
      {positive ? "↑ " : negative ? "↓ " : ""}
      {value > 0 ? "+" : ""}
      {value.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%
    </span>
  );
}

function buildChangeSignals(
  analytics: DashboardPeriodAnalytics,
  waitingOverHour: number,
): ChangeSignal[] {
  const leadAvailable = analytics.available.leads;
  const enrollmentAvailable = analytics.available.enrollments;
  const leadDelta = leadAvailable ? analytics.leads.changePercent : null;
  const enrollmentDelta = enrollmentAvailable
    ? analytics.enrollments.changePercent
    : null;

  return [
    {
      label: "Lead momentum",
      value:
        !leadAvailable || leadDelta == null
          ? "—"
          : `${leadDelta > 0 ? "+" : ""}${leadDelta.toFixed(1)}%`,
      detail: !leadAvailable
        ? "Selected-period lead evidence unavailable"
        : leadDelta == null
          ? "No comparable lead baseline"
          : `${analytics.leads.current.toLocaleString("en-IN")} leads vs ${analytics.leads.previous.toLocaleString("en-IN")} prior`,
      tone: "neutral",
    },
    {
      label: "Enrolled-lead movement",
      value:
        !enrollmentAvailable || enrollmentDelta == null
          ? "—"
          : `${enrollmentDelta > 0 ? "+" : ""}${enrollmentDelta.toFixed(1)}%`,
      detail: !enrollmentAvailable
        ? "Selected-period stage-history evidence unavailable"
        : enrollmentDelta == null
          ? "No comparable enrolled-lead baseline"
          : `${analytics.enrollments.current.toLocaleString("en-IN")} leads entered enrolled stage in scope`,
      tone:
        !enrollmentAvailable || enrollmentDelta == null
          ? "neutral"
          : enrollmentDelta >= 0
            ? "positive"
            : "negative",
    },
    {
      label: "Reply SLA pressure",
      value: waitingOverHour.toLocaleString("en-IN"),
      detail:
        waitingOverHour > 0
          ? "conversations waiting more than one hour"
          : "no conversations beyond one hour",
      tone: waitingOverHour > 0 ? "attention" : "positive",
    },
  ];
}

function buildExecutiveBrief({
  analytics,
  sources,
  attention,
  qualifiedRate,
}: {
  analytics: DashboardPeriodAnalytics;
  sources: DashboardPeriodSource[];
  attention: AttentionItem[];
  qualifiedRate: number | null;
}) {
  const strongestSource = [...sources]
    .filter((source) => source.leads > 0)
    .sort(
      (a, b) =>
        b.qualified - a.qualified ||
        (b.conversionRate ?? 0) - (a.conversionRate ?? 0),
    )[0];
  const topAttention = attention[0];
  const leadChange = analytics.available.leads
    ? analytics.leads.changePercent
    : null;
  const attentionPhrases: Record<string, string> = {
    "Needs reply": topAttention?.value === 1 ? "conversation is waiting for a reply" : "conversations are waiting for a reply",
    "Overdue follow-ups": topAttention?.value === 1 ? "follow-up is overdue" : "follow-ups are overdue",
    "First touch needed": topAttention?.value === 1 ? "lead needs a first contact" : "leads need a first contact",
    "Payment pending": topAttention?.value === 1 ? "opportunity needs payment follow-up" : "opportunities need payment follow-up",
    "Missing opportunity values": topAttention?.value === 1 ? "open lead needs valuation" : "open leads need valuation",
  };
  const title = topAttention
    ? `${topAttention.value.toLocaleString("en-IN")} ${attentionPhrases[topAttention.label] ?? "items need attention"}.`
    : leadChange != null && leadChange > 0
      ? `Lead volume is up ${leadChange.toFixed(1)}% with no urgent action backlog.`
      : "The workspace has no urgent operational backlog right now.";

  const parts: string[] = [];
  if (leadChange != null) {
    parts.push(
      `Lead volume is ${leadChange >= 0 ? "up" : "down"} ${Math.abs(leadChange).toFixed(1)}% versus the previous comparable period.`,
    );
  }
  if (qualifiedRate != null) {
    parts.push(`${qualifiedRate}% of new leads reached a recorded qualification milestone by period end.`);
  }
  if (strongestSource) {
    parts.push(
      `${pretty(strongestSource.source)} contributed the most documented qualification milestones among sources in the selected lead cohort.`,
    );
  }
  if (topAttention) parts.push(`${topAttention.detail}.`);

  return {
    title,
    summary:
      parts.join(" ") ||
      "SalsysOS will summarize movement, quality and action pressure as comparable CRM evidence becomes available.",
  };
}

function recommendedActionTitle(item: AttentionItem) {
  if (item.label === "Needs reply") return "Clear the reply backlog";
  if (item.label === "Overdue follow-ups") return "Complete overdue follow-ups";
  if (item.label === "First touch needed") {
    return "Assign and contact new opportunities";
  }
  if (item.label === "Payment pending") {
    return "Review payment-pending opportunities";
  }
  return item.label;
}

function pickPeriodRevenue(
  analytics: DashboardPeriodAnalytics,
  fallbackCurrency: string | null,
) {
  if (analytics.primaryCurrency) {
    return (
      analytics.revenue.find(
        (row) => row.currency === analytics.primaryCurrency,
      ) ?? null
    );
  }
  if (fallbackCurrency) {
    return (
      analytics.revenue.find(
        (row) => row.currency === fallbackCurrency.toUpperCase(),
      ) ?? null
    );
  }
  return analytics.revenue[0] ?? null;
}

function formatMoney(value: number, currency: string) {
  const code = currency?.trim().toUpperCase() || "INR";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(value || 0);
  } catch {
    return `${code} ${Number(value || 0).toLocaleString("en-IN")}`;
  }
}

function pretty(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}

function formatShortDate(value: string | undefined) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(date);
}
