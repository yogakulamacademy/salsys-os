import { NextResponse } from 'next/server';

import { getSeoNextBestActions } from '@/lib/search/seo-decision';
import { getSeoDecisionWorkspaceContext } from '@/lib/search/seo-decision-workspace';
import { requireSingleActiveTenant } from '@/lib/tenant/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'SEO decision workspace failed.';
  if (message === 'AUTH_REQUIRED') return { status: 401, error: 'Authentication required.' };
  if (message === 'ACTIVE_TENANT_REQUIRED') return { status: 403, error: 'An active organization is required.' };
  if (message === 'MULTIPLE_ACTIVE_TENANTS') return { status: 409, error: 'Account tenant configuration requires attention.' };
  if (message === 'TENANT_RESOLUTION_FAILED') return { status: 500, error: 'Unable to resolve organization.' };
  if (message === 'SEO_DECISION_TENANT_FILTER_VIOLATION') return { status: 500, error: 'Decision safety check failed.' };
  return { status: 503, error: 'SEO decision workspace is temporarily unavailable.' };
}

export async function GET() {
  try {
    const tenant = await requireSingleActiveTenant();

    const [decisions, context] = await Promise.all([
      getSeoNextBestActions({
        organizationId: tenant.organizationId,
        limit: 8,
      }),
      getSeoDecisionWorkspaceContext(tenant.organizationId),
    ]);

    return NextResponse.json(
      {
        ok: true,
        decision_version: decisions.decisionVersion,
        generated_at: decisions.generatedAt,
        role: tenant.role,
        top_recommendation: decisions.topRecommendation,
        recommendations: decisions.recommendations,
        learning_health: context.health,
        recent_learning: context.learningEvents,
        experiments: context.experiments,
        actions: context.actions,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json(
      { ok: false, error: safe.error },
      { status: safe.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
