import Link from 'next/link';
import {
  Activity,
  ArrowLeftRight,
  CheckCircle2,
  Clock3,
  ContactRound,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';

import {
  TeamAssignmentInsights,
} from '@/components/team-assignment-insights';
import {
  TeamPerformanceInsights,
} from '@/components/team-performance-insights';
import {
  getTeamAssignmentFairnessSnapshot,
  getTeamPerformanceSnapshot,
} from '@/lib/team-performance-data';

type RangeKey =
  | '7d'
  | '30d'
  | 'month'
  | 'last_month'
  | 'custom';

type PageQuery = {
  range?: string;
  start?: string;
  end?: string;
  employee?: string;
};

function datePartsInIndia(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(dateText: string, days: number) {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function firstDayOfMonth(dateText: string) {
  return `${dateText.slice(0, 7)}-01`;
}

function previousMonthRange(today: string) {
  const [year, month] = today.split('-').map(Number);
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
    ['7d', '30d', 'month', 'last_month', 'custom'] as RangeKey[]
  ).includes(query.range as RangeKey)
    ? (query.range as RangeKey)
    : '7d';

  if (
    requested === 'custom' &&
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

  if (requested === '30d') {
    return {
      key: requested,
      startDate: addDays(today, -29),
      endDate: today,
      label: 'Last 30 days',
    };
  }

  if (requested === 'month') {
    return {
      key: requested,
      startDate: firstDayOfMonth(today),
      endDate: today,
      label: 'This month',
    };
  }

  if (requested === 'last_month') {
    const previous = previousMonthRange(today);
    return {
      key: requested,
      startDate: previous.start,
      endDate: previous.end,
      label: 'Last month',
    };
  }

  return {
    key: '7d' as const,
    startDate: addDays(today, -6),
    endDate: today,
    label: 'Last 7 days',
  };
}

function percentage(value: number) {
  return `${value.toFixed(1)}%`;
}

function minutesLabel(value: number | null) {
  if (value === null) return '—';
  if (value < 60) return `${Math.round(value)}m`;
  const hours = value / 60;
  return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
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
            {typeof value === 'number' ? value.toLocaleString() : value}
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

export default async function ReadOnlyTeamPerformancePage({
  searchParams,
}: {
  searchParams: Promise<PageQuery>;
}) {
  const query = await searchParams;
  const range = resolveRange(query);

  const [snapshot, assignmentFairness] = await Promise.all([
    getTeamPerformanceSnapshot(range.startDate, range.endDate),
    getTeamAssignmentFairnessSnapshot(range.startDate, range.endDate),
  ]);

  const selectedEmployee = query.employee
    ? snapshot.employees.find((employee) => employee.userId === query.employee) ?? null
    : null;

  const employeesForCharts = selectedEmployee
    ? [selectedEmployee]
    : snapshot.employees;

  const rangeQuery =
    range.key === 'custom'
      ? `range=custom&start=${range.startDate}&end=${range.endDate}`
      : `range=${range.key}`;

  const rangeLinks: Array<{ key: RangeKey; label: string }> = [
    { key: '7d', label: 'Last 7 days' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">
            Reports workspace · Read only
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            Team Performance
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Team workload, activity, response efficiency and outcomes. Lead assignment controls are reserved for organization owners and admins.
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
                    ? 'bg-brand text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
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
        Reporting period: <span className="font-bold text-slate-900">{range.label}</span>
        {' · '}India time · This Reports view is read-only.
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
            note="Active CRM team members included in the organization-scoped report."
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

      <TeamPerformanceInsights employees={employeesForCharts} />

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <ArrowLeftRight size={17} className="text-brand" />
              <h2 className="text-sm font-black text-slate-950">Assignment distribution</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Historical assignment distribution is reporting context only; this view cannot assign or transfer leads.
            </p>
          </div>
          <div className="text-xs font-bold text-slate-400">
            {assignmentFairness.summary.recordedAssignmentEvents.toLocaleString()} recorded assignments
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Unique leads assigned"
            value={assignmentFairness.summary.uniqueLeadsAssigned}
            note="Distinct leads assigned during the selected period."
            icon={<ContactRound size={19} />}
          />
          <MetricCard
            label="Transfers"
            value={assignmentFairness.summary.transferEvents}
            note="Recorded employee-to-employee owner transfers."
            icon={<ArrowLeftRight size={19} />}
          />
          <MetricCard
            label="Unassignments"
            value={assignmentFairness.summary.unassignmentEvents}
            note="Recorded moves from an employee back to unassigned."
            icon={<UsersRound size={19} />}
          />
          <MetricCard
            label="Unassigned now"
            value={assignmentFairness.summary.currentUnassignedOpen}
            note="Current open leads without an owner; no assignment action is exposed here."
            icon={<UsersRound size={19} />}
          />
        </div>

        <div className="px-5 pb-5">
          <TeamAssignmentInsights
            employees={assignmentFairness.employees}
            recordedAssignments={assignmentFairness.summary.recordedAssignmentEvents}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-black text-slate-950">Employee performance</h2>
          <p className="mt-1 text-xs text-slate-500">
            Workload and outcomes remain separated so activity volume is not treated as a performance score.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-left">
                <th className="px-5 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Employee</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Active leads</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Leads worked</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Follow-ups</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Enrolled</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Median response</th>
                <th className="px-5 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Assigned cohort</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snapshot.employees.map((employee) => (
                <tr key={employee.userId} className="text-sm">
                  <td className="px-5 py-4">
                    <div className="font-black text-slate-900">{employee.employeeName}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{employee.role}</div>
                  </td>
                  <td className="px-4 py-4 font-bold text-slate-800">{employee.currentActiveLeads.toLocaleString()}</td>
                  <td className="px-4 py-4 text-slate-600">{employee.leadsWorked.toLocaleString()}</td>
                  <td className="px-4 py-4 text-slate-600">{employee.followupsCompleted.toLocaleString()}</td>
                  <td className="px-4 py-4 font-bold text-slate-800">{employee.enrolledByEmployee.toLocaleString()}</td>
                  <td className="px-4 py-4 text-slate-600">{minutesLabel(employee.medianFirstResponseMinutes)}</td>
                  <td className="px-5 py-4 font-bold text-slate-800">{percentage(employee.assignedCohortEnrollmentRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <Clock3 size={16} className="text-brand" />
          <div>
            <h2 className="text-sm font-black text-slate-950">Recent team activity</h2>
            <p className="mt-1 text-xs text-slate-500">Read-only activity from the selected reporting period.</p>
          </div>
        </div>

        {snapshot.recentWork.length ? (
          <div className="divide-y divide-slate-100">
            {snapshot.recentWork.slice(0, 40).map((item, index) => (
              <div
                key={`${item.userId}-${item.occurredAt}-${item.leadId}-${index}`}
                className="grid gap-2 px-5 py-4 sm:grid-cols-[170px_170px_minmax(0,1fr)] sm:items-center"
              >
                <div className="text-xs text-slate-400">{new Date(item.occurredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
                <div className="text-sm font-bold text-slate-900">{item.employeeName}</div>
                <div className="text-sm text-slate-600">{item.leadCode} · {item.leadName}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-slate-500">No recorded team activity in this period.</div>
        )}
      </section>

      <div className="rounded-2xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-xs leading-5 text-blue-800">
        Read-only Reports access does not expose lead assignment controls or the operational unassigned-lead queue.
        {' '}Organization owners and admins retain those controls in their administrative Team Performance view.
      </div>
    </div>
  );
}
