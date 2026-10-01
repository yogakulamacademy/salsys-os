import { createClient } from "@/lib/supabase/server";

export type JourneyLeadRow = {
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

export type TemperatureSummaryRow = {
  behaviour_temperature: string;
  lead_count: number | string | null;
  reengaged_count: number | string | null;
  active_7d_count: number | string | null;
  avg_engagement_score: number | string | null;
};

export type VisitDistributionRow = {
  visit_bucket: string;
  lead_count: number | string | null;
  avg_visit_number: number | string | null;
  avg_days_to_lead: number | string | null;
};

export type ReEngagedWorkspace = {
  leads: JourneyLeadRow[];
  summary: TemperatureSummaryRow[];
  distribution: VisitDistributionRow[];
  fallback: boolean;
  warning: string | null;
};

type RpcPayload = {
  leads?: JourneyLeadRow[];
  summary?: TemperatureSummaryRow[];
  distribution?: VisitDistributionRow[];
};

export async function getReEngagedWorkspace(): Promise<ReEngagedWorkspace> {
  const supabase = await createClient();

  /*
   * Primary path:
   * one compact RPC returning recently active CRM leads
   * + temperature summary
   * + conversion visit distribution.
   */
  const v2Result = await supabase.rpc("get_reengaged_workspace_v2");

  if (!v2Result.error) {
    const payload = (v2Result.data ?? {}) as RpcPayload;

    return {
      leads: Array.isArray(payload.leads) ? payload.leads : [],
      summary: Array.isArray(payload.summary) ? payload.summary : [],
      distribution: Array.isArray(payload.distribution)
        ? payload.distribution
        : [],
      fallback: false,
      warning: null,
    };
  }

  /*
   * Compatibility path:
   * preserve the current working optimized RPC if v2 has not been
   * installed yet or becomes temporarily unavailable.
   */
  const legacyRpcResult = await supabase.rpc("get_reengaged_workspace");

  if (!legacyRpcResult.error) {
    const payload = (legacyRpcResult.data ?? {}) as RpcPayload;

    const activeResult = await getRecentlyActiveLeads(supabase);

    return {
      leads: activeResult.error
        ? Array.isArray(payload.leads)
          ? payload.leads
          : []
        : ((activeResult.data ?? []) as JourneyLeadRow[]),

      summary: Array.isArray(payload.summary) ? payload.summary : [],

      distribution: Array.isArray(payload.distribution)
        ? payload.distribution
        : [],

      fallback: true,

      warning: activeResult.error
        ? `Recently active lead read unavailable: ${activeResult.error.message}. Showing the existing strict re-engaged queue.`
        : `Recently active leads are using the compatibility read because get_reengaged_workspace_v2 is unavailable: ${v2Result.error.message}`,
    };
  }

  /*
   * Final safe fallback:
   * use the existing reporting views directly.
   */
  const [activeResult, summaryResult, distributionResult] = await Promise.all([
    getRecentlyActiveLeads(supabase),

    supabase.from("v_lead_temperature_summary").select(`
      behaviour_temperature,
      lead_count,
      reengaged_count,
      active_7d_count,
      avg_engagement_score
    `),

    supabase.from("v_conversion_visit_distribution").select(`
      visit_bucket,
      lead_count,
      avg_visit_number,
      avg_days_to_lead
    `),
  ]);

  const errors = [
    activeResult.error,
    summaryResult.error,
    distributionResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(
      `Unable to load lead activity workspace: ${errors
        .map((item) => item?.message)
        .join(" | ")}`,
    );
  }

  return {
    leads: (activeResult.data ?? []) as JourneyLeadRow[],
    summary: (summaryResult.data ?? []) as TemperatureSummaryRow[],
    distribution: (distributionResult.data ?? []) as VisitDistributionRow[],
    fallback: true,
    warning: `Optimized lead activity read models unavailable: ${v2Result.error.message} | ${legacyRpcResult.error.message}`,
  };
}

function getRecentlyActiveLeads(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  return supabase
    .from("v_lead_journey_intelligence")
    .select(
      `
        lead_id,
        lead_code,
        lead_name,
        current_stage,
        lead_status,
        behaviour_temperature,
        engagement_score,
        behaviour_reason,
        total_sessions,
        sessions_before_lead,
        sessions_after_lead,
        sessions_7d,
        page_views_7d,
        high_intent_events_7d,
        conversion_visit_number,
        days_first_visit_to_lead,
        last_visit_at,
        last_session_source,
        last_session_medium,
        last_session_landing_page,
        is_reengaged,
        has_returned_after_becoming_lead
      `,
    )
    .or(
      [
        "sessions_7d.gt.0",
        "page_views_7d.gt.0",
        "high_intent_events_7d.gt.0",
        "is_reengaged.eq.true",
      ].join(","),
    )
    .order("last_visit_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(250);
}
