import { NextRequest, NextResponse } from 'next/server';

import { ensureSeoSemanticIndex, getSeoEmbeddingConfig } from '@/lib/search/seo-semantic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const secrets = [process.env.SEARCH_INDEX_WORKER_SECRET, process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (!secrets.length) throw new Error('Search worker authorization is not configured.');
  return secrets.some((secret) => authorization === `Bearer ${secret}`);
}

export async function POST(request: NextRequest) {
  try {
    if (!authorized(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
    const embedding = getSeoEmbeddingConfig();
    if (!embedding) {
      return NextResponse.json(
        { ok: false, ready: false, reason: 'embedding_provider_not_configured' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const result = await ensureSeoSemanticIndex({ dimensions: embedding.dimensions });
    return NextResponse.json(
      { ok: true, ready: true, index: result.indexName, created: result.created, dimensions: result.dimensions, model_configured: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, ready: false, error: 'SEO semantic bootstrap failed.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
