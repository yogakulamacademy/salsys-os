import { NextResponse } from 'next/server';

import { getDashboardSnapshot } from '@/lib/dashboard-data';
import { buildSystemIntelligence } from '@/lib/intelligence/system-intelligence';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [snapshot, workspace] = await Promise.all([
      getDashboardSnapshot(),
      getCurrentWorkspaceContext(),
    ]);

    const intelligence = buildSystemIntelligence(snapshot, new Date(), {
      role: workspace.activeWorkspace?.role,
    });

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
    const normalized = message.toLowerCase();
    const unauthenticated = normalized.includes('authenticate') || normalized.includes('authenticated');

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
