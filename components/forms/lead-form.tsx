"use client";

import { useMemo, useState } from "react";

import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  MapPin,
  Monitor,
} from "lucide-react";

// import type { LeadDetail } from '@/types/crm';

import type {
  CourseBatchOption,
  CourseOption,
  EnrichedLeadDetail,
} from "@/lib/data";

// type LeadWithRevenue = LeadDetail & {

//   potentialValue?: number;

//   potentialCurrency?: string;

//   potentialValueSource?: string;

// };

const channels = [
  ["website", "Website"],

  ["instagram", "Instagram"],

  ["whatsapp", "WhatsApp"],

  ["email", "Email"],

  ["phone", "Phone"],

  ["meta_lead_form", "Meta Lead Form"],

  ["other", "Other"],
] as const;

/* =========================================================

   DATE HELPERS

\========================================================= */

function dateLabel(value?: string) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",

    month: "short",

    year: "numeric",
  }).format(date);
}

function monthLabel(value?: string) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    month: "long",

    year: "numeric",
  }).format(date);
}

/* =========================================================

   BATCH LABEL

\========================================================= */

function batchLabel(batch: CourseBatchOption) {
  const dates = batch.startDate
    ? `${dateLabel(batch.startDate)}${
        batch.endDate ? ` – ${dateLabel(batch.endDate)}` : ""
      }`
    : "Dates TBA";

  const place =
    batch.location || (batch.mode === "online" ? "Online" : "Location TBA");

  const time =
    batch.startTime && batch.endTime
      ? ` · ${batch.startTime.slice(0, 5)}–${batch.endTime.slice(0, 5)}`
      : "";

  return `${dates} · ${place}${time}`;
}

/* =========================================================

   MONEY

\========================================================= */

function moneyLabel(
  value?: number,

  currency?: string,
) {
  if (value == null || !currency) {
    return "Not configured";
  }

  const code = currency.toUpperCase();

  try {
    return new Intl.NumberFormat(
      code === "INR" ? "en-IN" : "en-US",

      {
        style: "currency",

        currency: code,

        maximumFractionDigits: 0,
      },
    ).format(value);
  } catch {
    return `${code} ${value}`;
  }
}

/* =========================================================

   MODE

\========================================================= */

function modeLabel(value?: string) {
  if (!value) return "—";

  return value

    .replaceAll("_", " ")

    .replace(
      /\b\w/g,

      (letter) => letter.toUpperCase(),
    );
}

/* =========================================================

   LEAD FORM

\========================================================= */

