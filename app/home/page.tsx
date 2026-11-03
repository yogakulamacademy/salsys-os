import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Inbox,
  Sparkles,
  UserRoundCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { DecisionMetricCard } from "@/components/intelligence/decision-metric-card";
import { isMockMode } from "@/lib/data";
import { percentageWidth, sourceLabel } from "@/lib/ui-format";
import {
  getDashboardSnapshot,
  type DashboardBatchDemand,
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

type AttentionItem = {
  label: string;
  value: number;
  detail: string;
  reason: string;
  evidence: string;
  timing: string;
  actionLabel: string;
  href: string;
  icon: LucideIcon;
  tone: "info" | "warning" | "critical";
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

  const [snapshot, periodAnalytics] = await Promise.all([
    getDashboardSnapshot(),
    mock
      ? Promise.resolve<DashboardPeriodAnalytics>({
          period: periodFallback,
          available: { leads: false, revenue: false, enrollments: false },
          revenue: [],
          primaryCurrency: null,
          revenueSeries: [],
          leads: {
            current: 0,
            previous: 0,
            changePercent: null,
            qualified: 0,
            conversionRate: null,
          },
          enrollments: { current: 0, previous: 0, changePercent: null },
          sources: [],
        })
      : getDashboardPeriodAnalytics(query),
  ]);

  const {
    metrics,
    counts,
    revenueSummary,
    upcomingBatches,
    unvaluedOpenLeads,
  } = snapshot;

  const primaryRevenue =
    revenueSummary.find((row) => row.collected > 0) ?? revenueSummary[0] ?? null;
  const periodPrimaryRevenue = periodAnalytics.available.revenue
    ? pickPeriodRevenue(periodAnalytics, primaryRevenue?.currency ?? null)
    : null;

  const acquisitionSources: DashboardPeriodSource[] = periodAnalytics.available.leads
    ? periodAnalytics.sources
    : [];

  const totalLeads = periodAnalytics.available.leads
    ? periodAnalytics.leads.current
    : null;
  const qualifiedLeads = periodAnalytics.available.leads
    ? periodAnalytics.leads.qualified
    : null;
  const qualifiedRate = periodAnalytics.available.leads
    ? periodAnalytics.leads.conversionRate
    : null;
  const enrolledLeads = periodAnalytics.available.enrollments
    ? periodAnalytics.enrollments.current
    : null;

  const collectedValue = periodPrimaryRevenue
    ? formatMoney(periodPrimaryRevenue.current, periodPrimaryRevenue.currency)
    : "—";
  const collectedTrend =
    periodAnalytics.available.revenue &&
    periodAnalytics.primaryCurrency &&
    periodPrimaryRevenue?.currency === periodAnalytics.primaryCurrency
      ? periodAnalytics.revenueSeries.map((point) => point.value)
      : undefined;

  const attentionItems: AttentionItem[] = [
    {
      label: "Needs reply",
      value: metrics.needsReply,
      detail: "Active conversations waiting on your team",
      reason: "A human reply is still outstanding on active customer conversations.",
      evidence: "Observed conversation state",
      timing:
        metrics.waitingOverHour > 0
          ? `${metrics.waitingOverHour} waiting >1h`
          : "Open now",
      actionLabel: "Open inbox",
      href: "/conversations",
      icon: Inbox,
      tone: metrics.waitingOverHour > 0 ? "critical" : "info",
    },
    {
      label: "Overdue follow-ups",
      value: metrics.followupsDue,
      detail: "Scheduled sales actions already due",
      reason:
        "The recorded follow-up due time has already passed and the task remains open.",
      evidence: "Scheduled task evidence",
      timing: "Past due",
      actionLabel: "Work follow-ups",
      href: "/follow-ups",
      icon: Clock3,
      tone: metrics.followupsDue > 0 ? "warning" : "info",
    },
    {
      label: "First touch needed",
      value: metrics.needsFirstTouch,
      detail: "New opportunities without recorded contact",
      reason:
        "These opportunities do not yet have a recorded first outbound touch in CRM.",
      evidence: "CRM contact history",
      timing: "First touch pending",
      actionLabel: "Review new leads",
      href: "/leads?view=unassigned",
      icon: UserRoundCheck,
      tone: metrics.needsFirstTouch > 0 ? "warning" : "info",
    },
    {
      label: "Payment pending",
      value: metrics.paymentPending,
      detail: "Opportunities currently at payment stage",
      reason:
        "Payment-stage opportunities need proof, questions or collection status reconciled before enrollment is treated as complete.",
      evidence: "Pipeline & payment state",
      timing: "Payment stage",
      actionLabel: "Review payments",
      href: "/admissions?view=payments",
      icon: CreditCard,
      tone: "info",
    },
  ];

  const activeAttention = attentionItems.filter((item) => item.value > 0);
  const changeSignals = buildChangeSignals(periodAnalytics, metrics.waitingOverHour);
  const executiveBrief = buildExecutiveBrief({
    analytics: periodAnalytics,
    sources: acquisitionSources,
    attention: activeAttention,
    qualifiedRate,
  });
  const missingPeriodEvidence = [
    !periodAnalytics.available.leads ? "lead acquisition" : null,
    !periodAnalytics.available.revenue ? "collected revenue" : null,
    !periodAnalytics.available.enrollments ? "enrolled-lead history" : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="command-center-v2 mx-auto max-w-[1480px] space-y-4 pb-8 sm:space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-copy-strong">Command Center</h1>
          <p className="mt-1 text-[13px] leading-5 text-copy-muted">
            Track performance, see what needs attention, and keep work moving.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPresets selected={periodAnalytics.period.preset} />
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
          <Link href="/marketing" className="inline-flex h-10 items-center gap-2 rounded-ui border border-line bg-surface px-3 text-xs font-semibold text-copy-strong hover:border-brand-300 hover:text-brand-700">
            <Sparkles size={14} /> Explore intelligence
          </Link>
        </div>
      </header>

      {missingPeriodEvidence.length ? (
        <section aria-label="Reporting coverage" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>
            <strong>Selected-period evidence is incomplete.</strong> Unavailable: {missingPeriodEvidence.join(", ")}.
            Period KPIs stay unknown rather than falling back to all-time snapshot totals. Current attention and pipeline panels use current-state evidence.
          </p>
        </section>
      ) : null}

      <section aria-label="Business pulse" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="command-kpi min-w-0">
          <DecisionMetricCard
            icon={<Users size={17} />}
            label="Leads"
            value={totalLeads == null ? "—" : totalLeads.toLocaleString("en-IN")}
            detail="Created in the selected period"
            delta={periodAnalytics.available.leads ? periodAnalytics.leads.changePercent : undefined}
            deltaDirection="neutral"
            comparisonLabel="vs previous comparable period"
            href="/leads"
            evidenceLabel={periodAnalytics.available.leads ? "CRM lead evidence" : "Evidence unavailable"}
            definition="Leads created in the selected period. Missing period evidence stays unknown rather than substituting current snapshot totals."
          />
        </div>
        <div className="command-kpi min-w-0">
          <DecisionMetricCard
            icon={<Inbox size={17} />}
            label="Needs reply"
            value={metrics.needsReply.toLocaleString("en-IN")}
            detail="Current conversations awaiting a team reply"
            href="/conversations"
            evidenceLabel="Current conversation state"
            definition="Current active customer conversations that need a reply. Unlike the other cards, this is a current queue count, not a selected-period conversation total."
          />
        </div>
        <div className="command-kpi min-w-0">
          <DecisionMetricCard
            icon={<UserRoundCheck size={17} />}
            label="Qualified leads"
            value={qualifiedLeads == null ? "—" : qualifiedLeads.toLocaleString("en-IN")}
            detail={qualifiedRate == null ? "Selected-period stage evidence unavailable" : String(qualifiedRate) + "% of new leads in scope"}
            href="/admissions"
            evidenceLabel={periodAnalytics.available.leads ? "CRM stage evidence" : "Evidence unavailable"}
            definition="Leads created in the selected period whose current CRM stage is qualified or later. This is a cohort-stage snapshot, not a sequential funnel conversion probability."
          />
        </div>
        <div className="command-kpi min-w-0">
          <DecisionMetricCard
            icon={<CircleDollarSign size={17} />}
            label="Collected"
            value={collectedValue}
            detail={!periodAnalytics.available.revenue ? "Selected-period payment evidence unavailable" : periodPrimaryRevenue ? periodPrimaryRevenue.currency + " verified net paid" : "No verified paid amount in scope"}
            delta={periodPrimaryRevenue?.changePercent}
            deltaDirection="higher_is_better"
            comparisonLabel="vs previous comparable period"
            href="/revenue"
            evidenceLabel={periodAnalytics.available.revenue ? "Verified payment evidence" : "Evidence unavailable"}
            definition="Net collected revenue from verified payment evidence in the selected period and displayed currency. Different currencies are never combined without approved FX evidence."
            trend={collectedTrend}
          />
        </div>
      </section>

      {activeAttention.length > 0 ? (
        <section aria-label="Top priority" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-copy-strong">
              {activeAttention[0].value.toLocaleString("en-IN")} · {recommendedActionTitle(activeAttention[0])}
            </h2>
            <p className="mt-1 text-xs leading-5 text-copy-muted">{activeAttention[0].detail}. {activeAttention[0].timing}.</p>
          </div>
          <Link href={activeAttention[0].href} className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-ui bg-brand-700 px-3 text-xs font-semibold text-white hover:bg-brand-800 sm:self-auto">
            {activeAttention[0].actionLabel} <ArrowRight size={13} />
          </Link>
        </section>
      ) : null}

      <section aria-label="Performance and work queue" className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.85fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
          <SectionHeader eyebrow="Performance · period" title="Performance overview" actionHref="/revenue" actionLabel="Open revenue" />
          <div className="p-4 sm:p-5">
            <RevenueTrend points={periodAnalytics.revenueSeries} currency={periodAnalytics.primaryCurrency} available={periodAnalytics.available.revenue} />
            <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <SnapshotMetric label="Enrolled leads" value={enrolledLeads == null ? "—" : enrolledLeads.toLocaleString("en-IN")} />
              <SnapshotMetric label="Active pipeline · now" value={metrics.activePipeline.toLocaleString("en-IN")} />
              <SnapshotMetric label="High intent · now" value={metrics.highIntent.toLocaleString("en-IN")} />
            </div>
            <p className="mt-3 text-[11px] leading-5 text-copy-subtle">
              Enrolled leads reflect CRM stage-history entries in the period, not the authoritative operational Enrollment-record count. Pipeline and intent are current-state counts.
            </p>
            <details className="mt-3 border-t border-line pt-3">
              <summary className="cursor-pointer text-xs font-medium text-brand-700 dark:text-brand-300">Financial context</summary>
              <div className="mt-3 grid gap-4 rounded-xl bg-surface-muted p-3 sm:grid-cols-3">
                <SnapshotMetric label="Collected in period" value={collectedValue} change={periodPrimaryRevenue?.changePercent ?? null} />
                <SnapshotMetric label="Current pipeline value" value={primaryRevenue ? formatMoney(primaryRevenue.pipeline, primaryRevenue.currency) : "—"} />
                <SnapshotMetric label="Current weighted value" value={primaryRevenue ? formatMoney(primaryRevenue.weighted, primaryRevenue.currency) : "—"} />
              </div>
            </details>
          </div>
        </section>
        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
          <SectionHeader eyebrow="Needs attention · current" title="Action queue" actionHref="/admissions" actionLabel="View all" />
          <div className="space-y-1 p-3 sm:p-4">
            {activeAttention.length ? activeAttention.map((item) => <AttentionRow key={item.label} item={item} />) : <EmptyState text="No urgent reply, follow-up, first-touch or payment actions are recorded right now." />}
          </div>
          {unvaluedOpenLeads > 0 ? (
            <Link href="/revenue" className="mx-4 mb-4 flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2.5 text-xs text-copy-muted hover:text-brand-700">
              <CircleDollarSign size={15} /> <span className="flex-1">{unvaluedOpenLeads} open opportunities have no estimated value</span><ArrowRight size={13} />
            </Link>
          ) : null}
        </section>
      </section>

      <section aria-label="Business breakdown" className="grid min-w-0 gap-4 lg:grid-cols-3">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
          <SectionHeader eyebrow="Acquisition · period" title="Lead sources" actionHref="/marketing" actionLabel="See sources" />
          <div className="space-y-1 p-3 sm:p-4">
            {acquisitionSources.length ? acquisitionSources.slice(0, 4).map((source) => <SourceRow key={source.source} source={source} periodTotal={totalLeads} />) : <EmptyState text={periodAnalytics.available.leads ? "No acquisition data is recorded for this period yet." : "Selected-period acquisition evidence is unavailable. Current all-time source totals have not been substituted."} />}
          </div>
        </section>
        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
          <SectionHeader eyebrow="Operations · current" title="Upcoming batch demand" actionHref="/course-management" actionLabel="See batches" />
          <div className="space-y-1 p-3 sm:p-4">
            {upcomingBatches.length ? upcomingBatches.slice(0, 3).map((batch) => <BatchCard key={batch.id} batch={batch} />) : <EmptyState text="No future-start batches are currently available in this workspace." />}
          </div>
        </section>
        <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
          <SectionHeader eyebrow="Sales · current" title="Pipeline health" actionHref="/admissions?view=pipeline" actionLabel="Open pipeline" />
          <div className="p-4">
            <PipelineSnapshot active={metrics.activePipeline} highIntent={metrics.highIntent} payment={metrics.paymentPending} enrolled={counts.enrolled ?? 0} />
          </div>
        </section>
      </section>

      <section aria-label="Daily workspace" className="grid min-w-0 gap-4 lg:grid-cols-3">
        <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-copy-strong">Operational insights</h2>
          <p className="mt-1 text-xs leading-5 text-copy-muted">Evidence from your CRM, not a predicted outcome.</p>
          <div className="mt-4 space-y-2">
            {changeSignals.slice(0, 2).map((signal) => <ChangeSignalCard key={signal.label} signal={signal} />)}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-copy-subtle">{executiveBrief.summary}</p>
        </section>
        <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-copy-strong">Quick actions</h2>
          <p className="mt-1 text-xs leading-5 text-copy-muted">Open the workspace you need.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              { href: "/conversations", label: "Conversations" },
              { href: "/leads", label: "Leads" },
              { href: "/course-management", label: "Courses" },
              { href: "/campaigns", label: "Campaigns" },
            ].map((action) => (
              <Link key={action.href} href={action.href} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line bg-surface-muted px-3 text-xs font-semibold text-copy-strong transition hover:border-brand-300 hover:text-brand-700">
                <span className="truncate">{action.label}</span><ArrowRight size={13} className="shrink-0" />
              </Link>
            ))}
          </div>
        </section>
        <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-copy-strong">System health</h2>
          <p className="mt-1 text-xs leading-5 text-copy-muted">Provider status and sync freshness are checked in the live health monitor.</p>
          <div className="mt-4 rounded-xl border border-line bg-surface-muted p-3">
            <span className="text-xs font-medium text-copy-strong">Status not loaded on this page</span>
            <p className="mt-1 text-[11px] leading-5 text-copy-muted">Open System Health for verified connection conditions.</p>
          </div>
          <Link href="/system-health" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
            View system health <ArrowRight size={13} />
          </Link>
        </section>
      </section>
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
      className="group flex items-center gap-3 rounded-xl px-2.5 py-3 transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      title={item.reason + " · " + item.evidence}
    >
      <span className={"grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-muted " + tone}>
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-copy-strong">{recommendedActionTitle(item)}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-copy-muted">{item.timing}</span>
      </span>
      <span className="shrink-0 rounded-lg bg-surface-muted px-2 py-1 text-xs font-semibold tabular-nums text-copy-strong">
        {item.value.toLocaleString("en-IN")}
      </span>
      <ArrowRight size={13} className="shrink-0 text-copy-subtle group-hover:text-brand-700" />
    </Link>
  );
}

