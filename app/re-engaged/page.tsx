import type { ReactNode } from "react";

import Link from "next/link";

import { ArrowRight, Flame, RefreshCw, Target, Users } from "lucide-react";

import { PageHeader } from "@/components/ui";

import { getReEngagedWorkspace } from "@/lib/reengaged-data";

type JourneyLeadRow = {
  lead_id: string;

  lead_code: string;

  lead_name: string;

  current_stage: string;

  lead_status: string;

  behaviour_temperature: string;

  engagement_score: number | string | null;

  behaviour_reason: string | null;

  total_sessions: number | string | null;

  sessions_before_lead: number | string | null;

  sessions_after_lead: number | string | null;

  sessions_7d: number | string | null;

  page_views_7d: number | string | null;

  high_intent_events_7d: number | string | null;

  conversion_visit_number: number | string | null;

  days_first_visit_to_lead: number | string | null;

  last_visit_at: string | null;

  last_session_source: string | null;

  last_session_medium: string | null;

  last_session_landing_page: string | null;

  is_reengaged: boolean | null;

  has_returned_after_becoming_lead: boolean | null;
};

type TemperatureSummaryRow = {
  behaviour_temperature: string;

  lead_count: number | string | null;

  reengaged_count: number | string | null;

  active_7d_count: number | string | null;

  avg_engagement_score: number | string | null;
};

type VisitDistributionRow = {
  visit_bucket: string;

  lead_count: number | string | null;

  avg_visit_number: number | string | null;

  avg_days_to_lead: number | string | null;
};

export default async function ReEngagedPage() {
  const workspace = await getReEngagedWorkspace();

  const { leads, summary, distribution } = workspace;

  const hot = summary.find((row) => row.behaviour_temperature === "hot");

  const warm = summary.find((row) => row.behaviour_temperature === "warm");

  const cold = summary.find((row) => row.behaviour_temperature === "cold");

  const closed = summary.find((row) => row.behaviour_temperature === "closed");

  return (
    <>
      <PageHeader
        title="Re-engaged Leads"
        description="Old and existing leads who have returned to the website, with behavioural temperature and repeat-visit intent signals."
      />

      {workspace.warning && (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          Re-engaged leads loaded through the legacy fallback.{" "}
          {workspace.warning}
        </div>
      )}

      <div
        className="

          mt-6

          grid

          gap-3

          sm:grid-cols-2

          xl:grid-cols-4

        "
      >
        <SummaryCard
          icon={<Flame size={18} />}
          label="Hot"
          value={formatNumber(hot?.lead_count)}
          sub={`${formatNumber(hot?.reengaged_count)} re-engaged`}
        />

        <SummaryCard
          icon={<Target size={18} />}
          label="Warm"
          value={formatNumber(warm?.lead_count)}
          sub={`${formatNumber(warm?.active_7d_count)} active in 7 days`}
        />

        <SummaryCard
          icon={<Users size={18} />}
          label="Cold"
          value={formatNumber(cold?.lead_count)}
          sub={`${formatNumber(cold?.reengaged_count)} re-engaged`}
        />

        <SummaryCard
          icon={<RefreshCw size={18} />}
          label="Closed"
          value={formatNumber(closed?.lead_count)}
          sub={`${formatNumber(closed?.reengaged_count)} showing activity`}
        />
      </div>

      <section className="card-pad mt-4">
        <div className="eyebrow">Conversion behaviour</div>

        <div className="section-title mt-1">
          How many visits happen before a lead converts?
        </div>

        <div
          className="

            mt-5

            grid

            gap-3

            sm:grid-cols-2

            xl:grid-cols-4

          "
        >
          {distribution.map((row) => (
            <div
              key={row.visit_bucket}
              className="

                  rounded-xl

                  border

                  border-slate-100

                  bg-slate-50

                  p-4

                "
            >
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {row.visit_bucket}
              </div>

              <div className="mt-2 text-2xl font-black text-slate-800">
                {formatNumber(row.lead_count)}
              </div>

              <div className="mt-2 text-xs leading-5 text-slate-500">
                Avg visit #
                {formatDecimal(
                  row.avg_visit_number,

                  1,
                )}
                {" · "}
                {formatDecimal(
                  row.avg_days_to_lead,

                  1,
                )}{" "}
                days to lead
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card-pad mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Priority queue</div>

            <div className="section-title mt-1">Leads active again</div>
          </div>

          <span
            className="

              rounded-full

              bg-slate-100

              px-3

              py-1.5

              text-xs

              font-bold

              text-slate-600

            "
          >
            {formatNumber(leads.length)} leads
          </span>
        </div>

        {leads.length === 0 ? (
          <div
            className="

              mt-5

              rounded-xl

              border

              border-dashed

              border-slate-200

              px-5

              py-12

              text-center

              text-sm

              text-slate-400

            "
          >
            No re-engaged leads currently match the rules.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">Lead</th>

                  <th className="px-3 py-3">Stage</th>

                  <th className="px-3 py-3">Temperature</th>

                  <th className="px-3 py-3 text-right">Score</th>

                  <th className="px-3 py-3 text-right">7d visits</th>

                  <th className="px-3 py-3 text-right">7d pages</th>

                  <th className="px-3 py-3">Last source</th>

                  <th className="px-3 py-3">Last visit</th>

                  <th className="px-3 py-3">Signal</th>

                  <th className="px-3 py-3" />
                </tr>
              </thead>

              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.lead_id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-800">
                        {lead.lead_name}
                      </div>

                      <div className="mt-0.5 text-xs text-slate-400">
                        {lead.lead_code}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-slate-600">
                      {pretty(lead.current_stage)}
                    </td>

                    <td className="px-3 py-3">
                      <TemperatureBadge value={lead.behaviour_temperature} />
                    </td>

                    <td className="px-3 py-3 text-right font-bold text-slate-800">
                      {formatNumber(lead.engagement_score)}
                    </td>

                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatNumber(lead.sessions_7d)}
                    </td>

                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatNumber(lead.page_views_7d)}
                    </td>

                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-700">
                        {pretty(lead.last_session_source || "Unknown")}
                      </div>

                      <div className="mt-0.5 text-xs text-slate-400">
                        {pretty(lead.last_session_medium || "Unknown")}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-slate-600">
                      {formatDateTime(lead.last_visit_at)}
                    </td>

                    <td className="max-w-[260px] px-3 py-3 text-xs leading-5 text-slate-500">
                      {lead.behaviour_reason || "—"}
                    </td>

                    <td className="px-3 py-3">
                      <Link
                        href={`/leads/${lead.lead_id}`}
                        className="

                            inline-flex

                            items-center

                            gap-1

                            font-bold

                            text-brand

                            hover:underline

                          "
                      >
                        Open
                        <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="

          mt-4

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
        Behaviour temperature does not change the CRM lifecycle stage. A Nurture
        or Lost lead can become Hot when website activity increases, giving
        admissions a reactivation signal without rewriting the sales history.
      </section>
    </>
  );
}

function SummaryCard({
  icon,

  label,

  value,

  sub,
}: {
  icon: ReactNode;

  label: string;

  value: string;

  sub: string;
}) {
  return (
    <div className="card-pad">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        {icon}

        {label}
      </div>

      <div className="mt-2 text-2xl font-black text-slate-800">{value}</div>

      <div className="mt-1 text-xs text-slate-400">{sub}</div>
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
