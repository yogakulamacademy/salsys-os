import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CircleDollarSign,
  Clock3,
  ListTodo,
  MessageSquareMore,
  Sparkles,
  UserRoundPlus,
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
  let firstName = "there";

  if (!mock) {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) redirect("/login");

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name,role,active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.active !== true) redirect("/login");
    if (profile.role === "admissions") redirect("/dashboard");

    firstName = profile.full_name?.trim().split(/\s+/)[0] || "there";
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
  const operationalItems =
    metrics.needsReply + metrics.followupsDue + metrics.needsFirstTouch;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">
            <Sparkles size={13} /> Business overview
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl dark:text-white">
            Good afternoon, {firstName}
          </h1>
          <p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-slate-500">
            Revenue, enrollment, demand and operating health — without turning Home into another leads screen.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/analytics"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            Analytics <ArrowRight size={13} />
          </Link>
          <Link
            href="/leads/new"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <UserRoundPlus size={14} /> New lead
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BusinessMetric
          href="/revenue"
          label="Revenue collected"
          value={formatRevenueMetric(revenueSummary, "collected")}
          detail={revenueSummary.length ? "Recorded payments" : "No valued revenue yet"}
          icon={<CircleDollarSign size={17} />}
          tone="emerald"
        />
        <BusinessMetric
          href="/revenue"
          label="Outstanding"
          value={formatRevenueMetric(revenueSummary, "outstanding")}
          detail={unvaluedOpenLeads > 0 ? `${unvaluedOpenLeads} open opportunities still need value` : "Known outstanding balance"}
          icon={<CircleDollarSign size={17} />}
          tone="amber"
        />
        <BusinessMetric
          href="/pipeline"
          label="Enrollments"
          value={metrics.enrolled.toLocaleString("en-IN")}
          detail={`${metrics.paymentPending.toLocaleString("en-IN")} currently at payment`}
          icon={<Sparkles size={17} />}
          tone="violet"
        />
        <BusinessMetric
          href="/course-management"
          label="Upcoming batches"
          value={upcomingBatches.length.toLocaleString("en-IN")}
          detail={
            trackedSeats.length
              ? `${seatsRemaining.toLocaleString("en-IN")} tracked seats remaining`
              : `${totalActiveDemand.toLocaleString("en-IN")} active demand signals`
          }
          icon={<BookOpen size={17} />}
          tone="sky"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-slate-900">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                Commercial health
              </div>
              <div className="mt-1 text-sm font-black tracking-[-0.02em] text-slate-900 dark:text-white">
                Revenue by currency
              </div>
            </div>
            <Link
              href="/revenue"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:underline dark:text-violet-300"
            >
              Revenue desk <ArrowRight size={12} />
            </Link>
          </div>

          {revenueSummary.length ? (
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2 dark:bg-slate-900">
              {revenueSummary.slice(0, 4).map((row) => (
                <RevenueCard key={row.currency || "unknown"} row={row} />
              ))}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300">
                <CircleDollarSign size={18} />
              </div>
              <div className="mt-3 text-sm font-black text-slate-800 dark:text-slate-100">
                Revenue is not valued yet
              </div>
              <div className="mx-auto mt-1 max-w-md text-[11px] leading-5 text-slate-500">
                Once opportunity values and payments are recorded, Home will show collected, weighted pipeline and outstanding revenue here.
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                Operating health
              </div>
              <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                What needs attention today
              </div>
            </div>
            <ListTodo size={17} className="text-slate-300" />
          </div>

          <div className="mt-4 space-y-2">
            <QueueRow label="Customer replies waiting" value={metrics.needsReply} href="/conversations" />
            <QueueRow label="Follow-ups due" value={metrics.followupsDue} href="/follow-ups" />
            <QueueRow label="First touch needed" value={metrics.needsFirstTouch} href="/leads" />
            <QueueRow label="Payment decisions" value={metrics.paymentPending} href="/pipeline" />
          </div>

          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Today load
                </div>
                <div className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">
                  {operationalItems.toLocaleString("en-IN")}
                </div>
              </div>
              <div className="text-right text-[10px] leading-4 text-slate-500">
                Human actions across inbox,
                <br />follow-ups and first touch
              </div>
            </div>
          </div>

          {unvaluedOpenLeads > 0 ? (
            <Link
              href="/revenue"
              className="mt-3 flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/70 p-3 transition hover:bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-amber-600 shadow-sm dark:bg-slate-900 dark:text-amber-300">
                <CircleDollarSign size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-black text-amber-900 dark:text-amber-100">
                  {unvaluedOpenLeads} open {unvaluedOpenLeads === 1 ? "opportunity" : "opportunities"} missing value
                </span>
                <span className="mt-0.5 block text-[10px] leading-4 text-amber-700/80 dark:text-amber-300/70">
                  Add commercial value to improve forecasting.
                </span>
              </span>
              <ArrowRight size={13} className="mt-1 text-amber-400" />
            </Link>
          ) : null}
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-slate-900">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Demand</div>
              <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">Upcoming courses to watch</div>
            </div>
            <Link href="/course-management" className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:underline dark:text-violet-300">
              Course management <ArrowRight size={12} />
            </Link>
          </div>

          {upcomingBatches.length ? (
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2 dark:bg-slate-900">
              {upcomingBatches.slice(0, 6).map((batch) => (
                <BatchCard key={batch.id} batch={batch} />
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center text-[11px] text-slate-500">
              No upcoming course demand is available yet.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Acquisition</div>
              <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">Where demand is coming from</div>
            </div>
            <MessageSquareMore size={17} className="text-slate-300" />
          </div>

          <div className="mt-4 space-y-3">
            {sources.length ? (
              sources.slice(0, 6).map((source) => (
                <SourceRow key={source.source} source={source} />
              ))
            ) : (
              <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-[11px] text-slate-500 dark:bg-slate-900/50">
                Source performance will appear when acquisition data is available.
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/attribution" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[10px] font-black text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900">
              Attribution <ArrowRight size={11} />
            </Link>
            <Link href="/campaigns" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[10px] font-black text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900">
              Campaigns <ArrowRight size={11} />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function BusinessMetric({
  href,
  label,
  value,
  detail,
  icon,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: "emerald" | "amber" | "violet" | "sky";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300",
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-300",
  };

  return (
    <Link
      href={href}
      className="group flex min-h-[112px] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</span>
        <span className="mt-0.5 block truncate text-xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">{value}</span>
        <span className="mt-1 block truncate text-[10px] font-medium text-slate-500">{detail}</span>
      </span>
      <ArrowRight size={14} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
    </Link>
  );
}

function RevenueCard({ row }: { row: DashboardRevenueSummary }) {
  return (
    <Link href="/revenue" className="group bg-white p-5 transition hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{row.currency || "Currency"}</div>
          <div className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">
            {formatMoney(row.collected, row.currency)}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">collected</div>
        </div>
        <ArrowRight size={14} className="mt-1 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniData label="Pipeline" value={formatMoney(row.pipeline, row.currency)} />
        <MiniData label="Weighted" value={formatMoney(row.weighted, row.currency)} />
        <MiniData label="Outstanding" value={formatMoney(row.outstanding, row.currency)} />
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
    <Link href="/course-management" className="group bg-white p-4 transition hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900/70">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
          <BookOpen size={16} />
        </span>
        <span className="rounded-full bg-violet-50 px-2 py-1 text-[9px] font-black text-violet-600 dark:bg-violet-950/30 dark:text-violet-300">
          {batch.activeDemand} active
        </span>
      </div>
      <div className="mt-3 truncate text-xs font-black text-slate-900 dark:text-white">{batch.courseName}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
        <Clock3 size={11} />
        {batch.startDate ? formatDate(batch.startDate) : "Date not set"}
        <span>·</span>
        <span className="truncate">{batch.location}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-bold text-slate-500">
        <span>{batch.enrolled} enrolled</span>
        <span>{batch.paymentPending} payment</span>
        <span>{capacityText}</span>
      </div>
    </Link>
  );
}

function SourceRow({ source }: { source: DashboardSource }) {
  const conversion = source.leads > 0 ? Math.round((source.qualified / source.leads) * 100) : 0;
  const width = Math.max(4, Math.min(100, source.share));

  return (
    <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-black text-slate-800 dark:text-slate-100">{pretty(source.source)}</div>
          <div className="mt-0.5 text-[9px] text-slate-400">{source.leads} demand signals · {source.qualified} qualified</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-black text-slate-900 dark:text-white">{conversion}%</div>
          <div className="text-[8px] font-bold uppercase tracking-[0.06em] text-slate-400">qualified</div>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function QueueRow({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-900/70">
      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-black tabular-nums text-slate-900 dark:text-white">{value.toLocaleString("en-IN")}</span>
        <ArrowRight size={12} className="text-slate-300 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function MiniData({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-900/60">
      <div className="truncate text-[9px] font-black text-slate-700 dark:text-slate-200">{value}</div>
      <div className="mt-0.5 text-[8px] uppercase tracking-[0.05em] text-slate-400">{label}</div>
    </div>
  );
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
