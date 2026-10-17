import 'server-only';

import { getOpenSearchConfig } from '@/lib/search/opensearch';

export const SEO_SEARCH_ENTITY_TYPES = [
  'seo_page',
  'seo_topic',
  'seo_entity',
  'seo_experiment',
  'seo_action',
] as const;

export type SeoSearchMode =
  | 'all'
  | 'opportunity'
  | 'revenue'
  | 'content'
  | 'technical'
  | 'aeo'
  | 'geo'
  | 'experiments';

export type SeoSearchItem = {
  id: string;
  score: number | null;
  entityType: string | null;
  entityId: string | null;
  source: Record<string, unknown>;
  highlights: Record<string, string[]>;
};

const SEO_SOURCE_FIELDS = [
  'organization_id',
  'entity_type',
  'entity_id',
  'site_id',
  'normalized_url',
  'canonical_url',
  'url_path',
  'page_type',
  'lifecycle_status',
  'title',
  'meta_description',
  'word_count',
  'is_indexable',
  'indexability_reason',
  'schema_types',
  'technical_issue_types',
  'technical_issue_count',
  'gsc_clicks',
  'gsc_impressions',
  'gsc_ctr',
  'gsc_avg_position',
  'semantic_coverage_score',
  'semantic_topic_count',
  'semantic_entity_count',
  'internal_link_opportunities',
  'opportunity_score',
  'opportunity_reasons',
  'content_state',
  'recommended_action',
  'action_priority_score',
  'action_reason',
  'organic_leads',
  'organic_qualified_leads',
  'organic_enrolled_leads',
  'organic_revenue_inr',
  'organic_revenue_usd',
  'business_value_signal',
  'revenue_priority_score',
  'answer_readiness_score',
  'answer_state',
  'answer_query_count',
  'high_opportunity_answer_queries',
  'generative_readiness_score',
  'geo_state',
  'ai_referral_sessions',
  'ai_linked_leads',
  'observed_ai_providers',
  'canonical_key',
  'topic_name',
  'topic_type',
  'description',
  'gap_type',
  'query_count',
  'mapped_pages',
  'indexable_pages',
  'priority_score',
  'recommendation',
  'semantic_entity_name',
  'semantic_entity_kind',
  'external_source',
  'source',
  'status',
  'experiment_title',
  'hypothesis',
  'target_kind',
  'target_page_id',
  'target_url',
  'source_layer',
  'source_action',
  'primary_metric',
  'result_classification',
  'result_confidence',
  'learning_summary',
  'seo_action_kind',
  'risk_level',
  'executor_kind',
  'execution_gate',
  'approval_status',
  'execution_status',
  'created_at',
  'updated_at',
] as const;

export const SEO_INDEX_PROPERTIES: Record<string, unknown> = {
  site_id: { type: 'keyword' },
  normalized_url: { type: 'keyword', fields: { text: { type: 'text' } } },
  canonical_url: { type: 'keyword', fields: { text: { type: 'text' } } },
  url_path: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 1024 } } },
  page_type: { type: 'keyword' },
  lifecycle_status: { type: 'keyword' },
  title: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 512 } } },
  meta_description: { type: 'text' },
  word_count: { type: 'integer' },
  is_indexable: { type: 'boolean' },
  indexability_reason: { type: 'text' },
  schema_types: { type: 'keyword' },
  technical_issue_types: { type: 'keyword' },
  technical_issue_count: { type: 'integer' },
  gsc_clicks: { type: 'long' },
  gsc_impressions: { type: 'long' },
  gsc_ctr: { type: 'double' },
  gsc_avg_position: { type: 'double' },
  semantic_coverage_score: { type: 'integer' },
  semantic_topic_count: { type: 'long' },
  semantic_entity_count: { type: 'long' },
  internal_link_opportunities: { type: 'integer' },
  opportunity_score: { type: 'integer' },
  opportunity_reasons: { type: 'text' },
  content_state: { type: 'keyword' },
  recommended_action: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
  action_priority_score: { type: 'integer' },
  action_reason: { type: 'text' },
  organic_leads: { type: 'long' },
  organic_qualified_leads: { type: 'long' },
  organic_enrolled_leads: { type: 'long' },
  organic_revenue_inr: { type: 'double' },
  organic_revenue_usd: { type: 'double' },
  business_value_signal: { type: 'keyword' },
  revenue_priority_score: { type: 'integer' },
  answer_readiness_score: { type: 'integer' },
  answer_state: { type: 'keyword' },
  answer_query_count: { type: 'integer' },
  high_opportunity_answer_queries: { type: 'integer' },
  generative_readiness_score: { type: 'integer' },
  geo_state: { type: 'keyword' },
  ai_referral_sessions: { type: 'long' },
  ai_linked_leads: { type: 'long' },
  observed_ai_providers: { type: 'keyword' },
  canonical_key: { type: 'keyword', fields: { text: { type: 'text' } } },
  topic_name: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
  topic_type: { type: 'keyword' },
  description: { type: 'text' },
  gap_type: { type: 'keyword' },
  query_count: { type: 'long' },
  mapped_pages: { type: 'long' },
  indexable_pages: { type: 'long' },
  priority_score: { type: 'integer' },
  recommendation: { type: 'text' },
  semantic_entity_name: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
  semantic_entity_kind: { type: 'keyword' },
  external_source: { type: 'keyword' },
  source: { type: 'keyword' },
  experiment_title: { type: 'text' },
  hypothesis: { type: 'text' },
  target_kind: { type: 'keyword' },
  target_page_id: { type: 'keyword' },
  target_url: { type: 'keyword', fields: { text: { type: 'text' } } },
  source_layer: { type: 'keyword' },
  source_action: { type: 'keyword' },
  primary_metric: { type: 'keyword' },
  result_classification: { type: 'keyword' },
  result_confidence: { type: 'keyword' },
  learning_summary: { type: 'text' },
  seo_action_kind: { type: 'keyword' },
  risk_level: { type: 'keyword' },
  executor_kind: { type: 'keyword' },
  execution_gate: { type: 'keyword' },
  approval_status: { type: 'keyword' },
  execution_status: { type: 'keyword' },
};

