import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, CircleDollarSign, GraduationCap, LockKeyhole, MapPin, PauseCircle, PlayCircle, Save, ShieldCheck, UnlockKeyhole, Users, } from "lucide-react";
import { setCourseBatchActiveStateAction, setCourseBatchEnrollmentStateAction, updateCourseBatchAdminAction, } from "@/app/course-management/actions";
import { CourseManagementSelector } from "@/components/course-management-selector";
import { PageHeader } from "@/components/ui";
import { getCourseManagementWorkspace, type CourseManagementAuditRow, type CourseManagementBatchRow, type CourseManagementCourseRow, } from "@/lib/course-management-data";
type CourseRow = CourseManagementCourseRow;
type BatchRow = CourseManagementBatchRow;
type AuditRow = CourseManagementAuditRow;
type SearchParams = {
    course?: string | string[];
    batch?: string | string[];
    notice?: string | string[];
    error?: string | string[];
};
export default async function CourseManagementPage({ searchParams, }: {
    searchParams?: Promise<SearchParams>;
}) {
    const resolved = (await searchParams) ?? {};
    const notice = one(resolved.notice);
    const error = one(resolved.error);
    const requestedCourseId = one(resolved.course);
    const requestedBatchId = one(resolved.batch);
    const workspace = await getCourseManagementWorkspace({
        query: "",
        location: "all",
        state: "all",
    });
    const courses: CourseRow[] = workspace.courses;
    const batches: BatchRow[] = workspace.batches;
    const audits: AuditRow[] = workspace.audits;
    const { upcomingBatches, totalCapacity, totalEnrolled, totalOpenSeats, closedEnrollment, needsCapacity, demandPressure, } = workspace.summary;
    const requestedBatch = batches.find((row) => row.batch_id === requestedBatchId) ?? null;
    const requestedCourseExists = courses.some((course) => course.course_id === requestedCourseId);
    const firstCourseWithBatch = batches[0]?.course_id ?? "";
    const selectedCourseId = requestedCourseExists
        ? requestedCourseId
        : requestedBatch?.course_id ||
            firstCourseWithBatch ||
            courses[0]?.course_id ||
            "";
    const selectedCourse = courses.find((course) => course.course_id === selectedCourseId) ?? null;
    const batchesForSelectedCourse = batches.filter((row) => row.course_id === selectedCourseId);
    const activeBatchesForSelectedCourse = batchesForSelectedCourse.filter((row) => row.effective_active === true).length;
    const selectedBatch = batchesForSelectedCourse.find((row) => row.batch_id === requestedBatchId) ??
        batchesForSelectedCourse[0] ??
        null;
    const selectedBatchId = selectedBatch?.batch_id ?? "";
    const returnTo = selectedCourseId && selectedBatchId
        ? `/course-management?course=${encodeURIComponent(selectedCourseId)}&batch=${encodeURIComponent(selectedBatchId)}`
        : selectedCourseId
            ? `/course-management?course=${encodeURIComponent(selectedCourseId)}`
            : "/course-management";
    const batchNameById = new Map<string, string>(Object.entries(workspace.batchNames));
    return (<>

      <PageHeader eyebrow="Courses & batches" title="Course Management" description="Manage batch capacity, enrollment availability and default commercial values without leaving the CRM." actions={<div className="flex flex-wrap gap-2">

            <Link href="/admissions" className="btn-secondary">

              Admissions Desk

            </Link>



            <Link href="/dashboard" className="btn-secondary">

              Dashboard

            </Link>

          </div>}/>



      {error && (<div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">

          {error}

        </div>)}



      {notice && (<div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">

          {noticeText(notice)}

        </div>)}



      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">

        <SummaryCard icon={<CalendarDays size={17}/>} label="Upcoming batches" value={upcomingBatches} sub="Active or ongoing"/>



        <SummaryCard icon={<Users size={17}/>} label="Confirmed enrolled" value={totalEnrolled} sub="Upcoming batches"/>



        <SummaryCard icon={<GraduationCap size={17}/>} label="Total capacity" value={totalCapacity} sub="Capacity-set batches"/>



        <SummaryCard icon={<ShieldCheck size={17}/>} label="Calculated open" value={totalOpenSeats} sub="After confirmed seats"/>



        <SummaryCard icon={<LockKeyhole size={17}/>} label="Enrollment closed" value={closedEnrollment} sub="Upcoming batches" alert={closedEnrollment > 0}/>



        <SummaryCard icon={<AlertTriangle size={17}/>} label="Needs attention" value={needsCapacity + demandPressure} sub={`${needsCapacity} missing capacity · ${demandPressure} demand pressure`} alert={needsCapacity + demandPressure > 0}/>

      </section>



      <CourseManagementSelector courses={courses} batches={batches} selectedCourseId={selectedCourseId} selectedBatchId={selectedBatchId}/>



      {selectedCourse && (<CourseDetailsCard course={selectedCourse} totalBatches={batchesForSelectedCourse.length} activeBatches={activeBatchesForSelectedCourse}/>)}

      <section className="mt-4 grid gap-4 2xl:grid-cols-[1fr_320px]">

        <div className="space-y-4">

          {!selectedCourseId ? (<div className="card-pad py-14 text-center">

              <div className="text-sm font-bold text-slate-700">

                No courses have been created yet.

              </div>



              <div className="mt-1 text-xs text-slate-400">

                Create your first course to begin managing batches.

              </div>

            </div>) : !selectedBatch ? (<div className="card-pad py-14 text-center">

              <div className="text-sm font-bold text-slate-700">

                No batches have been created for this course yet.

              </div>



              <div className="mt-1 text-xs text-slate-400">

                This course is ready. Add its first batch to start admissions.

              </div>

            </div>) : (<BatchAdminCard key={selectedBatch.batch_id} row={selectedBatch} returnTo={returnTo}/>)}
        </div>



        <aside className="space-y-4">

          <section className="card-pad">

            <div className="eyebrow">Operating rules</div>



            <div className="section-title mt-1">Capacity truth</div>



            <div className="mt-4 space-y-3 text-xs leading-5 text-slate-500">

              <InfoBox title="Calculated seats" text="Capacity minus confirmed enrollments. Admissions uses this as the operational seat count."/>



              <InfoBox title="Published seats" text="Optional manual availability for staff or marketing. It never overwrites confirmed enrollment calculations."/>



              <InfoBox title="Close enrollment" text="Stops new admissions operationally without deleting the batch or historical lead links."/>



              <InfoBox title="Deactivate" text="Removes the batch from active CRM selectors while preserving historical references."/>

            </div>

          </section>



          <section className="card-pad">

            <div className="flex items-start justify-between gap-3">

              <div>

                <div className="eyebrow">Audit trail</div>



                <div className="section-title mt-1">Recent changes</div>

              </div>



              <ShieldCheck size={17} className="text-slate-300"/>

            </div>



            <div className="mt-4 space-y-2">

              {audits.length === 0 ? (<div className="rounded-xl bg-slate-50 px-3 py-6 text-center text-xs text-slate-400">

                  No batch admin changes logged yet.

                </div>) : (audits.map((event) => (<div key={event.id} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">

                    <div className="text-xs font-bold text-slate-700">

                      {pretty(event.action)}

                    </div>



                    <div className="mt-0.5 text-[10px] font-semibold text-slate-400">

                      {batchNameById.get(event.batch_id) || "Batch"}

                    </div>



                    <div className="mt-1 text-[10px] text-slate-400">

                      {formatDateTime(event.created_at)}

                    </div>

                  </div>)))}

            </div>

          </section>

        </aside>

      </section>

    </>);
}
function CourseDetailsCard({ course, totalBatches, activeBatches, }: {
    course: CourseRow;
    totalBatches: number;
    activeBatches: number;
}) {
    const sourceLabel = course.source_system
        ? pretty(course.source_system)
        : "Manual";
    return (<section className="card-pad mt-4">

      <div className="flex flex-wrap items-start justify-between gap-4">

        <div>

          <div className="eyebrow">Course details</div>



          <div className="mt-1 text-lg font-black text-slate-900">

            {course.name}

          </div>



          <div className="mt-1 text-xs font-semibold text-slate-400">

            Read-only course information

          </div>

        </div>



        <StatusBadge label={course.active ? "Active course" : "Inactive course"} tone={course.active ? "green" : "slate"}/>

      </div>



      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

        <CourseDetailItem label="Course code" value={course.code || "—"}/>



        <CourseDetailItem label="Category" value={course.category || "Not set"}/>



        <CourseDetailItem label="Training hours" value={course.hours == null || course.hours === ""
            ? "Not set"
            : `${course.hours} hours`}/>



        <CourseDetailItem label="Source" value={sourceLabel}/>



        <CourseDetailItem label="Total batches" value={formatNumber(totalBatches)}/>



        <CourseDetailItem label="Active batches" value={formatNumber(activeBatches)}/>



        <CourseDetailItem label="Status" value={course.active ? "Active" : "Inactive"}/>



        <CourseDetailItem label="External ID" value={course.external_course_id || "—"}/>

      </div>

    </section>);
}
function CourseDetailItem({ label, value, }: {
    label: string;
    value: string;
}) {
    return (<div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">

      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">

        {label}

      </div>



      <div className="mt-1 text-sm font-bold text-slate-800">

        {value}

      </div>

    </div>);
}
function BatchAdminCard({ row, returnTo, }: {
    row: BatchRow;
    returnTo: string;
}) {
    const capacity = nullableNumber(row.capacity);
    const enrolled = toNumber(row.enrolled_count);
    const calculatedOpen = nullableNumber(row.calculated_seats_remaining);
    const publishedOpen = nullableNumber(row.published_seats_remaining);
    const status = row.capacity_status || "healthy";
    const enrollmentOpen = row.enrollment_open !== false;
    const active = row.local_enabled !== false;
    const percent = capacity && capacity > 0
        ? Math.max(0, Math.min(100, (enrolled / capacity) * 100))
        : 0;
    return (<article className={`rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:shadow-md ${batchCardClass(row, status)}`}>

      <div className="flex flex-wrap items-start justify-between gap-4">

        <div className="min-w-0">

          <div className="flex flex-wrap items-center gap-2">

            <div className="text-base font-black text-slate-900">

              {row.course_name || row.course_code || "Course"}

            </div>



            <StatusBadge label={enrollmentOpen ? "Enrollment open" : "Enrollment closed"} tone={enrollmentOpen ? "green" : "red"}/>



            {!active && <StatusBadge label="Inactive" tone="slate"/>}



            <StatusBadge label={capacityStatusLabel(status)} tone={capacityTone(status)}/>

          </div>



          <div className="mt-1 text-[11px] font-semibold text-slate-400">

            {row.batch_code || "Batch code unavailable"}

          </div>



          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">

            <span className="inline-flex items-center gap-1.5">

              <CalendarDays size={13}/>



              {formatDateRange(row.start_date, row.end_date)}

            </span>



            {row.location && (<span className="inline-flex items-center gap-1.5">

                <MapPin size={13}/>



                {row.location}

              </span>)}



            {row.mode && <span>{pretty(row.mode)}</span>}

          </div>

        </div>



        <div className="flex flex-wrap gap-2">

          <form action={setCourseBatchEnrollmentStateAction}>

            <input type="hidden" name="batch_id" value={row.batch_id}/>



            <input type="hidden" name="return_to" value={returnTo}/>



            <input type="hidden" name="open" value={enrollmentOpen ? "false" : "true"}/>



            <input type="hidden" name="note" value={row.enrollment_note || ""}/>



            <button type="submit" className={enrollmentOpen
            ? "inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-[11px] font-bold text-red-600 transition-colors hover:bg-red-50"
            : "inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-50"}>

              {enrollmentOpen ? (<>

                  <LockKeyhole size={13}/>

                  Close enrollment

                </>) : (<>

                  <UnlockKeyhole size={13}/>

                  Reopen enrollment

                </>)}

            </button>

          </form>



          <form action={setCourseBatchActiveStateAction}>

            <input type="hidden" name="batch_id" value={row.batch_id}/>



            <input type="hidden" name="return_to" value={returnTo}/>



            <input type="hidden" name="active" value={active ? "false" : "true"}/>



            <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50">

              {active ? (<>

                  <PauseCircle size={13}/>

                  Deactivate

                </>) : (<>

                  <PlayCircle size={13}/>

                  Activate

                </>)}

            </button>

          </form>

        </div>

      </div>



      <div className="mt-5 grid gap-3 md:grid-cols-4">

        <MiniMetric label="Capacity" value={capacity == null ? "Not set" : formatNumber(capacity)}/>



        <MiniMetric label="Confirmed" value={formatNumber(enrolled)}/>



        <MiniMetric label="Calculated open" value={calculatedOpen == null ? "—" : formatNumber(calculatedOpen)} alert={calculatedOpen === 0}/>



        <MiniMetric label="Published open" value={publishedOpen == null ? "Not set" : formatNumber(publishedOpen)}/>

      </div>



      {capacity != null && capacity > 0 && (<div className="mt-3">

          <div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-black/5">

            <div className={`h-full rounded-full ${progressClass(status)}`} style={{
                width: `${percent}%`,
            }}/>

          </div>



          <div className="mt-1 flex items-center justify-between text-[10px] font-semibold text-slate-400">

            <span>{Math.round(percent)}% confirmed</span>



            <span>{formatNumber(row.active_prospects)} active prospects</span>

          </div>

        </div>)}



      <div className="mt-4 grid gap-2 sm:grid-cols-4">

        <PressureMetric label="Hot" value={row.hot_prospects}/>



        <PressureMetric label="Payment pending" value={row.payment_pending} alert={toNumber(row.payment_pending) > 0}/>



        <PressureMetric label="Needs reply" value={row.needs_reply} alert={toNumber(row.needs_reply) > 0}/>



        <PressureMetric label="Critical" value={row.critical_prospects} alert={toNumber(row.critical_prospects) > 0}/>

      </div>



      <form action={updateCourseBatchAdminAction} className="mt-5 border-t border-black/5 pt-5">

        <input type="hidden" name="batch_id" value={row.batch_id}/>



        <input type="hidden" name="return_to" value={returnTo}/>



        <div className="grid gap-5 xl:grid-cols-3">

          <fieldset>

            <legend className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">

              <Users size={14}/>

              Seats

            </legend>



            <div className="mt-3 grid grid-cols-2 gap-3">

              <Field label="Capacity" name="capacity" defaultValue={row.capacity} type="number"/>



              <Field label="Published open" name="published_seats_remaining" defaultValue={row.published_seats_remaining} type="number"/>

            </div>



            <div className="mt-2 text-[10px] leading-4 text-slate-400">

              Confirmed enrollments:{" "}

              <strong className="text-slate-600">

                {formatNumber(enrolled)}

              </strong>

              . Capacity cannot be saved below this number.

            </div>

          </fieldset>



          <fieldset>

            <legend className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">

              <CircleDollarSign size={14}/>

              Commercial default

            </legend>



            <div className="mt-3 grid grid-cols-[1fr_100px] gap-3">

              <Field label="Expected value" name="expected_value" defaultValue={row.expected_value} type="number" step="0.01"/>



              <label>

                <span className="field-label text-xs">Currency</span>



                <select name="currency" defaultValue={row.currency || ""} className="input">

                  <option value="">—</option>



                  <option value="INR">INR</option>



                  <option value="USD">USD</option>



                  <option value="EUR">EUR</option>



                  <option value="GBP">GBP</option>

                </select>

              </label>

            </div>



            <label className="mt-3 block">

              <span className="field-label text-xs">Enrollment note</span>



              <input type="text" name="enrollment_note" defaultValue={row.enrollment_note || ""} placeholder="e.g. Only 2 twin rooms left" className="input"/>

            </label>

          </fieldset>

        </div>



        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">

          <div className="text-[10px] text-slate-400">

            Last updated {formatDateTime(row.updated_at)}

          </div>



          <button type="submit" className="btn-primary">

            <Save size={15}/>

            Save batch

          </button>

        </div>

      </form>



      {row.enrollment_note && (<div className="mt-4">

          <NoteBox label="Enrollment note" text={row.enrollment_note}/>

        </div>)}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-4 text-[10px] font-semibold text-slate-400">

        <span>

          Price references: Private{" "}

          {formatMoneyMaybe(row.price_private, row.currency)}

          {" · "}

          Shared{" "}

          {formatMoneyMaybe(row.price_shared, row.currency)}

          {" · "}

          Course only{" "}

          {formatMoneyMaybe(row.price_course_only, row.currency)}

        </span>



        <Link href="/admissions" className="inline-flex items-center gap-1 text-brand">

          View demand

          <ArrowRight size={12}/>

        </Link>

      </div>

    </article>);
}
function SummaryCard({ icon, label, value, sub, alert = false, }: {
    icon: ReactNode;
    label: string;
    value: number;
    sub: string;
    alert?: boolean;
}) {
    return (<div className={`rounded-xl border p-4 shadow-sm ${alert ? "border-amber-100 bg-amber-50/60" : "border-slate-100 bg-white"}`}>

      <div className={`flex items-center gap-2 text-xs font-semibold ${alert ? "text-amber-600" : "text-slate-400"}`}>

        {icon}



        {label}

      </div>



      <div className={`mt-2 text-xl font-black ${alert ? "text-amber-800" : "text-slate-900"}`}>

        {formatNumber(value)}

      </div>



      <div className="mt-1 text-[10px] text-slate-400">{sub}</div>

    </div>);
}
function MiniMetric({ label, value, alert = false, }: {
    label: string;
    value: string;
    alert?: boolean;
}) {
    return (<div className="rounded-xl border border-black/5 bg-white/80 px-3 py-2.5">

      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">

        {label}

      </div>



      <div className={`mt-1 text-lg font-black ${alert ? "text-red-600" : "text-slate-900"}`}>

        {value}

      </div>

    </div>);
}
function PressureMetric({ label, value, alert = false, }: {
    label: string;
    value: number | string | null;
    alert?: boolean;
}) {
    return (<div className={`rounded-xl border px-3 py-2 ${alert ? "border-red-100 bg-red-50/70" : "border-black/5 bg-white/70"}`}>

      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">

        {label}

      </div>



      <div className={`mt-0.5 text-sm font-black ${alert ? "text-red-600" : "text-slate-800"}`}>

        {formatNumber(value)}

      </div>

    </div>);
}
function Field({ label, name, defaultValue, type = "text", step, }: {
    label: string;
    name: string;
    defaultValue: string | number | null;
    type?: string;
    step?: string;
}) {
    return (<label>

      <span className="field-label text-xs">{label}</span>



      <input type={type} name={name} min={type === "number" ? "0" : undefined} step={step} defaultValue={defaultValue == null ? "" : String(defaultValue)} className="input"/>

    </label>);
}
function StatusBadge({ label, tone, }: {
    label: string;
    tone: "green" | "red" | "amber" | "slate";
}) {
    const classes = {
        green: "bg-emerald-100 text-emerald-700",
        red: "bg-red-100 text-red-700",
        amber: "bg-amber-100 text-amber-700",
        slate: "bg-slate-100 text-slate-600",
    };
    return (<span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase ${classes[tone]}`}>

      {label}

    </span>);
}
function NoteBox({ label, text, }: {
    label: string;
    text: string;
}) {
    return (<div className="rounded-xl border border-slate-100 bg-white/70 px-3 py-2.5">

      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">

        {label}

      </div>



      <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">

        {text}

      </div>

    </div>);
}
function InfoBox({ title, text, }: {
    title: string;
    text: string;
}) {
    return (<div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3">

      <div className="font-bold text-slate-700">{title}</div>



      <div className="mt-0.5">{text}</div>

    </div>);
}
function capacityStatusLabel(value: string) {
    if (value === "demand_exceeds_open_seats") {
        return "Demand > seats";
    }
    if (value === "payment_pressure") {
        return "Payment pressure";
    }
    if (value === "capacity_not_set") {
        return "Capacity not set";
    }
    return pretty(value);
}
function capacityTone(value: string): "green" | "red" | "amber" | "slate" {
    if (value === "overbooked" || value === "full") {
        return "red";
    }
    if (["near_full", "payment_pressure", "demand_exceeds_open_seats"].includes(value)) {
        return "amber";
    }
    if (value === "capacity_not_set") {
        return "slate";
    }
    return "green";
}
function batchCardClass(row: BatchRow, status: string) {
    if (row.active === false) {
        return "border-slate-200 bg-slate-50/80 opacity-80";
    }
    if (status === "overbooked" || status === "full") {
        return "border-red-200 bg-red-50/35";
    }
    if (["near_full", "payment_pressure", "demand_exceeds_open_seats"].includes(status)) {
        return "border-amber-200 bg-amber-50/30";
    }
    return "border-slate-100 bg-white";
}
function progressClass(status: string) {
    if (status === "overbooked" || status === "full") {
        return "bg-red-500";
    }
    if (["near_full", "payment_pressure", "demand_exceeds_open_seats"].includes(status)) {
        return "bg-amber-500";
    }
    return "bg-emerald-500";
}
function noticeText(notice: string) {
    if (notice === "course-created") {
        return "Course created successfully. You can now add its first batch.";
    }
    if (notice === "course-updated") {
        return "Course details updated successfully.";
    }
    if (notice === "batch-created") {
        return "Batch created successfully and opened in the editor.";
    }
    if (notice === "batch-updated") {
        return "Batch capacity and commercial settings updated.";
    }
    if (notice === "enrollment-closed") {
        return "Enrollment closed for this batch.";
    }
    if (notice === "enrollment-reopened") {
        return "Enrollment reopened for this batch.";
    }
    if (notice === "batch-activated") {
        return "Batch activated.";
    }
    if (notice === "batch-deactivated") {
        return "Batch deactivated. Historical lead links are preserved.";
    }
    return "Course management updated.";
}
function formatDateRange(start: string | null, end: string | null) {
    if (!start) {
        return "Dates not set";
    }
    const first = formatShortDate(start);
    if (!end || end === start) {
        return first;
    }
    return `${first} – ${formatShortDate(end)}`;
}
function formatShortDate(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(date);
}
function formatDateTime(value: string | null) {
    if (!value) {
        return "—";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
    }).format(date);
}
function formatMoneyMaybe(value: number | string | null, currency: string | null) {
    if (value == null || !currency) {
        return "—";
    }
    try {
        return new Intl.NumberFormat(currency.toUpperCase() === "INR" ? "en-IN" : "en-US", {
            style: "currency",
            currency: currency.toUpperCase(),
            maximumFractionDigits: 0,
        }).format(toNumber(value));
    }
    catch {
        return `${currency} ${toNumber(value)}`;
    }
}
function nullableNumber(value: number | string | null) {
    if (value == null || value === "") {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
function toNumber(value: number | string | null | undefined) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
}
function formatNumber(value: number | string | null | undefined) {
    return new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 0,
    }).format(toNumber(value));
}
function pretty(value: string) {
    return value
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function one(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
        return value[0] ?? "";
    }
    return value ?? "";
}
