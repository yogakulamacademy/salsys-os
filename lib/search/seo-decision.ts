import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export type SeoDecisionRecommendation = {
  organization_id: string;
  site_id: string;
  page_id: string;
  hostname: string | null;
  normalized_url: string | null;
  url_path: string | null;
  page_type: string | null;
  title: string | null;
  is_indexable: boolean;
  decision_priority_score: number;
  base_decision_priority_score: number;
  learning_evidence_count: number;
  learning_adjustment: number;
  minimum_priority_score: number;
  recommended_action_kind: string;
  decision_title: string;
  decision_reason: string;
  risk_level: string;
  execution_gate: string;
  evidence: Record<string, unknown>;
  evaluated_at: string;
};

function normalizeLimit(value?: number) {
  const parsed = Number(value || 5);
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(Math.trunc(parsed), 25));
}

function normalizeRecommendations(value: unknown, organizationId: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [] as SeoDecisionRecommendation[];
  }

  const rows = (value as Record<string, unknown>).recommendations;
  if (!Array.isArray(rows)) return [] as SeoDecisionRecommendation[];

  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)))
    .map((row) => {
      if (String(row.organization_id || '') !== organizationId) {
        throw new Error('SEO_DECISION_TENANT_FILTER_VIOLATION');
      }

      return {
        organization_id: organizationId,
        site_id: String(row.site_id || ''),
        page_id: String(row.page_id || ''),
        hostname: typeof row.hostname === 'string' ? row.hostname : null,
        normalized_url: typeof row.normalized_url === 'string' ? row.normalized_url : null,
        url_path: typeof row.url_path === 'string' ? row.url_path : null,
        page_type: typeof row.page_type === 'string' ? row.page_type : null,
        title: typeof row.title === 'string' ? row.title : null,
        is_indexable: row.is_indexable === true,
        decision_priority_score: Number(row.decision_priority_score || 0),
        base_decision_priority_score: Number(row.base_decision_priority_score ?? row.decision_priority_score ?? 0),
        learning_evidence_count: Number(row.learning_evidence_count || 0),
        learning_adjustment: Number(row.learning_adjustment || 0),
        minimum_priority_score: Number(row.minimum_priority_score || 0),
        recommended_action_kind: String(row.recommended_action_kind || 'other'),
        decision_title: String(row.decision_title || 'SEO recommendation'),
        decision_reason: String(row.decision_reason || ''),
        risk_level: String(row.risk_level || 'medium'),
        execution_gate: String(row.execution_gate || 'human_approved'),
        evidence: row.evidence && typeof row.evidence === 'object' && !Array.isArray(row.evidence)
          ? row.evidence as Record<string, unknown>
          : {},
        evaluated_at: String(row.evaluated_at || ''),
      } satisfies SeoDecisionRecommendation;
    });
}

export async function getSeoNextBestActions(input: {
  organizationId: string;
  siteId?: string | null;
  limit?: number;
}) {
  const organizationId = input.organizationId.trim();
  if (!organizationId) throw new Error('SEO_DECISION_ORGANIZATION_REQUIRED');

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('get_seo_next_best_actions_learning_v1', {
    p_organization_id: organizationId,
    p_site_id: input.siteId?.trim() || null,
    p_limit: normalizeLimit(input.limit),
  });

  if (error) {
    throw new Error(`SEO decision query failed: ${error.message}`);
  }

  const recommendations = normalizeRecommendations(data, organizationId);

  return {
    ok: true,
    organizationId,
    decisionVersion:
      data && typeof data === 'object' && !Array.isArray(data) && typeof (data as Record<string, unknown>).decision_version === 'string'
        ? String((data as Record<string, unknown>).decision_version)
        : 'v2_learning',
    generatedAt:
      data && typeof data === 'object' && !Array.isArray(data) && typeof (data as Record<string, unknown>).generated_at === 'string'
        ? String((data as Record<string, unknown>).generated_at)
        : new Date().toISOString(),
    recommendations,
    topRecommendation: recommendations[0] || null,
  };
}

export async function stageSeoDecisionAction(input: {
  organizationId: string;
  pageId: string;
  createdBy: string;
}) {
  const organizationId = input.organizationId.trim();
  const pageId = input.pageId.trim();
  const createdBy = input.createdBy.trim();

  if (!organizationId || !pageId || !createdBy) {
    throw new Error('SEO_DECISION_STAGE_INPUT_REQUIRED');
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('stage_seo_decision_action_v1', {
    p_organization_id: organizationId,
    p_page_id: pageId,
    p_created_by: createdBy,
  });

  if (error) {
    throw new Error(`SEO decision staging failed: ${error.message}`);
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('SEO_DECISION_STAGE_INVALID_RESPONSE');
  }

  const result = data as Record<string, unknown>;
  return {
    ok: result.ok === true,
    created: result.created === true,
    reason: typeof result.reason === 'string' ? result.reason : null,
    actionId: typeof result.action_id === 'string' ? result.action_id : null,
    experimentId: typeof result.experiment_id === 'string' ? result.experiment_id : null,
    experimentStatus: typeof result.experiment_status === 'string' ? result.experiment_status : null,
    approvalStatus: typeof result.approval_status === 'string' ? result.approval_status : null,
    executionStatus: typeof result.execution_status === 'string' ? result.execution_status : null,
    executionGate: typeof result.execution_gate === 'string' ? result.execution_gate : 'human_approved',
    automaticPublishEnabled: result.automatic_publish_enabled === true,
    priorityScore: Number(result.priority_score || 0),
    primaryMetric: typeof result.primary_metric === 'string' ? result.primary_metric : null,
  };
}
