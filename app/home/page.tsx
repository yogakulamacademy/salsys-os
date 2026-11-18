import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  CreditCard,
  GitBranch,
  HeartPulse,
  Inbox,
  Lightbulb,
  ListTodo,
  Megaphone,
  MessageSquareText,
  Plus,
  Rocket,
  Target,
  TriangleAlert,
  UserRoundCheck,
  UserRoundX,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { KpiCard } from "@/components/home/command-center/kpi-card";
import { LeadActivityPanel } from "@/components/home/command-center/lead-activity-panel";
import { LocationsPanel } from "@/components/home/command-center/locations-panel";
import { BarRow, Panel, ToneChip } from "@/components/home/command-center/panel";
import { PipelineHealthPanel } from "@/components/home/command-center/pipeline-health-panel";
import { AiAutopilotPanel } from "@/components/home/command-center/ai-autopilot-panel";
import { SourceQualityPanel } from "@/components/home/command-center/source-quality-panel";
import { HomeEmptyState } from "@/components/home/home-empty-state";
import { HomeReportingCoverage, type HomeReportingEvidence } from "@/components/home/home-reporting-coverage";
import { isMockMode } from "@/lib/data";
import { getHomeV1MetricTruth, type HomeV1MetricTruth } from "@/lib/home-v1-metric-truth";
import { buildHomeSourceSignals, reconcileHomeSourceQualification } from "@/lib/home-source-intelligence";
import { buildHomeNextActions, type HomeNextAction, type HomeActionId } from "@/lib/home-next-actions";
import { groupHomePipelineStages } from "@/lib/home-stage-groups";
import {
  buildHomeInsights,
  changeChip,
  percentOf,
  type Chip,
  type ChipTone,
} from "@/lib/home-command-center";
import {
  getHomeCommandCenterSnapshot,
  type HomeCommandCenterSnapshot,
} from "@/lib/home-command-center-data";
import { getDashboardSnapshot } from "@/lib/dashboard-data";
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

type QueueRow = {
  id: string;
  label: string;
  hint: string;
  count: number;
  href: string;
  icon: LucideIcon;
  tone: "critical" | "warning" | "info";
  provisional?: boolean;
  reason?: string;
};

type HealthItem = { label: string; note: string; state: "ok" | "warn" | "bad" };

const DONUT_COLORS = ["#5743c5", "#8b7be0", "#b3a7ef", "#d6cff7", "#e9e5fb"];
const ADS_STALE_DAYS = 3;

