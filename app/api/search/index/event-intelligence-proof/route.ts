import { NextResponse } from 'next/server';

import { getOpenSearchConfig, openSearchFetch } from '@/lib/search/opensearch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PILOT_BRANCH = 'feature/opensearch-runtime-20261019';
const ORGANIZATION_ID = '3d9ef175-1624-4d89-a0bd-73d3f82c23c0';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== PILOT_BRANCH) {
    return NextResponse.json({ ok: false, reason: 'controlled_preview_only' }, { status: 403 });
  }

  const config = getOpenSearchConfig();
  const response = await openSearchFetch(config, `/${encodeURIComponent(config.indexName)}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: 10,
      _source: ['organization_id', 'entity_type', 'entity_id', 'feature_family', 'prediction_type', 'model_mode', 'summary'],
      query: {
        bool: {
          filter: [
            { term: { organization_id: ORGANIZATION_ID } },
            { terms: { entity_type: ['event_feature', 'event_prediction'] } },
          ],
        },
      },
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json({ ok: false, status: response.status, error: 'opensearch_query_failed' }, { status: 502 });
  }

  const hitsContainer = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>).hits
    : null;
  const hitsObj = hitsContainer && typeof hitsContainer === 'object' && !Array.isArray(hitsContainer)
    ? hitsContainer as Record<string, unknown>
    : {};
  const rawHits = Array.isArray(hitsObj.hits) ? hitsObj.hits : [];

  const documents = rawHits.map((hit) => {
    const hitObj = hit && typeof hit === 'object' && !Array.isArray(hit)
      ? hit as Record<string, unknown>
      : {};
    return {
      id: hitObj._id ?? null,
      source: hitObj._source ?? null,
    };
  });

  const totalObj = hitsObj.total && typeof hitsObj.total === 'object' && !Array.isArray(hitsObj.total)
    ? hitsObj.total as Record<string, unknown>
    : null;

  return NextResponse.json({
    ok: true,
    controlledProof: true,
    organizationId: ORGANIZATION_ID,
    total: totalObj?.value ?? null,
    returned: documents.length,
    documents,
    sourceOfTruth: 'postgresql',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
