import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  GraduationCap,
  ShieldCheck,
  Users,
} from "lucide-react";

import { OperationsJourneyBar } from "@/components/operations/operations-journey-bar";
import { PageHeader } from "@/components/ui";
import { getCourseManagementWorkspace } from "@/lib/course-management-data";

export default async function OperationsOverviewPage() {
  const workspace = await getCourseManagementWorkspace({
    query: "",
    location: "all",
    state: "all",
  });

  const { courses, batches, summary } = workspace;
  const activePrograms = courses.filter((course) => course.active).length;
  const activeBatches = batches.filter((batch) => batch.effective_active === true).length;
  const pressureBatches = batches
    .filter((batch) => {
      const status = String(batch.capacity_status ?? "").toLowerCase();
      return ["overbooked", "full", "near_full", "payment_pressure", "demand_exceeds_open_seats"].includes(status);
    })
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <OperationsJourneyBar />

      <PageHeader
        eyebrow="Operations · Capacity & delivery"
        title="Operations Overview"
        description="Monitor programs, upcoming batches, confirmed enrollments, open capacity and operational pressure from one workspace."
        actions={
          <Link href="/course-management" className="btn-primary">
            Manage programs & batches <ArrowRight size={14} />
          </Link>
        }
      />

      {workspace.degraded ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          Operations is using a fallback evidence path. {workspace.degradedReason ?? "Some auxiliary intelligence may be reduced."}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric icon={<BookOpen size={17} />} label="Active programs" value={activePrograms} note={`${courses.length} total programs`} />
        <Metric icon={<CalendarDays size={17} />} label="Upcoming batches" value={summary.upcomingBatches} note={`${activeBatches} active batches`} />
        <Metric icon={<GraduationCap size={17} />} label="Confirmed enrolled" value={summary.totalEnrolled} note="Upcoming batches" />
        <Metric icon={<ShieldCheck size={17} />} label="Calculated open" value={summary.totalOpenSeats} note="Capacity minus confirmed" />
        <Metric icon={<AlertTriangle size={17} />} label="Enrollment closed" value={summary.closedEnrollment} note="Upcoming batches" alert={summary.closedEnrollment > 0} />
        <Metric icon={<Users size={17} />} label="Demand pressure" value={summary.demandPressure} note={`${summary.needsCapacity} missing capacity`} alert={summary.demandPressure + summary.needsCapacity > 0} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card-pad min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="eyebrow">Batch availability</div>
              <div className="section-title mt-1">Operational pressure</div>
              <p className="mt-1 text-xs text-copy-muted">Batches where confirmed seats, active demand or missing capacity deserve review.</p>
            </div>
            <Link href="/course-management" className="btn-secondary">Open batch management</Link>
          </div>

          <div className="mt-4 space-y-2">
            {pressureBatches.length ? pressureBatches.map((batch) => (
              <Link
                key={batch.batch_id}
                href={`/course-management?course=${encodeURIComponent(batch.course_id)}&batch=${encodeURIComponent(batch.batch_id)}`}
                className="flex flex-col gap-2 rounded-xl border border-line bg-surface-muted/60 px-4 py-3 transition hover:border-brand-200 hover:bg-brand-50/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">
                  <strong className="block truncate text-sm text-copy-strong">{batch.course_name || batch.course_code || "Program"}</strong>
                  <span className="mt-1 block text-[11px] text-copy-muted">{batch.batch_code || "Batch"} · {batch.location || "Location not set"}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-copy-muted">
                  <span>{Number(batch.enrolled_count ?? 0)} enrolled</span>
                  <span>{batch.calculated_seats_remaining == null ? "Open seats unknown" : `${Number(batch.calculated_seats_remaining)} open`}</span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">{pretty(batch.capacity_status || "review")}</span>
                </span>
              </Link>
            )) : (
              <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-copy-subtle">
                No capacity or demand-pressure alerts are active right now.
              </div>
            )}
          </div>
        </div>

        <aside className="card-pad">
          <div className="eyebrow">Operating truth</div>
          <div className="section-title mt-1">What these numbers mean</div>
          <div className="mt-4 space-y-3 text-xs leading-5 text-copy-muted">
            <Info title="Confirmed enrolled" text="Enrollment records in confirmed/completed state, plus legacy enrolled-stage fallback where needed." />
            <Info title="Calculated open" text="Batch capacity minus confirmed enrollments. This remains separate from manually published seats." />
            <Info title="Demand pressure" text="Operational warning when active prospects or payment-pending demand approaches or exceeds available capacity." />
          </div>
        </aside>
      </section>
    </div>
  );
}

function Metric({ icon, label, value, note, alert = false }: { icon: React.ReactNode; label: string; value: number; note: string; alert?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-surface p-4 shadow-sm ${alert ? "border-amber-200" : "border-line"}`}>
      <div className={`grid h-8 w-8 place-items-center rounded-lg ${alert ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700"}`}>{icon}</div>
      <div className="mt-3 text-2xl font-semibold tracking-[-.03em] text-copy-strong">{value.toLocaleString("en-IN")}</div>
      <div className="mt-1 text-[11px] font-semibold text-copy-strong">{label}</div>
      <div className="mt-0.5 text-[10px] text-copy-subtle">{note}</div>
    </div>
  );
}

function Info({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-line bg-surface-muted/60 px-3.5 py-3"><strong className="block text-copy-strong">{title}</strong><span className="mt-1 block">{text}</span></div>;
}

function pretty(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
