import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CircleDollarSign,
  Clock3,
  Flame,
  ListTodo,
  MessageSquareMore,
  Sparkles,
  UserRoundPlus,
} from "lucide-react";

import { HomePulse } from "@/components/home-pulse";
import { isMockMode } from "@/lib/data";
import { getDashboardSnapshot } from "@/lib/dashboard-data";
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
  const { metrics, counts, sources, priorityLeads, revenueSummary, upcomingBatches, unvaluedOpenLeads } = snapshot;

  const pipeline = [
    { stage: "new", label: "New", value: counts.new },
    { stage: "contacted", label: "Contacted", value: counts.contacted },
    { stage: "engaged", label: "Engaged", value: counts.engaged },
    { stage: "qualified", label: "Qualified", value: counts.qualified },
    { stage: "high_intent", label: "High intent", value: counts.high_intent },
    { stage: "payment_pending", label: "Payment", value: counts.payment_pending },
    { stage: "enrolled", label: "Enrolled", value: counts.enrolled },
  ];

  const attentionCount =
    metrics.needsReply +
    metrics.needsFirstTouch +
    metrics.followupsDue +
    metrics.paymentPending;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">
            <Sparkles size={13} /> Today
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl dark:text-white">
            Good afternoon, {firstName}
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {attentionCount > 0
              ? `${attentionCount.toLocaleString("en-IN")} items can move the business forward.`
              : "No urgent action is currently detected."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/conversations"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            Inbox
            {metrics.needsReply > 0 ? (
              <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-black text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                {metrics.needsReply}
              </span>
            ) : null}
          </Link>
          <Link
            href="/leads/new"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <UserRoundPlus size={14} /> New lead
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ActionMetric
          href="/conversations"
          label="Need reply"
          value={metrics.needsReply}
          detail={metrics.waitingOverHour ? `${metrics.waitingOverHour} waiting > 1h` : "Customer is waiting"}
          icon={<MessageSquareMore size={17} />}
          tone="rose"
        />
        <ActionMetric
          href="/leads"
          label="New today"
          value={metrics.newLast24h}
          detail={metrics.needsFirstTouch ? `${metrics.needsFirstTouch} need first touch` : "Last 24 hours"}
          icon={<UserRoundPlus size={17} />}
          tone="sky"
        />
        <ActionMetric
          href="/admissions"
          label="High intent"
          value={metrics.highIntent}
          detail="Closest active opportunities"
          icon={<Flame size={17} />}
          tone="orange"
        />
        <ActionMetric
          href="/pipeline"
          label="Payment pending"
          value={metrics.paymentPending}
          detail="Closest to enrollment"
          icon={<CircleDollarSign size={17} />}
          tone="violet"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-slate-900">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                Needs attention
              </div>
              <div className="mt-1 text-sm font-black tracking-[-0.02em] text-slate-900 dark:text-white">
                Work the next best action
              </div>
            </div>
            <Link href="/admissions" className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:underline dark:text-violet-300">
              View all <ArrowRight size={12} />
            </Link>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-900">
            {priorityLeads.length ? (
              priorityLeads.slice(0, 6).map((lead) => {
                const action = nextAction(lead.stage);
                return (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50 sm:px-5 dark:hover:bg-slate-900/60"
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${action.iconClass}`}>
                      {action.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-xs font-black text-slate-900 dark:text-white">
                          {lead.name || lead.leadCode}
                        </span>
                        <StagePill stage={lead.stage} />
                      </span>
                      <span className="mt-1 flex min-w-0 items-center gap-2 text-[10px] text-slate-500">
                        <span className="truncate">{lead.course || "Course not selected"}</span>
                        <span>·</span>
                        <span className="truncate">{lead.firstTouchSource || "Unknown source"}</span>
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      <span className="block text-[10px] font-black text-slate-700 dark:text-slate-200">{action.label}</span>
                      <span className="mt-0.5 block text-[9px] text-slate-400">{intentLabel(lead.intent)} intent</span>
                    </span>
                    <ArrowRight size={14} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
                  </Link>
                );
              })
            ) : (
              <div className="px-5 py-12 text-center">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <Sparkles size={17} />
                </div>
                <div className="mt-3 text-xs font-black text-slate-700 dark:text-slate-200">No priority leads right now</div>
                <div className="mt-1 text-[10px] text-slate-400">New evidence will appear here automatically.</div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Today queue</div>
              <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">Operational pressure</div>
            </div>
            <ListTodo size={17} className="text-slate-300" />
          </div>

          <div className="mt-4 space-y-2">
            <QueueRow label="Follow-ups due" value={metrics.followupsDue} href="/follow-ups" />
            <QueueRow label="Unread messages" value={metrics.unread} href="/conversations" />
            <QueueRow label="First touch needed" value={metrics.needsFirstTouch} href="/leads" />
            <QueueRow label="Priority opportunities" value={metrics.priority} href="/admissions" />
          </div>

          {unvaluedOpenLeads > 0 ? (
            <Link
              href="/revenue"
              className="mt-4 flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/70 p-3 transition hover:bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-amber-600 shadow-sm dark:bg-slate-900 dark:text-amber-300">
                <CircleDollarSign size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-black text-amber-900 dark:text-amber-100">
                  {unvaluedOpenLeads} open {unvaluedOpenLeads === 1 ? "lead" : "leads"} missing value
                </span>
                <span className="mt-0.5 block text-[10px] leading-4 text-amber-700/80 dark:text-amber-300/70">
                  Forecast readiness is incomplete.
                </span>
              </span>
              <ArrowRight size={13} className="mt-1 text-amber-400" />
            </Link>
          ) : null}
        </section>
      </div>

      <HomePulse pipeline={pipeline} sources={sources} revenue={revenueSummary} />

      {upcomingBatches.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-slate-900">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Upcoming demand</div>
              <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">Courses to watch</div>
            </div>
            <Link href="/course-management" className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:underline dark:text-violet-300">
              Manage courses <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-4 dark:bg-slate-900">
            {upcomingBatches.slice(0, 4).map((batch) => (
              <Link
                key={batch.id}
                href="/course-management"
                className="bg-white p-4 transition hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                    <BookOpen size={16} />
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-500 dark:bg-slate-900">
                    {batch.activeDemand} active
                  </span>
                </div>
                <div className="mt-3 truncate text-xs font-black text-slate-900 dark:text-white">{batch.courseName}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <Clock3 size={11} />
                  {batch.startDate ? formatDate(batch.startDate) : "Date not set"}
                  <span>·</span>
                  <span>{batch.location}</span>
                </div>
                <div className="mt-3 flex items-center gap-3 text-[9px] font-bold text-slate-500">
                  <span>{batch.hotDemand} hot</span>
                  <span>{batch.paymentPending} payment</span>
                  <span>{batch.enrolled} enrolled</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ActionMetric({
  href,
  label,
  value,
  detail,
  icon,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  tone: "rose" | "sky" | "orange" | "violet";
}) {
  const tones = {
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300",
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-300",
    orange: "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300",
  };

  return (
    <Link
      href={href}
      className="group flex min-h-[108px] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700"
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</span>
        <span className="mt-0.5 block text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">{value.toLocaleString("en-IN")}</span>
        <span className="mt-1 block truncate text-[10px] font-medium text-slate-500">{detail}</span>
      </span>
      <ArrowRight size={14} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
    </Link>
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

function StagePill({ stage }: { stage: string }) {
  const className =
    stage === "payment_pending"
      ? "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
      : stage === "high_intent"
        ? "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300"
        : stage === "qualified"
          ? "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
          : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300";

  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.06em] ${className}`}>
      {stage.replaceAll("_", " ")}
    </span>
  );
}

function nextAction(stage: string) {
  if (stage === "payment_pending") {
    return {
      label: "Follow payment",
      icon: <CircleDollarSign size={15} />,
      iconClass: "bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300",
    };
  }
  if (stage === "high_intent") {
    return {
      label: "Move to decision",
      icon: <Flame size={15} />,
      iconClass: "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-300",
    };
  }
  if (stage === "new") {
    return {
      label: "First touch",
      icon: <UserRoundPlus size={15} />,
      iconClass: "bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-300",
    };
  }
  return {
    label: "Continue",
    icon: <ArrowRight size={15} />,
    iconClass: "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300",
  };
}

function intentLabel(intent: string) {
  return intent.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}
