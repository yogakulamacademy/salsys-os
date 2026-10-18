import { NextResponse } from 'next/server';

import { getDashboardSnapshot } from '@/lib/dashboard-data';
import { getSystemIntelligenceContext } from '@/lib/intelligence/system-intelligence-context';
import { buildSystemIntelligenceV3 } from '@/lib/intelligence/system-intelligence-v3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [snapshot, context] = await Promise.all([
      getDashboardSnapshot(),
      getSystemIntelligenceContext(),
    ]);
    const intelligence = buildSystemIntelligenceV3(snapshot, context);

    return NextResponse.json(
      { ok: true, version: 3, intelligence },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Robots-Tag': 'noindex',
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message.toLowerCase().includes('authenticate') || message.toLowerCase().includes('authenticated');

    return NextResponse.json(
      {
        ok: false,
        error: unauthenticated ? 'Authentication required.' : 'Unable to build system intelligence.',
      },
      {
        status: unauthenticated ? 401 : 503,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Robots-Tag': 'noindex',
        },
      },
    );
  }
}
