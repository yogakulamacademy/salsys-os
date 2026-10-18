import { NextRequest, NextResponse } from 'next/server';

import {
  getSeoNextBestActions,
  stageSeoDecisionAction,
} from '@/lib/search/seo-decision';
import { buildSeoDecisionForecast } from '@/lib/search/seo-decision-forecast';
import { getSeoDecisionWorkspaceContext } from '@/lib/search/seo-decision-workspace';
import { persistSeoForecastSnapshot } from '@/lib/search/seo-forecast-calibration';
import { requireSingleActiveTenant } from '@/lib/tenant/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const STAGING_ROLES = new Set(['owner', 'admin', 'manager']);

function parseLimit(value: string | null) {
  if (!value) return 5;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 25)) : 5;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'SEO decision intelligence failed.';
  if (message === 'AUTH_REQUIRED') return { status: 401, error: 'Authentication required.' };
  if (message === 'ACTIVE_TENANT_REQUIRED') return { status: 403, error: 'An active organization is required.' };
  if (message === 'MULTIPLE_ACTIVE_TENANTS') return { status: 409, error: 'Account tenant configuration requires attention.' };
  if (message === 'TENANT_RESOLUTION_FAILED') return { status: 500, error: 'Unable to resolve organization.' };
  if (message === 'SEO_DECISION_TENANT_FILTER_VIOLATION') return { status: 500, error: 'Decision safety check failed.' };
  if (message === 'SEO_DECISION_STAGE_INPUT_REQUIRED') return { status: 400, error: 'A valid page is required.' };
  return { status: 503, error: 'SEO decision intelligence is temporarily unavailable.' };
}

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireSingleActiveTenant();
    const params = request.nextUrl.searchParams;
    const result = await getSeoNextBestActions({
      organizationId: tenant.organizationId,
      siteId: params.get('site_id'),
      limit: parseLimit(params.get('limit')),
    });

    return NextResponse.json(
      {
        ok: true,
        generated_at: result.generatedAt,
        top_recommendation: result.topRecommendation,
        recommendations: result.recommendations,
        count: result.recommendations.length,
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

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireSingleActiveTenant();
    if (!STAGING_ROLES.has(tenant.role)) {
      return NextResponse.json(
        { ok: false, error: 'You do not have permission to stage SEO actions.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let input: Record<string, unknown> = {};
    try {
      const body = await request.json();
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        input = body as Record<string, unknown>;
      }
    } catch {
      input = {};
    }

    const pageId = typeof input.page_id === 'string'
      ? input.page_id.trim()
      : typeof input.pageId === 'string'
        ? input.pageId.trim()
        : '';

    let stagedForecast: ReturnType<typeof buildSeoDecisionForecast> | null = null;
    let stagedActionKind = 'other';
    try {
      const [decisions, context] = await Promise.all([
        getSeoNextBestActions({ organizationId: tenant.organizationId, limit: 25 }),
        getSeoDecisionWorkspaceContext(tenant.organizationId),
      ]);
      const recommendation = decisions.recommendations.find((item) => item.page_id === pageId);
      if (recommendation) {
        const profile = context.learningProfiles.find((item) => item.action_kind === recommendation.recommended_action_kind) || null;
        stagedActionKind = recommendation.recommended_action_kind;
        stagedForecast = buildSeoDecisionForecast(recommendation, profile);
      }
    } catch {
      stagedForecast = null;
    }

    const result = await stageSeoDecisionAction({
      organizationId: tenant.organizationId,
      pageId,
      createdBy: tenant.userId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, reason: result.reason || 'Unable to stage this recommendation.' },
        { status: result.reason === 'decision_candidate_not_found' ? 409 : 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let forecastSnapshotSaved = false;
    if (stagedForecast && result.experimentId) {
      try {
        const snapshot = await persistSeoForecastSnapshot({
          organizationId: tenant.organizationId,
          experimentId: result.experimentId,
          actionId: result.actionId,
          pageId,
          actionKind: stagedActionKind,
          forecast: stagedForecast,
        });
        forecastSnapshotSaved = snapshot.ok;
      } catch {
        forecastSnapshotSaved = false;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        created: result.created,
        reason: result.reason,
        action_id: result.actionId,
        experiment_id: result.experimentId,
        experiment_status: result.experimentStatus,
        approval_status: result.approvalStatus,
        execution_status: result.executionStatus,
        execution_gate: result.executionGate,
        automatic_publish_enabled: result.automaticPublishEnabled,
        priority_score: result.priorityScore,
        primary_metric: result.primaryMetric,
        forecast_snapshot_saved: forecastSnapshotSaved,
      },
      {
        status: result.created ? 201 : 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json(
      { ok: false, error: safe.error },
      { status: safe.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
