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

type ChangeSignal = {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "negative" | "neutral" | "attention";
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
    counts,
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

  const totalLeads = periodAnalytics.available.leads
    ? periodAnalytics.leads.current
    : metrics.total;
  const qualifiedLeads = periodAnalytics.available.leads
    ? periodAnalytics.leads.qualified
    : counts.qualified ?? 0;
  const qualifiedRate =
    periodAnalytics.leads.conversionRate ??
    (totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 1000) / 10 : null);
  const enrolled = periodAnalytics.available.enrollments
    ? periodAnalytics.enrollments.current
    : counts.enrolled ?? 0;
  const collectedValue = periodPrimaryRevenue
    ? formatMoney(periodPrimaryRevenue.current, periodPrimaryRevenue.currency)
    : primaryRevenue
      ? formatMoney(primaryRevenue.collected, primaryRevenue.currency)
      : "—";

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
      detail: "Scheduled sales actions already due",
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
      detail: "Opportunities currently at payment stage",
      href: "/pipeline",
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
                <DateField id="dashboard-from" name="from" label="From" defaultValue={periodAnalytics.period.startDate} />
                <DateField id="dashboard-to" name="to" label="To" defaultValue={periodAnalytics.period.endDate} />
                <p className="text-[11px] leading-5 text-copy-subtle">
                  Custom ranges are capped at 366 days. Comparisons use the immediately preceding equal-length period when a valid baseline exists.
                </p>
                <button type="submit" className="inline-flex h-10 w-full items-center justify-center rounded-ui bg-brand-700 px-4 text-xs font-semibold text-white transition hover:bg-brand-800">
                  Apply date range
                </button>
              </form>
            </div>
          </details>
          <Link href="/marketing" className="inline-flex h-10 items-center gap-2 rounded-ui border border-ai-line bg-ai-soft px-3 text-xs font-semibold text-ai-text transition hover:bg-brand-50 dark:bg-brand-950/30">
            <Sparkles size={14} /> Explore intelligence
          </Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)] lg:p-6">
          <div className="flex items-start gap-4">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${totalAttention > 0 ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>
              <TrendingUp size={20} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-copy-subtle">Salsys brief</div>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-copy-strong">
                {executiveBrief.title}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-copy-muted">
                {executiveBrief.summary}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-copy-muted">Observed CRM evidence</span>
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-copy-muted">{periodAnalytics.period.label}</span>
                <span className={`rounded-full px-2.5 py-1 ${totalAttention > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {totalAttention > 0 ? `${totalAttention} actions need attention` : "No urgent actions"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {changeSignals.map((signal) => <ChangeSignalCard key={signal.label} signal={signal} />)}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Business pulse">
        <BusinessMetric
          icon={<Users size={17} />}
          label="Leads"
          value={totalLeads.toLocaleString("en-IN")}
          detail={`${qualifiedLeads.toLocaleString("en-IN")} qualified in scope`}
          change={periodAnalytics.available.leads ? periodAnalytics.leads.changePercent : null}
          href="/leads"
        />
        <BusinessMetric
          icon={<TrendingUp size={17} />}
          label="Qualified rate"
          value={qualifiedRate == null ? "—" : `${qualifiedRate}%`}
          detail="Lead-to-qualified quality signal"
          href="/admissions"
        />
        <BusinessMetric
          icon={<UserRoundCheck size={17} />}
          label="Enrollments"
          value={enrolled.toLocaleString("en-IN")}
          detail="Recorded enrolled outcomes"
          change={periodAnalytics.available.enrollments ? periodAnalytics.enrollments.changePercent : null}
          href="/admissions"
        />
        <BusinessMetric
          icon={<CircleDollarSign size={17} />}
          label="Collected"
          value={collectedValue}
          detail={periodPrimaryRevenue ? `${periodPrimaryRevenue.currency} paid evidence` : "Verified collected revenue"}
          change={periodPrimaryRevenue?.changePercent ?? null}
          href="/revenue"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
          <SectionHeader eyebrow="Performance" title="Revenue & pipeline health" actionHref="/revenue" actionLabel="Open revenue" />
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,.85fr)]">
            <div>
              <div className="grid gap-5 sm:grid-cols-3">
                <SnapshotMetric label="Collected" value={collectedValue} change={periodPrimaryRevenue?.changePercent ?? null} />
                <SnapshotMetric label="Pipeline value" value={primaryRevenue ? formatMoney(primaryRevenue.pipeline, primaryRevenue.currency) : "—"} />
                <SnapshotMetric label="Weighted value" value={primaryRevenue ? formatMoney(primaryRevenue.weighted, primaryRevenue.currency) : "—"} />
              </div>
              <RevenueTrend points={periodAnalytics.revenueSeries} currency={periodAnalytics.primaryCurrency} />
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
          <SectionHeader eyebrow="Priority now" title="Action queue" actionHref="/admissions" actionLabel="Open admissions" />
          <div className="divide-y divide-line">
            {activeAttention.length ? activeAttention.map((item) => <AttentionRow key={item.label} item={item} />) : <EmptyState text="No urgent reply, follow-up, first-touch or payment actions are recorded right now." />}
          </div>
          {unvaluedOpenLeads > 0 ? (
            <Link href="/revenue" className="m-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
              <CircleDollarSign size={17} />
              {unvaluedOpenLeads} open opportunities need an estimated value
              <ArrowRight size={13} className="ml-auto" />
            </Link>
          ) : null}
        </section>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
          <SectionHeader eyebrow="Growth" title="Acquisition quality" actionHref="/marketing" actionLabel="Open marketing" />
          <div className="space-y-1 p-4">
            {acquisitionSources.length ? acquisitionSources.slice(0, 6).map((source) => <SourceRow key={source.source} source={source} />) : <EmptyState text="No acquisition data is recorded for this period yet." />}
          </div>
        </section>

        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
          <SectionHeader eyebrow="Operations" title="Upcoming demand" actionHref="/course-management" actionLabel="Open operations" />
          {upcomingBatches.length ? (
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {upcomingBatches.slice(0, 6).map((batch) => <BatchCard key={batch.id} batch={batch} />)}
            </div>
          ) : <EmptyState text="No upcoming batches are currently available in this workspace." />}
        </section>
      </section>
    </div>
  );
}

function BusinessMetric({ icon, label, value, detail, change, href }: { icon: React.ReactNode; label: string; value: string; detail: string; change?: number | null; href: string }) {
  return (
    <Link href={href} className="group rounded-card border border-line bg-surface p-4 shadow-sm transition hover:border-line-strong hover:shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">{icon}</span>
        <ArrowRight size={14} className="mt-1 text-copy-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-700" />
      </div>
      <div className="mt-4 flex items-end gap-2">
        <div className="min-w-0 truncate text-[25px] font-semibold tracking-[-0.04em] text-copy-strong">{value}</div>
        {change !== undefined ? <div className="mb-1"><TrendPill value={change ?? null} compact /></div> : null}
      </div>
      <div className="mt-1 text-sm font-semibold text-copy-strong">{label}</div>
      <div className="mt-1 text-xs leading-5 text-copy-muted">{detail}</div>
    </Link>
  );
}

function ChangeSignalCard({ signal }: { signal: ChangeSignal }) {
  const tone = signal.tone === "positive"
    ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-300"
    : signal.tone === "negative"
      ? "text-rose-700 bg-rose-50 dark:bg-rose-950/20 dark:text-rose-300"
      : signal.tone === "attention"
        ? "text-amber-700 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-300"
        : "text-copy-muted bg-surface-muted";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-3">
      <span className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${tone}`}>{signal.value}</span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-copy-strong">{signal.label}</span>
        <span className="mt-0.5 block truncate text-[10px] text-copy-subtle">{signal.detail}</span>
      </span>
    </div>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const Icon = item.icon;
  const tone = item.tone === "critical"
    ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
    : item.tone === "warning"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
      : "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300";
  return (
    <Link href={item.href} className="group flex items-center gap-3 px-5 py-4 transition hover:bg-surface-muted">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={15} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-copy-strong">{recommendedActionTitle(item)}</span>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-copy-muted">{item.value.toLocaleString("en-IN")}</span>
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-copy-muted">{item.detail}</span>
      </span>
      <ArrowRight size={14} className="text-copy-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-700" />
    </Link>
  );
}

