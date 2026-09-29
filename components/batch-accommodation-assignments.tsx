import Link from 'next/link';
import {
  BedDouble,
  CheckCircle2,
  ExternalLink,
  Save,
  Undo2,
  UserRound,
  Users,
} from 'lucide-react';

import {
  assignEnrollmentAccommodationAction,
  releaseEnrollmentAccommodationAction,
} from '@/app/course-management/actions';

import type {
  AccommodationInventoryRow,
} from '@/components/batch-accommodation-inventory';
import {
  StudentPhysicalRoomAssignment,
  type BatchPhysicalRoomInventoryRow,
  type EnrollmentPhysicalRoomAssignmentRow,
} from '@/components/batch-physical-room-pool';


export type EnrollmentAccommodationRosterRow = {
  enrollment_id: string;
  lead_id: string;

  lead_code: string | null;
  lead_name: string | null;

  enrollment_status: string | null;
  total_value: number | string | null;
  currency: string | null;
  enrolled_at: string | null;
  enrollment_created_at: string | null;
  enrollment_updated_at: string | null;

  batch_id: string;
  batch_code: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;

  course_id: string | null;
  course_code: string | null;
  course_name: string | null;

  accommodation_assignment_id: string | null;
  accommodation_type_id: string | null;
  accommodation_name: string | null;
  occupant_spaces: number | string | null;
  accommodation_status: string | null;
  assigned_at: string | null;
  accommodation_notes: string | null;

  has_accommodation_assignment: boolean | null;
};


export function BatchAccommodationAssignments({
  rosterRows,
  accommodationRows,
  roomPoolRows,
  physicalRoomAssignments,
  returnTo,
}: {
  rosterRows: EnrollmentAccommodationRosterRow[];
  accommodationRows: AccommodationInventoryRow[];
  roomPoolRows: BatchPhysicalRoomInventoryRow[];
  physicalRoomAssignments: EnrollmentPhysicalRoomAssignmentRow[];
  returnTo: string;
}) {
  const operationalRows =
    rosterRows.filter(
      (row) =>
        row.enrollment_status !==
        'cancelled'
    );

  const assignedCount =
    operationalRows.filter(
      (row) =>
        Boolean(
          row.accommodation_assignment_id
        )
    ).length;

  const unassignedCount =
    operationalRows.length -
    assignedCount;

  const activeAccommodationTypes =
    accommodationRows.filter(
      (row) =>
        row.active !== false
    );

  if (
    operationalRows.length ===
      0 &&
    activeAccommodationTypes.length ===
      0
  ) {
    return null;
  }

  return (
    <section className="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
            <Users
              size={15}
            />
            Student accommodation
          </div>

          <div className="mt-1 text-[11px] leading-5 text-slate-500">
            Assign an enrolled student to a room or accommodation type.
            Calculated availability updates from active assignments.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <RosterSummary
            label="Enrollments"
            value={
              operationalRows.length
            }
          />

          <RosterSummary
            label="Assigned"
            value={
              assignedCount
            }
          />

          <RosterSummary
            label="Unassigned"
            value={
              unassignedCount
            }
            alert={
              unassignedCount > 0
            }
          />
        </div>
      </div>

      {operationalRows.length ===
      0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
          <div className="text-xs font-bold text-slate-600">
            No enrollment records for this batch yet.
          </div>

          <div className="mt-1 text-[10px] leading-4 text-slate-400">
            Students will appear here after an enrollment is linked to this batch.
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {operationalRows.map(
            (row) => (
              <EnrollmentAccommodationRow
                key={
                  row.enrollment_id
                }
                row={row}
                accommodationRows={
                  activeAccommodationTypes
                }
                roomPoolRows={
                  roomPoolRows
                }
                currentPhysicalRoom={
                  physicalRoomAssignments.find(
                    (assignment) =>
                      assignment.enrollment_id ===
                        row.enrollment_id &&
                      (
                        assignment.room_assignment_status ===
                          'reserved' ||
                        assignment.room_assignment_status ===
                          'confirmed'
                      )
                  ) ?? null
                }
                returnTo={
                  returnTo
                }
              />
            )
          )}
        </div>
      )}
    </section>
  );
}


