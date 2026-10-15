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


export type ContentIntelligenceSummary = {
  total_pages: number | string | null;
  crawled_pages: number | string | null;
  uncrawled_pages: number | string | null;
  fix_indexability: number | string | null;
  improve_snippet: number | string | null;
  expand_content: number | string | null;
  strengthen_internal_links: number | string | null;
  improve_existing: number | string | null;
  create_content_topics: number | string | null;
  expand_topic_topics: number | string | null;
  internal_link_opportunities: number | string | null;
};

export type ContentPageActionRow = {
  page_id: string;
  site_id: string;
  normalized_url: string;
  url_path: string;
  page_type: string;
  title: string | null;
  word_count: number | string | null;
  is_indexable: boolean | null;
  content_state: string;
  recommended_action: string;
  action_priority_score: number | string | null;
  action_reason: string;
  gsc_clicks: number | string | null;
  gsc_impressions: number | string | null;
  gsc_ctr: number | string | null;
  gsc_avg_position: number | string | null;
  semantic_coverage_score_v1: number | string | null;
  semantic_topic_count: number | string | null;
  semantic_entity_count: number | string | null;
  technical_issue_count: number | string | null;
  internal_link_opportunities: number | string | null;
  best_internal_link_score: number | string | null;
  opportunity_score_v1: number | string | null;
  opportunity_reasons: string[];
};

