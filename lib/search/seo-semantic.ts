import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getOpenSearchConfig } from '@/lib/search/opensearch';
import {
  SEO_SOURCE_FIELDS,
  inferSeoSearchMode,
  searchTenantSeoOpenSearch,
  seoConfigHeaders,
  seoModeEntityTypes,
  type SeoSearchItem,
  type SeoSearchMode,
} from '@/lib/search/seo';

type EmbeddingConfig = {
  url: string;
  apiKey: string | null;
  model: string;
  dimensions: number;
};

type SemanticHit = {
  id: string;
  score: number;
  entityType: string;
  entityId: string;
};

type EmbeddingClaim = {
  outbox_id: string;
  entity_type: string;
  entity_id: string;
  operation: 'upsert' | 'delete';
  content_hash: string | null;
  revision: number;
  lease_token: string;
};

function env(name: string) {
  return process.env[name]?.trim() || null;
}

function positiveInteger(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getSeoEmbeddingConfig(): EmbeddingConfig | null {
  const url = env('SEO_EMBEDDING_URL');
  const model = env('SEO_EMBEDDING_MODEL');
  const dimensions = positiveInteger(env('SEO_EMBEDDING_DIMENSIONS'));
  if (!url || !model || !dimensions) return null;
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('SEO_EMBEDDING_URL must use http or https.');
  }
  return {
    url: parsed.toString(),
    apiKey: env('SEO_EMBEDDING_API_KEY'),
    model,
    dimensions,
  };
}

function semanticIndexName() {
  const config = getOpenSearchConfig();
  return config.indexName.endsWith('-global-v1')
    ? config.indexName.replace(/-global-v1$/, '-seo-semantic-v1')
    : `${config.indexName}-seo-semantic-v1`;
}

