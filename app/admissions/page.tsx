import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Sparkles,
  UserRoundCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";

import { PipelineWorkspace } from "@/components/crm/pipeline-workspace";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { getAdmissionsSnapshot } from "@/lib/admissions-data";
import { getPipelineSnapshot } from "@/lib/pipeline-data";

type PriorityRow = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  current_stage: string | null;
  intent: string | null;
  current_contact_channel: string | null;
  first_touch_source: string | null;
  preferred_location: string | null;
  course_name: string | null;
  created_at: string | null;
  behaviour_temperature: string | null;
  engagement_score: number | string | null;
  payment_status: string | null;
  potential_value: number | string | null;
  currency: string | null;
  net_paid: number | string | null;
  outstanding_balance: number | string | null;
  next_followup_due_at: string | null;
  followup_overdue: boolean | null;
  followup_due_today: boolean | null;
  priority_score: number | string | null;
  priority_band: string | null;
  next_best_action: string | null;
  priority_reason: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
};

type FollowUpRow = {
  task_id: string;
  lead_id: string;
  lead_name: string | null;
  due_at: string | null;
};

type RevenueRow = {
  lead_id: string;
  lead_name: string | null;
  current_stage: string | null;
  currency: string | null;
  outstanding_balance: number | string | null;
  payment_status: string | null;
};

type NewLeadRow = {
  id: string;
  lead_code: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  current_stage: string | null;
  first_touch_source: string | null;
  created_at: string | null;
};

type SlaOverviewRow = {
  leads_7d: number | string | null;
  responded_7d: number | string | null;
  responded_on_time_7d: number | string | null;
  responded_late_7d: number | string | null;
  breached_now: number | string | null;
  open_now: number | string | null;
  awaiting_human_response: number | string | null;
  avg_response_minutes: number | string | null;
  median_response_minutes: number | string | null;
  p90_response_minutes: number | string | null;
  on_time_response_rate_percent: number | string | null;
};

type AdmissionsOwnerWorkloadRow = {
  owner_user_id: string | null;
  owner_name: string | null;
  owner_role: string | null;
  active_leads: number | string | null;
  needs_reply: number | string | null;
  overdue_followups: number | string | null;
  payment_pending: number | string | null;
  critical_priority: number | string | null;
  high_priority: number | string | null;
  action_load: number | string | null;
};

type AdmissionsBatchCapacityRow = {
  batch_id: string;
  course_name: string | null;
  batch_code: string | null;
  location: string | null;
  start_date: string | null;
  capacity: number | string | null;
  enrolled_count: number | string | null;
  payment_pending: number | string | null;
  hot_prospects: number | string | null;
  needs_reply: number | string | null;
  calculated_seats_remaining: number | string | null;
  capacity_status: string | null;
};

type AdmissionsView =
  | "overview"
  | "queue"
  | "pipeline"
  | "payments"
  | "capacity"
  | "performance";

type SearchParams = {
  notice?: string | string[];
  error?: string | string[];
  band?: string | string[];
  owner?: string | string[];
  view?: string | string[];
};

const validViews = new Set<AdmissionsView>([
  "overview",
  "queue",
  "pipeline",
  "payments",
  "capacity",
  "performance",
]);

