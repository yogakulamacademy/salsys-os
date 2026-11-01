import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleDollarSign,
  DatabaseZap,
  GraduationCap,
  ShieldCheck,
  Users,
} from "lucide-react";

import { DecisionMetricCard } from "@/components/intelligence/decision-metric-card";
import { OperationsJourneyBar } from "@/components/operations/operations-journey-bar";
import { PageHeader } from "@/components/ui";
import { getCommerceReadinessForCurrentWorkspace } from "@/lib/commerce-readiness-data";
import {
  getCourseManagementWorkspace,
  type CourseManagementBatchRow,
} from "@/lib/course-management-data";

export default async function OperationsOverviewPage() {
  const [workspace, commerce] = await Promise.all([
    getCourseManagementWorkspace({
      query: "",
      location: "all",
      state: "all",
    }),
    getCommerceReadinessForCurrentWorkspace(),
  ]);

  const { courses, batches, summary } = workspace;
  const activePrograms = courses.filter((course) => course.active).length;
  const today = new Date().toISOString().slice(0, 10);
  const futureBatches = batches.filter(
    (batch) =>
      batch.effective_active === true &&
      Boolean(batch.start_date && batch.start_date >= today),
  );
  const capacityConfigured = Math.max(
    summary.upcomingBatches - summary.needsCapacity,
    0,
  );
  const hasKnownCapacity = capacityConfigured > 0;
  const capacityEvidenceComplete =
    summary.upcomingBatches > 0 && summary.needsCapacity === 0;
  const pressureBatches = futureBatches
    .filter((batch) => {
      const status = String(batch.capacity_status ?? "").toLowerCase();
      return ["overbooked", "full", "near_full", "payment_pressure", "demand_exceeds_open_seats"].includes(status);
    })
    .slice(0, 6);

  const commerceNeedsAttention =
    commerce?.healthStatus === "configuration_blocked" ||
    commerce?.healthStatus === "warning" ||
    commerce?.healthStatus === "critical";

  return (
    <div className="space-y-4">
      <OperationsJourneyBar />

      <PageHeader
        eyebrow="Operations · Capacity & delivery"
        title="Operations Overview"
        description="Monitor programs, future batches, confirmed enrollments, known capacity and operational pressure from one workspace."
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

      {summary.needsCapacity > 0 ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <DatabaseZap size={17} />
            </span>
            <div>
              <div className="text-sm font-semibold">Future capacity setup incomplete</div>
              <p className="mt-1 max-w-4xl text-xs leading-5 text-amber-800 dark:text-amber-200">
                {summary.needsCapacity.toLocaleString("en-IN")} of {summary.upcomingBatches.toLocaleString("en-IN")} future active batch{summary.upcomingBatches === 1 ? "" : "es"} {summary.needsCapacity === 1 ? "does" : "do"} not have positive capacity configured. Unknown capacity is not treated as zero seats, and open-seat evidence is shown only for capacity-set future batches.
              </p>
            </div>
          </div>
          <Link href="/course-management" className="btn-secondary shrink-0">
            Configure capacity <ArrowRight size={13} />
          </Link>
        </section>
      ) : null}

      {commerceNeedsAttention && commerce ? (
        <CommercePipelineNotice commerce={commerce} />
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6" aria-label="Operations pulse">
        <DecisionMetricCard
          icon={<BookOpen size={17} />}
          label="Active programs"
          value={activePrograms.toLocaleString("en-IN")}
          detail={`${courses.length.toLocaleString("en-IN")} total programs`}
          href="/course-management"
          evidenceLabel="Catalog state"
          definition="Programs currently marked active in the course catalog."
        />
        <DecisionMetricCard
          icon={<CalendarDays size={17} />}
          label="Upcoming batches"
          value={summary.upcomingBatches.toLocaleString("en-IN")}
          detail="Active batches with start date today or later"
          href="/course-management"
          evidenceLabel="Future batch schedule"
          evidenceState="observed"
          definition="Active scheduled batches whose recorded start date is today or later. Already-started batches do not enter future-capacity totals."
        />
        <DecisionMetricCard
          icon={<GraduationCap size={17} />}
          label="Confirmed enrolled"
          value={summary.totalEnrolled.toLocaleString("en-IN")}
          detail="Confirmed outcomes in future batches"
          href="/enrollments"
          tone={summary.totalEnrolled > 0 ? "positive" : "neutral"}
          evidenceLabel="Enrollment truth"
          definition="Confirmed or completed enrollment records, with the documented legacy enrolled-stage fallback where required."
        />
        <DecisionMetricCard
          icon={<ShieldCheck size={17} />}
          label="Calculated open"
          value={hasKnownCapacity ? summary.totalOpenSeats.toLocaleString("en-IN") : "—"}
          detail={
            !hasKnownCapacity
              ? "Unknown until future batch capacity is configured"
              : capacityEvidenceComplete
                ? "Known future capacity minus confirmed enrollment"
                : `${capacityConfigured.toLocaleString("en-IN")} capacity-set future batches · ${summary.needsCapacity.toLocaleString("en-IN")} unknown`
          }
          href="/availability"
          evidenceLabel="Future capacity calculation"
          evidenceState={!hasKnownCapacity ? "unknown" : capacityEvidenceComplete ? "derived" : "partial"}
          definition="Calculated remaining seats only where positive future batch capacity is recorded. Missing capacity remains unknown and is never interpreted as zero seats."
        />
        <DecisionMetricCard
          icon={<AlertTriangle size={17} />}
          label="Enrollment closed"
          value={summary.closedEnrollment.toLocaleString("en-IN")}
          detail="Future batches closed to enrollment"
          href="/course-management"
          tone={summary.closedEnrollment > 0 ? "warning" : "positive"}
          statusLabel={summary.closedEnrollment > 0 ? "Review" : "Clear"}
          evidenceLabel="Batch state"
          definition="Future active batches whose enrollment state is currently closed."
        />
        <DecisionMetricCard
          icon={<Users size={17} />}
          label="Demand pressure"
          value={summary.demandPressure.toLocaleString("en-IN")}
          detail={`${summary.needsCapacity.toLocaleString("en-IN")} future batches missing capacity`}
          href="/availability"
          tone={summary.demandPressure + summary.needsCapacity > 0 ? "warning" : "positive"}
          statusLabel={summary.demandPressure + summary.needsCapacity > 0 ? "Attention" : "Healthy"}
          evidenceLabel="Demand vs known capacity"
          evidenceState={summary.needsCapacity > 0 ? "partial" : "derived"}
          definition="Operational warning when active prospects or payment-pending demand approaches or exceeds known future open capacity. Missing capacity remains a separate setup gap."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card-pad min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="eyebrow">Future batch availability</div>
              <div className="section-title mt-1">Operational pressure</div>
              <p className="mt-1 text-xs text-copy-muted">Future batches where confirmed seats or active demand deserve a capacity decision now.</p>
            </div>
            <Link href="/course-management" className="btn-secondary">Open batch management</Link>
          </div>

          <div className="mt-4 space-y-3">
            {pressureBatches.length ? pressureBatches.map((batch) => (
              <PressureBatchCard key={batch.batch_id} batch={batch} />
            )) : (
              <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-copy-subtle">
                No known future capacity or demand-pressure alerts are active right now. Batches without capacity remain a separate setup gap above.
              </div>
            )}
          </div>
        </div>

        <aside className="card-pad">
          <div className="eyebrow">Operating truth</div>
          <div className="section-title mt-1">What these numbers mean</div>
          <div className="mt-4 space-y-3 text-xs leading-5 text-copy-muted">
            <Info title="Future cohort" text="Capacity planning uses active batches whose recorded start date is today or later. Already-started batches remain manageable, but do not enter future availability totals." />
            <Info title="Confirmed enrolled" text="Enrollment records in confirmed/completed state, plus legacy enrolled-stage fallback where needed." />
            <Info title="Calculated open" text="Known positive batch capacity minus confirmed enrollments. Missing future capacity is unknown, not zero, and remains separate from manually published seats." />
            <Info title="Demand pressure" text="Operational warning when active prospects or payment-pending demand approaches or exceeds known future availability. No pressure conclusion is inferred where capacity is missing." />
          </div>
        </aside>
      </section>
    </div>
  );
}

function PressureBatchCard({ batch }: { batch: CourseManagementBatchRow }) {
  const status = String(batch.capacity_status ?? "review").toLowerCase();
  const enrolled = safeNumber(batch.enrolled_count);
  const active = safeNumber(batch.active_prospects);
  const hot = safeNumber(batch.hot_prospects);
  const payment = safeNumber(batch.payment_pending);
  const critical = safeNumber(batch.critical_prospects);
  const open = batch.calculated_seats_remaining == null
    ? null
    : safeNumber(batch.calculated_seats_remaining);
  const reason = capacityPressureReason({ status, active, payment, open });
  const nextCheck = capacityNextCheck(status);
  const href = `/course-management?course=${encodeURIComponent(batch.course_id)}&batch=${encodeURIComponent(batch.batch_id)}`;
  const tone = status === "overbooked" || status === "full"
    ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300"
    : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300";

  return (
    <article className="rounded-xl border border-line bg-surface p-4 transition hover:border-line-strong hover:shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-sm text-copy-strong">{batch.course_name || batch.course_code || "Program"}</strong>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${tone}`}>
              {pretty(status)}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-copy-muted">
            {batch.batch_code || "Batch"} · {batch.location || "Location not set"}
          </div>
        </div>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300">
          Review batch <ArrowRight size={12} />
        </Link>
      </div>

      <div className="mt-3 rounded-lg bg-surface-muted/70 px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-copy-subtle">Why now</div>
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">Derived capacity state</span>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-copy-muted">{reason}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <PressureMetric label="Enrolled" value={enrolled} />
        <PressureMetric label="Open seats" value={open == null ? "—" : open} />
        <PressureMetric label="Active demand" value={active} />
        <PressureMetric label="Hot / critical" value={`${hot} / ${critical}`} />
        <PressureMetric label="Payment" value={payment} />
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[11px] leading-5 text-copy-muted">
          <span className="font-semibold text-copy-strong">Next check:</span> {nextCheck}
        </div>
        <Link href="/availability" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300">
          Compare availability <ArrowRight size={12} />
        </Link>
      </div>
    </article>
  );
}

function PressureMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-copy-subtle">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-copy-strong">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</div>
    </div>
  );
}

function capacityPressureReason({
  status,
  active,
  payment,
  open,
}: {
  status: string;
  active: number;
  payment: number;
  open: number | null;
}) {
  if (status === "overbooked") {
    return "This batch is classified as overbooked in the current capacity evidence and needs reconciliation before further availability is promised.";
  }
  if (status === "full") {
    return "This batch is classified as full in the current capacity evidence; new demand should be checked against confirmed enrollment before a place is promised.";
  }
  if (status === "demand_exceeds_open_seats" && open != null) {
    return `${active.toLocaleString("en-IN")} active prospects are visible against ${open.toLocaleString("en-IN")} calculated open seats.`;
  }
  if (status === "payment_pressure") {
    return open == null
      ? `${payment.toLocaleString("en-IN")} payment-pending prospects are visible while calculated open capacity is unavailable.`
      : `${payment.toLocaleString("en-IN")} payment-pending prospects are visible against ${open.toLocaleString("en-IN")} calculated open seats.`;
  }
  if (status === "near_full") {
    return open == null
      ? "This batch is classified as near full, but calculated open seats are not available in the current evidence."
      : `Only ${open.toLocaleString("en-IN")} calculated open seats remain with ${active.toLocaleString("en-IN")} active prospects visible.`;
  }
  return "Current demand and capacity evidence has placed this batch in an operational review state.";
}

function capacityNextCheck(status: string) {
  if (status === "overbooked" || status === "full") {
    return "Reconcile recorded capacity and confirmed enrollment before accepting additional commitments.";
  }
  if (status === "payment_pressure") {
    return "Reconcile payment-pending demand with open seats before treating those places as available to new prospects.";
  }
  if (status === "demand_exceeds_open_seats" || status === "near_full") {
    return "Compare active and high-intent demand with calculated open seats before confirming availability.";
  }
  return "Review capacity, confirmed enrollment and active demand before changing availability.";
}

function CommercePipelineNotice({
  commerce,
}: {
  commerce: NonNullable<Awaited<ReturnType<typeof getCommerceReadinessForCurrentWorkspace>>>;
}) {
  const details = commerce.details;
  const bookings = safeNumber(details.booking_completed_30d);
  const paymentStarts = safeNumber(details.payment_started_30d);
  const verifiedPayments = safeNumber(details.payment_completed_30d);
  const enrollments = safeNumber(details.enrollment_completed_30d);
  const blocker =
    typeof details.blocker_message === "string"
      ? details.blocker_message
      : "The authoritative commerce event chain needs review.";

  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50/70 px-4 py-4 text-orange-950">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700">
            <CircleDollarSign size={17} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Commerce event pipeline needs attention</div>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-orange-800">{blocker}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
              <span className="rounded-full bg-white/80 px-2.5 py-1">{bookings} bookings</span>
              <span className="rounded-full bg-white/80 px-2.5 py-1">{paymentStarts} payment starts</span>
              <span className="rounded-full bg-white/80 px-2.5 py-1">{verifiedPayments} verified payments</span>
              <span className="rounded-full bg-white/80 px-2.5 py-1">{enrollments} enrollments</span>
            </div>
          </div>
        </div>

        {commerce.canViewSystemHealth ? (
          <Link href="/system-health" className="btn-secondary shrink-0 border-orange-200 bg-white/80 text-orange-800 hover:bg-white">
            Review System Health <ArrowRight size={13} />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function Info({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-line bg-surface-muted/60 px-3.5 py-3"><strong className="block text-copy-strong">{title}</strong><span className="mt-1 block">{text}</span></div>;
}

function safeNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function pretty(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
