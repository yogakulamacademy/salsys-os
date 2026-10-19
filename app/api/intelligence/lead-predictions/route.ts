import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL_KEY = 'conversion_probability';
const SCORE_TYPE = 'conversion_probability';
const PREDICTION_TTL_MS = 6 * 60 * 60 * 1000;
const ACTIVE_STAGES = new Set(['new', 'contacted', 'engaged', 'qualified', 'high_intent', 'payment_pending', 'nurture', 'not_now']);

const FEATURE_NAMES = [
  'engagement_score',
  'high_intent_events_7d',
  'whatsapp_clicks_7d',
  'reservation_starts_7d',
  'payment_starts_7d',
  'enquiry_clicks_7d',
  'brochure_downloads_7d',
  'sessions_7d',
  'page_views_7d',
  'days_since_last_visit',
  'has_returned_after_becoming_lead',
  'is_reengaged',
  'net_paid',
  'outstanding_balance',
  'owner_assigned',
  'lead_age_hours',
  'hours_since_last_contact',
  'hours_since_last_inbound',
  'followup_due',
  'operational_priority_score',
] as const;

type FeatureName = (typeof FEATURE_NAMES)[number];

type ModelArtifact = {
  algorithm?: string;
  intercept?: number;
  weights?: Record<string, number>;
  normalization?: {
    mean?: Record<string, number>;
    std?: Record<string, number>;
  };
  target?: string;
};

type ActiveModelRow = {
  id: string;
  organization_id: string;
  version: string;
  model_key: string;
  metrics: { artifact?: ModelArtifact } | null;
};

type ReadinessRow = {
  organization_id: string;
  prediction_generation_allowed: boolean;
  predictive_readiness_status: string | null;
  readiness_reason: string | null;
};

type LeadRow = {
  organization_id: string;
  lead_id: string;
  current_stage: string | null;
  lead_status: string | null;
  engagement_score: number | string | null;
  high_intent_events_7d: number | string | null;
  whatsapp_clicks_7d: number | string | null;
  reservation_starts_7d: number | string | null;
  payment_starts_7d: number | string | null;
  enquiry_clicks_7d: number | string | null;
  brochure_downloads_7d: number | string | null;
  sessions_7d: number | string | null;
  page_views_7d: number | string | null;
  days_since_last_visit: number | string | null;
  has_returned_after_becoming_lead: boolean | null;
  is_reengaged: boolean | null;
  net_paid: number | string | null;
  outstanding_balance: number | string | null;
  priority_score: number | string | null;
  owner_user_id: string | null;
  lead_created_at: string | null;
  last_contacted_at: string | null;
  last_inbound_at: string | null;
  next_followup_at: string | null;
};

type EvaluationRow = {
  model_version_id: string;
  evaluated_at: string;
  sample_count: number | null;
  roc_auc: number | string | null;
  brier_score: number | string | null;
  expected_calibration_error: number | string | null;
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

function hoursSince(value: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round((Date.now() - parsed) / 3600000));
}

function buildFeatureValues(lead: LeadRow): Record<FeatureName, number> {
  return {
    engagement_score: finite(lead.engagement_score),
    high_intent_events_7d: finite(lead.high_intent_events_7d),
    whatsapp_clicks_7d: finite(lead.whatsapp_clicks_7d),
    reservation_starts_7d: finite(lead.reservation_starts_7d),
    payment_starts_7d: finite(lead.payment_starts_7d),
    enquiry_clicks_7d: finite(lead.enquiry_clicks_7d),
    brochure_downloads_7d: finite(lead.brochure_downloads_7d),
    sessions_7d: finite(lead.sessions_7d),
    page_views_7d: finite(lead.page_views_7d),
    days_since_last_visit: finite(lead.days_since_last_visit),
    has_returned_after_becoming_lead: bool(lead.has_returned_after_becoming_lead),
    is_reengaged: bool(lead.is_reengaged),
    net_paid: finite(lead.net_paid),
    outstanding_balance: finite(lead.outstanding_balance),
    owner_assigned: lead.owner_user_id ? 1 : 0,
    lead_age_hours: hoursSince(lead.lead_created_at),
    hours_since_last_contact: hoursSince(lead.last_contacted_at),
    hours_since_last_inbound: hoursSince(lead.last_inbound_at),
    followup_due: lead.next_followup_at && Date.parse(lead.next_followup_at) <= Date.now() ? 1 : 0,
    operational_priority_score: finite(lead.priority_score),
  };
}

