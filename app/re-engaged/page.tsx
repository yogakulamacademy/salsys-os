
import Link from "next/link";

import { ArrowRight } from "lucide-react";

import { LeadJourneyIntelligence } from "@/components/lead-journey-intelligence";

import { PageHeader } from "@/components/ui";

import { ActNow, CameBack, FitBadge, InterestBadge, ReengageRules, TrackingCoverage, type ActNowLead } from "@/components/reengaged-act-now";
import { InterestProfileCard } from "@/components/interest-profile-card";
import { suggestNextStep } from "@/lib/interest-profile";
import { getReEngagedWorkspace } from "@/lib/reengaged-data";
import { getReEngagedIntelligence } from "@/lib/reengaged-intelligence-data";
import { getReengagedStory } from "@/lib/reengaged-story-data";
import { reengagedHeadline, summarise } from "@/lib/reengaged-story";
import { SmartReengagedBriefing } from "@/components/reengaged/smart-reengaged-briefing";

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

type SearchParams = {
  lead?: string | string[];

  view?: string | string[];
};

export default async function ReEngagedPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved = (await searchParams) ?? {};

  const selectedLeadId = one(resolved.lead);

  // Smart briefing (owner-approved mockup, 25 Nov 2026): managers and admins.
  const [workspace, story] = await Promise.all([getReEngagedWorkspace(), getReengagedStory()]);
  const storySummary = story ? summarise(story) : null;

  const { distribution } = workspace;

  // Interest profiles from website events and their own messages (last 30 days).
  const intelligence = await getReEngagedIntelligence(workspace.leads.map((lead) => lead.lead_id));
  const interestOf = (leadId: string) => intelligence.profiles.get(leadId)?.interestScore ?? -1;
  // Most interested first; the old engagement score breaks ties.
  const leads = [...workspace.leads].sort(
    (a, b) => interestOf(b.lead_id) - interestOf(a.lead_id) || toNumber(b.engagement_score) - toNumber(a.engagement_score),
  );
  const CLOSED_STAGES = new Set(["enrolled", "closed_won", "lost", "unqualified", "duplicate"]);
  const actNow: ActNowLead[] = leads
    .filter((lead) => !CLOSED_STAGES.has(String(lead.current_stage || "")))
    .map((lead) => ({ lead, profile: intelligence.profiles.get(lead.lead_id) }))
    .filter((row) => row.profile && row.profile.interestScore >= 35)
    .slice(0, 6)
    .map(({ lead, profile }) => ({
      leadId: lead.lead_id,
      name: lead.lead_name,
      stage: lead.current_stage,
      source: lead.last_session_source,
      personId: intelligence.personByLead.get(lead.lead_id) ?? null,
      profile: profile!,
      fit: intelligence.fit.get(lead.lead_id) ?? null,
    }));

  const selectedLead = selectedLeadId
    ? (leads.find((lead) => lead.lead_id === selectedLeadId) ?? null)
    : null;

  const requestedView = one(resolved.view);

  const activeView = ["all", "reengaged", "hot", "high_intent"].includes(
    requestedView,
  )
    ? requestedView
    : "all";

  const visibleLeads = leads.filter((lead) => {
    if (activeView === "reengaged") {
      return Boolean(lead.is_reengaged);
    }

    if (activeView === "hot") {
      // Hot or warm by the Interest score (the old temperature is no longer shown).
      return ["hot", "warm"].includes(intelligence.profiles.get(lead.lead_id)?.interestBand ?? "");
    }

    if (activeView === "high_intent") {
      return toNumber(lead.high_intent_events_7d) > 0;
    }

    return true;
  });

  return (
    <>
      <PageHeader
        title="Re-engaged"
        description={storySummary ? (
          <span className="text-[15px] leading-7 text-copy"><strong className="font-semibold text-copy-strong">{reengagedHeadline(storySummary)}</strong></span>
        ) : (
          <span className="text-[15px] leading-7 text-copy">
            {actNow.length ? (
              <>
                <strong className="font-semibold text-copy-strong">
                  {actNow.length} {actNow.length === 1 ? "person is" : "people are"} worth contacting right now
                </strong>
                : their visits and messages show interest. Draft a message on each card and send it from the Inbox.
              </>
            ) : (
              "Nobody stands out right now. People show here when their visits and messages show interest."
            )}
          </span>
        )}
      />

      {story && storySummary ? <div className="mt-4"><SmartReengagedBriefing data={story} s={storySummary} /></div> : null}

      {workspace.warning && (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          Lead activity workspace loaded through a compatibility fallback.{" "}
          {workspace.warning}
        </div>
      )}

      {intelligence.coverage ? (
        <TrackingCoverage linked={intelligence.coverage.linked} total={intelligence.coverage.total} />
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {actNow.length ? <ActNow leads={actNow} compact /> : (
            <section className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-[13px] text-copy-muted">
              Nobody stands out right now. Leads with an Interest score of 35 or more show here.
            </section>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <CameBack
            leads={leads
              .filter((lead) => Boolean(lead.is_reengaged))
              .slice(0, 5)
              .map((lead) => ({
                leadId: lead.lead_id,
                name: lead.lead_name || lead.lead_code,
                detail: `${pretty(lead.current_stage)} · back ${formatDateTime(lead.last_visit_at)}`,
              }))}
          />
          <ReengageRules />
        </div>
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
                {/* "Unknown" = no website visit before they became a lead (e.g. Instagram DMs);
                    their later visits made the old average negative ("-4.2 days"). */}
                {row.visit_bucket === "unknown" || Number(row.avg_days_to_lead) < 0
                  ? "No website visit before they became a lead"
                  : <>Avg visit #{formatDecimal(row.avg_visit_number, 1)} · {formatDecimal(row.avg_days_to_lead, 1)} days to lead</>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card-pad mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Behaviour intelligence</div>

            <div className="section-title mt-1">Recently active leads</div>
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
            {formatNumber(visibleLeads.length)} of {formatNumber(leads.length)}{" "}
            leads
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <ActivityViewTab
            href={activityViewHref("all")}
            active={activeView === "all"}
            label={`All active ${leads.length}`}
          />

          <ActivityViewTab
            href={activityViewHref("reengaged")}
            active={activeView === "reengaged"}
            label={`Re-engaged ${
              leads.filter((lead) => Boolean(lead.is_reengaged)).length
            }`}
          />

          <ActivityViewTab
            href={activityViewHref("hot")}
            active={activeView === "hot"}
            label={`Hot & warm ${
              leads.filter((lead) =>
                ["hot", "warm"].includes(intelligence.profiles.get(lead.lead_id)?.interestBand ?? ""),
              ).length
            }`}
          />

          <ActivityViewTab
            href={activityViewHref("high_intent")}
            active={activeView === "high_intent"}
            label={`High intent ${
              leads.filter((lead) => toNumber(lead.high_intent_events_7d) > 0)
                .length
            }`}
          />
        </div>

        {visibleLeads.length === 0 ? (
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
            No recently active leads match this view.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">Lead</th>

                  <th className="px-3 py-3">Stage</th>

                  <th className="px-3 py-3">Interest</th>

                  <th className="px-3 py-3 text-right">7d visits</th>

                  <th className="px-3 py-3 text-right">7d pages</th>

                  <th className="px-3 py-3">Last source</th>

                  <th className="px-3 py-3">Last visit</th>

                  <th className="px-3 py-3">Signal</th>

                  <th className="px-3 py-3" />
                </tr>
              </thead>

              <tbody>
                {visibleLeads.map((lead) => (
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
                      <span className="flex items-center gap-1.5">
                        <InterestBadge profile={intelligence.profiles.get(lead.lead_id)} />
                        <FitBadge fit={intelligence.fit.get(lead.lead_id)} />
                      </span>
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
                      {intelligence.profiles.get(lead.lead_id)?.reasons[0]?.text || lead.behaviour_reason || "—"}
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/re-engaged?view=${encodeURIComponent(
                            activeView,
                          )}&lead=${encodeURIComponent(lead.lead_id)}`}
                          className="inline-flex rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                        >
                          Activity
                        </Link>

                        <Link
                          href={`/leads/${lead.lead_id}`}
                          className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                        >
                          Open
                          <ArrowRight size={14} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedLead && (
        <>
          <Link
            href={activityViewHref(activeView)}
            aria-label="Close lead activity"
            className="fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-[1px]"
          />

          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[640px] overflow-y-auto border-l border-slate-200 bg-slate-50 shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="eyebrow">Re-engagement intelligence</div>

                  <div className="mt-1 truncate text-xl font-semibold text-slate-900">
                    {selectedLead.lead_name || selectedLead.lead_code || "Lead"}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{selectedLead.lead_code}</span>

                    <span>·</span>

                    <span>{pretty(selectedLead.current_stage)}</span>

                    <span>·</span>

                    <span>
                      Last visit {formatDateTime(selectedLead.last_visit_at)}
                    </span>
                  </div>
                </div>

                <Link
                  href={activityViewHref(activeView)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg text-slate-500 transition-colors hover:bg-slate-50"
                  aria-label="Close"
                >
                  ×
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <InterestBadge profile={intelligence.profiles.get(selectedLead.lead_id)} />

                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {formatNumber(selectedLead.sessions_after_lead)} post-lead
                  visits
                </span>
              </div>
            </div>

            <div className="space-y-4 p-4">
              {(() => {
                const profile = intelligence.profiles.get(selectedLead.lead_id);
                const step = profile ? suggestNextStep(profile) : null;
                return step ? (
                  <div className={`rounded-xl border px-4 py-3 text-sm ${step.needsPerson ? "border-amber-200 bg-amber-50 text-amber-800" : "border-violet-200 bg-violet-50 text-violet-900"}`}>
                    <div className="text-[10.5px] font-bold uppercase tracking-wide opacity-80">{step.needsPerson ? "For a person" : "Suggested next step"}</div>
                    <div className="mt-0.5 font-semibold">{step.action}</div>
                    <div className="mt-0.5 text-xs opacity-80">{step.why}</div>
                  </div>
                ) : null;
              })()}

              <InterestProfileCard profile={intelligence.profiles.get(selectedLead.lead_id) ?? null} />

              <LeadJourneyIntelligence leadId={selectedLead.lead_id} />

              <div className="grid gap-2 sm:grid-cols-2">
                <Link
                  href={`/conversations?lead=${selectedLead.lead_id}`}
                  className="btn-secondary justify-center"
                >
                  Open conversation
                </Link>

                <Link
                  href={`/leads/${selectedLead.lead_id}`}
                  className="btn-primary justify-center"
                >
                  Open full lead
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </aside>
        </>
      )}

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


function activityViewHref(view: string) {
  return view && view !== "all"
    ? `/re-engaged?view=${encodeURIComponent(view)}`
    : "/re-engaged";
}

function ActivityViewTab({
  href,

  active,

  label,
}: {
  href: string;

  active: boolean;

  label: string;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "inline-flex rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-100"
          : "inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
      }
    >
      {label}
    </Link>
  );
}

function one(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
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
