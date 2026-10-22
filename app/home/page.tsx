import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleDollarSign,
  CircleHelp,
  Clock3,
  CreditCard,
  Globe2,
  Inbox,
  MessageCircle,
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
  type DashboardSource,
} from "@/lib/dashboard-data";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
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

  const snapshot = await getDashboardSnapshot();
  const {
    metrics,
    sources,
    revenueSummary,
    upcomingBatches,
    unvaluedOpenLeads,
  } = snapshot;

  const totalActiveDemand = upcomingBatches.reduce(
    (sum, batch) => sum + batch.activeDemand,
    0,
  );
  const trackedSeats = upcomingBatches.filter(
    (batch) => batch.seatsRemaining != null,
  );
  const seatsRemaining = trackedSeats.reduce(
    (sum, batch) => sum + Number(batch.seatsRemaining ?? 0),
    0,
  );
  const primaryRevenue =
    revenueSummary.find((row) => row.collected > 0) ?? revenueSummary[0] ?? null;

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
  const now = new Date();
  const asOfLabel = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(now);

  return (
    <div className="space-y-4 pb-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#216551] dark:text-emerald-300">
            Home
          </div>
          <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.04em] text-[#18362D] dark:text-white">
            Overview
          </h1>
          <p className="mt-1 text-sm text-[#71847A] dark:text-slate-400">
            Your business at a glance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#DCE4DF] bg-white px-3 text-xs font-semibold text-[#596E64] shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            <CalendarDays size={14} className="text-[#216551]" />
            Live snapshot · {asOfLabel}
          </div>
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
                Current commercial snapshot
              </div>
              <h2 className="mt-2 max-w-3xl text-xl font-semibold tracking-[-0.025em] sm:text-[26px]">
                {primaryRevenue
                  ? `${formatMoney(primaryRevenue.collected, primaryRevenue.currency)} collected with ${metrics.enrolled.toLocaleString("en-IN")} enrollments recorded`
                  : metrics.activePipeline > 0
                    ? `${metrics.activePipeline.toLocaleString("en-IN")} active opportunities are moving through the pipeline`
                    : "Your commercial workspace is ready for the next opportunity"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">
                {metrics.needsReply > 0
                  ? `${metrics.needsReply.toLocaleString("en-IN")} conversations need a reply. Keep the team focused on the actions that move revenue forward.`
                  : "No reply backlog is currently recorded. Keep the team focused on the actions that move revenue forward."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-white/10 pt-5 sm:grid-cols-3 xl:border-t-0 xl:pt-0">
            <HeroStat
              label="Revenue collected"
              value={formatRevenueMetric(revenueSummary, "collected")}
              detail="Recorded payments"
            />
            <HeroStat
              label="Enrollments"
              value={metrics.enrolled.toLocaleString("en-IN")}
              detail={`${metrics.paymentPending.toLocaleString("en-IN")} at payment`}
            />
            <HeroStat
              label="Upcoming batches"
              value={upcomingBatches.length.toLocaleString("en-IN")}
              detail={
                upcomingBatches.length
                  ? `${totalActiveDemand.toLocaleString("en-IN")} active demand signals`
                  : "No upcoming batches recorded"
              }
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(300px,.95fr)_minmax(0,2.45fr)]">
        <div className="overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-[#E7ECE9] px-5 py-4 dark:border-slate-900">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#71847A]">
                Needs your attention
              </div>
              <div className="mt-1 text-base font-semibold text-[#18362D] dark:text-white">
                Actions waiting
              </div>
            </div>
            <Link
              href="/follow-ups"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 transition hover:text-violet-700 dark:text-violet-300"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {activeAttention.length ? (
            <div className="divide-y divide-[#EEF2EF] dark:divide-slate-900">
              {activeAttention.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="group flex items-center gap-3 px-5 py-4 transition hover:bg-[#F8FAF8] dark:hover:bg-slate-900/60"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EDF3E6] text-[#216551] dark:bg-emerald-950/30 dark:text-emerald-300">
                      <Icon size={16} />
                    </span>
                    <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-full bg-violet-50 px-2 text-sm font-semibold text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
                      {item.value.toLocaleString("en-IN")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#253E35] dark:text-slate-100">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#71847A]">
                        {item.detail}
                      </span>
                    </span>
                    <ArrowRight
                      size={14}
                      className="shrink-0 text-[#B0BDB6] transition group-hover:translate-x-0.5 group-hover:text-[#216551]"
                    />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-10">
              <div className="text-sm font-semibold text-[#253E35] dark:text-slate-100">
                You&apos;re caught up
              </div>
              <div className="mt-1 text-sm leading-6 text-[#71847A]">
                No overdue follow-ups, waiting replies, or first-touch actions are currently recorded.
              </div>
            </div>
          )}

          {unvaluedOpenLeads > 0 ? (
            <Link
              href="/revenue"
              className="mx-4 mb-4 mt-3 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 transition hover:bg-amber-100/70 dark:border-amber-900/50 dark:bg-amber-950/20"
            >
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
              label="Revenue collected"
              value={formatRevenueMetric(revenueSummary, "collected")}
              detail={revenueSummary.length ? "Recorded payments" : "Not enough data"}
            />
            <MetricCard
              href="/revenue"
              icon={WalletCards}
              label="Outstanding"
              value={formatRevenueMetric(revenueSummary, "outstanding")}
              detail={revenueSummary.length ? "Known outstanding balance" : "Not enough data"}
            />
            <MetricCard
              href="/pipeline"
              icon={Users}
              label="Enrollments"
              value={metrics.enrolled.toLocaleString("en-IN")}
              detail={`${metrics.paymentPending.toLocaleString("en-IN")} at payment`}
            />
            <MetricCard
              href="/course-management"
              icon={CalendarDays}
              label="Upcoming batches"
              value={upcomingBatches.length.toLocaleString("en-IN")}
              detail={
                trackedSeats.length
                  ? `${seatsRemaining.toLocaleString("en-IN")} tracked seats open`
                  : totalActiveDemand > 0
                    ? `${totalActiveDemand.toLocaleString("en-IN")} demand signals`
                    : "No upcoming demand yet"
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
            <section className="overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-3 border-b border-[#E7ECE9] px-5 py-4 dark:border-slate-900">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#71847A]">
                    Revenue
                  </div>
                  <div className="mt-1 text-base font-semibold text-[#18362D] dark:text-white">
                    Commercial snapshot
                  </div>
                </div>
                <Link
                  href="/revenue"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-300"
                >
                  Open revenue <ArrowRight size={12} />
                </Link>
              </div>

              {primaryRevenue ? (
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-4 border-b border-[#EEF2EF] pb-4 sm:grid-cols-4 dark:border-slate-900">
                    <RevenueMetric
                      label={primaryRevenue.currency || "Currency"}
                      value={formatMoney(primaryRevenue.collected, primaryRevenue.currency)}
                      detail="Collected"
                    />
                    <RevenueMetric
                      label="Pipeline"
                      value={formatMoney(primaryRevenue.pipeline, primaryRevenue.currency)}
                      detail={`${primaryRevenue.opportunities} opportunities`}
                    />
                    <RevenueMetric
                      label="Weighted"
                      value={formatMoney(primaryRevenue.weighted, primaryRevenue.currency)}
                      detail="Forecast value"
                    />
                    <RevenueMetric
                      label="Outstanding"
                      value={formatMoney(primaryRevenue.outstanding, primaryRevenue.currency)}
                      detail="Known balance"
                    />
                  </div>
                  <RevenueBars row={primaryRevenue} />
                  {revenueSummary.length > 1 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {revenueSummary.slice(1, 4).map((row) => (
                        <span
                          key={row.currency || "currency"}
                          className="rounded-lg border border-[#E4EAE6] bg-[#F8FAF8] px-2.5 py-1.5 text-[10px] font-semibold text-[#596E64] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                          {row.currency || "Currency"}: {formatMoney(row.collected, row.currency)} collected
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyPanel
                  title="Revenue data is not available yet"
                  detail="Record opportunity values and payments to populate this snapshot."
                />
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-3 border-b border-[#E7ECE9] px-5 py-4 dark:border-slate-900">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#71847A]">
                    Acquisition
                  </div>
                  <div className="mt-1 text-base font-semibold text-[#18362D] dark:text-white">
                    Source performance
                  </div>
                </div>
                <Link
                  href="/attribution"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-300"
                >
                  Attribution <ArrowRight size={12} />
                </Link>
              </div>

              <div className="divide-y divide-[#EEF2EF] px-5 dark:divide-slate-900">
                {sources.length ? (
                  sources.slice(0, 5).map((source) => (
                    <SourceRow key={source.source} source={source} />
                  ))
                ) : (
                  <div className="py-8 text-sm leading-6 text-[#71847A]">
                    Acquisition performance will appear when source data is available.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-3 border-b border-[#E7ECE9] px-5 py-4 dark:border-slate-900">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#71847A]">
              Business context
            </div>
            <div className="mt-1 text-base font-semibold text-[#18362D] dark:text-white">
              Upcoming course demand
            </div>
          </div>
          <Link
            href="/course-management"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-300"
          >
            View all courses <ArrowRight size={12} />
          </Link>
        </div>

        {upcomingBatches.length ? (
          <div className="grid gap-px bg-[#E7ECE9] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 dark:bg-slate-900">
            {upcomingBatches.slice(0, 6).map((batch) => (
              <BatchCard key={batch.id} batch={batch} />
            ))}
          </div>
        ) : (
          <EmptyPanel
            title="No upcoming course demand is recorded"
            detail="Upcoming batches will appear here as soon as course-management data is available."
          />
        )}
      </section>
    </div>
  );
}

function HeroStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-white/10 sm:border-l sm:pl-5 first:sm:border-l-0 first:sm:pl-0">
      <div className="truncate text-2xl font-semibold tracking-[-0.04em] text-white">
        {value}
      </div>
      <div className="mt-1 text-xs font-medium text-emerald-50/90">{label}</div>
      <div className="mt-2 truncate text-[10px] text-emerald-100/65">{detail}</div>
    </div>
  );
}

function MetricCard({
  href,
  icon: Icon,
  label,
  value,
  detail,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-[#DCE4DF] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#BFD6C6] hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#EDF3E6] text-[#216551] dark:bg-emerald-950/30 dark:text-emerald-300">
          <Icon size={15} />
        </span>
        <span className="truncate text-[11px] font-semibold text-[#71847A]">{label}</span>
      </div>
      <div className="mt-3 truncate text-[24px] font-semibold tracking-[-0.04em] text-[#18362D] dark:text-white">
        {value}
      </div>
      <div className="mt-1 truncate text-[11px] text-[#71847A]">{detail}</div>
      <div className="mt-4 flex h-7 items-end gap-1 opacity-70" aria-hidden="true">
        {[28, 42, 34, 55, 45, 66, 58, 73, 49, 78, 62, 88].map((height, index) => (
          <span
            key={index}
            className="w-full rounded-sm bg-[#9ECAB1] transition group-hover:bg-[#5EA27C]"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </Link>
  );
}

function RevenueMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#71847A]">
        {label}
      </div>
      <div className="mt-1 truncate text-xl font-semibold tracking-[-0.035em] text-[#18362D] dark:text-white">
        {value}
      </div>
      <div className="mt-1 truncate text-[10px] text-[#8A9A91]">{detail}</div>
    </div>
  );
}

function RevenueBars({ row }: { row: DashboardRevenueSummary }) {
  const values = [
    { label: "Pipeline", value: row.pipeline },
    { label: "Weighted", value: row.weighted },
    { label: "Collected", value: row.collected },
    { label: "Outstanding", value: row.outstanding },
  ];
  const max = Math.max(1, ...values.map((item) => Math.max(0, item.value)));

  return (
    <div className="mt-5 grid gap-3">
      {values.map((item) => {
        const width = Math.max(2, Math.min(100, (Math.max(0, item.value) / max) * 100));
        return (
          <div key={item.label} className="grid grid-cols-[86px_1fr_auto] items-center gap-3">
            <span className="text-[10px] font-medium text-[#71847A]">{item.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-[#EDF2EF] dark:bg-slate-900">
              <span
                className="block h-full rounded-full bg-[#216551]"
                style={{ width: `${width}%` }}
              />
            </span>
            <span className="min-w-16 text-right text-[10px] font-semibold text-[#596E64] dark:text-slate-300">
              {formatMoney(item.value, row.currency)}
            </span>
          </div>
        );
      })}
    </div>
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
      className="group min-w-0 bg-white p-3.5 transition hover:bg-[#F8FAF8] dark:bg-slate-950 dark:hover:bg-slate-900/70"
    >
      <div className="flex gap-3">
        <span className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-[#DDEBE2] via-[#EEF4EF] to-[#BFD6C6] text-[#216551] dark:from-emerald-950 dark:via-slate-900 dark:to-emerald-900">
          <BookOpen size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="line-clamp-2 text-[11px] font-semibold leading-4 text-[#253E35] dark:text-slate-100">
              {batch.courseName}
            </div>
            <span className="shrink-0 rounded-md bg-[#EDF3E6] px-1.5 py-1 text-[9px] font-semibold text-[#216551] dark:bg-emerald-950/30 dark:text-emerald-300">
              {batch.activeDemand} active
            </span>
          </div>
          <div className="mt-1 truncate text-[10px] text-[#71847A]">
            {batch.startDate ? formatDate(batch.startDate) : "Date not set"} · {batch.location}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#71847A]">
        <span>{batch.enrolled} enrolled</span>
        <span>{batch.paymentPending} payment</span>
        <span>{capacityText}</span>
      </div>
    </Link>
  );
}

function SourceRow({ source }: { source: DashboardSource }) {
  const conversion = source.leads > 0 ? Math.round((source.qualified / source.leads) * 100) : null;
  const width = conversion == null ? 0 : Math.max(3, Math.min(100, conversion));
  const Icon = sourceIcon(source.source);

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F1F6F2] text-[#216551] dark:bg-emerald-950/25 dark:text-emerald-300">
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-[#253E35] dark:text-slate-100">
              {pretty(source.source)}
            </div>
            <div className="mt-0.5 text-[10px] text-[#71847A]">
              {source.leads} leads · {source.qualified} qualified
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs font-semibold text-[#18362D] dark:text-white">
              {conversion == null ? "—" : `${conversion}%`}
            </div>
            <div className="text-[9px] text-[#8A9A91]">qualified</div>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EDF2EF] dark:bg-slate-900">
          <div className="h-full rounded-full bg-[#216551]" style={{ width: `${width}%` }} />
        </div>
      </div>
    </div>
  );
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-5 py-10">
      <div className="text-sm font-semibold text-[#253E35] dark:text-slate-100">{title}</div>
      <div className="mt-1 text-sm leading-6 text-[#71847A]">{detail}</div>
    </div>
  );
}

function sourceIcon(source: string): LucideIcon {
  const normalized = source.trim().toLowerCase();
  if (normalized.includes("whatsapp")) return MessageCircle;
  if (normalized.includes("google")) return Search;
  if (normalized.includes("direct")) return Globe2;
  if (normalized.includes("unknown")) return CircleHelp;
  return Users;
}

function formatRevenueMetric(
  rows: DashboardRevenueSummary[],
  key: "collected" | "outstanding",
) {
  if (!rows.length) return "—";
  const populated = rows.filter((row) => Number(row[key]) !== 0);
  const selected = (populated.length ? populated : rows).slice(0, 2);
  return selected.map((row) => formatMoney(row[key], row.currency)).join(" · ");
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
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
