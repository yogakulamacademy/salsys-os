import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ContactRound,
  MessageSquareText,
  Target,
  TrendingUp,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

import { TeamPerformanceInsights } from "@/components/team-performance-insights";

import { useMockData } from "@/lib/config";

import {
  getTeamPerformanceSnapshot,
  type TeamPerformanceEmployee,
  type TeamRecentWork,
} from "@/lib/team-performance-data";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RangeKey = "7d" | "30d" | "month" | "last_month" | "custom";

type PageQuery = {
  range?: string;
  start?: string;
  end?: string;
  employee?: string;
};

function datePartsInIndia(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(dateText: string, days: number) {
  const [year, month, day] = dateText.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day + days));

  return date.toISOString().slice(0, 10);
}

function firstDayOfMonth(dateText: string) {
  return `${dateText.slice(0, 7)}-01`;
}

function previousMonthRange(today: string) {
  const [year, month] = today.split("-").map(Number);

  const start = new Date(Date.UTC(year, month - 2, 1));

  const end = new Date(Date.UTC(year, month - 1, 0));

  return {
    start: start.toISOString().slice(0, 10),

    end: end.toISOString().slice(0, 10),
  };
}

function validDate(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function resolveRange(query: PageQuery) {
  const today = datePartsInIndia();

  const requested = (
    ["7d", "30d", "month", "last_month", "custom"] as RangeKey[]
  ).includes(query.range as RangeKey)
    ? (query.range as RangeKey)
    : "7d";

  if (
    requested === "custom" &&
    validDate(query.start) &&
    validDate(query.end) &&
    query.start! <= query.end!
  ) {
    return {
      key: requested,
      startDate: query.start!,
      endDate: query.end!,
      label: `${query.start} → ${query.end}`,
    };
  }

  if (requested === "30d") {
    return {
      key: requested,
      startDate: addDays(today, -29),
      endDate: today,
      label: "Last 30 days",
    };
  }

  if (requested === "month") {
    return {
      key: requested,
      startDate: firstDayOfMonth(today),
      endDate: today,
      label: "This month",
    };
  }

  if (requested === "last_month") {
    const previous = previousMonthRange(today);

    return {
      key: requested,
      startDate: previous.start,
      endDate: previous.end,
      label: "Last month",
    };
  }

  return {
    key: "7d" as const,
    startDate: addDays(today, -6),
    endDate: today,
    label: "Last 7 days",
  };
}

async function requireAdmin() {
  if (useMockData) {
    return;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile || profile.active !== true) {
    redirect("/login");
  }

  if (profile.role !== "admin") {
    redirect("/dashboard?restricted=1");
  }
}

function percentage(value: number) {
  return `${value.toFixed(1)}%`;
}

function minutesLabel(value: number | null) {
  if (value === null) {
    return "—";
  }

  if (value < 60) {
    return `${Math.round(value)}m`;
  }

  const hours = value / 60;

  return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
}

function roleLabel(role: string) {
  if (role === "admissions") {
    return "Employee";
  }

  if (role === "admin") {
    return "Admin";
  }

  if (role === "manager") {
    return "Manager";
  }

  return role;
}

function stageLabel(value?: string | null) {
  if (!value) {
    return "";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function eventLabel(item: TeamRecentWork) {
  if (item.eventType === "stage_change") {
    return item.toStage
      ? `Moved to ${stageLabel(item.toStage)}`
      : "Changed stage";
  }

  if (item.eventType === "followup_completed") {
    return "Completed follow-up";
  }

  if (item.eventType === "followup_snoozed") {
    return "Rescheduled follow-up";
  }

  if (item.eventType === "outbound_interaction") {
    return `${
      item.channel ? stageLabel(item.channel) : "Outbound"
    } interaction`;
  }

  return stageLabel(item.eventType);
}

function formatDateTime(value: string) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function MetricCard({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
            {label}
          </div>

          <div className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
        </div>

        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand">
          {icon}
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: string | number;
  attention?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>

      <div
        className={`mt-1.5 text-lg font-black ${
          attention ? "text-orange-600" : "text-slate-900"
        }`}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function EmployeeCard({
  employee,
  selected,
  rangeQuery,
}: {
  employee: TeamPerformanceEmployee;
  selected: boolean;
  rangeQuery: string;
}) {
  const href = selected
    ? `/team-performance?${rangeQuery}`
    : `/team-performance?${rangeQuery}&employee=${encodeURIComponent(
        employee.userId,
      )}`;

  return (
    <article
      className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
        selected
          ? "border-brand ring-2 ring-brand/10"
          : "border-slate-200 hover:-translate-y-0.5 hover:shadow-md"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-base font-black text-slate-950">
            {employee.employeeName}
          </div>

          <div className="mt-1 text-xs text-slate-500">
            {roleLabel(employee.role)}
          </div>
        </div>

        <Link
          href={href}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
            selected
              ? "bg-brand text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {selected ? "Showing details" : "View details"}

          <ArrowRight size={13} />
        </Link>
      </div>

      <div className="mt-5">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          Current workload
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniMetric label="Assigned" value={employee.currentAssignedTotal} />

          <MiniMetric label="Active" value={employee.currentActiveLeads} />

          <MiniMetric
            label="Needs reply"
            value={employee.needsReplyNow}
            attention={employee.needsReplyNow > 0}
          />

          <MiniMetric
            label="Overdue"
            value={employee.overdueLeadsNow}
            attention={employee.overdueLeadsNow > 0}
          />
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          Work completed
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniMetric label="Leads worked" value={employee.leadsWorked} />

          <MiniMetric label="Outbound" value={employee.outboundInteractions} />

          <MiniMetric label="WhatsApp" value={employee.whatsappReplies} />

          <MiniMetric label="Follow-ups" value={employee.followupsCompleted} />
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          Outcomes
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniMetric label="Qualified" value={employee.movedQualified} />

          <MiniMetric label="High intent" value={employee.movedHighIntent} />

          <MiniMetric
            label="Payment pending"
            value={employee.movedPaymentPending}
          />

          <MiniMetric label="Enrolled" value={employee.enrolledByEmployee} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Median response
          </div>

          <div className="mt-1 text-sm font-black text-slate-900">
            {minutesLabel(employee.medianFirstResponseMinutes)}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Portfolio worked
          </div>

          <div className="mt-1 text-sm font-black text-slate-900">
            {percentage(employee.portfolioWorkRate)}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Assigned cohort enrolled
          </div>

          <div className="mt-1 text-sm font-black text-slate-900">
            {percentage(employee.assignedCohortEnrollmentRate)}
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function TeamPerformancePage({
  searchParams,
}: {
  searchParams: Promise<PageQuery>;
}) {
  await requireAdmin();

  const query = await searchParams;

  const range = resolveRange(query);

  const snapshot = await getTeamPerformanceSnapshot(
    range.startDate,
    range.endDate,
  );

  const selectedEmployee = query.employee
    ? (snapshot.employees.find(
        (employee) => employee.userId === query.employee,
      ) ?? null)
    : null;

  const employeesForCharts = selectedEmployee
    ? [selectedEmployee]
    : snapshot.employees;

  const recentWork = selectedEmployee
    ? snapshot.recentWork.filter(
        (item) => item.userId === selectedEmployee.userId,
      )
    : snapshot.recentWork;

  const rangeQuery =
    range.key === "custom"
      ? `range=custom&start=${range.startDate}&end=${range.endDate}`
      : `range=${range.key}`;

  const rangeLinks: Array<{
    key: RangeKey;
    label: string;
  }> = [
    {
      key: "7d",
      label: "Last 7 days",
    },
    {
      key: "30d",
      label: "Last 30 days",
    },
    {
      key: "month",
      label: "This month",
    },
    {
      key: "last_month",
      label: "Last month",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">
            Admin intelligence
          </div>

          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            Team Performance
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Compare current workload, work completed, response efficiency and
            conversion outcomes without reducing employee performance to one
            activity score.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap gap-1.5">
            {rangeLinks.map((item) => (
              <Link
                key={item.key}
                href={`/team-performance?range=${item.key}`}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                  range.key === item.key
                    ? "bg-brand text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <form
            action="/team-performance"
            method="get"
            className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2"
          >
            <input type="hidden" name="range" value="custom" />

            <input
              type="date"
              name="start"
              defaultValue={range.startDate}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 outline-none focus:border-brand"
            />

            <span className="text-xs text-slate-400">to</span>

            <input
              type="date"
              name="end"
              defaultValue={range.endDate}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 outline-none focus:border-brand"
            />

            <button
              type="submit"
              className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
            >
              Apply
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-2xl border border-brand/15 bg-brand/[0.035] px-4 py-3 text-xs leading-5 text-slate-600">
        Reporting period:{" "}
        <span className="font-bold text-slate-900">{range.label}</span> · India
        time · Current workload metrics are live; activity and outcome metrics
        use the selected reporting period.
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <UsersRound size={17} className="text-brand" />

          <h2 className="text-sm font-black text-slate-950">Team overview</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Team members"
            value={snapshot.summary.teamMembers}
            note="Active Admin, Manager and Employee accounts included in the read model."
            icon={<UsersRound size={19} />}
          />

          <MetricCard
            label="Assigned now"
            value={snapshot.summary.currentAssignedTotal}
            note={`${snapshot.summary.currentActiveLeads.toLocaleString()} currently active leads.`}
            icon={<ContactRound size={19} />}
          />

          <MetricCard
            label="Leads worked"
            value={snapshot.summary.uniqueLeadsWorked}
            note={`${snapshot.summary.outboundInteractions.toLocaleString()} outbound interactions during the period.`}
            icon={<Activity size={19} />}
          />

          <MetricCard
            label="Follow-ups completed"
            value={snapshot.summary.followupsCompleted}
            note={`${snapshot.summary.overdueLeadsNow.toLocaleString()} assigned leads are currently overdue.`}
            icon={<CheckCircle2 size={19} />}
          />

          <MetricCard
            label="Enrolled by staff"
            value={snapshot.summary.enrolledByStaff}
            note={`${snapshot.summary.needsReplyNow.toLocaleString()} assigned leads currently need a reply.`}
            icon={<UserRoundCheck size={19} />}
          />
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-950">
              Employee performance
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Workload, effort, efficiency and outcomes are shown separately.
            </p>
          </div>

          {selectedEmployee && (
            <Link
              href={`/team-performance?${rangeQuery}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline"
            >
              Show all employees
              <ArrowRight size={13} />
            </Link>
          )}
        </div>

        <div className="grid gap-4">
          {snapshot.employees.map((employee) => (
            <EmployeeCard
              key={employee.userId}
              employee={employee}
              selected={selectedEmployee?.userId === employee.userId}
              rangeQuery={rangeQuery}
            />
          ))}
        </div>
      </section>

      <TeamPerformanceInsights employees={employeesForCharts} />

      {selectedEmployee && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-black text-slate-950">
                {selectedEmployee.employeeName} · detailed efficiency
              </div>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                Additional context for the selected reporting period.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
              {roleLabel(selectedEmployee.role)}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniMetric
              label="First responses"
              value={selectedEmployee.firstResponses}
            />

            <MiniMetric
              label="Response > 60m"
              value={selectedEmployee.firstResponseOver60m}
              attention={selectedEmployee.firstResponseOver60m > 0}
            />

            <MiniMetric
              label="Assigned this period"
              value={selectedEmployee.assignedDuringPeriod}
            />

            <MiniMetric
              label="Assigned cohort enrolled"
              value={selectedEmployee.assignedCohortEnrolled}
            />

            <MiniMetric
              label="Worked → enrolled"
              value={percentage(selectedEmployee.workedToEnrolledRate)}
            />

            <MiniMetric
              label="Never contacted now"
              value={selectedEmployee.neverContactedNow}
              attention={selectedEmployee.neverContactedNow > 0}
            />

            <MiniMetric
              label="High intent now"
              value={selectedEmployee.highIntentNow}
            />

            <MiniMetric
              label="Payment pending now"
              value={selectedEmployee.paymentPendingNow}
            />
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Clock3 size={16} className="text-brand" />

              <h2 className="text-sm font-black text-slate-950">
                Recent team activity
              </h2>
            </div>

            <p className="mt-1 text-xs text-slate-500">
              Human outbound messages, follow-up actions and stage changes from
              the selected reporting period.
            </p>
          </div>

          <div className="text-xs font-bold text-slate-400">
            {recentWork.length.toLocaleString()} events shown
          </div>
        </div>

        {recentWork.length ? (
          <div className="divide-y divide-slate-100">
            {recentWork.slice(0, 60).map((item, index) => (
              <div
                key={`${item.userId}-${item.occurredAt}-${item.leadId}-${index}`}
                className="grid gap-3 px-5 py-4 sm:grid-cols-[150px_160px_minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="text-xs font-medium text-slate-400">
                  {formatDateTime(item.occurredAt)}
                </div>

                <div>
                  <div className="text-sm font-bold text-slate-900">
                    {item.employeeName}
                  </div>

                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {roleLabel(item.role)}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-700">
                    {eventLabel(item)}
                  </div>

                  <div className="mt-0.5 truncate text-xs text-slate-400">
                    {item.leadCode}
                    {" · "}
                    {item.leadName}
                  </div>
                </div>

                <Link
                  href={`/leads/${item.leadId}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline"
                >
                  Open lead
                  <ArrowRight size={12} />
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <MessageSquareText size={22} className="mx-auto text-slate-300" />

            <div className="mt-3 text-sm font-bold text-slate-700">
              No recorded team activity in this period
            </div>

            <p className="mt-1 text-xs text-slate-400">
              Activity will appear here as staff send messages, complete
              follow-ups and progress leads.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-brand shadow-sm">
            <Target size={17} />
          </div>

          <div>
            <div className="text-sm font-black text-slate-900">
              How to read this page
            </div>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Message volume measures effort, not performance by itself.
              Enrollment and pipeline movement measure outcomes. Current
              needs-reply, overdue and never-contacted figures show operational
              backlog. Median first response is raw elapsed time and is not yet
              adjusted for working hours.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
