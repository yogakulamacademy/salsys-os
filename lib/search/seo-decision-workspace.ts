import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { SeoActionLearningProfile } from '@/lib/search/seo-decision-forecast';

export type SeoLearningHealth = {
  enabled: boolean;
  auto_finalize: boolean;
  auto_capture_outcomes: boolean;
  outcome_lag_days: number;
  max_outcomes_per_sweep: number;
  running_experiments: number;
  running_with_baseline: number;
  running_with_final: number;
  outcomes_due: number;
  learning_events: number;
  learned_outcomes: number;
  failed_outcomes: number;
  latest_gsc_date: string | null;
  last_outcome_capture_at: string | null;
  last_learning_at: string | null;
};

export type SeoLearningEvent = {
  id: string;
  experiment_id: string;
  action_kind: string;
  page_type: string | null;
  primary_metric: string;
  baseline_value: number;
  outcome_value: number;
  normalized_effect_pct: number;
  result_classification: string;
  result_confidence: string;
  learning_summary: string;
  evaluated_at: string;
};

export type SeoDecisionExperiment = {
  id: string;
  title: string;
  status: string;
  primary_metric: string;
  minimum_observation_days: number;
  target_page_id: string | null;
  target_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  result_classification: string | null;
  result_confidence: string | null;
  learning_summary: string | null;
  created_at: string;
};

export type SeoDecisionAction = {
  id: string;
  experiment_id: string;
  target_page_id: string | null;
  target_url: string | null;
  action_kind: string;
  risk_level: string;
  approval_status: string;
  execution_status: string;
  execution_gate: string;
  automatic_publish_enabled: boolean;
  created_at: string;
};

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value ? value : null;
}

export async function getSeoDecisionWorkspaceContext(organizationId: string) {
  const orgId = organizationId.trim();
  if (!orgId) throw new Error('SEO_DECISION_ORGANIZATION_REQUIRED');

  const admin = createAdminClient();

  const [healthResult, learningResult, experimentResult, actionResult, profileResult] = await Promise.all([
    admin
      .from('v_seo_learning_health_v1')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle(),
    admin
      .from('seo_experiment_learning_events')
      .select('id,organization_id,experiment_id,action_kind,page_type,primary_metric,baseline_value,outcome_value,normalized_effect_pct,result_classification,result_confidence,learning_summary,evaluated_at')
      .eq('organization_id', orgId)
      .order('evaluated_at', { ascending: false })
      .limit(8),
    admin
      .from('seo_experiments')
      .select('id,organization_id,title,status,primary_metric,minimum_observation_days,target_page_id,target_url,started_at,completed_at,result_classification,result_confidence,learning_summary,created_at')
      .eq('organization_id', orgId)
      .in('source_layer', ['decision_intelligence_v1', 'decision_intelligence_v2'])
      .order('created_at', { ascending: false })
      .limit(8),
    admin
      .from('seo_optimization_actions')
      .select('id,organization_id,experiment_id,target_page_id,target_url,action_kind,risk_level,approval_status,execution_status,execution_gate,automatic_publish_enabled,created_at')
      .eq('organization_id', orgId)
      .in('source_layer', ['decision_intelligence_v1', 'decision_intelligence_v2'])
      .order('created_at', { ascending: false })
      .limit(8),
    admin
      .from('v_seo_action_learning_profile_v1')
      .select('organization_id,action_kind,evidence_count,positive_count,negative_count,mixed_count,inconclusive_count,avg_effect_pct,positive_rate_pct,ranking_adjustment,last_evaluated_at')
      .eq('organization_id', orgId),
  ]);

  for (const result of [healthResult, learningResult, experimentResult, actionResult, profileResult]) {
    if (result.error) {
      throw new Error(`SEO decision workspace query failed: ${result.error.message}`);
    }
  }

  const healthRow = (healthResult.data ?? {}) as Record<string, unknown>;
  const health: SeoLearningHealth = {
    enabled: healthRow.enabled === true,
    auto_finalize: healthRow.auto_finalize === true,
    auto_capture_outcomes: healthRow.auto_capture_outcomes === true,
    outcome_lag_days: num(healthRow.outcome_lag_days),
    max_outcomes_per_sweep: num(healthRow.max_outcomes_per_sweep),
    running_experiments: num(healthRow.running_experiments),
    running_with_baseline: num(healthRow.running_with_baseline),
    running_with_final: num(healthRow.running_with_final),
    outcomes_due: num(healthRow.outcomes_due),
    learning_events: num(healthRow.learning_events),
    learned_outcomes: num(healthRow.learned_outcomes),
    failed_outcomes: num(healthRow.failed_outcomes),
    latest_gsc_date: nullableString(healthRow.latest_gsc_date),
    last_outcome_capture_at: nullableString(healthRow.last_outcome_capture_at),
    last_learning_at: nullableString(healthRow.last_learning_at),
  };

  const learningEvents: SeoLearningEvent[] = ((learningResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: str(row.id),
    experiment_id: str(row.experiment_id),
    action_kind: str(row.action_kind) || 'other',
    page_type: nullableString(row.page_type),
    primary_metric: str(row.primary_metric),
    baseline_value: num(row.baseline_value),
    outcome_value: num(row.outcome_value),
    normalized_effect_pct: num(row.normalized_effect_pct),
    result_classification: str(row.result_classification),
    result_confidence: str(row.result_confidence),
    learning_summary: str(row.learning_summary),
    evaluated_at: str(row.evaluated_at),
  }));

  const experiments: SeoDecisionExperiment[] = ((experimentResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: str(row.id),
    title: str(row.title),
    status: str(row.status),
    primary_metric: str(row.primary_metric),
    minimum_observation_days: num(row.minimum_observation_days),
    target_page_id: nullableString(row.target_page_id),
    target_url: nullableString(row.target_url),
    started_at: nullableString(row.started_at),
    completed_at: nullableString(row.completed_at),
    result_classification: nullableString(row.result_classification),
    result_confidence: nullableString(row.result_confidence),
    learning_summary: nullableString(row.learning_summary),
    created_at: str(row.created_at),
  }));

  const actions: SeoDecisionAction[] = ((actionResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: str(row.id),
    experiment_id: str(row.experiment_id),
    target_page_id: nullableString(row.target_page_id),
    target_url: nullableString(row.target_url),
    action_kind: str(row.action_kind),
    risk_level: str(row.risk_level),
    approval_status: str(row.approval_status),
    execution_status: str(row.execution_status),
    execution_gate: str(row.execution_gate),
    automatic_publish_enabled: row.automatic_publish_enabled === true,
    created_at: str(row.created_at),
  }));

  const learningProfiles: SeoActionLearningProfile[] = ((profileResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    action_kind: str(row.action_kind) || 'other',
    evidence_count: num(row.evidence_count),
    positive_count: num(row.positive_count),
    negative_count: num(row.negative_count),
    mixed_count: num(row.mixed_count),
    inconclusive_count: num(row.inconclusive_count),
    avg_effect_pct: num(row.avg_effect_pct),
    positive_rate_pct: num(row.positive_rate_pct),
    ranking_adjustment: num(row.ranking_adjustment),
    last_evaluated_at: nullableString(row.last_evaluated_at),
  }));

  return {
    health,
    learningEvents,
    experiments,
    actions,
    learningProfiles,
  };
}