export function LeadForm({
  courses,

  batches,

  lead,

  action,

  submitLabel = "Save lead",
}: {
  courses: CourseOption[];

  batches: CourseBatchOption[];

  lead?: EnrichedLeadDetail;

  action: (formData: FormData) => void | Promise<void>;

  submitLabel?: string;
}) {
  /* =======================================================

     STATE

  ======================================================= */

  const [courseId, setCourseId] = useState(lead?.interestedCourseId ?? "");

  const [batchId, setBatchId] = useState(lead?.preferredBatchId ?? "");

  const [location, setLocation] = useState(
    lead?.location === "—" ? "" : (lead?.location ?? ""),
  );

  const [month, setMonth] = useState(lead?.preferredMonthRaw ?? "");

  const [mode, setMode] = useState(lead?.preferredMode?.toLowerCase() ?? "");

  const [timezone, setTimezone] = useState(lead?.timezone ?? "");

  /*

   \* Revenue value mode.

   \*

   \* batch_default =

   \* use course_batches.expected_value

   \*

   \* manual =

   \* admissions-entered scholarship /

   \* negotiated / custom value

   */

  const [potentialMode, setPotentialMode] = useState<
    "batch_default" | "manual"
  >(lead?.potentialValueSource === "manual" ? "manual" : "batch_default");

  const [manualPotentialValue, setManualPotentialValue] = useState(
    lead?.potentialValueSource === "manual" && lead?.potentialValue != null
      ? String(lead.potentialValue)
      : "",
  );

  const [manualCurrency, setManualCurrency] = useState(
    lead?.potentialValueSource === "manual"
      ? (lead?.potentialCurrency?.toUpperCase() ?? "")
      : "",
  );

  /* =======================================================

     FILTER BATCHES

  ======================================================= */

  const courseBatches = useMemo(
    () => batches.filter((batch) => !courseId || batch.courseId === courseId),

    [batches, courseId],
  );

  /* =======================================================

     SELECTED BATCH

  ======================================================= */

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === batchId),

    [batches, batchId],
  );

  /* =======================================================

     COURSE CHANGE

  ======================================================= */

  function selectCourse(nextCourseId: string) {
    setCourseId(nextCourseId);

    const existingBatch = batches.find((batch) => batch.id === batchId);

    /*

     \* If current batch belongs

     \* to another course, clear it.

     */

    if (existingBatch && existingBatch.courseId !== nextCourseId) {
      setBatchId("");

      setLocation("");

      setMonth("");

      setMode("");

      setTimezone("");
    }
  }

  /* =======================================================

     BATCH CHANGE

  ======================================================= */

  function selectBatch(nextBatchId: string) {
    setBatchId(nextBatchId);

    if (!nextBatchId) {
      return;
    }

    const batch = batches.find((item) => item.id === nextBatchId);

    if (!batch) {
      return;
    }

    /*

     \* Batch becomes source of truth

     \* for admissions preferences.

     */

    setCourseId(batch.courseId);

    if (batch.location) {
      setLocation(batch.location);
    }

    if (batch.startDate) {
      setMonth(
        batch.startDate.slice(
          0,

          7,
        ),
      );
    }

    if (batch.mode) {
      setMode(batch.mode);
    }

    if (batch.timezone) {
      setTimezone(batch.timezone);
    }
  }

  /* =======================================================

     MANUAL OVERRIDE

  ======================================================= */

  function activateManualValue() {
    setPotentialMode("manual");

    /*

     \* Start with the batch value so the

     \* user only needs to edit the amount.

     */

    if (!manualPotentialValue && selectedBatch?.expectedValue != null) {
      setManualPotentialValue(String(selectedBatch.expectedValue));
    }

    if (!manualCurrency && selectedBatch?.currency) {
      setManualCurrency(selectedBatch.currency.toUpperCase());
    }
  }

  function activateBatchDefault() {
    setPotentialMode("batch_default");
  }

  /* =======================================================

     FORM

  ======================================================= */

  return (
    <form action={action} className="space-y-5">
      {/* ===================================================

          CONTACT

      =================================================== */}

      <section className="card-pad">
        <div className="eyebrow">Lead identity</div>

        <div className="section-title mt-1">Contact details</div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field
            label="First name"
            name="first_name"
            required={!lead}
            defaultValue={lead?.firstName ?? lead?.name.split(" ")[0] ?? ""}
            disabled={Boolean(lead)}
            note={lead ? "Lead name is locked after creation." : undefined}
          />

          <Field
            label="Last name"
            name="last_name"
            defaultValue={
              lead?.lastName ??
              lead?.name

                .split(" ")

                .slice(1)

                .join(" ")
            }
            disabled={Boolean(lead)}
          />

          <Field
            label="Email"
            name="email"
            type="email"
            defaultValue={lead?.email}
            disabled={Boolean(lead)}
            note={
              lead
                ? "Contact editing will be added with identity deduplication."
                : undefined
            }
          />

          <Field
            label="Phone / WhatsApp"
            name="phone"
            defaultValue={lead?.phone}
            disabled={Boolean(lead)}
          />
        </div>
      </section>

      {/* ===================================================

          ADMISSIONS

      =================================================== */}

      <section className="card-pad">
        <div className="eyebrow">Admissions</div>

        <div className="section-title mt-1">Course & qualification</div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {/* COURSE */}

          <label className="block">
            <span className="field-label">Course</span>

            <select
              className="input"
              name="course_id"
              value={courseId}
              onChange={(event) => selectCourse(event.target.value)}
            >
              <option value="">Not selected</option>

              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>

          {/* BATCH */}

          <label className="block">
            <span className="field-label">Upcoming batch</span>

            <select
              className="input"
              name="preferred_batch_id"
              value={batchId}
              onChange={(event) => selectBatch(event.target.value)}
              disabled={!courseId}
            >
              <option value="">
                {courseId
                  ? "Not selected / custom preference"
                  : "Select a course first"}
              </option>

              {courseBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batchLabel(batch)}
                </option>
              ))}
            </select>

            {courseId && courseBatches.length === 0 && (
              <span className="mt-1 block text-xs text-slate-400">
                No active batches are stored for this course yet. You can still
                enter preferences manually.
              </span>
            )}

            {selectedBatch && (
              <span className="mt-1 block text-xs font-medium text-emerald-700">
                Batch selected: {selectedBatch.batchCode}
              </span>
            )}
          </label>
        </div>

        {/* =================================================

            BATCH INTELLIGENCE

        ================================================= */}

        {selectedBatch && (
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[.12em] text-emerald-700">
                  Automatic lead intelligence
                </div>

                <div className="mt-1 text-sm font-semibold text-slate-800">
                  These values are derived automatically from the selected
                  batch.
                </div>
              </div>

              <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-emerald-700">
                {selectedBatch.batchCode}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <BatchInfo
                icon={<MapPin size={15} />}
                label="Location"
                value={selectedBatch.location || "—"}
              />

              <BatchInfo
                icon={<CalendarDays size={15} />}
                label="Preferred month"
                value={monthLabel(selectedBatch.startDate)}
              />

              <BatchInfo
                icon={<Monitor size={15} />}
                label="Mode"
                value={modeLabel(selectedBatch.mode)}
              />

              <BatchInfo
                icon={<CircleDollarSign size={15} />}
                label="Batch default value"
                value={moneyLabel(
                  selectedBatch.expectedValue,

                  selectedBatch.currency,
                )}
              />

              <BatchInfo
                icon={<CalendarDays size={15} />}
                label="Expected close"
                value={
                  selectedBatch.startDate
                    ? dateLabel(selectedBatch.startDate)
                    : "—"
                }
              />

              <BatchInfo
                icon={<Clock3 size={15} />}
                label="Timezone"
                value={selectedBatch.timezone || "—"}
              />
            </div>

            {selectedBatch.expectedValue == null && (
              <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                This batch does not yet have a default revenue value. The lead
                will remain unvalued unless you use a manual override.
              </div>
            )}
          </div>
        )}

        {/* =================================================

            REVENUE VALUE

        ================================================= */}

        <div className="mt-5 rounded-2xl border border-slate-200 p-4">
          <div className="eyebrow">Revenue value</div>

          <div className="section-title mt-1">Potential lead value</div>

          <p className="mt-2 text-xs leading-5 text-slate-500">
            Use the standard batch value for normal enquiries. Use a manual
            override for scholarships, discounts, negotiated fees or special
            offers.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {/* BATCH DEFAULT */}

            <label
              className={`cursor-pointer rounded-xl border p-4 transition ${
                potentialMode === "batch_default"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  className="mt-1"
                  type="radio"
                  name="potential_value_mode"
                  value="batch_default"
                  checked={potentialMode === "batch_default"}
                  onChange={activateBatchDefault}
                />

                <div>
                  <div className="text-sm font-bold text-slate-800">
                    Batch default
                  </div>

                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    Automatically use the standard value configured for this
                    batch.
                  </div>

                  {selectedBatch ? (
                    <div className="mt-2 text-sm font-bold text-emerald-700">
                      {moneyLabel(
                        selectedBatch.expectedValue,

                        selectedBatch.currency,
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs font-medium text-slate-400">
                      Select a batch first
                    </div>
                  )}
                </div>
              </div>
            </label>

            {/* MANUAL */}

            <label
              className={`cursor-pointer rounded-xl border p-4 transition ${
                potentialMode === "manual"
                  ? "border-orange-200 bg-orange-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  className="mt-1"
                  type="radio"
                  name="potential_value_mode"
                  value="manual"
                  checked={potentialMode === "manual"}
                  onChange={activateManualValue}
                />

                <div>
                  <div className="text-sm font-bold text-slate-800">
                    Manual override
                  </div>

                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    Enter a custom potential value for this specific lead.
                  </div>

                  {potentialMode === "manual" && manualPotentialValue && (
                    <div className="mt-2 text-sm font-bold text-orange-700">
                      {moneyLabel(
                        Number(manualPotentialValue),

                        manualCurrency || undefined,
                      )}
                    </div>
                  )}
                </div>
              </div>
            </label>
          </div>

          {/* MANUAL VALUE INPUT */}

          {potentialMode === "manual" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_180px]">
              <label className="block">
                <span className="field-label">Potential value</span>

                <input
                  className="input"
                  name="potential_value"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={manualPotentialValue}
                  onChange={(event) =>
                    setManualPotentialValue(event.target.value)
                  }
                  placeholder="e.g. 1200"
                />
              </label>

              <label className="block">
                <span className="field-label">Currency</span>

                <select
                  className="input"
                  name="potential_currency"
                  required
                  value={manualCurrency}
                  onChange={(event) => setManualCurrency(event.target.value)}
                >
                  <option value="">Select</option>

                  <option value="USD">USD</option>

                  <option value="INR">INR</option>
                </select>
              </label>
            </div>
          )}

          {/* MANUAL WARNING */}

          {potentialMode === "manual" && (
            <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-700">
              Manual override is active. Future changes to the batch default
              value will not overwrite this lead's potential value.
            </div>
          )}

          {/* DEFAULT WITHOUT BATCH */}

          {potentialMode === "batch_default" && !selectedBatch && (
            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
              No batch is selected. This lead will remain unvalued unless you
              select a batch or use a manual override.
            </div>
          )}

          {/* RESET MESSAGE */}

          {lead?.potentialValueSource === "manual" &&
            potentialMode === "batch_default" && (
              <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
                Saving now will remove the existing manual override and restore
                the selected batch's default value.
              </div>
            )}
        </div>

        {/* =================================================

            PREFERENCES

        ================================================= */}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {/* LOCATION */}

          <label className="block">
            <span className="field-label">Preferred location</span>

            <input
              className="input"
              name="preferred_location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Mysore, Varkala, Online…"
              readOnly={Boolean(selectedBatch)}
            />

            {selectedBatch && (
              <span className="mt-1 block text-xs text-slate-400">
                Automatically controlled by the selected batch.
              </span>
            )}
          </label>

          {/* MONTH */}

          <label className="block">
            <span className="field-label">Preferred month</span>

            <input
              className="input"
              name="preferred_month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              readOnly={Boolean(selectedBatch)}
            />
          </label>

          {/* MODE */}

          <label className="block">
            <span className="field-label">Preferred mode</span>

            <select
              className="input"
              name="preferred_mode"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              disabled={Boolean(selectedBatch)}
            >
              <option value="">Not selected</option>

              <option value="residential">Residential</option>

              <option value="online">Online</option>

              <option value="non_residential">Non-residential</option>

              <option value="hybrid">Hybrid</option>
            </select>

            {/*

              Disabled form controls do not submit,

              so send mode using a hidden input

              whenever a batch controls the field.

            */}

            {selectedBatch && (
              <input type="hidden" name="preferred_mode" value={mode} />
            )}
          </label>

          {/* COUNTRY */}

          <Field
            label="Country"
            name="country"
            defaultValue={lead?.country === "—" ? "" : lead?.country}
          />

          {/* TIMEZONE */}

          <label className="block">
            <span className="field-label">Timezone</span>

            <input
              className="input"
              name="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Europe/Berlin"
            />
          </label>

          {/* INTENT */}

          {lead && (
            <label className="block">
              <span className="field-label">Intent</span>

              <select
                className="input"
                name="intent"
                defaultValue={lead.intent}
              >
                <option value="unknown">Unknown</option>

                <option value="low">Low</option>

                <option value="medium">Medium</option>

                <option value="high">High</option>

                <option value="very_high">Very high</option>
              </select>
            </label>
          )}

          {/* CONTACT CHANNEL */}

          <label className="block">
            <span className="field-label">Current contact channel</span>

            <select
              className="input"
              name="current_contact_channel"
              defaultValue={lead?.currentContactChannel ?? "website"}
            >
              {channels.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* ===================================================

          ATTRIBUTION

      =================================================== */}

      {!lead && (
        <section className="card-pad">
          <div className="eyebrow">Attribution</div>

          <div className="section-title mt-1">First touch</div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="field-label">Lead created through</span>

              <select
                className="input"
                name="lead_creation_channel"
                defaultValue="website"
              >
                {channels.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <Field
              label="First-touch source"
              name="first_touch_source"
              placeholder="Google Ads / Instagram Organic"
            />

            <Field
              label="First-touch medium"
              name="first_touch_medium"
              placeholder="CPC / Organic / Referral"
            />

            <Field
              label="First-touch campaign"
              name="first_touch_campaign"
              placeholder="200H Europe Search"
            />
          </div>
        </section>
      )}

      {/* ===================================================

          INTERNAL CONTEXT

      =================================================== */}

      <section className="card-pad">
        <div className="eyebrow">Internal context</div>

        <div className="section-title mt-1">Notes</div>

        {lead && (
          <label className="mt-5 block">
            <span className="field-label">CRM summary</span>

            <textarea
              className="input min-h-28 resize-y"
              name="summary"
              defaultValue={lead.summary}
            />
          </label>
        )}

        <label className="mt-4 block">
          <span className="field-label">Internal notes</span>

          <textarea
            className="input min-h-28 resize-y"
            name="notes"
            defaultValue={lead?.notes}
            placeholder="Context the admissions team should know…"
          />
        </label>
      </section>

      {/* ===================================================

          SAVE

      =================================================== */}

      <div className="flex justify-end">
        <button className="btn-primary" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

/* =========================================================

   BATCH INFO

\========================================================= */

function BatchInfo({
  icon,

  label,

  value,
}: {
  icon: React.ReactNode;

  label: string;

  value: string;
}) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        {icon}

        {label}
      </div>

      <div className="mt-1.5 text-sm font-bold text-slate-800">{value}</div>
    </div>
  );
}

/* =========================================================

   FIELD

\========================================================= */

function Field({
  label,

  name,

  type = "text",

  defaultValue,

  placeholder,

  required,

  disabled,

  note,
}: {
  label: string;

  name: string;

  type?: string;

  defaultValue?: string;

  placeholder?: string;

  required?: boolean;

  disabled?: boolean;

  note?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>

      <input
        className="input"
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />

      {note && (
        <span className="mt-1 block text-xs text-slate-400">{note}</span>
      )}
    </label>
  );
}