export default async function AdmissionsDeskPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved = (await searchParams) ?? {};
  const notice = one(resolved.notice);
  const error = one(resolved.error);
  const requestedView = one(resolved.view) as AdmissionsView;
  const view = validViews.has(requestedView) ? requestedView : "overview";
  const band = one(resolved.band) || "all";
  const ownerFilter = one(resolved.owner) || "all";

  const [snapshot, pipelineSnapshot] = await Promise.all([
    getAdmissionsSnapshot(),
    view === "pipeline" ? getPipelineSnapshot() : Promise.resolve(null),
  ]);

  const user = snapshot.user;
  const priorityQueue = snapshot.priorityQueue as PriorityRow[];
  const followups = snapshot.followups as FollowUpRow[];
  const paymentPending = snapshot.paymentPending as RevenueRow[];
  const newLeads = snapshot.newLeads as NewLeadRow[];
  const slaOverview = snapshot.slaOverview as SlaOverviewRow | null;
  const ownerWorkload = snapshot.ownerWorkload as AdmissionsOwnerWorkloadRow[];
  const batchCapacity = snapshot.batchCapacity as AdmissionsBatchCapacityRow[];

  const needsReplyCount = snapshot.needsReplyTotal ?? 0;
  const unreadCount = snapshot.unreadTotal ?? 0;
  const now = Date.now();
  const overdue = followups.filter((row) => {
    if (!row.due_at) return false;
    const due = new Date(row.due_at).getTime();
    return Number.isFinite(due) && due < now;
  });

  const ownerScoped =
    ownerFilter === "mine"
      ? priorityQueue.filter((row) => Boolean(user?.id) && row.owner_user_id === user?.id)
      : ownerFilter === "unassigned"
        ? priorityQueue.filter((row) => !row.owner_user_id)
        : priorityQueue;

  const filteredPriority =
    band === "all"
      ? ownerScoped
      : ownerScoped.filter((row) => row.priority_band === band);

  const criticalCount = ownerScoped.filter((row) => row.priority_band === "critical").length;
  const highCount = ownerScoped.filter((row) => row.priority_band === "high").length;
  const paymentOutstanding = paymentPending.reduce(
    (sum, row) => sum + toNumber(row.outstanding_balance),
    0,
  );

  const brief = buildAdmissionsBrief({
    needsReplyCount,
    overdueCount: overdue.length,
    paymentCount: paymentPending.length,
    criticalCount: priorityQueue.filter((row) => row.priority_band === "critical").length,
    newLeadCount: newLeads.length,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CRM / Admissions"
        title="Admissions"
        description="One workspace for today’s sales actions, pipeline movement, payments, capacity and team performance."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/follow-ups" className="btn-secondary">
              <CalendarClock size={15} /> Follow-ups
            </Link>
            <Link href="/conversations" className="btn-primary">
              <Inbox size={15} /> Inbox
            </Link>
          </div>
        }
      />

      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="success">Admissions updated.</Notice> : null}

      <nav className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950" aria-label="Admissions workspace views">
        <div className="flex min-w-max items-center gap-1">
          <ViewTab href={admissionsHref({ view: "overview" })} active={view === "overview"} label="Overview" />
          <ViewTab href={admissionsHref({ view: "queue", owner: ownerFilter, band })} active={view === "queue"} label="Work Queue" />
          <ViewTab href={admissionsHref({ view: "pipeline" })} active={view === "pipeline"} label="Pipeline" />
          <ViewTab href={admissionsHref({ view: "payments" })} active={view === "payments"} label="Payments" />
          <ViewTab href={admissionsHref({ view: "capacity" })} active={view === "capacity"} label="Capacity" />
          <ViewTab href={admissionsHref({ view: "performance" })} active={view === "performance"} label="Performance" />
        </div>
      </nav>

      {view === "overview" ? (
        <AdmissionsOverview
          brief={brief}
          priorityQueue={priorityQueue}
          batchCapacity={batchCapacity}
          needsReplyCount={needsReplyCount}
          unreadCount={unreadCount}
          overdueCount={overdue.length}
          newLeadCount={newLeads.length}
          paymentCount={paymentPending.length}
          paymentOutstanding={paymentOutstanding}
        />
      ) : null}

      {view === "queue" ? (
        <PriorityQueueView
          userId={user?.id ?? null}
          ownerFilter={ownerFilter}
          band={band}
          criticalCount={criticalCount}
          highCount={highCount}
          rows={filteredPriority}
        />
      ) : null}

      {view === "pipeline" && pipelineSnapshot ? (
        <PipelineWorkspace snapshot={pipelineSnapshot} embedded />
      ) : null}

      {view === "payments" ? (
        <PaymentsView rows={paymentPending} outstanding={paymentOutstanding} />
      ) : null}

      {view === "capacity" ? <CapacityView rows={batchCapacity} /> : null}

      {view === "performance" ? (
        <AdmissionsPerformance sla={slaOverview} ownerWorkload={ownerWorkload} />
      ) : null}
    </div>
  );
}