function configHeaders(authorization: string) {
  return {
    Authorization: authorization,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export async function ensureSeoOpenSearchMapping() {
  const config = getOpenSearchConfig();
  const response = await fetch(
    `${config.endpoint}/${encodeURIComponent(config.indexName)}/_mapping`,
    {
      method: 'PUT',
      headers: configHeaders(config.authorization),
      body: JSON.stringify({ properties: SEO_INDEX_PROPERTIES }),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error(`SEO OpenSearch mapping update failed with HTTP ${response.status}.`);
  }

  return { ok: true, indexName: config.indexName, fields: Object.keys(SEO_INDEX_PROPERTIES).length };
}

export function inferSeoSearchMode(query: string): SeoSearchMode {
  const value = query.toLowerCase();
  if (/revenue|lead|enrol|conversion|convert|business value|money/.test(value)) return 'revenue';
  if (/answer engine|aeo|faq|question|featured snippet|answer/.test(value)) return 'aeo';
  if (/generative|geo|chatgpt|perplexity|gemini|ai referral|ai visibility/.test(value)) return 'geo';
  if (/technical|indexability|indexable|crawl|canonical|schema|noindex|broken/.test(value)) return 'technical';
  if (/experiment|test|hypothesis|learning|optimization action/.test(value)) return 'experiments';
  if (/content gap|topic|entity|internal link|content|semantic/.test(value)) return 'content';
  if (/opportunity|priority|improve|quick win|what should|next action/.test(value)) return 'opportunity';
  return 'all';
}

function modeEntityTypes(mode: SeoSearchMode) {
  if (mode === 'experiments') return ['seo_experiment', 'seo_action'];
  if (mode === 'content') return ['seo_page', 'seo_topic', 'seo_entity'];
  if (mode === 'technical' || mode === 'revenue' || mode === 'aeo' || mode === 'geo' || mode === 'opportunity') {
    return ['seo_page', 'seo_topic'];
  }
  return [...SEO_SEARCH_ENTITY_TYPES];
}

function modeBoostFunctions(mode: SeoSearchMode) {
  const functions: Array<Record<string, unknown>> = [
    { field_value_factor: { field: 'opportunity_score', factor: 0.025, missing: 0 } },
    { field_value_factor: { field: 'action_priority_score', factor: 0.025, missing: 0 } },
    { field_value_factor: { field: 'priority_score', factor: 0.025, missing: 0 } },
  ];

  if (mode === 'revenue' || mode === 'all' || mode === 'opportunity') {
    functions.push(
      { field_value_factor: { field: 'revenue_priority_score', factor: 0.03, missing: 0 } },
      { field_value_factor: { field: 'organic_leads', factor: 0.15, modifier: 'log1p', missing: 0 } },
    );
  }

  if (mode === 'aeo' || mode === 'all') {
    functions.push({ field_value_factor: { field: 'answer_readiness_score', factor: 0.015, missing: 0 } });
  }

  if (mode === 'geo' || mode === 'all') {
    functions.push({ field_value_factor: { field: 'generative_readiness_score', factor: 0.015, missing: 0 } });
  }

  functions.push({ field_value_factor: { field: 'gsc_impressions', factor: 0.05, modifier: 'log1p', missing: 0 } });
  return functions;
}

function sanitizeHighlights(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {} as Record<string, string[]>;
  const output: Record<string, string[]> = {};
  for (const [field, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!Array.isArray(raw)) continue;
    output[field.slice(0, 100)] = raw
      .filter((value): value is string => typeof value === 'string')
      .slice(0, 4)
      .map((value) => value.slice(0, 700));
  }
  return output;
}

export async function searchTenantSeoOpenSearch(input: {
  organizationId: string;
  query?: string;
  mode?: SeoSearchMode;
  size?: number;
  offset?: number;
}) {
  const organizationId = input.organizationId.trim();
  const query = (input.query || '').trim().slice(0, 500);
  const mode = input.mode || inferSeoSearchMode(query);
  const size = Math.max(1, Math.min(Number(input.size || 20), 50));
  const offset = Math.max(0, Math.min(Number(input.offset || 0), 1000));

  if (!organizationId) throw new Error('Organization is required.');

  const filters: unknown[] = [
    { term: { organization_id: organizationId } },
    { terms: { entity_type: modeEntityTypes(mode) } },
  ];

  if (mode === 'technical') filters.push({ term: { entity_type: 'seo_page' } });
  if (mode === 'revenue') filters.push({ term: { entity_type: 'seo_page' } });
  if (mode === 'aeo') filters.push({ term: { entity_type: 'seo_page' } });
  if (mode === 'geo') filters.push({ term: { entity_type: 'seo_page' } });

  const textQuery = query
    ? {
        multi_match: {
          query,
          type: 'best_fields',
          fuzziness: 'AUTO',
          fields: [
            'title^7',
            'topic_name^7',
            'semantic_entity_name^7',
            'experiment_title^6',
            'url_path^5',
            'normalized_url.text^4',
            'meta_description^3',
            'description^3',
            'hypothesis^3',
            'action_reason^3',
            'recommendation^3',
            'recommended_action^2',
            'learning_summary^2',
            'opportunity_reasons^2',
          ],
        },
      }
    : { match_all: {} };

  const body = {
    from: offset,
    size,
    track_total_hits: true,
    _source: { includes: SEO_SOURCE_FIELDS },
    query: {
      function_score: {
        query: {
          bool: {
            filter: filters,
            must: [textQuery],
          },
        },
        functions: modeBoostFunctions(mode),
        score_mode: 'sum',
        boost_mode: 'sum',
      },
    },
    highlight: {
      pre_tags: ['<mark>'],
      post_tags: ['</mark>'],
      fragment_size: 180,
      number_of_fragments: 3,
      fields: {
        title: {},
        topic_name: {},
        semantic_entity_name: {},
        experiment_title: {},
        meta_description: {},
        description: {},
        hypothesis: {},
        action_reason: {},
        recommendation: {},
      },
    },
  };

  const config = getOpenSearchConfig();
  const response = await fetch(
    `${config.endpoint}/${encodeURIComponent(config.indexName)}/_search`,
    {
      method: 'POST',
      headers: configHeaders(config.authorization),
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );

  if (response.status === 404) {
    return { total: 0, tookMs: 0, mode, items: [] as SeoSearchItem[] };
  }

  if (!response.ok) {
    throw new Error(`SEO OpenSearch query failed with HTTP ${response.status}.`);
  }

  const payload = await response.json() as {
    took?: number;
    hits?: {
      total?: number | { value?: number };
      hits?: Array<{
        _id?: string;
        _score?: number;
        _source?: unknown;
        highlight?: unknown;
      }>;
    };
  };

  const rawTotal = payload.hits?.total;
  const total = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal?.value || 0);

  const items: SeoSearchItem[] = (payload.hits?.hits || []).map((hit) => {
    const source = hit._source && typeof hit._source === 'object' && !Array.isArray(hit._source)
      ? hit._source as Record<string, unknown>
      : {};

    if (String(source.organization_id || '') !== organizationId) {
      throw new Error('SEARCH_TENANT_FILTER_VIOLATION');
    }

    return {
      id: String(hit._id || ''),
      score: typeof hit._score === 'number' ? hit._score : null,
      entityType: typeof source.entity_type === 'string' ? source.entity_type : null,
      entityId: typeof source.entity_id === 'string' ? source.entity_id : null,
      source,
      highlights: sanitizeHighlights(hit.highlight),
    };
  });

  return { total, tookMs: Number(payload.took || 0), mode, items };
}
