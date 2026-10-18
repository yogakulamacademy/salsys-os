import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

export type LeadSalesIntelligenceRow = {
  leadId: string;
  leadCode: string;
  leadName: string;
  currentStage: string;
  storedIntent: string;
  derivedIntent: string;
  intentConfidence: string;
  intentBasis: string;
  intentReasonCodes: string[];
  engagementScore: number;
  behaviourTemperature: string;
  highIntentEvents7d: number;
  whatsappClicks7d: number;
  reservationStarts7d: number;
  paymentStarts7d: number;
  sessions7d: number;
  pageViews7d: number;
  isReengaged: boolean;
  priorityScore: number;
  priorityBand: string;
  priorityReason: string | null;
  nextActionCode: string | null;
  nextBestAction: string | null;
  paymentStatus: string | null;
  paidRows: number;
  netPaid: number | null;
  outstandingBalance: number | null;
  recommendedCourseName: string | null;
  recommendedAffinityScore: number | null;
  recommendationBasis: string | null;
  recommendationReasonCodes: string[];
  candidateCourseCount: number;
  personMappingConflict: boolean;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  nextFollowupAt: string | null;
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
    .from('v_lead_sales_intelligence')
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
      storedIntent: String(row.stored_intent ?? 'unknown'),
      derivedIntent: String(row.derived_intent ?? 'unknown'),
      intentConfidence: String(row.intent_confidence ?? 'low'),
      intentBasis: String(row.intent_basis ?? 'insufficient_evidence'),
      intentReasonCodes: stringArray(row.intent_reason_codes),
      engagementScore: numberValue(row.engagement_score),
      behaviourTemperature: String(row.behaviour_temperature ?? 'unknown'),
      highIntentEvents7d: numberValue(row.high_intent_events_7d),
      whatsappClicks7d: numberValue(row.whatsapp_clicks_7d),
      reservationStarts7d: numberValue(row.reservation_starts_7d),
      paymentStarts7d: numberValue(row.payment_starts_7d),
      sessions7d: numberValue(row.sessions_7d),
      pageViews7d: numberValue(row.page_views_7d),
      isReengaged: row.is_reengaged === true,
      priorityScore: numberValue(row.priority_score),
      priorityBand: String(row.priority_band ?? 'low'),
      priorityReason: row.priority_reason ? String(row.priority_reason) : null,
      nextActionCode: row.next_action_code ? String(row.next_action_code) : null,
      nextBestAction: row.next_best_action ? String(row.next_best_action) : null,
      paymentStatus: row.payment_status ? String(row.payment_status) : null,
      paidRows: numberValue(row.paid_rows),
      netPaid: nullableNumber(row.net_paid),
      outstandingBalance: nullableNumber(row.outstanding_balance),
      recommendedCourseName: row.recommended_course_name ? String(row.recommended_course_name) : null,
      recommendedAffinityScore: nullableNumber(row.recommended_affinity_score),
      recommendationBasis: row.recommendation_basis ? String(row.recommendation_basis) : null,
      recommendationReasonCodes: stringArray(row.recommendation_reason_codes),
      candidateCourseCount: numberValue(row.candidate_course_count),
      personMappingConflict: row.person_mapping_conflict === true,
      lastInboundAt: row.last_inbound_at ? String(row.last_inbound_at) : null,
      lastOutboundAt: row.last_outbound_at ? String(row.last_outbound_at) : null,
      nextFollowupAt: row.next_followup_at ? String(row.next_followup_at) : null,
    })),
    warning: null,
  };
}
