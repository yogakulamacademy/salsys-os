import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarDays,
  CircleDollarSign,
  GraduationCap,
  LockKeyhole,
  MapPin,
  PauseCircle,
  PlayCircle,
  Save,
  Search,
  ShieldCheck,
  UnlockKeyhole,
  Users,
} from 'lucide-react';

import {
  setCourseBatchActiveStateAction,
  setCourseBatchEnrollmentStateAction,
  updateCourseBatchAdminAction,
} from '@/app/course-management/actions';
import {
  BatchAccommodationInventory,
  type AccommodationInventoryRow,
} from '@/components/batch-accommodation-inventory';
import {
  BatchAccommodationAssignments,
  type EnrollmentAccommodationRosterRow,
} from '@/components/batch-accommodation-assignments';
import {
  BatchPhysicalRoomPool,
  type BatchPhysicalRoomInventoryRow,
  type EnrollmentPhysicalRoomAssignmentRow,
} from '@/components/batch-physical-room-pool';
import {
  PhysicalRoomMaster,
  type AccommodationPropertyRow,
  type AccommodationRoomRow,
} from '@/components/physical-room-master';
import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';


type BatchRow = {
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


type AuditRow = {
  id: string;
  batch_id: string;
  action: string;
  created_at: string | null;
};


type SearchParams = {
  q?: string | string[];
  location?: string | string[];
  state?: string | string[];
  notice?: string | string[];
  error?: string | string[];
};


export default async function CourseManagementPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved =
    (await searchParams) ?? {};

  const query =
    one(resolved.q).trim();

  const locationFilter =
    one(resolved.location) ||
    'all';

  const stateFilter =
    one(resolved.state) ||
    'upcoming';

  const notice =
    one(resolved.notice);

  const error =
    one(resolved.error);

  const supabase =
    await createClient();

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
      .from(
        'v_course_batch_management'
      )
      .select('*')
      .order(
        'start_date',
        {
          ascending: true,
          nullsFirst: false,
        }
      )
      .limit(300),

    supabase
      .from(
        'course_batch_admin_events'
      )
      .select(
        'id,batch_id,action,created_at'
      )
      .order(
        'created_at',
        {
          ascending: false,
        }
      )
      .limit(20),

    supabase
      .from(
        'v_batch_accommodation_live_inventory'
      )
      .select('*')
      .order(
        'sort_order',
        {
          ascending: true,
        }
      )
      .order(
        'name',
        {
          ascending: true,
        }
      )
      .limit(1000),

    supabase
      .from(
        'v_batch_enrollment_accommodation_roster'
      )
      .select('*')
      .order(
        'start_date',
        {
          ascending: true,
          nullsFirst: false,
        }
      )
      .order(
        'lead_name',
        {
          ascending: true,
          nullsFirst: false,
        }
      )
      .limit(2000),

    supabase
      .from(
        'accommodation_properties'
      )
      .select('*')
      .order(
        'name',
        {
          ascending: true,
        }
      )
      .limit(200),

    supabase
      .from(
        'accommodation_rooms'
      )
      .select('*')
      .order(
        'sort_order',
        {
          ascending: true,
        }
      )
      .order(
        'room_code',
        {
          ascending: true,
        }
      )
      .limit(1000),

    supabase
      .from(
        'v_batch_physical_room_inventory'
      )
      .select('*')
      .order(
        'start_date',
        {
          ascending: true,
          nullsFirst: false,
        }
      )
      .order(
        'sort_order',
        {
          ascending: true,
        }
      )
      .limit(3000),

    supabase
      .from(
        'v_enrollment_physical_room_assignments'
      )
      .select('*')
      .order(
        'assigned_at',
        {
          ascending: false,
          nullsFirst: false,
        }
      )
      .limit(3000),
  ]);

  if (batchesResult.error) {
    throw new Error(
      `Unable to load course batches: ${batchesResult.error.message}`
    );
  }

  if (auditResult.error) {
    throw new Error(
      `Unable to load batch audit history: ${auditResult.error.message}`
    );
  }

  if (accommodationResult.error) {
    throw new Error(
      `Unable to load accommodation inventory: ${accommodationResult.error.message}`
    );
  }

  if (rosterResult.error) {
    throw new Error(
      `Unable to load enrollment accommodation roster: ${rosterResult.error.message}`
    );
  }

  if (propertiesResult.error) {
    throw new Error(
      `Unable to load accommodation properties: ${propertiesResult.error.message}`
    );
  }

  if (roomsResult.error) {
    throw new Error(
      `Unable to load physical rooms: ${roomsResult.error.message}`
    );
  }

  if (roomPoolResult.error) {
    throw new Error(
      `Unable to load batch physical room inventory: ${roomPoolResult.error.message}`
    );
  }

  if (physicalAssignmentsResult.error) {
    throw new Error(
      `Unable to load physical room assignments: ${physicalAssignmentsResult.error.message}`
    );
  }

  const batches =
    (batchesResult.data ??
      []) as BatchRow[];

  const audits =
    (auditResult.data ??
      []) as AuditRow[];

  const accommodationRows =
    (accommodationResult.data ??
      []) as AccommodationInventoryRow[];

  const rosterRows =
    (rosterResult.data ??
      []) as EnrollmentAccommodationRosterRow[];

  const properties =
    (propertiesResult.data ??
      []) as AccommodationPropertyRow[];

  const physicalRooms =
    (roomsResult.data ??
      []) as AccommodationRoomRow[];

  const roomPoolRows =
    (roomPoolResult.data ??
      []) as BatchPhysicalRoomInventoryRow[];

  const physicalRoomAssignments =
    (physicalAssignmentsResult.data ??
      []) as EnrollmentPhysicalRoomAssignmentRow[];

  const activePhysicalRoomAssignments =
    physicalRoomAssignments.filter(
      (assignment) =>
        assignment.room_assignment_status ===
          'reserved' ||
        assignment.room_assignment_status ===
          'confirmed'
    );

  const accommodationByBatch =
    new Map<
      string,
      AccommodationInventoryRow[]
    >();

  for (
    const item
    of accommodationRows
  ) {
    const current =
      accommodationByBatch.get(
        item.batch_id
      ) ?? [];

    current.push(
      item
    );

    accommodationByBatch.set(
      item.batch_id,
      current
    );
  }

  const rosterByBatch =
    new Map<
      string,
      EnrollmentAccommodationRosterRow[]
    >();

  for (
    const item
    of rosterRows
  ) {
    const current =
      rosterByBatch.get(
        item.batch_id
      ) ?? [];

    current.push(
      item
    );

    rosterByBatch.set(
      item.batch_id,
      current
    );
  }

  const roomPoolByBatch =
    new Map<
      string,
      BatchPhysicalRoomInventoryRow[]
    >();

  for (
    const item
    of roomPoolRows
  ) {
    const current =
      roomPoolByBatch.get(
        item.batch_id
      ) ?? [];

    current.push(
      item
    );

    roomPoolByBatch.set(
      item.batch_id,
      current
    );
  }

  const physicalAssignmentsByBatch =
    new Map<
      string,
      EnrollmentPhysicalRoomAssignmentRow[]
    >();

  for (
    const item
    of activePhysicalRoomAssignments
  ) {
    const current =
      physicalAssignmentsByBatch.get(
        item.batch_id
      ) ?? [];

    current.push(
      item
    );

    physicalAssignmentsByBatch.set(
      item.batch_id,
      current
    );
  }

  const locations =
    [
      ...new Set(
        batches
          .map(
            (row) =>
              row.location
          )
          .filter(
            (
              value
            ): value is string =>
              Boolean(value)
          )
      ),
    ].sort(
      (a, b) =>
        a.localeCompare(b)
    );

  const filtered =
    batches.filter(
      (row) => {
        if (
          query &&
          !batchSearchText(
            row
          ).includes(
            query.toLowerCase()
          )
        ) {
          return false;
        }

        if (
          locationFilter !==
            'all' &&
          row.location !==
            locationFilter
        ) {
          return false;
        }

        if (
          !matchesState(
            row,
            stateFilter
          )
        ) {
          return false;
        }

        return true;
      }
    );

  const upcoming =
    batches.filter(
      (row) =>
        isUpcomingOrOngoing(
          row
        )
    );

  const totalCapacity =
    upcoming.reduce(
      (total, row) =>
        row.capacity == null
          ? total
          : total +
            toNumber(
              row.capacity
            ),
      0
    );

  const totalEnrolled =
    upcoming.reduce(
      (total, row) =>
        total +
        toNumber(
          row.enrolled_count
        ),
      0
    );

  const totalOpenSeats =
    upcoming.reduce(
      (total, row) =>
        row.calculated_seats_remaining ==
        null
          ? total
          : total +
            toNumber(
              row.calculated_seats_remaining
            ),
      0
    );

  const closedEnrollment =
    upcoming.filter(
      (row) =>
        row.enrollment_open ===
        false
    ).length;

  const needsCapacity =
    upcoming.filter(
      (row) =>
        row.capacity == null
    ).length;

  const demandPressure =
    upcoming.filter(
      (row) =>
        [
          'overbooked',
          'full',
          'near_full',
          'payment_pressure',
          'demand_exceeds_open_seats',
        ].includes(
          row.capacity_status ||
            ''
        )
    ).length;

  const returnTo =
    courseManagementHref({
      q: query,
      location:
        locationFilter,
      state:
        stateFilter,
    });

  const batchNameById =
    new Map(
      batches.map(
        (row) => [
          row.batch_id,
          row.batch_code ||
            row.course_name ||
            'Batch',
        ]
      )
    );

  return (
    <>
      <PageHeader
        eyebrow="Courses & batches"
        title="Course Management"
        description="Manage batch capacity, enrollment availability, accommodation inventory and default commercial values without leaving the CRM."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admissions"
              className="btn-secondary"
            >
              Admissions Desk
            </Link>

            <Link
              href="/dashboard"
              className="btn-secondary"
            >
              Dashboard
            </Link>
          </div>
        }
      />

      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {noticeText(
            notice
          )}
        </div>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          icon={
            <CalendarDays
              size={17}
            />
          }
          label="Upcoming batches"
          value={upcoming.length}
          sub="Active or ongoing"
        />

        <SummaryCard
          icon={
            <Users
              size={17}
            />
          }
          label="Confirmed enrolled"
          value={totalEnrolled}
          sub="Upcoming batches"
        />

        <SummaryCard
          icon={
            <GraduationCap
              size={17}
            />
          }
          label="Total capacity"
          value={totalCapacity}
          sub="Capacity-set batches"
        />

        <SummaryCard
          icon={
            <ShieldCheck
              size={17}
            />
          }
          label="Calculated open"
          value={totalOpenSeats}
          sub="After confirmed seats"
        />

        <SummaryCard
          icon={
            <LockKeyhole
              size={17}
            />
          }
          label="Enrollment closed"
          value={closedEnrollment}
          sub="Upcoming batches"
          alert={
            closedEnrollment >
            0
          }
        />

        <SummaryCard
          icon={
            <AlertTriangle
              size={17}
            />
          }
          label="Needs attention"
          value={
            needsCapacity +
            demandPressure
          }
          sub={`${needsCapacity} missing capacity · ${demandPressure} demand pressure`}
          alert={
            needsCapacity +
              demandPressure >
            0
          }
        />
      </section>

      <section className="card-pad mt-4">
        <form
          method="get"
          className="grid gap-3 lg:grid-cols-[1fr_220px_220px_auto]"
        >
          <label className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="search"
              name="q"
              defaultValue={
                query
              }
              placeholder="Search course, batch, location..."
              className="input pl-9"
            />
          </label>

          <select
            name="location"
            defaultValue={
              locationFilter
            }
            className="input"
          >
            <option value="all">
              All locations
            </option>

            {locations.map(
              (location) => (
                <option
                  key={
                    location
                  }
                  value={
                    location
                  }
                >
                  {location}
                </option>
              )
            )}
          </select>

          <select
            name="state"
            defaultValue={
              stateFilter
            }
            className="input"
          >
            <option value="upcoming">
              Upcoming / ongoing
            </option>
            <option value="open">
              Enrollment open
            </option>
            <option value="closed">
              Enrollment closed
            </option>
            <option value="inactive">
              Inactive batches
            </option>
            <option value="all">
              All batches
            </option>
          </select>

          <button
            type="submit"
            className="btn-primary"
          >
            Apply
          </button>
        </form>
      </section>

      <PhysicalRoomMaster
        properties={
          properties
        }
        rooms={
          physicalRooms
        }
        returnTo={
          returnTo
        }
      />

      <section className="mt-4 grid gap-4 2xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {filtered.length ===
          0 ? (
            <div className="card-pad py-14 text-center">
              <div className="text-sm font-bold text-slate-700">
                No batches
                match these
                filters.
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Try another
                location, state,
                or search term.
              </div>
            </div>
          ) : (
            filtered.map(
              (row) => (
                <BatchAdminCard
                  key={
                    row.batch_id
                  }
                  row={row}
                  returnTo={
                    returnTo
                  }
                  accommodationRows={
                    accommodationByBatch.get(
                      row.batch_id
                    ) ?? []
                  }
                  rosterRows={
                    rosterByBatch.get(
                      row.batch_id
                    ) ?? []
                  }
                  roomMasterRows={
                    physicalRooms
                  }
                  roomPoolRows={
                    roomPoolByBatch.get(
                      row.batch_id
                    ) ?? []
                  }
                  physicalRoomAssignments={
                    physicalAssignmentsByBatch.get(
                      row.batch_id
                    ) ?? []
                  }
                />
              )
            )
          )}
        </div>

        <aside className="space-y-4">
          <section className="card-pad">
            <div className="eyebrow">
              Operating rules
            </div>

            <div className="section-title mt-1">
              Capacity truth
            </div>

            <div className="mt-4 space-y-3 text-xs leading-5 text-slate-500">
              <InfoBox
                title="Calculated seats"
                text="Capacity minus confirmed enrollments. Admissions uses this as the operational seat count."
              />

              <InfoBox
                title="Published seats"
                text="Optional manual availability for staff or marketing. It never overwrites confirmed enrollment calculations."
              />

              <InfoBox
                title="Close enrollment"
                text="Stops new admissions operationally without deleting the batch or historical lead links."
              />

              <InfoBox
                title="Deactivate"
                text="Removes the batch from active CRM selectors while preserving historical references."
              />
            </div>
          </section>

          <section className="card-pad">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="eyebrow">
                  Audit trail
                </div>

                <div className="section-title mt-1">
                  Recent changes
                </div>
              </div>

              <ShieldCheck
                size={17}
                className="text-slate-300"
              />
            </div>

            <div className="mt-4 space-y-2">
              {audits.length ===
              0 ? (
                <div className="rounded-xl bg-slate-50 px-3 py-6 text-center text-xs text-slate-400">
                  No batch admin
                  changes logged
                  yet.
                </div>
              ) : (
                audits.map(
                  (event) => (
                    <div
                      key={
                        event.id
                      }
                      className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5"
                    >
                      <div className="text-xs font-bold text-slate-700">
                        {pretty(
                          event.action
                        )}
                      </div>

                      <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
                        {batchNameById.get(
                          event.batch_id
                        ) ||
                          'Batch'}
                      </div>

                      <div className="mt-1 text-[10px] text-slate-400">
                        {formatDateTime(
                          event.created_at
                        )}
                      </div>
                    </div>
                  )
                )
              )}
            </div>
          </section>
        </aside>
      </section>
    </>
  );
}


