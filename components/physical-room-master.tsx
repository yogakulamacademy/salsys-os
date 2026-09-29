import {
  Building2,
  DoorOpen,
  Plus,
  Save,
} from 'lucide-react';

import {
  upsertAccommodationPropertyAction,
  upsertAccommodationRoomAction,
} from '@/app/course-management/actions';


export type AccommodationPropertyRow = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  active: boolean | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};


export type AccommodationRoomRow = {
  id: string;
  property_id: string;
  room_code: string;
  room_name: string | null;
  capacity_spaces: number | string | null;
  floor_or_area: string | null;
  operational_status: string;
  active: boolean | null;
  notes: string | null;
  sort_order: number | string | null;
  created_at: string | null;
  updated_at: string | null;
};


export function PhysicalRoomMaster({
  properties,
  rooms,
  returnTo,
}: {
  properties: AccommodationPropertyRow[];
  rooms: AccommodationRoomRow[];
  returnTo: string;
}) {
  const activeProperties =
    properties.filter(
      (property) =>
        property.active !== false
    );

  return (
    <section className="card-pad mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">
            Accommodation master
          </div>

          <div className="section-title mt-1 flex items-center gap-2">
            <Building2
              size={17}
            />
            Properties & physical rooms
          </div>

          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Create each real venue and room once. Rooms can then be placed into one or more batch room pools without duplicating the physical inventory.
          </p>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-right">
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            Active inventory
          </div>
          <div className="mt-0.5 text-sm font-black text-slate-800">
            {activeProperties.length} properties ·{' '}
            {
              rooms.filter(
                (room) =>
                  room.active !== false
              ).length
            } rooms
          </div>
        </div>
      </div>

      <details className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-black text-slate-700">
          <Plus
            size={14}
          />
          Add property / venue
        </summary>

        <form
          action={
            upsertAccommodationPropertyAction
          }
          className="grid gap-3 border-t border-slate-100 bg-white p-4 md:grid-cols-2 xl:grid-cols-4"
        >
          <input
            type="hidden"
            name="return_to"
            value={returnTo}
          />

          <MasterField
            label="Property code"
            name="code"
            placeholder="e.g. MYS-CAUVERY"
            required
          />

          <MasterField
            label="Property name"
            name="name"
            placeholder="e.g. Cauvery Sannidhi"
            required
          />

          <MasterField
            label="Location"
            name="location"
            placeholder="Mysore"
          />

          <MasterField
            label="Notes"
            name="notes"
            placeholder="Optional"
          />

          <div className="md:col-span-2 xl:col-span-4 flex justify-end">
            <button
              type="submit"
              className="btn-primary"
            >
              <Plus
                size={14}
              />
              Add property
            </button>
          </div>
        </form>
      </details>

      {properties.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">
          Add your first property, then create its physical rooms.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {properties.map(
            (property) => {
              const propertyRooms =
                rooms
                  .filter(
                    (room) =>
                      room.property_id ===
                      property.id
                  )
                  .sort(
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
                <article
                  key={
                    property.id
                  }
                  className={`rounded-2xl border p-4 ${
                    property.active ===
                    false
                      ? 'border-slate-200 bg-slate-50 opacity-75'
                      : 'border-slate-100 bg-white'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Building2
                          size={14}
                          className="text-slate-400"
                        />
                        <div className="text-sm font-black text-slate-900">
                          {property.name}
                        </div>

                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-500">
                          {property.code}
                        </span>
                      </div>

                      <div className="mt-1 text-[10px] text-slate-400">
                        {property.location ||
                          'Location not set'}
                        {' · '}
                        {propertyRooms.length}{' '}
                        rooms
                      </div>
                    </div>

                    {property.active ===
                      false && (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase text-slate-500">
                        Inactive
                      </span>
                    )}
                  </div>

                  {property.notes && (
                    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500">
                      {property.notes}
                    </div>
                  )}

                  <div className="mt-4 space-y-2">
                    {propertyRooms.length ===
                    0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[10px] text-slate-400">
                        No rooms created for this property.
                      </div>
                    ) : (
                      propertyRooms.map(
                        (room) => (
                          <RoomRow
                            key={
                              room.id
                            }
                            room={
                              room
                            }
                            properties={
                              activeProperties
                            }
                            returnTo={
                              returnTo
                            }
                          />
                        )
                      )
                    )}
                  </div>

                  {property.active !==
                    false && (
                    <details className="mt-3 rounded-lg border border-dashed border-slate-200">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[10px] font-bold text-slate-600">
                        <Plus
                          size={12}
                        />
                        Add physical room
                      </summary>

                      <form
                        action={
                          upsertAccommodationRoomAction
                        }
                        className="grid gap-3 border-t border-slate-100 p-3 md:grid-cols-2"
                      >
                        <input
                          type="hidden"
                          name="property_id"
                          value={
                            property.id
                          }
                        />

                        <input
                          type="hidden"
                          name="return_to"
                          value={
                            returnTo
                          }
                        />

                        <MasterField
                          label="Room code"
                          name="room_code"
                          placeholder="GARDEN-01"
                          required
                        />

                        <MasterField
                          label="Room name"
                          name="room_name"
                          placeholder="Garden Room 01"
                        />

                        <MasterField
                          label="Student capacity"
                          name="capacity_spaces"
                          type="number"
                          min="1"
                          defaultValue="1"
                          required
                        />

                        <MasterField
                          label="Floor / area"
                          name="floor_or_area"
                          placeholder="Garden wing"
                        />

                        <label>
                          <span className="field-label text-xs">
                            Operational status
                          </span>

                          <select
                            name="operational_status"
                            defaultValue="available"
                            className="input"
                          >
                            <option value="available">
                              Available
                            </option>
                            <option value="held">
                              Held
                            </option>
                            <option value="maintenance">
                              Maintenance
                            </option>
                            <option value="out_of_service">
                              Out of service
                            </option>
                          </select>
                        </label>

                        <MasterField
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
                            className="input"
                            placeholder="Optional room notes"
                          />
                        </label>

                        <div className="md:col-span-2 flex justify-end">
                          <button
                            type="submit"
                            className="btn-primary"
                          >
                            <DoorOpen
                              size={13}
                            />
                            Add room
                          </button>
                        </div>
                      </form>
                    </details>
                  )}

                  <details className="mt-3 rounded-lg border border-slate-100">
                    <summary className="cursor-pointer list-none px-3 py-2 text-[10px] font-bold text-slate-500">
                      Edit property
                    </summary>

                    <form
                      action={
                        upsertAccommodationPropertyAction
                      }
                      className="grid gap-3 border-t border-slate-100 p-3 md:grid-cols-2"
                    >
                      <input
                        type="hidden"
                        name="id"
                        value={
                          property.id
                        }
                      />

                      <input
                        type="hidden"
                        name="return_to"
                        value={
                          returnTo
                        }
                      />

                      <MasterField
                        label="Property code"
                        name="code"
                        defaultValue={
                          property.code
                        }
                        required
                      />

                      <MasterField
                        label="Property name"
                        name="name"
                        defaultValue={
                          property.name
                        }
                        required
                      />

                      <MasterField
                        label="Location"
                        name="location"
                        defaultValue={
                          property.location ||
                          ''
                        }
                      />

                      <MasterField
                        label="Notes"
                        name="notes"
                        defaultValue={
                          property.notes ||
                          ''
                        }
                      />

                      <label className="md:col-span-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={
                            property.active !==
                            false
                          }
                        />
                        Property active
                      </label>

                      <div className="md:col-span-2 flex justify-end">
                        <button
                          type="submit"
                          className="btn-secondary"
                        >
                          <Save
                            size={13}
                          />
                          Save property
                        </button>
                      </div>
                    </form>
                  </details>
                </article>
              );
            }
          )}
        </div>
      )}
    </section>
  );
}


function RoomRow({
  room,
  properties,
  returnTo,
}: {
  room: AccommodationRoomRow;
  properties: AccommodationPropertyRow[];
  returnTo: string;
}) {
  return (
    <details className="rounded-lg border border-slate-100 bg-slate-50/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <DoorOpen
            size={13}
            className="shrink-0 text-slate-400"
          />

          <div className="min-w-0">
            <div className="truncate text-[11px] font-black text-slate-700">
              {room.room_name ||
                room.room_code}
            </div>

            <div className="mt-0.5 text-[9px] text-slate-400">
              {room.room_code}
              {' · '}
              {formatNumber(
                room.capacity_spaces
              )}{' '}
              student spaces
              {room.floor_or_area
                ? ` · ${room.floor_or_area}`
                : ''}
            </div>
          </div>
        </div>

        <span
          className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase ${
            room.operational_status ===
            'available'
              ? 'bg-emerald-100 text-emerald-700'
              : room.operational_status ===
                  'held'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-200 text-slate-600'
          }`}
        >
          {pretty(
            room.operational_status
          )}
        </span>
      </summary>

      <form
        action={
          upsertAccommodationRoomAction
        }
        className="grid gap-3 border-t border-slate-100 bg-white p-3 md:grid-cols-2"
      >
        <input
          type="hidden"
          name="id"
          value={room.id}
        />

        <input
          type="hidden"
          name="return_to"
          value={returnTo}
        />

        <label>
          <span className="field-label text-xs">
            Property
          </span>

          <select
            name="property_id"
            defaultValue={
              room.property_id
            }
            className="input"
          >
            {properties.map(
              (property) => (
                <option
                  key={
                    property.id
                  }
                  value={
                    property.id
                  }
                >
                  {property.name}
                </option>
              )
            )}
          </select>
        </label>

        <MasterField
          label="Room code"
          name="room_code"
          defaultValue={
            room.room_code
          }
          required
        />

        <MasterField
          label="Room name"
          name="room_name"
          defaultValue={
            room.room_name ||
            ''
          }
        />

        <MasterField
          label="Student capacity"
          name="capacity_spaces"
          type="number"
          min="1"
          defaultValue={String(
            toNumber(
              room.capacity_spaces
            )
          )}
          required
        />

        <MasterField
          label="Floor / area"
          name="floor_or_area"
          defaultValue={
            room.floor_or_area ||
            ''
          }
        />

        <label>
          <span className="field-label text-xs">
            Operational status
          </span>

          <select
            name="operational_status"
            defaultValue={
              room.operational_status
            }
            className="input"
          >
            <option value="available">
              Available
            </option>
            <option value="held">
              Held
            </option>
            <option value="maintenance">
              Maintenance
            </option>
            <option value="out_of_service">
              Out of service
            </option>
          </select>
        </label>

        <MasterField
          label="Sort order"
          name="sort_order"
          type="number"
          min="0"
          defaultValue={String(
            toNumber(
              room.sort_order
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
              room.notes ||
              ''
            }
            className="input"
          />
        </label>

        <label className="md:col-span-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            name="active"
            defaultChecked={
              room.active !==
              false
            }
          />
          Room active
        </label>

        <div className="md:col-span-2 flex justify-end">
          <button
            type="submit"
            className="btn-secondary"
          >
            <Save
              size={13}
            />
            Save room
          </button>
        </div>
      </form>
    </details>
  );
}


function MasterField({
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
