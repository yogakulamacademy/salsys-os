import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL_KEY = 'conversion_probability';
const FEATURE_SCHEMA_VERSION = 'r10-lead-features-safe-v1';
const RECENT_COMPARISON_MS = 24 * 60 * 60 * 1000;
const MAX_SNAPSHOTS = 10000;
const MIN_SHARED_LEADS = 20;
const MIN_POSITIVE = 5;
const MIN_NEGATIVE = 5;

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

type ModelArtifact = {
  algorithm?: string;
  feature_schema_version?: string;
  intercept?: number;
  weights?: Record<string, number>;
  normalization?: {
    mean?: Record<string, number>;
    std?: Record<string, number>;
  };
};

type SuccessorRow = {
  organization_id: string;
  candidate_model_version_id: string;
  model_key: string;
  candidate_version: string;
  incumbent_model_version_id: string | null;
  incumbent_version: string | null;
  base_promotion_allowed: boolean;
  base_promotion_reason: string;
  latest_comparison_at: string | null;
};

type ModelRow = {
  id: string;
  organization_id: string;
  version: string;
  status: string;
  trained_at: string | null;
  metrics: { artifact?: ModelArtifact } | null;
};

type SnapshotRow = {
  id: string;
  lead_id: string;
  observed_at: string;
  outcome_label: 'positive' | 'negative' | null;
  outcome_at: string | null;
  labeled_at: string | null;
  feature_payload: Record<string, unknown> | null;
};

