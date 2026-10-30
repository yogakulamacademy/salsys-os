import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type EnrollmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "deferred";

export type EnrollmentWorkspaceRow = {
  id: string;
  leadId: string;
  leadCode: string;
  leadName: string;
  leadStage: string;
  courseId: string | null;
  courseName: string;
  batchId: string | null;
  batchCode: string;
  batchLocation: string | null;
  batchStartDate: string | null;
  batchEndDate: string | null;
  status: EnrollmentStatus;
  totalValue: number | null;
  currency: string | null;
  enrolledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EnrollmentWorkspace = {
  rows: EnrollmentWorkspaceRow[];
  summary: {
    total: number;
    pending: number;
    confirmed: number;
    completed: number;
    deferred: number;
    cancelled: number;
  };
};

export async function getEnrollmentsWorkspace(): Promise<EnrollmentWorkspace> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unable to load Enrollments: user is not authenticated.");
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);

  const { data: enrollmentData, error: enrollmentError } = await supabase
    .from("enrollments")
    .select(
      "id, lead_id, course_id, batch_id, status, total_value, currency, enrolled_at, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (enrollmentError) {
    throw new Error(`Unable to load Enrollments: ${enrollmentError.message}`);
  }

  const enrollments = enrollmentData ?? [];
  const leadIds = unique(enrollments.map((row) => row.lead_id));
  const courseIds = unique(enrollments.map((row) => row.course_id));
  const batchIds = unique(enrollments.map((row) => row.batch_id));

  const [leadsResult, coursesResult, batchesResult] = await Promise.all([
    leadIds.length
      ? supabase
          .from("leads")
          .select("id, lead_code, lead_name, display_name, current_stage")
          .eq("organization_id", organizationId)
          .in("id", leadIds)
      : Promise.resolve({ data: [], error: null }),
    courseIds.length
      ? supabase
          .from("courses")
          .select("id, code, name")
          .eq("organization_id", organizationId)
          .in("id", courseIds)
      : Promise.resolve({ data: [], error: null }),
    batchIds.length
      ? supabase
          .from("course_batches")
          .select("id, batch_code, location, start_date, end_date")
          .eq("organization_id", organizationId)
          .in("id", batchIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (leadsResult.error) {
    throw new Error(`Unable to load Enrollment lead context: ${leadsResult.error.message}`);
  }
  if (coursesResult.error) {
    throw new Error(`Unable to load Enrollment course context: ${coursesResult.error.message}`);
  }
  if (batchesResult.error) {
    throw new Error(`Unable to load Enrollment batch context: ${batchesResult.error.message}`);
  }

  const leadById = new Map((leadsResult.data ?? []).map((row) => [row.id, row]));
  const courseById = new Map((coursesResult.data ?? []).map((row) => [row.id, row]));
  const batchById = new Map((batchesResult.data ?? []).map((row) => [row.id, row]));

  const rows: EnrollmentWorkspaceRow[] = enrollments.map((row) => {
    const lead = leadById.get(row.lead_id);
    const course = row.course_id ? courseById.get(row.course_id) : null;
    const batch = row.batch_id ? batchById.get(row.batch_id) : null;

    return {
      id: row.id,
      leadId: row.lead_id,
      leadCode: lead?.lead_code ?? "—",
      leadName: lead?.lead_name || lead?.display_name || lead?.lead_code || "Lead",
      leadStage: lead?.current_stage ?? "unknown",
      courseId: row.course_id,
      courseName: course?.name || course?.code || "Not linked",
      batchId: row.batch_id,
      batchCode: batch?.batch_code || "Not linked",
      batchLocation: batch?.location ?? null,
      batchStartDate: batch?.start_date ?? null,
      batchEndDate: batch?.end_date ?? null,
      status: row.status as EnrollmentStatus,
      totalValue: row.total_value == null ? null : Number(row.total_value),
      currency: row.currency ?? null,
      enrolledAt: row.enrolled_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  const count = (status: EnrollmentStatus) => rows.filter((row) => row.status === status).length;

  return {
    rows,
    summary: {
      total: rows.length,
      pending: count("pending"),
      confirmed: count("confirmed"),
      completed: count("completed"),
      deferred: count("deferred"),
      cancelled: count("cancelled"),
    },
  };
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
