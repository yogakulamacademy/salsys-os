import type { ReactNode } from "react";

import {
  CircleDollarSign,
  Clock3,
  MessageCircle,
  MessageSquare,
  MousePointerClick,
  Route,
} from "lucide-react";

import type { Person360Summary } from "@/lib/person-journey-data";

export function Person360SummaryCard({
  person,
}: {
  person: Person360Summary | null;
}) {
  if (!person) {
    return (
      <section className="card-pad">
        <div className="eyebrow">Person 360</div>
        <div className="section-title mt-1">Customer overview</div>

        <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
          No canonical Person record is linked to this lead yet.
        </div>
      </section>
    );
  }

  const lastActivityAt = latestTimestamp([
    person.last_touchpoint_at,
    person.last_session_at,
    person.last_message_at,
    person.last_conversation_activity_at,
    person.last_paid_at,
    person.last_contacted_at,
    person.last_inbound_at,
    person.last_outbound_at,
  ]);

  const paymentSummary = formatPaidAmounts(
    person.paid_amount_by_currency,
  );

  return (
    <section className="card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Person 360</div>

          <div className="section-title mt-1">
            Customer overview
          </div>

          <p className="mt-1 text-xs leading-5 text-slate-400">
            Canonical activity across identity, website, conversations and
            payments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {person.latest_lead_behaviour_temperature && (
            <span
              className={`
                inline-flex
                rounded-full
                px-2.5
                py-1
                text-[11px]
                font-bold
                ${temperatureClass(
                  person.latest_lead_behaviour_temperature,
                )}
              `}
            >
              {pretty(person.latest_lead_behaviour_temperature)}
            </span>
          )}

          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {formatCount(person.lead_count)}{" "}
            {Number(person.lead_count ?? 0) === 1 ? "lead" : "leads"}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryMetric
          icon={<Route size={16} />}
          label="Sessions"
          value={formatCount(person.session_count)}
          sub={`${formatCount(person.sessions_7d)} in last 7 days`}
        />

        <SummaryMetric
          icon={<MousePointerClick size={16} />}
          label="Touchpoints"
          value={formatCount(person.touchpoint_count)}
          sub={`${formatCount(person.high_intent_events_7d)} high-intent in 7 days`}
        />

        <SummaryMetric
          icon={<MessageCircle size={16} />}
          label="Conversations"
          value={formatCount(person.conversation_count)}
          sub={`${formatCount(person.message_count)} messages`}
        />

        <SummaryMetric
          icon={<MessageSquare size={16} />}
          label="Messages"
          value={formatCount(person.message_count)}
          sub={
            person.last_message_at
              ? `Last ${formatDateTime(person.last_message_at)}`
              : "No messages yet"
          }
        />

        <SummaryMetric
          icon={<CircleDollarSign size={16} />}
          label="Paid payments"
          value={formatCount(person.paid_payment_count)}
          sub={paymentSummary || "No paid amount recorded"}
        />

        <SummaryMetric
          icon={<Clock3 size={16} />}
          label="Last activity"
          value={lastActivityAt ? formatDateTime(lastActivityAt) : "—"}
          sub={
            person.latest_lead_behaviour_reason ||
            "No recent behavioral signal"
          }
        />
      </div>

      <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 md:grid-cols-3">
        <IdentityItem
          label="Email"
          value={person.primary_email || "Not captured"}
        />

        <IdentityItem
          label="Phone"
          value={person.primary_phone || "Not captured"}
        />

        <IdentityItem
          label="WhatsApp"
          value={person.primary_whatsapp || "Not captured"}
        />
      </div>
    </section>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </div>

      <div className="mt-2 text-xl font-black text-slate-800">
        {value}
      </div>

      <div className="mt-1 text-[11px] leading-5 text-slate-500">
        {sub}
      </div>
    </div>
  );
}

function IdentityItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-1 truncate text-sm font-semibold text-slate-700">
        {value}
      </div>
    </div>
  );
}

function formatCount(
  value: number | string | null | undefined,
) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 0,
      }).format(parsed)
    : "0";
}

function formatPaidAmounts(
  value: Record<string, number | string> | null,
) {
  if (!value) {
    return "";
  }

  const entries = Object.entries(value)
    .filter(([currency]) => currency.trim())
    .sort(([left], [right]) => left.localeCompare(right));

  if (entries.length === 0) {
    return "";
  }

  return entries
    .map(([currency, amount]) =>
      formatMoney(amount, currency),
    )
    .join(" · ");
}

function formatMoney(
  amount: number | string,
  currency: string,
) {
  const parsed = Number(amount);
  const code = currency.toUpperCase();

  if (!Number.isFinite(parsed)) {
    return `${code} ${amount}`;
  }

  try {
    return new Intl.NumberFormat(
      code === "INR" ? "en-IN" : "en-US",
      {
        style: "currency",
        currency: code,
        maximumFractionDigits: 0,
      },
    ).format(parsed);
  } catch {
    return `${code} ${parsed}`;
  }
}

function latestTimestamp(
  values: Array<string | null | undefined>,
) {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!value) {
      continue;
    }

    const parsed = new Date(value).getTime();

    if (Number.isFinite(parsed) && parsed > latestMs) {
      latest = value;
      latestMs = parsed;
    }
  }

  return latest;
}

function formatDateTime(
  value: string | null | undefined,
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    },
  ).format(date);
}

function temperatureClass(value: string) {
  const normalized = value.toLowerCase();

  if (normalized === "hot") {
    return "bg-rose-50 text-rose-700";
  }

  if (normalized === "warm") {
    return "bg-orange-50 text-orange-700";
  }

  if (normalized === "closed") {
    return "bg-slate-100 text-slate-600";
  }

  return "bg-sky-50 text-sky-700";
}

function pretty(
  value: string | null | undefined,
) {
  if (!value) {
    return "—";
  }

  return String(value)
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (letter) => letter.toUpperCase(),
    );
}
