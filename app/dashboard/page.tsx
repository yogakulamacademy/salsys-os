import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ContactRound,
  CreditCard,
  CircleDollarSign,
  Flame,
  ListTodo,
  MapPin,
  MessageSquareMore,
  MessagesSquare,
  Sparkles,
  TrendingUp,
  UserCheck,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";

import { DashboardVisuals } from "@/components/dashboard-visuals";

import { LeadsTable } from "@/components/leads-table";

import { PageHeader, StatCard } from "@/components/ui";

import { isMockMode } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

import {
  completeDashboardFollowUpAction,
  snoozeDashboardFollowUpAction,
} from "@/app/dashboard/actions";

import { getDashboardSnapshot } from "@/lib/dashboard-data";

import type {
  DashboardBatchDemand,
  DashboardRevenueSummary,
} from "@/lib/dashboard-data";

/* =========================================================



   DASHBOARD



========================================================= */

type EmployeeLeadRow = {
  id: string;
  lead_code: string | null;
  display_name: string | null;
  current_stage: string;
  intent: string | null;
  current_contact_channel: string | null;
  preferred_location: string | null;
  created_at: string;
  last_contacted_at: string | null;
};

type EmployeeTaskRow = {
  id: string;
  lead_id: string;
  title: string;
  due_at: string | null;
  status: string;
};

type EmployeeContactRow = {
  lead_id: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  pii_masked: boolean;
};

type EmployeeAttentionRow = {
  lead_id: string;
  latest_direction: string | null;
  latest_message_at: string | null;
  latest_channel: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  needs_reply: boolean | null;
};

type EmployeeReadRow = {
  lead_id: string;
  last_read_at: string | null;
};

type EmployeeAttentionState = {
  needsReply: boolean;
  unread: boolean;
  latestMessageAt: string | null;
  latestDirection: string | null;
  latestChannel: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
};

type EmployeeTodayItem = {
  lead: EmployeeLeadRow;
  score: number;
  action: string;
  reason: string;
  tone: "rose" | "amber" | "violet" | "orange" | "sky" | "slate";
  taskId: string | null;
  dueAt: string | null;
  needsReply: boolean;
  unread: boolean;
};

async function getCurrentOrganizationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(2);

  if (membershipError) {
    throw new Error(
      `Unable to resolve current organization: ${membershipError.message}`,
    );
  }

  if (!memberships || memberships.length === 0) {
    throw new Error("No active organization membership was found.");
  }

  if (memberships.length > 1) {
    throw new Error(
      "Multiple active organization memberships were found. Workspace selection is required.",
    );
  }

  return String(memberships[0].organization_id);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    error?: string;
  }>;
}) {
  if (isMockMode()) {
    return <AdminDashboardPage />;
  }

  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name,role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    redirect("/login");
  }

  if (profile.role === "admissions") {
    const organizationId = await getCurrentOrganizationId(supabase, user.id);

    return (
      <EmployeeDashboard
        userId={user.id}
        organizationId={organizationId}
        fullName={profile.full_name?.trim() || "Employee"}
        notice={query.notice ?? null}
        error={query.error ?? null}
      />
    );
  }

  return <AdminDashboardPage />;
}