function EnrollmentAccommodationRow({
  row,
  accommodationRows,
  roomPoolRows,
  currentPhysicalRoom,
  returnTo,
}: {
  row: EnrollmentAccommodationRosterRow;
  accommodationRows: AccommodationInventoryRow[];
  roomPoolRows: BatchPhysicalRoomInventoryRow[];
  currentPhysicalRoom:
    | EnrollmentPhysicalRoomAssignmentRow
    | null;
  returnTo: string;
}) {
  const assigned =
    Boolean(
      row.accommodation_assignment_id
    );

  const defaultStatus =
    row.accommodation_status ===
      'confirmed' ||
    row.enrollment_status ===
      'confirmed' ||
    row.enrollment_status ===
      'completed'
      ? 'confirmed'
      : 'reserved';

  const occupantSpaces =
    Math.max(
      1,
      toNumber(
        row.occupant_spaces
      ) || 1
    );

  return (
    <article className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-black text-slate-900">
              <UserRound
                size={14}
              />
              {row.lead_name ||
                row.lead_code ||
                'Student'}
            </div>

            <StatusBadge
              label={
                pretty(
                  row.enrollment_status ||
                    'pending'
                )
              }
              tone={
                enrollmentTone(
                  row.enrollment_status
                )
              }
            />

            {assigned ? (
              <StatusBadge
                label={
                  row.accommodation_status ===
                  'confirmed'
                    ? 'Room confirmed'
                    : 'Room reserved'
                }
                tone={
                  row.accommodation_status ===
                  'confirmed'
                    ? 'green'
                    : 'amber'
                }
              />
            ) : (
              <StatusBadge
                label="Room unassigned"
                tone="slate"
              />
            )}
          </div>

          <div className="mt-1 text-[10px] font-semibold text-slate-400">
            {row.lead_code ||
              'No lead code'}
            {row.enrolled_at
              ? ` · Enrolled ${formatDate(
                  row.enrolled_at
                )}`
              : ''}
          </div>
        </div>

        <Link
          href={`/leads/${row.lead_id}`}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-brand hover:underline"
        >
          Open lead
          <ExternalLink
            size={11}
          />
        </Link>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <InfoMetric
          label="Current type"
          value={
            row.accommodation_name ||
            'Not assigned'
          }
        />

        <InfoMetric
          label="Spaces"
          value={
            assigned
              ? formatNumber(
                  occupantSpaces
                )
              : '—'
          }
        />

        <InfoMetric
          label="Assigned"
          value={
            row.assigned_at
              ? formatDate(
                  row.assigned_at
                )
              : '—'
          }
        />
      </div>

      {row.accommodation_notes && (
        <div className="mt-3 rounded-lg bg-white px-3 py-2 text-[10px] leading-4 text-slate-500 ring-1 ring-black/5">
          {row.accommodation_notes}
        </div>
      )}

      {accommodationRows.length ===
      0 ? (
        <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-700">
          Add an active accommodation type above before assigning this student.
        </div>
      ) : (
        <form
          action={
            assignEnrollmentAccommodationAction
          }
          className="mt-3 grid gap-3 rounded-xl border border-slate-100 bg-white p-3 lg:grid-cols-[minmax(180px,1fr)_110px_130px_minmax(180px,1fr)_auto]"
        >
          <input
            type="hidden"
            name="enrollment_id"
            value={
              row.enrollment_id
            }
          />

          <input
            type="hidden"
            name="return_to"
            value={
              returnTo
            }
          />

          <label>
            <span className="field-label text-[10px]">
              Accommodation type
            </span>

            <select
              name="accommodation_type_id"
              defaultValue={
                row.accommodation_type_id ||
                ''
              }
              className="input"
              required
            >
              <option
                value=""
                disabled
              >
                Select type
              </option>

              {accommodationRows.map(
                (type) => {
                  const open =
                    calculatedOpen(
                      type
                    );

                  return (
                    <option
                      key={
                        type.id
                      }
                      value={
                        type.id
                      }
                    >
                      {type.name}
                      {' · '}
                      {formatNumber(
                        open
                      )}{' '}
                      open
                    </option>
                  );
                }
              )}
            </select>
          </label>

          <label>
            <span className="field-label text-[10px]">
              Spaces
            </span>

            <input
              type="number"
              name="occupant_spaces"
              min="1"
              defaultValue={
                occupantSpaces
              }
              className="input"
              required
            />
          </label>

          <label>
            <span className="field-label text-[10px]">
              Status
            </span>

            <select
              name="assignment_status"
              defaultValue={
                defaultStatus
              }
              className="input"
            >
              <option value="reserved">
                Reserved
              </option>
              <option value="confirmed">
                Confirmed
              </option>
            </select>
          </label>

          <label>
            <span className="field-label text-[10px]">
              Notes
            </span>

            <input
              type="text"
              name="notes"
              defaultValue={
                row.accommodation_notes ||
                ''
              }
              placeholder="Optional"
              className="input"
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className="btn-primary w-full justify-center"
            >
              {assigned ? (
                <>
                  <Save
                    size={13}
                  />
                  Update
                </>
              ) : (
                <>
                  <CheckCircle2
                    size={13}
                  />
                  Assign
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {assigned && (
        <StudentPhysicalRoomAssignment
          enrollmentId={
            row.enrollment_id
          }
          accommodationTypeId={
            row.accommodation_type_id
          }
          accommodationName={
            row.accommodation_name
          }
          currentRoom={
            currentPhysicalRoom
          }
          poolRows={
            roomPoolRows
          }
          returnTo={
            returnTo
          }
        />
      )}

      {assigned && (
        <form
          action={
            releaseEnrollmentAccommodationAction
          }
          className="mt-2 flex flex-wrap items-end justify-end gap-2"
        >
          <input
            type="hidden"
            name="enrollment_id"
            value={
              row.enrollment_id
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
            name="release_status"
            value="released"
          />

          <label className="min-w-[220px]">
            <span className="field-label text-[10px]">
              Release note
            </span>

            <input
              type="text"
              name="notes"
              placeholder="Optional reason"
              className="input"
            />
          </label>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
          >
            <Undo2
              size={13}
            />
            Release room
          </button>
        </form>
      )}
    </article>
  );
}


function RosterSummary({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-2.5 py-1.5 ${
        alert
          ? 'border-amber-100 bg-amber-50'
          : 'border-slate-100 bg-slate-50'
      }`}
    >
      <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div
        className={`mt-0.5 text-xs font-black ${
          alert
            ? 'text-amber-700'
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


function InfoMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-black/5">
      <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-0.5 truncate text-[11px] font-black text-slate-700">
        {value}
      </div>
    </div>
  );
}


function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone:
    | 'green'
    | 'amber'
    | 'red'
    | 'slate';
}) {
  const classes = {
    green:
      'bg-emerald-100 text-emerald-700',
    amber:
      'bg-amber-100 text-amber-700',
    red:
      'bg-red-100 text-red-700',
    slate:
      'bg-slate-100 text-slate-600',
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${classes[tone]}`}
    >
      {label}
    </span>
  );
}


function enrollmentTone(
  status:
    | string
    | null
):
  | 'green'
  | 'amber'
  | 'red'
  | 'slate' {
  if (
    status === 'confirmed' ||
    status === 'completed'
  ) {
    return 'green';
  }

  if (
    status === 'cancelled'
  ) {
    return 'red';
  }

  if (
    status === 'pending' ||
    status === 'deferred'
  ) {
    return 'amber';
  }

  return 'slate';
}


function calculatedOpen(
  row: AccommodationInventoryRow
) {
  if (
    row.calculated_available_student_spaces !=
    null
  ) {
    return toNumber(
      row.calculated_available_student_spaces
    );
  }

  if (
    row.available_student_spaces !=
    null
  ) {
    return toNumber(
      row.available_student_spaces
    );
  }

  return (
    toNumber(
      row.available_units
    ) *
    Math.max(
      1,
      toNumber(
        row.occupants_per_unit
      )
    )
  );
}


function formatDate(
  value: string
) {
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
      year: 'numeric',
      timeZone:
        'Asia/Kolkata',
    }
  ).format(date);
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
      maximumFractionDigits: 0,
    }
  ).format(
    toNumber(
      value
    )
  );
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
