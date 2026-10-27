import { NextRequest, NextResponse } from 'next/server';

import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const secrets = [
    process.env.SYSTEM_INTELLIGENCE_SYNC_SECRET,
    process.env.CRON_SECRET,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (secrets.length === 0) {
    throw new Error('SYSTEM_INTELLIGENCE_SYNC_SECRET or CRON_SECRET is not configured.');
  }

  return bearerMatchesAnySecret(authorization, secrets);
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const admin = createAdminClient();
    const { data: organizations, error: organizationError } = await admin
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true });

    if (organizationError) {
      console.error('PREDICTION_OUTCOME_ORGANIZATIONS_FAILED', organizationError);
      return NextResponse.json(
        { ok: false, error: 'Organizations could not be loaded.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const results: Array<{
      organizationId: string;
      ok: boolean;
      result?: unknown;
      error?: string;
    }> = [];

    for (const organization of organizations ?? []) {
      const organizationId = String(organization.id || '');
      if (!organizationId) continue;

      const { data, error } = await admin.rpc(
        'observe_event_intelligence_lead_outcomes_v1',
        {
          p_organization_id: organizationId,
          p_limit: 1000,
        },
      );

      if (error) {
        console.error('PREDICTION_OUTCOME_OBSERVER_FAILED', organizationId, error);
        results.push({
          organizationId,
          ok: false,
          error: 'Outcome observation failed.',
        });
        continue;
      }

      results.push({ organizationId, ok: true, result: data });
    }

    const failed = results.filter((row) => !row.ok).length;

    return NextResponse.json(
      {
        ok: failed === 0,
        organizationsObserved: results.length,
        failed,
        results,
        guardrails: {
          authoritative_business_outcomes_only: true,
          unresolved_predictions_remain_unresolved: true,
          prediction_values_are_not_mutated: true,
          privacy_profiling_gate_is_enforced_by_observer: true,
          probability_generation_is_not_performed_here: true,
        },
        observedAt: new Date().toISOString(),
      },
      {
        status: failed === 0 ? 200 : 207,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    console.error('PREDICTION_OUTCOME_OBSERVER_RUNNER_FAILED', error);
    return NextResponse.json(
      { ok: false, error: 'Prediction outcome observer is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
