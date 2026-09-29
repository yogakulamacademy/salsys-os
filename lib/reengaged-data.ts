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

  const { data, error } = await supabase.rpc("get_reengaged_workspace");

  if (!error) {
    const payload = (data ?? {}) as RpcPayload;

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
   * Safe fallback:
   * preserve the current three-query read path if the new
   * compact workspace RPC is temporarily unavailable.
   */
  const [reengagedResult, summaryResult, distributionResult] =
    await Promise.all([
      supabase
        .from("v_reengaged_leads")
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
        .limit(250),

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
    reengagedResult.error,
    summaryResult.error,
    distributionResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(
      `Unable to load re-engaged leads: ${errors
        .map((item) => item?.message)
        .join(" | ")}`,
    );
  }

  return {
    leads: (reengagedResult.data ?? []) as JourneyLeadRow[],

    summary: (summaryResult.data ?? []) as TemperatureSummaryRow[],

    distribution: (distributionResult.data ?? []) as VisitDistributionRow[],

    fallback: true,
    warning: `Optimized re-engaged read model unavailable: ${error.message}`,
  };
}
