import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  LockKeyhole,
  UsersRound,
} from "lucide-react";

import { OperationsJourneyBar } from "@/components/operations/operations-journey-bar";
import { PageHeader } from "@/components/ui";
import { getCourseManagementWorkspace, type CourseManagementBatchRow } from "@/lib/course-management-data";

export default async function AvailabilityPage() {
  const workspace = await getCourseManagementWorkspace({ query: "", location: "all", state: "all" });
  const today = new Date().toISOString().slice(0, 10);
  const batches = workspace.batches
    .filter(
      (row) =>
        row.effective_active === true &&
        Boolean(row.start_date && row.start_date >= today),
    )
    .sort((a, b) => severity(b) - severity(a) || String(a.start_date ?? "9999").localeCompare(String(b.start_date ?? "9999")));

  const open = batches.filter((row) => availabilityState(row) === "open").length;
  const filling = batches.filter((row) => availabilityState(row) === "filling").length;
  const full = batches.filter((row) => availabilityState(row) === "full").length;
  const setup = batches.filter((row) => availabilityState(row) === "setup").length;
  const paymentPressure = batches.reduce((sum, row) => sum + n(row.payment_pending), 0);
  const replyPressure = batches.reduce((sum, row) => sum + n(row.needs_reply), 0);

  return (
    <div className="space-y-4">
      <OperationsJourneyBar />

      <PageHeader
        eyebrow="Operations · Availability"
        title="Availability & Capacity"
        description="See which future batches can still accept students, which are filling, and where demand or setup issues need intervention."
        actions={<Link href="/course-management" className="btn-primary">Manage batches <ArrowRight size={14} /></Link>}
      />

      {workspace.degraded ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Availability is using fallback evidence. {workspace.degradedReason ?? "Some auxiliary demand signals may be reduced."}
        </div>
      ) : null}

      {setup > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900">
          <strong>Future capacity setup is incomplete.</strong>{" "}
          {setup.toLocaleString("en-IN")} future active batch{setup === 1 ? "" : "es"} {setup === 1 ? "does" : "do"} not have positive capacity configured. Open-seat totals remain unknown for those batches until capacity is recorded.
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric icon={<CheckCircle2 size={17} />} label="Open" value={open} note="Future batches accepting enrollment" />
        <Metric icon={<UsersRound size={17} />} label="Filling" value={filling} note="Near capacity / demand pressure" alert={filling > 0} />
        <Metric icon={<LockKeyhole size={17} />} label="Full / closed" value={full} note="No operational availability" alert={full > 0} />
        <Metric icon={<AlertTriangle size={17} />} label="Needs setup" value={setup} note="Future capacity unavailable" alert={setup > 0} />
        <Metric icon={<CircleDollarSign size={17} />} label="Payment pending" value={paymentPressure} note="Across future batches" alert={paymentPressure > 0} />
        <Metric icon={<CalendarDays size={17} />} label="Needs reply" value={replyPressure} note="Future-batch prospects awaiting response" alert={replyPressure > 0} />
      </section>

      <section className="card-pad min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Decision queue</div>
            <div className="section-title mt-1">Future batch availability</div>
            <p className="mt-1 text-xs text-copy-muted">Operational availability is based on future batch start date, effective batch state, enrollment-open state, confirmed seats and active demand.</p>
          </div>
          <div className="text-[11px] font-semibold text-copy-subtle">{batches.length} future active</div>
        </div>

        <div className="mt-4 grid gap-3">
          {batches.length ? batches.map((row) => <BatchRow key={row.batch_id} row={row} />) : (
            <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-copy-subtle">No future active batches are available in this workspace.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function BatchRow({ row }: { row: CourseManagementBatchRow }) {
  const state = availabilityState(row);
  const openSeats = row.calculated_seats_remaining == null ? null : n(row.calculated_seats_remaining);
  const capacity = row.capacity == null ? null : n(row.capacity);
  const enrolled = n(row.enrolled_count);
  const prospects = n(row.active_prospects);
  const hot = n(row.hot_prospects);
  const payment = n(row.payment_pending);
  const needsReply = n(row.needs_reply);

  return (
    <Link
      href={`/course-management?course=${encodeURIComponent(row.course_id)}&batch=${encodeURIComponent(row.batch_id)}`}
      className="grid gap-3 rounded-2xl border border-line bg-surface px-4 py-4 transition hover:border-brand-200 hover:bg-brand-50/30 lg:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(86px,.6fr))_auto] lg:items-center"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="truncate text-sm text-copy-strong">{row.course_name || row.course_code || "Program"}</strong>
          <StateBadge state={state} />
        </div>
        <div className="mt-1 text-[11px] text-copy-muted">{row.batch_code || "Batch"} · {row.location || "Location not set"} · {dateRange(row.start_date, row.end_date)}</div>
      </div>
      <Cell label="Enrolled" value={String(enrolled)} />
      <Cell label="Capacity" value={capacity == null || capacity <= 0 ? "Unknown" : String(capacity)} />
      <Cell label="Open seats" value={openSeats == null ? "Unknown" : String(openSeats)} />
      <Cell label="Active demand" value={String(prospects)} />
      <Cell label="Hot / pending" value={`${hot} / ${payment}`} />
      <div className="flex items-center justify-between gap-3 lg:justify-end">
        {needsReply > 0 ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">{needsReply} need reply</span> : null}
        <ArrowRight size={14} className="text-copy-subtle" />
      </div>
    </Link>
  );
}

function availabilityState(row: CourseManagementBatchRow): "open" | "filling" | "full" | "setup" {
  if (row.enrollment_open === false) return "full";
  const status = String(row.capacity_status ?? "").toLowerCase();
  if (row.capacity == null || n(row.capacity) <= 0 || status === "capacity_not_set" || status === "missing_capacity") return "setup";
  if (["overbooked", "full"].includes(status) || n(row.calculated_seats_remaining) <= 0) return "full";
  if (["near_full", "payment_pressure", "demand_exceeds_open_seats"].includes(status)) return "filling";
  return "open";
}

function severity(row: CourseManagementBatchRow) {
  const state = availabilityState(row);
  return state === "full" ? 4 : state === "setup" ? 3 : state === "filling" ? 2 : 1;
}

function StateBadge({ state }: { state: ReturnType<typeof availabilityState> }) {
  const styles = state === "open"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : state === "filling"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : state === "full"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
  const label = state === "open" ? "Open" : state === "filling" ? "Filling" : state === "full" ? "Full / closed" : "Needs setup";
  return <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${styles}`}>{label}</span>;
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[9px] font-black uppercase tracking-wide text-copy-subtle">{label}</div><div className="mt-1 text-sm font-semibold text-copy-strong">{value}</div></div>;
}

function Metric({ icon, label, value, note, alert = false }: { icon: React.ReactNode; label: string; value: number; note: string; alert?: boolean }) {
  return <div className={`rounded-2xl border bg-surface p-4 shadow-sm ${alert ? "border-amber-200" : "border-line"}`}><div className={`grid h-8 w-8 place-items-center rounded-lg ${alert ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700"}`}>{icon}</div><div className="mt-3 text-2xl font-semibold tracking-[-.03em] text-copy-strong">{value.toLocaleString("en-IN")}</div><div className="mt-1 text-[11px] font-semibold text-copy-strong">{label}</div><div className="mt-0.5 text-[10px] text-copy-subtle">{note}</div></div>;
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateRange(start: string | null, end: string | null) {
  if (!start && !end) return "Dates not set";
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  return fmt(start || end || "");
}

function fmt(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