function validateArtifact(artifact: ModelArtifact | undefined) {
  if (!artifact || artifact.algorithm !== 'logistic_regression_gradient_descent') return false;
  if (!Number.isFinite(Number(artifact.intercept))) return false;
  if (!artifact.weights || !artifact.normalization?.mean || !artifact.normalization?.std) return false;

  return FEATURE_NAMES.every((name) =>
    Number.isFinite(Number(artifact.weights?.[name]))
    && Number.isFinite(Number(artifact.normalization?.mean?.[name]))
    && Number.isFinite(Number(artifact.normalization?.std?.[name]))
    && Number(artifact.normalization?.std?.[name]) > 0,
  );
}

function scoreLead(lead: LeadRow, artifact: ModelArtifact) {
  const values = buildFeatureValues(lead);
  const weights = artifact.weights as Record<string, number>;
  const means = artifact.normalization?.mean as Record<string, number>;
  const stds = artifact.normalization?.std as Record<string, number>;
  const contributions: Array<{ feature: FeatureName; value: number; normalized: number; contribution: number }> = [];
  let logit = finite(artifact.intercept);

  for (const name of FEATURE_NAMES) {
    const normalized = (values[name] - finite(means[name])) / Math.max(1e-8, finite(stds[name]));
    const contribution = finite(weights[name]) * normalized;
    logit += contribution;
    contributions.push({ feature: name, value: values[name], normalized, contribution });
  }

  const probability = Math.min(1, Math.max(0, sigmoid(logit)));
  const ranked = [...contributions].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    probability,
    values,
    topContributors: ranked.slice(0, 5).map((row) => ({
      feature: row.feature,
      observed_value: row.value,
      direction: row.contribution > 0 ? 'increases_probability' : row.contribution < 0 ? 'decreases_probability' : 'neutral',
      contribution: Number(row.contribution.toFixed(6)),
    })),
  };
}

