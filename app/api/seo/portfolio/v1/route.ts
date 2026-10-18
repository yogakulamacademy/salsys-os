import { NextRequest, NextResponse } from 'next/server';

import { getSeoNextBestActions } from '@/lib/search/seo-decision';
import { buildSeoDecisionForecast } from '@/lib/search/seo-decision-forecast';
import { getSeoDecisionWorkspaceContext } from '@/lib/search/seo-decision-workspace';
import { getSeoForecastCalibration } from '@/lib/search/seo-forecast-calibration';
import { buildSeoOpportunityPortfolio } from '@/lib/search/seo-opportunity-portfolio';
import { requireSingleActiveTenant } from '@/lib/tenant/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function parseCapacity(value: string | null) {
  if (!value) return 5;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 10)) : 5;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'SEO opportunity portfolio failed.';
  if (message === 'AUTH_REQUIRED') return { status: 401, error: 'Authentication required.' };
  if (message === 'ACTIVE_TENANT_REQUIRED') return { status: 403, error: 'An active organization is required.' };
  if (message === 'MULTIPLE_ACTIVE_TENANTS') return { status: 409, error: 'Account tenant configuration requires attention.' };
  if (message === 'TENANT_RESOLUTION_FAILED') return { status: 500, error: 'Unable to resolve organization.' };
  if (message === 'SEO_DECISION_TENANT_FILTER_VIOLATION') return { status: 500, error: 'Decision safety check failed.' };
  return { status: 503, error: 'SEO opportunity portfolio is temporarily unavailable.' };
}

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireSingleActiveTenant();
    const capacity = parseCapacity(request.nextUrl.searchParams.get('capacity'));

    const [decisions, context, calibration] = await Promise.all([
      getSeoNextBestActions({ organizationId: tenant.organizationId, limit: 25 }),
      getSeoDecisionWorkspaceContext(tenant.organizationId),
      getSeoForecastCalibration(tenant.organizationId),
    ]);

    const profileByAction = new Map(context.learningProfiles.map((profile) => [profile.action_kind, profile]));
    const forecasts = new Map(
      decisions.recommendations.map((recommendation) => [
        recommendation.page_id,
        buildSeoDecisionForecast(recommendation, profileByAction.get(recommendation.recommended_action_kind) || null),
      ]),
    );

    const portfolio = buildSeoOpportunityPortfolio({
      recommendations: decisions.recommendations,
      forecasts,
      capacity,
    });

    return NextResponse.json(
      {
        ok: true,
        decision_version: decisions.decisionVersion,
        portfolio,
        calibration: calibration.summary,
        recent_calibration: calibration.recent,
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
