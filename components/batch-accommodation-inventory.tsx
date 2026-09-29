import {
  BedDouble,
  Boxes,
  PauseCircle,
  PlayCircle,
  Plus,
  Save,
  Users,
} from 'lucide-react';

import {
  setBatchAccommodationActiveStateAction,
  setBatchAccommodationAvailabilityAction,
  upsertBatchAccommodationTypeAction,
} from '@/app/course-management/actions';


export type AccommodationInventoryRow = {
  id: string;
  batch_id: string;

  batch_code: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;

  course_id: string;
  course_code: string | null;
  course_name: string | null;

  name: string;
  inventory_unit: string;
  total_units: number | string | null;
  available_units: number | string | null;
  occupants_per_unit: number | string | null;

  student_capacity: number | string | null;

  // Legacy/manual inventory view compatibility.
  available_student_spaces?: number | string | null;
  occupied_or_reserved_student_spaces?:
    | number
    | string
    | null;

  // Live assignment-aware inventory fields.
  manual_available_student_spaces?:
    | number
    | string
    | null;
  assigned_student_spaces?:
    | number
    | string
    | null;
  reserved_student_spaces?:
    | number
    | string
    | null;
  confirmed_student_spaces?:
    | number
    | string
    | null;
  active_assignments?:
    | number
    | string
    | null;
  calculated_available_student_spaces?:
    | number
    | string
    | null;

  notes: string | null;
  sort_order: number | string | null;
  active: boolean | null;

  created_at: string | null;
  updated_at: string | null;
};


export function BatchAccommodationInventory({
  batchId,
  rows,
  returnTo,
}: {
  batchId: string;
  rows: AccommodationInventoryRow[];
  returnTo: string;
}) {
  const ordered = [...rows].sort(
    (a, b) => {
      const orderDiff =
        toNumber(a.sort_order) -
        toNumber(b.sort_order);

      if (orderDiff !== 0) {
        return orderDiff;
      }

      return a.name.localeCompare(
        b.name
      );
    }
  );

  const activeRows =
    ordered.filter(
      (row) =>
        row.active !== false
    );

  const totalUnits =
    activeRows.reduce(
      (sum, row) =>
        sum +
        toNumber(
          row.total_units
        ),
      0
    );

  const availableUnits =
    activeRows.reduce(
      (sum, row) =>
        sum +
        toNumber(
          row.available_units
        ),
      0
    );

  const totalStudentCapacity =
    activeRows.reduce(
      (sum, row) =>
        sum +
        toNumber(
          row.student_capacity
        ),
      0
    );

  const availableStudentSpaces =
    activeRows.reduce(
      (sum, row) =>
        sum +
        calculatedOpen(
          row
        ),
      0
    );

  const assignedStudentSpaces =
    activeRows.reduce(
      (sum, row) =>
        sum +
        toNumber(
          row.assigned_student_spaces
        ),
      0
    );

  return (
    <section className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
            <BedDouble
              size={15}
            />
            Accommodation inventory
          </div>

          <div className="mt-1 text-[11px] leading-5 text-slate-500">
            Track room, bed or space availability by accommodation type.
            This does not change the course dates or website schedule.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <InventorySummary
            label="Types"
            value={activeRows.length}
          />
          <InventorySummary
            label="Units"
            value={totalUnits}
          />
          <InventorySummary
            label="Manual units"
            value={availableUnits}
          />
          <InventorySummary
            label="Assigned"
            value={assignedStudentSpaces}
          />
          <InventorySummary
            label="Calculated open"
            value={availableStudentSpaces}
            suffix={` / ${formatNumber(
              totalStudentCapacity
            )}`}
          />
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center">
          <div className="text-xs font-bold text-slate-600">
            No accommodation types added yet.
          </div>
          <div className="mt-1 text-[10px] leading-4 text-slate-400">
            Add Private, Twin Sharing, River View, Garden View or any custom type used for this batch.
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {ordered.map(
            (row) => (
              <AccommodationTypeCard
                key={row.id}
                row={row}
                returnTo={
                  returnTo
                }
              />
            )
          )}
        </div>
      )}

      <details className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-black text-slate-700">
          <Plus
            size={14}
          />
          Add accommodation type
        </summary>

        <form
          action={
            upsertBatchAccommodationTypeAction
          }
          className="border-t border-slate-100 p-4"
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

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AccommodationField
              label="Name"
              name="name"
              placeholder="e.g. Twin Sharing Garden View"
              required
            />

            <label>
              <span className="field-label text-xs">
                Inventory unit
              </span>

              <select
                name="inventory_unit"
                defaultValue="room"
                className="input"
              >
                <option value="room">
                  Room
                </option>
                <option value="bed">
                  Bed
                </option>
                <option value="space">
                  Space
                </option>
              </select>
            </label>

            <AccommodationField
              label="Total units"
              name="total_units"
              type="number"
              min="0"
              defaultValue="0"
              required
            />

            <AccommodationField
              label="Available units"
              name="available_units"
              type="number"
              min="0"
              defaultValue="0"
              required
            />

            <AccommodationField
              label="Occupants / unit"
              name="occupants_per_unit"
              type="number"
              min="1"
              defaultValue="1"
              required
            />

            <AccommodationField
              label="Sort order"
              name="sort_order"
              type="number"
              min="0"
              defaultValue="0"
            />

            <label className="md:col-span-2">
              <span className="field-label text-xs">
                Notes
              </span>

              <input
                type="text"
                name="notes"
                placeholder="e.g. Shared bathroom, river-facing rooms"
                className="input"
              />
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              className="btn-primary"
            >
              <Plus
                size={14}
              />
              Add type
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}


