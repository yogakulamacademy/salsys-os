import { NextResponse } from 'next/server';

import { getOpenSearchHealth } from '@/lib/search/health';
import { getSeoEmbeddingConfig } from '@/lib/search/seo-semantic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ ok: false, error: 'Preview only.' }, { status: 404 });
  }

  try {
    const health = await getOpenSearchHealth();
    return NextResponse.json(
      {
        ok: health.ok,
        signedOpenSearch: health,
        embeddingProviderConfigured: Boolean(getSeoEmbeddingConfig()),
        semanticMutationPerformed: false,
      },
      {
        status: health.ok ? 200 : 503,
        headers: {
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 300) : 'Semantic transport verification failed.',
        semanticMutationPerformed: false,
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
        },
      },
    );
  }
}
