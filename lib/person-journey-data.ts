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

const WORKSPACE_SOFT_TIMEOUT_MS = 2_500;
const ENRICHMENT_SOFT_TIMEOUT_MS = 2_500;
const LATEST_LEAD_SIGNAL_SOFT_TIMEOUT_MS = 2_000;

type DerivedReadResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type DerivedListReadResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
};

type PersonJourneyWorkspacePayload = {
  person_id?: unknown;
  person?: Record<string, unknown> | null;
  journey?: PersonJourneyEvent[] | null;
  journey_total?: unknown;
};

type CurrentPersonJourneyWorkspacePayload = PersonJourneyWorkspacePayload & {
  organization_id?: unknown;
  access_granted?: unknown;
  __legacyFallbackRequired?: unknown;
  __workspaceError?: unknown;
};

function withSoftTimeout<T>(
  operation: PromiseLike<T>,
  milliseconds: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), milliseconds);
  });

  return Promise.race([Promise.resolve(operation), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function normalizeLimit(value: unknown) {
  const requested = Number(value ?? 200);
  return Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), 500)
    : 200;
}

function workspacePayload(
  organizationId: string,
  leadId: string,
  payload: PersonJourneyWorkspacePayload,
): PersonJourneyPayload {
  const personId = String(payload.person_id ?? "").trim() || null;
  const person =
    payload.person && typeof payload.person === "object"
      ? (payload.person as unknown as Person360Summary)
      : null;

  return {
    organizationId,
    leadId,
    personId,
    person,
    journey: Array.isArray(payload.journey) ? payload.journey : [],
    journeyTotal: Number(payload.journey_total ?? 0) || 0,
  };
}

export async function getPersonJourneyForLead(
  leadId: string,
  options?: { limit?: number },
): Promise<PersonJourneyPayload> {
  const normalizedLeadId = String(leadId ?? "").trim();

  if (!normalizedLeadId) {
    throw new Error("A lead ID is required to load Person journey data.");
  }

  if (useMockData) {
    return emptyPayload(null, normalizedLeadId);
  }

  const limit = normalizeLimit(options?.limit);
  const supabase = await createClient();
  const db = supabase as any;
  const currentResult = await withSoftTimeout<
    DerivedReadResult<CurrentPersonJourneyWorkspacePayload>
  >(
    db.rpc("get_current_person_journey_workspace_v1", {
      p_lead_id: normalizedLeadId,
      p_limit: limit,
    }),
    WORKSPACE_SOFT_TIMEOUT_MS,
    {
      data: null,
      error: { message: "Current Person Journey workspace exceeded the soft timeout." },
    },
  );

  if (!currentResult.error && currentResult.data) {
    const current = currentResult.data;
    const organizationId = String(current.organization_id ?? "").trim();

    if (!organizationId) {
      throw new Error(
        "Unable to load Person journey: current workspace did not resolve an organization.",
      );
    }

    if (current.access_granted === false) {
      return emptyPayload(organizationId, normalizedLeadId);
    }

    if (current.__legacyFallbackRequired !== true) {
      return workspacePayload(organizationId, normalizedLeadId, current);
    }

    console.error(
      "Person Journey V3 read degraded:",
      String(current.__workspaceError ?? "Unknown V3 read error."),
    );

    return getPersonJourneyFallback(
      db,
      organizationId,
      normalizedLeadId,
      limit,
      false,
    );
  }

  console.error(
    "Current Person Journey workspace read degraded:",
    currentResult.error?.message ?? "Unknown current-workspace read error.",
  );

  return getLegacyAuthorizedPersonJourney(
    supabase,
    db,
    normalizedLeadId,
    limit,
  );
}

async function getLegacyAuthorizedPersonJourney(
  supabase: Awaited<ReturnType<typeof createClient>>,
  db: any,
  leadId: string,
  limit: number,
): Promise<PersonJourneyPayload> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unable to load Person journey: user is not authenticated.");
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canAccess, error: accessError } = await supabase.rpc(
    "can_access_lead",
    { p_lead_id: leadId },
  );

  if (accessError) {
    throw new Error(
      `Unable to authorize Person journey access: ${accessError.message}`,
    );
  }

  if (!canAccess) {
    return emptyPayload(organizationId, leadId);
  }

  return getPersonJourneyFallback(db, organizationId, leadId, limit, true);
}

