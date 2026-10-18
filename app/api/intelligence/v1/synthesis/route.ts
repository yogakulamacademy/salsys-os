import { NextResponse } from 'next/server';

import { getDashboardSnapshot } from '@/lib/dashboard-data';
import { generateClaudeOperatingBrief, isClaudeOperatingBriefConfigured } from '@/lib/intelligence/claude-operating-brief';
import { getSystemIntelligenceContext } from '@/lib/intelligence/system-intelligence-context';
import { buildSystemIntelligenceV2 } from '@/lib/intelligence/system-intelligence-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  try {
    if (!isClaudeOperatingBriefConfigured()) {
      return NextResponse.json(
        { ok: false, error: 'Claude operating brief is not configured.' },
        { status: 503, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex' } },
      );
    }

    const [snapshot, context] = await Promise.all([
      getDashboardSnapshot(),
      getSystemIntelligenceContext(),
    ]);
    const intelligence = buildSystemIntelligenceV2(snapshot, context);
    const synthesis = await generateClaudeOperatingBrief(intelligence);

    return NextResponse.json(
      { ok: true, synthesis },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message.toLowerCase().includes('authenticate') || message.toLowerCase().includes('authenticated');

    return NextResponse.json(
      { ok: false, error: unauthenticated ? 'Authentication required.' : 'Unable to generate Claude operating brief.' },
      { status: unauthenticated ? 401 : 503, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex' } },
    );
  }
}
