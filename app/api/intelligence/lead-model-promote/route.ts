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

type SuccessorRow = {
  organization_id: string;
  candidate_model_version_id: string;
  model_key: string;
  candidate_version: string;
  incumbent_model_version_id: string | null;
  base_promotion_allowed: boolean | null;
  successor_promotion_allowed: boolean | null;
  successor_promotion_reason: string | null;
  comparison_result: string | null;
  shared_lead_count: number | null;
};

type CandidateModelRow = {
  id: string;
  organization_id: string;
  model_key: string;
  trained_at: string | null;
  created_at: string;
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
    const [successorResult, candidatesResult] = await Promise.all([
      admin
        .from('v_r10_lead_model_successor_readiness_v1')
        .select('organization_id,candidate_model_version_id,model_key,candidate_version,incumbent_model_version_id,base_promotion_allowed,successor_promotion_allowed,successor_promotion_reason,comparison_result,shared_lead_count')
        .eq('model_key', 'conversion_probability'),
      admin
        .from('lead_scoring_model_versions')
        .select('id,organization_id,model_key,trained_at,created_at')
        .eq('model_key', 'conversion_probability')
        .eq('status', 'candidate'),
    ]);

    if (successorResult.error || candidatesResult.error) {
      console.error('R10_MODEL_PROMOTION_SOURCE_FAILED', {
        successorError: successorResult.error,
        candidatesError: candidatesResult.error,
      });
      return NextResponse.json(
        { ok: false, error: 'Model promotion readiness could not be read.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const successors = (successorResult.data ?? []) as SuccessorRow[];
    const candidates = (candidatesResult.data ?? []) as CandidateModelRow[];
    const candidateById = new Map(candidates.map((row) => [row.id, row]));

    const eligible = successors.filter((row) => row.successor_promotion_allowed === true);
    const selectedByOrg = new Map<string, SuccessorRow>();

    for (const row of eligible) {
      const key = `${row.organization_id}:${row.model_key}`;
      const current = selectedByOrg.get(key);
      if (!current) {
        selectedByOrg.set(key, row);
        continue;
      }

      const currentModel = candidateById.get(current.candidate_model_version_id);
      const nextModel = candidateById.get(row.candidate_model_version_id);
      const currentTime = Date.parse(currentModel?.trained_at ?? currentModel?.created_at ?? '1970-01-01T00:00:00Z');
      const nextTime = Date.parse(nextModel?.trained_at ?? nextModel?.created_at ?? '1970-01-01T00:00:00Z');
      if (nextTime > currentTime) selectedByOrg.set(key, row);
    }

    const results: Array<Record<string, unknown>> = [];

    for (const row of selectedByOrg.values()) {
      const { data, error } = await admin.rpc('promote_r10_lead_scoring_model_v1', {
        p_model_version_id: row.candidate_model_version_id,
        p_actor: 'scheduled_model_promoter',
      });

      if (error) {
        console.error('R10_MODEL_PROMOTION_RPC_FAILED', row.organization_id, row.candidate_model_version_id, error);
        results.push({
          organizationId: row.organization_id,
          candidateModelVersionId: row.candidate_model_version_id,
          action: 'failed',
          reason: 'Transactional promotion RPC failed.',
        });
        continue;
      }

      const outcome = Array.isArray(data) ? data[0] : data;
      results.push({
        organizationId: row.organization_id,
        candidateModelVersionId: row.candidate_model_version_id,
        incumbentModelVersionId: row.incumbent_model_version_id,
        action: outcome?.promoted === true ? 'promoted' : 'blocked',
        comparisonResult: row.comparison_result,
        sharedLeadCount: row.shared_lead_count,
        reason: outcome?.reason ?? row.successor_promotion_reason,
        promotion: outcome,
      });
    }

    const failures = results.filter((row) => row.action === 'failed').length;

    return NextResponse.json(
      {
        ok: failures === 0,
        evaluatedCandidates: successors.length,
        eligibleCandidates: eligible.length,
        selectedForPromotion: selectedByOrg.size,
        failures,
        results,
        guardrails: {
          successor_readiness_required: true,
          one_candidate_selected_per_organization_and_model: true,
          latest_eligible_candidate_is_preferred: true,
          transactional_rpc_rechecks_all_promotion_guards: true,
          incumbent_replacement_requires_shared_realized_outcome_noninferiority: true,
        },
      },
      { status: failures === 0 ? 200 : 207, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('R10_MODEL_PROMOTION_WORKER_FAILED', error);
    return NextResponse.json(
      { ok: false, error: 'Lead-model promotion worker is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
