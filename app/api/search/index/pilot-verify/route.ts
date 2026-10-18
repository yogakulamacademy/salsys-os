import { NextRequest, NextResponse } from 'next/server';

import { runClaudeSeoIntelligence } from '@/lib/seo/claude-intelligence';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const ALLOWED_BRANCH = 'feature/claude-seo-intelligence-v1';
const PILOT_SLUG = 'yogakulam-academy';
const PROBE = 'claude-v1-7f4c9d31c8a2';

function arrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export async function GET(request: NextRequest) {
  if (
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL_GIT_COMMIT_REF !== ALLOWED_BRANCH ||
    request.nextUrl.searchParams.get('probe') !== PROBE
  ) {
    return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
  }

  try {
    const admin = createAdminClient();
    const { data: organization, error } = await admin
      .from('organizations')
      .select('id')
      .eq('slug', PILOT_SLUG)
      .maybeSingle();

    if (error || !organization?.id) throw new Error('PILOT_ORGANIZATION_NOT_FOUND');

    const analysis = await runClaudeSeoIntelligence(String(organization.id));
    const output = analysis?.output && typeof analysis.output === 'object' && !Array.isArray(analysis.output)
      ? analysis.output as Record<string, unknown>
      : {};

    const rankingStatus = typeof output.ranking_evidence_status === 'string'
      ? output.ranking_evidence_status
      : null;

    return NextResponse.json({
      ok: analysis?.status === 'completed'
        && rankingStatus === 'unavailable_without_live_rank_provider'
        && output.human_approval_required === true,
      runId: analysis?.id || null,
      status: analysis?.status || null,
      provider: analysis?.model_provider || null,
      model: analysis?.model_name || null,
      promptVersion: analysis?.prompt_version || null,
      executiveSummaryPresent: typeof output.executive_summary === 'string' && output.executive_summary.length > 0,
      findings: arrayCount(output.findings),
      opportunities: arrayCount(output.opportunities),
      actions: arrayCount(output.actions),
      caveats: arrayCount(output.caveats),
      rankingEvidenceStatus: rankingStatus,
      humanApprovalRequired: output.human_approval_required === true,
    }, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'CLAUDE_SEO_VERIFY_FAILED',
    }, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  }
}
