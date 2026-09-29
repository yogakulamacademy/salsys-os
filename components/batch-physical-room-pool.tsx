import {
  BedDouble,
  CheckCircle2,
  DoorOpen,
  Plus,
  Save,
  Undo2,
} from 'lucide-react';

import {
  assignEnrollmentPhysicalRoomAction,
  releaseEnrollmentPhysicalRoomAction,
  upsertBatchAccommodationRoomPoolAction,
} from '@/app/course-management/actions';

import type {
  AccommodationInventoryRow,
} from '@/components/batch-accommodation-inventory';
import type {
  AccommodationRoomRow,
} from '@/components/physical-room-master';


export type BatchPhysicalRoomInventoryRow = {
  room_pool_id: string;

  batch_id: string;
  batch_code: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;

  accommodation_type_id: string;
  accommodation_type_name: string;

  room_id: string;
  room_code: string;
  room_name: string | null;
  capacity_spaces: number | string | null;
  floor_or_area: string | null;
  operational_status: string;

  property_id: string;
  property_code: string;
  property_name: string;
  property_location: string | null;

  overlapping_assigned_spaces:
    | number
    | string
    | null;
  calculated_open_spaces:
    | number
    | string
    | null;
  this_batch_assigned_spaces:
    | number
    | string
    | null;

  pool_active: boolean | null;
  room_active: boolean | null;
  property_active: boolean | null;

  pool_notes: string | null;
  room_notes: string | null;

  sort_order: number | string | null;

  created_at: string | null;
  updated_at: string | null;
};


export type EnrollmentPhysicalRoomAssignmentRow = {
  room_assignment_id: string;

  enrollment_id: string;
  accommodation_assignment_id: string;

  batch_id: string;
  accommodation_type_id: string;
  room_id: string;

  occupant_spaces: number | string | null;
  room_assignment_status: string;
  assigned_at: string | null;
  released_at: string | null;
  notes: string | null;

  enrollment_status: string | null;

  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;

  batch_code: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;

  accommodation_type_name: string;

  room_code: string;
  room_name: string | null;
  capacity_spaces: number | string | null;
  floor_or_area: string | null;

  property_code: string;
  property_name: string;

  created_at: string | null;
  updated_at: string | null;
};