function modelConfidenceBand(evaluation: EvaluationRow | undefined): 'low' | 'medium' | 'high' {
  if (!evaluation) return 'low';
  const sample = finite(evaluation.sample_count);
  const auc = finite(evaluation.roc_auc);
  const brier = finite(evaluation.brier_score);
  const ece = finite(evaluation.expected_calibration_error);

  if (sample >= 100 && auc >= 0.75 && brier <= 0.2 && ece <= 0.05) return 'high';
  if (sample >= 40 && auc >= 0.7 && brier <= 0.23 && ece <= 0.08) return 'medium';
  return 'low';
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
    const expiresIso = new Date(now.getTime() + PREDICTION_TTL_MS).toISOString();

    const [modelsResult, readinessResult, leadsResult, evaluationsResult] = await Promise.all([
      admin
        .from('lead_scoring_model_versions')
        .select('id,organization_id,version,model_key,metrics')
        .eq('model_key', MODEL_KEY)
        .eq('status', 'active'),
      admin
        .from('v_r10_predictive_readiness_v1')
        .select('organization_id,prediction_generation_allowed,predictive_readiness_status,readiness_reason'),
      admin
        .from('v_lead_sales_intelligence')
        .select('organization_id,lead_id,current_stage,lead_status,engagement_score,high_intent_events_7d,whatsapp_clicks_7d,reservation_starts_7d,payment_starts_7d,enquiry_clicks_7d,brochure_downloads_7d,sessions_7d,page_views_7d,days_since_last_visit,has_returned_after_becoming_lead,is_reengaged,net_paid,outstanding_balance,priority_score,owner_user_id,lead_created_at,last_contacted_at,last_inbound_at,next_followup_at'),
      admin
        .from('lead_scoring_model_evaluations')
        .select('model_version_id,evaluated_at,sample_count,roc_auc,brier_score,expected_calibration_error')
        .eq('evaluation_kind', 'holdout')
        .order('evaluated_at', { ascending: false }),
    ]);

    if (modelsResult.error || readinessResult.error || leadsResult.error || evaluationsResult.error) {
      console.error('R10_PREDICTION_SOURCE_FAILED', {
        modelsError: modelsResult.error,
        readinessError: readinessResult.error,
        leadsError: leadsResult.error,
        evaluationsError: evaluationsResult.error,
      });
      return NextResponse.json(
        { ok: false, error: 'Prediction sources could not be read.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const models = (modelsResult.data ?? []) as ActiveModelRow[];
    const readiness = (readinessResult.data ?? []) as ReadinessRow[];
    const leads = (leadsResult.data ?? []) as LeadRow[];
    const evaluations = (evaluationsResult.data ?? []) as EvaluationRow[];
    const modelByOrg = new Map(models.map((row) => [row.organization_id, row]));
    const readinessByOrg = new Map(readiness.map((row) => [row.organization_id, row]));
    const latestEvaluationByModel = new Map<string, EvaluationRow>();

    for (const evaluation of evaluations) {
      if (!latestEvaluationByModel.has(evaluation.model_version_id)) {
        latestEvaluationByModel.set(evaluation.model_version_id, evaluation);
      }
    }

    const existingByModelLead = new Set<string>();
    for (const model of models) {
      const { data, error } = await admin
        .from('lead_scoring_predictions')
        .select('lead_id')
        .eq('organization_id', model.organization_id)
        .eq('model_version_id', model.id)
        .eq('score_type', SCORE_TYPE)
        .gt('expires_at', nowIso);

      if (error) {
        console.error('R10_PREDICTION_EXISTING_FAILED', model.organization_id, model.id, error);
        continue;
      }

      for (const row of data ?? []) existingByModelLead.add(`${model.id}:${row.lead_id}`);
    }

    const results: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];

    for (const lead of leads) {
      const stage = String(lead.current_stage || '');
      if (!ACTIVE_STAGES.has(stage)) continue;

      const model = modelByOrg.get(lead.organization_id);
      const gate = readinessByOrg.get(lead.organization_id);

      if (!gate?.prediction_generation_allowed) {
        results.push({
          organizationId: lead.organization_id,
          leadId: lead.lead_id,
          action: 'deterministic_guarded',
          reason: gate?.readiness_reason ?? 'Predictive readiness is unavailable for this organization.',
        });
        continue;
      }

      if (!model) {
        results.push({
          organizationId: lead.organization_id,
          leadId: lead.lead_id,
          action: 'awaiting_active_model',
          reason: 'Predictive generation is allowed, but no active validated model exists.',
        });
        continue;
      }

      if (existingByModelLead.has(`${model.id}:${lead.lead_id}`)) {
        results.push({
          organizationId: lead.organization_id,
          leadId: lead.lead_id,
          action: 'skipped_current_prediction',
          modelVersionId: model.id,
        });
        continue;
      }

      const artifact = model.metrics?.artifact;
      if (!validateArtifact(artifact)) {
        results.push({
          organizationId: lead.organization_id,
          leadId: lead.lead_id,
          action: 'failed',
          reason: 'Active model artifact is missing or incompatible with the production scorer.',
          modelVersionId: model.id,
        });
        continue;
      }

      const scored = scoreLead(lead, artifact as ModelArtifact);
      const evaluation = latestEvaluationByModel.get(model.id);
      const confidenceBand = modelConfidenceBand(evaluation);

      inserts.push({
        organization_id: lead.organization_id,
        lead_id: lead.lead_id,
        model_version_id: model.id,
        feature_snapshot_id: null,
        score_type: SCORE_TYPE,
        probability: Number(scored.probability.toFixed(6)),
        confidence_low: null,
        confidence_high: null,
        confidence_band: confidenceBand,
        explanation: {
          model_version: model.version,
          target: artifact?.target ?? 'eventual_positive_terminal_outcome',
          top_contributors: scored.topContributors,
          model_input: scored.values,
          model_evidence: evaluation ? {
            holdout_sample_count: evaluation.sample_count,
            roc_auc: evaluation.roc_auc,
            brier_score: evaluation.brier_score,
            expected_calibration_error: evaluation.expected_calibration_error,
            evaluated_at: evaluation.evaluated_at,
          } : null,
          confidence_note: 'Confidence band reflects model evaluation support, not an individual statistical confidence interval.',
          probability_interval_status: 'not_estimated',
        },
        generated_at: nowIso,
        expires_at: expiresIso,
      });

      results.push({
        organizationId: lead.organization_id,
        leadId: lead.lead_id,
        action: 'prediction_ready',
        modelVersionId: model.id,
        probability: Number(scored.probability.toFixed(6)),
        confidenceBand,
      });
    }

    let inserted = 0;
    if (inserts.length > 0) {
      const { data: insertedRows, error: insertError } = await admin
        .from('lead_scoring_predictions')
        .insert(inserts)
        .select('id');

      if (insertError) {
        console.error('R10_PREDICTION_INSERT_FAILED', insertError);
        return NextResponse.json(
          {
            ok: false,
            error: 'Prediction outputs could not be stored.',
            preparedPredictions: inserts.length,
            results,
          },
          { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      inserted = insertedRows?.length ?? 0;
    }

    const failures = results.filter((row) => row.action === 'failed').length;

    return NextResponse.json(
      {
        ok: failures === 0,
        activeModels: models.length,
        observedLeads: leads.length,
        preparedPredictions: inserts.length,
        insertedPredictions: inserted,
        failures,
        results,
        guardrails: {
          active_model_required: true,
          current_predictive_readiness_required: true,
          deterministic_fallback_is_not_reported_as_probability: true,
          predictions_expire_after_hours: PREDICTION_TTL_MS / 3600000,
          probability_intervals_are_not_fabricated: true,
          explanation_is_observational_model_contribution_not_causality: true,
        },
      },
      { status: failures === 0 ? 200 : 207, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('R10_PREDICTION_RUNNER_FAILED', error);
    return NextResponse.json(
      { ok: false, error: 'Lead prediction generation is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
