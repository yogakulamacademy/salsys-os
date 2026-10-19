import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL_KEY = 'conversion_probability';
const RUN_VERSION = 'r10-training-run-v1';
const MODEL_VERSION_PREFIX = 'r10-logistic-v1';
const FEATURE_SCHEMA_VERSION = 'r10-lead-features-safe-v1';
const MAX_DATASET_ROWS = 5000;
const HOLDOUT_FRACTION = 0.2;
const ITERATIONS = 800;
const LEARNING_RATE = 0.05;
const L2 = 0.01;
const DECISION_THRESHOLD = 0.5;
const RECENT_BLOCKED_RUN_MS = 24 * 60 * 60 * 1000;

const FEATURE_NAMES = [
  'engagement_score',
  'high_intent_events_7d',
  'whatsapp_clicks_7d',
  'reservation_starts_7d',
  'enquiry_clicks_7d',
  'brochure_downloads_7d',
  'sessions_7d',
  'page_views_7d',
  'days_since_last_visit',
  'has_returned_after_becoming_lead',
  'is_reengaged',
  'owner_assigned',
  'lead_age_hours',
  'hours_since_last_contact',
  'hours_since_last_inbound',
  'followup_due',
] as const;

type FeatureName = (typeof FEATURE_NAMES)[number];

type ReadinessRow = {
  organization_id: string;
  model_key: string;
  training_readiness_status: string;
  training_readiness_reason: string;
  candidate_model_training_allowed: boolean;
  production_prediction_release_allowed: boolean;
  training_rows: number | string | null;
  training_leads: number | string | null;
  positive_leads: number | string | null;
  negative_leads: number | string | null;
  class_balance_ratio: number | string | null;
  temporal_leakage_violations: number | string | null;
  latest_training_run_status: string | null;
  latest_training_requested_at: string | null;
  new_training_run_allowed: boolean;
  new_training_run_reason: string;
};

type DatasetRow = {
  organization_id: string;
  lead_id: string;
  feature_snapshot_id: string;
  observed_at: string;
  outcome_label: 'positive' | 'negative';
  outcome_at: string;
  engagement_score: number | string | null;
  high_intent_events_7d: number | string | null;
  whatsapp_clicks_7d: number | string | null;
  reservation_starts_7d: number | string | null;
  enquiry_clicks_7d: number | string | null;
  brochure_downloads_7d: number | string | null;
  sessions_7d: number | string | null;
  page_views_7d: number | string | null;
  days_since_last_visit: number | string | null;
  has_returned_after_becoming_lead: boolean | null;
  is_reengaged: boolean | null;
  owner_assigned: boolean | null;
  lead_age_hours: number | string | null;
  hours_since_last_contact: number | string | null;
  hours_since_last_inbound: number | string | null;
  followup_due: boolean | null;
};

type Example = {
  leadId: string;
  observedAt: string;
  outcomeAt: string;
  y: 0 | 1;
  x: number[];
};

type Normalization = {
  mean: number[];
  std: number[];
};

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

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(value: unknown) {
  return value === true ? 1 : 0;
}

function vector(row: DatasetRow) {
  return [
    finite(row.engagement_score),
    finite(row.high_intent_events_7d),
    finite(row.whatsapp_clicks_7d),
    finite(row.reservation_starts_7d),
    finite(row.enquiry_clicks_7d),
    finite(row.brochure_downloads_7d),
    finite(row.sessions_7d),
    finite(row.page_views_7d),
    finite(row.days_since_last_visit),
    bool(row.has_returned_after_becoming_lead),
    bool(row.is_reengaged),
    bool(row.owner_assigned),
    finite(row.lead_age_hours),
    finite(row.hours_since_last_contact),
    finite(row.hours_since_last_inbound),
    bool(row.followup_due),
  ];
}

function sigmoid(value: number) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function dot(a: number[], b: number[]) {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += a[i] * b[i];
  return total;
}