export function BatchPhysicalRoomPool({
  batchId,
  accommodationRows,
  roomMasterRows,
  poolRows,
  returnTo,
}: {
  batchId: string;
  accommodationRows: AccommodationInventoryRow[];
  roomMasterRows: AccommodationRoomRow[];
  poolRows: BatchPhysicalRoomInventoryRow[];
  returnTo: string;
}) {
  const roomTypes =
    accommodationRows.filter(
      (row) =>
        row.active !== false &&
        row.inventory_unit ===
          'room'
    );

  const availableMasterRooms =
    roomMasterRows.filter(
      (room) =>
        room.active !== false &&
        room.operational_status !==
          'out_of_service'
    );

  if (
    roomTypes.length ===
      0 &&
    poolRows.length ===
      0
  ) {
    return null;
  }

  const orderedPool =
    [...poolRows].sort(
      (a, b) =>
        toNumber(
          a.sort_order
        ) -
          toNumber(
            b.sort_order
          ) ||
        a.room_code.localeCompare(
          b.room_code
        )
    );

  return (
    <section className="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
            <DoorOpen
              size={15}
            />
            Physical room pool
          </div>

          <div className="mt-1 text-[11px] leading-5 text-slate-500">
            Choose which real rooms can be used by this batch. The same physical room can appear in overlapping batches, but assignment capacity is protected across dates.
          </div>
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5">
          <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">
            Rooms in pool
          </div>

          <div className="mt-0.5 text-xs font-black text-slate-800">
            {
              orderedPool.filter(
                (row) =>
                  row.pool_active !==
                  false
              ).length
            }
          </div>
        </div>
      </div>

      {orderedPool.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
          <div className="text-xs font-bold text-slate-600">
            No physical rooms added to this batch yet.
          </div>
          <div className="mt-1 text-[10px] leading-4 text-slate-400">
            Add rooms only after the physical room master has been created above.
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {orderedPool.map(
            (row) => (
              <RoomPoolCard
                key={
                  row.room_pool_id
                }
                row={row}
                accommodationRows={
                  roomTypes
                }
                roomMasterRows={
                  availableMasterRooms
                }
                returnTo={
                  returnTo
                }
              />
            )
          )}
        </div>
      )}

      {roomTypes.length >
        0 &&
        availableMasterRooms.length >
          0 && (
        <details className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-black text-slate-700">
            <Plus
              size={14}
            />
            Add room to batch pool
          </summary>

          <form
            action={
              upsertBatchAccommodationRoomPoolAction
            }
            className="grid gap-3 border-t border-slate-100 bg-white p-4 md:grid-cols-2 xl:grid-cols-4"
          >
            <input
              type="hidden"
              name="batch_id"
              value={batchId}
            />

            <input
              type="hidden"
              name="return_to"
              value={returnTo}
            />

            <label>
              <span className="field-label text-xs">
                Accommodation type
              </span>

              <select
                name="accommodation_type_id"
                className="input"
                required
                defaultValue=""
              >
                <option
                  value=""
                  disabled
                >
                  Select type
                </option>

                {roomTypes.map(
                  (type) => (
                    <option
                      key={
                        type.id
                      }
                      value={
                        type.id
                      }
                    >
                      {type.name}
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              <span className="field-label text-xs">
                Physical room
              </span>

              <select
                name="room_id"
                className="input"
                required
                defaultValue=""
              >
                <option
                  value=""
                  disabled
                >
                  Select room
                </option>

                {availableMasterRooms.map(
                  (room) => (
                    <option
                      key={
                        room.id
                      }
                      value={
                        room.id
                      }
                    >
                      {room.room_name ||
                        room.room_code}
                      {' · '}
                      {formatNumber(
                        room.capacity_spaces
                      )}{' '}
                      spaces
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              <span className="field-label text-xs">
                Notes
              </span>

              <input
                type="text"
                name="notes"
                className="input"
                placeholder="Optional"
              />
            </label>

            <label>
              <span className="field-label text-xs">
                Sort order
              </span>

              <input
                type="number"
                name="sort_order"
                min="0"
                defaultValue="0"
                className="input"
              />
            </label>

            <div className="md:col-span-2 xl:col-span-4 flex justify-end">
              <button
                type="submit"
                className="btn-primary"
              >
                <Plus
                  size={13}
                />
                Add room
              </button>
            </div>
          </form>
        </details>
      )}
    </section>
  );
}


function RoomPoolCard({
  row,
  accommodationRows,
  roomMasterRows,
  returnTo,
}: {
  row: BatchPhysicalRoomInventoryRow;
  accommodationRows: AccommodationInventoryRow[];
  roomMasterRows: AccommodationRoomRow[];
  returnTo: string;
}) {
  const active =
    row.pool_active !==
    false;

  return (
    <article
      className={`rounded-xl border p-4 ${
        active
          ? 'border-slate-100 bg-slate-50/50'
          : 'border-slate-200 bg-slate-50 opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-black text-slate-900">
              {row.room_name ||
                row.room_code}
            </div>

            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-500">
              {
                row.accommodation_type_name
              }
            </span>
          </div>

          <div className="mt-1 text-[10px] text-slate-400">
            {row.property_name}
            {' · '}
            {row.room_code}
            {row.floor_or_area
              ? ` · ${row.floor_or_area}`
              : ''}
          </div>
        </div>

        <span
          className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase ${
            row.operational_status ===
            'available'
              ? 'bg-emerald-100 text-emerald-700'
              : row.operational_status ===
                  'held'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-200 text-slate-600'
          }`}
        >
          {pretty(
            row.operational_status
          )}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PoolMetric
          label="Capacity"
          value={
            row.capacity_spaces
          }
        />

        <PoolMetric
          label="This batch"
          value={
            row.this_batch_assigned_spaces
          }
        />

        <PoolMetric
          label="Overlapping"
          value={
            row.overlapping_assigned_spaces
          }
        />

        <PoolMetric
          label="Open"
          value={
            row.calculated_open_spaces
          }
          alert={
            toNumber(
              row.calculated_open_spaces
            ) === 0
          }
        />
      </div>

      {row.pool_notes && (
        <div className="mt-3 rounded-lg bg-white px-3 py-2 text-[10px] leading-4 text-slate-500 ring-1 ring-black/5">
          {row.pool_notes}
        </div>
      )}

      <details className="mt-3 rounded-lg border border-slate-100 bg-white">
        <summary className="cursor-pointer list-none px-3 py-2 text-[10px] font-bold text-slate-500">
          Edit batch room
        </summary>

        <form
          action={
            upsertBatchAccommodationRoomPoolAction
          }
          className="grid gap-3 border-t border-slate-100 p-3 md:grid-cols-2"
        >
          <input
            type="hidden"
            name="id"
            value={
              row.room_pool_id
            }
          />

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

          <label>
            <span className="field-label text-xs">
              Accommodation type
            </span>

            <select
              name="accommodation_type_id"
              defaultValue={
                row.accommodation_type_id
              }
              className="input"
            >
              {accommodationRows.map(
                (type) => (
                  <option
                    key={
                      type.id
                    }
                    value={
                      type.id
                    }
                  >
                    {type.name}
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            <span className="field-label text-xs">
              Physical room
            </span>

            <select
              name="room_id"
              defaultValue={
                row.room_id
              }
              className="input"
            >
              {roomMasterRows.map(
                (room) => (
                  <option
                    key={
                      room.id
                    }
                    value={
                      room.id
                    }
                  >
                    {room.room_name ||
                      room.room_code}
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            <span className="field-label text-xs">
              Notes
            </span>

            <input
              type="text"
              name="notes"
              defaultValue={
                row.pool_notes ||
                ''
              }
              className="input"
            />
          </label>

          <label>
            <span className="field-label text-xs">
              Sort order
            </span>

            <input
              type="number"
              name="sort_order"
              min="0"
              defaultValue={String(
                toNumber(
                  row.sort_order
                )
              )}
              className="input"
            />
          </label>

          <label className="md:col-span-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              name="active"
              defaultChecked={
                active
              }
            />
            Active in this batch
          </label>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="btn-secondary"
            >
              <Save
                size={13}
              />
              Save batch room
            </button>
          </div>
        </form>
      </details>
    </article>
  );
}


export function StudentPhysicalRoomAssignment({
  enrollmentId,
  accommodationTypeId,
  accommodationName,
  currentRoom,
  poolRows,
  returnTo,
}: {
  enrollmentId: string;
  accommodationTypeId: string | null;
  accommodationName: string | null;
  currentRoom:
    | EnrollmentPhysicalRoomAssignmentRow
    | null;
  poolRows: BatchPhysicalRoomInventoryRow[];
  returnTo: string;
}) {
  if (!accommodationTypeId) {
    return null;
  }

  const eligible =
    poolRows.filter(
      (room) =>
        room.pool_active !==
          false &&
        room.room_active !==
          false &&
        room.property_active !==
          false &&
        room.accommodation_type_id ===
          accommodationTypeId
    );

  return (
    <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
          <BedDouble
            size={12}
          />
          Physical room
        </div>

        {currentRoom && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
            {currentRoom.room_name ||
              currentRoom.room_code}
          </span>
        )}
      </div>

      {eligible.length ===
      0 ? (
        <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-700">
          No physical rooms are currently in the batch pool for {accommodationName || 'this accommodation type'}.
        </div>
      ) : (
        <form
          action={
            assignEnrollmentPhysicalRoomAction
          }
          className="mt-2 grid gap-2 md:grid-cols-[minmax(180px,1fr)_90px_120px_minmax(160px,1fr)_auto]"
        >
          <input
            type="hidden"
            name="enrollment_id"
            value={
              enrollmentId
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
              Room
            </span>

            <select
              name="room_id"
              defaultValue={
                currentRoom?.room_id ||
                ''
              }
              className="input"
              required
            >
              <option
                value=""
                disabled
              >
                Select room
              </option>

              {eligible.map(
                (room) => (
                  <option
                    key={
                      room.room_pool_id
                    }
                    value={
                      room.room_id
                    }
                  >
                    {room.room_name ||
                      room.room_code}
                    {' · '}
                    {formatNumber(
                      room.calculated_open_spaces
                    )}{' '}
                    open
                  </option>
                )
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
              defaultValue={String(
                Math.max(
                  1,
                  toNumber(
                    currentRoom?.occupant_spaces
                  ) || 1
                )
              )}
              className="input"
            />
          </label>

          <label>
            <span className="field-label text-[10px]">
              Status
            </span>

            <select
              name="assignment_status"
              defaultValue={
                currentRoom?.room_assignment_status ===
                'confirmed'
                  ? 'confirmed'
                  : 'reserved'
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
                currentRoom?.notes ||
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
              {currentRoom ? (
                <>
                  <Save
                    size={12}
                  />
                  Update room
                </>
              ) : (
                <>
                  <CheckCircle2
                    size={12}
                  />
                  Assign room
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {currentRoom && (
        <form
          action={
            releaseEnrollmentPhysicalRoomAction
          }
          className="mt-2 flex justify-end"
        >
          <input
            type="hidden"
            name="enrollment_id"
            value={
              enrollmentId
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

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
          >
            <Undo2
              size={11}
            />
            Release physical room
          </button>
        </form>
      )}
    </div>
  );
}


function PoolMetric({
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
      className={`rounded-lg px-2.5 py-2 ${
        alert
          ? 'bg-red-50'
          : 'bg-white'
      }`}
    >
      <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">
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
      maximumFractionDigits: 0,
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
