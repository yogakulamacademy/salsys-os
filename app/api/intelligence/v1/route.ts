import { NextResponse } from 'next/server';

import { getDashboardSnapshot } from '@/lib/dashboard-data';
import { buildSystemIntelligence } from '@/lib/intelligence/system-intelligence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await getDashboardSnapshot();
    const intelligence = buildSystemIntelligence(snapshot);

    return NextResponse.json(
      { ok: true, intelligence },
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
