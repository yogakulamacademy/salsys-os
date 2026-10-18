import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export type ClaudeExperimentStageResult = {
  experimentId: string;
  linkId: string;
  experimentStatus: string;
  created: boolean;
};

export async function stageClaudeSeoRecommendationAsDraft(input: {
  organizationId: string;
  analysisRunId: string;
  recommendationIndex: number;
  createdBy: string;
}): Promise<ClaudeExperimentStageResult> {
  if (!input.organizationId || !input.analysisRunId || !input.createdBy) {
    throw new Error('CLAUDE_STAGE_INPUT_INVALID');
  }
  if (!Number.isInteger(input.recommendationIndex) || input.recommendationIndex < 0 || input.recommendationIndex > 100) {
    throw new Error('CLAUDE_STAGE_RECOMMENDATION_INVALID');
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('create_claude_seo_recommendation_experiment_v1', {
    p_organization_id: input.organizationId,
    p_analysis_run_id: input.analysisRunId,
    p_recommendation_index: input.recommendationIndex,
    p_created_by: input.createdBy,
  });

  if (error) {
    const message = error.message || '';
    if (message.includes('Completed Claude SEO analysis not found')) throw new Error('CLAUDE_STAGE_ANALYSIS_NOT_FOUND');
    if (message.includes('Claude recommendation not found')) throw new Error('CLAUDE_STAGE_RECOMMENDATION_NOT_FOUND');
    if (message.includes('Claude target URL is not a page in this organization')) throw new Error('CLAUDE_STAGE_TARGET_NOT_TENANT_SAFE');
    if (message.includes('guardrail') || message.includes('does not require approval')) throw new Error('CLAUDE_STAGE_GUARDRAIL_FAILED');
    throw new Error(`CLAUDE_STAGE_RPC_FAILED:${message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.experiment_id || !row?.link_id) throw new Error('CLAUDE_STAGE_RESULT_INVALID');
  if (String(row.experiment_status) !== 'draft') throw new Error('CLAUDE_STAGE_NOT_DRAFT');

  return {
    experimentId: String(row.experiment_id),
    linkId: String(row.link_id),
    experimentStatus: String(row.experiment_status),
    created: row.created === true,
  };
}