function AdmissionsOverview({
  brief,
  priorityQueue,
  batchCapacity,
  needsReplyCount,
  unreadCount,
  overdueCount,
  newLeadCount,
  paymentCount,
  paymentOutstanding,
}: {
  brief: string;
  priorityQueue: PriorityRow[];
  batchCapacity: AdmissionsBatchCapacityRow[];
  needsReplyCount: number;
  unreadCount: number;
  overdueCount: number;
  newLeadCount: number;
  paymentCount: number;
  paymentOutstanding: number;
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-5 dark:border-violet-900/50 dark:bg-violet-950/15 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-violet-700 shadow-sm dark:bg-slate-950 dark:text-violet-300">
            <Sparkles size={17} />
          </span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">Admissions brief</div>
            <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">Where the team should focus now</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600 dark:text-slate-300">{brief}</p>
          </div>
        </div>
        <Link href="/admissions?view=queue" className="btn-primary whitespace-nowrap">
          Open work queue <ArrowRight size={14} />
        </Link>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SignalMetric href="/conversations" label="Needs reply" value={needsReplyCount} detail={unreadCount > 0 ? `${unreadCount} unread inbound` : "Conversation attention"} tone={needsReplyCount > 0 ? "attention" : "neutral"} icon={<Inbox size={16} />} />
        <SignalMetric href="/follow-ups" label="Overdue follow-ups" value={overdueCount} detail="Scheduled actions past due" tone={overdueCount > 0 ? "attention" : "neutral"} icon={<Clock3 size={16} />} />
        <SignalMetric href="/admissions?view=payments" label="Payment pending" value={paymentCount} detail={paymentOutstanding > 0 ? `${formatNumber(paymentOutstanding)} recorded outstanding` : "Near-conversion opportunities"} tone={paymentCount > 0 ? "money" : "neutral"} icon={<WalletCards size={16} />} />
        <SignalMetric href="/leads?stage=new" label="New leads" value={newLeadCount} detail="Waiting to progress beyond New" tone="neutral" icon={<UserRoundCheck size={16} />} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <PanelHeader eyebrow="Priority intelligence" title="Next best work" href="/admissions?view=queue" action="Full queue" />
          {priorityQueue.length ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {priorityQueue.slice(0, 6).map((row) => <PriorityQueueRow key={row.lead_id} row={row} compact />)}
            </div>
          ) : (
            <SimpleEmpty title="No priority work" detail="No priority rows are available in the current admissions snapshot." />
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <PanelHeader eyebrow="Demand pressure" title="Upcoming capacity" href="/admissions?view=capacity" action="View capacity" />
          {batchCapacity.length ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {batchCapacity.slice(0, 5).map((row) => <CapacityRow key={row.batch_id} row={row} compact />)}
            </div>
          ) : (
            <SimpleEmpty title="No upcoming batch data" detail="Capacity pressure will appear when scheduled batches are available." />
          )}
        </section>
      </section>
    </div>
  );
}

