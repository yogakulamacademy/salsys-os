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
  Search,
  Sparkles,
  TrendingUp,
  UserRoundCheck,
  Users,
  WalletCards,
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

  const totalActiveDemand = upcomingBatches.reduce(
    (sum, batch) => sum + batch.activeDemand,
    0,
  );
  const trackedSeats = upcomingBatches.filter((batch) => batch.seatsRemaining != null);
  const seatsRemaining = trackedSeats.reduce(
    (sum, batch) => sum + Number(batch.seatsRemaining ?? 0),
    0,
  );
  const primaryRevenue =
    revenueSummary.find((row) => row.collected > 0) ?? revenueSummary[0] ?? null;
  const periodPrimaryRevenue = pickPeriodRevenue(periodAnalytics, primaryRevenue?.currency ?? null);
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

  const attentionItems: Array<{
    label: string;
    value: number;
    detail: string;
    href: string;
    icon: LucideIcon;
  }> = [
    {
      label: "Inbox replies waiting",
      value: metrics.needsReply,
      detail: "Across active conversations",
      href: "/conversations",
      icon: Inbox,
    },
    {
      label: "Follow-ups due",
      value: metrics.followupsDue,
      detail: "Scheduled actions now due",
      href: "/follow-ups",
      icon: Clock3,
    },
    {
      label: "First touch needed",
      value: metrics.needsFirstTouch,
      detail: "New leads without a recorded first contact",
      href: "/leads?view=unassigned",
      icon: UserRoundCheck,
    },
    {
      label: "Payment decisions",
      value: metrics.paymentPending,
      detail: "Opportunities currently at payment",
      href: "/pipeline",
      icon: CreditCard,
    },
  ];

  const activeAttention = attentionItems.filter((item) => item.value > 0);

  return (
    <div className="space-y-4 pb-6">
      <section className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#216551] dark:text-emerald-300">
            Home
          </div>
          <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.04em] text-[#18362D] dark:text-white">
            Overview
          </h1>
          <p className="mt-1 text-sm text-[#71847A] dark:text-slate-400">
            Commercial performance for {periodAnalytics.period.label}, with today&apos;s operational priorities alongside it.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PeriodPresets selected={periodAnalytics.period.preset} />
          <details className="group relative">
            <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-[#DCE4DF] bg-white px-3 text-xs font-semibold text-[#596E64] shadow-sm transition hover:border-[#BFD6C6] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              <CalendarDays size={14} className="text-[#216551]" />
              {periodAnalytics.period.label}
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-[310px] rounded-2xl border border-[#DCE4DF] bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950">
              <form action="/home" method="get" className="space-y-3">
                <input type="hidden" name="period" value="custom" />
                <div>
                  <label htmlFor="dashboard-from" className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#71847A]">
                    From
                  </label>
                  <input
                    id="dashboard-from"
                    name="from"
                    type="date"
                    defaultValue={periodAnalytics.period.startDate}
                    className="mt-1 h-10 w-full rounded-lg border border-[#DCE4DF] bg-white px-3 text-sm text-[#18362D] outline-none focus:border-[#216551] focus:ring-2 focus:ring-[#216551]/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="dashboard-to" className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#71847A]">
                    To
                  </label>
                  <input
                    id="dashboard-to"
                    name="to"
                    type="date"
                    defaultValue={periodAnalytics.period.endDate}
                    className="mt-1 h-10 w-full rounded-lg border border-[#DCE4DF] bg-white px-3 text-sm text-[#18362D] outline-none focus:border-[#216551] focus:ring-2 focus:ring-[#216551]/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <p className="text-[11px] leading-5 text-[#71847A]">
                  Custom ranges are capped at 366 days. Comparisons use the immediately preceding equal-length period.
                </p>
                <button
                  type="submit"
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#153E33] px-4 text-xs font-semibold text-white transition hover:bg-[#216551]"
                >
                  Apply date range
                </button>
              </form>
            </div>
          </details>
          <Link
            href="/commercial-intelligence"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#DCE4DF] bg-white px-3 text-xs font-semibold text-[#18362D] shadow-sm transition hover:border-[#BFD6C6] hover:bg-[#F7FAF8] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            <Sparkles size={14} className="text-[#216551]" />
            Commercial intelligence
          </Link>
        </div>
      </section>

      <section
        className="relative overflow-hidden rounded-2xl border border-[#17493B] bg-[#153E33] px-5 py-6 text-white shadow-sm sm:px-7"
        style={{
          backgroundImage:
            "radial-gradient(circle at 64% 30%, rgba(255,255,255,.05), transparent 24%), linear-gradient(135deg, rgba(255,255,255,.04), transparent 48%)",
        }}
      >
        <div className="absolute inset-y-0 right-[43%] hidden w-px bg-white/10 xl:block" />
        <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr] xl:items-center">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 shadow-inner backdrop-blur-sm sm:h-20 sm:w-20">
              <TrendingUp size={34} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.19em] text-emerald-200">
                Selected-period performance
              </div>
              <h2 className="mt-2 max-w-3xl text-xl font-semibold tracking-[-0.025em] sm:text-[26px]">
                {heroHeadline(periodAnalytics, periodPrimaryRevenue)}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">
                Compared with {periodAnalytics.period.previousLabel}. Live pipeline, reply backlog, outstanding balances and batch demand below remain current-state signals.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-white/10 pt-5 sm:grid-cols-3 xl:border-t-0 xl:pt-0">
            <HeroStat
              label="Revenue collected"
              value={formatPeriodRevenue(periodAnalytics)}
              detail={<ChangeText value={periodPrimaryRevenue?.changePercent ?? null} fallback="vs previous period" light />}
            />
            <HeroStat
              label="New leads"
              value={periodAnalytics.available.leads ? periodAnalytics.leads.current.toLocaleString("en-IN") : "—"}
              detail={<ChangeText value={periodAnalytics.leads.changePercent} fallback="vs previous period" light />}
            />
            <HeroStat
              label="Enrollments"
              value={periodAnalytics.available.enrollments ? periodAnalytics.enrollments.current.toLocaleString("en-IN") : "—"}
              detail={<ChangeText value={periodAnalytics.enrollments.changePercent} fallback="vs previous period" light />}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(300px,.95fr)_minmax(0,2.45fr)]">
        <div className="overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-[#E7ECE9] px-5 py-4 dark:border-slate-900">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#71847A]">
                Needs your attention · now
              </div>
              <div className="mt-1 text-base font-semibold text-[#18362D] dark:text-white">
                Actions waiting
              </div>
            </div>
            <Link href="/follow-ups" className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 transition hover:text-violet-700 dark:text-violet-300">
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {activeAttention.length ? (
            <div className="divide-y divide-[#EEF2EF] dark:divide-slate-900">
              {activeAttention.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.label} href={item.href} className="group flex items-center gap-3 px-5 py-4 transition hover:bg-[#F8FAF8] dark:hover:bg-slate-900/60">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EDF3E6] text-[#216551] dark:bg-emerald-950/30 dark:text-emerald-300">
                      <Icon size={16} />
                    </span>
                    <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-full bg-violet-50 px-2 text-sm font-semibold text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
                      {item.value.toLocaleString("en-IN")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#253E35] dark:text-slate-100">{item.label}</span>
                      <span className="mt-0.5 block truncate text-xs text-[#71847A]">{item.detail}</span>
                    </span>
                    <ArrowRight size={14} className="shrink-0 text-[#B0BDB6] transition group-hover:translate-x-0.5 group-hover:text-[#216551]" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-10">
              <div className="text-sm font-semibold text-[#253E35] dark:text-slate-100">You&apos;re caught up</div>
              <div className="mt-1 text-sm leading-6 text-[#71847A]">No overdue follow-ups, waiting replies, or first-touch actions are currently recorded.</div>
            </div>
          )}

          {unvaluedOpenLeads > 0 ? (
            <Link href="/revenue" className="mx-4 mb-4 mt-3 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 transition hover:bg-amber-100/70 dark:border-amber-900/50 dark:bg-amber-950/20">
              <CircleDollarSign size={17} className="shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
                {unvaluedOpenLeads} {unvaluedOpenLeads === 1 ? "deal needs" : "deals need"} an estimated value
              </span>
              <ArrowRight size={13} className="text-amber-500" />
            </Link>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              href="/revenue"
              icon={CircleDollarSign}
              label="Revenue · selected period"
              value={formatPeriodRevenue(periodAnalytics)}
              detail={<ChangeText value={periodPrimaryRevenue?.changePercent ?? null} fallback="No prior-period baseline" />}
            />
            <MetricCard
              href="/leads"
              icon={Users}
              label="New leads · selected period"
              value={periodAnalytics.available.leads ? periodAnalytics.leads.current.toLocaleString("en-IN") : "—"}
              detail={<ChangeText value={periodAnalytics.leads.changePercent} fallback="No prior-period baseline" />}
            />
            <MetricCard
              href="/pipeline"
              icon={UserRoundCheck}
              label="Qualified rate"
              value={periodAnalytics.available.leads && periodAnalytics.leads.conversionRate != null ? `${periodAnalytics.leads.conversionRate}%` : "—"}
              detail={periodAnalytics.available.leads ? `${periodAnalytics.leads.qualified.toLocaleString("en-IN")} of ${periodAnalytics.leads.current.toLocaleString("en-IN")} new leads are qualified+ now` : "Period lead analytics unavailable"}
            />
            <MetricCard
              href="/pipeline"
              icon={WalletCards}
              label="Outstanding · now"
              value={formatRevenueMetric(revenueSummary, "outstanding")}
              detail={revenueSummary.length ? "Known outstanding balance" : "Not enough data"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
            <section className="overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-3 border-b border-[#E7ECE9] px-5 py-4 dark:border-slate-900">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#71847A]">Revenue</div>
                  <div className="mt-1 text-base font-semibold text-[#18362D] dark:text-white">Collected revenue trend</div>
                  <div className="mt-1 text-xs text-[#71847A]">{periodAnalytics.period.label}{periodAnalytics.primaryCurrency ? ` · ${periodAnalytics.primaryCurrency}` : ""}</div>
                </div>
                <Link href="/revenue" className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-300">
                  Open revenue <ArrowRight size={12} />
                </Link>
              </div>

              <div className="p-5">
                <div className="grid grid-cols-2 gap-4 border-b border-[#EEF2EF] pb-4 sm:grid-cols-4 dark:border-slate-900">
                  <RevenueMetric
                    label="Period collected"
                    value={periodPrimaryRevenue ? formatMoney(periodPrimaryRevenue.current, periodPrimaryRevenue.currency) : periodAnalytics.available.revenue ? "No payments" : "Unavailable"}
                    detail={periodPrimaryRevenue ? changeLabel(periodPrimaryRevenue.changePercent, "vs previous") : "Selected period"}
                  />
                  <RevenueMetric
                    label="Pipeline · now"
                    value={primaryRevenue ? formatMoney(primaryRevenue.pipeline, primaryRevenue.currency) : "—"}
                    detail={primaryRevenue ? `${primaryRevenue.opportunities} opportunities` : "Not enough data"}
                  />
                  <RevenueMetric
                    label="Weighted · now"
                    value={primaryRevenue ? formatMoney(primaryRevenue.weighted, primaryRevenue.currency) : "—"}
                    detail="Probability-weighted"
                  />
                  <RevenueMetric
                    label="Outstanding · now"
                    value={primaryRevenue ? formatMoney(primaryRevenue.outstanding, primaryRevenue.currency) : "—"}
                    detail="Known balance"
                  />
                </div>
                <RevenueTrend points={periodAnalytics.revenueSeries} currency={periodAnalytics.primaryCurrency} />
                {periodAnalytics.revenue.length > 1 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {periodAnalytics.revenue.slice(1, 4).map((row) => (
                      <span key={row.currency} className="rounded-full bg-[#F4F7F5] px-2.5 py-1 text-[10px] font-semibold text-[#596E64] dark:bg-slate-900 dark:text-slate-300">
                        {row.currency} {formatMoney(row.current, row.currency)} · {changeLabel(row.changePercent, "vs previous")}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-3 border-b border-[#E7ECE9] px-5 py-4 dark:border-slate-900">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#71847A]">Acquisition</div>
                  <div className="mt-1 text-base font-semibold text-[#18362D] dark:text-white">Source performance</div>
                  <div className="mt-1 text-xs text-[#71847A]">Leads created in the selected period</div>
                </div>
                <Link href="/attribution" className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-300">
                  Attribution <ArrowRight size={12} />
                </Link>
              </div>
              <div className="space-y-3 p-5">
                {acquisitionSources.length ? acquisitionSources.slice(0, 5).map((source) => <SourceRow key={source.source} source={source} />) : (
                  <div className="rounded-xl bg-[#F7F9F8] px-4 py-8 text-sm text-[#71847A] dark:bg-slate-900/60">
                    No lead acquisition is recorded for this period yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PulseCard label="Active pipeline" value={metrics.activePipeline.toLocaleString("en-IN")} detail="Open opportunities now" href="/pipeline" />
        <PulseCard label="High intent" value={metrics.highIntent.toLocaleString("en-IN")} detail="High-intent leads now" href="/pipeline" />
        <PulseCard label="Waiting > 1 hour" value={metrics.waitingOverHour.toLocaleString("en-IN")} detail="Reply backlog aging now" href="/conversations" />
        <PulseCard label="Upcoming batches" value={upcomingBatches.length.toLocaleString("en-IN")} detail={trackedSeats.length ? `${seatsRemaining.toLocaleString("en-IN")} tracked seats open` : `${totalActiveDemand.toLocaleString("en-IN")} active demand signals`} href="/course-management" />
      </section>

      {upcomingBatches.length ? (
        <section className="overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-[#E7ECE9] px-5 py-4 dark:border-slate-900">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#71847A]">Business context · now</div>
              <div className="mt-1 text-base font-semibold text-[#18362D] dark:text-white">Upcoming course demand</div>
            </div>
            <Link href="/course-management" className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-300">
              View all courses <ArrowRight size={12} />
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto p-3">
            {upcomingBatches.slice(0, 8).map((batch) => <BatchCard key={batch.id} batch={batch} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PeriodPresets({ selected }: { selected: DashboardPeriodAnalytics["period"]["preset"] }) {
  const options = [
    ["7d", "7D"],
    ["30d", "30D"],
    ["90d", "90D"],
    ["ytd", "YTD"],
  ] as const;

  return (
    <div className="inline-flex h-10 items-center rounded-xl border border-[#DCE4DF] bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      {options.map(([value, label]) => (
        <Link
          key={value}
          href={`/home?period=${value}`}
          className={`inline-flex h-8 min-w-10 items-center justify-center rounded-lg px-2.5 text-[11px] font-semibold transition ${selected === value ? "bg-[#153E33] text-white" : "text-[#71847A] hover:bg-[#F1F5F2] hover:text-[#18362D] dark:hover:bg-slate-900"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function HeroStat({ label, value, detail }: { label: string; value: string; detail: React.ReactNode }) {
  return (
    <div className="min-w-0 border-white/10 sm:border-l sm:pl-5 first:sm:border-l-0 first:sm:pl-0">
      <div className="truncate text-2xl font-semibold tracking-[-0.035em]">{value}</div>
      <div className="mt-1 text-xs font-medium text-emerald-50/90">{label}</div>
      <div className="mt-2 text-[11px] text-emerald-100/65">{detail}</div>
    </div>
  );
}

function MetricCard({ href, icon: Icon, label, value, detail }: { href: string; icon: LucideIcon; label: string; value: string; detail: React.ReactNode }) {
  return (
    <Link href={href} className="group rounded-2xl border border-[#DCE4DF] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#BFD6C6] hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#EDF3E6] text-[#216551] dark:bg-emerald-950/30 dark:text-emerald-300"><Icon size={15} /></span>
        <span className="truncate text-[11px] font-semibold text-[#71847A]">{label}</span>
      </div>
      <div className="mt-3 truncate text-[22px] font-semibold tracking-[-0.035em] text-[#18362D] dark:text-white">{value}</div>
      <div className="mt-1 min-h-4 truncate text-[11px] text-[#71847A]">{detail}</div>
      <div className="mt-4 flex h-7 items-end gap-1" aria-hidden="true">
        {[30, 45, 38, 62, 48, 68, 54, 78, 61, 86].map((height, index) => <span key={index} className="flex-1 rounded-sm bg-[#DCECE1] transition group-hover:bg-[#BFDCC8] dark:bg-emerald-950/40" style={{ height: `${height}%` }} />)}
      </div>
    </Link>
  );
}

function PulseCard({ label, value, detail, href }: { label: string; value: string; detail: string; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-4 rounded-2xl border border-[#DCE4DF] bg-white px-4 py-3.5 shadow-sm transition hover:border-[#BFD6C6] hover:bg-[#F9FBFA] dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900/70">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#71847A]">{label}</div>
        <div className="mt-1 truncate text-xs text-[#71847A]">{detail}</div>
      </div>
      <div className="shrink-0 text-2xl font-semibold tracking-[-0.04em] text-[#18362D] dark:text-white">{value}</div>
    </Link>
  );
}

function RevenueMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] font-bold uppercase tracking-[0.08em] text-[#8A9A92]">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tracking-[-0.035em] text-[#18362D] dark:text-white">{value}</div>
      <div className="mt-1 truncate text-[10px] text-[#71847A]">{detail}</div>
    </div>
  );
}

function RevenueTrend({ points, currency }: { points: DashboardPeriodAnalytics["revenueSeries"]; currency: string | null }) {
  if (!points.length || !currency) {
    return (
      <div className="mt-4 grid h-40 place-items-center rounded-xl border border-dashed border-[#DCE4DF] bg-[#FAFBFA] px-6 text-center text-xs text-[#71847A] dark:border-slate-800 dark:bg-slate-900/40">
        Revenue trend will appear once paid transactions are recorded in the selected period.
      </div>
    );
  }

  let running = 0;
  const cumulative = points.map((point) => {
    running += point.value;
    return { ...point, cumulative: running };
  });

  const width = 720;
  const height = 176;
  const padX = 8;
  const padTop = 14;
  const padBottom = 26;
  const values = cumulative.map((point) => point.cumulative);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const range = Math.max(1, maxValue - minValue);
  const usableWidth = width - padX * 2;
  const usableHeight = height - padTop - padBottom;
  const coords = cumulative.map((point, index) => {
    const x = padX + (cumulative.length === 1 ? usableWidth / 2 : (index / (cumulative.length - 1)) * usableWidth);
    const y = padTop + (1 - (point.cumulative - minValue) / range) * usableHeight;
    return { x, y };
  });
  const line = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const baseline = padTop + (1 - (0 - minValue) / range) * usableHeight;
  const area = `${coords[0]?.x ?? padX},${baseline} ${line} ${coords.at(-1)?.x ?? width - padX},${baseline}`;
  const middle = cumulative[Math.floor((cumulative.length - 1) / 2)];

  return (
    <div className="mt-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9A92]">Cumulative collected · {currency}</div>
          <div className="mt-1 text-lg font-semibold text-[#18362D] dark:text-white">{formatMoney(running, currency)}</div>
        </div>
        <div className="text-right text-[10px] text-[#8A9A92]">Real paid transactions · refunds netted</div>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl bg-gradient-to-b from-[#F6FAF7] to-white px-2 pt-2 dark:from-emerald-950/10 dark:to-slate-950">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label={`Cumulative ${currency} revenue collected across the selected period`}>
          <defs>
            <linearGradient id="homeRevenueArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#216551" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#216551" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          <line x1={padX} x2={width - padX} y1={baseline} y2={baseline} stroke="#DCE4DF" strokeWidth="1" />
          <polygon points={area} fill="url(#homeRevenueArea)" />
          <polyline points={line} fill="none" stroke="#216551" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {coords.length ? <circle cx={coords.at(-1)?.x} cy={coords.at(-1)?.y} r="4.5" fill="#216551" stroke="white" strokeWidth="2" /> : null}
          <text x={padX} y={height - 6} fontSize="10" fill="#8A9A92">{formatShortDate(cumulative[0]?.date)}</text>
          <text x={width / 2} y={height - 6} fontSize="10" textAnchor="middle" fill="#8A9A92">{formatShortDate(middle?.date)}</text>
          <text x={width - padX} y={height - 6} fontSize="10" textAnchor="end" fill="#8A9A92">{formatShortDate(cumulative.at(-1)?.date)}</text>
        </svg>
      </div>
    </div>
  );
}

function SourceRow({ source }: { source: DashboardPeriodSource }) {
  const width = Math.max(5, Math.min(100, source.conversionRate ?? 0));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(90px,.9fr)_52px] items-center gap-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[#253E35] dark:text-slate-100">{pretty(source.source)}</div>
        <div className="mt-0.5 text-[10px] text-[#8A9A92]">{source.leads} leads · {source.qualified} qualified</div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#EEF2EF] dark:bg-slate-900"><div className="h-full rounded-full bg-[#216551]" style={{ width: `${width}%` }} /></div>
      <div className="text-right"><div className="text-sm font-semibold text-[#18362D] dark:text-white">{source.conversionRate == null ? "—" : `${source.conversionRate}%`}</div><div className="text-[9px] text-[#8A9A92]">qualified</div></div>
    </div>
  );
}

function BatchCard({ batch }: { batch: DashboardBatchDemand }) {
  const capacityText = batch.seatsRemaining != null ? `${batch.seatsRemaining} seats left` : batch.capacity != null ? `${batch.capacity} capacity` : "Capacity not set";
  return (
    <Link href="/course-management" className="w-[250px] shrink-0 rounded-xl border border-[#E4EAE6] bg-[#FBFCFB] p-3 transition hover:border-[#BFD6C6] hover:bg-white hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EDF3E6] text-[#216551] dark:bg-emerald-950/30 dark:text-emerald-300"><BookOpen size={16} /></span>
        <div className="min-w-0 flex-1"><div className="line-clamp-2 text-xs font-semibold leading-5 text-[#253E35] dark:text-slate-100">{batch.courseName}</div><div className="mt-0.5 text-[10px] text-[#8A9A92]">{batch.startDate ? formatDate(batch.startDate) : "Date not set"} · {batch.location}</div></div>
        <span className="rounded-md bg-emerald-50 px-1.5 py-1 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{batch.activeDemand} active</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-[#E7ECE9] pt-2 text-[10px] text-[#71847A] dark:border-slate-800"><span>{batch.enrolled} enrolled</span><span>{batch.paymentPending} payment</span><span>{capacityText}</span></div>
    </Link>
  );
}

function ChangeText({ value, fallback, light = false }: { value: number | null; fallback: string; light?: boolean }) {
  const text = changeLabel(value, fallback);
  const positive = value != null && value > 0;
  const negative = value != null && value < 0;
  const className = light ? "text-emerald-100/70" : positive ? "text-emerald-600 dark:text-emerald-300" : negative ? "text-rose-600 dark:text-rose-300" : "text-[#71847A]";
  return <span className={className}>{text}</span>;
}

function heroHeadline(analytics: DashboardPeriodAnalytics, revenue: DashboardPeriodRevenue | null) {
  if (analytics.available.revenue && revenue && revenue.current !== 0) {
    const revenueText = formatMoney(revenue.current, revenue.currency);
    const leadText = analytics.available.leads ? ` from ${analytics.leads.current.toLocaleString("en-IN")} new leads` : "";
    return `${revenueText} collected${leadText} in this period`;
  }
  if (analytics.available.leads && analytics.leads.current > 0) {
    return `${analytics.leads.current.toLocaleString("en-IN")} new leads entered the CRM in this period`;
  }
  return "Your selected period is ready for commercial tracking";
}

function pickPeriodRevenue(analytics: DashboardPeriodAnalytics, fallbackCurrency: string | null) {
  if (analytics.primaryCurrency) return analytics.revenue.find((row) => row.currency === analytics.primaryCurrency) ?? null;
  if (fallbackCurrency) return analytics.revenue.find((row) => row.currency === fallbackCurrency.toUpperCase()) ?? null;
  return analytics.revenue[0] ?? null;
}

function formatPeriodRevenue(analytics: DashboardPeriodAnalytics) {
  if (!analytics.available.revenue) return "Unavailable";
  const populated = analytics.revenue.filter((row) => row.current !== 0);
  const selected = (populated.length ? populated : analytics.revenue).slice(0, 2);
  if (!selected.length) return "No payments";
  return selected.map((row) => formatMoney(row.current, row.currency)).join(" · ");
}

function formatRevenueMetric(rows: DashboardRevenueSummary[], key: "collected" | "outstanding") {
  if (!rows.length) return "—";
  const populated = rows.filter((row) => Number(row[key]) !== 0);
  const selected = (populated.length ? populated : rows).slice(0, 2);
  return selected.map((row) => formatMoney(row[key], row.currency)).join(" · ");
}

function changeLabel(value: number | null, fallback: string) {
  if (value == null) return fallback;
  if (value === 0) return "No change vs previous";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })}% vs previous`;
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
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatShortDate(value: string | undefined) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}
