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

function errorCategory(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('SEO_RANK_PROVIDER_FAILED_')) return 'provider_error';
  if (message === 'SEO_RANK_PROVIDER_NOT_CONFIGURED') return 'provider_not_configured';
  if (message === 'SEO_RANK_TARGET_NOT_FOUND') return 'target_not_found';
  if (message.startsWith('SEO_RANK_SAVE_FAILED')) return 'snapshot_save_failed';
  return 'rank_check_failed';
}

async function runDueChecks() {
  if (!process.env.SEO_RANKING_API_URL || !process.env.SEO_RANKING_API_KEY) {
    return { configured: false, scanned: 0, completed: 0, failed: 0 };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('claim_due_seo_rank_targets_v1', {
    p_limit: 20,
    p_lease_seconds: 180,
  });
  if (error) throw new Error(`SEO_RANK_WORKER_CLAIM_FAILED:${error.message}`);

  const claimed = Array.isArray(data) ? data : [];
  let completed = 0;
  let failed = 0;
  const failures: Array<{ target_id: string; category: string }> = [];

  for (const target of claimed) {
    const leaseToken = String(target.lease_token || '');
    if (!leaseToken) continue;
    try {
      await runRankingCheck({ organizationId: target.organization_id, targetId: target.id });
      const { data: finalized, error: finalizeError } = await admin.rpc('complete_seo_rank_target_check_v1', {
        p_target_id: target.id,
        p_lease_token: leaseToken,
        p_success: true,
        p_error_category: null,
      });
      if (finalizeError || finalized !== true) {
        throw new Error('SEO_RANK_WORKER_FINALIZE_FAILED');
      }
      completed += 1;
    } catch (error) {
      failed += 1;
      const category = errorCategory(error);
      failures.push({ target_id: target.id, category });
      await admin.rpc('complete_seo_rank_target_check_v1', {
        p_target_id: target.id,
        p_lease_token: leaseToken,
        p_success: false,
        p_error_category: category,
      });
    }
  }

  return {
    configured: true,
    scanned: claimed.length,
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
