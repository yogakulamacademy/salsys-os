"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
function textValue(formData: FormData, key: string) {
    const value = String(formData.get(key) ?? "").trim();
    return value || null;
}
function nullableInteger(formData: FormData, key: string) {
    const raw = textValue(formData, key);
    if (!raw) {
        return null;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${key} must be a whole number of 0 or more`);
    }
    return value;
}
function nullableNumber(formData: FormData, key: string) {
    const raw = textValue(formData, key);
    if (!raw) {
        return null;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${key} must be a number of 0 or more`);
    }
    return value;
}
function booleanValue(formData: FormData, key: string) {
    const raw = String(formData.get(key) ?? "")
        .trim()
        .toLowerCase();
    return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}
function safeReturnPath(value?: string | null) {
    if (!value ||
        !value.startsWith("/course-management") ||
        value.startsWith("//")) {
        return "/course-management";
    }
    return value;
}
function withMessage(path: string, key: "notice" | "error", value: string) {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}
function revalidateBatchPages() {
    revalidatePath("/course-management");
    revalidatePath("/admissions");
    revalidatePath("/dashboard");
    revalidatePath("/leads");
    revalidatePath("/leads/new");
    revalidatePath("/pipeline");
    revalidatePath("/revenue");
}
async function getCurrentOrganizationId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
    const { data: { user }, error: authError, } = await supabase.auth.getUser();
    if (authError || !user) {
        throw new Error("Unable to resolve current organization: user is not authenticated.");
    }
    return requireCurrentOrganizationId(supabase, user.id);
}
export async function createCourseAction(formData: FormData) {
    const returnTo = safeReturnPath(textValue(formData, "return_to"));
    const name = textValue(formData, "name");
    const rawCode = textValue(formData, "code");
    if (!name) {
        redirect(withMessage(returnTo, "error", "Course name is required"));
    }
    if (!rawCode) {
        redirect(withMessage(returnTo, "error", "Course code is required"));
    }
    const code = rawCode
        .toUpperCase()
        .replace(/\s+/g, "-");
    const category = textValue(formData, "category");
    let hours: number | null;
    try {
        hours = nullableInteger(formData, "hours");
    }
    catch (error) {
        redirect(withMessage(returnTo, "error", error instanceof Error
            ? error.message
            : "Invalid course hours"));
    }
    const active = booleanValue(formData, "active");
    const supabase = await createClient();
    const organizationId = await getCurrentOrganizationId(supabase);
    const { data, error, } = await supabase
        .from("courses")
        .insert({
        organization_id: organizationId,
        code,
        name,
        category,
        hours,
        active,
    })
        .select("id")
        .single();
    if (error) {
        const message = error.code === "23505"
            ? `A course with code ${code} already exists in this workspace.`
            : error.message;
        redirect(withMessage(returnTo, "error", message));
    }
    revalidateBatchPages();
    redirect(`/course-management?course=${encodeURIComponent(String(data.id))}&notice=course-created`);
}
export async function updateCourseAction(formData: FormData) {
    const courseId = textValue(formData, "course_id");
    const returnTo = safeReturnPath(textValue(formData, "return_to"));
    if (!courseId) {
        redirect(withMessage(returnTo, "error", "Course is missing"));
    }
    const name = textValue(formData, "name");
    const rawCode = textValue(formData, "code");
    if (!name) {
        redirect(withMessage(returnTo, "error", "Course name is required"));
    }
    if (!rawCode) {
        redirect(withMessage(returnTo, "error", "Course code is required"));
    }
    const code = rawCode
        .toUpperCase()
        .replace(/\s+/g, "-");
    const category = textValue(formData, "category");
    let hours: number | null;
    try {
        hours = nullableInteger(formData, "hours");
    }
    catch (error) {
        redirect(withMessage(returnTo, "error", error instanceof Error
            ? error.message
            : "Invalid course hours"));
    }
    const active = booleanValue(formData, "active");
    const supabase = await createClient();
    const organizationId = await getCurrentOrganizationId(supabase);
    const { data, error, } = await supabase
        .from("courses")
        .update({
        code,
        name,
        category,
        hours,
        active,
    })
        .eq("id", courseId)
        .eq("organization_id", organizationId)
        .select("id")
        .maybeSingle();
    if (error) {
        const message = error.code === "23505"
            ? `A course with code ${code} already exists in this workspace.`
            : error.message;
        redirect(withMessage(returnTo, "error", message));
    }
    if (!data) {
        redirect(withMessage(returnTo, "error", "Course was not found in the selected workspace"));
    }
    revalidateBatchPages();
    redirect(withMessage(returnTo, "notice", "course-updated"));
}
export async function createCourseBatchAction(formData: FormData) {
    const returnTo = safeReturnPath(textValue(formData, "return_to"));
    const courseId = textValue(formData, "course_id");
    if (!courseId) {
        redirect(withMessage(returnTo, "error", "Course is required"));
    }
    const rawBatchCode = textValue(formData, "batch_code");
    const batchCode = rawBatchCode
        ? rawBatchCode
            .toUpperCase()
            .replace(/\s+/g, "-")
        : null;
    const location = textValue(formData, "location");
    const mode = textValue(formData, "mode");
    const allowedModes = new Set([
        "residential",
        "online",
        "non_residential",
        "hybrid",
    ]);
    if (!mode || !allowedModes.has(mode)) {
        redirect(withMessage(returnTo, "error", "A valid batch mode is required"));
    }
    const startDate = textValue(formData, "start_date");
    const endDate = textValue(formData, "end_date");
    if (!startDate || !endDate) {
        redirect(withMessage(returnTo, "error", "Start date and end date are required"));
    }
    if (endDate < startDate) {
        redirect(withMessage(returnTo, "error", "End date cannot be before start date"));
    }
    const startTime = textValue(formData, "start_time");
    const endTime = textValue(formData, "end_time");
    const timezone = textValue(formData, "timezone") ||
        "Asia/Kolkata";
    let capacity: number | null;
    let publishedSeats: number | null;
    let expectedValue: number | null;
    try {
        capacity = nullableInteger(formData, "capacity");
        publishedSeats = nullableInteger(formData, "published_seats_remaining");
        expectedValue = nullableNumber(formData, "expected_value");
    }
    catch (error) {
        redirect(withMessage(returnTo, "error", error instanceof Error
            ? error.message
            : "Invalid batch value"));
    }
    if (capacity !== null &&
        publishedSeats !== null &&
        publishedSeats > capacity) {
        redirect(withMessage(returnTo, "error", "Published seats remaining cannot exceed batch capacity"));
    }
    const currency = textValue(formData, "currency");
    const enrollmentOpen = booleanValue(formData, "enrollment_open");
    const localEnabled = booleanValue(formData, "active");
    const supabase = await createClient();
    const organizationId = await getCurrentOrganizationId(supabase);
    const { data: course, error: courseError, } = await supabase
        .from("courses")
        .select("id")
        .eq("id", courseId)
        .eq("organization_id", organizationId)
        .maybeSingle();
    if (courseError) {
        redirect(withMessage(returnTo, "error", courseError.message));
    }
    if (!course) {
        redirect(withMessage(returnTo, "error", "Course was not found in the selected workspace"));
    }
    const { data, error, } = await supabase
        .from("course_batches")
        .insert({
        organization_id: organizationId,
        course_id: courseId,
        batch_code: batchCode,
        location,
        mode,
        start_date: startDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        timezone,
        capacity,
        seats_remaining: publishedSeats,
        expected_value: expectedValue,
        currency: currency
            ? currency.toUpperCase()
            : null,
        enrollment_open: enrollmentOpen,
        // Manual batches remain source-active.
        // User-facing activation is controlled by local_enabled.
        active: true,
        source_active: true,
        local_enabled: localEnabled,
    })
        .select("id")
        .single();
    if (error) {
        const message = error.code === "23505"
            ? batchCode
                ? `A batch with code ${batchCode} already exists in this workspace.`
                : "A batch with these unique values already exists."
            : error.message;
        redirect(withMessage(returnTo, "error", message));
    }
    revalidateBatchPages();
    redirect(`/course-management?course=${encodeURIComponent(courseId)}&batch=${encodeURIComponent(String(data.id))}&notice=batch-created`);
}
export async function updateCourseBatchAdminAction(formData: FormData) {
    const batchId = textValue(formData, "batch_id");
    const returnTo = safeReturnPath(textValue(formData, "return_to"));
    if (!batchId) {
        redirect(withMessage(returnTo, "error", "Batch is missing"));
    }
    let capacity: number | null;
    let publishedSeats: number | null;
    let expectedValue: number | null;
    try {
        capacity = nullableInteger(formData, "capacity");
        publishedSeats = nullableInteger(formData, "published_seats_remaining");
        expectedValue = nullableNumber(formData, "expected_value");
    }
    catch (error) {
        redirect(withMessage(returnTo, "error", error instanceof Error
            ? error.message
            : "Invalid batch value"));
    }
    const currency = textValue(formData, "currency");
    const enrollmentNote = textValue(formData, "enrollment_note");
    const supabase = await createClient();
    const organizationId = await getCurrentOrganizationId(supabase);
    const { error } = await supabase.rpc("update_course_batch_admin_v2", {
        p_organization_id: organizationId,
        p_batch_id: batchId,
        p_capacity: capacity,
        p_published_seats_remaining: publishedSeats,
        p_expected_value: expectedValue,
        p_currency: currency,
        p_enrollment_note: enrollmentNote,
    });
    if (error) {
        redirect(withMessage(returnTo, "error", error.message));
    }
    revalidateBatchPages();
    redirect(withMessage(returnTo, "notice", "batch-updated"));
}
export async function setCourseBatchEnrollmentStateAction(formData: FormData) {
    const batchId = textValue(formData, "batch_id");
    const returnTo = safeReturnPath(textValue(formData, "return_to"));
    if (!batchId) {
        redirect(withMessage(returnTo, "error", "Batch is missing"));
    }
    const open = booleanValue(formData, "open");
    const note = textValue(formData, "note");
    const supabase = await createClient();
    const organizationId = await getCurrentOrganizationId(supabase);
    const { error } = await supabase.rpc("set_course_batch_enrollment_state_v2", {
        p_organization_id: organizationId,
        p_batch_id: batchId,
        p_open: open,
        p_note: note,
    });
    if (error) {
        redirect(withMessage(returnTo, "error", error.message));
    }
    revalidateBatchPages();
    redirect(withMessage(returnTo, "notice", open
        ? "enrollment-reopened"
        : "enrollment-closed"));
}
export async function setCourseBatchActiveStateAction(formData: FormData) {
    const batchId = textValue(formData, "batch_id");
    const returnTo = safeReturnPath(textValue(formData, "return_to"));
    if (!batchId) {
        redirect(withMessage(returnTo, "error", "Batch is missing"));
    }
    const active = booleanValue(formData, "active");
    const supabase = await createClient();
    const organizationId = await getCurrentOrganizationId(supabase);
    const { error } = await supabase.rpc("set_course_batch_active_state_v2", {
        p_organization_id: organizationId,
        p_batch_id: batchId,
        p_active: active,
    });
    if (error) {
        redirect(withMessage(returnTo, "error", error.message));
    }
    revalidateBatchPages();
    redirect(withMessage(returnTo, "notice", active
        ? "batch-activated"
        : "batch-deactivated"));
}
export type BatchBoardChange = {
    batchId: string;
    capacity?: number | null;
    fee?: number | null;
    currency?: string | null;
    open?: boolean;
};
/**
 * Saves several batches from the Programs & Batches board in one go (owner-approved
 * prototype, 26 Nov 2026). Uses the same audited RPCs as the single-batch form, on the
 * signed-in user's session; untouched fields keep their current values.
 */
