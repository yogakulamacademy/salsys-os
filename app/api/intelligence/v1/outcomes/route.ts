import { NextResponse } from 'next/server';

import { getDashboardSnapshot } from '@/lib/dashboard-data';
import {
  classifyObservedOutcome,
  measureRecommendationSignal,
} from '@/lib/intelligence/recommendation-outcomes';
import { getSystemIntelligenceContext } from '@/lib/intelligence/system-intelligence-context';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_OUTCOME_AGE_MS = 60 * 60 * 1000;
const MIN_BUSINESS_OUTCOME_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_RECOMMENDATIONS_PER_RUN = 100;
const STAGE_RANK: Record<string, number> = {
  new: 0,
  contacted: 1,
  engaged: 2,
  qualified: 3,
  high_intent: 4,
  payment_pending: 5,
  enrolled: 6,
};
const NEGATIVE_STAGES = new Set(['not_now', 'lost', 'unqualified']);

type BusinessClass = 'positive' | 'neutral' | 'negative' | 'mixed' | 'inconclusive';

function asNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function commonHeaders() {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Robots-Tag': 'noindex',
  };
}

function classifyBusinessEvidence(input: {
  forwardStages: number;
  negativeStages: number;
  payments: number;
  enrollments: number;
}) {
  const positive = input.forwardStages + input.payments + input.enrollments;
  const negative = input.negativeStages;
  let outcomeClass: BusinessClass = 'neutral';
  if (positive > 0 && negative > 0) outcomeClass = 'mixed';
  else if (positive > 0) outcomeClass = 'positive';
  else if (negative > 0) outcomeClass = 'negative';

  const summary = [
    `${input.forwardStages} forward stage transition${input.forwardStages === 1 ? '' : 's'}`,
    `${input.payments} completed payment${input.payments === 1 ? '' : 's'}`,
    `${input.enrollments} enrollment${input.enrollments === 1 ? '' : 's'}`,
    `${input.negativeStages} negative stage transition${input.negativeStages === 1 ? '' : 's'}`,
  ].join('; ');

  return { outcomeClass, summary, positive, negative };
}

