"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Copy, GraduationCap, Pencil, Plus, X, } from "lucide-react";
import { createCourseAction, createCourseBatchAction, updateCourseAction, } from "@/app/course-management/actions";
type CourseOption = {
    course_id: string;
    code: string;
    name: string;
    category: string | null;
    hours: number | string | null;
    active: boolean;
};
type BatchOption = {
    batch_id: string;
    course_id: string;
    batch_code: string | null;
    location: string | null;
    start_date: string | null;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    timezone: string | null;
    mode: string | null;
    capacity: number | string | null;
    published_seats_remaining: number | string | null;
    expected_value: number | string | null;
    currency: string | null;
    enrollment_open: boolean | null;
    local_enabled: boolean | null;
};
export function CourseManagementSelector({ courses, batches, selectedCourseId, selectedBatchId, }: {
    courses: CourseOption[];
    batches: BatchOption[];
    selectedCourseId: string;
    selectedBatchId: string;
}) {
    const router = useRouter();
    const [courseId, setCourseId] = useState(selectedCourseId);
    const [batchId, setBatchId] = useState(selectedBatchId);
    const [showNewCourse, setShowNewCourse] = useState(false);
    const [showEditCourse, setShowEditCourse] = useState(false);
    const [showNewBatch, setShowNewBatch] = useState(false);
    const [showDuplicateBatch, setShowDuplicateBatch] = useState(false);
    useEffect(() => {
        setCourseId(selectedCourseId);
        setBatchId(selectedBatchId);
    }, [selectedCourseId, selectedBatchId]);
    const selectedCourse = useMemo(() => courses.find((course) => course.course_id === courseId) ?? null, [courses, courseId]);
    const selectedBatch = useMemo(() => batches.find((batch) => batch.batch_id === batchId) ?? null, [batches, batchId]);
    const availableBatches = useMemo(() => batches.filter((batch) => batch.course_id === courseId), [batches, courseId]);
    function openSelection(nextCourseId: string, nextBatchId?: string) {
        const params = new URLSearchParams();
        if (nextCourseId) {
            params.set("course", nextCourseId);
        }
        if (nextBatchId) {
            params.set("batch", nextBatchId);
        }
        const query = params.toString();
        router.push(query
            ? `/course-management?${query}`
            : "/course-management");
    }
    function handleCourseChange(nextCourseId: string) {
        setCourseId(nextCourseId);
        setShowNewCourse(false);
        setShowEditCourse(false);
        setShowNewBatch(false);
        setShowDuplicateBatch(false);
        const firstBatch = batches.find((batch) => batch.course_id === nextCourseId);
        const nextBatchId = firstBatch?.batch_id ?? "";
        setBatchId(nextBatchId);
        openSelection(nextCourseId, nextBatchId || undefined);
    }
    function handleBatchChange(nextBatchId: string) {
        setBatchId(nextBatchId);
        setShowDuplicateBatch(false);
        openSelection(courseId, nextBatchId || undefined);
    }
    return (<section className="card-pad mt-4">

      <div className="flex flex-wrap items-start justify-between gap-4">

        <div>

          <div className="eyebrow">

            Batch workspace

          </div>



          <div className="section-title mt-1">

            Select what you want to manage

          </div>



          <p className="mt-1 text-xs leading-5 text-slate-400">

            Choose a course first, then select one of its batches.

            Only the selected batch opens in the editor.

          </p>

        </div>



        <div className="flex flex-wrap gap-2">

          <button type="button" onClick={() => {
            setShowNewBatch(false);
            setShowDuplicateBatch(false);
            setShowEditCourse(false);
            setShowNewCourse((current) => !current);
        }} className="btn-secondary">

            {showNewCourse ? (<X size={15}/>) : (<Plus size={15}/>)}



            {showNewCourse
            ? "Close Course Form"
            : "New Course"}

          </button>



          <button type="button" disabled={!selectedCourse} onClick={() => {
            setShowNewCourse(false);
            setShowNewBatch(false);
            setShowDuplicateBatch(false);
            setShowEditCourse((current) => !current);
        }} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50">

            {showEditCourse ? (<X size={15}/>) : (<Pencil size={15}/>)}



            {showEditCourse
            ? "Close Edit"
            : "Edit Course"}

          </button>

          <button type="button" disabled={!courseId} onClick={() => {
            setShowNewCourse(false);
            setShowEditCourse(false);
            setShowDuplicateBatch(false);
            setShowNewBatch((current) => !current);
        }} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">

            {showNewBatch ? (<X size={15}/>) : (<Plus size={15}/>)}



            {showNewBatch
            ? "Close Batch Form"
            : "New Batch"}

          </button>

          <button type="button" disabled={!selectedBatch} onClick={() => {
            setShowNewCourse(false);
            setShowEditCourse(false);
            setShowNewBatch(false);
            setShowDuplicateBatch((current) => !current);
        }} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50">

            {showDuplicateBatch ? (<X size={15}/>) : (<Copy size={15}/>)}



            {showDuplicateBatch
            ? "Close Duplicate"
            : "Duplicate Batch"}

          </button>

        </div>

      </div>



      <div className="mt-5 grid gap-4 lg:grid-cols-2">

        <label>

          <span className="field-label flex items-center gap-1.5 text-xs">

            <GraduationCap size={14}/>

            Course

          </span>



          <select value={courseId} onChange={(event) => handleCourseChange(event.target.value)} className="input">

            {courses.length === 0 && (<option value="">

                No courses available

              </option>)}



            {courses.map((course) => (<option key={course.course_id} value={course.course_id}>

                {course.name}

                {course.code
                ? ` | ${course.code}`
                : ""}

                {!course.active
                ? " | Inactive"
                : ""}

              </option>))}

          </select>

        </label>



        <label>

          <span className="field-label flex items-center gap-1.5 text-xs">

            <CalendarDays size={14}/>

            Batch / Date

          </span>



          <select value={batchId} onChange={(event) => handleBatchChange(event.target.value)} className="input" disabled={!courseId ||
            availableBatches.length === 0}>

            {availableBatches.length === 0 ? (<option value="">

                No batches created for this course

              </option>) : (availableBatches.map((batch) => (<option key={batch.batch_id} value={batch.batch_id}>

                  {batchLabel(batch)}

                </option>)))}

          </select>

        </label>

      </div>





      {showEditCourse && selectedCourse && (<div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">

          <div>

            <div className="eyebrow">

              Edit course

            </div>



            <div className="section-title mt-1">

              Update course information

            </div>



            <p className="mt-1 text-xs leading-5 text-slate-400">

              These changes update the reusable course record.

              Existing batches remain attached to this course.

            </p>

          </div>



          <form action={updateCourseAction} className="mt-5">

            <input type="hidden" name="course_id" value={selectedCourse.course_id}/>



            <input type="hidden" name="return_to" value={courseId && batchId
                ? `/course-management?course=${encodeURIComponent(courseId)}&batch=${encodeURIComponent(batchId)}`
                : `/course-management?course=${encodeURIComponent(courseId)}`}/>



            <div className="grid gap-4 md:grid-cols-2">

              <label>

                <span className="field-label text-xs">

                  Course name *

                </span>



                <input type="text" name="name" required defaultValue={selectedCourse.name} className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  Course code *

                </span>



                <input type="text" name="code" required defaultValue={selectedCourse.code} className="input"/>



                <div className="mt-1 text-[10px] leading-4 text-slate-400">

                  The code must stay unique inside this school.

                </div>

              </label>



              <label>

                <span className="field-label text-xs">

                  Category

                </span>



                <input type="text" name="category" defaultValue={selectedCourse.category || ""} className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  Training hours

                </span>



                <input type="number" name="hours" min="0" step="1" defaultValue={selectedCourse.hours == null
                ? ""
                : selectedCourse.hours} className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  Course status

                </span>



                <select name="active" defaultValue={selectedCourse.active
                ? "true"
                : "false"} className="input">

                  <option value="true">

                    Active

                  </option>



                  <option value="false">

                    Inactive

                  </option>

                </select>

              </label>

            </div>



            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">

              <button type="button" onClick={() => setShowEditCourse(false)} className="btn-secondary">

                Cancel

              </button>



              <button type="submit" className="btn-primary">

                Save Course

              </button>

            </div>

          </form>

        </div>)}

      {(showNewBatch || showDuplicateBatch) && courseId && (<div key={showDuplicateBatch
                ? `duplicate-${selectedBatch?.batch_id || "batch"}`
                : "new-batch"} className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">

          <div>

            <div className="eyebrow">

              {showDuplicateBatch ? "Duplicate batch" : "New batch"}

            </div>



            <div className="section-title mt-1">

              {showDuplicateBatch
                ? "Copy the selected batch"
                : "Add a batch to the selected course"}

            </div>



            <p className="mt-1 text-xs leading-5 text-slate-400">

              {showDuplicateBatch
                ? "Existing settings are prefilled. Enter a new batch code and adjust the new dates before creating it."
                : "Create the schedule and operational settings for this course. The new batch will open automatically after creation."}

            </p>

          </div>



          <form action={createCourseBatchAction} className="mt-5">

            <input type="hidden" name="course_id" value={courseId}/>



            <input type="hidden" name="return_to" value={courseId && batchId
                ? `/course-management?course=${encodeURIComponent(courseId)}&batch=${encodeURIComponent(batchId)}`
                : `/course-management?course=${encodeURIComponent(courseId)}`}/>



            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

              <label>

                <span className="field-label text-xs">

                  Batch code

                </span>



                <input type="text" name="batch_code" required={showDuplicateBatch} defaultValue="" placeholder="e.g. 200H-MYS-NOV26" className="input"/>



                <div className="mt-1 text-[10px] leading-4 text-slate-400">

                  Optional, but recommended for easy identification.

                </div>

              </label>



              <label>

                <span className="field-label text-xs">

                  Location

                </span>



                <input type="text" name="location" defaultValue={showDuplicateBatch
                ? selectedBatch?.location || ""
                : ""} placeholder="e.g. Mysore, Kerala, Online" className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  Mode *

                </span>



                <select name="mode" required defaultValue={showDuplicateBatch
                ? selectedBatch?.mode || "residential"
                : "residential"} className="input">

                  <option value="residential">

                    Residential

                  </option>



                  <option value="online">

                    Online

                  </option>



                  <option value="non_residential">

                    Non-residential

                  </option>



                  <option value="hybrid">

                    Hybrid

                  </option>

                </select>

              </label>



              <label>

                <span className="field-label text-xs">

                  Start date *

                </span>



                <input type="date" name="start_date" required defaultValue={showDuplicateBatch
                ? selectedBatch?.start_date?.slice(0, 10) || ""
                : ""} className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  End date *

                </span>



                <input type="date" name="end_date" required defaultValue={showDuplicateBatch
                ? selectedBatch?.end_date?.slice(0, 10) || ""
                : ""} className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  Timezone

                </span>



                <input type="text" name="timezone" defaultValue={showDuplicateBatch
                ? selectedBatch?.timezone || "Asia/Kolkata"
                : "Asia/Kolkata"} className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  Start time

                </span>



                <input type="time" name="start_time" defaultValue={showDuplicateBatch
                ? selectedBatch?.start_time?.slice(0, 5) || ""
                : ""} className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  End time

                </span>



                <input type="time" name="end_time" defaultValue={showDuplicateBatch
                ? selectedBatch?.end_time?.slice(0, 5) || ""
                : ""} className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  Capacity

                </span>



                <input type="number" name="capacity" min="0" step="1" defaultValue={showDuplicateBatch
                ? selectedBatch?.capacity ?? ""
                : ""} placeholder="e.g. 20" className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  Published open seats

                </span>



                <input type="number" name="published_seats_remaining" min="0" step="1" defaultValue={showDuplicateBatch
                ? selectedBatch?.published_seats_remaining ?? ""
                : ""} placeholder="e.g. 20" className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  Expected value

                </span>



                <input type="number" name="expected_value" min="0" step="0.01" defaultValue={showDuplicateBatch
                ? selectedBatch?.expected_value ?? ""
                : ""} placeholder="e.g. 1500" className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  Currency

                </span>



                <select name="currency" defaultValue={showDuplicateBatch
                ? selectedBatch?.currency || ""
                : ""} className="input">

                  <option value="">

                    Not set

                  </option>



                  <option value="INR">

                    INR

                  </option>



                  <option value="USD">

                    USD

                  </option>



                  <option value="EUR">

                    EUR

                  </option>



                  <option value="GBP">

                    GBP

                  </option>

                </select>

              </label>



              <label>

                <span className="field-label text-xs">

                  Enrollment

                </span>



                <select name="enrollment_open" defaultValue={showDuplicateBatch &&
                selectedBatch?.enrollment_open === false
                ? "false"
                : "true"} className="input">

                  <option value="true">

                    Open

                  </option>



                  <option value="false">

                    Closed

                  </option>

                </select>

              </label>



              <label>

                <span className="field-label text-xs">

                  Batch status

                </span>



                <select name="active" defaultValue={showDuplicateBatch &&
                selectedBatch?.local_enabled === false
                ? "false"
                : "true"} className="input">

                  <option value="true">

                    Active

                  </option>



                  <option value="false">

                    Inactive

                  </option>

                </select>

              </label>

            </div>



            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">

              <button type="button" onClick={() => {
                setShowNewBatch(false);
                setShowDuplicateBatch(false);
            }} className="btn-secondary">

                Cancel

              </button>



              <button type="submit" className="btn-primary">

                {showDuplicateBatch ? (<Copy size={15}/>) : (<Plus size={15}/>)}



                {showDuplicateBatch
                ? "Duplicate Batch"
                : "Create Batch"}

              </button>

            </div>

          </form>

        </div>)}

      {showNewCourse && (<div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">

          <div className="flex flex-wrap items-start justify-between gap-3">

            <div>

              <div className="eyebrow">

                New course

              </div>



              <div className="section-title mt-1">

                Add a course to this school

              </div>



              <p className="mt-1 text-xs leading-5 text-slate-400">

                Create the reusable course first. You can add one or more batches after it is created.

              </p>

            </div>

          </div>



          <form action={createCourseAction} className="mt-5">

            <input type="hidden" name="return_to" value={courseId && batchId
                ? `/course-management?course=${encodeURIComponent(courseId)}&batch=${encodeURIComponent(batchId)}`
                : courseId
                    ? `/course-management?course=${encodeURIComponent(courseId)}`
                    : "/course-management"}/>



            <div className="grid gap-4 md:grid-cols-2">

              <label>

                <span className="field-label text-xs">

                  Course name *

                </span>



                <input type="text" name="name" required placeholder="e.g. 100 Hour Kundalini Yoga Teacher Training" className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  Course code *

                </span>



                <input type="text" name="code" required placeholder="e.g. 100H-KUNDALINI" className="input"/>



                <div className="mt-1 text-[10px] leading-4 text-slate-400">

                  The code must be unique inside this school.

                </div>

              </label>



              <label>

                <span className="field-label text-xs">

                  Category

                </span>



                <input type="text" name="category" placeholder="e.g. Yoga Teacher Training" className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  Training hours

                </span>



                <input type="number" name="hours" min="0" step="1" placeholder="e.g. 200" className="input"/>

              </label>



              <label>

                <span className="field-label text-xs">

                  Status

                </span>



                <select name="active" defaultValue="true" className="input">

                  <option value="true">

                    Active

                  </option>



                  <option value="false">

                    Inactive

                  </option>

                </select>

              </label>

            </div>



            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">

              <button type="button" onClick={() => setShowNewCourse(false)} className="btn-secondary">

                Cancel

              </button>



              <button type="submit" className="btn-primary">

                <Plus size={15}/>

                Create Course

              </button>

            </div>

          </form>

        </div>)}

    </section>);
}
function batchLabel(batch: BatchOption) {
    const parts: string[] = [];
    const dates = formatDateRange(batch.start_date, batch.end_date);
    if (dates) {
        parts.push(dates);
    }
    if (batch.location) {
        parts.push(batch.location);
    }
    if (batch.mode) {
        parts.push(pretty(batch.mode));
    }
    if (batch.batch_code) {
        parts.push(batch.batch_code);
    }
    return parts.join(" | ") || "Batch";
}
function formatDateRange(start?: string | null, end?: string | null) {
    if (!start && !end) {
        return "";
    }
    const startLabel = formatDate(start);
    const endLabel = formatDate(end);
    if (startLabel && endLabel) {
        return `${startLabel} - ${endLabel}`;
    }
    return startLabel || endLabel;
}
function formatDate(value?: string | null) {
    if (!value) {
        return "";
    }
    const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(date);
}
function pretty(value: string) {
    return value
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
