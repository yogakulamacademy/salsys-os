import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
export type CourseManagementCourseRow = {
    course_id: string;
    code: string;
    name: string;
    category: string | null;
    hours: number | string | null;
    active: boolean;
    source_system: string | null;
    external_course_id: string | null;
    created_at: string | null;
    updated_at: string | null;
};
export type CourseManagementBatchRow = {
    batch_id: string;
    course_id: string;
    course_code: string | null;
    course_name: string | null;
    course_active: boolean | null;
    batch_code: string | null;
    location: string | null;
    mode: string | null;
    start_date: string | null;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    timezone: string | null;
    capacity: number | string | null;
    published_seats_remaining: number | string | null;
    enrolled_count: number | string | null;
    calculated_seats_remaining: number | string | null;
    active_prospects: number | string | null;
    hot_prospects: number | string | null;
    payment_pending: number | string | null;
    needs_reply: number | string | null;
    critical_prospects: number | string | null;
    unassigned_prospects: number | string | null;
    capacity_status: string | null;
    expected_value: number | string | null;
    currency: string | null;
    price_private: number | string | null;
    price_shared: number | string | null;
    price_course_only: number | string | null;
    enrollment_open: boolean | null;
    enrollment_closed_at: string | null;
    enrollment_note: string | null;
    active: boolean | null;
    local_enabled: boolean | null;
    source_active: boolean | null;
    effective_active: boolean | null;
    created_at: string | null;
    updated_at: string | null;
};
export type CourseManagementAuditRow = {
    id: string;
    batch_id: string;
    action: string;
    created_at: string | null;
};
export type CourseManagementSummary = {
    upcomingBatches: number;
    totalCapacity: number;
    totalEnrolled: number;
    totalOpenSeats: number;
    closedEnrollment: number;
    needsCapacity: number;
    demandPressure: number;
};
export type CourseManagementWorkspace = {
    courses: CourseManagementCourseRow[];
    batches: CourseManagementBatchRow[];
    summary: CourseManagementSummary;
    locations: string[];
    audits: CourseManagementAuditRow[];
    batchNames: Record<string, string>;
};
type WorkspaceParams = {
    query: string;
    location: string;
    state: string;
};
type RpcPayload = {
    courses?: CourseManagementCourseRow[];
    batches?: CourseManagementBatchRow[];
    summary?: {
        upcoming_batches?: number | string | null;
        total_capacity?: number | string | null;
        total_enrolled?: number | string | null;
        total_open_seats?: number | string | null;
        closed_enrollment?: number | string | null;
        needs_capacity?: number | string | null;
        demand_pressure?: number | string | null;
    };
    locations?: string[];
    audits?: CourseManagementAuditRow[];
    batch_names?: Record<string, string>;
};
export async function getCourseManagementWorkspace({ query, location, state, }: WorkspaceParams): Promise<CourseManagementWorkspace> {
    const supabase = await createClient();
    const { data: { user }, error: authError, } = await supabase.auth.getUser();
    if (authError || !user) {
        throw new Error("Unable to load Course Management: user is not authenticated.");
    }
    const organizationId = await requireCurrentOrganizationId(supabase, user.id);
    const { data, error } = await supabase.rpc("get_course_management_workspace_v2", {
        p_organization_id: organizationId,
        p_query: query,
        p_location: location,
        p_state: state,
    });
    if (error) {
        throw new Error(`Unable to load Course Management workspace: ${error.message}`);
    }
    return parseWorkspace((data ?? {}) as RpcPayload);
}
function parseWorkspace(payload: RpcPayload): CourseManagementWorkspace {
    const summary = payload.summary ?? {};
    return {
        courses: arrayValue(payload.courses),
        batches: arrayValue(payload.batches),
        summary: {
            upcomingBatches: toNumber(summary.upcoming_batches),
            totalCapacity: toNumber(summary.total_capacity),
            totalEnrolled: toNumber(summary.total_enrolled),
            totalOpenSeats: toNumber(summary.total_open_seats),
            closedEnrollment: toNumber(summary.closed_enrollment),
            needsCapacity: toNumber(summary.needs_capacity),
            demandPressure: toNumber(summary.demand_pressure),
        },
        locations: arrayValue(payload.locations).filter((value): value is string => typeof value === "string" && Boolean(value)),
        audits: arrayValue(payload.audits),
        batchNames: isRecord(payload.batch_names)
            ? Object.fromEntries(Object.entries(payload.batch_names).map(([key, value]) => [
                key,
                String(value ?? "Batch"),
            ]))
            : {},
    };
}
function toNumber(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
}
function arrayValue<T>(value: T[] | undefined): T[] {
    return Array.isArray(value) ? value : [];
}
function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