function buildNormalization(rows: Example[]): Normalization {
  const width = FEATURE_NAMES.length;
  const mean = Array(width).fill(0) as number[];
  const std = Array(width).fill(1) as number[];

  for (const row of rows) {
    for (let i = 0; i < width; i += 1) mean[i] += row.x[i];
  }
  for (let i = 0; i < width; i += 1) mean[i] /= Math.max(1, rows.length);

  for (let i = 0; i < width; i += 1) {
    let variance = 0;
    for (const row of rows) variance += (row.x[i] - mean[i]) ** 2;
    variance /= Math.max(1, rows.length);
    const candidate = Math.sqrt(variance);
    std[i] = Number.isFinite(candidate) && candidate > 1e-8 ? candidate : 1;
  }

  return { mean, std };
}

function normalize(x: number[], normalization: Normalization) {
  return x.map((value, index) => (value - normalization.mean[index]) / normalization.std[index]);
}

function trainLogisticRegression(rows: Example[], normalization: Normalization) {
  const width = FEATURE_NAMES.length;
  const weights = Array(width).fill(0) as number[];
  let intercept = 0;

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const gradient = Array(width).fill(0) as number[];
    let interceptGradient = 0;

    for (const row of rows) {
      const x = normalize(row.x, normalization);
      const probability = sigmoid(intercept + dot(weights, x));
      const error = probability - row.y;
      interceptGradient += error;
      for (let i = 0; i < width; i += 1) gradient[i] += error * x[i];
    }

    const denominator = Math.max(1, rows.length);
    intercept -= LEARNING_RATE * (interceptGradient / denominator);
    for (let i = 0; i < width; i += 1) {
      const regularizedGradient = gradient[i] / denominator + L2 * weights[i];
      weights[i] -= LEARNING_RATE * regularizedGradient;
    }
  }

  return { intercept, weights };
}

function probabilities(rows: Example[], normalization: Normalization, intercept: number, weights: number[]) {
  return rows.map((row) => sigmoid(intercept + dot(weights, normalize(row.x, normalization))));
}

function rocAuc(labels: number[], scores: number[]) {
  const positives = labels.reduce((sum, value) => sum + (value === 1 ? 1 : 0), 0);
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) return null;

  const pairs = scores.map((score, index) => ({ score, label: labels[index] })).sort((a, b) => a.score - b.score);
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
  const positiveCount = labels.reduce((sum, value) => sum + (value === 1 ? 1 : 0), 0);
  if (positiveCount === 0) return null;

  const ranked = scores.map((score, index) => ({ score, label: labels[index] })).sort((a, b) => b.score - a.score);
  let truePositive = 0;
  let accumulatedPrecision = 0;

  ranked.forEach((row, index) => {
    if (row.label === 1) {
      truePositive += 1;
      accumulatedPrecision += truePositive / (index + 1);
    }
  });

  return accumulatedPrecision / positiveCount;
}

