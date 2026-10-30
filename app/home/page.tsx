import Link from "next/link";
import { redirect } from "next/navigation";
import {
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

import { isMockMode } from "@/lib/data";
import {
  getDashboardSnapshot,
  type DashboardBatchDemand,
  type DashboardRevenueSummary,
} from "@/lib/dashboard-data";
import {
  getDashboardPeriodAnalytics,
  resolveDashboardPeriod,
  type DashboardPeriodAnalytics,
  type DashboardPeriodRevenue,
  type DashboardPeriodSource,
} from "@/lib/dashboard-period-data";
import { createClient } from "@/lib/supabase/server";

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
  href: string;
  icon: LucideIcon;
  tone: "info" | "warning" | "critical";
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const query = await searchParams;
  const mock = isMockMode();

  if (!mock) {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) redirect("/login");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role,active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.active !== true) redirect("/login");
    if (profile.role === "admissions") redirect("/dashboard");
  }

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
    sources: liveSources,
    revenueSummary,
    upcomingBatches,
    unvaluedOpenLeads,
  } = snapshot;

  const primaryRevenue =
    revenueSummary.find((row) => row.collected > 0) ?? revenueSummary[0] ?? null;
  const periodPrimaryRevenue = pickPeriodRevenue(
    periodAnalytics,
    primaryRevenue?.currency ?? null,
  );
  const acquisitionSources: DashboardPeriodSource[] = periodAnalytics.available.leads
    ? periodAnalytics.sources
    : liveSources.map((source) => ({
        source: source.source,
        leads: source.leads,
        qualified: source.qualified,
        conversionRate: source.leads
          ? Math.round((source.qualified / source.leads) * 1000) / 10
          : null,
      }));

  const attentionItems: AttentionItem[] = [
    {
      label: "Needs reply",
      value: metrics.needsReply,
      detail: "Active conversations waiting on your team",
      href: "/conversations",
      icon: Inbox,
      tone: metrics.waitingOverHour > 0 ? "critical" : "info",
    },
    {
      label: "Overdue follow-ups",
      value: metrics.followupsDue,
      detail: "Scheduled sales actions that are due now",
      href: "/follow-ups",
      icon: Clock3,
      tone: metrics.followupsDue > 0 ? "warning" : "info",
    },
    {
      label: "First touch needed",
      value: metrics.needsFirstTouch,
      detail: "New opportunities without recorded contact",
      href: "/leads?view=unassigned",
      icon: UserRoundCheck,
      tone: metrics.needsFirstTouch > 0 ? "warning" : "info",
    },
    {
      label: "Payment pending",
      value: metrics.paymentPending,
      detail: "Commercial decisions currently at payment",
      href: "/pipeline",
      icon: CreditCard,
      tone: "info",
    },
  ];

  const activeAttention = attentionItems.filter((item) => item.value > 0);
  const totalAttention = attentionItems.reduce((sum, item) => sum + item.value, 0);
  const commandStatus = totalAttention > 0 ? "Needs attention" : "Operating normally";
  const commandSummary = buildCommandSummary(attentionItems);

  return (
    <div className="space-y-5 pb-8">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-brand-700 dark:text-brand-300">
            Home
          </div>
          <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.04em] text-copy-strong">
            Command Center
          </h1>
          <p className="mt-1 text-sm text-copy-muted">
            What needs attention, what changed, and where to act next.
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
                  Custom ranges are capped at 366 days. Comparisons use the immediately
                  preceding equal-length period when a valid baseline exists.
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
            href="/commercial-intelligence"
            className="inline-flex h-10 items-center gap-2 rounded-ui border border-ai-line bg-ai-soft px-3 text-xs font-semibold text-ai-text transition hover:bg-brand-50 dark:bg-brand-950/30"
          >
            <Sparkles size={14} /> Ask Salsys
          </Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)] lg:items-center lg:p-6">
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
                Business status
              </div>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-copy-strong">
                {commandStatus}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-copy-muted">
                {commandSummary}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <CompactStat label="Needs reply" value={metrics.needsReply} />
            <CompactStat label="Follow-ups" value={metrics.followupsDue} />
            <CompactStat label="Payment" value={metrics.paymentPending} />
            <CompactStat label="First touch" value={metrics.needsFirstTouch} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {attentionItems.map((item) => (
          <AttentionCard key={item.label} item={item} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(330px,.7fr)]">
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
          <SectionHeader
            eyebrow="Business performance"
            title="Revenue & conversion"
            actionHref="/revenue"
            actionLabel="Open revenue"
          />
          <div className="p-5">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <SnapshotMetric
                label="Collected"
                value={
                  periodPrimaryRevenue
                    ? formatMoney(periodPrimaryRevenue.current, periodPrimaryRevenue.currency)
                    : formatPeriodRevenue(periodAnalytics)
                }
                change={periodPrimaryRevenue?.changePercent ?? null}
              />
              <SnapshotMetric
                label="Pipeline"
                value={
                  primaryRevenue
                    ? formatMoney(primaryRevenue.pipeline, primaryRevenue.currency)
                    : "—"
                }
              />
              <SnapshotMetric
                label="Weighted"
                value={
                  primaryRevenue
                    ? formatMoney(primaryRevenue.weighted, primaryRevenue.currency)
                    : "—"
                }
              />
              <SnapshotMetric
                label="Qualified rate"
                value={
                  periodAnalytics.leads.conversionRate != null
                    ? `${periodAnalytics.leads.conversionRate}%`
                    : "—"
                }
              />
            </div>
            <RevenueTrend
              points={periodAnalytics.revenueSeries}
              currency={periodAnalytics.primaryCurrency}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
          <SectionHeader
            eyebrow="Needs your attention"
            title="Recommended actions"
            actionHref="/follow-ups"
            actionLabel="View work"
          />
          <div className="divide-y divide-line">
            {activeAttention.length ? (
              activeAttention.slice(0, 4).map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="group flex items-center gap-3 px-5 py-4 transition hover:bg-surface-muted"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ai-soft text-ai-text">
                    <Sparkles size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-copy-strong">
                      {recommendedActionTitle(item)}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-copy-muted">
                      {item.value.toLocaleString("en-IN")} · {item.detail}
                    </span>
                  </span>
                  <ArrowRight size={14} className="text-copy-subtle group-hover:text-brand-700" />
                </Link>
              ))
            ) : (
              <EmptyState text="There are no urgent sales actions in the current snapshot." />
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
            eyebrow="Marketing"
            title="Acquisition quality"
            actionHref="/marketing"
            actionLabel="Open marketing"
          />
          <div className="space-y-1 p-4">
            {acquisitionSources.length ? (
              acquisitionSources.slice(0, 6).map((source) => (
                <SourceRow key={source.source} source={source} />
              ))
            ) : (
              <EmptyState text="No acquisition data is recorded for this period yet." />
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
              {upcomingBatches.slice(0, 6).map((batch) => (
                <BatchCard key={batch.id} batch={batch} />
              ))}
            </div>
          ) : (
            <EmptyState text="No upcoming batches are currently available in this workspace." />
          )}
        </section>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PulseCard
          label="Active pipeline"
          value={metrics.activePipeline.toLocaleString("en-IN")}
          detail="Open opportunities"
          href="/pipeline"
        />
        <PulseCard
          label="High intent signal"
          value={metrics.highIntent.toLocaleString("en-IN")}
          detail="Existing derived signal"
          href="/pipeline"
        />
        <PulseCard
          label="Waiting > 1 hour"
          value={metrics.waitingOverHour.toLocaleString("en-IN")}
          detail="Aging reply backlog"
          href="/conversations"
        />
        <PulseCard
          label="Upcoming batches"
          value={upcomingBatches.length.toLocaleString("en-IN")}
          detail="Operational demand"
          href="/course-management"
        />
      </section>
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
      <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-copy-subtle">
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

function AttentionCard({ item }: { item: AttentionItem }) {
  const Icon = item.icon;
  const tone =
    item.tone === "critical"
      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
      : item.tone === "warning"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
        : "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300";

  return (
    <Link
      href={item.href}
      className="group rounded-card border border-line bg-surface p-4 shadow-sm transition hover:border-line-strong hover:shadow-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}>
          <Icon size={17} />
        </span>
        <ArrowRight size={14} className="mt-1 text-copy-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-700" />
      </div>
      <div className="mt-4 text-[25px] font-semibold tracking-[-0.04em] text-copy-strong">
        {item.value.toLocaleString("en-IN")}
      </div>
      <div className="mt-1 text-sm font-semibold text-copy-strong">{item.label}</div>
      <div className="mt-1 text-xs leading-5 text-copy-muted">{item.detail}</div>
    </Link>
  );
}

function CompactStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-muted px-3 py-3">
      <div className="text-xl font-semibold tracking-[-0.035em] text-copy-strong">
        {value.toLocaleString("en-IN")}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-copy-subtle">
        {label}
      </div>
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
}: {
  points: DashboardPeriodAnalytics["revenueSeries"];
  currency: string | null;
}) {
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
      <div className="mt-4 flex h-32 items-end gap-1.5 rounded-xl bg-surface-muted px-3 pb-3 pt-4" aria-label={`Cumulative ${currency} revenue collected across the selected period`}>
        {cumulative.map((point) => {
          const height = Math.max(5, Math.round((Math.abs(point.cumulative) / max) * 100));
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
  const width = Math.max(3, Math.min(100, source.conversionRate ?? 0));
  const smallSample = source.leads > 0 && source.leads < 10;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(90px,.7fr)_64px] items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-surface-muted">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-copy-strong">
          {pretty(source.source)}
        </div>
        <div className="mt-0.5 text-[10px] text-copy-subtle">
          {source.leads} leads · {source.qualified} qualified
          {smallSample ? " · small sample" : ""}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-brand-50 dark:bg-brand-950/30">
        <div className="h-full rounded-full bg-brand-700" style={{ width: `${width}%` }} />
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold text-copy-strong">
          {source.conversionRate == null ? "—" : `${source.conversionRate}%`}
        </div>
        <div className="text-[9px] text-copy-subtle">qualified</div>
      </div>
    </div>
  );
}

function PulseCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-card border border-line bg-surface px-4 py-3.5 shadow-sm transition hover:border-line-strong hover:bg-surface-muted"
    >
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-copy-subtle">
          {label}
        </div>
        <div className="mt-1 truncate text-xs text-copy-muted">{detail}</div>
      </div>
      <div className="shrink-0 text-2xl font-semibold tracking-[-0.04em] text-copy-strong">
        {value}
      </div>
    </Link>
  );
}

