import "server-only";

import { useMockData } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type Person360Summary = {
  person_id: string;
  organization_id: string;
  person_status: string | null;

  primary_email: string | null;
  primary_phone: string | null;
  primary_whatsapp: string | null;

  identifier_count: number | string | null;
  verified_identifier_count: number | string | null;

  lead_count: number | string | null;
  first_lead_at: string | null;
  latest_lead_at: string | null;

  latest_lead_id: string | null;
  latest_lead_code: string | null;
  latest_lead_name: string | null;

  current_stage: string | null;
  lead_status: string | null;
  intent: string | null;
  owner_user_id: string | null;

  next_followup_at: string | null;
  last_contacted_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;

  session_count: number | string | null;
  first_session_at: string | null;
  last_session_at: string | null;
  sessions_7d: number | string | null;
  sessions_30d: number | string | null;

  touchpoint_count: number | string | null;
  page_view_count: number | string | null;
  high_intent_events_7d: number | string | null;
  first_touchpoint_at: string | null;
  last_touchpoint_at: string | null;

  latest_lead_engagement_score: number | string | null;
  latest_lead_behaviour_temperature: string | null;
  latest_lead_behaviour_reason: string | null;

  conversation_count: number | string | null;
  message_count: number | string | null;
  last_conversation_activity_at: string | null;
  last_message_at: string | null;

  enrollment_count: number | string | null;
  confirmed_or_completed_enrollment_count: number | string | null;
  last_enrollment_at: string | null;

  payment_count: number | string | null;
  paid_payment_count: number | string | null;
  last_paid_at: string | null;
  paid_currency_count: number | string | null;
  paid_amount_by_currency: Record<string, number | string> | null;
};

export type PersonJourneyEvent = {
  organization_id: string;
  person_id: string;
  event_at: string;
  event_category: string;
  event_type: string;
  journey_event_key: string;
  source_table: string;
  source_record_id: string;
  lead_id: string | null;
  web_session_id: string | null;
  channel: string | null;
  source: string | null;
  title: string;
  summary: string | null;
  metadata: Record<string, unknown> | null;
};

export type PersonJourneyPayload = {
  organizationId: string | null;
  leadId: string;
  personId: string | null;
  person: Person360Summary | null;
  journey: PersonJourneyEvent[];
  journeyTotal: number;
};

/*
 * Do not select the three latest-lead journey fields from v_person_360 here.
 *
 * v_person_360 historically joined v_lead_journey_intelligence to populate
 * them. On a lead detail request, asking PostgREST for those columns forces the
 * planner through the full cross-lead journey aggregation and can exceed the
 * statement timeout as tracking data grows. The rest of Person 360 is cheap
 * when those columns are not projected.
 *
 * We load those three fields separately for the single latest lead below.
 */
const PERSON_360_SELECT = `
  person_id,
  organization_id,
  person_status,
  primary_email,
  primary_phone,
  primary_whatsapp,
  identifier_count,
  verified_identifier_count,
  lead_count,
  first_lead_at,
  latest_lead_at,
  latest_lead_id,
  latest_lead_code,
  latest_lead_name,
  current_stage,
  lead_status,
  intent,
  owner_user_id,
  next_followup_at,
  last_contacted_at,
  last_inbound_at,
  last_outbound_at,
  session_count,
  first_session_at,
  last_session_at,
  sessions_7d,
  sessions_30d,
  touchpoint_count,
  page_view_count,
  high_intent_events_7d,
  first_touchpoint_at,
  last_touchpoint_at,
  conversation_count,
  message_count,
  last_conversation_activity_at,
  last_message_at,
  enrollment_count,
  confirmed_or_completed_enrollment_count,
  last_enrollment_at,
  payment_count,
  paid_payment_count,
  last_paid_at,
  paid_currency_count,
  paid_amount_by_currency
`;

const PERSON_JOURNEY_SELECT = `
  organization_id,
  person_id,
  event_at,
  event_category,
  event_type,
  journey_event_key,
  source_table,
  source_record_id,
  lead_id,
  web_session_id,
  channel,
  source,
  title,
  summary,
  metadata
`;