export default async function HomePage({ searchParams }: HomePageProps) {
  const query = await searchParams;
  const mock = isMockMode();
  const periodFallback = resolveDashboardPeriod(query);

  const [snapshot, periodAnalytics, metricTruth, extras] = await Promise.all([
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
    mock
      ? Promise.resolve<HomeCommandCenterSnapshot>({
          ownership: null,
          payments: null,
          courses: null,
          locations: null,
          freshness: { adsLastSuccessAt: null, adsLatestFailed: false, instagramAppRepliesCaptured: false },
        })
      : getHomeCommandCenterSnapshot(),
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
  const reportingEvidence: HomeReportingEvidence[] = [
    { id: "lead-acquisition", label: "Lead acquisition", available: periodAnalytics.available.leads, basis: "Period event" },
    { id: "qualification-cohort", label: "Qualification milestones", available: historicalQualification != null, basis: "Period cohort" },
    { id: "recorded-payments", label: "Recorded payment ledger", available: periodAnalytics.available.revenue, basis: "Period event" },
    { id: "enrolled-stage", label: "Enrolled-stage history", available: periodAnalytics.available.enrollments, basis: "Period event" },
    { id: "open-valuation", label: "Open opportunity values", available: pipelineTruth != null, basis: "Current snapshot" },
  ];

  const leadChip: Chip = periodAnalytics.available.leads
    ? changeChip(periodAnalytics.leads.current, periodAnalytics.leads.previous)
    : { text: "Evidence unavailable", tone: "warn" };
  const qualifiedChip: Chip = qualifiedRate == null
    ? { text: "History unavailable", tone: "warn" }
    : { text: `${qualifiedRate}% of leads`, tone: qualifiedLeads ? "flat" : "warn" };
  const pipelineChip: Chip = !pipelineTruth
    ? { text: "Unavailable", tone: "warn" }
    : { text: `${pipelineTruth.valuedCount.toLocaleString("en-IN")} of ${pipelineTruth.eligibleCount.toLocaleString("en-IN")} valued · now`, tone: pipelineTruth.valuedCount === pipelineTruth.eligibleCount ? "flat" : "warn" };
  const pendingPayments = extras.payments?.pending ?? [];
  const pendingCount = pendingPayments.reduce((sum, row) => sum + row.count, 0);
  const collectionsChip: Chip = !periodAnalytics.available.revenue
    ? { text: "Evidence unavailable", tone: "warn" }
    : pendingCount
      ? { text: `${pendingCount} pending · unreconciled`, tone: "warn" }
      : { text: "Ledger · unreconciled", tone: "flat" };

  const replyProvisional = !extras.freshness.instagramAppRepliesCaptured;
  const queue: QueueRow[] = [
    ...(extras.ownership && extras.ownership.unassignedOpen > 0
      ? [{
          id: "unassigned",
          label: "Assign owners",
          hint: "Open leads · no owner recorded",
          reason: "Nobody is accountable for following these leads up.",
          count: extras.ownership.unassignedOpen,
          href: "/leads?view=unassigned",
          icon: UserRoundX,
          tone: "critical" as const,
        }]
      : []),
    ...activeAttention.map((item) => ({
      id: item.id,
      label: item.label,
      // Reason and evidence stay visible (no hover needed); the reply count is
      // marked provisional while replies sent from the Instagram app are not captured.
      hint: item.id === "reply-queue" && replyProvisional
        ? "Provisional · Instagram app replies not captured"
        : `${item.timing} · ${item.evidence}`,
      reason: item.reason,
      count: item.value,
      href: item.href,
      icon: item.icon,
      tone: item.tone,
      provisional: item.id === "reply-queue" && replyProvisional,
    })),
  ].slice(0, 5);

  const stageGroups = groupHomePipelineStages(counts);
  const insights = [
    ...buildHomeInsights({
      sources: validatedSourceQuality,
      currentLeads: periodAnalytics.available.leads ? periodAnalytics.leads.current : null,
      previousLeads: periodAnalytics.available.leads ? periodAnalytics.leads.previous : null,
    }),
    ...sourceSignals.map((signal, index) => ({
      id: `signal-${index}`,
      title: signal.title,
      detail: signal.detail,
      value: "",
      tone: "warn" as ChipTone,
      href: signal.href,
    })),
  ].slice(0, 3);

  const donutTotal = acquisitionSources.reduce((sum, row) => sum + row.leads, 0);
  const donutRows = [...acquisitionSources].sort((a, b) => b.leads - a.leads);
  const donutTop = donutRows.slice(0, 4);
  const donutOther = donutRows.slice(4).reduce((sum, row) => sum + row.leads, 0);
  const donutSegments = [
    ...donutTop.map((row) => ({ label: row.source, leads: row.leads })),
    ...(donutOther ? [{ label: "Other", leads: donutOther }] : []),
  ];

  const courseRows = extras.courses?.rows.slice(0, 5) ?? [];
  const courseMax = Math.max(1, ...courseRows.map((row) => row.leads));

  const adsAgeDays = extras.freshness.adsLastSuccessAt
    ? Math.floor((Date.now() - new Date(extras.freshness.adsLastSuccessAt).getTime()) / 86_400_000)
    : null;
  const health: HealthItem[] = [
    { label: "Leads & stages", note: periodAnalytics.available.leads ? "Live" : "Unavailable", state: periodAnalytics.available.leads ? "ok" : "bad" },
    { label: "Qualification history", note: historicalQualification ? "Live" : "Unavailable", state: historicalQualification ? "ok" : "warn" },
    { label: "Follow-ups", note: "Live", state: "ok" },
    {
      label: "Payments",
      note: !extras.payments ? "Unavailable" : extras.payments.paidCount === 0 ? "0 confirmed" : "Unreconciled",
      state: !extras.payments ? "bad" : "warn",
    },
    {
      label: "Opportunity values",
      note: pipelineTruth ? percentOf(pipelineTruth.valuedCount, pipelineTruth.eligibleCount) : "Unavailable",
      state: pipelineTruth && pipelineTruth.eligibleCount > 0 && pipelineTruth.valuedCount / pipelineTruth.eligibleCount >= 0.8 ? "ok" : "warn",
    },
    {
      label: "Location",
      note: extras.locations ? percentOf(extras.locations.filled, extras.locations.total) : "Unavailable",
      state: extras.locations && extras.locations.total > 0 && extras.locations.filled / extras.locations.total >= 0.5 ? "ok" : "warn",
    },
    { label: "Instagram app replies", note: replyProvisional ? "Not captured" : "Live", state: replyProvisional ? "bad" : "ok" },
    {
      label: "Google & Meta ads",
      note: adsAgeDays == null ? "Never synced" : adsAgeDays === 0 ? (extras.freshness.adsLatestFailed ? "Today · last run failed" : "Today") : `${adsAgeDays}d old`,
      state: adsAgeDays != null && adsAgeDays <= ADS_STALE_DAYS && !extras.freshness.adsLatestFailed ? "ok" : "bad",
    },
  ];
  const healthOk = health.filter((item) => item.state === "ok").length;
  const markedEnrolledUnpaid = extras.payments && extras.payments.paidCount === 0 ? counts.enrolled ?? 0 : 0;
  const periodSeries = periodAnalytics.leadSeries.map((point) => ({
    label: formatShortDate(point.date),
    current: point.current,
    previous: point.previous,
  }));

  return (
    <div className="command-center-v3 w-full min-w-0 space-y-4 pb-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-copy-strong">Command Center</h1>
          <p className="mt-0.5 text-sm text-copy-muted">
            {totalLeads == null ? "—" : totalLeads.toLocaleString("en-IN")} leads · {qualifiedLeads == null ? "—" : qualifiedLeads.toLocaleString("en-IN")} qualified · {collectedValue === "—" ? "no payments recorded" : `${collectedValue} recorded`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPresets selected={periodAnalytics.period.preset} />
          <details className="group relative">
            <summary className="inline-flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-[13px] font-semibold text-copy-strong hover:border-line-strong" title="UTC reporting days">
              <CalendarDays size={16} className="text-brand-700" />
              <span className="max-w-[190px] truncate">{periodAnalytics.period.label}</span>
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-[min(310px,calc(100vw-40px))] rounded-card border border-line bg-surface p-4 shadow-panel">
              <form action="/home" method="get" className="space-y-3">
                <input type="hidden" name="period" value="custom" />
                <DateField id="dashboard-from" name="from" label="From" defaultValue={periodAnalytics.period.startDate} />
                <DateField id="dashboard-to" name="to" label="To" defaultValue={periodAnalytics.period.endDate} />
                <p className="text-[11px] leading-5 text-copy-subtle">UTC reporting days · up to 366 days.</p>
                <button type="submit" className="h-10 w-full rounded-ui bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800">Apply date range</button>
              </form>
            </div>
          </details>
        </div>
      </header>

      <section aria-label="Business pulse" className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 min-[1100px]:grid-cols-4">
        <KpiCard
          icon={<Users size={18} />}
          label="Leads"
          value={totalLeads == null ? "—" : totalLeads.toLocaleString("en-IN")}
          chip={leadChip}
          trend={periodAnalytics.available.leads ? periodAnalytics.leadSeries.map((point) => point.current) : null}
          href="/leads"
          evidenceLabel={periodAnalytics.available.leads ? "CRM lead evidence" : "Evidence unavailable"}
          evidenceState={periodAnalytics.available.leads ? "observed" : "unknown"}
          definition="Leads created in the selected period. Missing period evidence stays unknown rather than substituting current snapshot totals."
        />
        <KpiCard
          icon={<UserRoundCheck size={18} />}
          label="Qualified"
          value={qualifiedLeads == null ? "—" : qualifiedLeads.toLocaleString("en-IN")}
          chip={qualifiedChip}
          trend={null}
          href={sourceDetailHref}
          muted={qualifiedLeads == null}
          evidenceLabel={historicalQualification ? "Qualification-stage history" : "Evidence unavailable"}
          evidenceState={historicalQualification ? "derived" : "unknown"}
          definition="New leads in the selected period that reached qualified, high intent, payment pending or enrolled by period end, from recorded stage history."
        />
        <KpiCard
          icon={<GitBranch size={18} />}
          label="Pipeline value"
          value={openPipelineValue}
          chip={pipelineChip}
          trend={null}
          href="/revenue/valuation"
          muted={openPipelineValue === "—"}
          emptyText="Not valued yet"
          evidenceLabel={pipelineTruth ? "Open-lead valuation evidence" : "Evidence unavailable"}
          evidenceState={pipelineTruth ? (pipelineTruth.eligibleCount === pipelineTruth.valuedCount ? "derived" : "partial") : "unknown"}
          definition="As of now: positive potential values on open leads, one currency at a time. Not revenue; does not change with the period filter."
        />
        <KpiCard
          icon={<CreditCard size={18} />}
          label="Recorded collections"
          value={collectedValue}
          chip={collectionsChip}
          trend={null}
          href="/revenue"
          muted={collectedValue === "—"}
          emptyText="None confirmed"
          evidenceLabel={periodAnalytics.available.revenue ? "Recorded payment ledger · unverified" : "Evidence unavailable"}
          evidenceState="partial"
          definition="Paid minus refunded CRM payment records in the selected period. Not yet reconciled to bank or payment-provider settlement."
        />
      </section>

      <div className="flex flex-wrap gap-3.5">
        <LeadActivityPanel
          points={periodSeries}
          total={totalLeads}
          previousTotal={periodAnalytics.available.leads ? periodAnalytics.leads.previous : null}
          chip={leadChip}
          periodLabel={periodAnalytics.period.label}
          available={periodAnalytics.available.leads}
        />

        <Panel id="home-action-queue" icon={<Zap size={19} />} title="Action queue" action={{ href: "/follow-ups", label: "Work queue" }} className="flex-[1_1_340px]">
          {queue.length ? (
            <ul className="flex flex-col">
              {queue.map((item) => (
                <AttentionRow key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <HomeEmptyState
              variant="queue"
              compact
              unavailable={mock}
              title={mock ? "Queue evidence unavailable" : "Nothing waiting"}
              description={mock ? "Queue counts cannot be verified in this environment." : "No overdue work is recorded."}
            />
          )}
        </Panel>

        {!mock ? <AiAutopilotPanel /> : null}
      </div>

      <div className="flex flex-wrap gap-3.5">
        <PipelineHealthPanel groups={stageGroups} />
        <SourceQualityPanel
          rows={validatedSourceQuality ? validatedSourceQuality.map((row) => ({ source: row.source, leads: row.leads, qualified: row.qualified })) : null}
          href={sourceDetailHref}
        />
        <Panel id="home-money" icon={<CircleDollarSign size={19} />} title="Money" action={{ href: "/revenue", label: "Revenue" }} className="flex-[1_1_320px]">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1 rounded-[14px] bg-brand-50 p-3.5">
              <span className="text-xs font-semibold text-copy-muted">Recorded</span>
              <span className="text-2xl font-extrabold tabular-nums text-copy-strong">{collectedValue}</span>
              <span className="text-xs text-copy-muted">{extras.payments ? `${extras.payments.paidCount} paid` : "—"}</span>
            </div>
            <div className="flex flex-col gap-1 rounded-[14px] bg-amber-50 p-3.5">
              <span className="text-xs font-semibold text-amber-800">Pending</span>
              <span className="text-2xl font-extrabold tabular-nums text-copy-strong">{extras.payments ? pendingCount.toLocaleString("en-IN") : "—"}</span>
              <span className="text-xs text-amber-800">payment links</span>
            </div>
          </div>
          {pendingPayments.length ? (
            <div className="flex flex-col gap-2">
              {pendingPayments.slice(0, 3).map((row) => (
                <div key={row.currency} className="grid grid-cols-[48px_minmax(0,1fr)_96px] items-center gap-2.5 text-[13px]">
                  <span className="font-semibold text-copy-strong">{row.currency}</span>
                  <span className="block h-2 overflow-hidden rounded-full bg-amber-50">
                    <span className="block h-full rounded-full bg-amber-400" style={{ width: `${Math.max(4, (row.count / Math.max(1, pendingCount)) * 100)}%` }} />
                  </span>
                  <span className="text-right font-bold tabular-nums text-copy-strong">{formatMoney(row.amount, row.currency)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {markedEnrolledUnpaid > 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[13px] font-semibold text-rose-700">
              <TriangleAlert size={16} aria-hidden="true" />
              {markedEnrolledUnpaid} marked enrolled · 0 payments confirmed
            </p>
          ) : null}
        </Panel>
      </div>

      <div className="flex flex-wrap gap-3.5">
        <Panel id="home-sources" icon={<Target size={19} />} title="Lead sources" action={{ href: sourceDetailHref, label: "Analyze" }} className="flex-[1_1_320px]">
          {donutTotal > 0 ? (
            <div className="flex items-center gap-4">
              <SourceDonut segments={donutSegments} total={donutTotal} />
              <ul className="flex min-w-0 flex-1 flex-col gap-2">
                {donutSegments.map((segment, index) => (
                  <li key={segment.label} className="grid grid-cols-[12px_minmax(0,1fr)_52px] items-center gap-2 text-[13px]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT_COLORS[index] }} aria-hidden="true" />
                    <span className="truncate text-copy-strong">{segment.label}</span>
                    <span className="text-right font-bold tabular-nums text-copy-strong">{percentOf(segment.leads, donutTotal, 1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <HomeEmptyState
              variant="sources"
              compact
              unavailable={!periodAnalytics.available.leads}
              title="No source evidence for this period."
              description="All-time totals are never substituted."
            />
          )}
        </Panel>

        <Panel
          id="home-courses"
          icon={<BookOpen size={19} />}
          title="Course demand"
          badge={extras.courses ? { text: `${percentOf(extras.courses.tagged, extras.courses.totalLeads)} tagged`, tone: "warn" } : null}
          action={{ href: "/course-management", label: "Programs" }}
          className="flex-[1_1_320px]"
        >
          {courseRows.length ? (
            <div className="flex flex-col gap-3">
              {courseRows.map((row) => (
                <BarRow key={row.name} label={row.name} value={row.leads} max={courseMax} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-brand-50 px-3 py-6 text-center text-[13px] text-copy-muted">No course interest recorded yet.</p>
          )}
        </Panel>

        <LocationsPanel breakdown={extras.locations} />
      </div>

      <div className="flex flex-wrap gap-3.5">
        <Panel id="home-insights" icon={<Lightbulb size={19} />} title="Insights" className="flex-[1_1_320px]">
          {insights.length ? (
            <ul className="flex flex-col">
              {insights.map((insight) => (
                <li key={insight.id}>
                  <Link href={insight.href} className="flex flex-col gap-0.5 border-b border-line py-2.5 last:border-b-0 hover:bg-surface-soft">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-copy-strong">{insight.title}</span>
                      <span className={`text-sm font-extrabold tabular-nums ${INSIGHT_TONES[insight.tone]}`}>{insight.value}</span>
                    </span>
                    <span className="line-clamp-2 text-xs text-copy-muted">{insight.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-brand-50 px-3 py-6 text-center text-[13px] text-copy-muted">Not enough evidence for insights yet.</p>
          )}
        </Panel>

        <Panel id="home-data-health" icon={<HeartPulse size={19} />} title="Data health" action={{ href: "/system-health", label: "Details" }} className="flex-[1_1_320px]">
          <div className="flex items-center gap-4">
            <ScoreRing value={healthOk} total={health.length} />
            <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
              {health.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-[13px]">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOTS[item.state]}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-copy-strong">{item.label}</span>
                  <span className="text-xs text-copy-muted">{item.note}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel id="home-quick-actions" icon={<Rocket size={19} />} title="Quick actions" className="flex-[1_1_320px]">
          <div className="grid grid-cols-3 gap-2.5">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-[14px] border border-brand-50 bg-surface-soft px-1.5 py-2.5 text-center hover:border-brand-100 hover:bg-brand-50"
              >
                <action.icon size={20} className="text-brand-700" aria-hidden="true" />
                <span className="text-xs font-semibold text-copy-strong">{action.label}</span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <HomeReportingCoverage items={reportingEvidence} />
    </div>
  );
}

function AttentionRow({ item }: { item: QueueRow }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        title={item.reason}
        className="flex min-h-[52px] items-center gap-3 border-b border-line py-1.5 hover:bg-surface-soft"
      >
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${QUEUE_TONES[item.provisional ? "info" : item.tone]}`} aria-hidden="true">
          <Icon size={17} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-copy-strong">{item.label}</span>
          <span className="text-xs leading-4 text-copy-muted">{item.hint}</span>
        </span>
        <span className={`rounded-lg bg-brand-50 px-2.5 py-1 text-[13px] font-extrabold tabular-nums ${item.provisional ? "text-copy-subtle" : "text-copy-strong"}`}>
          {item.count.toLocaleString("en-IN")}
        </span>
      </Link>
    </li>
  );
}

const QUEUE_TONES: Record<QueueRow["tone"], string> = {
  critical: "bg-rose-50 text-rose-700",
  warning: "bg-amber-50 text-amber-800",
  info: "bg-brand-50 text-brand-700",
};

const INSIGHT_TONES: Record<ChipTone, string> = {
  up: "text-emerald-700",
  down: "text-rose-700",
  warn: "text-amber-800",
  flat: "text-copy-muted",
};

const HEALTH_DOTS: Record<HealthItem["state"], string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
};

const QUICK_ACTIONS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/conversations", label: "Inbox", icon: MessageSquareText },
  { href: "/leads/new", label: "Add lead", icon: Plus },
  { href: "/follow-ups", label: "Follow-ups", icon: ListTodo },
  { href: "/revenue", label: "Revenue", icon: CreditCard },
  { href: "/course-management", label: "Batches", icon: CalendarDays },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
];

function SourceDonut({ segments, total }: { segments: { label: string; leads: number }[]; total: number }) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label={segments.map((segment) => `${segment.label} ${segment.leads}`).join(", ")}>
        <circle cx="64" cy="64" r={radius} fill="none" strokeWidth="16" className="stroke-brand-50" />
        {segments.map((segment, index) => {
          const length = (segment.leads / total) * circumference;
          const circle = (
            <circle
              key={segment.label}
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              strokeWidth="16"
              stroke={DONUT_COLORS[index]}
              strokeDasharray={`${length.toFixed(2)} ${(circumference - length + 0.01).toFixed(2)}`}
              strokeDashoffset={(-offset).toFixed(2)}
              transform="rotate(-90 64 64)"
            />
          );
          offset += length;
          return circle;
        })}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-xl font-extrabold tabular-nums text-copy-strong">{total.toLocaleString("en-IN")}</span>
        <span className="text-[11px] text-copy-muted">leads</span>
      </div>
    </div>
  );
}

function ScoreRing({ value, total }: { value: number; total: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const share = total > 0 ? value / total : 0;
  return (
    <div className="relative h-[108px] w-[108px] shrink-0">
      <svg width="108" height="108" viewBox="0 0 108 108" aria-hidden="true">
        <circle cx="54" cy="54" r={radius} fill="none" strokeWidth="12" className="stroke-brand-50" />
        <circle
          cx="54"
          cy="54"
          r={radius}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          className="stroke-brand-700"
          strokeDasharray={`${(share * circumference).toFixed(2)} ${circumference.toFixed(2)}`}
          transform="rotate(-90 54 54)"
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-xl font-extrabold tabular-nums text-copy-strong">{value}/{total}</span>
        <span className="text-[11px] text-copy-muted">reliable</span>
      </div>
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
