import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Inbox,
  MessageSquareText,
  Scale,
  UserRound,
} from "lucide-react";

import { DecisionMetricCard } from "@/components/intelligence/decision-metric-card";
import {
  getTeamAssignmentQueue,
  getTeamPerformanceSnapshot,
  type TeamPerformanceEmployee,
} from "@/lib/team-performance-data";

function datePartsInIndia(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(dateText: string, days: number) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function admissionsEmployees(employees: TeamPerformanceEmployee[]) {
  return employees.filter((employee) => employee.role === "admissions");
}

export async function PerformanceOperatingBrief() {
  const today = datePartsInIndia();
  const startDate = addDays(today, -6);

  const [snapshotResult, assignmentResult] = await Promise.allSettled([
    getTeamPerformanceSnapshot(startDate, today),
    getTeamAssignmentQueue(12),
  ]);

  const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
  const assignmentQueue = assignmentResult.status === "fulfilled" ? assignmentResult.value : null;
  const employees = admissionsEmployees(snapshot?.employees ?? []);

  const needsReply = snapshot?.summary.needsReplyNow ?? 0;
  const overdue = snapshot?.summary.overdueLeadsNow ?? 0;
  const unassigned = assignmentQueue?.total ?? 0;

  const heaviest = employees.length
    ? [...employees].sort(
        (a, b) =>
          b.currentActionLoad - a.currentActionLoad ||
          b.currentActiveLeads - a.currentActiveLeads ||
          a.employeeName.localeCompare(b.employeeName),
      )[0]
    : null;

  const available = employees.length
    ? [...employees].sort(
        (a, b) =>
          a.currentActionLoad - b.currentActionLoad ||
          a.currentActiveLeads - b.currentActiveLeads ||
          a.employeeName.localeCompare(b.employeeName),
      )[0]
    : null;

  const primaryAction =
    overdue > 0
      ? {
          label: "Clear overdue follow-ups",
          href: "/follow-ups",
          title: "Overdue follow-ups need attention",
          detail: `${overdue.toLocaleString()} assigned lead${overdue === 1 ? " is" : "s are"} currently overdue. Clear scheduled follow-up debt before adding avoidable workload.`,
        }
      : needsReply > 0
        ? {
            label: "Work reply queue",
            href: "/conversations",
            title: "Reply coverage needs attention",
            detail: `${needsReply.toLocaleString()} assigned lead${needsReply === 1 ? " currently needs" : "s currently need"} a reply in the CRM evidence.`,
          }
        : unassigned > 0
          ? {
              label: "Review assignment",
              href: "/performance",
              title: "Unassigned demand is waiting",
              detail: `${unassigned.toLocaleString()} open lead${unassigned === 1 ? " is" : "s are"} currently unassigned. Use workload evidence before assigning the next lead.`,
            }
          : {
              label: "Review response evidence",
              href: "/performance?view=response",
              title: "Current operating queues are clear",
              detail: "No overdue, reply-needed or unassigned backlog is visible in the current operational snapshot. Review response evidence for remaining coverage gaps.",
            };

  const hasPartialData = snapshotResult.status === "rejected" || assignmentResult.status === "rejected";

  return (
    <section className="space-y-3" aria-label="Performance operating brief">
      <div className="rounded-2xl border border-line bg-surface px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-700">
              Performance operating brief
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-copy-strong">
              {primaryAction.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-copy-muted">{primaryAction.detail}</p>
            <p className="mt-2 text-xs leading-5 text-copy-subtle">
              Current workload is operational capacity evidence, not an employee performance rating. Outcomes and activity remain separate signals.
            </p>
          </div>

          <Link
            href={primaryAction.href}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800"
          >
            {primaryAction.label}
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {hasPartialData ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          Part of the operating brief could not be loaded. Visible signals use only the current data that resolved successfully.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DecisionMetricCard
          icon={<MessageSquareText size={16} />}
          label="Needs reply"
          value={needsReply.toLocaleString()}
          detail="Assigned leads currently needing a reply"
          href="/conversations"
          tone={needsReply > 0 ? "warning" : "positive"}
          statusLabel={needsReply > 0 ? "Attention" : "Clear"}
          evidenceState="derived"
          evidenceLabel="Current conversation state"
          definition="Current assigned leads whose available CRM conversation state indicates a reply is needed. This is an operational queue, not a staff score."
        />

        <DecisionMetricCard
          icon={<AlertTriangle size={16} />}
          label="Overdue follow-ups"
          value={overdue.toLocaleString()}
          detail="Assigned leads with overdue scheduled follow-up"
          href="/follow-ups"
          tone={overdue > 0 ? "warning" : "positive"}
          statusLabel={overdue > 0 ? "Attention" : "Clear"}
          evidenceState="derived"
          evidenceLabel="Scheduled task state"
          definition="Current assigned leads whose recorded next follow-up is overdue. It reflects task state, not customer intent."
        />

        <DecisionMetricCard
          icon={<Inbox size={16} />}
          label="Unassigned open"
          value={unassigned.toLocaleString()}
          detail="Open leads without a current owner"
          href="/performance"
          tone={unassigned > 0 ? "warning" : "positive"}
          statusLabel={unassigned > 0 ? "Assign" : "Clear"}
          evidenceState="observed"
          evidenceLabel="Current ownership state"
          definition="Open CRM leads with no current owner. Assignment should use current workload evidence rather than historical conversion alone."
        />

        <DecisionMetricCard
          icon={<Scale size={16} />}
          label="Available owner"
          value={available?.employeeName ?? "—"}
          detail={
            available
              ? `${available.currentActiveLeads.toLocaleString()} active · ${available.currentActionLoad.toLocaleString()} action load`
              : "No active Admissions employee"
          }
          evidenceState="derived"
          evidenceLabel="Current workload comparison"
          definition="Admissions employee with the lowest current action load, with active leads used as a tie-breaker. This is a capacity suggestion, not a performance ranking."
        />
      </div>

      {heaviest ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-muted text-copy-muted">
              <UserRound size={16} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-copy-subtle">Who needs workload review</div>
              <div className="mt-0.5 text-sm font-semibold text-copy-strong">{heaviest.employeeName}</div>
              <div className="mt-1 text-xs leading-5 text-copy-muted">
                {heaviest.currentActionLoad.toLocaleString()} current action load · {heaviest.needsReplyNow.toLocaleString()} need reply · {heaviest.overdueLeadsNow.toLocaleString()} overdue. Review redistribution only if the operating context supports it.
              </div>
            </div>
          </div>
          <Link
            href="/performance"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
          >
            Review team
            <ArrowRight size={13} />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
