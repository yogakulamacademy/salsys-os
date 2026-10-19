import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL_KEY = 'conversion_probability';
const OUTCOME_WINDOW_DAYS = 30;
const MAX_PREDICTIONS = 10000;
const RECENT_EVALUATION_MS = 24 * 60 * 60 * 1000;

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

type ActiveModel = {
  id: string;
  organization_id: string;
  version: string;
};

type PredictionRow = {
  id: string;
  organization_id: string;
  lead_id: string;
  model_version_id: string;
  probability: number | string;
  generated_at: string;
};

type OutcomeRow = {
  organization_id: string;
  lead_id: string;
  outcome_label: 'positive' | 'negative' | null;
  outcome_at: string | null;
};

type RealizedExample = {
  leadId: string;
  outcomeAt: string;
  generatedAt: string;
  label: 0 | 1;
  probability: number;
};

function finiteProbability(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 1) return null;
  return parsed;
}

function rocAuc(labels: number[], scores: number[]) {
  const positives = labels.filter((value) => value === 1).length;
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) return null;

  const pairs = scores
    .map((score, index) => ({ score, label: labels[index] }))
    .sort((a, b) => a.score - b.score);

  let rank = 1;
  let positiveRankSum = 0;

  for (let i = 0; i < pairs.length;) {
    let j = i + 1;
    while (j < pairs.length && pairs[j].score === pairs[i].score) j += 1;
    const averageRank = (rank + (rank + (j - i) - 1)) / 2;
    for (let k = i; k < j; k += 1) {
      if (pairs[k].label === 1) positiveRankSum += averageRank;
    }
    rank += j - i;
    i = j;
  }

  return (positiveRankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

function averagePrecision(labels: number[], scores: number[]) {
  const positives = labels.filter((value) => value === 1).length;
  if (positives === 0) return null;

  const ranked = scores
    .map((score, index) => ({ score, label: labels[index] }))
    .sort((a, b) => b.score - a.score);

  let truePositive = 0;
  let accumulatedPrecision = 0;

  ranked.forEach((row, index) => {
    if (row.label === 1) {
      truePositive += 1;
      accumulatedPrecision += truePositive / (index + 1);
    }
  });

  return accumulatedPrecision / positives;
}

function classificationMetrics(labels: number[], scores: number[], threshold = 0.5) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (let i = 0; i < labels.length; i += 1) {
    const predicted = scores[i] >= threshold ? 1 : 0;
    if (predicted === 1 && labels[i] === 1) tp += 1;
    else if (predicted === 1 && labels[i] === 0) fp += 1;
    else if (predicted === 0 && labels[i] === 0) tn += 1;
    else fn += 1;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { tp, fp, tn, fn, precision, recall, f1 };
}

function brierScore(labels: number[], scores: number[]) {
  if (scores.length === 0) return null;
  return scores.reduce((sum, score, index) => sum + (score - labels[index]) ** 2, 0) / scores.length;
}

function logLoss(labels: number[], scores: number[]) {
  if (scores.length === 0) return null;
  const epsilon = 1e-12;
  return -scores.reduce((sum, score, index) => {
    const p = Math.max(epsilon, Math.min(1 - epsilon, score));
    return sum + labels[index] * Math.log(p) + (1 - labels[index]) * Math.log(1 - p);
  }, 0) / scores.length;
}

function expectedCalibrationError(labels: number[], scores: number[], bins = 10) {
  if (scores.length === 0) return null;
  let total = 0;

  for (let bin = 0; bin < bins; bin += 1) {
    const low = bin / bins;
    const high = (bin + 1) / bins;
    const indexes = scores
      .map((score, index) => ({ score, index }))
      .filter(({ score }) => score >= low && (bin === bins - 1 ? score <= high : score < high));

    if (indexes.length === 0) continue;
    const confidence = indexes.reduce((sum, row) => sum + row.score, 0) / indexes.length;
    const accuracy = indexes.reduce((sum, row) => sum + labels[row.index], 0) / indexes.length;
    total += (indexes.length / scores.length) * Math.abs(accuracy - confidence);
  }

  return total;
}

function latestPredictionBeforeOutcome(predictions: PredictionRow[], outcomeAt: string) {
  const outcomeTime = Date.parse(outcomeAt);
  return predictions
    .filter((prediction) => Date.parse(prediction.generated_at) < outcomeTime)
    .sort((a, b) => Date.parse(b.generated_at) - Date.parse(a.generated_at))[0] ?? null;
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
    const now = new Date();
    const nowIso = now.toISOString();
    const windowStart = new Date(now.getTime() - OUTCOME_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: modelData, error: modelError } = await admin
      .from('lead_scoring_model_versions')
      .select('id,organization_id,version')
      .eq('model_key', MODEL_KEY)
      .eq('status', 'active');

    if (modelError) {
      console.error('R10_MODEL_DRIFT_ACTIVE_MODELS_FAILED', modelError);
      return NextResponse.json(
        { ok: false, error: 'Active lead-scoring models could not be read.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const models = (modelData ?? []) as ActiveModel[];
    const results: Array<Record<string, unknown>> = [];

    for (const model of models) {
      const { data: latestEvaluation } = await admin
        .from('lead_scoring_model_evaluations')
        .select('evaluated_at,metrics')
        .eq('organization_id', model.organization_id)
        .eq('model_version_id', model.id)
        .eq('evaluation_kind', 'drift')
        .order('evaluated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const latestEvaluatedAt = latestEvaluation?.evaluated_at
        ? Date.parse(latestEvaluation.evaluated_at)
        : NaN;

      const { data: predictionData, error: predictionError } = await admin
        .from('lead_scoring_predictions')
        .select('id,organization_id,lead_id,model_version_id,probability,generated_at')
        .eq('organization_id', model.organization_id)
        .eq('model_version_id', model.id)
        .gte('generated_at', windowStart)
        .order('generated_at', { ascending: true })
        .limit(MAX_PREDICTIONS);

      if (predictionError) {
        console.error('R10_MODEL_DRIFT_PREDICTIONS_FAILED', model.organization_id, predictionError);
        results.push({ organizationId: model.organization_id, action: 'failed', reason: 'Predictions could not be read.' });
        continue;
      }

      const predictions = (predictionData ?? []) as PredictionRow[];
      if (predictions.length >= MAX_PREDICTIONS) {
        results.push({
          organizationId: model.organization_id,
          action: 'blocked',
          reason: `Prediction history reached the v1 safety cap of ${MAX_PREDICTIONS}; pagination is required before drift evaluation.`,
        });
        continue;
      }

      const leadIds = [...new Set(predictions.map((prediction) => prediction.lead_id))];
      if (leadIds.length === 0) {
        results.push({ organizationId: model.organization_id, action: 'observing', realizedOutcomes: 0, reason: 'No active-model predictions are available in the evaluation window.' });
        continue;
      }

      const { data: outcomeData, error: outcomeError } = await admin
        .from('v_r10_lead_outcome_evidence_v1')
        .select('organization_id,lead_id,outcome_label,outcome_at')
        .eq('organization_id', model.organization_id)
        .in('lead_id', leadIds)
        .not('outcome_label', 'is', null)
        .not('outcome_at', 'is', null)
        .gte('outcome_at', windowStart)
        .lte('outcome_at', nowIso);

      if (outcomeError) {
        console.error('R10_MODEL_DRIFT_OUTCOMES_FAILED', model.organization_id, outcomeError);
        results.push({ organizationId: model.organization_id, action: 'failed', reason: 'Realized outcomes could not be read.' });
        continue;
      }

      const outcomes = (outcomeData ?? []) as OutcomeRow[];
      const byLead = new Map<string, PredictionRow[]>();
      for (const prediction of predictions) {
        const list = byLead.get(prediction.lead_id) ?? [];
        list.push(prediction);
        byLead.set(prediction.lead_id, list);
      }

      const realized: RealizedExample[] = [];
      for (const outcome of outcomes) {
        if (!outcome.outcome_at || (outcome.outcome_label !== 'positive' && outcome.outcome_label !== 'negative')) continue;
        const prediction = latestPredictionBeforeOutcome(byLead.get(outcome.lead_id) ?? [], outcome.outcome_at);
        if (!prediction) continue;
        const probability = finiteProbability(prediction.probability);
        if (probability === null) continue;
        realized.push({
          leadId: outcome.lead_id,
          outcomeAt: outcome.outcome_at,
          generatedAt: prediction.generated_at,
          label: outcome.outcome_label === 'positive' ? 1 : 0,
          probability,
        });
      }

      realized.sort((a, b) => Date.parse(a.outcomeAt) - Date.parse(b.outcomeAt));
      const newestOutcomeAt = realized.length > 0 ? realized[realized.length - 1].outcomeAt : null;
      const previousNewestOutcomeAt = latestEvaluation?.metrics && typeof latestEvaluation.metrics === 'object'
        ? (latestEvaluation.metrics as Record<string, unknown>).newest_outcome_at
        : null;

      const noNewEvidence = typeof previousNewestOutcomeAt === 'string'
        && newestOutcomeAt !== null
        && Date.parse(newestOutcomeAt) <= Date.parse(previousNewestOutcomeAt);
      const recentEvaluation = Number.isFinite(latestEvaluatedAt)
        && Date.now() - latestEvaluatedAt < RECENT_EVALUATION_MS;

      if (recentEvaluation && noNewEvidence) {
        results.push({
          organizationId: model.organization_id,
          action: 'skipped_recent',
          realizedOutcomes: realized.length,
          reason: 'A drift evaluation was recorded within 24 hours and no newer realized outcome is available.',
        });
        continue;
      }

      const labels = realized.map((row) => row.label);
      const scores = realized.map((row) => row.probability);
      const positiveCount = labels.filter((label) => label === 1).length;
      const negativeCount = labels.length - positiveCount;
      const cls = classificationMetrics(labels, scores);

      const metrics = {
        roc_auc: rocAuc(labels, scores),
        pr_auc: averagePrecision(labels, scores),
        precision_score: labels.length > 0 ? cls.precision : null,
        recall_score: labels.length > 0 ? cls.recall : null,
        f1_score: labels.length > 0 ? cls.f1 : null,
        brier_score: brierScore(labels, scores),
        log_loss: logLoss(labels, scores),
        expected_calibration_error: expectedCalibrationError(labels, scores),
      };

      const { error: evaluationError } = await admin
        .from('lead_scoring_model_evaluations')
        .insert({
          organization_id: model.organization_id,
          model_version_id: model.id,
          evaluation_kind: 'drift',
          evaluated_at: nowIso,
          evaluation_window_start: windowStart,
          evaluation_window_end: nowIso,
          sample_count: realized.length,
          positive_count: positiveCount,
          negative_count: negativeCount,
          decision_threshold: 0.5,
          ...metrics,
          metrics: {
            source: 'realized_outcomes',
            outcome_window_days: OUTCOME_WINDOW_DAYS,
            one_prediction_per_realized_lead: true,
            prediction_selection: 'latest_prediction_strictly_before_outcome',
            newest_outcome_at: newestOutcomeAt,
            confusion_matrix: labels.length > 0 ? { tp: cls.tp, fp: cls.fp, tn: cls.tn, fn: cls.fn } : null,
            sparse_evidence: realized.length < 20,
          },
          notes: realized.length < 20
            ? 'Automatic realized-outcome drift observation. Fewer than 20 outcomes are available, so this is observational evidence only and should not be treated as proof of drift.'
            : 'Automatic realized-outcome drift evaluation for the active R10 lead-conversion model.',
        });

      if (evaluationError) {
        console.error('R10_MODEL_DRIFT_EVALUATION_INSERT_FAILED', model.organization_id, evaluationError);
        results.push({ organizationId: model.organization_id, action: 'failed', reason: 'Drift evaluation could not be recorded.' });
        continue;
      }

      results.push({
        organizationId: model.organization_id,
        action: realized.length < 20 ? 'observing' : 'evaluated',
        modelVersionId: model.id,
        modelVersion: model.version,
        realizedOutcomes: realized.length,
        positiveCount,
        negativeCount,
        metrics,
      });
    }

    const { data: healthData, error: healthError } = await admin
      .from('v_r10_lead_model_health_v1')
      .select('organization_id,model_version_id,model_age_days,predictions_7d,predictions_30d,realized_outcomes_30d,latest_prediction_at,latest_holdout_evaluated_at,latest_drift_evaluated_at,latest_drift_sample_count,latest_drift_roc_auc,latest_drift_brier_score,latest_drift_calibration_error,stale_model,drift_suspected,retraining_recommended,health_status,health_reason');

    if (!healthError) {
      const rows = (healthData ?? []).map((row) => ({
        organization_id: row.organization_id,
        model_version_id: row.model_version_id,
        checked_at: nowIso,
        health_status: row.health_status,
        model_age_days: row.model_age_days,
        predictions_7d: row.predictions_7d,
        predictions_30d: row.predictions_30d,
        realized_outcomes_30d: row.realized_outcomes_30d,
        latest_prediction_at: row.latest_prediction_at,
        latest_holdout_evaluated_at: row.latest_holdout_evaluated_at,
        latest_drift_evaluated_at: row.latest_drift_evaluated_at,
        latest_drift_sample_count: row.latest_drift_sample_count,
        latest_drift_roc_auc: row.latest_drift_roc_auc,
        latest_drift_brier_score: row.latest_drift_brier_score,
        latest_drift_calibration_error: row.latest_drift_calibration_error,
        stale_model: row.stale_model,
        drift_suspected: row.drift_suspected,
        retraining_recommended: row.retraining_recommended,
        reason: row.health_reason,
        details: {
          source: 'r10_lead_model_drift_worker',
          observational_only_when_sparse: true,
        },
      }));

      if (rows.length > 0) {
        const { error: healthInsertError } = await admin
          .from('lead_scoring_model_health_checks')
          .insert(rows);
        if (healthInsertError) console.error('R10_MODEL_HEALTH_HISTORY_INSERT_FAILED', healthInsertError);
      }
    } else {
      console.error('R10_MODEL_HEALTH_VIEW_FAILED', healthError);
    }

    const failures = results.filter((row) => row.action === 'failed').length;

    return NextResponse.json(
      {
        ok: failures === 0,
        activeModels: models.length,
        failures,
        results,
        guardrails: {
          only_active_models_evaluated: true,
          only_predictions_before_outcomes_used: true,
          one_realized_example_per_lead: true,
          sparse_evidence_is_observational: true,
          drift_thresholds_are_applied_by_health_contract_only_after_minimum_evidence: true,
        },
      },
      { status: failures === 0 ? 200 : 207, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('R10_MODEL_DRIFT_WORKER_FAILED', error);
    return NextResponse.json(
      { ok: false, error: 'Lead model drift evaluation is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