function BatchCard({ batch }: { batch: DashboardBatchDemand }) {
  const capacityText =
    batch.seatsRemaining != null
      ? `${batch.seatsRemaining} seats left`
      : batch.capacity != null
        ? `${batch.capacity} capacity`
        : "Capacity not set";

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
        <span>{batch.enrolled} enrolled</span>
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
      <span className={`${compact ? "text-[9px]" : "text-[10px]"} font-semibold text-copy-subtle`}>
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

function recommendedActionTitle(item: AttentionItem) {
  if (item.label === "Needs reply") return "Clear the reply backlog";
  if (item.label === "Overdue follow-ups") return "Complete overdue follow-ups";
  if (item.label === "First touch needed") return "Assign and contact new opportunities";
  if (item.label === "Payment pending") return "Review payment-pending opportunities";
  return item.label;
}

function buildCommandSummary(items: AttentionItem[]) {
  const active = items.filter((item) => item.value > 0);
  if (!active.length) return "No reply backlog, overdue follow-up, first-touch, or payment attention is currently recorded.";
  const top = active
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((item) => `${item.value.toLocaleString("en-IN")} ${item.label.toLowerCase()}`);
  return `${top.join(", ")}. Open the relevant workspace to act on the underlying records.`;
}

function pickPeriodRevenue(
  analytics: DashboardPeriodAnalytics,
  fallbackCurrency: string | null,
) {
  if (analytics.primaryCurrency) {
    return analytics.revenue.find((row) => row.currency === analytics.primaryCurrency) ?? null;
  }
  if (fallbackCurrency) {
    return analytics.revenue.find((row) => row.currency === fallbackCurrency.toUpperCase()) ?? null;
  }
  return analytics.revenue[0] ?? null;
}

function formatPeriodRevenue(analytics: DashboardPeriodAnalytics) {
  if (!analytics.available.revenue) return "Unavailable";
  const populated = analytics.revenue.filter((row) => row.current !== 0);
  const selected = (populated.length ? populated : analytics.revenue).slice(0, 2);
  if (!selected.length) return "No payments";
  return selected.map((row) => formatMoney(row.current, row.currency)).join(" · ");
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
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
