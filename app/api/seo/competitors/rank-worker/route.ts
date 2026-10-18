import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { runRankingCheck } from '@/lib/seo/competitor-intelligence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorized(request: NextRequest) {
  const expected = process.env.SEO_RANKING_WORKER_SECRET || process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${expected}`;
}

async function runDueChecks() {
  if (!process.env.SEO_RANKING_API_URL || !process.env.SEO_RANKING_API_KEY) {
    return { configured: false, scanned: 0, completed: 0, failed: 0 };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('seo_rank_targets')
    .select('id,organization_id,priority,next_check_at')
    .eq('is_active', true)
    .or(`next_check_at.is.null,next_check_at.lte.${now}`)
    .order('priority', { ascending: false })
    .limit(20);

  if (error) throw new Error(`SEO_RANK_WORKER_QUERY_FAILED:${error.message}`);

  let completed = 0;
  let failed = 0;
  const failures: Array<{ target_id: string; category: string }> = [];
  for (const target of data || []) {
    try {
      await runRankingCheck({ organizationId: target.organization_id, targetId: target.id });
      completed += 1;
    } catch (error) {
      failed += 1;
      failures.push({
        target_id: target.id,
        category: error instanceof Error && error.message.startsWith('SEO_RANK_PROVIDER_FAILED_')
          ? 'provider_error'
          : 'rank_check_failed',
      });
    }
  }

  return {
    configured: true,
    scanned: (data || []).length,
    completed,
    failed,
    failures,
  };
}

async function handler(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const result = await runDueChecks();
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'Ranking worker failed.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const GET = handler;
export const POST = handler;