export type ContentGapQueryRow = {
  query: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type ContentGapRow = {
  site_id: string;
  topic_id: string;
  canonical_key: string;
  topic_name: string;
  topic_type: string;
  mapped_pages: number | string | null;
  indexable_pages: number | string | null;
  query_count: number | string | null;
  gsc_clicks: number | string | null;
  gsc_impressions: number | string | null;
  gsc_avg_position: number | string | null;
  top_queries: ContentGapQueryRow[];
  gap_type: string;
  priority_score_v1: number | string | null;
  recommendation: string;
};

export type InternalLinkOpportunityRow = {
  site_id: string;
  source_url: string;
  target_url: string;
  source_page_id: string;
  target_page_id: string;
  shared_topic_count: number | string | null;
  semantic_confidence: number | string | null;
  opportunity_score_v1: number | string | null;
};

type ContentIntelligenceRpcPayload = {
  summary?: Partial<ContentIntelligenceSummary>;
  page_actions?: ContentPageActionRow[];
  content_gaps?: ContentGapRow[];
  internal_links?: InternalLinkOpportunityRow[];
};


export type SeoRevenueOverview = {
  range_start: string | null;
  range_end: string | null;
  organic_clicks: number | string | null;
  organic_impressions: number | string | null;
  organic_leads: number | string | null;
  organic_qualified_leads: number | string | null;
  organic_enrolled_leads: number | string | null;
  organic_revenue_inr: number | string | null;
  organic_revenue_usd: number | string | null;
};

export type SeoRevenueSummary = {
  pages_with_leads: number | string | null;
  pages_with_qualified_leads: number | string | null;
  pages_with_enrollments: number | string | null;
  pages_with_revenue: number | string | null;
  mapped_organic_leads: number | string | null;
  unmapped_organic_leads: number | string | null;
  landing_page_attribution_coverage: number | string | null;
  high_traffic_without_leads: number | string | null;
  commercial_signal_pages: number | string | null;
};

export type SeoRevenueValuePageRow = {
  page_id: string;
  site_id: string;
  normalized_url: string;
  url_path: string;
  title: string | null;
  page_type: string;
  is_indexable: boolean | null;
  gsc_clicks: number | string | null;
  gsc_impressions: number | string | null;
  gsc_ctr: number | string | null;
  gsc_avg_position: number | string | null;
  organic_leads: number | string | null;
  organic_qualified_leads: number | string | null;
  organic_enrolled_leads: number | string | null;
  revenue_leads: number | string | null;
  organic_revenue_inr: number | string | null;
  organic_revenue_usd: number | string | null;
  click_to_lead_rate_directional: number | string | null;
  lead_to_qualified_rate: number | string | null;
  lead_to_enrolled_rate: number | string | null;
  business_value_signal: string;
  revenue_priority_score_v1: number | string | null;
  recommended_action: string;
  recommendation: string;
  content_recommended_action: string;
  content_priority_score: number | string | null;
};

export type SeoRevenueTrafficGapRow = {
  page_id: string;
  site_id: string;
  normalized_url: string;
  url_path: string;
  title: string | null;
  gsc_clicks: number | string | null;
  gsc_impressions: number | string | null;
  gsc_ctr: number | string | null;
  gsc_avg_position: number | string | null;
  business_value_signal: string;
  revenue_priority_score_v1: number | string | null;
  recommended_action: string;
  recommendation: string;
  content_recommended_action: string;
  content_priority_score: number | string | null;
};

type SeoRevenueRpcPayload = {
  overview?: Partial<SeoRevenueOverview>;
  summary?: Partial<SeoRevenueSummary>;
  value_pages?: SeoRevenueValuePageRow[];
  traffic_gaps?: SeoRevenueTrafficGapRow[];
  priority_actions?: SeoRevenueValuePageRow[];
};


export type SeoAeoSummary = {
  total_pages: number | string | null;
  crawled_pages: number | string | null;
  uncrawled_pages: number | string | null;
  pages_with_answer_sections: number | string | null;
  pages_with_answer_demand: number | string | null;
  pages_with_high_opportunity_demand: number | string | null;
  answer_specific_schema_pages: number | string | null;
  priority_page_actions: number | string | null;
  best_page_readiness: number | string | null;
  answer_queries: number | string | null;
  answer_clicks: number | string | null;
  answer_impressions: number | string | null;
  high_opportunity_queries: number | string | null;
  striking_answer_queries: number | string | null;
};

export type SeoAeoAnswerClassRow = {
  answer_class: string;
  query_count: number | string | null;
  clicks: number | string | null;
  impressions: number | string | null;
  high_opportunity_queries: number | string | null;
};

export type SeoAeoQueryOpportunityRow = {
  query: string;
  answer_class: string;
  semantic_intent: string | null;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
  page_count: number | string | null;
  leader_page: string;
  leader_clicks: number | string | null;
  leader_impressions: number | string | null;
  leader_avg_position: number | string | null;
  answer_opportunity_score_v1: number | string | null;
  recommended_action: string;
  recommendation: string;
};

export type SeoAeoPageReadinessRow = {
  page_id: string;
  site_id: string;
  normalized_url: string;
  url_path: string;
  title: string | null;
  page_type: string;
  is_indexable: boolean | null;
  snapshot_id: string | null;
  word_count: number | string | null;
  schema_types: string[];
  answer_heading_count: number | string | null;
  interrogative_heading_count: number | string | null;
  has_answer_sections: boolean;
  has_faq_schema: boolean;
  has_howto_schema: boolean;
  semantic_coverage_score_v1: number | string | null;
  semantic_topic_count: number | string | null;
  semantic_entity_count: number | string | null;
  answer_query_count: number | string | null;
  high_opportunity_query_count: number | string | null;
  answer_clicks: number | string | null;
  answer_impressions: number | string | null;
  best_answer_opportunity_score: number | string | null;
  answer_classes: string[];
  answer_readiness_score_v1: number | string | null;
  answer_state: string;
  recommended_action: string;
  recommendation: string;
  action_priority: number | string | null;
};

type SeoAeoRpcPayload = {
  summary?: Partial<SeoAeoSummary>;
  answer_classes?: SeoAeoAnswerClassRow[];
  query_opportunities?: SeoAeoQueryOpportunityRow[];
  page_readiness?: SeoAeoPageReadinessRow[];
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
  contentSummary: Partial<ContentIntelligenceSummary>;
  contentPageActions: ContentPageActionRow[];
  contentGaps: ContentGapRow[];
  internalLinkOpportunities: InternalLinkOpportunityRow[];
  contentWarning: string | null;
  revenueOverview: Partial<SeoRevenueOverview>;
  revenueSummary: Partial<SeoRevenueSummary>;
  revenueValuePages: SeoRevenueValuePageRow[];
  revenueTrafficGaps: SeoRevenueTrafficGapRow[];
  revenuePriorityActions: SeoRevenueValuePageRow[];
  revenueWarning: string | null;
  aeoSummary: Partial<SeoAeoSummary>;
  aeoAnswerClasses: SeoAeoAnswerClassRow[];
  aeoQueryOpportunities: SeoAeoQueryOpportunityRow[];
  aeoPageReadiness: SeoAeoPageReadinessRow[];
  aeoWarning: string | null;
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
      contentSummary: {},
      contentPageActions: [],
      contentGaps: [],
      internalLinkOpportunities: [],
      contentWarning: null,
      revenueOverview: {},
      revenueSummary: {},
      revenueValuePages: [],
      revenueTrafficGaps: [],
      revenuePriorityActions: [],
      revenueWarning: null,
      aeoSummary: {},
      aeoAnswerClasses: [],
      aeoQueryOpportunities: [],
      aeoPageReadiness: [],
      aeoWarning: null,
      health: {},
      syncRuns: [],
      fallback: false,
      warning: null,
    };
  }

  const [v2Result, contentResult, revenueResult, aeoResult] = await Promise.all([
    supabase.rpc("get_seo_workspace_v2", {
      p_organization_id: visibility.organizationId,
    }),
    supabase.rpc("get_seo_content_intelligence", {
      p_organization_id: visibility.organizationId,
    }),
    supabase.rpc("get_seo_revenue_intelligence", {
      p_organization_id: visibility.organizationId,
    }),
    supabase.rpc("get_seo_aeo_intelligence", {
      p_organization_id: visibility.organizationId,
    }),
  ]);

  const contentPayload = contentWorkspaceFromPayload(
    (contentResult.data ?? {}) as ContentIntelligenceRpcPayload,
    contentResult.error
      ? `Content intelligence is unavailable: ${contentResult.error.message}`
      : null,
  );

  const revenuePayload = revenueWorkspaceFromPayload(
    (revenueResult.data ?? {}) as SeoRevenueRpcPayload,
    revenueResult.error
      ? `Revenue-aware organic intelligence is unavailable: ${revenueResult.error.message}`
      : null,
  );

  const aeoPayload = aeoWorkspaceFromPayload(
    (aeoResult.data ?? {}) as SeoAeoRpcPayload,
    aeoResult.error
      ? `Answer Engine intelligence is unavailable: ${aeoResult.error.message}`
      : null,
  );

  if (!v2Result.error) {
    return {
      ...workspaceFromPayload(
        (v2Result.data ?? {}) as RpcPayload,
        false,
        null,
      ),
      ...contentPayload,
      ...revenuePayload,
      ...aeoPayload,
    };
  }

  const legacyResult = await supabase.rpc("get_seo_workspace", {
    p_organization_id: visibility.organizationId,
  });

  if (!legacyResult.error) {
    return {
      ...workspaceFromPayload(
        (legacyResult.data ?? {}) as RpcPayload,
        true,
        `Keyword + SERP intelligence is unavailable: ${v2Result.error.message}`,
      ),
      ...contentPayload,
      ...revenuePayload,
      ...aeoPayload,
    };
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
    ...contentPayload,
    ...revenuePayload,
    ...aeoPayload,
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

    contentSummary: {},
    contentPageActions: [],
    contentGaps: [],
    internalLinkOpportunities: [],
    contentWarning: null,

    revenueOverview: {},
    revenueSummary: {},
    revenueValuePages: [],
    revenueTrafficGaps: [],
    revenuePriorityActions: [],
    revenueWarning: null,

    aeoSummary: {},
    aeoAnswerClasses: [],
    aeoQueryOpportunities: [],
    aeoPageReadiness: [],
    aeoWarning: null,

    health: payload.health ?? {},

    syncRuns: Array.isArray(payload.sync_runs) ? payload.sync_runs : [],

    fallback,
    warning,
  };
}