function AccommodationTypeCard({
  row,
  returnTo,
}: {
  row: AccommodationInventoryRow;
  returnTo: string;
}) {
  const active =
    row.active !== false;

  const totalUnits =
    toNumber(
      row.total_units
    );

  const availableUnits =
    toNumber(
      row.available_units
    );

  const occupantsPerUnit =
    Math.max(
      1,
      toNumber(
        row.occupants_per_unit
      )
    );

  const studentCapacity =
    toNumber(
      row.student_capacity
    );

  const availableSpaces =
    calculatedOpen(
      row
    );

  const assignedSpaces =
    toNumber(
      row.assigned_student_spaces
    );

  const manualStudentSpaces =
    row.manual_available_student_spaces !=
    null
      ? toNumber(
          row.manual_available_student_spaces
        )
      : availableUnits *
        occupantsPerUnit;

  return (
    <article
      className={`rounded-xl border bg-white p-4 ${
        active
          ? 'border-slate-100'
          : 'border-slate-200 opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-sm font-black text-slate-900">
              {row.name}
            </div>

            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-500">
              {pretty(
                row.inventory_unit
              )}
            </span>

            {!active && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-500">
                Inactive
              </span>
            )}
          </div>

          <div className="mt-1 text-[10px] text-slate-400">
            {formatNumber(
              occupantsPerUnit
            )}{' '}
            occupant
            {occupantsPerUnit === 1
              ? ''
              : 's'}{' '}
            per{' '}
            {row.inventory_unit}
          </div>
        </div>

        <form
          action={
            setBatchAccommodationActiveStateAction
          }
        >
          <input
            type="hidden"
            name="id"
            value={row.id}
          />
          <input
            type="hidden"
            name="batch_id"
            value={row.batch_id}
          />
          <input
            type="hidden"
            name="return_to"
            value={returnTo}
          />
          <input
            type="hidden"
            name="name"
            value={row.name}
          />
          <input
            type="hidden"
            name="inventory_unit"
            value={row.inventory_unit}
          />
          <input
            type="hidden"
            name="total_units"
            value={totalUnits}
          />
          <input
            type="hidden"
            name="available_units"
            value={availableUnits}
          />
          <input
            type="hidden"
            name="occupants_per_unit"
            value={occupantsPerUnit}
          />
          <input
            type="hidden"
            name="notes"
            value={row.notes ?? ''}
          />
          <input
            type="hidden"
            name="sort_order"
            value={toNumber(
              row.sort_order
            )}
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
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 hover:bg-slate-50"
          >
            {active ? (
              <>
                <PauseCircle
                  size={12}
                />
                Disable
              </>
            ) : (
              <>
                <PlayCircle
                  size={12}
                />
                Enable
              </>
            )}
          </button>
        </form>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <SmallMetric
          label="Total units"
          value={totalUnits}
        />
        <SmallMetric
          label="Manual open units"
          value={availableUnits}
        />
        <SmallMetric
          label="Student capacity"
          value={studentCapacity}
        />
        <SmallMetric
          label="Assigned"
          value={assignedSpaces}
        />
        <SmallMetric
          label="Calculated open"
          value={availableSpaces}
        />
        <SmallMetric
          label="Manual open spaces"
          value={manualStudentSpaces}
        />
      </div>

      <form
        action={
          setBatchAccommodationAvailabilityAction
        }
        className="mt-3 flex items-end gap-2"
      >
        <input
          type="hidden"
          name="id"
          value={row.id}
        />
        <input
          type="hidden"
          name="return_to"
          value={returnTo}
        />

        <label className="min-w-0 flex-1">
          <span className="field-label text-[10px]">
            Quick availability
          </span>

          <input
            type="number"
            name="available_units"
            min="0"
            max={String(
              totalUnits
            )}
            defaultValue={String(
              availableUnits
            )}
            className="input"
          />
        </label>

        <button
          type="submit"
          className="btn-secondary"
        >
          <Save
            size={13}
          />
          Update
        </button>
      </form>

      {row.notes && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500">
          {row.notes}
        </div>
      )}

      <details className="mt-3 rounded-lg border border-slate-100">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[10px] font-bold text-slate-500">
          <Boxes
            size={12}
          />
          Edit inventory type
        </summary>

        <form
          action={
            upsertBatchAccommodationTypeAction
          }
          className="border-t border-slate-100 p-3"
        >
          <input
            type="hidden"
            name="id"
            value={row.id}
          />
          <input
            type="hidden"
            name="batch_id"
            value={row.batch_id}
          />
          <input
            type="hidden"
            name="return_to"
            value={returnTo}
          />
          <input
            type="hidden"
            name="active"
            value={
              active
                ? 'true'
                : 'false'
            }
          />

          <div className="grid gap-3 md:grid-cols-2">
            <AccommodationField
              label="Name"
              name="name"
              defaultValue={row.name}
              required
            />

            <label>
              <span className="field-label text-xs">
                Inventory unit
              </span>

              <select
                name="inventory_unit"
                defaultValue={
                  row.inventory_unit
                }
                className="input"
              >
                <option value="room">
                  Room
                </option>
                <option value="bed">
                  Bed
                </option>
                <option value="space">
                  Space
                </option>
              </select>
            </label>

            <AccommodationField
              label="Total units"
              name="total_units"
              type="number"
              min="0"
              defaultValue={String(
                totalUnits
              )}
              required
            />

            <AccommodationField
              label="Available units"
              name="available_units"
              type="number"
              min="0"
              defaultValue={String(
                availableUnits
              )}
              required
            />

            <AccommodationField
              label="Occupants / unit"
              name="occupants_per_unit"
              type="number"
              min="1"
              defaultValue={String(
                occupantsPerUnit
              )}
              required
            />

            <AccommodationField
              label="Sort order"
              name="sort_order"
              type="number"
              min="0"
              defaultValue={String(
                toNumber(
                  row.sort_order
                )
              )}
            />

            <label className="md:col-span-2">
              <span className="field-label text-xs">
                Notes
              </span>

              <input
                type="text"
                name="notes"
                defaultValue={
                  row.notes ?? ''
                }
                className="input"
              />
            </label>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              className="btn-primary"
            >
              <Save
                size={13}
              />
              Save inventory
            </button>
          </div>
        </form>
      </details>
    </article>
  );
}


function AccommodationField({
  label,
  name,
  type = 'text',
  min,
  defaultValue,
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  min?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="field-label text-xs">
        {label}
      </span>

      <input
        type={type}
        name={name}
        min={min}
        defaultValue={
          defaultValue
        }
        placeholder={
          placeholder
        }
        required={
          required
        }
        className="input"
      />
    </label>
  );
}


function InventorySummary({
  label,
  value,
  suffix = '',
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-2.5 py-1.5">
      <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-black text-slate-800">
        {formatNumber(
          value
        )}
        {suffix}
      </div>
    </div>
  );
}


function SmallMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
      <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-black text-slate-800">
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
