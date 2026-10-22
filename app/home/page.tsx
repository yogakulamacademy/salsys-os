import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CircleDollarSign,
  ListTodo,
  MessageSquareMore,
  Sparkles,
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

  const attentionItems = [
    {
      label: "Inbox replies waiting",
      value: metrics.needsReply,
      detail: "Across active conversations",
      href: "/conversations",
    },
    {
      label: "Follow-ups due",
      value: metrics.followupsDue,
      detail: "Scheduled actions now due",
      href: "/follow-ups",
    },
    {
      label: "First touch needed",
      value: metrics.needsFirstTouch,
      detail: "New leads without a recorded first contact",
      href: "/leads?view=unassigned",
    },
    {
      label: "Payment decisions",
      value: metrics.paymentPending,
      detail: "Opportunities currently at payment",
      href: "/pipeline",
    },
  ];

  const activeAttention = attentionItems.filter((item) => item.value > 0);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-violet-600 dark:text-violet-300">
            Home
          </div>
          <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.035em] text-slate-950 dark:text-white">
            Overview
          </h1>
          <p className="mt-1 text-sm text-slate-500">Your business at a glance.</p>
        </div>
        <Link
          href="/commercial-intelligence"
          className="inline-flex h-9 items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 sm:self-auto"
        >
          <Sparkles size={14} className="text-violet-600" />
          Commercial intelligence
        </Link>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-900">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
              Needs your attention
            </div>
            <div className="mt-1 text-base font-semibold text-slate-950 dark:text-white">
              Actions waiting
            </div>
          </div>
          <ListTodo size={18} className="text-slate-300" />
        </div>

        {activeAttention.length ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-900">
            {activeAttention.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="group flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/60"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-50 text-sm font-semibold text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
                  {item.value.toLocaleString("en-IN")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{item.detail}</span>
                </span>
                <ArrowRight size={14} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-5 py-8">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">You&apos;re caught up</div>
            <div className="mt-1 text-sm text-slate-500">No overdue follow-ups, waiting replies, or first-touch actions are currently recorded.</div>
          </div>
        )}

        {unvaluedOpenLeads > 0 ? (
          <Link
            href="/revenue"
            className="flex items-center gap-3 border-t border-amber-100 bg-amber-50/60 px-5 py-3.5 transition hover:bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/15"
          >
            <CircleDollarSign size={16} className="shrink-0 text-amber-600 dark:text-amber-300" />
            <span className="min-w-0 flex-1 text-sm font-medium text-amber-900 dark:text-amber-100">
              {unvaluedOpenLeads} {unvaluedOpenLeads === 1 ? "deal needs" : "deals need"} an estimated value
            </span>
            <ArrowRight size={14} className="text-amber-400" />
          </Link>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BusinessMetric
          href="/revenue"
          label="Revenue collected"
          value={formatRevenueMetric(revenueSummary, "collected")}
          detail={revenueSummary.length ? "Recorded payments" : "Not enough data"}
        />
        <BusinessMetric
          href="/revenue"
          label="Outstanding"
          value={formatRevenueMetric(revenueSummary, "outstanding")}
          detail={revenueSummary.length ? "Known outstanding balance" : "Not enough data"}
        />
        <BusinessMetric
          href="/pipeline"
          label="Enrollments"
          value={metrics.enrolled.toLocaleString("en-IN")}
          detail={`${metrics.paymentPending.toLocaleString("en-IN")} at payment`}
        />
        <BusinessMetric
          href="/course-management"
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
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-900">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Revenue</div>
              <div className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Commercial snapshot</div>
            </div>
            <Link href="/revenue" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:underline dark:text-violet-300">
              Open revenue <ArrowRight size={12} />
            </Link>
          </div>

          {revenueSummary.length ? (
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2 dark:bg-slate-900">
              {revenueSummary.slice(0, 4).map((row) => (
                <RevenueCard key={row.currency || "unknown"} row={row} />
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="Revenue data is not available yet"
              detail="Record opportunity values and payments to populate this snapshot."
            />
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Acquisition</div>
              <div className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Source performance</div>
            </div>
            <MessageSquareMore size={18} className="text-slate-300" />
          </div>

          <div className="mt-4 space-y-3">
            {sources.length ? (
              sources.slice(0, 5).map((source) => (
                <SourceRow key={source.source} source={source} />
              ))
            ) : (
              <div className="rounded-xl bg-slate-50 px-4 py-7 text-sm text-slate-500 dark:bg-slate-900/50">
                Acquisition performance will appear when source data is available.
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <Link href="/attribution" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900">
              Attribution <ArrowRight size={11} />
            </Link>
            <Link href="/campaigns" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900">
              Campaigns <ArrowRight size={11} />
            </Link>
          </div>
        </section>
      </div>

      {upcomingBatches.length ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-900">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Business context</div>
              <div className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Upcoming course demand</div>
            </div>
            <Link href="/course-management" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:underline dark:text-violet-300">
              Courses <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-3 dark:bg-slate-900">
            {upcomingBatches.slice(0, 6).map((batch) => (
              <BatchCard key={batch.id} batch={batch} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function BusinessMetric({
  href,
  label,
  value,
  detail,
}: {
  href: string;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 dark:hover:bg-slate-900/60"
    >
      <span className="block text-[11px] font-semibold text-slate-500">{label}</span>
      <span className="mt-2 block truncate text-2xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white">{value}</span>
      <span className="mt-1 block truncate text-xs text-slate-500">{detail}</span>
    </Link>
  );
}

function RevenueCard({ row }: { row: DashboardRevenueSummary }) {
  return (
    <Link href="/revenue" className="group bg-white p-5 transition hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{row.currency || "Currency"}</div>
          <div className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white">
            {formatMoney(row.collected, row.currency)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">collected</div>
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
        <span className="text-[11px] font-medium text-slate-500">{batch.activeDemand} active</span>
      </div>
      <div className="mt-3 truncate text-sm font-semibold text-slate-900 dark:text-white">{batch.courseName}</div>
      <div className="mt-1 text-xs text-slate-500">
        {batch.startDate ? formatDate(batch.startDate) : "Date not set"} · {batch.location}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>{batch.enrolled} enrolled</span>
        <span>{batch.paymentPending} payment</span>
        <span>{capacityText}</span>
      </div>
    </Link>
  );
}

function SourceRow({ source }: { source: DashboardSource }) {
  const conversion = source.leads > 0 ? Math.round((source.qualified / source.leads) * 100) : null;
  const width = Math.max(4, Math.min(100, source.share));

  return (
    <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{pretty(source.source)}</div>
          <div className="mt-0.5 text-xs text-slate-500">{source.leads} leads · {source.qualified} qualified</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">{conversion == null ? "—" : `${conversion}%`}</div>
          <div className="text-[10px] text-slate-400">qualified</div>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function MiniData({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-900/60">
      <div className="truncate text-[10px] font-semibold text-slate-700 dark:text-slate-200">{value}</div>
      <div className="mt-0.5 text-[9px] text-slate-400">{label}</div>
    </div>
  );
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-5 py-10">
      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{detail}</div>
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
