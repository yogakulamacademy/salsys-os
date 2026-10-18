import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { SeoDecisionForecast } from '@/lib/search/seo-decision-forecast';

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNum(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export type SeoForecastCalibrationSummary = {
  forecast_snapshots: number;
  evaluated_snapshots: number;
  direction_correct: number;
  direction_accuracy_pct: number | null;
  mean_absolute_error_pct: number | null;
  mean_signed_error_pct: number | null;
  mean_predicted_effect_pct: number | null;
  mean_actual_effect_pct: number | null;
  low_confidence_snapshots: number;
  medium_confidence_snapshots: number;
  high_confidence_snapshots: number;
  last_evaluated_at: string | null;
};

export type SeoForecastCalibrationEvent = {
  id: string;
  experiment_id: string;
  action_kind: string;
  page_id: string | null;
  confidence: string;
  predicted_effect_pct: number;
  actual_effect_pct: number | null;
  absolute_error_pct: number | null;
  direction_correct: boolean | null;
  result_classification: string | null;
  captured_at: string;
  evaluated_at: string | null;
};

export async function persistSeoForecastSnapshot(input: {
  organizationId: string;
  experimentId: string;
  actionId?: string | null;
  pageId?: string | null;
  actionKind: string;
  forecast: SeoDecisionForecast;
}) {
  const base = input.forecast.scenarios.find((scenario) => scenario.name === 'base');
  if (!base) return { ok: false, reason: 'base_scenario_missing' } as const;

  const admin = createAdminClient();
  const { error } = await admin
    .from('seo_forecast_snapshots')
    .upsert({
      organization_id: input.organizationId,
      experiment_id: input.experimentId,
      action_id: input.actionId || null,
      page_id: input.pageId || null,
      model: input.forecast.model,
      scenario_name: 'base',
      confidence: input.forecast.confidence,
      predicted_effect_pct: base.uplift_pct,
      predicted_incremental_clicks: base.incremental_clicks,
      predicted_incremental_leads: base.incremental_leads,
      predicted_incremental_revenue_inr: base.incremental_revenue_inr,
      predicted_incremental_revenue_usd: base.incremental_revenue_usd,
      forecast_payload: {
        ...input.forecast,
        action_kind: input.actionKind,
      },
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'organization_id,experiment_id',
    });

  if (error) throw new Error(`SEO forecast snapshot failed: ${error.message}`);
  return { ok: true } as const;
}

export async function getSeoForecastCalibration(organizationId: string) {
  const orgId = organizationId.trim();
  if (!orgId) throw new Error('SEO_FORECAST_ORGANIZATION_REQUIRED');

  const admin = createAdminClient();
  const [summaryResult, snapshotResult] = await Promise.all([
    admin
      .from('v_seo_forecast_calibration_v1')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle(),
    admin
      .from('seo_forecast_snapshots')
      .select('id,organization_id,experiment_id,page_id,confidence,predicted_effect_pct,forecast_payload,captured_at')
      .eq('organization_id', orgId)
      .order('captured_at', { ascending: false })
      .limit(12),
  ]);

  if (summaryResult.error) throw new Error(`SEO forecast calibration query failed: ${summaryResult.error.message}`);
  if (snapshotResult.error) throw new Error(`SEO forecast calibration query failed: ${snapshotResult.error.message}`);

  const experimentIds = ((snapshotResult.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => str(row.experiment_id))
    .filter(Boolean);

  let learningRows: Array<Record<string, unknown>> = [];
  if (experimentIds.length > 0) {
    const learningResult = await admin
      .from('seo_experiment_learning_events')
      .select('id,experiment_id,action_kind,normalized_effect_pct,result_classification,evaluated_at')
      .eq('organization_id', orgId)
      .in('experiment_id', experimentIds);
    if (learningResult.error) throw new Error(`SEO forecast calibration learning query failed: ${learningResult.error.message}`);
    learningRows = (learningResult.data ?? []) as Array<Record<string, unknown>>;
  }

  const learningByExperiment = new Map(learningRows.map((row) => [str(row.experiment_id), row]));
  const recent: SeoForecastCalibrationEvent[] = ((snapshotResult.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const experimentId = str(row.experiment_id);
    const learning = learningByExperiment.get(experimentId);
    const predicted = num(row.predicted_effect_pct);
    const actual = learning ? nullableNum(learning.normalized_effect_pct) : null;
    const payload = row.forecast_payload && typeof row.forecast_payload === 'object' && !Array.isArray(row.forecast_payload)
      ? row.forecast_payload as Record<string, unknown>
      : {};
    const actionKind = str(payload.action_kind) || (learning ? str(learning.action_kind) : 'other');

    return {
      id: str(row.id),
      experiment_id: experimentId,
      action_kind: actionKind,
      page_id: str(row.page_id) || null,
      confidence: str(row.confidence) || 'low',
      predicted_effect_pct: predicted,
      actual_effect_pct: actual,
      absolute_error_pct: actual === null ? null : Math.round(Math.abs(actual - predicted) * 100) / 100,
      direction_correct: actual === null ? null : ((predicted >= 0 && actual >= 0) || (predicted < 0 && actual < 0)),
      result_classification: learning ? str(learning.result_classification) || null : null,
      captured_at: str(row.captured_at),
      evaluated_at: learning ? str(learning.evaluated_at) || null : null,
    };
  });

  const row = (summaryResult.data ?? {}) as Record<string, unknown>;
  const evaluated = num(row.evaluated_snapshots);
  const directionCorrect = num(row.direction_correct);
  const summary: SeoForecastCalibrationSummary = {
    forecast_snapshots: num(row.forecast_snapshots),
    evaluated_snapshots: evaluated,
    direction_correct: directionCorrect,
    direction_accuracy_pct: evaluated > 0 ? Math.round((directionCorrect / evaluated) * 10000) / 100 : null,
    mean_absolute_error_pct: nullableNum(row.mean_absolute_error_pct),
    mean_signed_error_pct: nullableNum(row.mean_signed_error_pct),
    mean_predicted_effect_pct: nullableNum(row.mean_predicted_effect_pct),
    mean_actual_effect_pct: nullableNum(row.mean_actual_effect_pct),
    low_confidence_snapshots: num(row.low_confidence_snapshots),
    medium_confidence_snapshots: num(row.medium_confidence_snapshots),
    high_confidence_snapshots: num(row.high_confidence_snapshots),
    last_evaluated_at: str(row.last_evaluated_at) || null,
  };

  return { summary, recent };
}
