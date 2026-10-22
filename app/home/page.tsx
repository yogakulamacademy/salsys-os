import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Facebook,
  Globe2,
  HelpCircle,
  Inbox,
  Instagram,
  MessageCircle,
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

  const { metrics, sources: liveSources, revenueSummary, upcomingBatches, unvaluedOpenLeads } = snapshot;
  const primaryRevenue = revenueSummary.find((row) => row.collected > 0) ?? revenueSummary[0] ?? null;
  const periodPrimaryRevenue = pickPeriodRevenue(periodAnalytics, primaryRevenue?.currency ?? null);
  const acquisitionSources: DashboardPeriodSource[] = periodAnalytics.available.leads
    ? periodAnalytics.sources
    : liveSources.map((source) => ({
        source: source.source,
        leads: source.leads,
        qualified: source.qualified,
        conversionRate: source.leads ? Math.round((source.qualified / source.leads) * 1000) / 10 : null,
      }));

  const attentionItems: Array<{
    label: string;
    value: number;
    detail: string;
    href: string;
    icon: LucideIcon;
  }> = [
    { label: "Inbox replies waiting", value: metrics.needsReply, detail: "Across active conversations", href: "/conversations", icon: Inbox },
    { label: "Follow-ups due", value: metrics.followupsDue, detail: "Scheduled actions now due", href: "/follow-ups", icon: Clock3 },
    { label: "First touch needed", value: metrics.needsFirstTouch, detail: "New leads without a recorded first contact", href: "/leads?view=unassigned", icon: UserRoundCheck },
    { label: "Payment decisions", value: metrics.paymentPending, detail: "Opportunities currently at payment", href: "/pipeline", icon: CreditCard },
  ];
  const activeAttention = attentionItems.filter((item) => item.value > 0);

  return (
    <div className="space-y-4 pb-6">
      <section className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#216551] dark:text-emerald-300">Home</div>
          <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.04em] text-[#18362D] dark:text-white">Overview</h1>
          <p className="mt-1 text-sm text-[#71847A] dark:text-slate-400">Your business at a glance · {periodAnalytics.period.label}</p>
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
                <DateField id="dashboard-from" name="from" label="From" defaultValue={periodAnalytics.period.startDate} />
                <DateField id="dashboard-to" name="to" label="To" defaultValue={periodAnalytics.period.endDate} />
                <p className="text-[11px] leading-5 text-[#71847A]">Custom ranges are capped at 366 days. Comparisons use the immediately preceding equal-length period.</p>
                <button type="submit" className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#153E33] px-4 text-xs font-semibold text-white transition hover:bg-[#216551]">Apply date range</button>
              </form>
            </div>
          </details>
          <Link href="/commercial-intelligence" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#DCE4DF] bg-white px-3 text-xs font-semibold text-[#18362D] shadow-sm transition hover:border-[#BFD6C6] hover:bg-[#F7FAF8] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
            <Sparkles size={14} className="text-[#216551]" /> Commercial intelligence
          </Link>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[#17493B] bg-[#153E33] px-5 py-6 text-white shadow-sm sm:px-7" style={{ backgroundImage: "radial-gradient(circle at 65% 10%, rgba(73,155,115,.26), transparent 36%), linear-gradient(135deg, rgba(255,255,255,.05), transparent 45%)" }}>
        <div className="grid gap-6 xl:grid-cols-[1.28fr_1fr] xl:items-center">
          <div className="flex items-center gap-5">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 shadow-inner"><TrendingUp size={35} /></div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.19em] text-emerald-200">Commercial momentum</div>
              <h2 className="mt-2 max-w-3xl text-xl font-semibold tracking-[-0.025em] sm:text-[27px]">{heroHeadline(periodAnalytics, periodPrimaryRevenue)}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-emerald-50/80">
                <span>Compared with {periodAnalytics.period.previousLabel}</span>
                {periodPrimaryRevenue ? <TrendPill value={periodPrimaryRevenue.changePercent} light /> : null}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 border-t border-white/10 pt-5 sm:grid-cols-3 xl:border-t-0 xl:pt-0">
            <HeroStat label="Revenue collected" value={formatPeriodRevenue(periodAnalytics)} detail={<ChangeText value={periodPrimaryRevenue?.changePercent ?? null} fallback="vs previous period" light />} />
            <HeroStat label="New leads" value={periodAnalytics.available.leads ? periodAnalytics.leads.current.toLocaleString("en-IN") : "—"} detail={<ChangeText value={periodAnalytics.leads.changePercent} fallback="vs previous period" light />} />
            <HeroStat label="Enrollments" value={periodAnalytics.available.enrollments ? periodAnalytics.enrollments.current.toLocaleString("en-IN") : "—"} detail={<ChangeText value={periodAnalytics.enrollments.changePercent} fallback="vs previous period" light />} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          href="/revenue"
          icon={CircleDollarSign}
          label="Revenue collected"
          value={periodPrimaryRevenue ? formatMoney(periodPrimaryRevenue.current, periodPrimaryRevenue.currency) : formatPeriodRevenue(periodAnalytics)}
          previous={periodPrimaryRevenue ? `vs ${formatMoney(periodPrimaryRevenue.previous, periodPrimaryRevenue.currency)} previous period` : "Selected-period collected revenue"}
          change={periodPrimaryRevenue?.changePercent ?? null}
          bars="revenue"
        />
        <KpiCard href="/leads" icon={Users} label="Leads created" value={periodAnalytics.available.leads ? periodAnalytics.leads.current.toLocaleString("en-IN") : "—"} previous={periodAnalytics.available.leads ? `vs ${periodAnalytics.leads.previous.toLocaleString("en-IN")} previous period` : "Period lead analytics unavailable"} change={periodAnalytics.leads.changePercent} bars="leads" />
        <KpiCard href="/pipeline" icon={UserRoundCheck} label="Enrollments" value={periodAnalytics.available.enrollments ? periodAnalytics.enrollments.current.toLocaleString("en-IN") : "—"} previous={periodAnalytics.available.enrollments ? `vs ${periodAnalytics.enrollments.previous.toLocaleString("en-IN")} previous period` : "Period enrollment analytics unavailable"} change={periodAnalytics.enrollments.changePercent} bars="leads" />
        <QualifiedRateCard rate={periodAnalytics.leads.conversionRate} qualified={periodAnalytics.leads.qualified} total={periodAnalytics.leads.current} available={periodAnalytics.available.leads} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(300px,.9fr)_minmax(0,1.15fr)_minmax(330px,.95fr)]">
        <section className="overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <SectionHeader eyebrow="Needs your attention" title="Actions waiting" actionHref="/follow-ups" actionLabel="View all" />
          {activeAttention.length ? (
            <div className="divide-y divide-[#EEF2EF] dark:divide-slate-900">
              {activeAttention.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.label} href={item.href} className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-[#F8FAF8] dark:hover:bg-slate-900/60">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EDF3E6] text-[#216551]"><Icon size={16} /></span>
                    <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-full bg-violet-50 px-2 text-sm font-semibold text-violet-700">{item.value.toLocaleString("en-IN")}</span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#253E35] dark:text-slate-100">{item.label}</span><span className="mt-0.5 block truncate text-xs text-[#71847A]">{item.detail}</span></span>
                    <ArrowRight size={14} className="text-[#B0BDB6] group-hover:text-[#216551]" />
                  </Link>
                );
              })}
            </div>
          ) : <EmptyState text="No overdue follow-ups, waiting replies, or first-touch actions are currently recorded." />}
          {unvaluedOpenLeads > 0 ? <Link href="/revenue" className="mx-4 mb-4 mt-3 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-semibold text-amber-800"><CircleDollarSign size={17} className="text-amber-600" />{unvaluedOpenLeads} deals need an estimated value<ArrowRight size={13} className="ml-auto" /></Link> : null}
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <SectionHeader eyebrow="Revenue" title="Commercial snapshot" actionHref="/revenue" actionLabel="Open revenue" />
          <div className="p-5">
            <div className="grid grid-cols-2 gap-4 border-b border-[#EEF2EF] pb-4 sm:grid-cols-4 dark:border-slate-900">
              <SnapshotMetric label="Revenue" value={periodPrimaryRevenue ? formatMoney(periodPrimaryRevenue.current, periodPrimaryRevenue.currency) : "—"} change={periodPrimaryRevenue?.changePercent ?? null} />
              <SnapshotMetric label="Pipeline" value={primaryRevenue ? formatMoney(primaryRevenue.pipeline, primaryRevenue.currency) : "—"} />
              <SnapshotMetric label="Weighted" value={primaryRevenue ? formatMoney(primaryRevenue.weighted, primaryRevenue.currency) : "—"} />
              <SnapshotMetric label="Qualified rate" value={periodAnalytics.leads.conversionRate != null ? `${periodAnalytics.leads.conversionRate}%` : "—"} />
            </div>
            <RevenueTrend points={periodAnalytics.revenueSeries} currency={periodAnalytics.primaryCurrency} />
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <SectionHeader eyebrow="Acquisition" title="Source performance" actionHref="/attribution" actionLabel="Attribution" />
          <div className="space-y-2 p-4">
            {acquisitionSources.length ? acquisitionSources.slice(0, 6).map((source) => <SourceRow key={source.source} source={source} />) : <EmptyState text="No lead acquisition is recorded for this period yet." />}
          </div>
        </section>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PulseCard label="Active pipeline" value={metrics.activePipeline.toLocaleString("en-IN")} detail="Open opportunities now" href="/pipeline" />
        <PulseCard label="High intent" value={metrics.highIntent.toLocaleString("en-IN")} detail="High-intent leads now" href="/pipeline" />
        <PulseCard label="Waiting > 1 hour" value={metrics.waitingOverHour.toLocaleString("en-IN")} detail="Reply backlog aging now" href="/conversations" />
        <PulseCard label="Upcoming batches" value={upcomingBatches.length.toLocaleString("en-IN")} detail="Scheduled course demand" href="/course-management" />
      </section>

      {upcomingBatches.length ? (
        <section className="overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <SectionHeader eyebrow="Business context" title="Upcoming course demand" actionHref="/course-management" actionLabel="View all courses" />
          <div className="flex gap-2 overflow-x-auto p-3">{upcomingBatches.slice(0, 8).map((batch) => <BatchCard key={batch.id} batch={batch} />)}</div>
        </section>
      ) : null}
    </div>
  );
}