export async function saveBatchBoardChangesAction(changes: BatchBoardChange[]): Promise<{ ok: boolean; message: string }> {
    const list = Array.isArray(changes) ? changes.slice(0, 200) : [];
    if (!list.length) {
        return { ok: false, message: "Nothing to save." };
    }
    for (const c of list) {
        if (!c || typeof c.batchId !== "string" || !c.batchId) {
            return { ok: false, message: "A batch is missing." };
        }
        if (c.capacity != null && (!Number.isInteger(c.capacity) || c.capacity < 1 || c.capacity > 10000)) {
            return { ok: false, message: "Seats must be a whole number of 1 or more." };
        }
        if (c.fee != null && (!Number.isFinite(c.fee) || c.fee < 0)) {
            return { ok: false, message: "The fee must be a number of 0 or more." };
        }
        if (c.currency != null && !/^[A-Za-z]{3}$/.test(c.currency)) {
            return { ok: false, message: "Currency must be a 3-letter code such as INR or USD." };
        }
    }
    const supabase = await createClient();
    const organizationId = await getCurrentOrganizationId(supabase);
    const ids = list.map((c) => c.batchId);
    const { data: rows, error: loadError } = await supabase
        .from("course_batches")
        .select("id, capacity, seats_remaining, expected_value, currency, enrollment_note, enrollment_open")
        .eq("organization_id", organizationId)
        .in("id", ids);
    if (loadError) {
        return { ok: false, message: "Couldn’t load those batches. Please try again." };
    }
    const byId = new Map((rows ?? []).map((r: any) => [String(r.id), r]));
    const failed: string[] = [];
    let saved = 0;
    for (const c of list) {
        const row: any = byId.get(c.batchId);
        if (!row) {
            failed.push("A batch was not found in this workspace.");
            continue;
        }
        const touchesDetails = "capacity" in c || "fee" in c || "currency" in c;
        if (touchesDetails) {
            const capacity = "capacity" in c ? (c.capacity ?? null) : (row.capacity == null ? null : Number(row.capacity));
            let published = row.seats_remaining == null ? null : Number(row.seats_remaining);
            if (published != null && capacity != null && published > capacity) {
                published = capacity;
            }
            const { error } = await supabase.rpc("update_course_batch_admin_v2", {
                p_organization_id: organizationId,
                p_batch_id: c.batchId,
                p_capacity: capacity,
                p_published_seats_remaining: published,
                p_expected_value: "fee" in c ? (c.fee ?? null) : (row.expected_value == null ? null : Number(row.expected_value)),
                p_currency: "currency" in c && c.currency ? c.currency.toUpperCase() : row.currency,
                p_enrollment_note: row.enrollment_note,
            });
            if (error) {
                failed.push(error.message);
                continue;
            }
        }
        if (typeof c.open === "boolean" && c.open !== (row.enrollment_open !== false)) {
            const { error } = await supabase.rpc("set_course_batch_enrollment_state_v2", {
                p_organization_id: organizationId,
                p_batch_id: c.batchId,
                p_open: c.open,
                p_note: null,
            });
            if (error) {
                failed.push(error.message);
                continue;
            }
        }
        saved += 1;
    }
    revalidateBatchPages();
    revalidatePath("/operations");
    revalidatePath("/enrollments");
    if (failed.length) {
        return { ok: false, message: `Saved ${saved} of ${list.length}. ${failed[0]}` };
    }
    return { ok: true, message: `Saved ${saved} batch${saved === 1 ? "" : "es"}.` };
}
/** Puts a paid enrolment into a batch of the same course (owner-approved write path, 26 Nov 2026). */
export async function assignEnrollmentBatchAction(enrollmentId: string, batchId: string): Promise<{ ok: boolean; message: string }> {
    if (typeof enrollmentId !== "string" || !enrollmentId || typeof batchId !== "string" || !batchId) {
        return { ok: false, message: "Pick a batch first." };
    }
    const supabase = await createClient();
    const organizationId = await getCurrentOrganizationId(supabase);
    const { error } = await supabase.rpc("assign_enrollment_batch_v1", {
        p_organization_id: organizationId,
        p_enrollment_id: enrollmentId,
        p_batch_id: batchId,
    });
    if (error) {
        const message = /capacity exceeded/i.test(error.message)
            ? "That batch is full. Raise its seats in Programs & Batches or pick another date."
            : /not authorized/i.test(error.message)
                ? "You don’t have permission to change batches."
                : error.message;
        return { ok: false, message };
    }
    revalidateBatchPages();
    revalidatePath("/operations");
    revalidatePath("/enrollments");
    return { ok: true, message: "Student assigned to the batch." };
}