function PriorityQueueView({
  userId,
  ownerFilter,
  band,
  criticalCount,
  highCount,
  rows,
}: {
  userId: string | null;
  ownerFilter: string;
  band: string;
  criticalCount: number;
  highCount: number;
  rows: PriorityRow[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-900 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-violet-600 dark:text-violet-300">Action center</div>
          <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">Prioritized work queue</h2>
          <p className="mt-1 text-sm text-slate-500">One queue for the leads most likely to need a human decision now.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterTab href={admissionsHref({ view: "queue", owner: "all", band })} active={ownerFilter === "all"} label="Team" />
          {userId ? <FilterTab href={admissionsHref({ view: "queue", owner: "mine", band })} active={ownerFilter === "mine"} label="Mine" /> : null}
          <FilterTab href={admissionsHref({ view: "queue", owner: "unassigned", band })} active={ownerFilter === "unassigned"} label="Unassigned" />
          <span className="mx-1 h-8 w-px bg-slate-200 dark:bg-slate-800" />
          <FilterTab href={admissionsHref({ view: "queue", owner: ownerFilter, band: "all" })} active={band === "all"} label="All" />
          <FilterTab href={admissionsHref({ view: "queue", owner: ownerFilter, band: "critical" })} active={band === "critical"} label={`Critical ${criticalCount}`} />
          <FilterTab href={admissionsHref({ view: "queue", owner: ownerFilter, band: "high" })} active={band === "high"} label={`High ${highCount}`} />
        </div>
      </div>

      {rows.length ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-900">
          {rows.slice(0, 40).map((row) => <PriorityQueueRow key={row.lead_id} row={row} />)}
        </div>
      ) : (
        <div className="px-5 py-5"><EmptyState title="You're caught up" description="No matching leads need action in this queue. Try changing the filters." compact /></div>
      )}
    </section>
  );
}

function PaymentsView({ rows, outstanding }: { rows: RevenueRow[]; outstanding: number }) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <PerformanceMetric label="Payment-stage leads" value={formatNumber(rows.length)} detail="Current payment-pending opportunities" />
        <PerformanceMetric label="Recorded outstanding" value={outstanding > 0 ? formatNumber(outstanding) : "—"} detail="Raw recorded amount; currencies are not combined here" attention={outstanding > 0} />
        <PerformanceMetric label="Next action" value="Follow up" detail="Resolve payment questions, proof and collection status" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <PanelHeader eyebrow="Conversion" title="Payment-pending opportunities" href="/revenue" action="Open revenue" />
        {rows.length ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-900">
            {rows.map((row) => (
              <Link key={row.lead_id} href={`/leads/${row.lead_id}`} className="group grid gap-3 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/60 sm:grid-cols-[minmax(0,1fr)_160px_140px_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">{row.lead_name || "Lead"}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{pretty(row.current_stage || "payment_pending")}</div>
                </div>
                <div><div className="text-[10px] text-slate-400">Status</div><div className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{pretty(row.payment_status || "pending")}</div></div>
                <div className="sm:text-right"><div className="text-[10px] text-slate-400">Outstanding</div><div className="mt-0.5 text-sm font-semibold text-slate-950 dark:text-white">{row.outstanding_balance == null || !row.currency ? "—" : formatMoney(row.outstanding_balance, row.currency)}</div></div>
                <ArrowRight size={14} className="text-slate-300 transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        ) : (
          <SimpleEmpty title="No payment-pending opportunities" detail="Payment-stage leads will appear here when recorded." />
        )}
      </section>
    </div>
  );
}

function CapacityView({ rows }: { rows: AdmissionsBatchCapacityRow[] }) {
  const hot = rows.reduce((sum, row) => sum + toNumber(row.hot_prospects), 0);
  const seats = rows.reduce((sum, row) => sum + Math.max(0, toNumber(row.calculated_seats_remaining)), 0);
  const nearCapacity = rows.filter((row) => {
    const remaining = toNumber(row.calculated_seats_remaining);
    return row.calculated_seats_remaining != null && remaining <= 3;
  }).length;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <PerformanceMetric label="Upcoming batches" value={formatNumber(rows.length)} detail="Batches represented in current admissions demand" />
        <PerformanceMetric label="Hot prospects" value={formatNumber(hot)} detail="High-intent demand attached to upcoming batches" />
        <PerformanceMetric label="Near capacity" value={formatNumber(nearCapacity)} detail={`${formatNumber(seats)} calculated seats remain across visible batches`} attention={nearCapacity > 0} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <PanelHeader eyebrow="Demand planning" title="Batch capacity & prospect pressure" href="/course-management" action="Manage batches" />
        {rows.length ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-900">
            {rows.map((row) => <CapacityRow key={row.batch_id} row={row} />)}
          </div>
        ) : (
          <SimpleEmpty title="No upcoming batch data" detail="Batch capacity will appear when course schedules are available." />
        )}
      </section>
    </div>
  );
}

