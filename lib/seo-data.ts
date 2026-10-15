import { createClient } from "@/lib/supabase/server";
import { getProviderVisibility } from "@/lib/integrations/provider-visibility";

export type SeoOverviewRow = {
  range_start: string | null;
  range_end: string | null;

  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;

  organic_leads: number | string | null;
  organic_qualified_leads: number | string | null;
  organic_enrolled_leads: number | string | null;

  organic_revenue_inr: number | string | null;
  organic_revenue_usd: number | string | null;

  click_to_lead_rate: number | string | null;
};

export type DailyRow = {
  date: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type QueryRow = {
  query: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type PageRow = {
  page: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type CountryRow = {
  country: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type DeviceRow = {
  device: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type SearchAppearanceRow = {
  search_appearance: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type OpportunityRow = {
  query: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
  opportunity_type: string;
  recommendation: string;
};

export type KeywordIntelligencePageRow = {
  page: string;
  surface: string;
  clicks: number | string | null;
  impressions: number | string | null;
  avg_position: number | string | null;
  active_days: number | string | null;
};

export type KeywordIntelligenceRow = {
  query: string;
  site_url: string;

  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;

  page_count: number | string | null;
  active_days: number | string | null;

  branded: boolean;
  mixed_surface: boolean;
  signal_type: string;

  leader_page: string;
  leader_surface: string;
  leader_impressions: number | string | null;
  leader_clicks: number | string | null;
  leader_avg_position: number | string | null;
  leader_active_days: number | string | null;
  leader_share: number | string | null;

  runner_up_page: string | null;
  runner_up_surface: string | null;
  runner_up_impressions: number | string | null;
  runner_up_clicks: number | string | null;
  runner_up_avg_position: number | string | null;
  runner_up_active_days: number | string | null;
  runner_up_share: number | string | null;

  surface_count: number | string | null;
  pages: KeywordIntelligencePageRow[];
  recommendation: string;
};

export type KeywordSummary = {
  overlap_queries: number | string | null;
  likely_cannibalization: number | string | null;
  needs_review: number | string | null;
  observed_overlap: number | string | null;
  healthy_leader: number | string | null;
  branded_coverage: number | string | null;
  high_impression_overlaps: number | string | null;
};

export type SyncHealthRow = {
  latest_gsc_date: string | null;
  latest_data_update: string | null;
  last_successful_sync: string | null;
  daily_rows: number | string | null;
  query_rows: number | string | null;
  page_rows: number | string | null;
  country_rows: number | string | null;
  device_rows: number | string | null;
  search_appearance_rows: number | string | null;
};

export type SyncRunRow = {
  id: string;
  site_url: string;
  start_date: string;
  end_date: string;
  status: string;
  triggered_by: string;
  total_rows: number | string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

export type SeoWorkspace = {
  overview: Partial<SeoOverviewRow>;
  daily: DailyRow[];
  queries: QueryRow[];
  pages: PageRow[];
  countries: CountryRow[];
  devices: DeviceRow[];
  appearances: SearchAppearanceRow[];
  opportunities: OpportunityRow[];
  keywordIntelligence: KeywordIntelligenceRow[];
  keywordSummary: Partial<KeywordSummary>;
  health: Partial<SyncHealthRow>;
  syncRuns: SyncRunRow[];
  fallback: boolean;
  warning: string | null;
};

type RpcPayload = {
  overview?: Partial<SeoOverviewRow>;
  daily?: DailyRow[];
  queries?: QueryRow[];
  pages?: PageRow[];
  countries?: CountryRow[];
  devices?: DeviceRow[];
  appearances?: SearchAppearanceRow[];
  opportunities?: OpportunityRow[];
  keyword_intelligence?: KeywordIntelligenceRow[];
  keyword_summary?: Partial<KeywordSummary>;
  health?: Partial<SyncHealthRow>;
  sync_runs?: SyncRunRow[];
};

export async function getSeoWorkspace(): Promise<SeoWorkspace> {
  const supabase = await createClient();

  const visibility =
    await getProviderVisibility(supabase);

  if (!visibility.googleConnected) {
    return {
      overview: {},
      daily: [],
      queries: [],
      pages: [],
      countries: [],
      devices: [],
      appearances: [],
      opportunities: [],
      keywordIntelligence: [],
      keywordSummary: {},
      health: {},
      syncRuns: [],
      fallback: false,
      warning: null,
    };
  }

  const v2Result = await supabase.rpc("get_seo_workspace_v2", {
    p_organization_id: visibility.organizationId,
  });

  if (!v2Result.error) {
    return workspaceFromPayload(
      (v2Result.data ?? {}) as RpcPayload,
      false,
      null,
    );
  }

  const legacyResult = await supabase.rpc("get_seo_workspace", {
    p_organization_id: visibility.organizationId,
  });

  if (!legacyResult.error) {
    return workspaceFromPayload(
      (legacyResult.data ?? {}) as RpcPayload,
      true,
      `Keyword + SERP intelligence is unavailable: ${v2Result.error.message}`,
    );
  }

  return {
    overview: {},
    daily: [],
    queries: [],
    pages: [],
    countries: [],
    devices: [],
    appearances: [],
    opportunities: [],
    keywordIntelligence: [],
    keywordSummary: {},
    health: {},
    syncRuns: [],
    fallback: false,
    warning: `Unable to load SEO workspace: ${legacyResult.error.message}`,
  };
}

function workspaceFromPayload(
  payload: RpcPayload,
  fallback: boolean,
  warning: string | null,
): SeoWorkspace {
  return {
    overview: payload.overview ?? {},

    daily: Array.isArray(payload.daily) ? payload.daily : [],

    queries: Array.isArray(payload.queries) ? payload.queries : [],

    pages: Array.isArray(payload.pages) ? payload.pages : [],

    countries: Array.isArray(payload.countries) ? payload.countries : [],

    devices: Array.isArray(payload.devices) ? payload.devices : [],

    appearances: Array.isArray(payload.appearances)
      ? payload.appearances
      : [],

    opportunities: Array.isArray(payload.opportunities)
      ? payload.opportunities
      : [],

    keywordIntelligence: Array.isArray(payload.keyword_intelligence)
      ? payload.keyword_intelligence
      : [],

    keywordSummary: payload.keyword_summary ?? {},

    health: payload.health ?? {},

    syncRuns: Array.isArray(payload.sync_runs) ? payload.sync_runs : [],

    fallback,
    warning,
  };
}
