import type { AccommodationInventoryRow } from "@/components/batch-accommodation-inventory";

import type { EnrollmentAccommodationRosterRow } from "@/components/batch-accommodation-assignments";

import type {
  BatchPhysicalRoomInventoryRow,
  EnrollmentPhysicalRoomAssignmentRow,
} from "@/components/batch-physical-room-pool";

import type {
  AccommodationPropertyRow,
  AccommodationRoomRow,
} from "@/components/physical-room-master";

import { createClient } from "@/lib/supabase/server";

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

  accommodation_capacity: number | string | null;
  accommodation_remaining: number | string | null;
  accommodation_note: string | null;

  expected_value: number | string | null;
  currency: string | null;
  price_private: number | string | null;
  price_shared: number | string | null;
  price_course_only: number | string | null;

  enrollment_open: boolean | null;
  enrollment_closed_at: string | null;
  enrollment_note: string | null;

  active: boolean | null;
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
  batches: CourseManagementBatchRow[];
  summary: CourseManagementSummary;
  locations: string[];
  audits: CourseManagementAuditRow[];
  batchNames: Record<string, string>;

  accommodationRows: AccommodationInventoryRow[];
  rosterRows: EnrollmentAccommodationRosterRow[];

  properties: AccommodationPropertyRow[];
  physicalRooms: AccommodationRoomRow[];

  roomPoolRows: BatchPhysicalRoomInventoryRow[];
  physicalRoomAssignments: EnrollmentPhysicalRoomAssignmentRow[];

  fallback: boolean;
  warning: string | null;
};

type WorkspaceParams = {
  query: string;
  location: string;
  state: string;
};

type RpcPayload = {
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

  accommodation_rows?: AccommodationInventoryRow[];
  roster_rows?: EnrollmentAccommodationRosterRow[];

  properties?: AccommodationPropertyRow[];
  physical_rooms?: AccommodationRoomRow[];

  room_pool_rows?: BatchPhysicalRoomInventoryRow[];
  physical_room_assignments?: EnrollmentPhysicalRoomAssignmentRow[];
};

export async function getCourseManagementWorkspace({
  query,
  location,
  state,
}: WorkspaceParams): Promise<CourseManagementWorkspace> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "get_course_management_workspace",
    {
      p_query: query,
      p_location: location,
      p_state: state,
    },
  );

  if (!error) {
    return parseWorkspace((data ?? {}) as RpcPayload);
  }

  const fallback = await getLegacyWorkspace(supabase, {
    query,
    location,
    state,
  });

  return {
    ...fallback,
    fallback: true,
    warning: `Optimized Course Management read model unavailable: ${error.message}`,
  };
}

function parseWorkspace(payload: RpcPayload): CourseManagementWorkspace {
  const summary = payload.summary ?? {};

  return {
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
      (value): value is string => typeof value === "string" && Boolean(value),
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

    accommodationRows: arrayValue(payload.accommodation_rows),

    rosterRows: arrayValue(payload.roster_rows),

    properties: arrayValue(payload.properties),

    physicalRooms: arrayValue(payload.physical_rooms),

    roomPoolRows: arrayValue(payload.room_pool_rows),

    physicalRoomAssignments: arrayValue(payload.physical_room_assignments),

    fallback: false,
    warning: null,
  };
}