function classificationMetrics(labels: number[], scores: number[]) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (let i = 0; i < labels.length; i += 1) {
    const predicted = scores[i] >= DECISION_THRESHOLD ? 1 : 0;
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

function brier(labels: number[], scores: number[]) {
  return scores.reduce((sum, score, index) => sum + (score - labels[index]) ** 2, 0) / Math.max(1, scores.length);
}

function logLoss(labels: number[], scores: number[]) {
  const epsilon = 1e-12;
  return -scores.reduce((sum, score, index) => {
    const p = Math.min(1 - epsilon, Math.max(epsilon, score));
    return sum + labels[index] * Math.log(p) + (1 - labels[index]) * Math.log(1 - p);
  }, 0) / Math.max(1, scores.length);
}

function expectedCalibrationError(labels: number[], scores: number[], bins = 10) {
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

function selectLatestSnapshotPerLead(rows: DatasetRow[]) {
  const latest = new Map<string, DatasetRow>();
  for (const row of rows) {
    const current = latest.get(row.lead_id);
    if (!current || Date.parse(row.observed_at) > Date.parse(current.observed_at)) latest.set(row.lead_id, row);
  }
  return [...latest.values()];
}

function stratifiedTimeSplit(rows: Example[]) {
  const positives = rows.filter((row) => row.y === 1).sort((a, b) => Date.parse(a.outcomeAt) - Date.parse(b.outcomeAt));
  const negatives = rows.filter((row) => row.y === 0).sort((a, b) => Date.parse(a.outcomeAt) - Date.parse(b.outcomeAt));

  const positiveHoldout = Math.max(1, Math.floor(positives.length * HOLDOUT_FRACTION));
  const negativeHoldout = Math.max(1, Math.floor(negatives.length * HOLDOUT_FRACTION));

  return {
    train: [
      ...positives.slice(0, Math.max(0, positives.length - positiveHoldout)),
      ...negatives.slice(0, Math.max(0, negatives.length - negativeHoldout)),
    ],
    holdout: [
      ...positives.slice(Math.max(0, positives.length - positiveHoldout)),
      ...negatives.slice(Math.max(0, negatives.length - negativeHoldout)),
    ],
  };
}

function isoVersion(nowIso: string) {
  return `${MODEL_VERSION_PREFIX}-${nowIso.replace(/[^0-9]/g, '').slice(0, 17)}-${randomUUID().slice(0, 8)}`;
}

function readinessPayload(row: ReadinessRow) {
  return {
    training_readiness_status: row.training_readiness_status,
    training_readiness_reason: row.training_readiness_reason,
    candidate_model_training_allowed: row.candidate_model_training_allowed,
    production_prediction_release_allowed: row.production_prediction_release_allowed,
    training_rows: finite(row.training_rows),
    training_leads: finite(row.training_leads),
    positive_leads: finite(row.positive_leads),
    negative_leads: finite(row.negative_leads),
    class_balance_ratio: finite(row.class_balance_ratio),
    temporal_leakage_violations: finite(row.temporal_leakage_violations),
    feature_schema_version: FEATURE_SCHEMA_VERSION,
    evaluated_at: new Date().toISOString(),
  };
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
    const nowIso = new Date().toISOString();

    const { data: readinessData, error: readinessError } = await admin
      .from('v_r10_lead_training_run_readiness_v1')
      .select('organization_id,model_key,training_readiness_status,training_readiness_reason,candidate_model_training_allowed,production_prediction_release_allowed,training_rows,training_leads,positive_leads,negative_leads,class_balance_ratio,temporal_leakage_violations,latest_training_run_status,latest_training_requested_at,new_training_run_allowed,new_training_run_reason')
      .eq('model_key', MODEL_KEY);

    if (readinessError) {
      console.error('R10_MODEL_TRAIN_READINESS_FAILED', readinessError);
      return NextResponse.json(
        { ok: false, error: 'Lead model training readiness could not be read.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const results: Array<Record<string, unknown>> = [];

    for (const readiness of (readinessData ?? []) as ReadinessRow[]) {
      const snapshot = readinessPayload(readiness);

      if (!readiness.new_training_run_allowed) {
        const latestRequestedAt = readiness.latest_training_requested_at
          ? Date.parse(readiness.latest_training_requested_at)
          : NaN;
        const recentBlocked = readiness.latest_training_run_status === 'blocked'
          && Number.isFinite(latestRequestedAt)
          && Date.now() - latestRequestedAt < RECENT_BLOCKED_RUN_MS;

        if (!recentBlocked && !['queued', 'running'].includes(readiness.latest_training_run_status ?? '')) {
          const { error: blockedError } = await admin
            .from('lead_scoring_training_runs')
            .insert({
              organization_id: readiness.organization_id,
              model_key: MODEL_KEY,
              run_version: RUN_VERSION,
              status: 'blocked',
              dataset_cutoff_at: nowIso,
              split_strategy: 'grouped_time_holdout',
              readiness_snapshot: snapshot,
              block_reason: readiness.new_training_run_reason,
              created_by: 'scheduled_candidate_trainer',
            });

          if (blockedError) {
            console.error('R10_MODEL_TRAIN_BLOCKED_RECORD_FAILED', readiness.organization_id, blockedError);
          }
        }

        results.push({
          organizationId: readiness.organization_id,
          action: recentBlocked ? 'skipped_recent_block' : 'blocked',
          reason: readiness.new_training_run_reason,
          readiness: snapshot,
        });
        continue;
      }

      const { data: run, error: runError } = await admin
        .from('lead_scoring_training_runs')
        .insert({
          organization_id: readiness.organization_id,
          model_key: MODEL_KEY,
          run_version: RUN_VERSION,
          status: 'running',
          requested_at: nowIso,
          started_at: nowIso,
          dataset_cutoff_at: nowIso,
          split_strategy: 'grouped_time_holdout',
          feature_schema: FEATURE_NAMES,
          hyperparameters: {
            algorithm: 'logistic_regression_gradient_descent',
            feature_schema_version: FEATURE_SCHEMA_VERSION,
            iterations: ITERATIONS,
            learning_rate: LEARNING_RATE,
            l2: L2,
            holdout_fraction: HOLDOUT_FRACTION,
            decision_threshold: DECISION_THRESHOLD,
          },
          readiness_snapshot: snapshot,
          created_by: 'scheduled_candidate_trainer',
        })
        .select('id')
        .single();

      if (runError || !run?.id) {
        console.error('R10_MODEL_TRAIN_RUN_INSERT_FAILED', readiness.organization_id, runError);
        results.push({ organizationId: readiness.organization_id, action: 'failed', reason: 'Training run could not be created.' });
        continue;
      }

      const failRun = async (reason: string) => {
        await admin
          .from('lead_scoring_training_runs')
          .update({ status: 'failed', completed_at: new Date().toISOString(), block_reason: reason })
          .eq('id', run.id);
        results.push({ organizationId: readiness.organization_id, action: 'failed', reason });
      };

      const { data: datasetData, error: datasetError } = await admin
        .from('v_r10_lead_training_dataset_v1')
        .select('organization_id,lead_id,feature_snapshot_id,observed_at,outcome_label,outcome_at,engagement_score,high_intent_events_7d,whatsapp_clicks_7d,reservation_starts_7d,enquiry_clicks_7d,brochure_downloads_7d,sessions_7d,page_views_7d,days_since_last_visit,has_returned_after_becoming_lead,is_reengaged,owner_assigned,lead_age_hours,hours_since_last_contact,hours_since_last_inbound,followup_due')
        .eq('organization_id', readiness.organization_id)
        .lte('observed_at', nowIso)
        .not('outcome_label', 'is', null)
        .not('outcome_at', 'is', null)
        .order('observed_at', { ascending: true })
        .limit(MAX_DATASET_ROWS);

      if (datasetError) {
        console.error('R10_MODEL_TRAIN_DATASET_FAILED', readiness.organization_id, datasetError);
        await failRun('Training dataset could not be read.');
        continue;
      }

      const rawRows = (datasetData ?? []) as DatasetRow[];
      if (rawRows.length >= MAX_DATASET_ROWS) {
        await failRun(`Training dataset reached the v1 safety cap of ${MAX_DATASET_ROWS} rows; pagination is required before training.`);
        continue;
      }

      const latestRows = selectLatestSnapshotPerLead(rawRows);
      const examples: Example[] = latestRows
        .filter((row) => row.outcome_label === 'positive' || row.outcome_label === 'negative')
        .filter((row) => Date.parse(row.observed_at) < Date.parse(row.outcome_at))
        .map((row) => ({
          leadId: row.lead_id,
          observedAt: row.observed_at,
          outcomeAt: row.outcome_at,
          y: row.outcome_label === 'positive' ? 1 : 0,
          x: vector(row),
        }));

      const positives = examples.filter((row) => row.y === 1).length;
      const negatives = examples.filter((row) => row.y === 0).length;
      if (examples.length < 40 || positives < 20 || negatives < 20) {
        await failRun('Runtime dataset no longer meets the candidate-training minimums after the immutable cutoff and one-snapshot-per-lead reduction.');
        continue;
      }

      const { train, holdout } = stratifiedTimeSplit(examples);
      const trainPositives = train.filter((row) => row.y === 1).length;
      const trainNegatives = train.filter((row) => row.y === 0).length;
      const holdoutPositives = holdout.filter((row) => row.y === 1).length;
      const holdoutNegatives = holdout.filter((row) => row.y === 0).length;

      if (train.length < 2 || holdout.length < 2 || trainPositives === 0 || trainNegatives === 0 || holdoutPositives === 0 || holdoutNegatives === 0) {
        await failRun('Grouped time holdout could not produce both positive and negative examples in train and holdout sets.');
        continue;
      }

      const normalization = buildNormalization(train);
      const model = trainLogisticRegression(train, normalization);
      const holdoutScores = probabilities(holdout, normalization, model.intercept, model.weights);
      const holdoutLabels = holdout.map((row) => row.y);
      const cls = classificationMetrics(holdoutLabels, holdoutScores);
      const trainedAt = new Date().toISOString();
      const version = isoVersion(trainedAt);
      const trainingWindowStart = train.reduce((min, row) => row.observedAt < min ? row.observedAt : min, train[0].observedAt);
      const trainingWindowEnd = train.reduce((max, row) => row.observedAt > max ? row.observedAt : max, train[0].observedAt);
      const holdoutWindowStart = holdout.reduce((min, row) => row.observedAt < min ? row.observedAt : min, holdout[0].observedAt);
      const holdoutWindowEnd = holdout.reduce((max, row) => row.observedAt > max ? row.observedAt : max, holdout[0].observedAt);

      const modelArtifact = {
        algorithm: 'logistic_regression_gradient_descent',
        feature_schema_version: FEATURE_SCHEMA_VERSION,
        intercept: model.intercept,
        weights: Object.fromEntries(FEATURE_NAMES.map((name, index) => [name, model.weights[index]])),
        normalization: {
          mean: Object.fromEntries(FEATURE_NAMES.map((name, index) => [name, normalization.mean[index]])),
          std: Object.fromEntries(FEATURE_NAMES.map((name, index) => [name, normalization.std[index]])),
        },
        split: {
          strategy: 'grouped_time_holdout',
          holdout_fraction: HOLDOUT_FRACTION,
          train_leads: train.length,
          holdout_leads: holdout.length,
        },
        target: 'eventual_positive_terminal_outcome',
        excluded_target_adjacent_features: [
          'payment_starts_7d',
          'net_paid',
          'outstanding_balance',
          'operational_priority_score',
        ],
        note: 'Candidate baseline only. Target-adjacent payment fields and the composite operational priority score are excluded from the model feature schema. Production use still requires promotion guardrails and tenant predictive-readiness.',
      };

      const { data: modelVersion, error: modelError } = await admin
        .from('lead_scoring_model_versions')
        .insert({
          organization_id: readiness.organization_id,
          model_key: MODEL_KEY,
          version,
          status: 'candidate',
          trained_at: trainedAt,
          training_window_start: trainingWindowStart,
          training_window_end: trainingWindowEnd,
          training_rows: train.length,
          positive_rows: trainPositives,
          negative_rows: trainNegatives,
          feature_schema: FEATURE_NAMES,
          metrics: { artifact: modelArtifact },
          notes: 'R10 candidate logistic-regression baseline trained from point-in-time snapshots using the leakage-reduced safe feature schema.',
        })
        .select('id')
        .single();

      if (modelError || !modelVersion?.id) {
        console.error('R10_MODEL_VERSION_INSERT_FAILED', readiness.organization_id, modelError);
        await failRun('Candidate model version could not be registered.');
        continue;
      }

      const evaluation = {
        roc_auc: rocAuc(holdoutLabels, holdoutScores),
        pr_auc: averagePrecision(holdoutLabels, holdoutScores),
        precision_score: cls.precision,
        recall_score: cls.recall,
        f1_score: cls.f1,
        brier_score: brier(holdoutLabels, holdoutScores),
        log_loss: logLoss(holdoutLabels, holdoutScores),
        expected_calibration_error: expectedCalibrationError(holdoutLabels, holdoutScores),
      };

      const { error: evaluationError } = await admin
        .from('lead_scoring_model_evaluations')
        .insert({
          organization_id: readiness.organization_id,
          model_version_id: modelVersion.id,
          evaluation_kind: 'holdout',
          evaluated_at: trainedAt,
          evaluation_window_start: holdoutWindowStart,
          evaluation_window_end: holdoutWindowEnd,
          sample_count: holdout.length,
          positive_count: holdoutPositives,
          negative_count: holdoutNegatives,
          decision_threshold: DECISION_THRESHOLD,
          ...evaluation,
          metrics: {
            confusion_matrix: { tp: cls.tp, fp: cls.fp, tn: cls.tn, fn: cls.fn },
            split_strategy: 'grouped_time_holdout',
            latest_snapshot_per_lead: true,
            feature_schema_version: FEATURE_SCHEMA_VERSION,
          },
          notes: 'Automatic holdout evaluation for R10 candidate lead-conversion model using the leakage-reduced safe feature schema.',
        });

      if (evaluationError) {
        console.error('R10_MODEL_EVALUATION_INSERT_FAILED', readiness.organization_id, evaluationError);
        await admin.from('lead_scoring_model_versions').update({ status: 'rejected', notes: 'Rejected because automatic holdout evaluation could not be registered.' }).eq('id', modelVersion.id);
        await failRun('Candidate model trained but evaluation registration failed; model was rejected.');
        continue;
      }

      const { error: completeError } = await admin
        .from('lead_scoring_training_runs')
        .update({
          status: 'completed',
          completed_at: trainedAt,
          training_window_start: trainingWindowStart,
          training_window_end: trainingWindowEnd,
          training_rows: train.length,
          holdout_rows: holdout.length,
          positive_rows: trainPositives,
          negative_rows: trainNegatives,
          feature_schema: FEATURE_NAMES,
          model_version_id: modelVersion.id,
          block_reason: null,
        })
        .eq('id', run.id);

      if (completeError) {
        console.error('R10_MODEL_TRAIN_RUN_COMPLETE_FAILED', readiness.organization_id, completeError);
      }

      results.push({
        organizationId: readiness.organization_id,
        action: 'candidate_trained',
        modelVersionId: modelVersion.id,
        modelVersion: version,
        featureSchemaVersion: FEATURE_SCHEMA_VERSION,
        trainingLeads: train.length,
        holdoutLeads: holdout.length,
        holdoutPositive: holdoutPositives,
        holdoutNegative: holdoutNegatives,
        evaluation,
        productionPredictionReleaseAllowed: readiness.production_prediction_release_allowed,
      });
    }

    const failures = results.filter((row) => row.action === 'failed').length;

    return NextResponse.json(
      {
        ok: failures === 0,
        evaluatedOrganizations: results.length,
        failures,
        results,
        guardrails: {
          readiness_gate_required: true,
          one_latest_pre_outcome_snapshot_per_lead: true,
          grouped_time_holdout: true,
          automatic_holdout_evaluation: true,
          candidate_status_only: true,
          feature_schema_version: FEATURE_SCHEMA_VERSION,
          target_adjacent_payment_features_excluded: true,
          operational_priority_composite_excluded: true,
          production_activation_is_not_performed_here: true,
        },
      },
      { status: failures === 0 ? 200 : 207, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('R10_MODEL_TRAIN_RUNNER_FAILED', error);
    return NextResponse.json(
      { ok: false, error: 'Candidate lead model trainer is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