function contentWorkspaceFromPayload(
  payload: ContentIntelligenceRpcPayload,
  contentWarning: string | null,
): Pick<
  SeoWorkspace,
  | "contentSummary"
  | "contentPageActions"
  | "contentGaps"
  | "internalLinkOpportunities"
  | "contentWarning"
> {
  return {
    contentSummary: payload.summary ?? {},

    contentPageActions: Array.isArray(payload.page_actions)
      ? payload.page_actions
      : [],

    contentGaps: Array.isArray(payload.content_gaps)
      ? payload.content_gaps
      : [],

    internalLinkOpportunities: Array.isArray(payload.internal_links)
      ? payload.internal_links
      : [],

    contentWarning,
  };
}


function revenueWorkspaceFromPayload(
  payload: SeoRevenueRpcPayload,
  revenueWarning: string | null,
): Pick<
  SeoWorkspace,
  | "revenueOverview"
  | "revenueSummary"
  | "revenueValuePages"
  | "revenueTrafficGaps"
  | "revenuePriorityActions"
  | "revenueWarning"
> {
  return {
    revenueOverview: payload.overview ?? {},
    revenueSummary: payload.summary ?? {},
    revenueValuePages: Array.isArray(payload.value_pages)
      ? payload.value_pages
      : [],
    revenueTrafficGaps: Array.isArray(payload.traffic_gaps)
      ? payload.traffic_gaps
      : [],
    revenuePriorityActions: Array.isArray(payload.priority_actions)
      ? payload.priority_actions
      : [],
    revenueWarning,
  };
}

function aeoWorkspaceFromPayload(
  payload: SeoAeoRpcPayload,
  aeoWarning: string | null,
): Pick<
  SeoWorkspace,
  | "aeoSummary"
  | "aeoAnswerClasses"
  | "aeoQueryOpportunities"
  | "aeoPageReadiness"
  | "aeoWarning"
> {
  return {
    aeoSummary: payload.summary ?? {},
    aeoAnswerClasses: Array.isArray(payload.answer_classes)
      ? payload.answer_classes
      : [],
    aeoQueryOpportunities: Array.isArray(payload.query_opportunities)
      ? payload.query_opportunities
      : [],
    aeoPageReadiness: Array.isArray(payload.page_readiness)
      ? payload.page_readiness
      : [],
    aeoWarning,
  };
}
