import { NextRequest, NextResponse } from 'next/server';

import {
  addCompetitor,
  addRankTarget,
  createDraftExperimentFromCompetitorRecommendation,
  getCompetitorIntelligence,
  runClaudeCompetitorAnalysis,
  runRankingCheck,
} from '@/lib/seo/competitor-intelligence';
import { requireSingleActiveTenant } from '@/lib/tenant/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MUTATION_ROLES = new Set(['owner', 'admin', 'manager']);

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'SEO competitor intelligence failed.';
  if (message === 'AUTH_REQUIRED') return { status: 401, error: 'Authentication required.' };
  if (message === 'ACTIVE_TENANT_REQUIRED') return { status: 403, error: 'An active organization is required.' };
  if (message === 'MULTIPLE_ACTIVE_TENANTS') return { status: 409, error: 'Account tenant configuration requires attention.' };
  if (message === 'CLAUDE_NOT_CONFIGURED') return { status: 503, error: 'Claude analysis is not configured.' };
  if (message === 'SEO_RANK_PROVIDER_NOT_CONFIGURED') return { status: 503, error: 'A real-time ranking provider is not configured yet.' };
  if (message.includes('DOMAIN_') || message.includes('QUERY_INVALID') || message.includes('SURFACE_INVALID')) return { status: 400, error: 'Invalid competitor or ranking input.' };
  if (message === 'SEO_RANK_TARGET_NOT_FOUND') return { status: 404, error: 'Ranking target was not found.' };
  if (message === 'SEO_COMPETITOR_RECOMMENDATION_INVALID') return { status: 400, error: 'The competitor recommendation is invalid.' };
  if (message.startsWith('SEO_COMPETITOR_EXPERIMENT_CREATE_FAILED')) return { status: 409, error: 'Unable to create the draft experiment from this recommendation.' };
  return { status: 503, error: 'SEO competitor intelligence is temporarily unavailable.' };
}

export async function GET() {
  try {
    const tenant = await requireSingleActiveTenant();
    const result = await getCompetitorIntelligence(tenant.organizationId);
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json({ ok: false, error: safe.error }, { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireSingleActiveTenant();
    if (!MUTATION_ROLES.has(tenant.role)) {
      return NextResponse.json({ ok: false, error: 'You do not have permission to change SEO competitor settings.' }, { status: 403 });
    }
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'add_competitor') {
      const result = await addCompetitor({
        organizationId: tenant.organizationId,
        domain: String(body.domain || ''),
        displayName: typeof body.display_name === 'string' ? body.display_name : undefined,
        competitorType: typeof body.competitor_type === 'string' ? body.competitor_type : undefined,
      });
      return NextResponse.json({ ok: true, competitor: result }, { status: 201 });
    }

    if (action === 'add_rank_target') {
      const surface = body.surface === 'aeo' || body.surface === 'geo' ? body.surface : 'seo';
      const result = await addRankTarget({
        organizationId: tenant.organizationId,
        query: String(body.query || ''),
        surface,
        locale: typeof body.locale === 'string' ? body.locale : undefined,
        countryCode: typeof body.country_code === 'string' ? body.country_code : undefined,
        device: body.device === 'mobile' ? 'mobile' : 'desktop',
        engine: typeof body.engine === 'string' ? body.engine : undefined,
        priority: typeof body.priority === 'number' ? body.priority : undefined,
        intervalMinutes: typeof body.check_interval_minutes === 'number' ? body.check_interval_minutes : undefined,
      });
      return NextResponse.json({ ok: true, target: result }, { status: 201 });
    }

    if (action === 'analyze') {
      const result = await runClaudeCompetitorAnalysis(tenant.organizationId, tenant.userId);
      return NextResponse.json({ ok: true, analysis: result });
    }

    if (action === 'check_rank') {
      const targetId = typeof body.target_id === 'string' ? body.target_id : '';
      const result = await runRankingCheck({ organizationId: tenant.organizationId, targetId });
      return NextResponse.json({ ok: true, snapshot: result });
    }

    if (action === 'create_draft_experiment') {
      const analysisRunId = typeof body.analysis_run_id === 'string' ? body.analysis_run_id : '';
      const recommendationIndex = typeof body.recommendation_index === 'number' ? body.recommendation_index : -1;
      const result = await createDraftExperimentFromCompetitorRecommendation({
        organizationId: tenant.organizationId,
        analysisRunId,
        recommendationIndex,
        createdBy: tenant.userId,
      });
      return NextResponse.json({
        ok: true,
        experiment: result,
        guardrail: 'draft_only_human_approval_required',
      }, { status: 201 });
    }

    return NextResponse.json({ ok: false, error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json({ ok: false, error: safe.error }, { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
