import { NextRequest, NextResponse } from 'next/server';

import { stageClaudeSeoRecommendationAsDraft } from '@/lib/seo/claude-experiment-staging';
import { requireSingleActiveTenant } from '@/lib/tenant/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MUTATION_ROLES = new Set(['owner', 'admin', 'manager']);

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'AUTH_REQUIRED') return { status: 401, error: 'Authentication required.' };
  if (message === 'ACTIVE_TENANT_REQUIRED') return { status: 403, error: 'An active organization is required.' };
  if (message === 'MULTIPLE_ACTIVE_TENANTS') return { status: 409, error: 'Account tenant configuration requires attention.' };
  if (message === 'CLAUDE_STAGE_INPUT_INVALID' || message === 'CLAUDE_STAGE_RECOMMENDATION_INVALID') return { status: 400, error: 'Invalid recommendation staging request.' };
  if (message === 'CLAUDE_STAGE_ANALYSIS_NOT_FOUND' || message === 'CLAUDE_STAGE_RECOMMENDATION_NOT_FOUND') return { status: 404, error: 'Claude analysis recommendation was not found for this organization.' };
  if (message === 'CLAUDE_STAGE_TARGET_NOT_TENANT_SAFE') return { status: 409, error: 'The recommended target page is not available in this organization.' };
  if (message === 'CLAUDE_STAGE_GUARDRAIL_FAILED' || message === 'CLAUDE_STAGE_NOT_DRAFT') return { status: 409, error: 'Recommendation staging guardrails were not satisfied.' };
  return { status: 503, error: 'Unable to stage this recommendation right now.' };
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireSingleActiveTenant();
    if (!MUTATION_ROLES.has(tenant.role)) {
      return NextResponse.json({ ok: false, error: 'You do not have permission to stage SEO experiments.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const analysisRunId = typeof body.analysisRunId === 'string' ? body.analysisRunId.trim() : '';
    const recommendationIndex = Number(body.recommendationIndex);

    const result = await stageClaudeSeoRecommendationAsDraft({
      organizationId: tenant.organizationId,
      analysisRunId,
      recommendationIndex,
      createdBy: tenant.userId,
    });

    return NextResponse.json({
      ok: true,
      experiment: {
        id: result.experimentId,
        status: result.experimentStatus,
        created: result.created,
      },
      guardrails: {
        humanApprovalRequired: true,
        automaticPublishing: false,
        executionStarted: false,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json({ ok: false, error: safe.error }, { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
