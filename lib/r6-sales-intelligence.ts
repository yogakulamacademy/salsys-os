import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

export type LeadSalesIntelligenceRow = {
  leadId: string;
  leadCode: string;
  leadName: string;
  currentStage: string;
  crmIntent: string;
  interestedCourseName: string | null;
  behaviourTemperature: string;
  engagementScore: number;
  isReengaged: boolean;
  behaviourReason: string | null;
  strongestAffinityCourseName: string | null;
  strongestAffinityScore: number | null;
  strongestAffinityEvidence: string | null;
  alternateAffinityCourseName: string | null;
  alternateAffinityScore: number | null;
  alternateAffinityEvidence: string | null;
  affinityCourseCount: number;
  needsReply: boolean;
  hasOverdueFollowup: boolean;
  priorityScore: number;
  priorityBand: string;
  nextBestAction: string | null;
  paymentStatus: string | null;
  outstandingBalance: number | null;
  currency: string | null;
  primarySalesSignal: string;
  salesEvidence: string[];
};

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

export async function getR6SalesIntelligence(limit = 100): Promise<{
  rows: LeadSalesIntelligenceRow[];
  warning: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unable to load sales intelligence: user is not authenticated.');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);

  const { data, error } = await supabase
    .from('v_lead_sales_intelligence_v1')
    .select('*')
    .eq('organization_id', organizationId)
    .order('priority_score', { ascending: false })
    .limit(Math.max(1, Math.min(250, Math.round(limit))));

  if (error) {
    return {
      rows: [],
      warning: `Sales intelligence read model unavailable: ${error.message}`,
    };
  }

  return {
    rows: (data ?? []).map((row) => ({
      leadId: String(row.lead_id),
      leadCode: String(row.lead_code ?? ''),
      leadName: String(row.lead_name ?? row.lead_code ?? 'Lead'),
      currentStage: String(row.current_stage ?? 'new'),
      crmIntent: String(row.crm_intent ?? 'unknown'),
      interestedCourseName: row.interested_course_name ? String(row.interested_course_name) : null,
      behaviourTemperature: String(row.behaviour_temperature ?? 'unknown'),
      engagementScore: numberValue(row.engagement_score),
      isReengaged: row.is_reengaged === true,
      behaviourReason: row.behaviour_reason ? String(row.behaviour_reason) : null,
      strongestAffinityCourseName: row.strongest_affinity_course_name ? String(row.strongest_affinity_course_name) : null,
      strongestAffinityScore: nullableNumber(row.strongest_affinity_score),
      strongestAffinityEvidence: row.strongest_affinity_evidence ? String(row.strongest_affinity_evidence) : null,
      alternateAffinityCourseName: row.alternate_affinity_course_name ? String(row.alternate_affinity_course_name) : null,
      alternateAffinityScore: nullableNumber(row.alternate_affinity_score),
      alternateAffinityEvidence: row.alternate_affinity_evidence ? String(row.alternate_affinity_evidence) : null,
      affinityCourseCount: numberValue(row.affinity_course_count),
      needsReply: row.needs_reply === true,
      hasOverdueFollowup: row.has_overdue_followup === true,
      priorityScore: numberValue(row.priority_score),
      priorityBand: String(row.priority_band ?? 'low'),
      nextBestAction: row.next_best_action ? String(row.next_best_action) : null,
      paymentStatus: row.payment_status ? String(row.payment_status) : null,
      outstandingBalance: nullableNumber(row.outstanding_balance),
      currency: row.currency ? String(row.currency) : null,
      primarySalesSignal: String(row.primary_sales_signal ?? 'limited_evidence'),
      salesEvidence: stringArray(row.sales_evidence),
    })),
    warning: null,
  };
}