function PipelineSnapshot({
  active, highIntent, payment, enrolled,
}: {
  active: number;
  highIntent: number;
  payment: number;
  enrolled: number;
}) {
  const rows = [
    ["Active pipeline", active],
    ["High intent", highIntent],
    ["Payment pending", payment],
    ["Enrolled stage", enrolled],
  ] as const;
  const max = Math.max(1, ...rows.map(([, value]) => value));

  return (
    <div className="space-y-4">
      {rows.map(([label, value]) => (
        <div key={label}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-copy-muted">{label}</span>
            <span className="font-semibold tabular-nums text-copy-strong">{value.toLocaleString("en-IN")}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-brand-600/75" style={{ width: percentageWidth((value / max) * 100) + "%" }} />
          </div>
        </div>
      ))}
      <p className="text-[10px] leading-4 text-copy-subtle">Current CRM stage indicators; not a sequential conversion funnel.</p>
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
      <div className="mt-4 grid h-40 place-items-center rounded-xl border border-dashed border-amber-200 bg-amber-50/50 px-5 text-center text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
        Selected-period payment evidence is unavailable. Current snapshot revenue has not been substituted into this period trend.
      </div>
    );
  }
  if (!points.length || !currency) {
    return (
      <div className="mt-4 grid h-40 place-items-center rounded-xl border border-dashed border-line bg-surface-muted px-5 text-center text-xs leading-5 text-copy-muted">
        Revenue trend will appear once verified paid transactions are recorded in the selected period.
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
          <p className="text-[11px] text-copy-muted">Cumulative collected · {currency}</p>
          <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-copy-strong">{formatMoney(running, currency)}</p>
        </div>
        <span className="text-[11px] text-copy-subtle">Verified payments · refunds netted</span>
      </div>
      <svg className="mt-4 block h-[150px] w-full overflow-visible text-brand-700 dark:text-brand-300" viewBox="0 0 560 140" preserveAspectRatio="none" role="img" aria-label={"Cumulative verified net collected " + currency + " for the selected period"}>
        <title>Cumulative verified net collected {currency} for the selected period</title>
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

function SourceRow({ source, periodTotal }: { source: DashboardPeriodSource; periodTotal: number | null }) {
  const share = periodTotal != null && periodTotal > 0 ? (source.leads / periodTotal) * 100 : null;
  return (
    <Link href={"/marketing?source=" + encodeURIComponent(source.source)} className="group block rounded-xl px-2 py-2.5 transition hover:bg-surface-muted">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block truncate text-xs font-medium text-copy-strong">{sourceLabel(source.source)}</span>
          <span className="mt-0.5 block text-[11px] text-copy-subtle">{source.qualified.toLocaleString("en-IN")} qualified</span>
        </div>
        <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-copy-strong">
          {source.leads.toLocaleString("en-IN")}
          <span className="ml-2 font-normal text-copy-subtle">{share == null ? "—" : share.toFixed(1) + "%"}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-brand-600/75" style={{ width: percentageWidth(share) + "%" }} />
      </div>
    </Link>
  );
}

function BatchCard({ batch }: { batch: DashboardBatchDemand }) {
  const capacityKnown = batch.capacity != null && batch.capacity > 0;
  const capacityText = !capacityKnown
    ? "Capacity not set"
    : batch.seatsRemaining != null
      ? String(batch.seatsRemaining) + " seats left"
      : String(batch.capacity) + " capacity";
  return (
    <Link href="/course-management" className="group flex items-start justify-between gap-3 rounded-xl px-2 py-3 transition hover:bg-surface-muted">
      <span className="min-w-0">
        <span className="block line-clamp-1 text-xs font-medium text-copy-strong">{batch.courseName}</span>
        <span className="mt-0.5 block text-[11px] text-copy-subtle">
          {batch.startDate ? formatDate(batch.startDate) : "Date not set"} · {batch.location}
        </span>
        <span className="mt-1 block text-[10px] text-copy-subtle">{capacityText}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums text-copy-strong">{batch.activeDemand.toLocaleString("en-IN")}</span>
        <span className="block text-[10px] text-copy-subtle">active leads</span>
      </span>
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

function EmptyState({ text }: { text: string }) {
  return <div className="px-5 py-10 text-sm leading-6 text-copy-muted">{text}</div>;
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
  const topAttention = [...attention].sort((a, b) => b.value - a.value)[0];
  const leadChange = analytics.available.leads
    ? analytics.leads.changePercent
    : null;
  const attentionPhrases: Record<string, string> = {
    "Needs reply": topAttention?.value === 1 ? "conversation is waiting for a reply" : "conversations are waiting for a reply",
    "Overdue follow-ups": topAttention?.value === 1 ? "follow-up is overdue" : "follow-ups are overdue",
    "First touch needed": topAttention?.value === 1 ? "lead needs a first contact" : "leads need a first contact",
    "Payment pending": topAttention?.value === 1 ? "opportunity needs payment follow-up" : "opportunities need payment follow-up",
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
    parts.push(`${qualifiedRate}% of leads in scope are qualified.`);
  }
  if (strongestSource) {
    parts.push(
      `${pretty(strongestSource.source)} currently contributes the most qualified leads among visible sources.`,
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
