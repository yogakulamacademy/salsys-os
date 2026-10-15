'use server';

import { revalidatePath } from 'next/cache';

import { getProviderVisibility } from '@/lib/integrations/provider-visibility';
import { createClient } from '@/lib/supabase/server';

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

async function seoContext() {
  const supabase = await createClient();
  const visibility = await getProviderVisibility(supabase);

  if (!visibility.organizationId) {
    throw new Error('No active organization is available for this SEO workspace.');
  }

  return {
    supabase,
    organizationId: visibility.organizationId,
  };
}

function actionKindFor(sourceAction: string | null | undefined) {
  const value = String(sourceAction ?? '').toLowerCase();

  if (/(title|meta|snippet)/.test(value)) return 'metadata_edit';
  if (/schema/.test(value)) return 'schema_update';
  if (/(internal[_ -]?link|link)/.test(value)) return 'internal_link';
  if (/(technical|indexab|crawl|canonical|redirect)/.test(value)) return 'technical';

  return 'content_edit';
}

function riskFor(actionKind: string) {
  return actionKind === 'technical' ? 'medium' : 'low';
}

export async function createExperimentFromCandidate(formData: FormData) {
  const sourceLayer = textValue(formData, 'source_layer');
  const pageId = textValue(formData, 'page_id');
  const recommendedAction = textValue(formData, 'recommended_action');

  if (!sourceLayer || !pageId || !recommendedAction) {
    throw new Error('Missing experiment candidate details.');
  }

  const { supabase, organizationId } = await seoContext();

  const { data: candidate, error: candidateError } = await supabase
    .from('v_seo_experiment_candidates_v1')
    .select(
      'page_id, normalized_url, title, source_layer, recommended_action, recommendation, evidence',
    )
    .eq('organization_id', organizationId)
    .eq('source_layer', sourceLayer)
    .eq('page_id', pageId)
    .eq('recommended_action', recommendedAction)
    .maybeSingle();

  if (candidateError) throw candidateError;
  if (!candidate) throw new Error('Experiment candidate is no longer available.');

  const title = `Test: ${candidate.title || candidate.recommended_action}`;
  const hypothesis =
    candidate.recommendation ||
    `Test whether ${candidate.recommended_action} improves observed SEO outcomes.`;

  const { error } = await supabase.rpc('create_seo_experiment', {
    p_organization_id: organizationId,
    p_title: title,
    p_hypothesis: hypothesis,
    p_target_page_id: candidate.page_id,
    p_target_url: candidate.normalized_url,
    p_source_layer: candidate.source_layer,
    p_source_action: candidate.recommended_action,
    p_source_reference: candidate.evidence ?? {},
    p_primary_metric: 'gsc_clicks',
    p_secondary_metrics: [
      'gsc_impressions',
      'ga4_sessions',
      'organic_leads',
      'organic_revenue_inr',
      'organic_revenue_usd',
      'ai_referral_sessions',
    ],
    p_minimum_observation_days: 14,
  });

  if (error) throw error;

  revalidatePath('/seo');
}

export async function approveExperiment(formData: FormData) {
  const experimentId = textValue(formData, 'experiment_id');
  if (!experimentId) throw new Error('Experiment ID is required.');

  const { supabase, organizationId } = await seoContext();
  const { error } = await supabase.rpc('transition_seo_experiment', {
    p_organization_id: organizationId,
    p_experiment_id: experimentId,
    p_new_status: 'approved',
  });

  if (error) throw error;
  revalidatePath('/seo');
}

export async function startExperimentWithBaseline(formData: FormData) {
  const experimentId = textValue(formData, 'experiment_id');
  if (!experimentId) throw new Error('Experiment ID is required.');

  const { supabase, organizationId } = await seoContext();
  const { error } = await supabase.rpc('start_seo_experiment_with_baseline', {
    p_organization_id: organizationId,
    p_experiment_id: experimentId,
    p_baseline_days: 14,
  });

  if (error) throw error;
  revalidatePath('/seo');
}

export async function proposeOptimizationFromExperiment(formData: FormData) {
  const experimentId = textValue(formData, 'experiment_id');
  if (!experimentId) throw new Error('Experiment ID is required.');

  const { supabase, organizationId } = await seoContext();

  const { data: experiment, error: experimentError } = await supabase
    .from('seo_experiments')
    .select(
      'id, title, hypothesis, target_page_id, target_url, source_layer, source_action, status',
    )
    .eq('organization_id', organizationId)
    .eq('id', experimentId)
    .maybeSingle();

  if (experimentError) throw experimentError;
  if (!experiment) throw new Error('Experiment is no longer available.');

  const actionKind = actionKindFor(experiment.source_action);

  const { error } = await supabase.rpc('create_seo_optimization_action', {
    p_organization_id: organizationId,
    p_experiment_id: experiment.id,
    p_action_kind: actionKind,
    p_proposal: {
      title: experiment.title,
      hypothesis: experiment.hypothesis,
      source_layer: experiment.source_layer,
      source_action: experiment.source_action,
      instruction:
        'Manual executor only in OG9 v1. Review the proposed change, implement outside SalsysOS if approved, then record the result.',
    },
    p_risk_level: riskFor(actionKind),
    p_executor_kind: 'manual',
    p_target_page_id: experiment.target_page_id,
    p_target_url: experiment.target_url,
  });

  if (error) throw error;
  revalidatePath('/seo');
}

export async function reviewOptimizationAction(formData: FormData) {
  const actionId = textValue(formData, 'action_id');
  const decision = textValue(formData, 'decision');

  if (!actionId) throw new Error('Optimization action ID is required.');
  if (!['approved', 'rejected'].includes(decision)) {
    throw new Error('Invalid optimization review decision.');
  }

  const { supabase, organizationId } = await seoContext();
  const { error } = await supabase.rpc('review_seo_optimization_action', {
    p_organization_id: organizationId,
    p_action_id: actionId,
    p_decision: decision,
    p_note:
      decision === 'approved'
        ? 'Approved from the SEO Human-Approved Optimization workspace.'
        : 'Rejected from the SEO Human-Approved Optimization workspace.',
  });

  if (error) throw error;
  revalidatePath('/seo');
}

export async function recordManualOptimizationState(formData: FormData) {
  const actionId = textValue(formData, 'action_id');
  const newStatus = textValue(formData, 'new_status');

  if (!actionId) throw new Error('Optimization action ID is required.');
  if (!['applied', 'rolled_back'].includes(newStatus)) {
    throw new Error('Invalid manual optimization status.');
  }

  const { supabase, organizationId } = await seoContext();
  const evidence =
    newStatus === 'applied'
      ? {
          executor: 'manual',
          attestation:
            'An authorized user recorded that the approved website change was implemented outside SalsysOS.',
        }
      : {
          executor: 'manual',
          attestation:
            'An authorized user recorded that the previously applied website change was rolled back outside SalsysOS.',
        };

  const { error } = await supabase.rpc('transition_seo_optimization_action', {
    p_organization_id: organizationId,
    p_action_id: actionId,
    p_new_status: newStatus,
    p_evidence: evidence,
    p_after_state: {},
    p_error: null,
  });

  if (error) throw error;
  revalidatePath('/seo');
}