async function EmployeeDashboard({
  userId,
  organizationId,
  fullName,
  notice,
  error,
}: {
  userId: string;
  organizationId: string;
  fullName: string;
  notice: string | null;
  error: string | null;
}) {
  const supabase = await createClient();

  const [leadResult, taskResult, attentionResult, readResult] =
    await Promise.all([
      supabase
        .from("leads")
        .select(
          `
        id,
        lead_code,
        display_name,
        current_stage,
        intent,
        current_contact_channel,
        preferred_location,
        created_at,
        last_contacted_at
      `,
        )
        .eq("organization_id", organizationId)
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(250),

      supabase
        .from("tasks")
        .select("id,lead_id,title,due_at,status")
        .eq("organization_id", organizationId)
        .eq("assigned_to", userId)
        .in("status", ["open", "snoozed"])
        .order("due_at", {
          ascending: true,
          nullsFirst: false,
        })
        .limit(150),

      supabase
        .from("v_lead_inbox_attention")
        .select(
          `
        lead_id,
        latest_direction,
        latest_message_at,
        latest_channel,
        last_inbound_at,
        last_outbound_at,
        needs_reply
      `,
        )
        .eq("organization_id", organizationId)
        .limit(500),

      supabase
        .from("lead_inbox_reads")
        .select("lead_id,last_read_at")
        .eq("user_id", userId)
        .limit(500),
    ]);

  if (leadResult.error) {
    throw new Error(
      `Unable to load assigned leads: ${leadResult.error.message}`,
    );
  }

  if (taskResult.error) {
    throw new Error(
      `Unable to load assigned follow-ups: ${taskResult.error.message}`,
    );
  }

  const leads = (leadResult.data ?? []) as EmployeeLeadRow[];
  const tasks = (taskResult.data ?? []) as EmployeeTaskRow[];
  const attentionRows = attentionResult.error
    ? []
    : ((attentionResult.data ?? []) as EmployeeAttentionRow[]);
  const readRows = readResult.error
    ? []
    : ((readResult.data ?? []) as EmployeeReadRow[]);

  const activeStages = new Set([
    "new",
    "contacted",
    "engaged",
    "qualified",
    "high_intent",
    "payment_pending",
  ]);

  const stageOrder = [
    "new",
    "contacted",
    "engaged",
    "qualified",
    "high_intent",
    "payment_pending",
    "enrolled",
  ];

  const stageCounts = new Map<string, number>();
  for (const stage of stageOrder) {
    stageCounts.set(stage, 0);
  }

  for (const lead of leads) {
    stageCounts.set(
      lead.current_stage,
      (stageCounts.get(lead.current_stage) ?? 0) + 1,
    );
  }

  const readByLead = new Map(
    readRows.map((row) => [row.lead_id, row.last_read_at]),
  );

  const attentionByLead = new Map<string, EmployeeAttentionState>();
  for (const row of attentionRows) {
    const lastReadAt = readByLead.get(row.lead_id) ?? null;
    const latestAt = employeeTimestamp(row.latest_message_at);
    const readAt = employeeTimestamp(lastReadAt);
    const unread =
      row.latest_direction === "inbound" &&
      latestAt > 0 &&
      (!readAt || latestAt > readAt);

    attentionByLead.set(row.lead_id, {
      needsReply: Boolean(row.needs_reply),
      unread,
      latestMessageAt: row.latest_message_at ?? null,
      latestDirection: row.latest_direction ?? null,
      latestChannel: row.latest_channel ?? null,
      lastInboundAt: row.last_inbound_at ?? null,
      lastOutboundAt: row.last_outbound_at ?? null,
    });
  }

  const activeLeads = leads.filter((lead) =>
    activeStages.has(lead.current_stage),
  );
  const newUntouched = leads.filter(
    (lead) => lead.current_stage === "new" && !lead.last_contacted_at,
  );
  const highIntent = leads.filter(
    (lead) => lead.current_stage === "high_intent",
  );
  const paymentPending = leads.filter(
    (lead) => lead.current_stage === "payment_pending",
  );
  const enrolled = leads.filter((lead) => lead.current_stage === "enrolled");

  const needsReplyLeads = activeLeads.filter(
    (lead) => attentionByLead.get(lead.id)?.needsReply,
  );
  const unreadLeads = activeLeads.filter(
    (lead) => attentionByLead.get(lead.id)?.unread,
  );

  const now = Date.now();
  const todayKey = employeeDateKey(new Date());

  const overdueTasks = tasks.filter((task) => {
    const due = employeeTimestamp(task.due_at);
    return due > 0 && due < now;
  });

  const dueTodayTasks = tasks.filter((task) => {
    const due = employeeTimestamp(task.due_at);
    return (
      due >= now &&
      Boolean(task.due_at) &&
      employeeDateKey(task.due_at as string) === todayKey
    );
  });

  const todayTasks = [...overdueTasks, ...dueTodayTasks].sort(
    (a, b) => employeeTimestamp(a.due_at) - employeeTimestamp(b.due_at),
  );

  const earliestTaskByLead = new Map<string, EmployeeTaskRow>();
  for (const task of tasks) {
    const existing = earliestTaskByLead.get(task.lead_id);
    if (
      !existing ||
      employeeTimestamp(task.due_at) < employeeTimestamp(existing.due_at)
    ) {
      earliestTaskByLead.set(task.lead_id, task);
    }
  }

  const conversionRate = leads.length
    ? Math.round((enrolled.length / leads.length) * 100)
    : 0;

  const todayQueue: EmployeeTodayItem[] = activeLeads
    .map((lead) =>
      buildEmployeeTodayItem(
        lead,
        attentionByLead.get(lead.id),
        earliestTaskByLead.get(lead.id),
        now,
        todayKey,
      ),
    )
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  let secureContacts: EmployeeContactRow[] = [];

  if (todayQueue.length > 0) {
    const { data, error } = await supabase.rpc(
      "get_admissions_lead_contacts_secure",
      {
        p_lead_ids: todayQueue.map((item) => item.lead.id),
      },
    );

    if (error) {
      throw new Error(`Unable to load masked contacts: ${error.message}`);
    }

    secureContacts = (data ?? []) as EmployeeContactRow[];
  }

  const contactByLead = new Map(
    secureContacts.map((contact) => [contact.lead_id, contact]),
  );

  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const firstName = fullName.split(/\s+/).filter(Boolean)[0] || "there";

  return (
    <div className="dashboard-polish">
      <PageHeader
        eyebrow="My admissions workspace"
        title={`Welcome, ${firstName}`}
        description="Work today’s replies, overdue follow-ups, fresh enquiries, and high-intent opportunities without leaving your assigned pipeline."
        actions={
          <Link className="btn-primary" href="/conversations">
            Open conversations
            <ArrowRight size={15} />
          </Link>
        }
      />

      {notice ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          {dashboardNoticeLabel(notice)}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      {(attentionResult.error || readResult.error) && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
          Conversation attention is temporarily unavailable. Lead and follow-up
          data is still current.
        </div>
      )}

      <section className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-brand">
              <Sparkles size={13} />
              Today&apos;s action center
            </div>
            <div className="mt-1 text-lg font-black tracking-tight text-slate-900">
              Start with the work that can move a lead forward now
            </div>
          </div>

          <div className="text-xs font-semibold text-slate-400">
            {todayQueue.length.toLocaleString()} prioritised item
            {todayQueue.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <EmployeeFocusMetric
            icon={<MessageSquareMore size={17} />}
            label="Needs reply"
            value={needsReplyLeads.length}
            note={`${unreadLeads.length} unread inbound`}
            href="/conversations"
            tone="rose"
          />

          <EmployeeFocusMetric
            icon={<ListTodo size={17} />}
            label="Overdue"
            value={overdueTasks.length}
            note="follow-ups already past due"
            href="/follow-ups"
            tone="amber"
          />

          <EmployeeFocusMetric
            icon={<UserRoundPlus size={17} />}
            label="Needs first touch"
            value={newUntouched.length}
            note="fresh assigned enquiries"
            href="/leads"
            tone="sky"
          />

          <EmployeeFocusMetric
            icon={<CreditCard size={17} />}
            label="Payment pending"
            value={paymentPending.length}
            note="closest to enrollment"
            href="/pipeline"
            tone="violet"
          />
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Assigned leads"
          value={leads.length.toLocaleString()}
          note={`${activeLeads.length} active opportunities`}
          icon={<ContactRound size={19} />}
        />

        <StatCard
          label="Due today"
          value={dueTodayTasks.length.toLocaleString()}
          note="scheduled later today"
          icon={<CalendarDays size={19} />}
        />

        <StatCard
          label="High intent"
          value={highIntent.length.toLocaleString()}
          note="ready for focused follow-up"
          icon={<Flame size={19} />}
        />

        <StatCard
          label="My conversion"
          value={leads.length ? `${conversionRate}%` : "—"}
          note={`${enrolled.length} enrolled assigned leads`}
          icon={<TrendingUp size={19} />}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_.6fr]">
        <section className="card overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <div className="eyebrow">Today queue</div>
              <div className="section-title mt-1">What to do next</div>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Real inbox state, overdue work, first-touch urgency, payment
                stage, and intent determine this order.
              </p>
            </div>

            <Link
              href="/leads"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-brand hover:underline"
            >
              My leads
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {todayQueue.length ? (
              todayQueue.map((item) => (
                <EmployeeTodayLead
                  key={item.lead.id}
                  item={item}
                  contact={contactByLead.get(item.lead.id)}
                />
              ))
            ) : (
              <div className="px-5 py-12 text-center">
                <CheckCircle2 size={23} className="mx-auto text-emerald-400" />
                <div className="mt-2 text-sm font-bold text-slate-700">
                  Your urgent queue is clear
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  New replies, assignments, and follow-ups will appear here
                  automatically.
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card-pad self-start">
          <div className="eyebrow">My pipeline</div>
          <div className="section-title mt-1">Conversion progress</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Only your assigned leads are included.
          </p>

          <div className="mt-5 space-y-3">
            {stageOrder.map((stage) => {
              const count = stageCounts.get(stage) ?? 0;
              const percent = leads.length
                ? Math.round((count / leads.length) * 100)
                : 0;

              return (
                <div key={stage}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold text-slate-600">
                      {employeeStageLabel(stage)}
                    </span>
                    <span className="font-black text-slate-900">{count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand transition-all duration-700"
                      style={{ width: `${Math.min(100, percent)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <Link
              href="/conversations"
              className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
            >
              <div className="text-[10px] font-black uppercase tracking-[.12em] text-rose-600">
                Customer waiting
              </div>
              <div className="mt-2 flex items-end justify-between gap-4">
                <div className="text-3xl font-black tracking-tight text-slate-900">
                  {needsReplyLeads.length}
                </div>
                <div className="text-right text-[10px] font-semibold text-slate-500">
                  needs reply
                </div>
              </div>
            </Link>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="text-[10px] font-black uppercase tracking-[.12em] text-emerald-600">
                Enrollment conversion
              </div>
              <div className="mt-2 flex items-end justify-between gap-4">
                <div className="text-3xl font-black tracking-tight text-slate-900">
                  {leads.length ? `${conversionRate}%` : "—"}
                </div>
                <div className="text-right text-[10px] font-semibold text-slate-500">
                  {enrolled.length} enrolled
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="card mt-4 overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="eyebrow">Today&apos;s follow-ups</div>
            <div className="section-title mt-1">Overdue + due today</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Assigned follow-ups are ordered by due time so overdue work stays
              visible.
            </p>
          </div>

          <Link
            href="/follow-ups"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-brand hover:underline"
          >
            All follow-ups
            <ArrowRight size={13} />
          </Link>
        </div>

        <div className="divide-y divide-slate-100">
          {todayTasks.slice(0, 10).length ? (
            todayTasks.slice(0, 10).map((task) => {
              const lead = leadById.get(task.lead_id);
              const isOverdue = employeeTimestamp(task.due_at) < now;

              return (
                <div
                  key={task.id}
                  className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50/70 lg:flex-row lg:items-center"
                >
                  <Link
                    href={`/leads/${task.lead_id}`}
                    className="flex min-w-0 flex-1 items-center gap-4"
                  >
                    <div
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                        isOverdue
                          ? "bg-rose-50 text-rose-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      <ListTodo size={17} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-800">
                        {lead?.display_name ||
                          lead?.lead_code ||
                          "Assigned lead"}
                      </div>

                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {task.title}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div
                        className={`text-xs font-bold ${
                          isOverdue ? "text-rose-600" : "text-amber-700"
                        }`}
                      >
                        {isOverdue ? "Overdue · " : "Due · "}
                        {formatEmployeeDateTime(task.due_at)}
                      </div>

                      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400">
                        {employeeStageLabel(lead?.current_stage || "new")}
                      </div>
                    </div>
                  </Link>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                    <form action={completeDashboardFollowUpAction}>
                      <input type="hidden" name="task_id" value={task.id} />
                      <input
                        type="hidden"
                        name="lead_id"
                        value={task.lead_id}
                      />
                      <button
                        type="submit"
                        className="inline-flex rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-slate-700"
                      >
                        Complete
                      </button>
                    </form>

                    <form action={snoozeDashboardFollowUpAction}>
                      <input type="hidden" name="task_id" value={task.id} />
                      <input
                        type="hidden"
                        name="lead_id"
                        value={task.lead_id}
                      />
                      <button
                        type="submit"
                        className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
                      >
                        Snooze
                      </button>
                    </form>

                    <Link
                      href={`/conversations?lead=${task.lead_id}`}
                      className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-brand transition hover:bg-slate-50"
                    >
                      Conversation
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-5 py-10 text-center">
              <CheckCircle2 size={22} className="mx-auto text-emerald-400" />
              <div className="mt-2 text-sm font-bold text-slate-700">
                No follow-ups due today
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Future assigned follow-ups remain available on the Follow-ups
                page.
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function EmployeeTodayLead({
  item,
  contact,
}: {
  item: EmployeeTodayItem;
  contact?: EmployeeContactRow;
}) {
  const lead = item.lead;

  const actionTones = {
    rose: "border-rose-100 bg-rose-50 text-rose-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    violet: "border-violet-100 bg-violet-50 text-violet-700",
    orange: "border-orange-100 bg-orange-50 text-orange-700",
    sky: "border-sky-100 bg-sky-50 text-sky-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <div className="px-5 py-4 transition hover:bg-slate-50/70">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/leads/${lead.id}`}
              className="truncate text-sm font-black text-slate-900 hover:text-brand"
            >
              {lead.display_name || lead.lead_code || "Lead"}
            </Link>
            <EmployeeStageBadge stage={lead.current_stage} />
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[.06em] ${actionTones[item.tone]}`}
            >
              {item.action}
            </span>
            {item.unread ? (
              <span className="inline-flex rounded-full bg-brand px-2 py-0.5 text-[9px] font-black uppercase tracking-[.06em] text-white">
                Unread
              </span>
            ) : null}
          </div>

          <div className="mt-1 text-xs font-semibold text-slate-600">
            {item.reason}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-400">
            <span>{lead.lead_code || "—"}</span>
            <span>{lead.preferred_location || "Location not selected"}</span>
            {lead.intent ? (
              <span>{employeeIntentLabel(lead.intent)} intent</span>
            ) : null}
            {lead.current_contact_channel ? (
              <span>{employeeStageLabel(lead.current_contact_channel)}</span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
            <span>
              <strong className="font-bold text-slate-700">Phone:</strong>{" "}
              {contact?.phone || contact?.whatsapp || "Not captured"}
            </span>
            <span>
              <strong className="font-bold text-slate-700">Email:</strong>{" "}
              {contact?.email || "Not captured"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {item.taskId ? (
            <>
              <form action={completeDashboardFollowUpAction}>
                <input type="hidden" name="task_id" value={item.taskId} />
                <input type="hidden" name="lead_id" value={lead.id} />
                <button
                  type="submit"
                  className="inline-flex items-center rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-700"
                >
                  Complete
                </button>
              </form>

              <form action={snoozeDashboardFollowUpAction}>
                <input type="hidden" name="task_id" value={item.taskId} />
                <input type="hidden" name="lead_id" value={lead.id} />
                <button
                  type="submit"
                  className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Snooze
                </button>
              </form>
            </>
          ) : null}

          <Link
            href={`/conversations?lead=${lead.id}`}
            className="btn-secondary"
          >
            <MessagesSquare size={15} />
            Conversation
          </Link>

          <Link href={`/leads/${lead.id}`} className="btn-primary">
            Open lead
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function EmployeeFocusMetric({
  icon,
  label,
  value,
  note,
  href,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
  href: string;
  tone: "rose" | "amber" | "sky" | "slate" | "orange" | "violet";
}) {
  const tones = {
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
    sky: "bg-sky-50 text-sky-600",
    slate: "bg-slate-100 text-slate-600",
    orange: "bg-orange-50 text-orange-600",
    violet: "bg-violet-50 text-violet-600",
  };

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50"
    >
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-slate-700">{label}</div>
        <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
          {note}
        </div>
      </div>
      <div className="text-2xl font-black tracking-tight text-slate-900">
        {value.toLocaleString()}
      </div>
      <ArrowRight
        size={14}
        className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand"
      />
    </Link>
  );
}

function EmployeeStageBadge({ stage }: { stage: string }) {
  const className =
    stage === "payment_pending"
      ? "border-violet-100 bg-violet-50 text-violet-700"
      : stage === "high_intent"
        ? "border-orange-100 bg-orange-50 text-orange-700"
        : stage === "enrolled"
          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
          : stage === "qualified"
            ? "border-sky-100 bg-sky-50 text-sky-700"
            : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[.06em] ${className}`}
    >
      {employeeStageLabel(stage)}
    </span>
  );
}

function buildEmployeeTodayItem(
  lead: EmployeeLeadRow,
  attention: EmployeeAttentionState | undefined,
  task: EmployeeTaskRow | undefined,
  now: number,
  todayKey: string,
): EmployeeTodayItem {
  const due = employeeTimestamp(task?.due_at);
  const overdue = due > 0 && due < now;
  const dueToday =
    due >= now &&
    Boolean(task?.due_at) &&
    employeeDateKey(task?.due_at as string) === todayKey;
  const needsFirstTouch =
    lead.current_stage === "new" && !lead.last_contacted_at;
  const needsReply = Boolean(attention?.needsReply);
  const unread = Boolean(attention?.unread);
  const waitMinutes = needsReply
    ? employeeWaitingMinutes(attention?.latestMessageAt, now)
    : 0;

  let score = 0;

  if (needsReply) score += 120;
  if (unread) score += 18;
  if (waitMinutes >= 60)
    score += Math.min(40, Math.floor(waitMinutes / 60) * 5);
  if (overdue) score += 100;
  if (needsFirstTouch) score += 85;
  if (dueToday) score += 45;

  if (lead.current_stage === "payment_pending") score += 60;
  else if (lead.current_stage === "high_intent") score += 48;
  else if (lead.current_stage === "qualified") score += 32;
  else if (lead.current_stage === "engaged") score += 18;
  else if (lead.current_stage === "contacted") score += 10;

  if (lead.intent === "very_high") score += 24;
  else if (lead.intent === "high") score += 14;

  if (needsReply) {
    return {
      lead,
      score,
      action: "Reply now",
      reason:
        waitMinutes > 0
          ? `Customer has been waiting ${employeeWaitLabel(waitMinutes)} for a response.`
          : "Latest customer message needs a response.",
      tone: "rose",
      taskId: task?.id ?? null,
      dueAt: task?.due_at ?? null,
      needsReply,
      unread,
    };
  }

  if (overdue) {
    return {
      lead,
      score,
      action: "Overdue follow-up",
      reason: task?.due_at
        ? `Follow-up was due ${formatEmployeeDateTime(task.due_at)}.`
        : "Assigned follow-up is overdue.",
      tone: "amber",
      taskId: task?.id ?? null,
      dueAt: task?.due_at ?? null,
      needsReply,
      unread,
    };
  }

  if (needsFirstTouch) {
    return {
      lead,
      score,
      action: "First contact",
      reason: "New assigned enquiry has not been contacted yet.",
      tone: "sky",
      taskId: task?.id ?? null,
      dueAt: task?.due_at ?? null,
      needsReply,
      unread,
    };
  }

  if (lead.current_stage === "payment_pending") {
    return {
      lead,
      score,
      action: "Payment follow-up",
      reason: "Payment is pending; this lead is closest to enrollment.",
      tone: "violet",
      taskId: task?.id ?? null,
      dueAt: task?.due_at ?? null,
      needsReply,
      unread,
    };
  }

  if (dueToday) {
    return {
      lead,
      score,
      action: "Follow-up today",
      reason: task?.due_at
        ? `Scheduled for ${formatEmployeeDateTime(task.due_at)}.`
        : "Assigned follow-up is due today.",
      tone: "amber",
      taskId: task?.id ?? null,
      dueAt: task?.due_at ?? null,
      needsReply,
      unread,
    };
  }

  if (lead.current_stage === "high_intent" || lead.intent === "very_high") {
    return {
      lead,
      score,
      action: "High intent",
      reason:
        "Strong enrollment intent; continue the conversation toward a decision.",
      tone: "orange",
      taskId: task?.id ?? null,
      dueAt: task?.due_at ?? null,
      needsReply,
      unread,
    };
  }

  if (lead.current_stage === "qualified" || lead.intent === "high") {
    return {
      lead,
      score,
      action: "Qualified",
      reason: "Qualified opportunity ready for focused follow-up.",
      tone: "slate",
      taskId: task?.id ?? null,
      dueAt: task?.due_at ?? null,
      needsReply,
      unread,
    };
  }

  return {
    lead,
    score,
    action: "Continue",
    reason: "Active assigned opportunity.",
    tone: "slate",
    taskId: task?.id ?? null,
    dueAt: task?.due_at ?? null,
    needsReply,
    unread,
  };
}

function dashboardNoticeLabel(notice: string) {
  if (notice === "followup-completed") {
    return "Follow-up completed.";
  }

  if (notice === "followup-snoozed") {
    return "Follow-up snoozed to tomorrow at 10:00 AM IST.";
  }

  return notice;
}

function employeeStageLabel(stage: string) {
  return stage
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function employeeIntentLabel(intent: string) {
  return intent
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function employeeTimestamp(value?: string | null) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function employeeDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function employeeWaitingMinutes(value: string | null | undefined, now: number) {
  const timestamp = employeeTimestamp(value);
  if (!timestamp || timestamp > now) return 0;
  return Math.max(1, Math.floor((now - timestamp) / 60000));
}

function employeeWaitLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (hours < 24) {
    return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

function formatEmployeeDateTime(value?: string | null) {
  if (!value) return "Due now";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Due now";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date);
}

async function AdminDashboardPage() {
  const snapshot = await getDashboardSnapshot();

  const {
    metrics,

    counts,

    sources,

    priorityLeads,

    revenueSummary,

    upcomingBatches,

    unvaluedOpenLeads,
  } = snapshot;

  /* =======================================================



     CORE METRICS



  ======================================================= */

  const total = metrics.total;

  const activePipeline = metrics.activePipeline;

  const qualified = metrics.qualifiedPlus;

  const needsReplyCount = metrics.needsReply;

  const unreadCount = metrics.unread;

  const needsFirstTouchCount = metrics.needsFirstTouch;

  const waitingOverHourCount = metrics.waitingOverHour;

  const priorityCount = metrics.priority;

  const newLast24Hours = metrics.newLast24h;

  const followupsDue = metrics.followupsDue;

  const qualificationRate = total ? Math.round((qualified / total) * 100) : 0;

  const enrollmentRate = total
    ? Math.round((counts.enrolled / total) * 100)
    : 0;

  const mock = isMockMode();

  /* =======================================================



     PIPELINE CHART DATA



  ======================================================= */

  const pipeline = [
    {
      stage: "New",

      leads: counts.new,
    },

    {
      stage: "Contacted",

      leads: counts.contacted,
    },

    {
      stage: "Engaged",

      leads: counts.engaged,
    },

    {
      stage: "Qualified",

      leads: counts.qualified,
    },

    {
      stage: "High intent",

      leads: counts.high_intent,
    },

    {
      stage: "Payment",

      leads: counts.payment_pending,
    },

    {
      stage: "Enrolled",

      leads: counts.enrolled,
    },
  ];

  return (
    <div className="dashboard-polish">
      {/* ===================================================



          HEADER



      =================================================== */}

      <PageHeader
        eyebrow="Growth command center"
        title="Admissions command center"
        description="See what needs attention, where leads are moving, and which opportunities are closest to enrollment."
        actions={
          <>
            <span
              className={`



                rounded-xl



                px-3



                py-2



                text-xs



                font-bold



                ${
                  mock
                    ? "bg-orange-50 text-orange-700"
                    : "bg-emerald-50 text-emerald-700"
                }



              `}
            >
              {mock ? "Mock data" : "Supabase live"}
            </span>

            <Link className="btn-primary" href="/leads">
              View all leads
              <ArrowRight size={15} />
            </Link>
          </>
        }
      />

      {/* ===================================================



          ATTENTION STRIP



      =================================================== */}

      <section
        className="



          mb-4



          overflow-hidden



          rounded-2xl



          border



          border-slate-200



          bg-white



          shadow-sm



        "
      >
        <div
          className="



            flex



            flex-col



            gap-4



            border-b



            border-slate-100



            px-5



            py-4



            sm:flex-row



            sm:items-center



            sm:justify-between



          "
        >
          <div>
            <div
              className="



                flex



                items-center



                gap-2



                text-[10px]



                font-black



                uppercase



                tracking-[.14em]



                text-brand



              "
            >
              <Sparkles size={13} />
              Today's attention
            </div>

            <div
              className="



                mt-1



                text-lg



                font-black



                tracking-tight



                text-slate-900



              "
            >
              Start with the conversations and leads that need action
            </div>
          </div>

          <Link
            href="/admissions"
            className="



              inline-flex



              items-center



              gap-2



              text-xs



              font-bold



              text-brand



              hover:underline



            "
          >
            Open Admissions Desk
            <ArrowRight size={14} />
          </Link>
        </div>

        <div
          className="



            grid



            divide-y



            divide-slate-100



            sm:grid-cols-2



            sm:divide-x



            sm:divide-y-0



            xl:grid-cols-6



          "
        >
          <AttentionMetric
            icon={<MessagesSquare size={17} />}
            label="Needs reply"
            value={needsReplyCount}
            note={
              waitingOverHourCount
                ? `${waitingOverHourCount} waiting over 1 hour`
                : "latest message is from the lead"
            }
            tone="rose"
            href="/conversations"
          />

          <AttentionMetric
            icon={<MessageSquareMore size={17} />}
            label="Unread"
            value={unreadCount}
            note="customer messages not opened yet"
            tone="sky"
            href="/conversations"
          />

          <AttentionMetric
            icon={<UserRoundPlus size={17} />}
            label="Needs first touch"
            value={needsFirstTouchCount}
            note="new leads not contacted"
            tone="amber"
            href="/conversations"
          />

          <AttentionMetric
            icon={<Flame size={17} />}
            label="High intent"
            value={counts.high_intent}
            note="strong enrollment intent"
            tone="orange"
            href="/admissions"
          />

          <AttentionMetric
            icon={<CreditCard size={17} />}
            label="Payment pending"
            value={counts.payment_pending}
            note="closest to enrollment"
            tone="violet"
            href="/admissions"
          />

          <AttentionMetric
            icon={<ListTodo size={17} />}
            label="Follow-ups due"
            value={followupsDue}
            note="open tasks requiring action"
            tone="slate"
            href="/follow-ups"
          />
        </div>
      </section>

      {/* ===================================================



          KPI ROW



      =================================================== */}

      <div
        className="



          grid



          gap-4



          sm:grid-cols-2



          xl:grid-cols-5



        "
      >
        <div
          className="



            animate-rise



            stagger-1



          "
        >
          <StatCard
            label="Last 24 hours"
            value={newLast24Hours.toLocaleString()}
            note="new leads created"
            icon={<UserRoundPlus size={19} />}
          />
        </div>

        <div
          className="



            animate-rise



            stagger-2



          "
        >
          <StatCard
            label="Active pipeline"
            value={activePipeline.toLocaleString()}
            note="open admissions opportunities"
            icon={<ContactRound size={19} />}
          />
        </div>

        <div
          className="



            animate-rise



            stagger-3



          "
        >
          <StatCard
            label="Qualified+"
            value={qualified.toLocaleString()}
            note={total ? `${qualificationRate}% of all leads` : "No leads yet"}
            icon={<UserCheck size={19} />}
          />
        </div>

        <div
          className="



            animate-rise



            stagger-4



          "
        >
          <StatCard
            label="Enrolled"
            value={counts.enrolled.toLocaleString()}
            note={
              total
                ? `${enrollmentRate}% overall conversion`
                : "No enrollments yet"
            }
            icon={<CheckCircle2 size={19} />}
          />
        </div>

        <div
          className="



            animate-rise



            stagger-5



          "
        >
          <StatCard
            label="Priority"
            value={priorityCount.toLocaleString()}
            note="high intent + payment"
            icon={<Flame size={19} />}
          />
        </div>
      </div>

      {/* ===================================================



          INSIGHTS + ACTION CENTER



      =================================================== */}

      <div
        className="



          mt-4



          grid



          gap-4



          xl:grid-cols-[1.4fr_.6fr]



        "
      >
        <div
          className="



            animate-rise



            stagger-2



          "
        >
          <DashboardVisuals
            pipeline={pipeline}
            sources={sources}
            total={total}
            activePipeline={activePipeline}
            qualified={qualified}
            enrolled={counts.enrolled}
            priority={priorityCount}
          />
        </div>

        <section
          className="



            card-pad



            animate-rise



            stagger-3



          "
        >
          <div>
            <div className="eyebrow">Action center</div>

            <div
              className="



                section-title



                mt-1



              "
            >
              Work that matters now
            </div>

            <p
              className="



                mt-1



                text-xs



                leading-5



                text-slate-400



              "
            >
              Real inbox state and admissions queues, not estimated activity.
            </p>
          </div>

          <div
            className="



              mt-5



              space-y-3



            "
          >
            <ActionLink
              href="/conversations"
              icon={<MessagesSquare size={17} />}
              label="Needs reply"
              value={needsReplyCount}
              note={
                unreadCount
                  ? `${unreadCount} unread conversations`
                  : "no unread conversations"
              }
            />

            <ActionLink
              href="/admissions"
              icon={<ClipboardCheck size={17} />}
              label="Priority admissions"
              value={priorityCount}
              note="high intent + payment pending"
            />

            <ActionLink
              href="/follow-ups"
              icon={<ListTodo size={17} />}
              label="Follow-ups due"
              value={followupsDue}
              note="open admissions tasks"
            />
          </div>

          {/* -----------------------------------------------



              QUALIFICATION



          ----------------------------------------------- */}

          <div
            className="



              mt-5



              rounded-2xl



              border



              border-slate-100



              bg-slate-50



              p-4



            "
          >
            <div
              className="



                flex



                items-start



                justify-between



                gap-4



              "
            >
              <div>
                <div
                  className="



                    text-[10px]



                    font-black



                    uppercase



                    tracking-[.14em]



                    text-slate-400



                  "
                >
                  Qualification rate
                </div>

                <div
                  className="



                    mt-2



                    text-3xl



                    font-black



                    tracking-tight



                    text-slate-900



                  "
                >
                  {total ? `${qualificationRate}%` : "—"}
                </div>
              </div>

              <div
                className="



                  grid



                  h-10



                  w-10



                  place-items-center



                  rounded-xl



                  bg-white



                  text-brand



                  shadow-sm



                "
              >
                <TrendingUp size={18} />
              </div>
            </div>

            <div
              className="



                mt-4



                h-2



                overflow-hidden



                rounded-full



                bg-slate-200



              "
            >
              <div
                className="



                  h-full



                  rounded-full



                  bg-brand



                  transition-all



                  duration-700



                "
                style={{
                  width: `${Math.min(
                    100,

                    qualificationRate,
                  )}%`,
                }}
              />
            </div>

            <div
              className="



                mt-3



                flex



                items-center



                justify-between



                gap-3



              "
            >
              <span
                className="



                  text-[10px]



                  font-semibold



                  text-slate-400



                "
              >
                Qualified → Enrolled pipeline
              </span>

              <Link
                href="/funnel"
                className="



                  text-xs



                  font-bold



                  text-brand



                  hover:underline



                "
              >
                Open funnel →
              </Link>
            </div>
          </div>

          {/* -----------------------------------------------



              ENROLLMENT CONVERSION



          ----------------------------------------------- */}

          <div
            className="



              mt-3



              rounded-2xl



              border



              border-emerald-100



              bg-emerald-50/60



              p-4



            "
          >
            <div
              className="



                text-[10px]



                font-black



                uppercase



                tracking-[.14em]



                text-emerald-600



              "
            >
              Enrollment conversion
            </div>

            <div
              className="



                mt-2



                flex



                items-end



                justify-between



                gap-4



              "
            >
              <div
                className="



                  text-2xl



                  font-black



                  tracking-tight



                  text-slate-900



                "
              >
                {total ? `${enrollmentRate}%` : "—"}
              </div>

              <div
                className="



                  text-right



                  text-[10px]



                  font-semibold



                  text-slate-500



                "
              >
                {counts.enrolled} enrolled
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ===================================================



          COMMERCIAL PULSE



      =================================================== */}

      <div
        className="



          mt-4



          grid



          gap-4



          xl:grid-cols-[.82fr_1.18fr]



        "
      >
        <section
          className="



            card-pad



            animate-rise



            stagger-3



          "
        >
          <div
            className="



              flex



              items-start



              justify-between



              gap-4



            "
          >
            <div>
              <div className="eyebrow">Commercial pulse</div>

              <div className="section-title mt-1">Revenue at a glance</div>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                Live pipeline, weighted forecast, collected revenue and
                outstanding balances.
              </p>
            </div>

            <Link
              href="/revenue"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-brand hover:underline"
            >
              Full revenue
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {revenueSummary.map((group) => (
              <RevenuePulseRow key={group.currency} group={group} />
            ))}
          </div>

          {unvaluedOpenLeads > 0 && (
            <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-amber-800">
                    {unvaluedOpenLeads.toLocaleString()} open lead
                    {unvaluedOpenLeads === 1 ? "" : "s"} without forecast value
                  </div>

                  <div className="mt-0.5 text-[10px] font-medium text-amber-600">
                    Assign a batch or manual potential value to include them in
                    revenue forecasting.
                  </div>
                </div>

                <CircleDollarSign
                  size={18}
                  className="shrink-0 text-amber-600"
                />
              </div>
            </div>
          )}
        </section>

        <section
          className="



            card



            overflow-hidden



            animate-rise



            stagger-4



          "
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <div className="eyebrow">Upcoming batches</div>

              <div className="section-title mt-1">Demand by batch</div>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                Active prospects, hot leads and enrollments linked to each
                upcoming course batch.
              </p>
            </div>

            <UsersRound size={19} className="mt-1 shrink-0 text-brand" />
          </div>

          <div className="divide-y divide-slate-100">
            {upcomingBatches.length ? (
              upcomingBatches.map((batch) => (
                <BatchDemandRow key={batch.id} batch={batch} />
              ))
            ) : (
              <div className="px-5 py-10 text-center">
                <CalendarDays size={22} className="mx-auto text-slate-300" />

                <div className="mt-2 text-sm font-bold text-slate-700">
                  No upcoming batches found
                </div>

                <div className="mt-1 text-xs text-slate-400">
                  Upcoming active course batches will appear here automatically.
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ===================================================



          PRIORITY LEADS



      =================================================== */}

      <section
        className="



          card



          mt-4



          overflow-hidden



          animate-rise



          stagger-4



        "
      >
        <div
          className="



            flex



            flex-col



            gap-3



            border-b



            border-slate-100



            px-5



            py-4



            sm:flex-row



            sm:items-center



            sm:justify-between



          "
        >
          <div>
            <div className="eyebrow">Admissions priority</div>

            <div
              className="



                section-title



                mt-1



              "
            >
              Leads needing attention
            </div>

            <p
              className="



                mt-1



                text-xs



                text-slate-400



              "
            >
              Reply state, unread messages, first-touch gaps and funnel stage
              are combined to surface the most actionable leads.
            </p>
          </div>

          <div
            className="



              flex



              items-center



              gap-3



            "
          >
            <Link
              href="/conversations"
              className="



                text-xs



                font-bold



                text-slate-500



                hover:text-brand



              "
            >
              Conversations
            </Link>

            <Link
              href="/leads"
              className="



                inline-flex



                items-center



                gap-1



                text-sm



                font-bold



                text-brand



                hover:underline



              "
            >
              All leads
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        <LeadsTable leads={priorityLeads} compact />
      </section>
    </div>
  );
}

/* =========================================================

   REVENUE PULSE ROW



========================================================= */

function RevenuePulseRow({ group }: { group: DashboardRevenueSummary }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-brand shadow-sm">
            <CircleDollarSign size={17} />
          </div>

          <div>
            <div className="text-sm font-black text-slate-900">
              {group.currency}
            </div>

            <div className="text-[10px] font-semibold text-slate-400">
              {group.opportunities.toLocaleString()} valued open opportunit
              {group.opportunities === 1 ? "y" : "ies"}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">
            Collected
          </div>

          <div className="mt-0.5 text-lg font-black tracking-tight text-emerald-700">
            {formatDashboardMoney(
              group.collected,

              group.currency,
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <RevenueMiniMetric
          label="Pipeline"
          value={formatDashboardMoney(
            group.pipeline,

            group.currency,
          )}
        />

        <RevenueMiniMetric
          label="Weighted"
          value={formatDashboardMoney(
            group.weighted,

            group.currency,
          )}
        />

        <RevenueMiniMetric
          label="Outstanding"
          value={formatDashboardMoney(
            group.outstanding,

            group.currency,
          )}
        />
      </div>
    </div>
  );
}

function RevenueMiniMetric({
  label,

  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      <div className="text-[9px] font-black uppercase tracking-[.1em] text-slate-400">
        {label}
      </div>

      <div className="mt-1 truncate text-sm font-black tracking-tight text-slate-800">
        {value}
      </div>
    </div>
  );
}

/* =========================================================



   BATCH DEMAND ROW



========================================================= */

function BatchDemandRow({ batch }: { batch: DashboardBatchDemand }) {
  const hasCapacity =
    batch.capacity != null &&
    batch.capacity > 0 &&
    batch.seatsRemaining != null;

  const filledSeats = hasCapacity
    ? Math.max(
        0,

        batch.capacity! - batch.seatsRemaining!,
      )
    : 0;

  const filledPercent = hasCapacity
    ? Math.min(
        100,

        Math.round((filledSeats / batch.capacity!) * 100),
      )
    : 0;

  return (
    <div className="px-5 py-4 transition hover:bg-slate-50/70">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
              <CalendarDays size={17} />
            </div>

            <div className="min-w-0">
              <div className="truncate text-sm font-black text-slate-900">
                {batch.courseName}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-400">
                <span>
                  {formatBatchDateRange(
                    batch.startDate,

                    batch.endDate,
                  )}
                </span>

                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} />

                  {batch.location}
                </span>

                <span className="uppercase tracking-[.08em]">
                  {formatModeLabel(batch.mode)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 lg:w-[390px]">
          <DemandMetric label="Active" value={batch.activeDemand} />

          <DemandMetric
            label="Hot"
            value={batch.hotDemand}
            emphasis={batch.hotDemand > 0}
          />

          <DemandMetric
            label="Payment"
            value={batch.paymentPending}
            emphasis={batch.paymentPending > 0}
          />

          <DemandMetric label="Enrolled" value={batch.enrolled} />
        </div>
      </div>

      {hasCapacity && (
        <div className="mt-3 flex items-center gap-3 pl-[52px]">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand transition-all duration-700"
              style={{
                width: `${filledPercent}%`,
              }}
            />
          </div>

          <div className="shrink-0 text-[10px] font-bold text-slate-400">
            {batch.seatsRemaining} seats remaining
          </div>
        </div>
      )}
    </div>
  );
}

function DemandMetric({
  label,

  value,

  emphasis = false,
}: {
  label: string;

  value: number;

  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-2.5 py-2 text-center ${
        emphasis
          ? "border-orange-100 bg-orange-50"
          : "border-slate-100 bg-slate-50"
      }`}
    >
      <div
        className={`text-base font-black ${
          emphasis ? "text-orange-700" : "text-slate-800"
        }`}
      >
        {value.toLocaleString()}
      </div>

      <div className="mt-0.5 text-[9px] font-black uppercase tracking-[.08em] text-slate-400">
        {label}
      </div>
    </div>
  );
}

/* =========================================================



   COMMERCIAL FORMAT HELPERS



========================================================= */

function formatDashboardMoney(
  value: number,

  currency: string,
) {
  try {
    return new Intl.NumberFormat(
      currency === "INR" ? "en-IN" : "en-US",

      {
        style: "currency",

        currency,

        maximumFractionDigits: 0,
      },
    ).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`;
  }
}

function formatBatchDateRange(
  startDate: string | null,

  endDate: string | null,
) {
  if (!startDate) {
    return "Date to be confirmed";
  }

  const start = new Date(`${startDate}T00:00:00Z`);

  const end = endDate ? new Date(`${endDate}T00:00:00Z`) : null;

  if (Number.isNaN(start.getTime())) {
    return startDate;
  }

  const startLabel = new Intl.DateTimeFormat(
    "en",

    {
      day: "numeric",

      month: "short",

      year: "numeric",

      timeZone: "UTC",
    },
  ).format(start);

  if (!end || Number.isNaN(end.getTime())) {
    return startLabel;
  }

  const endLabel = new Intl.DateTimeFormat(
    "en",

    {
      day: "numeric",

      month: "short",

      year: "numeric",

      timeZone: "UTC",
    },
  ).format(end);

  return `${startLabel} – ${endLabel}`;
}

function formatModeLabel(mode: string) {
  return mode

    .replaceAll("_", " ")

    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/* =========================================================



   ATTENTION METRIC



========================================================= */

function AttentionMetric({
  icon,

  label,

  value,

  note,

  href,

  tone,
}: {
  icon: React.ReactNode;

  label: string;

  value: number;

  note: string;

  href: string;

  tone: "rose" | "orange" | "violet" | "sky" | "amber" | "slate";
}) {
  const tones = {
    rose: "bg-rose-50 text-rose-600",

    orange: "bg-orange-50 text-orange-600",

    violet: "bg-violet-50 text-violet-600",

    sky: "bg-sky-50 text-sky-600",

    amber: "bg-amber-50 text-amber-600",

    slate: "bg-slate-100 text-slate-600",
  };

  return (
    <Link
      href={href}
      className="



        group



        flex



        items-center



        gap-3



        px-5



        py-4



        transition



        hover:bg-slate-50



      "
    >
      <div
        className={`



          grid



          h-10



          w-10



          shrink-0



          place-items-center



          rounded-xl



          ${tones[tone]}



        `}
      >
        {icon}
      </div>

      <div
        className="



          min-w-0



          flex-1



        "
      >
        <div
          className="



            text-xs



            font-bold



            text-slate-700



          "
        >
          {label}
        </div>

        <div
          className="



            mt-0.5



            truncate



            text-[10px]



            font-medium



            text-slate-400



          "
        >
          {note}
        </div>
      </div>

      <div
        className="



          text-2xl



          font-black



          tracking-tight



          text-slate-900



        "
      >
        {value.toLocaleString()}
      </div>

      <ArrowRight
        size={14}
        className="



          text-slate-300



          transition



          group-hover:translate-x-0.5



          group-hover:text-brand



        "
      />
    </Link>
  );
}

/* =========================================================



   ACTION LINK



========================================================= */

function ActionLink({
  href,

  icon,

  label,

  value,

  note,
}: {
  href: string;

  icon: React.ReactNode;

  label: string;

  value: number;

  note: string;
}) {
  return (
    <Link
      href={href}
      className="



        group



        flex



        items-center



        gap-3



        rounded-xl



        border



        border-slate-100



        bg-white



        p-3.5



        transition



        hover:-translate-y-0.5



        hover:border-slate-200



        hover:shadow-md



      "
    >
      <div
        className="



          grid



          h-9



          w-9



          shrink-0



          place-items-center



          rounded-xl



          bg-brand/10



          text-brand



          transition



          group-hover:bg-brand



          group-hover:text-white



        "
      >
        {icon}
      </div>

      <div
        className="



          min-w-0



          flex-1



        "
      >
        <div
          className="



            text-sm



            font-bold



            text-slate-800



          "
        >
          {label}
        </div>

        <div
          className="



            mt-0.5



            truncate



            text-[11px]



            text-slate-400



          "
        >
          {note}
        </div>
      </div>

      <div
        className="



          text-lg



          font-black



          tracking-tight



          text-slate-900



        "
      >
        {value.toLocaleString()}
      </div>

      <ArrowRight
        size={15}
        className="



          text-slate-300



          transition



          group-hover:translate-x-0.5



          group-hover:text-brand



        "
      />
    </Link>
  );
}