function BatchAdminCard({
  row,
  returnTo,
  accommodationRows,
  rosterRows,
  roomMasterRows,
  roomPoolRows,
  physicalRoomAssignments,
}: {
  row: BatchRow;
  returnTo: string;
  accommodationRows: AccommodationInventoryRow[];
  rosterRows: EnrollmentAccommodationRosterRow[];
  roomMasterRows: AccommodationRoomRow[];
  roomPoolRows: BatchPhysicalRoomInventoryRow[];
  physicalRoomAssignments: EnrollmentPhysicalRoomAssignmentRow[];
}) {
  const capacity =
    nullableNumber(
      row.capacity
    );

  const enrolled =
    toNumber(
      row.enrolled_count
    );

  const calculatedOpen =
    nullableNumber(
      row.calculated_seats_remaining
    );

  const publishedOpen =
    nullableNumber(
      row.published_seats_remaining
    );

  const accommodationCapacity =
    nullableNumber(
      row.accommodation_capacity
    );

  const accommodationRemaining =
    nullableNumber(
      row.accommodation_remaining
    );

  const status =
    row.capacity_status ||
    'healthy';

  const enrollmentOpen =
    row.enrollment_open !==
    false;

  const active =
    row.active !==
    false;

  const percent =
    capacity &&
    capacity > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (enrolled /
              capacity) *
              100
          )
        )
      : 0;

  return (
    <article
      className={`rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:shadow-md ${batchCardClass(
        row,
        status
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-black text-slate-900">
              {row.course_name ||
                row.course_code ||
                'Course'}
            </div>

            <StatusBadge
              label={
                enrollmentOpen
                  ? 'Enrollment open'
                  : 'Enrollment closed'
              }
              tone={
                enrollmentOpen
                  ? 'green'
                  : 'red'
              }
            />

            {!active && (
              <StatusBadge
                label="Inactive"
                tone="slate"
              />
            )}

            <StatusBadge
              label={capacityStatusLabel(
                status
              )}
              tone={capacityTone(
                status
              )}
            />
          </div>

          <div className="mt-1 text-[11px] font-semibold text-slate-400">
            {row.batch_code ||
              'Batch code unavailable'}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays
                size={13}
              />
              {formatDateRange(
                row.start_date,
                row.end_date
              )}
            </span>

            {row.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin
                  size={13}
                />
                {row.location}
              </span>
            )}

            {row.mode && (
              <span>
                {pretty(
                  row.mode
                )}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <form
            action={
              setCourseBatchEnrollmentStateAction
            }
          >
            <input
              type="hidden"
              name="batch_id"
              value={
                row.batch_id
              }
            />

            <input
              type="hidden"
              name="return_to"
              value={
                returnTo
              }
            />

            <input
              type="hidden"
              name="open"
              value={
                enrollmentOpen
                  ? 'false'
                  : 'true'
              }
            />

            <input
              type="hidden"
              name="note"
              value={
                row.enrollment_note ||
                ''
              }
            />

            <button
              type="submit"
              className={
                enrollmentOpen
                  ? 'inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-[11px] font-bold text-red-600 transition-colors hover:bg-red-50'
                  : 'inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-50'
              }
            >
              {enrollmentOpen ? (
                <>
                  <LockKeyhole
                    size={13}
                  />
                  Close enrollment
                </>
              ) : (
                <>
                  <UnlockKeyhole
                    size={13}
                  />
                  Reopen enrollment
                </>
              )}
            </button>
          </form>

          <form
            action={
              setCourseBatchActiveStateAction
            }
          >
            <input
              type="hidden"
              name="batch_id"
              value={
                row.batch_id
              }
            />

            <input
              type="hidden"
              name="return_to"
              value={
                returnTo
              }
            />

            <input
              type="hidden"
              name="active"
              value={
                active
                  ? 'false'
                  : 'true'
              }
            />

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
            >
              {active ? (
                <>
                  <PauseCircle
                    size={13}
                  />
                  Deactivate
                </>
              ) : (
                <>
                  <PlayCircle
                    size={13}
                  />
                  Activate
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <MiniMetric
          label="Capacity"
          value={
            capacity == null
              ? 'Not set'
              : formatNumber(
                  capacity
                )
          }
        />

        <MiniMetric
          label="Confirmed"
          value={formatNumber(
            enrolled
          )}
        />

        <MiniMetric
          label="Calculated open"
          value={
            calculatedOpen ==
            null
              ? '—'
              : formatNumber(
                  calculatedOpen
                )
          }
          alert={
            calculatedOpen ===
            0
          }
        />

        <MiniMetric
          label="Published open"
          value={
            publishedOpen ==
            null
              ? 'Not set'
              : formatNumber(
                  publishedOpen
                )
          }
        />
      </div>

      {capacity != null &&
        capacity > 0 && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-black/5">
              <div
                className={`h-full rounded-full ${progressClass(
                  status
                )}`}
                style={{
                  width: `${percent}%`,
                }}
              />
            </div>

            <div className="mt-1 flex items-center justify-between text-[10px] font-semibold text-slate-400">
              <span>
                {Math.round(
                  percent
                )}
                % confirmed
              </span>

              <span>
                {formatNumber(
                  row.active_prospects
                )}{' '}
                active prospects
              </span>
            </div>
          </div>
        )}

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <PressureMetric
          label="Hot"
          value={
            row.hot_prospects
          }
        />

        <PressureMetric
          label="Payment pending"
          value={
            row.payment_pending
          }
          alert={
            toNumber(
              row.payment_pending
            ) > 0
          }
        />

        <PressureMetric
          label="Needs reply"
          value={
            row.needs_reply
          }
          alert={
            toNumber(
              row.needs_reply
            ) > 0
          }
        />

        <PressureMetric
          label="Critical"
          value={
            row.critical_prospects
          }
          alert={
            toNumber(
              row.critical_prospects
            ) > 0
          }
        />
      </div>

      <form
        action={
          updateCourseBatchAdminAction
        }
        className="mt-5 border-t border-black/5 pt-5"
      >
        <input
          type="hidden"
          name="batch_id"
          value={
            row.batch_id
          }
        />

        <input
          type="hidden"
          name="return_to"
          value={
            returnTo
          }
        />

        <div className="grid gap-5 xl:grid-cols-3">
          <fieldset>
            <legend className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
              <Users
                size={14}
              />
              Seats
            </legend>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field
                label="Capacity"
                name="capacity"
                defaultValue={
                  row.capacity
                }
                type="number"
              />

              <Field
                label="Published open"
                name="published_seats_remaining"
                defaultValue={
                  row.published_seats_remaining
                }
                type="number"
              />
            </div>

            <div className="mt-2 text-[10px] leading-4 text-slate-400">
              Confirmed enrollments:
              {' '}
              <strong className="text-slate-600">
                {formatNumber(
                  enrolled
                )}
              </strong>
              . Capacity cannot
              be saved below this
              number.
            </div>
          </fieldset>

          <fieldset>
            <legend className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
              <BedDouble
                size={14}
              />
              Accommodation summary
            </legend>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field
                label="Capacity"
                name="accommodation_capacity"
                defaultValue={
                  row.accommodation_capacity
                }
                type="number"
              />

              <Field
                label="Remaining"
                name="accommodation_remaining"
                defaultValue={
                  row.accommodation_remaining
                }
                type="number"
              />
            </div>

            <label className="mt-3 block">
              <span className="field-label text-xs">
                Accommodation note
              </span>

              <input
                type="text"
                name="accommodation_note"
                defaultValue={
                  row.accommodation_note ||
                  ''
                }
                placeholder="e.g. Twin sharing only"
                className="input"
              />
            </label>

            <div className="mt-2 text-[10px] leading-4 text-slate-400">
              Optional overall summary. Detailed room-type inventory is managed below for residential batches.
            </div>
          </fieldset>

          <fieldset>
            <legend className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
              <CircleDollarSign
                size={14}
              />
              Commercial default
            </legend>

            <div className="mt-3 grid grid-cols-[1fr_100px] gap-3">
              <Field
                label="Expected value"
                name="expected_value"
                defaultValue={
                  row.expected_value
                }
                type="number"
                step="0.01"
              />

              <label>
                <span className="field-label text-xs">
                  Currency
                </span>

                <select
                  name="currency"
                  defaultValue={
                    row.currency ||
                    ''
                  }
                  className="input"
                >
                  <option value="">
                    —
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
            </div>

            <label className="mt-3 block">
              <span className="field-label text-xs">
                Enrollment note
              </span>

              <input
                type="text"
                name="enrollment_note"
                defaultValue={
                  row.enrollment_note ||
                  ''
                }
                placeholder="e.g. Only 2 twin rooms left"
                className="input"
              />
            </label>
          </fieldset>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] text-slate-400">
            Last updated{' '}
            {formatDateTime(
              row.updated_at
            )}
          </div>

          <button
            type="submit"
            className="btn-primary"
          >
            <Save
              size={15}
            />
            Save batch
          </button>
        </div>
      </form>

      {(row.mode === 'residential' ||
        row.mode === 'hybrid' ||
        accommodationRows.length > 0 ||
        rosterRows.length > 0 ||
        roomPoolRows.length > 0 ||
        physicalRoomAssignments.length > 0) && (
        <>
          <BatchAccommodationInventory
            batchId={
              row.batch_id
            }
            rows={
              accommodationRows
            }
            returnTo={
              returnTo
            }
          />

          <BatchPhysicalRoomPool
            batchId={
              row.batch_id
            }
            accommodationRows={
              accommodationRows
            }
            roomMasterRows={
              roomMasterRows
            }
            poolRows={
              roomPoolRows
            }
            returnTo={
              returnTo
            }
          />

          <BatchAccommodationAssignments
            rosterRows={
              rosterRows
            }
            accommodationRows={
              accommodationRows
            }
            roomPoolRows={
              roomPoolRows
            }
            physicalRoomAssignments={
              physicalRoomAssignments
            }
            returnTo={
              returnTo
            }
          />
        </>
      )}

      {(row.enrollment_note ||
        row.accommodation_note) && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {row.enrollment_note && (
            <NoteBox
              label="Enrollment note"
              text={
                row.enrollment_note
              }
            />
          )}

          {row.accommodation_note && (
            <NoteBox
              label="Accommodation note"
              text={
                row.accommodation_note
              }
            />
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-4 text-[10px] font-semibold text-slate-400">
        <span>
          Price references:
          {' '}
          Private{' '}
          {formatMoneyMaybe(
            row.price_private,
            row.currency
          )}
          {' · '}
          Shared{' '}
          {formatMoneyMaybe(
            row.price_shared,
            row.currency
          )}
          {' · '}
          Course only{' '}
          {formatMoneyMaybe(
            row.price_course_only,
            row.currency
          )}
        </span>

        <Link
          href="/admissions"
          className="inline-flex items-center gap-1 text-brand"
        >
          View demand
          <ArrowRight
            size={12}
          />
        </Link>
      </div>
    </article>
  );
}


function SummaryCard({
  icon,
  label,
  value,
  sub,
  alert = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        alert
          ? 'border-amber-100 bg-amber-50/60'
          : 'border-slate-100 bg-white'
      }`}
    >
      <div
        className={`flex items-center gap-2 text-xs font-semibold ${
          alert
            ? 'text-amber-600'
            : 'text-slate-400'
        }`}
      >
        {icon}
        {label}
      </div>

      <div
        className={`mt-2 text-xl font-black ${
          alert
            ? 'text-amber-800'
            : 'text-slate-900'
        }`}
      >
        {formatNumber(
          value
        )}
      </div>

      <div className="mt-1 text-[10px] text-slate-400">
        {sub}
      </div>
    </div>
  );
}