function DateField({ id, name, label, defaultValue }: { id: string; name: string; label: string; defaultValue: string }) {
  return <div><label htmlFor={id} className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#71847A]">{label}</label><input id={id} name={name} type="date" defaultValue={defaultValue} className="mt-1 h-10 w-full rounded-lg border border-[#DCE4DF] bg-white px-3 text-sm text-[#18362D] outline-none focus:border-[#216551] focus:ring-2 focus:ring-[#216551]/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></div>;
}

function PeriodPresets({ selected }: { selected: DashboardPeriodAnalytics["period"]["preset"] }) {
  const options = [["7d", "7D"], ["30d", "30D"], ["90d", "90D"], ["ytd", "YTD"]] as const;
  return <div className="inline-flex h-10 items-center rounded-xl border border-[#DCE4DF] bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950">{options.map(([value, label]) => <Link key={value} href={`/home?period=${value}`} className={`inline-flex h-8 min-w-10 items-center justify-center rounded-lg px-2.5 text-[11px] font-semibold transition ${selected === value ? "bg-[#153E33] text-white" : "text-[#71847A] hover:bg-[#F1F5F2] hover:text-[#18362D]"}`}>{label}</Link>)}</div>;
}

function HeroStat({ label, value, detail }: { label: string; value: string; detail: React.ReactNode }) {
  return <div className="border-white/10 sm:border-l sm:pl-5"><div className="text-[25px] font-semibold tracking-[-0.04em]">{value}</div><div className="mt-1 text-xs text-emerald-50/80">{label}</div><div className="mt-2 text-[11px] font-semibold">{detail}</div></div>;
}

