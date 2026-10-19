import { NextRequest, NextResponse } from 'next/server';

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

  return secrets.some((secret) => authorization === `Bearer ${secret}`);
}

type RetrainingRow = {
  organization_id: string;
  model_key: string;
  active_model_version_id: string | null;
  health_status: string | null;
  retraining_recommended: boolean | null;
  candidate_model_training_allowed: boolean | null;
  retraining_run_allowed: boolean | null;
  retraining_reason: string | null;
};

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('v_r10_lead_retraining_readiness_v1')
      .select('organization_id,model_key,active_model_version_id,health_status,retraining_recommended,candidate_model_training_allowed,retraining_run_allowed,retraining_reason')
      .eq('model_key', 'conversion_probability');

    if (error) {
      console.error('R10_RETRAINING_READINESS_FAILED', error);
      return NextResponse.json(
        { ok: false, error: 'Lead-model retraining readiness could not be read.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const rows = (data ?? []) as RetrainingRow[];
    const eligible = rows.filter((row) => row.retraining_run_allowed === true);

    if (eligible.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          action: 'no_training_required',
          evaluatedOrganizations: rows.length,
          eligibleOrganizations: 0,
          readiness: rows.map((row) => ({
            organizationId: row.organization_id,
            activeModelVersionId: row.active_model_version_id,
            healthStatus: row.health_status,
            retrainingRecommended: row.retraining_recommended,
            candidateModelTrainingAllowed: row.candidate_model_training_allowed,
            retrainingRunAllowed: row.retraining_run_allowed,
            reason: row.retraining_reason,
          })),
          guardrails: {
            training_is_not_called_without_explicit_retraining_readiness: true,
            active_model_health_is_part_of_the_gate: true,
            trainer_rechecks_its_own_execution_gate: true,
          },
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const authorization = request.headers.get('authorization') ?? '';
    const trainerUrl = new URL('/api/intelligence/lead-model-train', request.nextUrl.origin);
    const trainerResponse = await fetch(trainerUrl, {
      method: 'GET',
      headers: { authorization },
      cache: 'no-store',
    });

    let trainerPayload: unknown = null;
    try {
      trainerPayload = await trainerResponse.json();
    } catch {
      trainerPayload = { error: 'Candidate trainer returned a non-JSON response.' };
    }

    if (!trainerResponse.ok) {
      console.error('R10_RETRAINING_TRAINER_FAILED', trainerResponse.status, trainerPayload);
      return NextResponse.json(
        {
          ok: false,
          action: 'trainer_failed',
          eligibleOrganizations: eligible.map((row) => row.organization_id),
          trainerStatus: trainerResponse.status,
          trainer: trainerPayload,
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        action: 'trainer_invoked',
        eligibleOrganizations: eligible.map((row) => ({
          organizationId: row.organization_id,
          activeModelVersionId: row.active_model_version_id,
          reason: row.retraining_reason,
        })),
        trainer: trainerPayload,
        guardrails: {
          orchestrator_reads_retraining_readiness_first: true,
          trainer_rechecks_dataset_and_execution_readiness: true,
          promotion_is_not_performed_by_retraining: true,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('R10_RETRAINING_ORCHESTRATOR_FAILED', error);
    return NextResponse.json(
      { ok: false, error: 'Lead-model retraining orchestrator is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