function MiniMetric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-xl border border-black/5 bg-white/80 px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div
        className={`mt-1 text-lg font-black ${
          alert
            ? 'text-red-600'
            : 'text-slate-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}


function PressureMetric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value:
    | number
    | string
    | null;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        alert
          ? 'border-red-100 bg-red-50/70'
          : 'border-black/5 bg-white/70'
      }`}
    >
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div
        className={`mt-0.5 text-sm font-black ${
          alert
            ? 'text-red-600'
            : 'text-slate-800'
        }`}
      >
        {formatNumber(
          value
        )}
      </div>
    </div>
  );
}


function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  step,
}: {
  label: string;
  name: string;
  defaultValue:
    | string
    | number
    | null;
  type?: string;
  step?: string;
}) {
  return (
    <label>
      <span className="field-label text-xs">
        {label}
      </span>

      <input
        type={type}
        name={name}
        min={
          type ===
          'number'
            ? '0'
            : undefined
        }
        step={step}
        defaultValue={
          defaultValue ==
          null
            ? ''
            : String(
                defaultValue
              )
        }
        className="input"
      />
    </label>
  );
}


function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone:
    | 'green'
    | 'red'
    | 'amber'
    | 'slate';
}) {
  const classes = {
    green:
      'bg-emerald-100 text-emerald-700',
    red:
      'bg-red-100 text-red-700',
    amber:
      'bg-amber-100 text-amber-700',
    slate:
      'bg-slate-100 text-slate-600',
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase ${classes[tone]}`}
    >
      {label}
    </span>
  );
}


function NoteBox({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white/70 px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">
        {text}
      </div>
    </div>
  );
}


function InfoBox({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3">
      <div className="font-bold text-slate-700">
        {title}
      </div>
      <div className="mt-0.5">
        {text}
      </div>
    </div>
  );
}


function matchesState(
  row: BatchRow,
  value: string
) {
  if (value === 'all') {
    return true;
  }

  if (
    value === 'inactive'
  ) {
    return row.active === false;
  }

  if (
    value === 'open'
  ) {
    return (
      row.active !== false &&
      row.enrollment_open !==
        false &&
      isUpcomingOrOngoing(
        row
      )
    );
  }

  if (
    value === 'closed'
  ) {
    return (
      row.enrollment_open ===
      false
    );
  }

  return (
    row.active !== false &&
    isUpcomingOrOngoing(
      row
    )
  );
}


function isUpcomingOrOngoing(
  row: BatchRow
) {
  if (!row.end_date) {
    return true;
  }

  const end =
    new Date(
      `${row.end_date.slice(
        0,
        10
      )}T23:59:59Z`
    );

  return (
    !Number.isNaN(
      end.getTime()
    ) &&
    end.getTime() >=
      startOfTodayUtc()
  );
}


function startOfTodayUtc() {
  const now =
    new Date();

  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
}


function batchSearchText(
  row: BatchRow
) {
  return [
    row.course_name,
    row.course_code,
    row.batch_code,
    row.location,
    row.mode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}


function capacityStatusLabel(
  value: string
) {
  if (
    value ===
    'demand_exceeds_open_seats'
  ) {
    return 'Demand > seats';
  }

  if (
    value ===
    'payment_pressure'
  ) {
    return 'Payment pressure';
  }

  if (
    value ===
    'capacity_not_set'
  ) {
    return 'Capacity not set';
  }

  return pretty(
    value
  );
}


function capacityTone(
  value: string
):
  | 'green'
  | 'red'
  | 'amber'
  | 'slate' {
  if (
    value ===
      'overbooked' ||
    value === 'full'
  ) {
    return 'red';
  }

  if (
    [
      'near_full',
      'payment_pressure',
      'demand_exceeds_open_seats',
    ].includes(value)
  ) {
    return 'amber';
  }

  if (
    value ===
    'capacity_not_set'
  ) {
    return 'slate';
  }

  return 'green';
}


function batchCardClass(
  row: BatchRow,
  status: string
) {
  if (
    row.active === false
  ) {
    return 'border-slate-200 bg-slate-50/80 opacity-80';
  }

  if (
    status ===
      'overbooked' ||
    status === 'full'
  ) {
    return 'border-red-200 bg-red-50/35';
  }

  if (
    [
      'near_full',
      'payment_pressure',
      'demand_exceeds_open_seats',
    ].includes(status)
  ) {
    return 'border-amber-200 bg-amber-50/30';
  }

  return 'border-slate-100 bg-white';
}


function progressClass(
  status: string
) {
  if (
    status ===
      'overbooked' ||
    status === 'full'
  ) {
    return 'bg-red-500';
  }

  if (
    [
      'near_full',
      'payment_pressure',
      'demand_exceeds_open_seats',
    ].includes(status)
  ) {
    return 'bg-amber-500';
  }

  return 'bg-emerald-500';
}


function courseManagementHref({
  q,
  location,
  state,
}: {
  q?: string;
  location?: string;
  state?: string;
}) {
  const params =
    new URLSearchParams();

  if (q) {
    params.set(
      'q',
      q
    );
  }

  if (
    location &&
    location !== 'all'
  ) {
    params.set(
      'location',
      location
    );
  }

  if (
    state &&
    state !== 'upcoming'
  ) {
    params.set(
      'state',
      state
    );
  }

  const query =
    params.toString();

  return query
    ? `/course-management?${query}`
    : '/course-management';
}


function noticeText(
  notice: string
) {
  if (
    notice ===
    'batch-updated'
  ) {
    return 'Batch capacity, accommodation and commercial settings updated.';
  }

  if (
    notice ===
    'enrollment-closed'
  ) {
    return 'Enrollment closed for this batch.';
  }

  if (
    notice ===
    'enrollment-reopened'
  ) {
    return 'Enrollment reopened for this batch.';
  }

  if (
    notice ===
    'batch-activated'
  ) {
    return 'Batch activated.';
  }

  if (
    notice ===
    'batch-deactivated'
  ) {
    return 'Batch deactivated. Historical lead links are preserved.';
  }

  if (
    notice ===
    'accommodation-created'
  ) {
    return 'Accommodation type added to the batch.';
  }

  if (
    notice ===
    'accommodation-updated'
  ) {
    return 'Accommodation inventory updated.';
  }

  if (
    notice ===
    'accommodation-availability-updated'
  ) {
    return 'Accommodation availability updated.';
  }

  if (
    notice ===
    'accommodation-activated'
  ) {
    return 'Accommodation type enabled.';
  }

  if (
    notice ===
    'accommodation-deactivated'
  ) {
    return 'Accommodation type disabled. Historical information is preserved.';
  }

  if (
    notice ===
    'student-accommodation-assigned'
  ) {
    return 'Student accommodation assignment saved.';
  }

  if (
    notice ===
    'student-accommodation-released'
  ) {
    return 'Student accommodation assignment released.';
  }

  if (
    notice ===
    'property-saved'
  ) {
    return 'Accommodation property saved.';
  }

  if (
    notice ===
    'room-saved'
  ) {
    return 'Physical room saved.';
  }

  if (
    notice ===
    'batch-room-saved'
  ) {
    return 'Physical room pool updated for this batch.';
  }

  if (
    notice ===
    'physical-room-assigned'
  ) {
    return 'Student physical room assignment saved.';
  }

  if (
    notice ===
    'physical-room-released'
  ) {
    return 'Student physical room assignment released.';
  }

  return 'Course management updated.';
}


function formatDateRange(
  start:
    | string
    | null,
  end:
    | string
    | null
) {
  if (!start) {
    return 'Dates not set';
  }

  const first =
    formatShortDate(
      start
    );

  if (
    !end ||
    end === start
  ) {
    return first;
  }

  return `${first} – ${formatShortDate(
    end
  )}`;
}


function formatShortDate(
  value: string
) {
  const date =
    new Date(
      `${value.slice(
        0,
        10
      )}T00:00:00Z`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }
  ).format(date);
}


function formatDateTime(
  value:
    | string
    | null
) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone:
        'Asia/Kolkata',
    }
  ).format(date);
}


function formatMoneyMaybe(
  value:
    | number
    | string
    | null,
  currency:
    | string
    | null
) {
  if (
    value == null ||
    !currency
  ) {
    return '—';
  }

  try {
    return new Intl.NumberFormat(
      currency.toUpperCase() ===
        'INR'
        ? 'en-IN'
        : 'en-US',
      {
        style:
          'currency',
        currency:
          currency.toUpperCase(),
        maximumFractionDigits:
          0,
      }
    ).format(
      toNumber(
        value
      )
    );
  } catch {
    return `${currency} ${toNumber(
      value
    )}`;
  }
}


function nullableNumber(
  value:
    | number
    | string
    | null
) {
  if (
    value == null ||
    value === ''
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}


function toNumber(
  value:
    | number
    | string
    | null
    | undefined
) {
  const number =
    Number(value ?? 0);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


function formatNumber(
  value:
    | number
    | string
    | null
    | undefined
) {
  return new Intl.NumberFormat(
    'en-IN',
    {
      maximumFractionDigits:
        0,
    }
  ).format(
    toNumber(
      value
    )
  );
}


function pretty(
  value: string
) {
  return value
    .replaceAll(
      '_',
      ' '
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}


function one(
  value:
    | string
    | string[]
    | undefined
) {
  if (
    Array.isArray(value)
  ) {
    return value[0] ?? '';
  }

  return value ?? '';
}
