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
  degraded: boolean;
  degradedReason: string | null;
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

type DemandMetrics = {
  activeProspects: number;
  hotProspects: number;
  paymentPending: number;
  needsReply: number;
  criticalProspects: number;
  unassignedProspects: number;
};

const ACTIVE_PROSPECT_STAGES = new Set([
  "new",
  "contacted",
  "engaged",
  "qualified",
  "high_intent",
  "payment_pending",
]);

const DEMAND_PRESSURE_STATUSES = new Set([
  "overbooked",
  "full",
  "near_full",
  "payment_pressure",
  "demand_exceeds_open_seats",
]);

export async function getCourseManagementWorkspace({
  query,
  location,
  state,
}: WorkspaceParams): Promise<CourseManagementWorkspace> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Unable to load Course Management: user is not authenticated.",
    );
  }

  const organizationId = await requireCurrentOrganizationId(
    supabase,
    user.id,
  );

  const { data, error } = await supabase.rpc(
    "get_course_management_workspace_v2",
    {
      p_organization_id: organizationId,
      p_query: query,
      p_location: location,
      p_state: state,
    },
  );

  if (!error) {
    return parseWorkspace((data ?? {}) as RpcPayload);
  }

  if (!isStatementTimeout(error.message)) {
    throw new Error(
      `Unable to load Course Management workspace: ${error.message}`,
    );
  }

  console.warn(
    "Course Management aggregate workspace timed out; using tenant-scoped base-table fallback.",
    {
      organizationId,
    },
  );

  return loadCourseManagementFallback(supabase as any, organizationId, {
    query,
    location,
    state,
  });
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
    locations: arrayValue(payload.locations).filter(
      (value): value is string =>
        typeof value === "string" && Boolean(value),
    ),
    audits: arrayValue(payload.audits),
    batchNames: isRecord(payload.batch_names)
      ? Object.fromEntries(
          Object.entries(payload.batch_names).map(([key, value]) => [
            key,
            String(value ?? "Batch"),
          ]),
        )
      : {},
    degraded: false,
    degradedReason: null,
  };
}

