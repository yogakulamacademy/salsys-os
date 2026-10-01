import type { ReactNode } from "react";

import {
  Activity,
  Clock3,
  Eye,
  Flame,
  MousePointerClick,
  Route,
  Target,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

type JourneyRow = {
  lead_id: string;

  current_stage: string;

  behaviour_temperature: string;

  engagement_score: number | string | null;

  behaviour_reason: string | null;

  total_sessions: number | string | null;

  sessions_before_lead: number | string | null;

  sessions_after_lead: number | string | null;

  sessions_7d: number | string | null;

  total_page_views: number | string | null;

  page_views_7d: number | string | null;

  conversion_visit_number: number | string | null;

  days_first_visit_to_lead: number | string | null;

  first_visit_at: string | null;

  last_visit_at: string | null;

  first_session_source: string | null;

  first_session_medium: string | null;

  first_session_landing_page: string | null;

  last_session_source: string | null;

  last_session_medium: string | null;

  last_session_landing_page: string | null;

  last_session_last_page: string | null;

  is_reengaged: boolean | null;

  has_returned_after_becoming_lead: boolean | null;
};

type SessionRow = {
  web_session_id: string;

  session_number: number | string;

  started_at: string;

  source: string | null;

  medium: string | null;

  campaign: string | null;

  landing_page: string | null;

  last_touch_page: string | null;

  page_views: number | string | null;

  high_intent_events: number | string | null;

  journey_phase: string;

  days_since_previous_session: number | string | null;
};

type ActivityRow = {
  id: string;

  web_session_id: string | null;

  event_type: string | null;

  source: string | null;

  medium: string | null;

  campaign_name: string | null;

  landing_page: string | null;

  occurred_at: string | null;
};

export async function LeadJourneyIntelligence({ leadId }: { leadId: string }) {
  const supabase = await createClient();

  const [journeyResult, sessionsResult, activityResult] = await Promise.all([
    supabase

      .from("v_lead_journey_intelligence")

      .select("*")

      .eq(
        "lead_id",

        leadId,
      )

      .maybeSingle(),

    supabase

      .from("v_lead_session_journey")

      .select(
        `

          web_session_id,

          session_number,

          started_at,

          source,

          medium,

          campaign,

          landing_page,

          last_touch_page,

          page_views,

          high_intent_events,

          journey_phase,

          days_since_previous_session

        `,
      )

      .eq(
        "lead_id",

        leadId,
      )

      .order(
        "started_at",

        {
          ascending: false,
        },
      )

      .limit(12),

    supabase

      .from("touchpoints")

      .select(
        `

          id,

          web_session_id,

          event_type,

          source,

          medium,

          campaign_name,

          landing_page,

          occurred_at

        `,
      )

      .eq(
        "lead_id",

        leadId,
      )

      .order(
        "occurred_at",

        {
          ascending: false,
        },
      )

      .limit(60),
  ]);

  if (journeyResult.error) {
    throw new Error(
      `Unable to load lead journey intelligence: ${journeyResult.error.message}`,
    );
  }

  if (sessionsResult.error) {
    throw new Error(
      `Unable to load lead journey sessions: ${sessionsResult.error.message}`,
    );
  }

  if (activityResult.error) {
    throw new Error(
      `Unable to load lead website activity: ${activityResult.error.message}`,
    );
  }

  const journey = journeyResult.data as JourneyRow | null;

  const sessions = (sessionsResult.data ?? []) as SessionRow[];

  const activities = (activityResult.data ?? []) as ActivityRow[];

  const sessionById = new Map(
    sessions.map((session) => [session.web_session_id, session]),
  );

  const reengagementSession =
    [...sessions]

      .sort((a, b) => timestamp(a.started_at) - timestamp(b.started_at))

      .find((session) =>
        String(session.journey_phase || "")
          .toLowerCase()

          .includes("reengag"),
      ) ?? null;

  const reengagedAt = reengagementSession?.started_at ?? null;

  const postReengagementActivities = reengagedAt
    ? activities.filter(
        (activity) => timestamp(activity.occurred_at) >= timestamp(reengagedAt),
      )
    : [];

  const pageViewCount = countEvents(
    activities,

    ["page_view", "page view", "pageview"],
  );

  const whatsappClickCount = countMatchingEvents(
    activities,

    (event) =>
      event.includes("whatsapp") &&
      (event.includes("click") || event.includes("cta")),
  );

  const formStartCount = countEvents(
    activities,

    ["form_start", "form start"],
  );

  const submitCount = countEvents(
    activities,

    ["form_submit", "form submit", "lead_form_submit", "lead form submit"],
  );

  if (!journey) {
    return null;
  }

  return (
    <section className="card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Journey intelligence</div>

          <div className="section-title mt-1">Website behaviour</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {journey.is_reengaged && (
            <span
              className="

                inline-flex

                rounded-full

                bg-violet-50

                px-2.5

                py-1

                text-xs

                font-bold

                text-violet-700

                ring-1

                ring-inset

                ring-violet-100

              "
            >
              Re-engaged
            </span>
          )}

          <TemperatureBadge value={journey.behaviour_temperature} />

          <span
            className="

              inline-flex

              rounded-full

              bg-slate-100

              px-2.5

              py-1

              text-xs

              font-bold

              text-slate-700

            "
          >
            Score {formatNumber(journey.engagement_score)}
            /100
          </span>
        </div>
      </div>

      <div
        className="

          mt-5

          grid

          gap-3

          sm:grid-cols-2

          lg:grid-cols-4

        "
      >
        <Metric
          icon={<Route size={16} />}
          label="Lifetime visits"
          value={formatNumber(journey.total_sessions)}
        />

        <Metric
          icon={<Target size={16} />}
          label="Visits before lead"
          value={formatNumber(journey.sessions_before_lead)}
        />

        <Metric
          icon={<MousePointerClick size={16} />}
          label="Visits after lead"
          value={formatNumber(journey.sessions_after_lead)}
        />

        <Metric
          icon={<Eye size={16} />}
          label="Page views · 7d"
          value={formatNumber(journey.page_views_7d)}
        />

        <Metric
          icon={<Clock3 size={16} />}
          label="Conversion visit"
          value={
            journey.conversion_visit_number
              ? `#${formatNumber(journey.conversion_visit_number)}`
              : "—"
          }
        />

        <Metric
          icon={<Clock3 size={16} />}
          label="Days to lead"
          value={
            journey.days_first_visit_to_lead == null
              ? "—"
              : formatDecimal(
                  journey.days_first_visit_to_lead,

                  1,
                )
          }
        />

        <Metric
          icon={<Flame size={16} />}
          label="Visits · 7d"
          value={formatNumber(journey.sessions_7d)}
        />

        <Metric
          icon={<Clock3 size={16} />}
          label="Last website visit"
          value={formatDateTime(journey.last_visit_at)}
        />
      </div>

      <div
        className="

          mt-5

          grid

          gap-3

          lg:grid-cols-2

        "
      >
        <SourceCard
          eyebrow="First website touch"
          source={journey.first_session_source}
          medium={journey.first_session_medium}
          page={journey.first_session_landing_page}
          time={journey.first_visit_at}
        />

        <SourceCard
          eyebrow="Latest website touch"
          source={journey.last_session_source}
          medium={journey.last_session_medium}
          page={
            journey.last_session_last_page || journey.last_session_landing_page
          }
          time={journey.last_visit_at}
        />
      </div>

      <div
        className="

          mt-5

          rounded-xl

          border

          border-slate-100

          bg-slate-50

          px-4

          py-3

          text-xs

          leading-5

          text-slate-500

        "
      >
        <strong className="font-bold text-slate-700">Current signal:</strong>{" "}
        {journey.behaviour_reason || "No recent signal"}.
        {journey.has_returned_after_becoming_lead
          ? " This lead has returned to the website after already entering the CRM."
          : ""}
      </div>

      <div className="mt-6 border-t border-slate-100 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Activity size={16} className="text-violet-500" />
              Tracked website activity
            </div>

            <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              Page visits and intent events linked to this CRM lead, matched
              back to the website session whenever a session ID is available.
            </div>
          </div>

          {journey.is_reengaged && (
            <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
              Re-engagement activity
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <ActivityMetric label="Tracked events" value={activities.length} />

          <ActivityMetric label="Page views" value={pageViewCount} />

          <ActivityMetric label="WhatsApp clicks" value={whatsappClickCount} />

          <ActivityMetric
            label="Form activity"
            value={formStartCount + submitCount}
          />

          <ActivityMetric
            label="After re-engagement"
            value={reengagedAt ? postReengagementActivities.length : null}
          />
        </div>

        {journey.is_reengaged && !reengagedAt && (
          <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
            This lead is flagged as re-engaged, but the current journey view
            does not expose a dedicated re-engagement session or timestamp.
            Recent linked events are still shown below; the exact before/after
            re-engagement split stays blank until that boundary is available.
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
          {activities.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              No linked website events are available yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {activities.slice(0, 30).map((activity) => {
                const session = activity.web_session_id
                  ? (sessionById.get(activity.web_session_id) ?? null)
                  : null;

                const isPostReengagement =
                  Boolean(reengagedAt) &&
                  timestamp(activity.occurred_at) >= timestamp(reengagedAt);

                return (
                  <div
                    key={activity.id}
                    className={
                      isPostReengagement
                        ? "bg-violet-50/30 px-4 py-3"
                        : "bg-white px-4 py-3"
                    }
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <EventBadge eventType={activity.event_type} />

                          {session && (
                            <span className="text-[10px] font-semibold text-slate-400">
                              Visit #{formatNumber(session.session_number)}
                              {" · "}
                              {pretty(session.journey_phase)}
                            </span>
                          )}

                          {isPostReengagement && (
                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                              After re-engagement
                            </span>
                          )}
                        </div>

                        {activity.landing_page && (
                          <div className="mt-2 break-all text-xs font-semibold text-slate-700">
                            {activity.landing_page}
                          </div>
                        )}

                        <div className="mt-1 text-[11px] text-slate-500">
                          {pretty(activity.source || "Unknown")}

                          {" / "}

                          {pretty(activity.medium || "Unknown")}

                          {activity.campaign_name
                            ? ` · ${activity.campaign_name}`
                            : ""}
                        </div>
                      </div>

                      <div className="shrink-0 text-[10px] text-slate-400">
                        {formatDateTime(activity.occurred_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="text-sm font-bold text-slate-800">
          Recent website sessions
        </div>

        <div className="mt-3 space-y-2">
          {sessions.length === 0 ? (
            <div
              className="

                rounded-xl

                border

                border-dashed

                border-slate-200

                px-4

                py-8

                text-center

                text-sm

                text-slate-400

              "
            >
              No linked website sessions yet.
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.web_session_id}
                className="

                    rounded-xl

                    border

                    border-slate-100

                    bg-white

                    p-3

                  "
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-800">
                        Visit #{formatNumber(session.session_number)}
                      </span>

                      <span
                        className="

                            rounded-full

                            bg-slate-100

                            px-2

                            py-0.5

                            text-[10px]

                            font-bold

                            uppercase

                            tracking-wide

                            text-slate-500

                          "
                      >
                        {pretty(session.journey_phase)}
                      </span>
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      {pretty(session.source || "Unknown")}

                      {" / "}

                      {pretty(session.medium || "Unknown")}

                      {session.campaign ? ` · ${session.campaign}` : ""}

                      {" · "}

                      {formatDateTime(session.started_at)}
                    </div>
                  </div>

                  <div className="flex gap-4 text-right text-xs">
                    <div>
                      <div className="font-bold text-slate-700">
                        {formatNumber(session.page_views)}
                      </div>

                      <div className="text-slate-400">pages</div>
                    </div>

                    <div>
                      <div className="font-bold text-slate-700">
                        {formatNumber(session.high_intent_events)}
                      </div>

                      <div className="text-slate-400">high intent</div>
                    </div>
                  </div>
                </div>

                {(session.last_touch_page || session.landing_page) && (
                  <div className="mt-2 truncate text-xs text-slate-400">
                    {session.last_touch_page || session.landing_page}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function ActivityMetric({
  label,

  value,
}: {
  label: string;

  value: number | null;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-1.5 text-lg font-bold text-slate-800">
        {value == null ? "—" : formatNumber(value)}
      </div>
    </div>
  );
}

function EventBadge({ eventType }: { eventType: string | null }) {
  const normalized = String(eventType || "activity").toLowerCase();

  const className = normalized.includes("whatsapp")
    ? "bg-emerald-50 text-emerald-700"
    : normalized.includes("form") || normalized.includes("submit")
      ? "bg-violet-50 text-violet-700"
      : normalized.includes("reservation") ||
          normalized.includes("payment") ||
          normalized.includes("pricing")
        ? "bg-orange-50 text-orange-700"
        : normalized.includes("page")
          ? "bg-sky-50 text-sky-700"
          : "bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${className}`}
    >
      {pretty(normalized)}
    </span>
  );
}

function eventKey(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()

    .replaceAll("-", "_");
}

function countEvents(
  activities: ActivityRow[],

  values: string[],
) {
  const needles = values.map((value) => eventKey(value));

  return activities.filter((activity) => {
    const key = eventKey(activity.event_type);

    return needles.some((needle) => key === needle || key.includes(needle));
  }).length;
}

function countMatchingEvents(
  activities: ActivityRow[],

  predicate: (event: string) => boolean,
) {
  return activities.filter((activity) =>
    predicate(eventKey(activity.event_type)),
  ).length;
}

function timestamp(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function Metric({
  icon,

  label,

  value,
}: {
  icon: ReactNode;

  label: string;

  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
        {icon}

        {label}
      </div>

      <div className="mt-1.5 text-base font-black text-slate-800">{value}</div>
    </div>
  );
}

function SourceCard({
  eyebrow,

  source,

  medium,

  page,

  time,
}: {
  eyebrow: string;

  source: string | null;

  medium: string | null;

  page: string | null;

  time: string | null;
}) {
  return (
    <div
      className="

        rounded-xl

        border

        border-slate-100

        bg-slate-50

        p-4

      "
    >
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {eyebrow}
      </div>

      <div className="mt-2 font-bold text-slate-800">
        {pretty(source || "Unknown")}

        {" / "}

        {pretty(medium || "Unknown")}
      </div>

      <div className="mt-1 truncate text-xs text-slate-500">
        {page || "No landing page captured"}
      </div>

      <div className="mt-2 text-[11px] text-slate-400">
        {formatDateTime(time)}
      </div>
    </div>
  );
}

function TemperatureBadge({ value }: { value: string }) {
  const normalized = String(value || "cold").toLowerCase();

  const className =
    normalized === "hot"
      ? "bg-rose-50 text-rose-700 ring-rose-100"
      : normalized === "warm"
        ? "bg-orange-50 text-orange-700 ring-orange-100"
        : normalized === "closed"
          ? "bg-slate-100 text-slate-600 ring-slate-200"
          : "bg-sky-50 text-sky-700 ring-sky-100";

  const emoji =
    normalized === "hot"
      ? "🔥"
      : normalized === "warm"
        ? "🟠"
        : normalized === "closed"
          ? "⚫"
          : "🔵";

  return (
    <span
      className={`

        inline-flex

        items-center

        gap-1.5

        rounded-full

        px-2.5

        py-1

        text-xs

        font-bold

        ring-1

        ring-inset

        ${className}

      `}
    >
      <span>{emoji}</span>

      {pretty(normalized)}
    </span>
  );
}

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat(
    "en-IN",

    {
      maximumFractionDigits: 0,
    },
  ).format(toNumber(value));
}

function formatDecimal(
  value: number | string | null | undefined,

  digits = 1,
) {
  return toNumber(value).toFixed(digits);
}

function formatDateTime(value: string | null | undefined) {
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

function pretty(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return String(value)
    .replaceAll(
      "_",

      " ",
    )

    .replace(
      /\b\w/g,

      (letter) => letter.toUpperCase(),
    );
}
