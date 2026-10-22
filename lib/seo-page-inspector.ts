import { getProviderVisibility } from '@/lib/integrations/provider-visibility';
import { createClient } from '@/lib/supabase/server';

export type SeoInspectorAvailability =
  | 'available'
  | 'no_observations'
  | 'unavailable';

export type SeoPageInspectorRecommendation = {
  reference_key: string;
  source_layer: string;
  target_kind: string;
  recommended_action: string;
  priority_score: number | string | null;
  recommendation: string;
  evidence: Record<string, unknown>;
};

export type SeoPageInspectorPayload = {
  schema_version: 'seo_page_inspector_v1';
  generated_at: string;
  page: {
    page_id: string;
    site_id: string;
    canonical_url: string | null;
    normalized_url: string;
    display_url: string;
    page_type: string;
    lifecycle_status: string;
    first_seen_at: string | null;
    last_seen_at: string | null;
    last_crawled_at: string | null;
    page_title: string;
  };
  reporting: {
    start_date: string | null;
    end_date: string | null;
    timezone: string;
    reporting_source: string;
    data_status: SeoInspectorAvailability;
    source_updated_at: string | null;
    window_rule: 'latest_finalized_gsc_date_30d';
  };
  performance: {
    availability: SeoInspectorAvailability;
    clicks: number | string | null;
    impressions: number | string | null;
    ctr: number | string | null;
    avg_position: number | string | null;
    source_updated_at: string | null;
  };
  daily_trend: Array<{
    date: string;
    clicks: number | string | null;
    impressions: number | string | null;
    ctr: number | string | null;
    avg_position: number | string | null;
  }>;
  query_evidence: Array<{
    query: string;
    clicks: number | string | null;
    impressions: number | string | null;
    ctr: number | string | null;
    avg_position: number | string | null;
    active_days: number | string | null;
  }>;
  crawl: {
    availability: SeoInspectorAvailability;
    snapshot_id: string | null;
    fetched_url?: string | null;
    final_url?: string | null;
    fetched_at: string | null;
    http_status?: number | null;
    response_time_ms?: number | null;
    content_type?: string | null;
    language?: string | null;
    title?: string | null;
    meta_description?: string | null;
    canonical_url?: string | null;
    robots_meta?: string | null;
    x_robots_tag?: string | null;
    is_indexable?: boolean | null;
    indexability_reason?: string | null;
    h1s?: string[];
    h2s?: string[];
    h3s?: string[];
    word_count?: number | null;
    schema_types?: string[];
    structured_data?: unknown;
    hreflang?: unknown;
    open_graph?: unknown;
    technical_flags?: Record<string, unknown>;
  };
  recommendations: SeoPageInspectorRecommendation[];
  selected_recommendation: SeoPageInspectorRecommendation | null;
  evidence_quality: {
    search_evidence: SeoInspectorAvailability;
    crawl_evidence: SeoInspectorAvailability;
    recommendation_evidence: 'available' | 'unavailable';
    confidence_state: 'evidence_available' | 'evidence_incomplete';
    note: string;
  };
  intelligence: {
    content: Record<string, unknown> | null;
    revenue: Record<string, unknown> | null;
    aeo: Record<string, unknown> | null;
    geo: Record<string, unknown> | null;
  };
  workflow: {
    experiments: Array<Record<string, unknown>>;
    measurements: Array<Record<string, unknown>>;
    changes: Array<Record<string, unknown>>;
    learning_events: Array<Record<string, unknown>>;
    optimization_actions: Array<Record<string, unknown>>;
    optimization_events: Array<Record<string, unknown>>;
  };
};

export type SeoPageInspectorOptions = {
  sourceLayer?: string | null;
  recommendedAction?: string | null;
};

/**
 * Loads the reusable SEO Page Inspector contract for the active workspace.
 *
 * The RPC is the orchestration/read layer only. It deliberately reuses the
 * existing SEO recommendation, experiment, measurement, optimization and
 * audit sources instead of recreating their logic in the UI.
 */
export async function getSeoPageInspector(
  pageId: string,
  options: SeoPageInspectorOptions = {},
): Promise<SeoPageInspectorPayload> {
  const supabase = await createClient();
  const visibility = await getProviderVisibility(supabase);

  if (!visibility.organizationId) {
    throw new Error('No active organization is available for this SEO workspace.');
  }

  if (!pageId) {
    throw new Error('A page ID is required for the SEO Page Inspector.');
  }

  const { data, error } = await supabase.rpc('get_seo_page_inspector_v1', {
    p_organization_id: visibility.organizationId,
    p_page_id: pageId,
    p_source_layer: options.sourceLayer ?? null,
    p_recommended_action: options.recommendedAction ?? null,
  });

  if (error) {
    throw error;
  }

  if (!data || typeof data !== 'object') {
    throw new Error('SEO Page Inspector data is unavailable.');
  }

  return data as SeoPageInspectorPayload;
}
