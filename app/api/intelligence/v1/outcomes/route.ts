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
const MAX_RECOMMENDATIONS_PER_RUN = 100;

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

export async function GET() {
  try {
    const context = await getSystemIntelligenceContext();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('system_intelligence_recommendations')
      .select('id,state,baseline_metric,last_outcome_class,last_outcome_at')
      .eq('organization_id', context.organizationId)
      .order('updated_at', { ascending: false })
      .limit(250);

    if (error) throw new Error(`INTELLIGENCE_OUTCOME_SUMMARY_FAILED:${error.message}`);

    const rows = data ?? [];
    const observable = rows.filter((row) => Boolean(row.baseline_metric)).length;
    const observed = rows.filter((row) => Boolean(row.last_outcome_at)).length;
    const positive = rows.filter((row) => row.last_outcome_class === 'positive').length;
    const neutral = rows.filter((row) => row.last_outcome_class === 'neutral').length;
    const negative = rows.filter((row) => row.last_outcome_class === 'negative').length;
    const inconclusive = rows.filter((row) => row.last_outcome_class === 'inconclusive').length;

    return NextResponse.json(
      {
        ok: true,
        learning: {
          total: rows.length,
          observable,
          observed,
          positive,
          neutral,
          negative,
          inconclusive,
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
      .select('id,signal_id,state,acted_at,baseline_metric,baseline_value,desired_direction,last_outcome_at,last_outcome_class,last_outcome_value')
      .eq('organization_id', context.organizationId)
      .eq('state', 'acted')
      .not('baseline_value', 'is', null)
      .not('desired_direction', 'is', null)
      .order('acted_at', { ascending: true })
      .limit(MAX_RECOMMENDATIONS_PER_RUN);

    if (error) throw new Error(`INTELLIGENCE_OUTCOME_LOAD_FAILED:${error.message}`);

    let evaluated = 0;
    let recorded = 0;
    let skippedImmature = 0;
    let skippedUnchanged = 0;
    let skippedUnavailable = 0;
    const classifications = { positive: 0, neutral: 0, negative: 0, inconclusive: 0 };

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

      if (!measurement || measurement.metric !== recommendation.baseline_metric) {
        skippedUnavailable += 1;
        continue;
      }

      evaluated += 1;
      const outcome = classifyObservedOutcome({
        baselineValue,
        currentValue: measurement.value,
        desiredDirection,
      });
      classifications[outcome.outcomeClass] += 1;

      const lastValue = asNumberOrNull(recommendation.last_outcome_value);
      if (
        recommendation.last_outcome_class === outcome.outcomeClass
        && lastValue !== null
        && Math.abs(lastValue - measurement.value) < 0.000001
      ) {
        skippedUnchanged += 1;
        continue;
      }

      const { error: eventError } = await admin
        .from('system_intelligence_recommendation_events')
        .insert({
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

      recorded += 1;
    }

    return NextResponse.json(
      {
        ok: true,
        evaluated,
        recorded,
        skipped_immature: skippedImmature,
        skipped_unchanged: skippedUnchanged,
        skipped_unavailable: skippedUnavailable,
        classifications,
        observation_note: 'Outcome classifications describe observed metric movement after an action. They do not claim that the recommendation caused the change.',
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
