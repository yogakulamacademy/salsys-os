import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Inbox,
  Sparkles,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { getAdmissionsSnapshot } from "@/lib/admissions-data";

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

type SearchParams = {
  notice?: string | string[];
  error?: string | string[];
  band?: string | string[];
  owner?: string | string[];
  view?: string | string[];
};

export default async function AdmissionsDeskPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved = (await searchParams) ?? {};
  const notice = one(resolved.notice);
  const error = one(resolved.error);
  const band = one(resolved.band) || "all";
  const ownerFilter = one(resolved.owner) || "all";
  const view = one(resolved.view) === "performance" ? "performance" : "queue";

  const snapshot = await getAdmissionsSnapshot();
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admissions Desk"
        description="Prioritize leads, follow-ups, and pending payments."
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

      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950">
        <ViewTab href={admissionsHref({ view: "queue", owner: ownerFilter, band })} active={view === "queue"} label="Priority queue" />
        <ViewTab href={admissionsHref({ view: "performance", owner: ownerFilter, band })} active={view === "performance"} label="Performance" />
      </div>

      {view === "queue" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SignalMetric
              href="/conversations"
              label="Needs reply"
              value={needsReplyCount}
              detail={unreadCount > 0 ? `${unreadCount} unread` : "Admissions-scoped conversations"}
              tone={needsReplyCount > 0 ? "attention" : "neutral"}
            />
            <SignalMetric
              href="/follow-ups"
              label="Overdue follow-ups"
              value={overdue.length}
              detail="Scheduled actions past due"
              tone={overdue.length > 0 ? "attention" : "neutral"}
            />
            <SignalMetric
              href="/pipeline"
              label="Payment pending"
              value={paymentPending.length}
              detail={paymentOutstanding > 0 ? `${formatNumber(paymentOutstanding)} recorded outstanding` : "Near-conversion opportunities"}
              tone={paymentPending.length > 0 ? "money" : "neutral"}
            />
            <SignalMetric
              href="/leads"
              label="New leads"
              value={newLeads.length}
              detail="Waiting to progress beyond New"
              tone="neutral"
            />
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-900 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-violet-600 dark:text-violet-300">
                  Team priorities
                </div>
                <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">Priority queue</h2>
                <p className="mt-1 text-sm text-slate-500">Work the highest-value next decisions first.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <FilterTab href={admissionsHref({ view, owner: "all", band })} active={ownerFilter === "all"} label="Team" />
                {user?.id ? (
                  <FilterTab href={admissionsHref({ view, owner: "mine", band })} active={ownerFilter === "mine"} label="Mine" />
                ) : null}
                <FilterTab href={admissionsHref({ view, owner: "unassigned", band })} active={ownerFilter === "unassigned"} label="Unassigned" />
                <span className="mx-1 h-8 w-px bg-slate-200 dark:bg-slate-800" />
                <FilterTab href={admissionsHref({ view, owner: ownerFilter, band: "all" })} active={band === "all"} label="All" />
                <FilterTab href={admissionsHref({ view, owner: ownerFilter, band: "critical" })} active={band === "critical"} label={`Critical ${criticalCount}`} />
                <FilterTab href={admissionsHref({ view, owner: ownerFilter, band: "high" })} active={band === "high"} label={`High ${highCount}`} />
              </div>
            </div>

            {filteredPriority.length ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-900">
                {filteredPriority.slice(0, 30).map((row) => (
                  <PriorityQueueRow key={row.lead_id} row={row} />
                ))}
              </div>
            ) : (
              <div className="px-5 py-5">
                <EmptyState
                  title="You're caught up"
                  description="No matching leads need action in this queue. Try changing the filters."
                  compact
                />
              </div>
            )}
          </section>

          {paymentPending.length ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-900">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Conversion</div>
                  <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Pending payments</h2>
                </div>
                <Link href="/pipeline" className="text-xs font-semibold text-violet-600 hover:underline dark:text-violet-300">Open pipeline</Link>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-900">
                {paymentPending.slice(0, 8).map((row) => (
                  <Link key={row.lead_id} href={`/leads/${row.lead_id}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300">
                      <CircleDollarSign size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{row.lead_name || "Lead"}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{pretty(row.current_stage || "payment_pending")}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                        {row.outstanding_balance == null || !row.currency ? "—" : formatMoney(row.outstanding_balance, row.currency)}
                      </span>
                      <span className="block text-[11px] text-slate-400">outstanding</span>
                    </span>
                    <ArrowRight size={14} className="text-slate-300 transition group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <AdmissionsPerformance
          sla={slaOverview}
          ownerWorkload={ownerWorkload}
          batchCapacity={batchCapacity}
        />
      )}
    </div>
  );
}

function PriorityQueueRow({ row }: { row: PriorityRow }) {
  const reason = row.priority_reason || "Priority is based on the current CRM state.";
  const action = row.next_best_action || "Review lead";
  const lastSignal = row.next_followup_due_at
    ? `Follow-up ${formatDateTime(row.next_followup_due_at)}`
    : row.created_at
      ? `Created ${formatRelative(row.created_at)}`
      : "No recent timestamp";

  return (
    <div className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/60 lg:grid-cols-[minmax(220px,1fr)_150px_minmax(220px,1.2fr)_160px_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link href={`/leads/${row.lead_id}`} className="truncate text-sm font-semibold text-slate-950 hover:text-violet-600 dark:text-white dark:hover:text-violet-300">
            {row.lead_name || row.lead_code || "Lead"}
          </Link>
          <StagePill value={row.current_stage || "new"} />
        </div>
        <div className="mt-1 truncate text-xs text-slate-500">
          {[row.course_name, row.first_touch_source, row.current_contact_channel].filter(Boolean).map((value) => pretty(String(value))).join(" · ") || "Context unavailable"}
        </div>
      </div>

      <div>
        <div className="text-[11px] text-slate-400">Owner</div>
        <div className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">{row.owner_name || "Unassigned"}</div>
      </div>

      <div className="min-w-0">
        <div className="text-[11px] text-slate-400">Why this is prioritized</div>
        <div className="mt-0.5 line-clamp-2 text-sm text-slate-700 dark:text-slate-200">{reason}</div>
        <div className="mt-1 text-[11px] text-slate-400">{lastSignal}</div>
      </div>

      <div>
        <div className="text-[11px] text-slate-400">Next action</div>
        <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{action}</div>
      </div>

      <Link
        href={row.next_best_action?.toLowerCase().includes("reply") ? `/conversations?lead=${row.lead_id}` : `/leads/${row.lead_id}`}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
      >
        {row.next_best_action?.toLowerCase().includes("reply") ? "Reply" : "Open"}
        <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function AdmissionsPerformance({
  sla,
  ownerWorkload,
  batchCapacity,
}: {
  sla: SlaOverviewRow | null;
  ownerWorkload: AdmissionsOwnerWorkloadRow[];
  batchCapacity: AdmissionsBatchCapacityRow[];
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
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-900">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Team</div>
          <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Workload</h2>
        </div>
        {ownerWorkload.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 dark:bg-slate-900/60">
                <tr>
                  <th className="px-5 py-3">Owner</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Needs reply</th>
                  <th className="px-4 py-3">Overdue</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Action load</th>
                </tr>
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

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-900">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Business context</div>
            <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Upcoming batch pressure</h2>
          </div>
          <Link href="/course-management" className="text-xs font-semibold text-violet-600 hover:underline dark:text-violet-300">Courses</Link>
        </div>
        {batchCapacity.length ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-900">
            {batchCapacity.slice(0, 8).map((row) => (
              <div key={row.batch_id} className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(220px,1fr)_100px_100px_110px_120px] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{row.course_name || row.batch_code || "Batch"}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{[row.batch_code, row.location, row.start_date ? formatDate(row.start_date) : null].filter(Boolean).join(" · ")}</div>
                </div>
                <MiniMetric label="Enrolled" value={formatNumber(row.enrolled_count)} />
                <MiniMetric label="Payment" value={formatNumber(row.payment_pending)} />
                <MiniMetric label="Hot" value={formatNumber(row.hot_prospects)} />
                <MiniMetric label="Seats open" value={row.calculated_seats_remaining == null ? "—" : formatNumber(row.calculated_seats_remaining)} />
              </div>
            ))}
          </div>
        ) : (
          <SimpleEmpty title="No upcoming batch data" detail="Batch capacity will appear when course schedules are available." />
        )}
      </section>
    </div>
  );
}

function SignalMetric({
  href,
  label,
  value,
  detail,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
  tone: "attention" | "money" | "neutral";
}) {
  const toneClass =
    tone === "attention"
      ? "text-amber-700 dark:text-amber-300"
      : tone === "money"
        ? "text-violet-700 dark:text-violet-300"
        : "text-slate-950 dark:text-white";

  return (
    <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900/60">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tracking-[-0.03em] ${toneClass}`}>{formatNumber(value)}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </Link>
  );
}

function PerformanceMetric({
  label,
  value,
  detail,
  attention = false,
}: {
  label: string;
  value: string;
  detail: string;
  attention?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`mt-2 text-xl font-semibold ${attention ? "text-amber-700 dark:text-amber-300" : "text-slate-950 dark:text-white"}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  );
}

function StagePill({ value }: { value: string }) {
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
      {pretty(value)}
    </span>
  );
}

function ViewTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${active ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"}`}>
      {label}
    </Link>
  );
}

function FilterTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${active ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"}`}>
      {label}
    </Link>
  );
}

function SimpleEmpty({ title, detail }: { title: string; detail: string }) {
  return <EmptyState title={title} description={detail} compact />;
}

function admissionsHref({
  view,
  owner,
  band,
}: {
  view?: string;
  owner?: string;
  band?: string;
}) {
  const params = new URLSearchParams();
  if (view === "performance") params.set("view", "performance");
  if (owner && owner !== "all") params.set("owner", owner);
  if (band && band !== "all") params.set("band", band);
  const query = params.toString();
  return query ? `/admissions?${query}` : "/admissions";
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(toNumber(value));
}

function formatDecimal(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(1) : "—";
}

function formatMinutes(value: number | string | null | undefined) {
  if (value == null || value === "") return "—";
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatMoney(value: number | string | null | undefined, currency: string) {
  try {
    return new Intl.NumberFormat(currency.toUpperCase() === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(toNumber(value));
  } catch {
    return `${currency} ${formatNumber(value)}`;
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function formatRelative(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}