export async function getPersonJourneyForLead(
  leadId: string,
  options?: {
    limit?: number;
  },
): Promise<PersonJourneyPayload> {
  const normalizedLeadId = String(leadId ?? "").trim();

  if (!normalizedLeadId) {
    throw new Error("A lead ID is required to load Person journey data.");
  }

  /*
   * Keep mock-mode behavior non-destructive.
   *
   * The existing Lead detail page can still render from its mock Lead payload
   * without forcing a Supabase request for the new Person models.
   */
  if (useMockData) {
    return {
      organizationId: null,
      leadId: normalizedLeadId,
      personId: null,
      person: null,
      journey: [],
      journeyTotal: 0,
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Unable to load Person journey: user is not authenticated.",
    );
  }

  const organizationId = await requireCurrentOrganizationId(
    supabase,
    user.id,
  );

  /*
   * Preserve the same explicit Lead authorization contract used by getLead().
   * Active-workspace filtering below is an additional boundary, not a
   * replacement for Lead-level access control.
   */
  const { data: canAccess, error: accessError } = await supabase.rpc(
    "can_access_lead",
    {
      p_lead_id: normalizedLeadId,
    },
  );

  if (accessError) {
    throw new Error(
      `Unable to authorize Person journey access: ${accessError.message}`,
    );
  }

  if (!canAccess) {
    return {
      organizationId,
      leadId: normalizedLeadId,
      personId: null,
      person: null,
      journey: [],
      journeyTotal: 0,
    };
  }

  /*
   * These views/tables are migration-driven. Cast the query client locally so
   * this adapter does not depend on generated Supabase types being refreshed
   * in the same commit as migration 017/018.
   */
  const db = supabase as any;

  const { data: personLink, error: personLinkError } = await db
    .from("person_leads")
    .select("person_id")
    .eq("organization_id", organizationId)
    .eq("lead_id", normalizedLeadId)
    .maybeSingle();

  if (personLinkError) {
    throw new Error(
      `Unable to resolve Lead to Person: ${personLinkError.message}`,
    );
  }

  const personId = String(personLink?.person_id ?? "").trim();

  if (!personId) {
    return {
      organizationId,
      leadId: normalizedLeadId,
      personId: null,
      person: null,
      journey: [],
      journeyTotal: 0,
    };
  }

  const requestedLimit = Number(options?.limit ?? 200);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
    : 200;

  const [personResult, journeyResult] = await Promise.all([
    db
      .from("v_person_360")
      .select(PERSON_360_SELECT)
      .eq("organization_id", organizationId)
      .eq("person_id", personId)
      .maybeSingle(),

    db
      .from("v_person_journey")
      .select(PERSON_JOURNEY_SELECT, {
        count: "exact",
      })
      .eq("organization_id", organizationId)
      .eq("person_id", personId)
      .order("event_at", {
        ascending: false,
      })
      .order("journey_event_key", {
        ascending: false,
      })
      .limit(limit),
  ]);

  /*
   * Person 360 and the canonical journey are derived intelligence read models.
   * They must never take the operational Lead detail page down. Authentication,
   * tenant binding, and Lead authorization still fail closed above; only these
   * non-authoritative enrichments degrade gracefully.
   */
  if (personResult.error) {
    console.error("Person 360 read degraded:", personResult.error.message);
  }

  if (journeyResult.error) {
    console.error("Person journey read degraded:", journeyResult.error.message);
  }

  let person: Person360Summary | null = personResult.error
    ? null
    : personResult.data
      ? ({
          ...personResult.data,
          latest_lead_engagement_score: null,
          latest_lead_behaviour_temperature: null,
          latest_lead_behaviour_reason: null,
        } as Person360Summary)
      : null;

  /*
   * Recover the three journey signals through a targeted single-lead query.
   * This preserves the Person 360 UI without forcing the expensive journey
   * join inside v_person_360 itself.
   */
  const latestLeadId = String(person?.latest_lead_id ?? "").trim();

  if (person && latestLeadId) {
    const { data: latestLeadJourney, error: latestLeadJourneyError } = await db
      .from("v_lead_journey_intelligence")
      .select("engagement_score,behaviour_temperature,behaviour_reason")
      .eq("organization_id", organizationId)
      .eq("lead_id", latestLeadId)
      .maybeSingle();

    if (latestLeadJourneyError) {
      console.error(
        "Latest lead journey signal read degraded:",
        latestLeadJourneyError.message,
      );
    } else if (latestLeadJourney) {
      person = {
        ...person,
        latest_lead_engagement_score:
          latestLeadJourney.engagement_score ?? null,
        latest_lead_behaviour_temperature:
          latestLeadJourney.behaviour_temperature ?? null,
        latest_lead_behaviour_reason:
          latestLeadJourney.behaviour_reason ?? null,
      };
    }
  }

  return {
    organizationId,
    leadId: normalizedLeadId,
    personId,
    person,
    journey: journeyResult.error
      ? []
      : ((journeyResult.data ?? []) as PersonJourneyEvent[]),
    journeyTotal: journeyResult.error ? 0 : Number(journeyResult.count ?? 0),
  };
}