function AdmissionsPerformance({
  sla,
  ownerWorkload,
}: {
  sla: SlaOverviewRow | null;
  ownerWorkload: AdmissionsOwnerWorkloadRow[];
}) {
  const responded = toNumber(sla?.responded_7d);
  const hasResponseSample = responded > 0;
  const breached = toNumber(sla?.breached_now);
  const awaitingHuman = toNumber(sla?.awaiting_human_response);
  const hasCurrentRisk = breached > 0 || awaitingHuman > 0;
  const status = !hasResponseSample
    ? { label: "Not enough data", className: "bg-slate-100 text-slate-600" }
    : hasCurrentRisk
      ? { label: "Action needed", className: "bg-amber-100 text-amber-700" }
      : { label: "On track", className: "bg-emerald-100 text-emerald-700" };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Response performance · 7 days</div>
            <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">First-response health</h2>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PerformanceMetric label="On-time rate" value={hasResponseSample ? `${formatDecimal(sla?.on_time_response_rate_percent)}%` : "—"} detail={hasResponseSample ? `${responded} responded leads` : "No measured responses"} />
          <PerformanceMetric label="Median response" value={hasResponseSample ? formatMinutes(sla?.median_response_minutes) : "—"} detail="First outbound response" />
          <PerformanceMetric label="Open SLA" value={formatNumber(toNumber(sla?.open_now))} detail="Currently waiting" />
          <PerformanceMetric label="Breached now" value={formatNumber(breached)} detail="Past response deadline" attention={breached > 0} />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <PanelHeader eyebrow="Team" title="Admissions workload" href="/team-performance" action="Full performance" />
        {ownerWorkload.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 dark:bg-slate-900/60">
                <tr><th className="px-5 py-3">Owner</th><th className="px-4 py-3">Active</th><th className="px-4 py-3">Needs reply</th><th className="px-4 py-3">Overdue</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Action load</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                {ownerWorkload.map((row) => (
                  <tr key={row.owner_user_id || "unassigned"}>
                    <td className="px-5 py-3.5 text-sm font-medium text-slate-900 dark:text-white">{row.owner_name || "Unassigned"}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300">{formatNumber(row.active_leads)}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300">{formatNumber(row.needs_reply)}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300">{formatNumber(row.overdue_followups)}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300">{formatNumber(row.payment_pending)}</td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-900 dark:text-white">{formatNumber(row.action_load)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <SimpleEmpty title="No team workload data" detail="Workload will appear when ownership and activity records are available." />
        )}
      </section>
    </div>
  );
}

function PriorityQueueRow({ row, compact = false }: { row: PriorityRow; compact?: boolean }) {
  const reason = row.priority_reason || "Priority is based on the current CRM state.";
  const action = row.next_best_action || "Review lead";
  const lastSignal = row.next_followup_due_at
    ? `Follow-up ${formatDateTime(row.next_followup_due_at)}`
    : row.created_at
      ? `Created ${formatRelative(row.created_at)}`
      : "No recent timestamp";

  if (compact) {
    return (
      <Link href={`/leads/${row.lead_id}`} className="group flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"><ListTodo size={15} /></span>
        <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-sm text-slate-950 dark:text-white">{row.lead_name || row.lead_code || "Lead"}</strong><StagePill value={row.current_stage || "new"} /></span><span className="mt-1 block truncate text-xs text-slate-500">{action} · {row.owner_name || "Unassigned"}</span></span>
        <ArrowRight size={14} className="text-slate-300 transition group-hover:translate-x-0.5" />
      </Link>
    );
  }

  return (
    <div className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/60 lg:grid-cols-[minmax(220px,1fr)_150px_minmax(220px,1.2fr)_160px_auto] lg:items-center">
      <div className="min-w-0"><div className="flex items-center gap-2"><Link href={`/leads/${row.lead_id}`} className="truncate text-sm font-semibold text-slate-950 hover:text-violet-600 dark:text-white dark:hover:text-violet-300">{row.lead_name || row.lead_code || "Lead"}</Link><StagePill value={row.current_stage || "new"} /></div><div className="mt-1 truncate text-xs text-slate-500">{[row.course_name, row.first_touch_source, row.current_contact_channel].filter(Boolean).map((value) => pretty(String(value))).join(" · ") || "Context unavailable"}</div></div>
      <div><div className="text-[11px] text-slate-400">Owner</div><div className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{row.owner_name || "Unassigned"}</div></div>
      <div className="min-w-0"><div className="text-[11px] text-slate-400">Why prioritized</div><div className="mt-0.5 line-clamp-2 text-sm text-slate-700 dark:text-slate-200">{reason}</div><div className="mt-1 text-[11px] text-slate-400">{lastSignal}</div></div>
      <div><div className="text-[11px] text-slate-400">Next action</div><div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{action}</div></div>
      <Link href={row.next_best_action?.toLowerCase().includes("reply") ? `/conversations?lead=${row.lead_id}` : `/leads/${row.lead_id}`} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">{row.next_best_action?.toLowerCase().includes("reply") ? "Reply" : "Open"}<ArrowRight size={12} /></Link>
    </div>
  );
}

function CapacityRow({ row, compact = false }: { row: AdmissionsBatchCapacityRow; compact?: boolean }) {
  const remaining = row.calculated_seats_remaining == null ? null : toNumber(row.calculated_seats_remaining);
  return (
    <div className={`grid gap-2 px-5 py-4 ${compact ? "sm:grid-cols-[minmax(0,1fr)_90px_90px]" : "sm:grid-cols-[minmax(220px,1fr)_100px_100px_100px_110px_120px]"} sm:items-center`}>
      <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{row.course_name || row.batch_code || "Batch"}</div><div className="mt-0.5 text-xs text-slate-500">{[row.batch_code, row.location, row.start_date ? formatDate(row.start_date) : null].filter(Boolean).join(" · ")}</div></div>
      <MiniMetric label="Hot" value={formatNumber(row.hot_prospects)} />
      <MiniMetric label="Seats" value={remaining == null ? "—" : formatNumber(remaining)} />
      {!compact ? <MiniMetric label="Enrolled" value={formatNumber(row.enrolled_count)} /> : null}
      {!compact ? <MiniMetric label="Payment" value={formatNumber(row.payment_pending)} /> : null}
      {!compact ? <MiniMetric label="Needs reply" value={formatNumber(row.needs_reply)} /> : null}
    </div>
  );
}

function SignalMetric({ href, label, value, detail, tone, icon }: { href: string; label: string; value: number; detail: string; tone: "attention" | "money" | "neutral"; icon: React.ReactNode }) {
  const toneClass = tone === "attention" ? "text-amber-700 dark:text-amber-300" : tone === "money" ? "text-violet-700 dark:text-violet-300" : "text-slate-950 dark:text-white";
  return <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900/60"><div className="flex items-center justify-between gap-3"><div className="text-[11px] font-semibold text-slate-500">{label}</div><span className="text-slate-400">{icon}</span></div><div className={`mt-2 text-2xl font-semibold tracking-[-0.03em] ${toneClass}`}>{formatNumber(value)}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></Link>;
}

function PanelHeader({ eyebrow, title, href, action }: { eyebrow: string; title: string; href: string; action: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-900"><div><div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{eyebrow}</div><h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">{title}</h2></div><Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:underline dark:text-violet-300">{action}<ArrowRight size={12} /></Link></div>;
}

function PerformanceMetric({ label, value, detail, attention = false }: { label: string; value: string; detail: string; attention?: boolean }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"><div className="text-[11px] text-slate-500">{label}</div><div className={`mt-2 text-xl font-semibold ${attention ? "text-amber-700 dark:text-amber-300" : "text-slate-950 dark:text-white"}`}>{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] text-slate-400">{label}</div><div className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</div></div>;
}

function StagePill({ value }: { value: string }) {
  return <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">{pretty(value)}</span>;
}

function ViewTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return <Link href={href} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${active ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"}`}>{label}</Link>;
}

function FilterTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return <Link href={href} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${active ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"}`}>{label}</Link>;
}

function SimpleEmpty({ title, detail }: { title: string; detail: string }) {
  return <EmptyState title={title} description={detail} compact />;
}

function admissionsHref({ view, owner, band }: { view?: AdmissionsView; owner?: string; band?: string }) {
  const params = new URLSearchParams();
  if (view && view !== "overview") params.set("view", view);
  if (owner && owner !== "all") params.set("owner", owner);
  if (band && band !== "all") params.set("band", band);
  const query = params.toString();
  return query ? `/admissions?${query}` : "/admissions";
}

function buildAdmissionsBrief({ needsReplyCount, overdueCount, paymentCount, criticalCount, newLeadCount }: { needsReplyCount: number; overdueCount: number; paymentCount: number; criticalCount: number; newLeadCount: number }) {
  const signals = [
    { value: criticalCount, text: `${criticalCount} critical-priority lead${criticalCount === 1 ? "" : "s"}` },
    { value: needsReplyCount, text: `${needsReplyCount} conversation${needsReplyCount === 1 ? "" : "s"} need a reply` },
    { value: overdueCount, text: `${overdueCount} overdue follow-up${overdueCount === 1 ? "" : "s"}` },
    { value: paymentCount, text: `${paymentCount} payment-stage opportunit${paymentCount === 1 ? "y" : "ies"}` },
    { value: newLeadCount, text: `${newLeadCount} new lead${newLeadCount === 1 ? "" : "s"}` },
  ].filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  if (!signals.length) return "No urgent admissions workload is currently recorded. Use Pipeline and Capacity to monitor movement and demand.";
  return `${signals.slice(0, 3).map((item) => item.text).join(", ")}. Work the queue first, then use Pipeline, Payments and Capacity for deeper context.`;
}

function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function toNumber(value: number | string | null | undefined) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function formatNumber(value: number | string | null | undefined) { return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(toNumber(value)); }
function formatDecimal(value: number | string | null | undefined) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed.toFixed(1) : "—"; }
function formatMinutes(value: number | string | null | undefined) { if (value == null || value === "") return "—"; const minutes = Number(value); if (!Number.isFinite(minutes)) return "—"; if (minutes < 60) return `${Math.round(minutes)} min`; const hours = Math.floor(minutes / 60); const remainder = Math.round(minutes % 60); return remainder ? `${hours}h ${remainder}m` : `${hours}h`; }
function formatMoney(value: number | string | null | undefined, currency: string) { try { return new Intl.NumberFormat(currency.toUpperCase() === "INR" ? "en-IN" : "en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(toNumber(value)); } catch { return `${currency} ${formatNumber(value)}`; } }
function formatDateTime(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return value; return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(date); }
function formatRelative(value: string) { const time = new Date(value).getTime(); if (!Number.isFinite(time)) return value; const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000)); if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; return `${Math.floor(hours / 24)}d ago`; }
function formatDate(value: string) { const date = new Date(`${value.slice(0, 10)}T00:00:00Z`); if (Number.isNaN(date.getTime())) return value; return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date); }
function pretty(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