function PipelineSnapshot({ active, highIntent, payment, enrolled }: { active: number; highIntent: number; payment: number; enrolled: number }) {
  const rows = [
    ["Active pipeline", active],
    ["High intent", highIntent],
    ["Payment pending", payment],
    ["Enrolled", enrolled],
  ] as const;
  const max = Math.max(1, ...rows.map(([, value]) => value));
  return (
    <div className="rounded-xl border border-line bg-surface-muted p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-copy-subtle">Admissions snapshot</div>
      <div className="mt-4 space-y-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-copy-muted">{label}</span>
              <span className="font-semibold tabular-nums text-copy-strong">{value.toLocaleString("en-IN")}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-50 dark:bg-brand-950/30">
              <div className="h-full rounded-full bg-brand-700" style={{ width: `${Math.max(value ? 4 : 0, (value / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <Link href="/admissions" className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300">
        Work admissions <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function DateField({ id, name, label, defaultValue }: { id: string; name: string; label: string; defaultValue: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-copy-subtle">{label}</label>
      <input id={id} name={name} type="date" defaultValue={defaultValue} className="mt-1 h-10 w-full rounded-ui border border-line bg-surface px-3 text-sm text-copy-strong outline-none transition focus:border-brand-700 focus:ring-2 focus:ring-brand-700/10" />
    </div>
  );
}

function PeriodPresets({ selected }: { selected: DashboardPeriodAnalytics["period"]["preset"] }) {
  const options = [["7d", "7D"], ["30d", "30D"], ["90d", "90D"], ["ytd", "YTD"]] as const;
  return (
    <div className="inline-flex h-10 items-center rounded-ui border border-line bg-surface p-1 shadow-sm">
      {options.map(([value, label]) => (
        <Link key={value} href={`/home?period=${value}`} className={`inline-flex h-8 min-w-10 items-center justify-center rounded-md px-2.5 text-[11px] font-semibold transition ${selected === value ? "bg-brand-700 text-white" : "text-copy-muted hover:bg-brand-50 hover:text-brand-700"}`}>{label}</Link>
      ))}
    </div>
  );
}

function SectionHeader({ eyebrow, title, actionHref, actionLabel }: { eyebrow: string; title: string; actionHref: string; actionLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-copy-subtle">{eyebrow}</div>
        <div className="mt-1 text-base font-semibold text-copy-strong">{title}</div>
      </div>
      <Link href={actionHref} className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300">{actionLabel}<ArrowRight size={12} /></Link>
    </div>
  );
}

function SnapshotMetric({ label, value, change }: { label: string; value: string; change?: number | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-copy-subtle">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tracking-[-0.035em] text-copy-strong">{value}</div>
      {change !== undefined ? <div className="mt-1"><TrendPill value={change ?? null} compact /></div> : null}
    </div>
  );
}

function RevenueTrend({ points, currency }: { points: DashboardPeriodAnalytics["revenueSeries"]; currency: string | null }) {
  if (!points.length || !currency) {
    return <div className="mt-5 grid h-36 place-items-center rounded-xl border border-dashed border-line bg-surface-muted px-6 text-center text-xs text-copy-muted">Revenue trend will appear once paid transactions are recorded in the selected period.</div>;
  }

  let running = 0;
  const cumulative = points.map((point) => ({ ...point, cumulative: (running += point.value) }));
  const max = Math.max(1, ...cumulative.map((point) => Math.abs(point.cumulative)));

  return (
    <div className="mt-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-copy-subtle">Cumulative collected · {currency}</div>
          <div className="mt-1 text-lg font-semibold text-copy-strong">{formatMoney(running, currency)}</div>
        </div>
        <div className="text-right text-[10px] text-copy-subtle">Paid transactions · refunds netted</div>
      </div>
      <div className="mt-4 flex h-32 items-end gap-1.5 rounded-xl bg-surface-muted px-3 pb-3 pt-4" aria-label={`Cumulative ${currency} revenue collected across the selected period`}>
        {cumulative.map((point) => {
          const height = Math.max(5, Math.round((Math.abs(point.cumulative) / max) * 100));
          return <span key={point.date} title={`${formatShortDate(point.date)} · ${formatMoney(point.cumulative, currency)}`} className="min-w-[3px] flex-1 rounded-sm bg-brand-700/70" style={{ height: `${height}%` }} />;
        })}
      </div>
    </div>
  );
}

function SourceRow({ source }: { source: DashboardPeriodSource }) {
  const width = Math.max(3, Math.min(100, source.conversionRate ?? 0));
  const smallSample = source.leads > 0 && source.leads < 10;
  return (
    <Link href={`/marketing?source=${encodeURIComponent(source.source)}`} className="grid grid-cols-[minmax(0,1fr)_minmax(90px,.7fr)_64px] items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-surface-muted">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-copy-strong">{pretty(source.source)}</div>
        <div className="mt-0.5 text-[10px] text-copy-subtle">{source.leads} leads · {source.qualified} qualified{smallSample ? " · small sample" : ""}</div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-brand-50 dark:bg-brand-950/30"><div className="h-full rounded-full bg-brand-700" style={{ width: `${width}%` }} /></div>
      <div className="text-right">
        <div className="text-sm font-semibold text-copy-strong">{source.conversionRate == null ? "—" : `${source.conversionRate}%`}</div>
        <div className="text-[9px] text-copy-subtle">qualified</div>
      </div>
    </Link>
  );
}

function BatchCard({ batch }: { batch: DashboardBatchDemand }) {
  const capacityText = batch.seatsRemaining != null ? `${batch.seatsRemaining} seats left` : batch.capacity != null ? `${batch.capacity} capacity` : "Capacity not set";
  return (
    <Link href="/course-management" className="rounded-xl border border-line bg-surface-muted p-3 transition hover:border-line-strong hover:bg-surface">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300"><BookOpen size={16} /></span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-xs font-semibold leading-5 text-copy-strong">{batch.courseName}</div>
          <div className="mt-0.5 text-[10px] text-copy-subtle">{batch.startDate ? formatDate(batch.startDate) : "Date not set"} · {batch.location}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2 text-[10px] text-copy-muted">
        <span>{batch.activeDemand} active</span><span>{batch.enrolled} enrolled</span><span>{batch.paymentPending} payment</span><span>{capacityText}</span>
      </div>
    </Link>
  );
}

function TrendPill({ value, compact = false }: { value: number | null; compact?: boolean }) {
  if (value == null) return <span className={`${compact ? "text-[9px]" : "text-[10px]"} font-semibold text-copy-subtle`}>No baseline</span>;
  const positive = value > 0;
  const negative = value < 0;
  const tone = positive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : negative ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300" : "bg-surface-muted text-copy-muted";
  return <span className={`inline-flex items-center rounded-full ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"} font-semibold ${tone}`}>{positive ? "↑ " : negative ? "↓ " : ""}{value > 0 ? "+" : ""}{value.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-5 py-10 text-sm leading-6 text-copy-muted">{text}</div>;
}

function buildChangeSignals(analytics: DashboardPeriodAnalytics, waitingOverHour: number): ChangeSignal[] {
  const leadDelta = analytics.leads.changePercent;
  const enrollmentDelta = analytics.enrollments.changePercent;
  return [
    {
      label: "Lead momentum",
      value: leadDelta == null ? "—" : `${leadDelta > 0 ? "+" : ""}${leadDelta.toFixed(1)}%`,
      detail: leadDelta == null ? "No comparable lead baseline" : `${analytics.leads.current.toLocaleString("en-IN")} leads vs ${analytics.leads.previous.toLocaleString("en-IN")} prior`,
      tone: leadDelta == null ? "neutral" : leadDelta >= 0 ? "positive" : "negative",
    },
    {
      label: "Enrollment movement",
      value: enrollmentDelta == null ? "—" : `${enrollmentDelta > 0 ? "+" : ""}${enrollmentDelta.toFixed(1)}%`,
      detail: enrollmentDelta == null ? "No comparable enrollment baseline" : `${analytics.enrollments.current.toLocaleString("en-IN")} enrolled in scope`,
      tone: enrollmentDelta == null ? "neutral" : enrollmentDelta >= 0 ? "positive" : "negative",
    },
    {
      label: "Reply SLA pressure",
      value: waitingOverHour.toLocaleString("en-IN"),
      detail: waitingOverHour > 0 ? "conversations waiting more than one hour" : "no conversations beyond one hour",
      tone: waitingOverHour > 0 ? "attention" : "positive",
    },
  ];
}

function buildExecutiveBrief({ analytics, sources, attention, qualifiedRate }: { analytics: DashboardPeriodAnalytics; sources: DashboardPeriodSource[]; attention: AttentionItem[]; qualifiedRate: number | null }) {
  const strongestSource = [...sources]
    .filter((source) => source.leads > 0)
    .sort((a, b) => (b.qualified - a.qualified) || ((b.conversionRate ?? 0) - (a.conversionRate ?? 0)))[0];
  const topAttention = [...attention].sort((a, b) => b.value - a.value)[0];
  const leadChange = analytics.leads.changePercent;
  const title = topAttention
    ? `${topAttention.value.toLocaleString("en-IN")} ${topAttention.label.toLowerCase()} should be reviewed first.`
    : leadChange != null && leadChange > 0
      ? `Lead volume is up ${leadChange.toFixed(1)}% with no urgent action backlog.`
      : "The workspace has no urgent operational backlog right now.";

  const parts: string[] = [];
  if (leadChange != null) parts.push(`Lead volume is ${leadChange >= 0 ? "up" : "down"} ${Math.abs(leadChange).toFixed(1)}% versus the previous comparable period.`);
  if (qualifiedRate != null) parts.push(`${qualifiedRate}% of leads in scope are qualified.`);
  if (strongestSource) parts.push(`${pretty(strongestSource.source)} currently contributes the most qualified leads among visible sources.`);
  if (topAttention) parts.push(`${topAttention.detail}.`);

  return {
    title,
    summary: parts.join(" ") || "SalsysOS will summarize movement, quality and action pressure as comparable CRM evidence becomes available.",
  };
}

function recommendedActionTitle(item: AttentionItem) {
  if (item.label === "Needs reply") return "Clear the reply backlog";
  if (item.label === "Overdue follow-ups") return "Complete overdue follow-ups";
  if (item.label === "First touch needed") return "Assign and contact new opportunities";
  if (item.label === "Payment pending") return "Review payment-pending opportunities";
  return item.label;
}

function pickPeriodRevenue(analytics: DashboardPeriodAnalytics, fallbackCurrency: string | null) {
  if (analytics.primaryCurrency) return analytics.revenue.find((row) => row.currency === analytics.primaryCurrency) ?? null;
  if (fallbackCurrency) return analytics.revenue.find((row) => row.currency === fallbackCurrency.toUpperCase()) ?? null;
  return analytics.revenue[0] ?? null;
}

function formatMoney(value: number, currency: string) {
  const code = currency?.trim().toUpperCase() || "INR";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(value || 0);
  } catch {
    return `${code} ${Number(value || 0).toLocaleString("en-IN")}`;
  }
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatShortDate(value: string | undefined) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}
