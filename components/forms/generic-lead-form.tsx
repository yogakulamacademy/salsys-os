"use client";

import { useState } from "react";

import type { EnrichedLeadDetail } from "@/lib/data";

const channels = [
  ["website", "Website"],
  ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["meta_lead_form", "Meta Lead Form"],
  ["other", "Other"],
] as const;

type PotentialMode = "none" | "manual";

export function GenericLeadForm({
  lead,
  action,
  submitLabel = "Save lead",
}: {
  lead?: EnrichedLeadDetail;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel?: string;
}) {
  const hasExistingValue = lead?.potentialValue != null;
  const [potentialMode, setPotentialMode] = useState<PotentialMode>(
    hasExistingValue ? "manual" : "none",
  );
  const [potentialValue, setPotentialValue] = useState(
    hasExistingValue ? String(lead?.potentialValue ?? "") : "",
  );
  const [potentialCurrency, setPotentialCurrency] = useState(
    hasExistingValue ? (lead?.potentialCurrency?.toUpperCase() ?? "") : "",
  );

  return (
    <form action={action} className="space-y-5">
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
              lead?.lastName ?? lead?.name.split(" ").slice(1).join(" ")
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
                ? "Contact editing remains protected by identity-deduplication rules."
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

      <section className="card-pad">
        <div className="eyebrow">Commercial context</div>
        <div className="section-title mt-1">Lead qualification</div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field
            label="Country"
            name="country"
            defaultValue={lead?.country === "—" ? "" : lead?.country}
          />
          <Field
            label="Timezone"
            name="timezone"
            defaultValue={lead?.timezone}
            placeholder="Europe/Amsterdam"
          />

          {lead ? (
            <label className="block">
              <span className="field-label">Intent</span>
              <select className="input" name="intent" defaultValue={lead.intent}>
                <option value="unknown">Unknown</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="very_high">Very high</option>
              </select>
            </label>
          ) : null}

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

        <div className="mt-5 rounded-2xl border border-slate-200 p-4">
          <div className="eyebrow">Revenue value</div>
          <div className="section-title mt-1">Potential lead value</div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Keep the lead unvalued until there is enough commercial evidence, or
            enter a manual potential value for this opportunity.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label
              className={`cursor-pointer rounded-xl border p-4 transition ${
                potentialMode === "none"
                  ? "border-slate-300 bg-slate-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  className="mt-1"
                  type="radio"
                  name="potential_value_mode"
                  value="none"
                  checked={potentialMode === "none"}
                  onChange={() => setPotentialMode("none")}
                />
                <div>
                  <div className="text-sm font-bold text-slate-800">Not valued yet</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    Leave potential value empty until a commercial amount is known.
                  </div>
                </div>
              </div>
            </label>

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
                  onChange={() => setPotentialMode("manual")}
                />
                <div>
                  <div className="text-sm font-bold text-slate-800">Manual value</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    Record the current expected commercial value for this lead.
                  </div>
                </div>
              </div>
            </label>
          </div>

          {potentialMode === "manual" ? (
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
                  value={potentialValue}
                  onChange={(event) => setPotentialValue(event.target.value)}
                  placeholder="e.g. 1200"
                />
              </label>
              <label className="block">
                <span className="field-label">Currency</span>
                <select
                  className="input"
                  name="potential_currency"
                  required
                  value={potentialCurrency}
                  onChange={(event) => setPotentialCurrency(event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="USD">USD</option>
                  <option value="INR">INR</option>
                </select>
              </label>
            </div>
          ) : null}
        </div>
      </section>

      {!lead ? (
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
              placeholder="Google Ads / Referral / Organic"
            />
            <Field
              label="First-touch medium"
              name="first_touch_medium"
              placeholder="CPC / Organic / Referral"
            />
            <Field
              label="First-touch campaign"
              name="first_touch_campaign"
              placeholder="Campaign name"
            />
          </div>
        </section>
      ) : null}

      <section className="card-pad">
        <div className="eyebrow">Internal context</div>
        <div className="section-title mt-1">Notes</div>

        {lead ? (
          <label className="mt-5 block">
            <span className="field-label">CRM summary</span>
            <textarea
              className="input min-h-28 resize-y"
              name="summary"
              defaultValue={lead.summary}
            />
          </label>
        ) : null}

        <label className="mt-4 block">
          <span className="field-label">Internal notes</span>
          <textarea
            className="input min-h-28 resize-y"
            name="notes"
            defaultValue={lead?.notes}
            placeholder="Context the team should know…"
          />
        </label>
      </section>

      <div className="flex justify-end">
        <button className="btn-primary" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

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
      {note ? (
        <span className="mt-1 block text-xs text-slate-400">{note}</span>
      ) : null}
    </label>
  );
}