function embeddingHeaders(config: EmbeddingConfig) {
  return {
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function normalizeVector(value: unknown, dimensions: number) {
  if (!Array.isArray(value) || value.length !== dimensions) {
    throw new Error('Embedding provider returned an unexpected vector dimension.');
  }
  const vector = value.map(Number);
  if (vector.some((item) => !Number.isFinite(item))) {
    throw new Error('Embedding provider returned a non-numeric vector.');
  }
  return vector;
}

async function embedTexts(texts: string[], config: EmbeddingConfig) {
  if (!texts.length) return [] as number[][];
  const response = await fetch(config.url, {
    method: 'POST',
    headers: embeddingHeaders(config),
    body: JSON.stringify({ model: config.model, input: texts }),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Embedding provider failed with HTTP ${response.status}.`);
  }
  const payload = await response.json() as {
    data?: Array<{ embedding?: unknown }>;
    embeddings?: unknown[];
    embedding?: unknown;
  };
  const raw = Array.isArray(payload.data)
    ? payload.data.map((row) => row.embedding)
    : Array.isArray(payload.embeddings)
      ? payload.embeddings
      : texts.length === 1 && payload.embedding
        ? [payload.embedding]
        : [];
  if (raw.length !== texts.length) {
    throw new Error('Embedding provider returned an unexpected batch size.');
  }
  return raw.map((item) => normalizeVector(item, config.dimensions));
}

export async function ensureSeoSemanticIndex(input?: { dimensions?: number }) {
  const embedding = getSeoEmbeddingConfig();
  const dimensions = input?.dimensions || embedding?.dimensions;
  if (!dimensions) throw new Error('SEO embedding dimensions are not configured.');
  const search = getOpenSearchConfig();
  const indexName = semanticIndexName();
  const indexUrl = `${search.endpoint}/${encodeURIComponent(indexName)}`;
  const head = await fetch(indexUrl, {
    method: 'HEAD',
    headers: { Authorization: search.authorization },
    cache: 'no-store',
  });
  if (head.ok) {
    const mappingResponse = await fetch(`${indexUrl}/_mapping`, {
      headers: { Authorization: search.authorization, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!mappingResponse.ok) throw new Error(`Semantic mapping check failed with HTTP ${mappingResponse.status}.`);
    const mapping = await mappingResponse.json() as Record<string, any>;
    const actual = Number(mapping[indexName]?.mappings?.properties?.embedding?.dimension || 0);
    if (actual && actual !== dimensions) throw new Error('SEO semantic index dimension mismatch.');
    return { ok: true, indexName, created: false, dimensions };
  }
  if (head.status !== 404) throw new Error(`Semantic index check failed with HTTP ${head.status}.`);
  const create = await fetch(indexUrl, {
    method: 'PUT',
    headers: seoConfigHeaders(search.authorization),
    body: JSON.stringify({
      settings: { 'index.knn': true, number_of_shards: 1, number_of_replicas: 1 },
      mappings: {
        dynamic: false,
        properties: {
          organization_id: { type: 'keyword' },
          entity_type: { type: 'keyword' },
          entity_id: { type: 'keyword' },
          content_hash: { type: 'keyword' },
          embedding_model: { type: 'keyword' },
          embedding: { type: 'knn_vector', dimension: dimensions },
          updated_at: { type: 'date' },
        },
      },
    }),
    cache: 'no-store',
  });
  if (!create.ok) {
    const body = (await create.text()).slice(0, 500);
    if (!(create.status === 400 && body.includes('resource_already_exists_exception'))) {
      throw new Error(`Semantic index creation failed with HTTP ${create.status}.`);
    }
  }
  return { ok: true, indexName, created: true, dimensions };
}

async function loadSemanticSettings(organizationId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('seo_embedding_settings')
    .select('enabled,model_name,dimensions,batch_size,lexical_weight,semantic_weight')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load SEO semantic settings: ${error.message}`);
  return data;
}

function normalizeClaim(row: Record<string, unknown>): EmbeddingClaim {
  return {
    outbox_id: String(row.outbox_id),
    entity_type: String(row.entity_type),
    entity_id: String(row.entity_id),
    operation: row.operation === 'delete' ? 'delete' : 'upsert',
    content_hash: typeof row.content_hash === 'string' ? row.content_hash : null,
    revision: Number(row.revision),
    lease_token: String(row.lease_token),
  };
}

async function finalizeEmbeddingClaim(
  organizationId: string,
  claim: EmbeddingClaim,
  success: boolean,
  errorMessage?: string,
) {
  const admin = createAdminClient();
  const { error } = await admin.rpc('complete_seo_embedding_outbox_v1', {
    p_organization_id: organizationId,
    p_outbox_id: claim.outbox_id,
    p_lease_token: claim.lease_token,
    p_claimed_revision: claim.revision,
    p_success: success,
    p_error: errorMessage || null,
  });
  if (error) throw new Error(`Unable to finalize SEO embedding claim: ${error.message}`);
}

export async function runSeoEmbeddingWorkerForOrganization(organizationId: string) {
  const admin = createAdminClient();
  const settings = await loadSemanticSettings(organizationId);
  if (!settings?.enabled) return { ok: true, skipped: true, reason: 'semantic_disabled', claimed: 0, succeeded: 0, failed: 0 };
  const embedding = getSeoEmbeddingConfig();
  if (!embedding) return { ok: true, skipped: true, reason: 'embedding_provider_not_configured', claimed: 0, succeeded: 0, failed: 0 };
  if (settings.dimensions && Number(settings.dimensions) !== embedding.dimensions) throw new Error('Configured SEO embedding dimension does not match provider dimension.');
  if (settings.model_name && settings.model_name !== embedding.model) throw new Error('Configured SEO embedding model does not match provider model.');

  const { data: rows, error: claimError } = await admin.rpc('claim_seo_embedding_outbox_v1', {
    p_organization_id: organizationId,
    p_limit: Number(settings.batch_size || 20),
    p_lease_seconds: 180,
  });
  if (claimError) throw new Error(`Unable to claim SEO embedding outbox: ${claimError.message}`);
  const claims = Array.isArray(rows) ? rows.map((row) => normalizeClaim(row as Record<string, unknown>)) : [];
  if (!claims.length) return { ok: true, skipped: false, claimed: 0, succeeded: 0, failed: 0 };

  const search = getOpenSearchConfig();
  const indexName = semanticIndexName();
  await ensureSeoSemanticIndex({ dimensions: embedding.dimensions });

  const prepared: Array<{ claim: EmbeddingClaim; text?: string; hash?: string; documentId: string }> = [];
  let failed = 0;
  for (const claim of claims) {
    const documentId = `${organizationId}:${claim.entity_type}:${claim.entity_id}`;
    if (claim.operation === 'delete') {
      prepared.push({ claim, documentId });
      continue;
    }
    const { data, error } = await admin.rpc('build_seo_embedding_subject_v1', {
      p_organization_id: organizationId,
      p_entity_type: claim.entity_type,
      p_entity_id: claim.entity_id,
    });
    if (error || !data?.indexable || typeof data.text !== 'string') {
      failed += 1;
      await finalizeEmbeddingClaim(organizationId, claim, false, error?.message || 'embedding_subject_unavailable');
      continue;
    }
    if (String(data.content_hash || '') !== String(claim.content_hash || '')) {
      await admin.rpc('enqueue_seo_embedding_v1', {
        p_organization_id: organizationId,
        p_entity_type: claim.entity_type,
        p_entity_id: claim.entity_id,
        p_metadata: { source: 'worker_hash_refresh_v1' },
      });
      await finalizeEmbeddingClaim(organizationId, claim, true);
      continue;
    }
    prepared.push({ claim, documentId, text: data.text, hash: data.content_hash });
  }

  const upserts = prepared.filter((row) => row.text);
  let vectors: number[][] = [];
  try {
    vectors = await embedTexts(upserts.map((row) => row.text!), embedding);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'embedding_request_failed';
    for (const row of upserts) {
      failed += 1;
      await finalizeEmbeddingClaim(organizationId, row.claim, false, message);
    }
    vectors = [];
  }

  const vectorById = new Map(upserts.map((row, index) => [row.claim.outbox_id, vectors[index]]));
  const bulkLines: string[] = [];
  const bulkRows: Array<{ claim: EmbeddingClaim; delete: boolean }> = [];
  for (const row of prepared) {
    if (row.text && !vectorById.get(row.claim.outbox_id)) continue;
    if (!row.text) {
      bulkLines.push(JSON.stringify({ delete: { _index: indexName, _id: row.documentId } }));
      bulkRows.push({ claim: row.claim, delete: true });
      continue;
    }
    bulkLines.push(JSON.stringify({ index: { _index: indexName, _id: row.documentId } }));
    bulkLines.push(JSON.stringify({
      organization_id: organizationId,
      entity_type: row.claim.entity_type,
      entity_id: row.claim.entity_id,
      content_hash: row.hash,
      embedding_model: embedding.model,
      embedding: vectorById.get(row.claim.outbox_id),
      updated_at: new Date().toISOString(),
    }));
    bulkRows.push({ claim: row.claim, delete: false });
  }

  let succeeded = 0;
  if (bulkRows.length) {
    const response = await fetch(`${search.endpoint}/_bulk`, {
      method: 'POST',
      headers: { ...seoConfigHeaders(search.authorization), 'Content-Type': 'application/x-ndjson' },
      body: `${bulkLines.join('\n')}\n`,
      cache: 'no-store',
    });
    if (!response.ok) {
      const message = `SEO semantic bulk HTTP ${response.status}`;
      for (const row of bulkRows) {
        failed += 1;
        await finalizeEmbeddingClaim(organizationId, row.claim, false, message);
      }
    } else {
      const payload = await response.json() as { items?: Array<Record<string, any>> };
      const items = payload.items || [];
      for (let i = 0; i < bulkRows.length; i += 1) {
        const op = Object.values(items[i] || {})[0] as Record<string, any> | undefined;
        const status = Number(op?.status || 0);
        const success = bulkRows[i].delete ? ((status >= 200 && status < 300) || status === 404) : status >= 200 && status < 300;
        if (success) {
          succeeded += 1;
          await finalizeEmbeddingClaim(organizationId, bulkRows[i].claim, true);
        } else {
          failed += 1;
          await finalizeEmbeddingClaim(organizationId, bulkRows[i].claim, false, `semantic_bulk_item_${status || 'unknown'}`);
        }
      }
    }
  }

  return { ok: failed === 0, skipped: false, claimed: claims.length, succeeded, failed };
}

async function semanticSearch(input: { organizationId: string; query: string; mode: SeoSearchMode; size: number }) {
  const embedding = getSeoEmbeddingConfig();
  if (!embedding || !input.query.trim()) return [] as SemanticHit[];
  const [vector] = await embedTexts([input.query.slice(0, 500)], embedding);
  const search = getOpenSearchConfig();
  const indexName = semanticIndexName();
  const response = await fetch(`${search.endpoint}/${encodeURIComponent(indexName)}/_search`, {
    method: 'POST',
    headers: seoConfigHeaders(search.authorization),
    body: JSON.stringify({
      size: Math.max(10, Math.min(input.size, 75)),
      _source: ['organization_id','entity_type','entity_id'],
      query: {
        knn: {
          embedding: {
            vector,
            k: Math.max(10, Math.min(input.size, 75)),
            filter: {
              bool: {
                filter: [
                  { term: { organization_id: input.organizationId } },
                  { terms: { entity_type: seoModeEntityTypes(input.mode) } },
                ],
              },
            },
          },
        },
      },
    }),
    cache: 'no-store',
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`SEO semantic query failed with HTTP ${response.status}.`);
  const payload = await response.json() as { hits?: { hits?: Array<{ _id?: string; _score?: number; _source?: Record<string, unknown> }> } };
  return (payload.hits?.hits || []).map((hit) => {
    const source = hit._source || {};
    if (String(source.organization_id || '') !== input.organizationId) throw new Error('SEARCH_TENANT_FILTER_VIOLATION');
    return {
      id: String(hit._id || ''),
      score: Number(hit._score || 0),
      entityType: String(source.entity_type || ''),
      entityId: String(source.entity_id || ''),
    };
  }).filter((hit) => hit.id && hit.entityType && hit.entityId);
}

async function hydrateSemanticHits(organizationId: string, hits: SemanticHit[]) {
  if (!hits.length) return new Map<string, SeoSearchItem>();
  const search = getOpenSearchConfig();
  const response = await fetch(`${search.endpoint}/${encodeURIComponent(search.indexName)}/_mget`, {
    method: 'POST',
    headers: seoConfigHeaders(search.authorization),
    body: JSON.stringify({ docs: hits.map((hit) => ({ _id: hit.id, _source: SEO_SOURCE_FIELDS })) }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`SEO semantic hydration failed with HTTP ${response.status}.`);
  const payload = await response.json() as { docs?: Array<{ _id?: string; found?: boolean; _source?: Record<string, unknown> }> };
  const map = new Map<string, SeoSearchItem>();
  for (const doc of payload.docs || []) {
    if (!doc.found || !doc._source) continue;
    if (String(doc._source.organization_id || '') !== organizationId) throw new Error('SEARCH_TENANT_FILTER_VIOLATION');
    map.set(String(doc._id || ''), {
      id: String(doc._id || ''),
      score: null,
      entityType: typeof doc._source.entity_type === 'string' ? doc._source.entity_type : null,
      entityId: typeof doc._source.entity_id === 'string' ? doc._source.entity_id : null,
      source: doc._source,
      highlights: {},
    });
  }
  return map;
}

function numeric(source: Record<string, unknown>, field: string) {
  const value = Number(source[field] || 0);
  return Number.isFinite(value) ? value : 0;
}

function businessBoost(item: SeoSearchItem, mode: SeoSearchMode) {
  const source = item.source;
  const opportunity = Math.max(numeric(source,'opportunity_score'),numeric(source,'action_priority_score'),numeric(source,'priority_score')) / 100;
  let boost = opportunity * 0.0025;
  if (mode === 'revenue' || mode === 'opportunity' || mode === 'all') boost += Math.min(1,numeric(source,'revenue_priority_score')/100) * 0.003;
  if (mode === 'aeo' || mode === 'all') boost += Math.min(1,numeric(source,'answer_readiness_score')/100) * 0.0015;
  if (mode === 'geo' || mode === 'all') boost += Math.min(1,numeric(source,'generative_readiness_score')/100) * 0.0015;
  return boost;
}

export async function searchTenantSeoHybrid(input: {
  organizationId: string;
  query?: string;
  mode?: SeoSearchMode;
  size?: number;
  offset?: number;
}) {
  const query = (input.query || '').trim().slice(0,500);
  const mode = input.mode || inferSeoSearchMode(query);
  const size = Math.max(1,Math.min(Number(input.size || 20),50));
  const offset = Math.max(0,Math.min(Number(input.offset || 0),1000));
  const candidateSize = Math.min(75,Math.max(30,size + offset + 15));
  const lexical = await searchTenantSeoOpenSearch({ organizationId: input.organizationId, query, mode, size: candidateSize, offset: 0 });
  const settings = await loadSemanticSettings(input.organizationId).catch(() => null);
  const semanticReady = Boolean(settings?.enabled && getSeoEmbeddingConfig() && query);
  if (!semanticReady) {
    return { ...lexical, items: lexical.items.slice(offset,offset+size), retrievalMode: 'lexical' as const, semanticAvailable: false };
  }

  try {
    const semantic = await semanticSearch({ organizationId: input.organizationId, query, mode, size: candidateSize });
    const hydrated = await hydrateSemanticHits(input.organizationId, semantic);
    const lexicalWeight = Number(settings?.lexical_weight || 0.55);
    const semanticWeight = Number(settings?.semantic_weight || 0.45);
    const scores = new Map<string,{score:number;item:SeoSearchItem}>();
    const k = 60;
    lexical.items.forEach((item,index) => scores.set(item.id,{score:lexicalWeight/(k+index+1),item}));
    semantic.forEach((hit,index) => {
      const item = scores.get(hit.id)?.item || hydrated.get(hit.id);
      if (!item) return;
      const current = scores.get(hit.id)?.score || 0;
      scores.set(hit.id,{score:current + semanticWeight/(k+index+1),item});
    });
    const ranked = [...scores.values()]
      .map(({score,item}) => ({...item,score:score + businessBoost(item,mode)}))
      .sort((a,b)=>(b.score || 0)-(a.score || 0));
    return {
      total: Math.max(lexical.total,ranked.length),
      tookMs: lexical.tookMs,
      mode,
      items: ranked.slice(offset,offset+size),
      retrievalMode: 'hybrid_rrf' as const,
      semanticAvailable: true,
      semanticCandidates: semantic.length,
    };
  } catch {
    return { ...lexical, items: lexical.items.slice(offset,offset+size), retrievalMode: 'lexical_fallback' as const, semanticAvailable: false };
  }
}
