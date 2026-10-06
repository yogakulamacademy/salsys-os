import type { ReactNode } from "react";

import {
  BadgeDollarSign,
  CircleUserRound,
  ClipboardCheck,
  Globe2,
  MessageCircle,
  MessageSquareText,
  PhoneCall,
  Route,
} from "lucide-react";

import type { PersonJourneyEvent } from "@/lib/person-journey-data";

export function PersonJourneyTimeline({
  events,
  total,
}: {
  events: PersonJourneyEvent[];
  total: number;
}) {
  return (
    <section className="card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Journey</div>

          <div className="section-title mt-1">
            Customer timeline
          </div>

          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Canonical timeline across website activity, CRM changes, admissions
            contact, conversations, enrollment and payments.
          </p>
        </div>

        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {formatCount(total)} {total === 1 ? "event" : "events"}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
          No canonical journey events are available yet.
        </div>
      ) : (
        <div className="mt-6">
          {events.map((event, index) => {
            const presentation = getEventPresentation(event);
            const details = getEventDetails(event);

            return (
              <article
                key={event.journey_event_key}
                className="relative flex gap-4 pb-6 last:pb-0"
              >
                {index !== events.length - 1 && (
                  <div className="absolute left-[17px] top-9 h-[calc(100%-20px)] w-px bg-slate-200" />
                )}

                <div
                  className={`
                    relative
                    z-10
                    mt-0.5
                    flex
                    h-9
                    w-9
                    shrink-0
                    items-center
                    justify-center
                    rounded-full
                    border
                    ${presentation.iconClassName}
                  `}
                >
                  {presentation.icon}
                </div>

                <div className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-white px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`
                            inline-flex
                            rounded-full
                            px-2
                            py-0.5
                            text-[10px]
                            font-bold
                            uppercase
                            tracking-wide
                            ${presentation.badgeClassName}
                          `}
                        >
                          {presentation.label}
                        </span>

                        <span className="text-[10px] font-semibold text-slate-400">
                          {pretty(event.event_type)}
                        </span>
                      </div>

                      <div className="mt-2 text-sm font-bold text-slate-800">
                        {event.title || pretty(event.event_type)}
                      </div>

                      {event.summary && (
                        <div className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                          {event.summary}
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                        {event.channel && (
                          <span>
                            Channel{" "}
                            <strong className="font-semibold text-slate-600">
                              {pretty(event.channel)}
                            </strong>
                          </span>
                        )}

                        {event.source && (
                          <span>
                            Source{" "}
                            <strong className="font-semibold text-slate-600">
                              {pretty(event.source)}
                            </strong>
                          </span>
                        )}

                        {event.web_session_id && (
                          <span>
                            Website session linked
                          </span>
                        )}

                        {event.lead_id && (
                          <span>
                            CRM lead linked
                          </span>
                        )}
                      </div>

                      {details.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {details.map((detail) => (
                            <span
                              key={`${event.journey_event_key}-${detail.label}-${detail.value}`}
                              className="inline-flex max-w-full rounded-lg bg-slate-50 px-2.5 py-1 text-[10px] leading-4 text-slate-500"
                            >
                              <strong className="mr-1 font-semibold text-slate-600">
                                {detail.label}:
                              </strong>

                              <span className="truncate">
                                {detail.value}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <time
                      dateTime={event.event_at}
                      className="shrink-0 text-[10px] font-medium text-slate-400"
                    >
                      {formatDateTime(event.event_at)}
                    </time>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {total > events.length && (
        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
          Showing the most recent {formatCount(events.length)} of{" "}
          {formatCount(total)} journey events.
        </div>
      )}
    </section>
  );
}

function getEventPresentation(
  event: PersonJourneyEvent,
): {
  label: string;
  icon: ReactNode;
  iconClassName: string;
  badgeClassName: string;
} {
  const category = String(event.event_category || "").toLowerCase();
  const type = String(event.event_type || "").toLowerCase();

  if (category === "payment" || type.includes("payment")) {
    return {
      label: "Payment",
      icon: <BadgeDollarSign size={16} />,
      iconClassName:
        "border-amber-100 bg-amber-50 text-amber-700",
      badgeClassName:
        "bg-amber-50 text-amber-700",
    };
  }

  if (category === "enrollment" || type.includes("enrollment")) {
    return {
      label: "Enrollment",
      icon: <ClipboardCheck size={16} />,
      iconClassName:
        "border-emerald-100 bg-emerald-50 text-emerald-700",
      badgeClassName:
        "bg-emerald-50 text-emerald-700",
    };
  }

  if (category === "conversation") {
    if (type.includes("message")) {
      return {
        label: "Message",
        icon: <MessageSquareText size={16} />,
        iconClassName:
          "border-violet-100 bg-violet-50 text-violet-700",
        badgeClassName:
          "bg-violet-50 text-violet-700",
      };
    }

    return {
      label: "Conversation",
      icon: <MessageCircle size={16} />,
      iconClassName:
        "border-violet-100 bg-violet-50 text-violet-700",
      badgeClassName:
        "bg-violet-50 text-violet-700",
    };
  }

  if (category === "contact") {
    return {
      label: "Contact",
      icon: <PhoneCall size={16} />,
      iconClassName:
        "border-orange-100 bg-orange-50 text-orange-700",
      badgeClassName:
        "bg-orange-50 text-orange-700",
    };
  }

  if (category === "crm") {
    return {
      label: "CRM",
      icon: <CircleUserRound size={16} />,
      iconClassName:
        "border-slate-200 bg-slate-100 text-slate-700",
      badgeClassName:
        "bg-slate-100 text-slate-700",
    };
  }

  if (
    category === "digital" ||
    type.includes("page") ||
    type.includes("form") ||
    type.includes("click")
  ) {
    return {
      label: "Digital",
      icon: <Globe2 size={16} />,
      iconClassName:
        "border-sky-100 bg-sky-50 text-sky-700",
      badgeClassName:
        "bg-sky-50 text-sky-700",
    };
  }

  return {
    label: pretty(category || "Journey"),
    icon: <Route size={16} />,
    iconClassName:
      "border-slate-200 bg-slate-50 text-slate-600",
    badgeClassName:
      "bg-slate-100 text-slate-600",
  };
}

function getEventDetails(
  event: PersonJourneyEvent,
): Array<{
  label: string;
  value: string;
}> {
  const metadata = event.metadata;

  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const details: Array<{
    label: string;
    value: string;
  }> = [];

  pushDetail(details, "Page", metadata.landing_page);
  pushDetail(details, "Campaign", metadata.campaign);
  pushDetail(details, "Medium", metadata.medium);
  pushDetail(details, "Outcome", metadata.outcome);
  pushDetail(details, "Status", metadata.status);
  pushDetail(details, "Stage", metadata.to_stage);

  if (
    metadata.amount != null &&
    metadata.currency != null
  ) {
    const amount = formatMoney(
      metadata.amount,
      metadata.currency,
    );

    if (amount) {
      details.push({
        label: "Amount",
        value: amount,
      });
    }
  }

  return details.slice(0, 4);
}

function pushDetail(
  details: Array<{
    label: string;
    value: string;
  }>,
  label: string,
  value: unknown,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return;
  }

  details.push({
    label,
    value: String(value),
  });
}

function formatMoney(
  amount: unknown,
  currency: unknown,
) {
  const parsed = Number(amount);
  const code = String(currency ?? "")
    .trim()
    .toUpperCase();

  if (!code) {
    return "";
  }

  if (!Number.isFinite(parsed)) {
    return `${code} ${String(amount ?? "")}`.trim();
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
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    },
  ).format(date);
}

function pretty(
  value: string | null | undefined,
) {
  if (!value) {
    return "—";
  }

  return String(value)
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(
      /\b\w/g,
      (letter) => letter.toUpperCase(),
    );
}
