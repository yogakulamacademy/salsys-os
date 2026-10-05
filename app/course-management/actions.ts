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