async function getPersonJourneyFallback(
  db: any,
  organizationId: string,
  leadId: string,
  limit: number,
  retryV3: boolean,
): Promise<PersonJourneyPayload> {
  const workspaceArgs = {
    p_organization_id: organizationId,
    p_lead_id: leadId,
    p_limit: limit,
  };

  if (retryV3) {
    const v3Result = await withSoftTimeout<
      DerivedReadResult<PersonJourneyWorkspacePayload>
    >(
      db.rpc("get_person_journey_workspace_v3", workspaceArgs),
      WORKSPACE_SOFT_TIMEOUT_MS,
      {
        data: null,
        error: { message: "Person Journey V3 exceeded the soft timeout." },
      },
    );

    if (!v3Result.error && v3Result.data) {
      return workspacePayload(organizationId, leadId, v3Result.data);
    }

    console.error(
      "Person Journey V3 read degraded:",
      v3Result.error?.message ?? "Unknown V3 read error.",
    );
  }

  const v2Result = await withSoftTimeout<
    DerivedReadResult<PersonJourneyWorkspacePayload>
  >(
    db.rpc("get_person_journey_workspace_v2", workspaceArgs),
    WORKSPACE_SOFT_TIMEOUT_MS,
    {
      data: null,
      error: { message: "Person Journey V2 exceeded the soft timeout." },
    },
  );

  if (!v2Result.error && v2Result.data) {
    return workspacePayload(organizationId, leadId, v2Result.data);
  }

  console.error(
    "Person Journey V2 read degraded:",
    v2Result.error?.message ?? "Unknown V2 read error.",
  );

  return getLegacyPersonJourney(db, organizationId, leadId, limit);
}

async function getLegacyPersonJourney(
  db: any,
  organizationId: string,
  leadId: string,
  limit: number,
): Promise<PersonJourneyPayload> {
  const { data: personLink, error: personLinkError } = await db
    .from("person_leads")
    .select("person_id")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .maybeSingle();

  if (personLinkError) {
    throw new Error(`Unable to resolve Lead to Person: ${personLinkError.message}`);
  }

  const personId = String(personLink?.person_id ?? "").trim();
  if (!personId) return emptyPayload(organizationId, leadId);

  const personQuery = db
    .from("v_person_360")
    .select(PERSON_360_SELECT)
    .eq("organization_id", organizationId)
    .eq("person_id", personId)
    .maybeSingle();

  const journeyQuery = db
    .from("v_person_journey")
    .select(PERSON_JOURNEY_SELECT, { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("person_id", personId)
    .order("event_at", { ascending: false })
    .order("journey_event_key", { ascending: false })
    .limit(limit);

  const [personResult, journeyResult] = await Promise.all([
    withSoftTimeout<DerivedReadResult<Record<string, unknown>>>(
      personQuery,
      ENRICHMENT_SOFT_TIMEOUT_MS,
      {
        data: null,
        error: { message: "Person 360 enrichment exceeded the soft timeout." },
      },
    ),
    withSoftTimeout<DerivedListReadResult<PersonJourneyEvent>>(
      journeyQuery,
      ENRICHMENT_SOFT_TIMEOUT_MS,
      {
        data: null,
        error: { message: "Person journey enrichment exceeded the soft timeout." },
        count: null,
      },
    ),
  ]);

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

  const latestLeadId = String(person?.latest_lead_id ?? "").trim();
  if (person && latestLeadId) {
    const signalResult = await withSoftTimeout<
      DerivedReadResult<{
        engagement_score?: number | string | null;
        behaviour_temperature?: string | null;
        behaviour_reason?: string | null;
      }>
    >(
      db
        .from("v_lead_journey_intelligence")
        .select("engagement_score,behaviour_temperature,behaviour_reason")
        .eq("organization_id", organizationId)
        .eq("lead_id", latestLeadId)
        .maybeSingle(),
      LATEST_LEAD_SIGNAL_SOFT_TIMEOUT_MS,
      {
        data: null,
        error: { message: "Latest lead journey enrichment exceeded the soft timeout." },
      },
    );

    if (signalResult.error) {
      console.error("Latest lead journey signal read degraded:", signalResult.error.message);
    } else if (signalResult.data) {
      person = {
        ...person,
        latest_lead_engagement_score: signalResult.data.engagement_score ?? null,
        latest_lead_behaviour_temperature:
          signalResult.data.behaviour_temperature ?? null,
        latest_lead_behaviour_reason: signalResult.data.behaviour_reason ?? null,
      };
    }
  }

  return {
    organizationId,
    leadId,
    personId,
    person,
    journey: journeyResult.error ? [] : (journeyResult.data ?? []),
    journeyTotal: journeyResult.error ? 0 : Number(journeyResult.count ?? 0),
  };
}

function emptyPayload(
  organizationId: string | null,
  leadId: string,
): PersonJourneyPayload {
  return {
    organizationId,
    leadId,
    personId: null,
    person: null,
    journey: [],
    journeyTotal: 0,
  };
}