async function loadCourseManagementFallback(
  db: any,
  organizationId: string,
  params: WorkspaceParams,
): Promise<CourseManagementWorkspace> {
  const [coursesResult, batchesResult] = await Promise.all([
    db
      .from("courses")
      .select(
        "id, code, name, category, hours, active, source_system, external_course_id, created_at, updated_at",
      )
      .eq("organization_id", organizationId)
      .order("active", { ascending: false })
      .order("name", { ascending: true })
      .order("code", { ascending: true }),

    db
      .from("course_batches")
      .select(
        "id, course_id, batch_code, location, mode, start_date, end_date, start_time, end_time, timezone, capacity, seats_remaining, expected_value, currency, price_private, price_shared, price_course_only, enrollment_open, enrollment_closed_at, enrollment_note, active, local_enabled, source_active, source_system, external_batch_id, created_at, updated_at",
      )
      .eq("organization_id", organizationId)
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(500),
  ]);

  if (coursesResult.error) {
    throw new Error(
      `Unable to load Course Management courses: ${coursesResult.error.message}`,
    );
  }

  if (batchesResult.error) {
    throw new Error(
      `Unable to load Course Management batches: ${batchesResult.error.message}`,
    );
  }

  const rawCourses = arrayValue<any>(coursesResult.data);
  const rawBatches = arrayValue<any>(batchesResult.data);

  const [leadsResult, enrollmentsResult, auditsResult] = await Promise.all([
    db
      .from("leads")
      .select(
        "id, preferred_batch_id, current_stage, status, intent, owner_user_id, last_inbound_at, last_outbound_at",
      )
      .eq("organization_id", organizationId)
      .not("preferred_batch_id", "is", null)
      .neq("status", "archived"),

    db
      .from("enrollments")
      .select("lead_id, batch_id, status, created_at, updated_at")
      .eq("organization_id", organizationId)
      .not("batch_id", "is", null),

    db
      .from("course_batch_admin_events")
      .select("id, batch_id, action, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const intelligenceErrors = [
    leadsResult.error?.message,
    enrollmentsResult.error?.message,
    auditsResult.error?.message,
  ].filter(Boolean);

  if (intelligenceErrors.length > 0) {
    console.warn(
      "Course Management fallback loaded with reduced auxiliary intelligence.",
      {
        organizationId,
        errors: intelligenceErrors,
      },
    );
  }

  const courses: CourseManagementCourseRow[] = rawCourses.map((course) => ({
    course_id: String(course.id),
    code: String(course.code ?? ""),
    name: String(course.name ?? course.code ?? "Course"),
    category: nullableString(course.category),
    hours: course.hours ?? null,
    active: course.active !== false,
    source_system: nullableString(course.source_system),
    external_course_id: nullableString(course.external_course_id),
    created_at: nullableString(course.created_at),
    updated_at: nullableString(course.updated_at),
  }));

  const courseById = new Map(courses.map((course) => [course.course_id, course]));
  const leads = arrayValue<any>(leadsResult.data);
  const enrollments = arrayValue<any>(enrollmentsResult.data);

  const enrollmentKeys = new Set<string>();
  const latestEnrollmentByKey = new Map<string, any>();

  for (const enrollment of enrollments) {
    const batchId = String(enrollment.batch_id ?? "").trim();
    const leadId = String(enrollment.lead_id ?? "").trim();

    if (!batchId || !leadId) continue;

    const key = `${batchId}:${leadId}`;
    enrollmentKeys.add(key);

    const previous = latestEnrollmentByKey.get(key);
    if (!previous || isEnrollmentNewer(enrollment, previous)) {
      latestEnrollmentByKey.set(key, enrollment);
    }
  }

  const enrolledByBatch = new Map<string, Set<string>>();

  for (const [key, enrollment] of latestEnrollmentByKey.entries()) {
    const status = String(enrollment.status ?? "").toLowerCase();
    if (status !== "confirmed" && status !== "completed") continue;

    const [batchId, leadId] = splitEnrollmentKey(key);
    addToSetMap(enrolledByBatch, batchId, leadId);
  }

  const demandByBatch = new Map<string, DemandMetrics>();

  for (const lead of leads) {
    const batchId = String(lead.preferred_batch_id ?? "").trim();
    const leadId = String(lead.id ?? "").trim();
    if (!batchId || !leadId) continue;

    const stage = String(lead.current_stage ?? "").toLowerCase();
    const intent = String(lead.intent ?? "").toLowerCase();

    if (stage === "enrolled" && !enrollmentKeys.has(`${batchId}:${leadId}`)) {
      addToSetMap(enrolledByBatch, batchId, leadId);
    }

    const metrics = demandByBatch.get(batchId) ?? emptyDemandMetrics();
    const isActiveProspect = ACTIVE_PROSPECT_STAGES.has(stage);

    if (isActiveProspect) {
      metrics.activeProspects += 1;
      if (stage === "high_intent" || stage === "payment_pending" || intent === "very_high") {
        metrics.hotProspects += 1;
      }
      if (stage === "payment_pending") {
        metrics.paymentPending += 1;
        metrics.criticalProspects += 1;
      }
      if (needsReply(lead.last_inbound_at, lead.last_outbound_at)) {
        metrics.needsReply += 1;
      }
      if (!lead.owner_user_id) {
        metrics.unassignedProspects += 1;
      }
    }

    demandByBatch.set(batchId, metrics);
  }

  const baseBatches: CourseManagementBatchRow[] = rawBatches.map((batch) => {
    const batchId = String(batch.id);
    const courseId = String(batch.course_id);
    const course = courseById.get(courseId) ?? null;
    const enrolledCount = enrolledByBatch.get(batchId)?.size ?? 0;
    const demand = demandByBatch.get(batchId) ?? emptyDemandMetrics();
    const capacity = nullableNumber(batch.capacity);
    const calculatedSeatsRemaining =
      capacity == null ? null : Math.max(capacity - enrolledCount, 0);
    const effectiveActive =
      batch.active !== false &&
      batch.local_enabled !== false &&
      batch.source_active !== false;
    const capacityStatus = calculateCapacityStatus({
      capacity,
      enrolledCount,
      activeProspects: demand.activeProspects,
      paymentPending: demand.paymentPending,
    });

    return {
      batch_id: batchId,
      course_id: courseId,
      course_code: course?.code ?? null,
      course_name: course?.name ?? null,
      course_active: course?.active ?? null,
      batch_code: nullableString(batch.batch_code),
      location: nullableString(batch.location),
      mode: nullableString(batch.mode),
      start_date: nullableString(batch.start_date),
      end_date: nullableString(batch.end_date),
      start_time: nullableString(batch.start_time),
      end_time: nullableString(batch.end_time),
      timezone: nullableString(batch.timezone),
      capacity: batch.capacity ?? null,
      published_seats_remaining: batch.seats_remaining ?? null,
      enrolled_count: enrolledCount,
      calculated_seats_remaining: calculatedSeatsRemaining,
      active_prospects: demand.activeProspects,
      hot_prospects: demand.hotProspects,
      payment_pending: demand.paymentPending,
      needs_reply: demand.needsReply,
      critical_prospects: demand.criticalProspects,
      unassigned_prospects: demand.unassignedProspects,
      capacity_status: capacityStatus,
      expected_value: batch.expected_value ?? null,
      currency: nullableString(batch.currency),
      price_private: batch.price_private ?? null,
      price_shared: batch.price_shared ?? null,
      price_course_only: batch.price_course_only ?? null,
      enrollment_open: batch.enrollment_open ?? null,
      enrollment_closed_at: nullableString(batch.enrollment_closed_at),
      enrollment_note: nullableString(batch.enrollment_note),
      active: batch.active ?? null,
      local_enabled: batch.local_enabled ?? null,
      source_active: batch.source_active ?? null,
      effective_active: effectiveActive,
      created_at: nullableString(batch.created_at),
      updated_at: nullableString(batch.updated_at),
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const filteredBatches = baseBatches.filter((batch) =>
    matchesBatchFilters(batch, params, today),
  );
  const upcomingBatches = baseBatches.filter(
    (batch) =>
      batch.effective_active === true &&
      (!batch.end_date || batch.end_date >= today),
  );

  const summary: CourseManagementSummary = {
    upcomingBatches: upcomingBatches.length,
    totalCapacity: upcomingBatches.reduce(
      (sum, batch) => sum + (nullableNumber(batch.capacity) ?? 0),
      0,
    ),
    totalEnrolled: upcomingBatches.reduce(
      (sum, batch) => sum + toNumber(batch.enrolled_count),
      0,
    ),
    totalOpenSeats: upcomingBatches.reduce(
      (sum, batch) =>
        sum + (nullableNumber(batch.calculated_seats_remaining) ?? 0),
      0,
    ),
    closedEnrollment: upcomingBatches.filter(
      (batch) => batch.enrollment_open === false,
    ).length,
    needsCapacity: upcomingBatches.filter((batch) => batch.capacity == null)
      .length,
    demandPressure: upcomingBatches.filter((batch) =>
      DEMAND_PRESSURE_STATUSES.has(String(batch.capacity_status ?? "")),
    ).length,
  };

  const locations = Array.from(
    new Set(
      baseBatches
        .map((batch) => batch.location?.trim() ?? "")
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const audits: CourseManagementAuditRow[] = arrayValue<any>(
    auditsResult.data,
  ).map((audit) => ({
    id: String(audit.id),
    batch_id: String(audit.batch_id),
    action: String(audit.action ?? "updated"),
    created_at: nullableString(audit.created_at),
  }));

  const batchNames = Object.fromEntries(
    baseBatches.map((batch) => [
      batch.batch_id,
      batch.batch_code || batch.course_name || "Batch",
    ]),
  );

  return {
    courses,
    batches: filteredBatches,
    summary,
    locations,
    audits,
    batchNames,
    degraded: true,
    degradedReason:
      intelligenceErrors.length > 0
        ? "The aggregate workspace timed out and some auxiliary intelligence reads were unavailable. Course and batch controls are still loaded from tenant-scoped base records."
        : "The aggregate workspace timed out, so Course Management is using tenant-scoped base records and locally calculated capacity intelligence for this request.",
  };
}

function matchesBatchFilters(
  batch: CourseManagementBatchRow,
  params: WorkspaceParams,
  today: string,
) {
  const queryText = String(params.query ?? "").trim().toLowerCase();
  const location = String(params.location || "all");
  const state = String(params.state || "upcoming");

  if (queryText) {
    const haystack = [
      batch.course_name,
      batch.course_code,
      batch.batch_code,
      batch.location,
      batch.mode,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(queryText)) return false;
  }

  if (location !== "all" && batch.location !== location) return false;

  if (state === "all") return true;
  if (state === "inactive") return batch.effective_active === false;
  if (state === "closed") return batch.enrollment_open === false;

  const isCurrent = !batch.end_date || batch.end_date >= today;

  if (state === "open") {
    return (
      batch.effective_active === true &&
      batch.enrollment_open !== false &&
      isCurrent
    );
  }

  return batch.effective_active === true && isCurrent;
}

function calculateCapacityStatus({
  capacity,
  enrolledCount,
  activeProspects,
  paymentPending,
}: {
  capacity: number | null;
  enrolledCount: number;
  activeProspects: number;
  paymentPending: number;
}) {
  if (capacity == null || capacity <= 0) return "capacity_not_set";
  if (enrolledCount > capacity) return "overbooked";
  if (enrolledCount >= capacity) return "full";

  const openSeats = capacity - enrolledCount;
  if (openSeats <= Math.max(2, Math.ceil(capacity * 0.15))) {
    return "near_full";
  }
  if (enrolledCount + paymentPending >= capacity) {
    return "payment_pressure";
  }
  if (activeProspects >= openSeats) {
    return "demand_exceeds_open_seats";
  }
  return "healthy";
}

function needsReply(lastInbound: unknown, lastOutbound: unknown) {
  const inbound = timestamp(lastInbound);
  if (!inbound) return false;

  const outbound = timestamp(lastOutbound);
  return !outbound || inbound > outbound;
}

function isEnrollmentNewer(candidate: any, previous: any) {
  const candidateCreated = timestamp(candidate.created_at);
  const previousCreated = timestamp(previous.created_at);

  if (candidateCreated !== previousCreated) {
    return candidateCreated > previousCreated;
  }

  return timestamp(candidate.updated_at) > timestamp(previous.updated_at);
}

function splitEnrollmentKey(key: string): [string, string] {
  const separator = key.indexOf(":");
  return [key.slice(0, separator), key.slice(separator + 1)];
}

function addToSetMap(
  map: Map<string, Set<string>>,
  key: string,
  value: string,
) {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

function emptyDemandMetrics(): DemandMetrics {
  return {
    activeProspects: 0,
    hotProspects: 0,
    paymentPending: 0,
    needsReply: 0,
    criticalProspects: 0,
    unassignedProspects: 0,
  };
}

function isStatementTimeout(message: unknown) {
  return String(message ?? "")
    .toLowerCase()
    .includes("statement timeout");
}

function nullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableString(value: unknown) {
  if (value == null) return null;
  const text = String(value);
  return text || null;
}

function timestamp(value: unknown) {
  if (!value) return 0;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function arrayValue<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
