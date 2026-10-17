import 'server-only';

import { getOpenSearchConfig } from '@/lib/search/opensearch';

const ENTITY_TYPES = new Set([
  'lead',
  'conversation',
  'message',
  'knowledge_chunk',
]);

const SEARCH_SOURCE_FIELDS = [
  'organization_id',
  'entity_type',
  'entity_id',
  'lead_id',
  'conversation_id',
  'document_id',
  'lead_code',
  'display_name',
  'stage',
  'status',
  'intent',
  'channel',
  'direction',
  'message_type',
  'preferred_location',
  'preferred_mode',
  'country',
  'lead_origin',
  'lead_creation_channel',
  'first_touch_source',
  'first_touch_medium',
  'first_touch_campaign',
  'last_touch_source',
  'last_touch_medium',
  'last_touch_campaign',
  'summary',
  'body',
  'content',
  'document_title',
  'document_category',
  'document_version',
  'chunk_index',
  'preferred_month',
  'started_at',
  'last_message_at',
  'sent_at',
  'received_at',
  'created_at',
  'updated_at',
] as const;

export type SearchEntityType = 'lead' | 'conversation' | 'message' | 'knowledge_chunk';

export type SearchResultItem = {
  id: string;
  score: number | null;
  entityType: string | null;
  entityId: string | null;
  source: Record<string, unknown>;
  highlights: Record<string, string[]>;
};

function normalizeEntityTypes(values?: string[]) {
  if (!values?.length) return [] as string[];
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => ENTITY_TYPES.has(value)),
    ),
  );
}

function sanitizeHighlights(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {} as Record<string, string[]>;
  }

  const result: Record<string, string[]> = {};
  for (const [field, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!Array.isArray(raw)) continue;
    result[field.slice(0, 100)] = raw
      .filter((value): value is string => typeof value === 'string')
      .slice(0, 5)
      .map((value) => value.slice(0, 600));
  }
  return result;
}

export async function searchTenantOpenSearch(input: {
  organizationId: string;
  query: string;
  entityTypes?: string[];
  size?: number;
  offset?: number;
}) {
  const organizationId = input.organizationId.trim();
  const query = input.query.trim().slice(0, 500);
  const size = Math.max(1, Math.min(Number(input.size || 20), 50));
  const offset = Math.max(0, Math.min(Number(input.offset || 0), 1000));
  const entityTypes = normalizeEntityTypes(input.entityTypes);

  if (!organizationId) throw new Error('Organization is required.');
  if (!query) {
    return {
      total: 0,
      tookMs: 0,
      items: [] as SearchResultItem[],
    };
  }

  const config = getOpenSearchConfig();
  const filters: unknown[] = [
    { term: { organization_id: organizationId } },
  ];

  if (entityTypes.length > 0) {
    filters.push({ terms: { entity_type: entityTypes } });
  }

  const body = {
    from: offset,
    size,
    track_total_hits: true,
    _source: {
      includes: SEARCH_SOURCE_FIELDS,
    },
    query: {
      bool: {
        filter: filters,
        must: [
          {
            multi_match: {
              query,
              type: 'best_fields',
              operator: 'and',
              fields: [
                'display_name^5',
                'lead_code^5',
                'document_title^4',
                'summary^3',
                'body^3',
                'content^3',
                'first_touch_campaign^2',
                'last_touch_campaign^2',
                'preferred_location^2',
                'country',
              ],
              fuzziness: 'AUTO',
            },
          },
        ],
      },
    },
    highlight: {
      pre_tags: ['<mark>'],
      post_tags: ['</mark>'],
      fragment_size: 180,
      number_of_fragments: 3,
      fields: {
        display_name: {},
        document_title: {},
        summary: {},
        body: {},
        content: {},
      },
    },
  };

  const response = await fetch(
    `${config.endpoint}/${encodeURIComponent(config.indexName)}/_search`,
    {
      method: 'POST',
      headers: {
        Authorization: config.authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );

  if (response.status === 404) {
    return { total: 0, tookMs: 0, items: [] as SearchResultItem[] };
  }

  if (!response.ok) {
    throw new Error(`OpenSearch query failed with HTTP ${response.status}.`);
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
  const total = typeof rawTotal === 'number'
    ? rawTotal
    : Number(rawTotal?.value || 0);

  const items: SearchResultItem[] = (payload.hits?.hits || []).map((hit) => {
    const source = hit._source && typeof hit._source === 'object' && !Array.isArray(hit._source)
      ? hit._source as Record<string, unknown>
      : {};

    // Defense-in-depth: reject any result whose tenant does not exactly match the authenticated tenant.
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

  return {
    total,
    tookMs: Number(payload.took || 0),
    items,
  };
}