type Example = {
  leadId: string;
  snapshotId: string;
  observedAt: string;
  outcomeAt: string;
  label: 0 | 1;
  incumbentProbability: number;
  candidateProbability: number;
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

function sigmoid(value: number) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function validateArtifact(artifact: ModelArtifact | undefined) {
  if (!artifact || artifact.algorithm !== 'logistic_regression_gradient_descent') return false;
  if (artifact.feature_schema_version !== FEATURE_SCHEMA_VERSION) return false;
  if (!Number.isFinite(Number(artifact.intercept))) return false;
  if (!artifact.weights || !artifact.normalization?.mean || !artifact.normalization?.std) return false;

  return FEATURE_NAMES.every((name) =>
    Number.isFinite(Number(artifact.weights?.[name]))
    && Number.isFinite(Number(artifact.normalization?.mean?.[name]))
    && Number.isFinite(Number(artifact.normalization?.std?.[name]))
    && Number(artifact.normalization?.std?.[name]) > 0,
  );
}

function featureValue(payload: Record<string, unknown>, name: FeatureName) {
  if (name === 'has_returned_after_becoming_lead'
    || name === 'is_reengaged'
    || name === 'owner_assigned'
    || name === 'followup_due') {
    return bool(payload[name]);
  }

  return finite(payload[name]);
}

function scorePayload(payload: Record<string, unknown>, artifact: ModelArtifact) {
  const weights = artifact.weights as Record<string, number>;
  const means = artifact.normalization?.mean as Record<string, number>;
  const stds = artifact.normalization?.std as Record<string, number>;
  let logit = finite(artifact.intercept);

  for (const name of FEATURE_NAMES) {
    const value = featureValue(payload, name);
    const normalized = (value - finite(means[name])) / Math.max(1e-8, finite(stds[name]));
    logit += finite(weights[name]) * normalized;
  }

  return Math.min(1, Math.max(0, sigmoid(logit)));
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

function brier(labels: number[], scores: number[]) {
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

function latestSnapshotPerLead(rows: SnapshotRow[]) {
  const latest = new Map<string, SnapshotRow>();
  for (const row of rows) {
    if (!row.outcome_at || !row.labeled_at) continue;
    if (Date.parse(row.observed_at) >= Date.parse(row.outcome_at)) continue;
    const current = latest.get(row.lead_id);
    if (!current || Date.parse(row.observed_at) > Date.parse(current.observed_at)) {
      latest.set(row.lead_id, row);
    }
  }
  return [...latest.values()];
}

function candidateRelationship(
  incumbentAuc: number | null,
  candidateAuc: number | null,
  incumbentBrier: number | null,
  candidateBrier: number | null,
  incumbentEce: number | null,
  candidateEce: number | null,
) {
  const aucNoninferior = incumbentAuc === null || candidateAuc === null || candidateAuc >= incumbentAuc - 0.03;
  const brierNoninferior = incumbentBrier === null || candidateBrier === null || candidateBrier <= incumbentBrier + 0.02;
  const eceNoninferior = incumbentEce === null || candidateEce === null || candidateEce <= incumbentEce + 0.03;
  const noninferior = aucNoninferior && brierNoninferior && eceNoninferior;

  const materiallyBetter = noninferior && (
    (incumbentAuc !== null && candidateAuc !== null && candidateAuc >= incumbentAuc + 0.03)
    || (incumbentBrier !== null && candidateBrier !== null && candidateBrier <= incumbentBrier - 0.01)
    || (incumbentEce !== null && candidateEce !== null && candidateEce <= incumbentEce - 0.02)
  );

  return { noninferior, materiallyBetter };
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

    const { data: successorData, error: successorError } = await admin
      .from('v_r10_lead_model_successor_readiness_v1')
      .select('organization_id,candidate_model_version_id,model_key,candidate_version,incumbent_model_version_id,incumbent_version,base_promotion_allowed,base_promotion_reason,latest_comparison_at')
      .eq('model_key', MODEL_KEY);

    if (successorError) {
      console.error('R10_MODEL_COMPARE_SUCCESSOR_READINESS_FAILED', successorError);
      return NextResponse.json(
        { ok: false, error: 'Model successor readiness could not be read.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const results: Array<Record<string, unknown>> = [];

    for (const pair of (successorData ?? []) as SuccessorRow[]) {
      if (!pair.incumbent_model_version_id) {
        results.push({
          organizationId: pair.organization_id,
          candidateModelVersionId: pair.candidate_model_version_id,
          action: 'not_required',
          reason: 'No active incumbent exists; base promotion guardrails are sufficient for an initial model.',
        });
        continue;
      }

      if (!pair.base_promotion_allowed) {
        results.push({
          organizationId: pair.organization_id,
          candidateModelVersionId: pair.candidate_model_version_id,
          action: 'blocked',
          reason: pair.base_promotion_reason,
        });
        continue;
      }

      const { data: modelsData, error: modelsError } = await admin
        .from('lead_scoring_model_versions')
        .select('id,organization_id,version,status,trained_at,metrics')
        .eq('organization_id', pair.organization_id)
        .in('id', [pair.incumbent_model_version_id, pair.candidate_model_version_id]);

      if (modelsError) {
        console.error('R10_MODEL_COMPARE_MODELS_FAILED', pair.organization_id, modelsError);
        results.push({ organizationId: pair.organization_id, action: 'failed', reason: 'Model artifacts could not be read.' });
        continue;
      }

      const models = (modelsData ?? []) as ModelRow[];
      const incumbent = models.find((row) => row.id === pair.incumbent_model_version_id);
      const candidate = models.find((row) => row.id === pair.candidate_model_version_id);

      if (!incumbent || !candidate || !candidate.trained_at) {
        results.push({ organizationId: pair.organization_id, action: 'failed', reason: 'Incumbent/candidate model metadata is incomplete.' });
        continue;
      }

      const incumbentArtifact = incumbent.metrics?.artifact;
      const candidateArtifact = candidate.metrics?.artifact;
      if (!validateArtifact(incumbentArtifact) || !validateArtifact(candidateArtifact)) {
        results.push({ organizationId: pair.organization_id, action: 'failed', reason: 'Incumbent or candidate model artifact uses an unsafe/legacy feature schema or is incompatible with the comparison scorer.' });
        continue;
      }

      const { data: latestComparison } = await admin
        .from('lead_scoring_model_comparisons')
        .select('evaluated_at,metrics')
        .eq('organization_id', pair.organization_id)
        .eq('candidate_model_version_id', candidate.id)
        .eq('incumbent_model_version_id', incumbent.id)
        .order('evaluated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: snapshotData, error: snapshotError } = await admin
        .from('lead_scoring_feature_snapshots')
        .select('id,lead_id,observed_at,outcome_label,outcome_at,labeled_at,feature_payload')
        .eq('organization_id', pair.organization_id)
        .not('outcome_label', 'is', null)
        .not('outcome_at', 'is', null)
        .not('labeled_at', 'is', null)
        .gt('outcome_at', candidate.trained_at)
        .gt('labeled_at', candidate.trained_at)
        .lte('outcome_at', nowIso)
        .order('observed_at', { ascending: true })
        .limit(MAX_SNAPSHOTS);

      if (snapshotError) {
        console.error('R10_MODEL_COMPARE_SNAPSHOTS_FAILED', pair.organization_id, snapshotError);
        results.push({ organizationId: pair.organization_id, action: 'failed', reason: 'Shared realized-outcome snapshots could not be read.' });
        continue;
      }

      const snapshots = (snapshotData ?? []) as SnapshotRow[];
      if (snapshots.length >= MAX_SNAPSHOTS) {
        results.push({
          organizationId: pair.organization_id,
          action: 'blocked',
          reason: `Shared comparison history reached the v1 safety cap of ${MAX_SNAPSHOTS}; pagination is required before comparison.`,
        });
        continue;
      }

      const selected = latestSnapshotPerLead(snapshots);
      const examples: Example[] = [];
      let temporalLeakageViolations = 0;
      let leadOverlapViolations = 0;

      for (const row of selected) {
        if (!row.outcome_at || !row.labeled_at || !row.feature_payload) continue;
        if (row.outcome_label !== 'positive' && row.outcome_label !== 'negative') continue;

        if (Date.parse(row.observed_at) >= Date.parse(row.outcome_at)) {
          temporalLeakageViolations += 1;
          continue;
        }
        if (Date.parse(row.outcome_at) <= Date.parse(candidate.trained_at)
          || Date.parse(row.labeled_at) <= Date.parse(candidate.trained_at)) {
          leadOverlapViolations += 1;
          continue;
        }

        examples.push({
          leadId: row.lead_id,
          snapshotId: row.id,
          observedAt: row.observed_at,
          outcomeAt: row.outcome_at,
          label: row.outcome_label === 'positive' ? 1 : 0,
          incumbentProbability: scorePayload(row.feature_payload, incumbentArtifact as ModelArtifact),
          candidateProbability: scorePayload(row.feature_payload, candidateArtifact as ModelArtifact),
        });
      }

      examples.sort((a, b) => Date.parse(a.outcomeAt) - Date.parse(b.outcomeAt));
      const newestOutcomeAt = examples.length > 0 ? examples[examples.length - 1].outcomeAt : null;
      const previousNewestOutcomeAt = latestComparison?.metrics && typeof latestComparison.metrics === 'object'
        ? (latestComparison.metrics as Record<string, unknown>).newest_outcome_at
        : null;
      const latestEvaluatedAt = latestComparison?.evaluated_at ? Date.parse(latestComparison.evaluated_at) : NaN;
      const recentComparison = Number.isFinite(latestEvaluatedAt) && Date.now() - latestEvaluatedAt < RECENT_COMPARISON_MS;
      const noNewEvidence = typeof previousNewestOutcomeAt === 'string'
        && newestOutcomeAt !== null
        && Date.parse(newestOutcomeAt) <= Date.parse(previousNewestOutcomeAt);

      if (recentComparison && noNewEvidence) {
        results.push({
          organizationId: pair.organization_id,
          candidateModelVersionId: candidate.id,
          incumbentModelVersionId: incumbent.id,
          action: 'skipped_recent',
          sharedLeadCount: examples.length,
          reason: 'A shared model comparison was recorded within 24 hours and no newer realized outcome is available.',
        });
        continue;
      }

      const labels = examples.map((row) => row.label);
      const incumbentScores = examples.map((row) => row.incumbentProbability);
      const candidateScores = examples.map((row) => row.candidateProbability);
      const positiveCount = labels.filter((label) => label === 1).length;
      const negativeCount = labels.length - positiveCount;
      const incumbentAuc = rocAuc(labels, incumbentScores);
      const candidateAuc = rocAuc(labels, candidateScores);
      const incumbentBrier = brier(labels, incumbentScores);
      const candidateBrier = brier(labels, candidateScores);
      const incumbentEce = expectedCalibrationError(labels, incumbentScores);
      const candidateEce = expectedCalibrationError(labels, candidateScores);
      const incumbentLogLoss = logLoss(labels, incumbentScores);
      const candidateLogLoss = logLoss(labels, candidateScores);
      const relationship = candidateRelationship(
        incumbentAuc,
        candidateAuc,
        incumbentBrier,
        candidateBrier,
        incumbentEce,
        candidateEce,
      );

      const enoughEvidence = examples.length >= MIN_SHARED_LEADS
        && positiveCount >= MIN_POSITIVE
        && negativeCount >= MIN_NEGATIVE;
      const integrityBlocked = temporalLeakageViolations > 0 || leadOverlapViolations > 0;
      const comparisonResult = integrityBlocked
        ? 'integrity_blocked'
        : !enoughEvidence
          ? 'insufficient_evidence'
          : !relationship.noninferior
            ? 'candidate_worse'
            : relationship.materiallyBetter
              ? 'candidate_better'
              : 'noninferior';

      const reason = integrityBlocked
        ? 'Comparison integrity checks found temporal or training-overlap violations.'
        : !enoughEvidence
          ? `Shared realized evidence is still sparse (${examples.length} leads; ${positiveCount} positive; ${negativeCount} negative).`
          : !relationship.noninferior
            ? 'Candidate is materially worse than the active incumbent on at least one shared realized-outcome quality guardrail.'
            : relationship.materiallyBetter
              ? 'Candidate is noninferior overall and materially improves at least one shared realized-outcome quality metric.'
              : 'Candidate is noninferior to the active incumbent on shared realized-outcome evidence.';

      const { error: insertError } = await admin
        .from('lead_scoring_model_comparisons')
        .insert({
          organization_id: pair.organization_id,
          model_key: MODEL_KEY,
          incumbent_model_version_id: incumbent.id,
          candidate_model_version_id: candidate.id,
          comparison_kind: 'shared_realized_holdout',
          evaluated_at: nowIso,
          evaluation_window_start: examples.length > 0 ? examples[0].outcomeAt : null,
          evaluation_window_end: newestOutcomeAt,
          shared_lead_count: examples.length,
          positive_count: positiveCount,
          negative_count: negativeCount,
          temporal_leakage_violations: temporalLeakageViolations,
          lead_overlap_violations: leadOverlapViolations,
          incumbent_roc_auc: incumbentAuc,
          candidate_roc_auc: candidateAuc,
          incumbent_brier_score: incumbentBrier,
          candidate_brier_score: candidateBrier,
          incumbent_calibration_error: incumbentEce,
          candidate_calibration_error: candidateEce,
          incumbent_log_loss: incumbentLogLoss,
          candidate_log_loss: candidateLogLoss,
          candidate_noninferior: enoughEvidence && !integrityBlocked && relationship.noninferior,
          candidate_improved: enoughEvidence && !integrityBlocked && relationship.materiallyBetter,
          comparison_result: comparisonResult,
          reason,
          metrics: {
            evidence_contract: 'post_candidate_training_realized_outcomes',
            feature_schema_version: FEATURE_SCHEMA_VERSION,
            newest_outcome_at: newestOutcomeAt,
            candidate_trained_at: candidate.trained_at,
            one_snapshot_per_lead: true,
            snapshot_selection: 'latest_snapshot_strictly_before_outcome',
            label_known_after_candidate_training_required: true,
            target_adjacent_payment_features_excluded: true,
            operational_priority_composite_excluded: true,
            thresholds: {
              minimum_shared_leads: MIN_SHARED_LEADS,
              minimum_positive: MIN_POSITIVE,
              minimum_negative: MIN_NEGATIVE,
              roc_auc_noninferiority_margin: 0.03,
              brier_noninferiority_margin: 0.02,
              calibration_noninferiority_margin: 0.03,
              material_auc_improvement: 0.03,
              material_brier_improvement: 0.01,
              material_calibration_improvement: 0.02,
            },
            incumbent_version: incumbent.version,
            candidate_version: candidate.version,
          },
        });

      if (insertError) {
        console.error('R10_MODEL_COMPARE_INSERT_FAILED', pair.organization_id, insertError);
        results.push({ organizationId: pair.organization_id, action: 'failed', reason: 'Shared model comparison could not be recorded.' });
        continue;
      }

      results.push({
        organizationId: pair.organization_id,
        candidateModelVersionId: candidate.id,
        incumbentModelVersionId: incumbent.id,
        action: enoughEvidence && !integrityBlocked ? 'evaluated' : 'observing',
        sharedLeadCount: examples.length,
        positiveCount,
        negativeCount,
        comparisonResult,
        candidateNoninferior: enoughEvidence && !integrityBlocked && relationship.noninferior,
        candidateImproved: enoughEvidence && !integrityBlocked && relationship.materiallyBetter,
        reason,
      });
    }

    const failures = results.filter((row) => row.action === 'failed').length;

    return NextResponse.json(
      {
        ok: failures === 0,
        evaluatedCandidates: results.length,
        failures,
        results,
        guardrails: {
          comparison_requires_active_incumbent: true,
          candidate_must_pass_base_promotion_gate_first: true,
          same_realized_leads_for_both_models: true,
          outcomes_must_occur_after_candidate_training: true,
          labels_must_be_known_after_candidate_training: true,
          one_point_in_time_snapshot_per_lead: true,
          feature_schema_version: FEATURE_SCHEMA_VERSION,
          target_adjacent_payment_features_excluded: true,
          operational_priority_composite_excluded: true,
          sparse_evidence_does_not_authorize_successor_promotion: true,
          comparison_worker_never_promotes_models: true,
        },
      },
      { status: failures === 0 ? 200 : 207, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('R10_MODEL_COMPARE_RUNNER_FAILED', error);
    return NextResponse.json(
      { ok: false, error: 'Lead model comparison worker is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