function KpiCard({ href, icon: Icon, label, value, previous, change, bars }: { href: string; icon: LucideIcon; label: string; value: string; previous: string; change: number | null; bars: "revenue" | "leads" }) {
  const heights = bars === "revenue" ? [23, 35, 48, 63, 45, 32, 28, 44, 57, 72, 55, 78, 68, 92] : [34, 44, 27, 51, 38, 57, 42, 66, 48, 75, 55, 84, 71, 95];
  return <Link href={href} className="group rounded-2xl border border-[#DCE4DF] bg-white p-4 shadow-sm transition hover:border-[#BFD6C6] hover:shadow-md dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EDF3E6] text-[#216551]"><Icon size={17} /></span><span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#71847A]">{label}</span><TrendPill value={change} /></div><div className="mt-3 text-[24px] font-semibold tracking-[-0.04em] text-[#18362D] dark:text-white">{value}</div><div className="mt-1 truncate text-[10px] text-[#8A9A92]">{previous}</div><div className="mt-4 flex h-8 items-end gap-1" aria-hidden="true">{heights.map((height, index) => <span key={index} className="flex-1 rounded-sm bg-emerald-400/80" style={{ height: `${height}%`, opacity: 0.45 + index / 30 }} />)}</div></Link>;
}

function QualifiedRateCard({ rate, qualified, total, available }: { rate: number | null; qualified: number; total: number; available: boolean }) {
  const safeRate = Math.max(0, Math.min(100, rate ?? 0));
  const circumference = 2 * Math.PI * 28;
  const dash = circumference * (safeRate / 100);
  return <Link href="/pipeline" className="group rounded-2xl border border-[#DCE4DF] bg-white p-4 shadow-sm transition hover:border-[#BFD6C6] hover:shadow-md dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-3"><div><div className="text-[11px] font-semibold text-[#71847A]">Qualified rate</div><div className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-[#18362D] dark:text-white">{available && rate != null ? `${rate}%` : "—"}</div><div className="mt-1 text-[10px] text-[#8A9A92]">{available ? `${qualified} of ${total} selected-period leads are qualified+` : "Period lead analytics unavailable"}</div></div><div className="relative h-[74px] w-[74px] shrink-0"><svg viewBox="0 0 72 72" className="h-full w-full -rotate-90" role="img" aria-label={available && rate != null ? `${rate}% qualified rate` : "Qualified rate unavailable"}><circle cx="36" cy="36" r="28" fill="none" stroke="#E7EFEA" strokeWidth="7" /><circle cx="36" cy="36" r="28" fill="none" stroke="#216551" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`} /></svg><div className="absolute inset-0 grid place-items-center text-[10px] font-bold text-[#216551]">{available && rate != null ? `${Math.round(rate)}%` : "—"}</div></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#EEF2EF]"><div className="h-full rounded-full bg-gradient-to-r from-[#A7D5B8] to-[#216551]" style={{ width: `${safeRate}%` }} /></div></Link>;
}

function SectionHeader({ eyebrow, title, actionHref, actionLabel }: { eyebrow: string; title: string; actionHref: string; actionLabel: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-[#E7ECE9] px-5 py-4 dark:border-slate-900"><div><div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#71847A]">{eyebrow}</div><div className="mt-1 text-base font-semibold text-[#18362D] dark:text-white">{title}</div></div><Link href={actionHref} className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-300">{actionLabel}<ArrowRight size={12} /></Link></div>;
}

function SnapshotMetric({ label, value, change }: { label: string; value: string; change?: number | null }) {
  return <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8A9A92]">{label}</div><div className="mt-1 truncate text-xl font-semibold tracking-[-0.035em] text-[#18362D] dark:text-white">{value}</div>{change !== undefined ? <div className="mt-1"><TrendPill value={change ?? null} compact /></div> : null}</div>;
}

function RevenueTrend({ points, currency }: { points: DashboardPeriodAnalytics["revenueSeries"]; currency: string | null }) {
  if (!points.length || !currency) return <div className="mt-4 grid h-40 place-items-center rounded-xl border border-dashed border-[#DCE4DF] bg-[#FAFBFA] px-6 text-center text-xs text-[#71847A]">Revenue trend will appear once paid transactions are recorded in the selected period.</div>;
  let running = 0;
  const cumulative = points.map((point) => ({ ...point, cumulative: (running += point.value) }));
  const width = 720, height = 176, padX = 8, padTop = 14, padBottom = 26;
  const values = cumulative.map((point) => point.cumulative);
  const minValue = Math.min(0, ...values), maxValue = Math.max(0, ...values), range = Math.max(1, maxValue - minValue);
  const usableWidth = width - padX * 2, usableHeight = height - padTop - padBottom;
  const coords = cumulative.map((point, index) => ({ x: padX + (cumulative.length === 1 ? usableWidth / 2 : (index / (cumulative.length - 1)) * usableWidth), y: padTop + (1 - (point.cumulative - minValue) / range) * usableHeight }));
  const line = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const baseline = padTop + (1 - (0 - minValue) / range) * usableHeight;
  const area = `${coords[0]?.x ?? padX},${baseline} ${line} ${coords.at(-1)?.x ?? width - padX},${baseline}`;
  const middle = cumulative[Math.floor((cumulative.length - 1) / 2)];
  return <div className="mt-4"><div className="flex items-end justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9A92]">Cumulative collected · {currency}</div><div className="mt-1 text-lg font-semibold text-[#18362D] dark:text-white">{formatMoney(running, currency)}</div></div><div className="text-right text-[10px] text-[#8A9A92]">Paid transactions · refunds netted</div></div><div className="mt-3 overflow-hidden rounded-xl bg-gradient-to-b from-[#F6FAF7] to-white px-2 pt-2"><svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label={`Cumulative ${currency} revenue collected across the selected period`}><defs><linearGradient id="homeRevenueAreaV2" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#216551" stopOpacity="0.2" /><stop offset="100%" stopColor="#216551" stopOpacity="0.01" /></linearGradient></defs><line x1={padX} x2={width - padX} y1={baseline} y2={baseline} stroke="#DCE4DF" strokeWidth="1" /><polygon points={area} fill="url(#homeRevenueAreaV2)" /><polyline points={line} fill="none" stroke="#17834D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{coords.map((point, index) => index % Math.max(1, Math.floor(coords.length / 8)) === 0 || index === coords.length - 1 ? <circle key={index} cx={point.x} cy={point.y} r={index === coords.length - 1 ? 4.5 : 2.5} fill="#17834D" stroke="white" strokeWidth="1.5" /> : null)}<text x={padX} y={height - 6} fontSize="10" fill="#8A9A92">{formatShortDate(cumulative[0]?.date)}</text><text x={width / 2} y={height - 6} fontSize="10" textAnchor="middle" fill="#8A9A92">{formatShortDate(middle?.date)}</text><text x={width - padX} y={height - 6} fontSize="10" textAnchor="end" fill="#8A9A92">{formatShortDate(cumulative.at(-1)?.date)}</text></svg></div></div>;
}

function SourceRow({ source }: { source: DashboardPeriodSource }) {
  const width = Math.max(3, Math.min(100, source.conversionRate ?? 0));
  return <div className="grid grid-cols-[42px_minmax(0,1fr)_minmax(90px,.8fr)_54px] items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[#F8FAF8]"><SourceIcon source={source.source} /><div className="min-w-0"><div className="truncate text-sm font-semibold text-[#253E35] dark:text-slate-100">{pretty(source.source)}</div><div className="mt-0.5 text-[10px] text-[#8A9A92]">{source.leads} leads · {source.qualified} qualified</div></div><div className="h-2 overflow-hidden rounded-full bg-[#E9EFEB]"><div className="h-full rounded-full bg-[#176148]" style={{ width: `${width}%` }} /></div><div className="text-right"><div className="text-sm font-semibold text-[#18362D] dark:text-white">{source.conversionRate == null ? "—" : `${source.conversionRate}%`}</div><div className="text-[9px] text-[#8A9A92]">qualified</div></div></div>;
}

function SourceIcon({ source }: { source: string }) {
  const normalized = source.trim().toLowerCase();
  if (normalized.includes("google")) return <span className="grid h-9 w-9 place-items-center rounded-full border border-[#E4E8E5] bg-white text-base font-bold text-[#4285F4] shadow-sm">G</span>;
  if (normalized.includes("whatsapp")) return <span className="grid h-9 w-9 place-items-center rounded-full bg-[#E9F8EF] text-[#16A34A]"><MessageCircle size={19} fill="currentColor" strokeWidth={1.6} /></span>;
  if (normalized.includes("instagram")) return <span className="grid h-9 w-9 place-items-center rounded-full bg-pink-50 text-pink-600"><Instagram size={19} /></span>;
  if (normalized.includes("facebook") || normalized.includes("meta")) return <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-blue-600"><Facebook size={18} fill="currentColor" /></span>;
  if (normalized.includes("unknown") || normalized === "other") return <span className="grid h-9 w-9 place-items-center rounded-full bg-[#F1F5F2] text-[#596E64]"><HelpCircle size={18} /></span>;
  if (normalized.includes("direct") || normalized.includes("website") || normalized.includes("web")) return <span className="grid h-9 w-9 place-items-center rounded-full bg-[#EAF4EE] text-[#216551]"><Globe2 size={18} /></span>;
  return <span className="grid h-9 w-9 place-items-center rounded-full bg-[#EAF4EE] text-[#216551]"><Users size={18} /></span>;
}

function PulseCard({ label, value, detail, href }: { label: string; value: string; detail: string; href: string }) {
  return <Link href={href} className="flex items-center justify-between gap-4 rounded-2xl border border-[#DCE4DF] bg-white px-4 py-3.5 shadow-sm transition hover:border-[#BFD6C6] hover:bg-[#F9FBFA] dark:border-slate-800 dark:bg-slate-950"><div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#71847A]">{label}</div><div className="mt-1 truncate text-xs text-[#71847A]">{detail}</div></div><div className="shrink-0 text-2xl font-semibold tracking-[-0.04em] text-[#18362D] dark:text-white">{value}</div></Link>;
}

function BatchCard({ batch }: { batch: DashboardBatchDemand }) {
  const capacityText = batch.seatsRemaining != null ? `${batch.seatsRemaining} seats left` : batch.capacity != null ? `${batch.capacity} capacity` : "Capacity not set";
  return <Link href="/course-management" className="w-[250px] shrink-0 rounded-xl border border-[#E4EAE6] bg-[#FBFCFB] p-3 transition hover:border-[#BFD6C6] hover:bg-white hover:shadow-sm dark:border-slate-800 dark:bg-slate-900/50"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EDF3E6] text-[#216551]"><BookOpen size={16} /></span><div className="min-w-0 flex-1"><div className="line-clamp-2 text-xs font-semibold leading-5 text-[#253E35] dark:text-slate-100">{batch.courseName}</div><div className="mt-0.5 text-[10px] text-[#8A9A92]">{batch.startDate ? formatDate(batch.startDate) : "Date not set"} · {batch.location}</div></div><span className="rounded-md bg-emerald-50 px-1.5 py-1 text-[9px] font-semibold text-emerald-700">{batch.activeDemand} active</span></div><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-[#E7ECE9] pt-2 text-[10px] text-[#71847A]"><span>{batch.enrolled} enrolled</span><span>{batch.paymentPending} payment</span><span>{capacityText}</span></div></Link>;
}

function TrendPill({ value, light = false, compact = false }: { value: number | null; light?: boolean; compact?: boolean }) {
  if (value == null) return <span className={`${compact ? "text-[9px]" : "text-[10px]"} font-semibold ${light ? "text-emerald-100/75" : "text-[#8A9A92]"}`}>No baseline</span>;
  const positive = value > 0, negative = value < 0;
  const tone = light ? "bg-white/10 text-emerald-50" : positive ? "bg-emerald-50 text-emerald-700" : negative ? "bg-rose-50 text-rose-700" : "bg-[#F1F5F2] text-[#596E64]";
  return <span className={`inline-flex items-center rounded-full ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"} font-bold ${tone}`}>{positive ? "↑ " : negative ? "↓ " : ""}{value > 0 ? "+" : ""}{value.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%</span>;
}

function ChangeText({ value, fallback, light = false }: { value: number | null; fallback: string; light?: boolean }) {
  const text = changeLabel(value, fallback);
  const positive = value != null && value > 0, negative = value != null && value < 0;
  const className = light ? "text-emerald-100/80" : positive ? "text-emerald-600" : negative ? "text-rose-600" : "text-[#71847A]";
  return <span className={className}>{text}</span>;
}

function EmptyState({ text }: { text: string }) { return <div className="px-5 py-10 text-sm leading-6 text-[#71847A]">{text}</div>; }

function heroHeadline(analytics: DashboardPeriodAnalytics, revenue: DashboardPeriodRevenue | null) {
  if (analytics.available.revenue && revenue && revenue.current !== 0) {
    if (revenue.changePercent != null && revenue.changePercent !== 0) return `Revenue is ${revenue.changePercent > 0 ? "up" : "down"} ${Math.abs(revenue.changePercent).toLocaleString("en-IN", { maximumFractionDigits: 1 })}% versus the previous period`;
    return `${formatMoney(revenue.current, revenue.currency)} collected in this period`;
  }
  if (analytics.available.leads && analytics.leads.current > 0) return `${analytics.leads.current.toLocaleString("en-IN")} new leads entered the CRM in this period`;
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

function changeLabel(value: number | null, fallback: string) {
  if (value == null) return fallback;
  if (value === 0) return "No change vs previous";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })}% vs previous`;
}

function formatMoney(value: number, currency: string) {
  const code = currency?.trim().toUpperCase() || "INR";
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(value || 0); }
  catch { return `${code} ${Number(value || 0).toLocaleString("en-IN")}`; }
}

function pretty(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date); }
function formatShortDate(value: string | undefined) { if (!value) return ""; const date = new Date(`${value}T00:00:00.000Z`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(date); }