export async function GET() {
  try {
    const context = await getSystemIntelligenceContext();
    const supabase = await createClient();
    const [{ data, error }, { data: profiles, error: profileError }] = await Promise.all([
      supabase
        .from('system_intelligence_recommendations')
        .select('id,state,baseline_metric,last_outcome_class,last_outcome_at,last_business_outcome_class,last_business_outcome_at,target_lead_count')
        .eq('organization_id', context.organizationId)
        .order('updated_at', { ascending: false })
        .limit(250),
      supabase
        .from('system_intelligence_learning_profiles')
        .select('signal_id,role_scope,outcome_samples,score_adjustment,confidence,positive_count,negative_count,neutral_count')
        .eq('organization_id', context.organizationId)
        .order('outcome_samples', { ascending: false })
        .limit(100),
    ]);

    if (error) throw new Error(`INTELLIGENCE_OUTCOME_SUMMARY_FAILED:${error.message}`);
    if (profileError) throw new Error(`INTELLIGENCE_PROFILE_SUMMARY_FAILED:${profileError.message}`);

    const rows = data ?? [];
    return NextResponse.json(
      {
        ok: true,
        learning: {
          total: rows.length,
          observable: rows.filter((row) => Boolean(row.baseline_metric)).length,
          linked_to_leads: rows.filter((row) => Number(row.target_lead_count || 0) > 0).length,
          observed: rows.filter((row) => Boolean(row.last_outcome_at)).length,
          business_observed: rows.filter((row) => Boolean(row.last_business_outcome_at)).length,
          positive: rows.filter((row) => row.last_outcome_class === 'positive').length,
          neutral: rows.filter((row) => row.last_outcome_class === 'neutral').length,
          negative: rows.filter((row) => row.last_outcome_class === 'negative').length,
          business_positive: rows.filter((row) => row.last_business_outcome_class === 'positive').length,
          business_negative: rows.filter((row) => row.last_business_outcome_class === 'negative').length,
          calibrated_profiles: (profiles ?? []).filter((row) => Number(row.outcome_samples || 0) >= 5),
        },
      },
      { headers: commonHeaders() },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message.toLowerCase().includes('authenticate') || message.toLowerCase().includes('authenticated');
    return NextResponse.json(
      { ok: false, error: unauthenticated ? 'Authentication required.' : 'Unable to load recommendation learning.' },
      { status: unauthenticated ? 401 : 503, headers: commonHeaders() },
    );
  }
}

export async function POST() {
  try {
    const now = new Date();
    const [snapshot, context] = await Promise.all([
      getDashboardSnapshot(),
      getSystemIntelligenceContext(now),
    ]);
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('system_intelligence_recommendations')
      .select('id,signal_id,role_scope,state,acted_at,baseline_metric,baseline_value,desired_direction,last_outcome_at,last_outcome_class,last_outcome_value,target_lead_ids,target_lead_count,last_business_outcome_class,last_business_outcome_summary')
      .eq('organization_id', context.organizationId)
      .eq('state', 'acted')
      .order('acted_at', { ascending: true })
      .limit(MAX_RECOMMENDATIONS_PER_RUN);

    if (error) throw new Error(`INTELLIGENCE_OUTCOME_LOAD_FAILED:${error.message}`);

    let metricRecorded = 0;
    let businessRecorded = 0;
    let skippedImmature = 0;
    let skippedUnchanged = 0;
    let skippedUnavailable = 0;
    const classifications = { positive: 0, neutral: 0, negative: 0, inconclusive: 0 };
    const businessClassifications = { positive: 0, neutral: 0, negative: 0, mixed: 0, inconclusive: 0 };
    const touchedProfiles = new Set<string>();

    for (const recommendation of data ?? []) {
      const actedAt = recommendation.acted_at ? Date.parse(recommendation.acted_at) : NaN;
      if (!Number.isFinite(actedAt) || now.getTime() - actedAt < MIN_OUTCOME_AGE_MS) {
        skippedImmature += 1;
        continue;
      }

      const baselineValue = asNumberOrNull(recommendation.baseline_value);
      const desiredDirection = recommendation.desired_direction === 'decrease' || recommendation.desired_direction === 'increase'
        ? recommendation.desired_direction
        : null;
      const measurement = measureRecommendationSignal(recommendation.signal_id, snapshot, context);

      if (measurement && measurement.metric === recommendation.baseline_metric && baselineValue !== null && desiredDirection) {
        const outcome = classifyObservedOutcome({ baselineValue, currentValue: measurement.value, desiredDirection });
        classifications[outcome.outcomeClass] += 1;
        const lastValue = asNumberOrNull(recommendation.last_outcome_value);
        const unchanged = recommendation.last_outcome_class === outcome.outcomeClass
          && lastValue !== null
          && Math.abs(lastValue - measurement.value) < 0.000001;

        if (!unchanged) {
          const { error: eventError } = await admin.from('system_intelligence_recommendation_events').insert({
            organization_id: context.organizationId,
            recommendation_id: recommendation.id,
            event_type: 'outcome_observed',
            actor_user_id: null,
            outcome_class: outcome.outcomeClass,
            outcome_metric: measurement.metric,
            outcome_delta: outcome.delta,
            note: outcome.note,
          });
          if (eventError) throw new Error(`INTELLIGENCE_OUTCOME_EVENT_FAILED:${eventError.message}`);

          const { error: updateError } = await admin
            .from('system_intelligence_recommendations')
            .update({
              last_outcome_at: now.toISOString(),
              last_outcome_class: outcome.outcomeClass,
              last_outcome_value: measurement.value,
              updated_at: now.toISOString(),
            })
            .eq('organization_id', context.organizationId)
            .eq('id', recommendation.id);
          if (updateError) throw new Error(`INTELLIGENCE_OUTCOME_UPDATE_FAILED:${updateError.message}`);
          metricRecorded += 1;
          touchedProfiles.add(`${recommendation.signal_id}::${recommendation.role_scope}`);
        } else {
          skippedUnchanged += 1;
        }
      } else if (recommendation.baseline_metric) {
        skippedUnavailable += 1;
      }

      const targetIds = Array.isArray(recommendation.target_lead_ids)
        ? recommendation.target_lead_ids.filter((value): value is string => typeof value === 'string').slice(0, 500)
        : [];
      if (targetIds.length === 0 || now.getTime() - actedAt < MIN_BUSINESS_OUTCOME_AGE_MS) continue;

      const actedIso = new Date(actedAt).toISOString();
      const [stageResult, paymentResult, enrollmentResult] = await Promise.all([
        admin.from('lead_stage_history').select('lead_id,from_stage,to_stage,changed_at').in('lead_id', targetIds).gte('changed_at', actedIso).limit(2000),
        admin.from('payments').select('lead_id,paid_at').eq('organization_id', context.organizationId).in('lead_id', targetIds).not('paid_at', 'is', null).gte('paid_at', actedIso).limit(1000),
        admin.from('enrollments').select('lead_id,enrolled_at').eq('organization_id', context.organizationId).in('lead_id', targetIds).not('enrolled_at', 'is', null).gte('enrolled_at', actedIso).limit(1000),
      ]);
      if (stageResult.error || paymentResult.error || enrollmentResult.error) {
        skippedUnavailable += 1;
        continue;
      }

      let forwardStages = 0;
      let negativeStages = 0;
      for (const row of stageResult.data ?? []) {
        const to = String(row.to_stage || '');
        const from = String(row.from_stage || '');
        if (NEGATIVE_STAGES.has(to)) negativeStages += 1;
        else if ((STAGE_RANK[to] ?? -1) > (STAGE_RANK[from] ?? -1)) forwardStages += 1;
      }

      const business = classifyBusinessEvidence({
        forwardStages,
        negativeStages,
        payments: paymentResult.data?.length ?? 0,
        enrollments: enrollmentResult.data?.length ?? 0,
      });
      businessClassifications[business.outcomeClass] += 1;

      if (
        recommendation.last_business_outcome_class === business.outcomeClass
        && recommendation.last_business_outcome_summary === business.summary
      ) continue;

      const { error: businessEventError } = await admin.from('system_intelligence_recommendation_events').insert({
        organization_id: context.organizationId,
        recommendation_id: recommendation.id,
        event_type: 'business_outcome_observed',
        actor_user_id: null,
        outcome_class: business.outcomeClass,
        outcome_metric: 'linked_lead_business_progression',
        outcome_delta: business.positive - business.negative,
        note: `${business.summary}. Observed after the action across the linked lead set; this does not establish causation.`,
      });
      if (businessEventError) throw new Error(`INTELLIGENCE_BUSINESS_OUTCOME_EVENT_FAILED:${businessEventError.message}`);

      const { error: businessUpdateError } = await admin
        .from('system_intelligence_recommendations')
        .update({
          last_business_outcome_at: now.toISOString(),
          last_business_outcome_class: business.outcomeClass,
          last_business_outcome_summary: business.summary,
          updated_at: now.toISOString(),
        })
        .eq('organization_id', context.organizationId)
        .eq('id', recommendation.id);
      if (businessUpdateError) throw new Error(`INTELLIGENCE_BUSINESS_OUTCOME_UPDATE_FAILED:${businessUpdateError.message}`);

      businessRecorded += 1;
      touchedProfiles.add(`${recommendation.signal_id}::${recommendation.role_scope}`);
    }

    for (const key of touchedProfiles) {
      const [signalId, roleScope] = key.split('::');
      const { error: profileError } = await admin.rpc('recompute_system_intelligence_learning_profile_v1', {
        p_organization_id: context.organizationId,
        p_signal_id: signalId,
        p_role_scope: roleScope,
      });
      if (profileError) throw new Error(`INTELLIGENCE_PROFILE_RECOMPUTE_FAILED:${profileError.message}`);
    }

    return NextResponse.json(
      {
        ok: true,
        metric_recorded: metricRecorded,
        business_recorded: businessRecorded,
        skipped_immature: skippedImmature,
        skipped_unchanged: skippedUnchanged,
        skipped_unavailable: skippedUnavailable,
        metric_classifications: classifications,
        business_classifications: businessClassifications,
        profiles_recomputed: touchedProfiles.size,
        observation_note: 'Outcome classifications describe observed changes after an action. They do not claim the recommendation caused the change.',
      },
      { headers: commonHeaders() },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message.toLowerCase().includes('authenticate') || message.toLowerCase().includes('authenticated');
    return NextResponse.json(
      { ok: false, error: unauthenticated ? 'Authentication required.' : 'Unable to evaluate recommendation outcomes.' },
      { status: unauthenticated ? 401 : 503, headers: commonHeaders() },
    );
  }
}