async function getLegacyWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  { query, location, state }: WorkspaceParams,
): Promise<Omit<CourseManagementWorkspace, "fallback" | "warning">> {
  const [
    batchesResult,
    auditResult,
    accommodationResult,
    rosterResult,
    propertiesResult,
    roomsResult,
    roomPoolResult,
    physicalAssignmentsResult,
  ] = await Promise.all([
    supabase
      .from("v_course_batch_management")
      .select("*")
      .order("start_date", {
        ascending: true,
        nullsFirst: false,
      })
      .limit(300),

    supabase
      .from("course_batch_admin_events")
      .select("id,batch_id,action,created_at")
      .order("created_at", {
        ascending: false,
      })
      .limit(20),

    supabase
      .from("v_batch_accommodation_live_inventory")
      .select("*")
      .order("sort_order", {
        ascending: true,
      })
      .order("name", {
        ascending: true,
      })
      .limit(1000),

    supabase
      .from("v_batch_enrollment_accommodation_roster")
      .select("*")
      .order("start_date", {
        ascending: true,
        nullsFirst: false,
      })
      .order("lead_name", {
        ascending: true,
        nullsFirst: false,
      })
      .limit(2000),

    supabase
      .from("accommodation_properties")
      .select("*")
      .order("name", {
        ascending: true,
      })
      .limit(200),

    supabase
      .from("accommodation_rooms")
      .select("*")
      .order("sort_order", {
        ascending: true,
      })
      .order("room_code", {
        ascending: true,
      })
      .limit(1000),

    supabase
      .from("v_batch_physical_room_inventory")
      .select("*")
      .order("start_date", {
        ascending: true,
        nullsFirst: false,
      })
      .order("sort_order", {
        ascending: true,
      })
      .limit(3000),

    supabase
      .from("v_enrollment_physical_room_assignments")
      .select("*")
      .order("assigned_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(3000),
  ]);

  const errors = [
    batchesResult.error,
    auditResult.error,
    accommodationResult.error,
    rosterResult.error,
    propertiesResult.error,
    roomsResult.error,
    roomPoolResult.error,
    physicalAssignmentsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(
      `Unable to load Course Management workspace: ${errors
        .map((item) => item?.message)
        .join(" | ")}`,
    );
  }

  const allBatches = (batchesResult.data ?? []) as CourseManagementBatchRow[];

  const filteredBatches = allBatches.filter((row) =>
    matchesFilters(row, {
      query,
      location,
      state,
    }),
  );

  const visibleBatchIds = new Set(filteredBatches.map((row) => row.batch_id));

  const upcoming = allBatches.filter(
    (row) => row.active !== false && isUpcomingOrOngoing(row),
  );

  const locations = [
    ...new Set(
      allBatches
        .map((row) => row.location)
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const batchNames = Object.fromEntries(
    allBatches.map((row) => [
      row.batch_id,
      row.batch_code || row.course_name || "Batch",
    ]),
  );

  return {
    batches: filteredBatches,

    summary: {
      upcomingBatches: upcoming.length,

      totalCapacity: upcoming.reduce(
        (total, row) =>
          row.capacity == null ? total : total + toNumber(row.capacity),
        0,
      ),

      totalEnrolled: upcoming.reduce(
        (total, row) => total + toNumber(row.enrolled_count),
        0,
      ),

      totalOpenSeats: upcoming.reduce(
        (total, row) =>
          row.calculated_seats_remaining == null
            ? total
            : total + toNumber(row.calculated_seats_remaining),
        0,
      ),

      closedEnrollment: upcoming.filter((row) => row.enrollment_open === false)
        .length,

      needsCapacity: upcoming.filter((row) => row.capacity == null).length,

      demandPressure: upcoming.filter((row) =>
        [
          "overbooked",
          "full",
          "near_full",
          "payment_pressure",
          "demand_exceeds_open_seats",
        ].includes(row.capacity_status || ""),
      ).length,
    },

    locations,

    audits: (auditResult.data ?? []) as CourseManagementAuditRow[],

    batchNames,

    accommodationRows: (accommodationResult.data ?? []).filter(
      (row: AccommodationInventoryRow) => visibleBatchIds.has(row.batch_id),
    ) as AccommodationInventoryRow[],

    rosterRows: (rosterResult.data ?? []).filter(
      (row: EnrollmentAccommodationRosterRow) =>
        visibleBatchIds.has(row.batch_id),
    ) as EnrollmentAccommodationRosterRow[],

    properties: (propertiesResult.data ?? []) as AccommodationPropertyRow[],

    physicalRooms: (roomsResult.data ?? []) as AccommodationRoomRow[],

    roomPoolRows: (roomPoolResult.data ?? []).filter(
      (row: BatchPhysicalRoomInventoryRow) => visibleBatchIds.has(row.batch_id),
    ) as BatchPhysicalRoomInventoryRow[],

    physicalRoomAssignments: (physicalAssignmentsResult.data ?? []).filter(
      (row: EnrollmentPhysicalRoomAssignmentRow) =>
        visibleBatchIds.has(row.batch_id) &&
        (row.room_assignment_status === "reserved" ||
          row.room_assignment_status === "confirmed"),
    ) as EnrollmentPhysicalRoomAssignmentRow[],
  };
}

function matchesFilters(
  row: CourseManagementBatchRow,
  { query, location, state }: WorkspaceParams,
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (
    normalizedQuery &&
    ![row.course_name, row.course_code, row.batch_code, row.location, row.mode]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  ) {
    return false;
  }

  if (location !== "all" && row.location !== location) {
    return false;
  }

  if (state === "all") {
    return true;
  }

  if (state === "inactive") {
    return row.active === false;
  }

  if (state === "open") {
    return (
      row.active !== false &&
      row.enrollment_open !== false &&
      isUpcomingOrOngoing(row)
    );
  }

  if (state === "closed") {
    return row.enrollment_open === false;
  }

  return row.active !== false && isUpcomingOrOngoing(row);
}

function isUpcomingOrOngoing(row: CourseManagementBatchRow) {
  if (!row.end_date) {
    return true;
  }

  const end = new Date(`${row.end_date.slice(0, 10)}T23:59:59Z`);

  return !Number.isNaN(end.getTime()) && end.getTime() >= startOfTodayUtc();
}

function startOfTodayUtc() {
  const now = new Date();

  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
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
