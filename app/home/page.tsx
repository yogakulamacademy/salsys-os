import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Inbox,
  Sparkles,
  TrendingUp,
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
  const totalAttention = activeAttention.reduce((sum, item) => sum + item.value, 0);
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
    <div className="space-y-5 pb-8">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-brand-700 dark:text-brand-300">
            SalsysOS
          </div>
          <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.04em] text-copy-strong">
            Command Center
          </h1>
          <p className="mt-1 text-sm text-copy-muted">
            One view of performance, attention, growth and operational demand.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PeriodPresets selected={periodAnalytics.period.preset} />
          <details className="group relative">
            <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-ui border border-line bg-surface px-3 text-xs font-semibold text-copy-muted shadow-sm transition hover:border-line-strong hover:text-copy-strong">
              <CalendarDays size={14} className="text-brand-700 dark:text-brand-300" />
              {periodAnalytics.period.label}
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-[310px] rounded-card border border-line bg-surface p-4 shadow-panel">
              <form action="/home" method="get" className="space-y-3">
                <input type="hidden" name="period" value="custom" />
                <DateField
                  id="dashboard-from"
                  name="from"
                  label="From"
                  defaultValue={periodAnalytics.period.startDate}
                />
                <DateField
                  id="dashboard-to"
                  name="to"
                  label="To"
                  defaultValue={periodAnalytics.period.endDate}
                />
                <p className="text-[11px] leading-5 text-copy-subtle">
                  Custom ranges are capped at 366 days. Comparisons use the immediately preceding equal-length period when a valid baseline exists.
                </p>
                <button
                  type="submit"
                  className="inline-flex h-10 w-full items-center justify-center rounded-ui bg-brand-700 px-4 text-xs font-semibold text-white transition hover:bg-brand-800"
                >
                  Apply date range
                </button>
              </form>
            </div>
          </details>
          <Link
            href="/marketing"
            className="inline-flex h-10 items-center gap-2 rounded-ui border border-ai-line bg-ai-soft px-3 text-xs font-semibold text-ai-text transition hover:bg-brand-50 dark:bg-brand-950/30"
          >
            <Sparkles size={14} /> Explore intelligence
          </Link>
        </div>
      </section>

      {missingPeriodEvidence.length ? (
        <section className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Selected-period evidence is incomplete</div>
            <p className="mt-1 text-xs leading-5">
              Unavailable: {missingPeriodEvidence.join(", ")}. Period KPIs stay unknown rather than falling back to all-time snapshot totals. Current action, pipeline and operational panels remain current-state evidence.
            </p>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)] lg:p-6">
          <div className="flex items-start gap-4">
            <span
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                totalAttention > 0
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              }`}
            >
              <TrendingUp size={20} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-copy-subtle">
                Salsys brief
              </div>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-copy-strong">
                {executiveBrief.title}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-copy-muted">
                {executiveBrief.summary}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-copy-muted">
                  Observed CRM evidence
                </span>
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-copy-muted">
                  {periodAnalytics.period.label}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 ${
                    totalAttention > 0
                      ? "bg-amber-50 text-amber-700"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {totalAttention > 0
                    ? `${totalAttention} actions need attention`
                    : "No urgent actions"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {changeSignals.map((signal) => (
              <ChangeSignalCard key={signal.label} signal={signal} />
            ))}
          </div>
        </div>
      </section>

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Business pulse"
      >
        <DecisionMetricCard
          icon={<Users size={17} />}
          label="Leads"
          value={totalLeads == null ? "—" : totalLeads.toLocaleString("en-IN")}
          detail={
            qualifiedLeads == null
              ? "Selected-period lead evidence unavailable"
              : `${qualifiedLeads.toLocaleString("en-IN")} qualified in scope`
          }
          delta={
            periodAnalytics.available.leads
              ? periodAnalytics.leads.changePercent
              : undefined
          }
          deltaDirection="neutral"
          comparisonLabel="vs previous comparable period"
          href="/leads"
          evidenceLabel={
            periodAnalytics.available.leads
              ? "CRM lead evidence"
              : "Evidence unavailable"
          }
          definition="Leads recorded in the selected reporting scope. If selected-period lead evidence cannot be verified, this metric stays unknown and does not substitute the current all-time snapshot."
        />
        <DecisionMetricCard
          icon={<TrendingUp size={17} />}
          label="Qualified rate"
          value={qualifiedRate == null ? "—" : `${qualifiedRate}%`}
          detail={
            periodAnalytics.available.leads
              ? "Lead-to-qualified CRM stage signal"
              : "Selected-period lead evidence unavailable"
          }
          href="/admissions"
          evidenceLabel={
            periodAnalytics.available.leads
              ? "CRM stage quality"
              : "Evidence unavailable"
          }
          definition="Share of leads created in the selected scope whose current CRM stage is qualified or later. This is a CRM stage ratio, not a predicted conversion probability."
        />
        <DecisionMetricCard
          icon={<UserRoundCheck size={17} />}
          label="Enrolled leads"
          value={
            enrolledLeads == null ? "—" : enrolledLeads.toLocaleString("en-IN")
          }
          detail={
            periodAnalytics.available.enrollments
              ? "Leads entering the enrolled CRM stage"
              : "Selected-period stage-history evidence unavailable"
          }
          delta={
            periodAnalytics.available.enrollments
              ? periodAnalytics.enrollments.changePercent
              : undefined
          }
          deltaDirection="higher_is_better"
          comparisonLabel="vs previous comparable period"
          href="/admissions"
          evidenceLabel={
            periodAnalytics.available.enrollments
              ? "CRM stage-history evidence"
              : "Evidence unavailable"
          }
          definition="Unique leads recorded entering the enrolled CRM stage in the selected scope. This is a CRM outcome signal and is not the authoritative operational Enrollment-record count."
        />
        <DecisionMetricCard
          icon={<CircleDollarSign size={17} />}
          label="Collected"
          value={collectedValue}
          detail={
            !periodAnalytics.available.revenue
              ? "Selected-period payment evidence unavailable"
              : periodPrimaryRevenue
                ? `${periodPrimaryRevenue.currency} paid evidence`
                : "No paid evidence in scope"
          }
          delta={periodPrimaryRevenue?.changePercent}
          deltaDirection="higher_is_better"
          comparisonLabel="vs previous comparable period"
          href="/revenue"
          evidenceLabel={
            periodAnalytics.available.revenue
              ? "Verified payment evidence"
              : "Evidence unavailable"
          }
          definition="Net collected revenue from verified payment evidence in the selected scope and displayed currency. Currencies are not combined without the explicit FX layer; unavailable period evidence stays unknown."
          trend={collectedTrend}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
          <SectionHeader
            eyebrow="Performance"
            title="Revenue & pipeline health"
            actionHref="/revenue"
            actionLabel="Open revenue"
          />
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,.85fr)]">
            <div>
              <div className="grid gap-5 sm:grid-cols-3">
                <SnapshotMetric
                  label="Collected in period"
                  value={collectedValue}
                  change={periodPrimaryRevenue?.changePercent ?? null}
                />
                <SnapshotMetric
                  label="Current pipeline value"
                  value={
                    primaryRevenue
                      ? formatMoney(primaryRevenue.pipeline, primaryRevenue.currency)
                      : "—"
                  }
                />
                <SnapshotMetric
                  label="Current weighted value"
                  value={
                    primaryRevenue
                      ? formatMoney(primaryRevenue.weighted, primaryRevenue.currency)
                      : "—"
                  }
                />
              </div>
              <RevenueTrend
                points={periodAnalytics.revenueSeries}
                currency={periodAnalytics.primaryCurrency}
                available={periodAnalytics.available.revenue}
              />
            </div>
            <PipelineSnapshot
              active={metrics.activePipeline}
              highIntent={metrics.highIntent}
              payment={metrics.paymentPending}
              enrolled={counts.enrolled ?? 0}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
          <SectionHeader
            eyebrow="Priority now"
            title="Action queue"
            actionHref="/admissions"
            actionLabel="Open admissions"
          />
          <div className="space-y-2 p-3">
            {activeAttention.length ? (
              activeAttention.map((item) => (
                <AttentionRow key={item.label} item={item} />
              ))
            ) : (
              <EmptyState text="No urgent reply, follow-up, first-touch or payment actions are recorded right now." />
            )}
          </div>
          {unvaluedOpenLeads > 0 ? (
            <Link
              href="/revenue"
              className="m-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"
            >
              <CircleDollarSign size={17} />
              {unvaluedOpenLeads} open opportunities need an estimated value
              <ArrowRight size={13} className="ml-auto" />
            </Link>
          ) : null}
        </section>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
          <SectionHeader
            eyebrow="Growth"
            title="Acquisition quality"
            actionHref="/marketing"
            actionLabel="Open marketing"
          />
          <div className="space-y-1 p-4">
            {acquisitionSources.length ? (
              acquisitionSources
                .slice(0, 6)
                .map((source) => <SourceRow key={source.source} source={source} />)
            ) : (
              <EmptyState
                text={
                  periodAnalytics.available.leads
                    ? "No acquisition data is recorded for this period yet."
                    : "Selected-period acquisition evidence is unavailable. Current all-time source totals have not been substituted."
                }
              />
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
          <SectionHeader
            eyebrow="Operations"
            title="Upcoming demand"
            actionHref="/course-management"
            actionLabel="Open operations"
          />
          {upcomingBatches.length ? (
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {upcomingBatches
                .slice(0, 6)
                .map((batch) => <BatchCard key={batch.id} batch={batch} />)}
            </div>
          ) : (
            <EmptyState text="No future-start batches are currently available in this workspace." />
          )}
        </section>
      </section>
    </div>
  );
}

function ChangeSignalCard({ signal }: { signal: ChangeSignal }) {
  const tone =
    signal.tone === "positive"
      ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-300"
      : signal.tone === "negative"
        ? "text-rose-700 bg-rose-50 dark:bg-rose-950/20 dark:text-rose-300"
        : signal.tone === "attention"
          ? "text-amber-700 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-300"
          : "text-copy-muted bg-surface-muted";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-3">
      <span className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${tone}`}>
        {signal.value}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-copy-strong">
          {signal.label}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-copy-subtle">
          {signal.detail}
        </span>
      </span>
    </div>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const Icon = item.icon;
  const tone =
    item.tone === "critical"
      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
      : item.tone === "warning"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
        : "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300";
  const priorityTone =
    item.tone === "critical"
      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
      : item.tone === "warning"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
        : "bg-surface-muted text-copy-muted";
  const priorityLabel =
    item.tone === "critical"
      ? "Urgent"
      : item.tone === "warning"
        ? "Attention"
        : "Review";

  return (
    <Link
      href={item.href}
      className="group block rounded-xl border border-line bg-surface px-4 py-3.5 transition hover:border-line-strong hover:bg-surface-muted"
    >
      <span className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-copy-strong">
              {recommendedActionTitle(item)}
            </span>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-copy-muted">
              {item.value.toLocaleString("en-IN")}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${priorityTone}`}
            >
              {priorityLabel}
            </span>
          </span>
          <span className="mt-1 block text-xs leading-5 text-copy-muted">
            {item.detail}
          </span>
          <span className="mt-2 block text-[11px] leading-5 text-copy-subtle">
            {item.reason}
          </span>
        </span>
      </span>
      <span className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-2.5 text-[10px] font-semibold">
        <span className="rounded-full bg-surface-muted px-2 py-1 text-copy-muted">
          {item.evidence}
        </span>
        <span className="rounded-full bg-surface-muted px-2 py-1 text-copy-muted">
          {item.timing}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-brand-700 dark:text-brand-300">
          {item.actionLabel}
          <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />
        </span>
      </span>
    </Link>
  );
}

function PipelineSnapshot({
  active,
  highIntent,
  payment,
  enrolled,
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
    ["Enrolled leads", enrolled],
  ] as const;
  const max = Math.max(1, ...rows.map(([, value]) => value));

  return (
    <div className="rounded-xl border border-line bg-surface-muted p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-copy-subtle">
        Admissions snapshot
      </div>
      <div className="mt-4 space-y-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-copy-muted">{label}</span>
              <span className="font-semibold tabular-nums text-copy-strong">
                {value.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-50 dark:bg-brand-950/30">
              <div
                className="h-full rounded-full bg-brand-700"
                style={{ width: `${Math.max(value ? 4 : 0, (value / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <Link
        href="/admissions?view=pipeline"
        className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300"
      >
        Work pipeline <ArrowRight size={12} />
      </Link>
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
  eyebrow,
  title,
  actionHref,
  actionLabel,
}: {
  eyebrow: string;
  title: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-copy-subtle">
          {eyebrow}
        </div>
        <div className="mt-1 text-base font-semibold text-copy-strong">{title}</div>
      </div>
      <Link
        href={actionHref}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300"
      >
        {actionLabel}
        <ArrowRight size={12} />
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
  points,
  currency,
  available,
}: {
  points: DashboardPeriodAnalytics["revenueSeries"];
  currency: string | null;
  available: boolean;
}) {
  if (!available) {
    return (
      <div className="mt-5 grid h-36 place-items-center rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-6 text-center text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
        Selected-period payment evidence is unavailable. Current snapshot revenue has not been substituted into this period trend.
      </div>
    );
  }

  if (!points.length || !currency) {
    return (
      <div className="mt-5 grid h-36 place-items-center rounded-xl border border-dashed border-line bg-surface-muted px-6 text-center text-xs text-copy-muted">
        Revenue trend will appear once paid transactions are recorded in the selected period.
      </div>
    );
  }

  let running = 0;
  const cumulative = points.map((point) => ({
    ...point,
    cumulative: (running += point.value),
  }));
  const max = Math.max(1, ...cumulative.map((point) => Math.abs(point.cumulative)));

  return (
    <div className="mt-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-copy-subtle">
            Cumulative collected · {currency}
          </div>
          <div className="mt-1 text-lg font-semibold text-copy-strong">
            {formatMoney(running, currency)}
          </div>
        </div>
        <div className="text-right text-[10px] text-copy-subtle">
          Paid transactions · refunds netted
        </div>
      </div>
      <div
        className="mt-4 flex h-32 items-end gap-1.5 rounded-xl bg-surface-muted px-3 pb-3 pt-4"
        aria-label={`Cumulative ${currency} revenue collected across the selected period`}
      >
        {cumulative.map((point) => {
          const height = Math.max(
            5,
            Math.round((Math.abs(point.cumulative) / max) * 100),
          );
          return (
            <span
              key={point.date}
              title={`${formatShortDate(point.date)} · ${formatMoney(point.cumulative, currency)}`}
              className="min-w-[3px] flex-1 rounded-sm bg-brand-700/70"
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function SourceRow({ source }: { source: DashboardPeriodSource }) {
  const width = percentageWidth(source.conversionRate);
  const smallSample = source.leads > 0 && source.leads < 10;

  return (
    <Link
      href={`/marketing?source=${encodeURIComponent(source.source)}`}
      className="grid grid-cols-[minmax(0,1fr)_minmax(90px,.7fr)_64px] items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-surface-muted"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-copy-strong">
          {sourceLabel(source.source)}
        </div>
        <div className="mt-0.5 text-[10px] text-copy-subtle">
          {source.leads} leads · {source.qualified} qualified
          {smallSample ? " · small sample" : ""}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-brand-50 dark:bg-brand-950/30">
        <div
          className="h-full rounded-full bg-brand-700"
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold text-copy-strong">
          {source.conversionRate == null ? "—" : `${source.conversionRate}%`}
        </div>
        <div className="text-[9px] text-copy-subtle">qualified</div>
      </div>
    </Link>
  );
}

function BatchCard({ batch }: { batch: DashboardBatchDemand }) {
  const capacityKnown = batch.capacity != null && batch.capacity > 0;
  const capacityText = !capacityKnown
    ? "Capacity not set"
    : batch.seatsRemaining != null
      ? `${batch.seatsRemaining} seats left`
      : `${batch.capacity} capacity`;

  return (
    <Link
      href="/course-management"
      className="rounded-xl border border-line bg-surface-muted p-3 transition hover:border-line-strong hover:bg-surface"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">
          <BookOpen size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-xs font-semibold leading-5 text-copy-strong">
            {batch.courseName}
          </div>
          <div className="mt-0.5 text-[10px] text-copy-subtle">
            {batch.startDate ? formatDate(batch.startDate) : "Date not set"} · {batch.location}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2 text-[10px] text-copy-muted">
        <span>{batch.activeDemand} active</span>
        <span>{batch.enrolled} enrolled leads</span>
        <span>{batch.paymentPending} payment</span>
        <span>{capacityText}</span>
      </div>
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
