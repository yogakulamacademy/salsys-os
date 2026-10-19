import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

export type IntelligenceRole = 'owner' | 'admin' | 'manager' | 'admissions' | 'other';

export type IntelligenceOwnerSignalRow = {
  lead_id: string;
  owner_user_id: string | null;
  current_stage: string | null;
  needs_reply: boolean | null;
  last_inbound_at: string | null;
  last_contacted_at: string | null;
  has_overdue_followup: boolean | null;
  priority_score: number | null;
  payment_status: string | null;
  outstanding_balance: number | string | null;
  currency: string | null;
};

export type IntelligenceJourneyRow = {
  lead_id: string;
  lead_name: string | null;
  current_stage: string | null;
  last_visit_at: string | null;
  sessions_24h: number | string | null;
  sessions_7d: number | string | null;
  page_views_7d: number | string | null;
  high_intent_events_7d: number | string | null;
  days_since_previous_session: number | string | null;
  engagement_score: number | null;
  is_reengaged: boolean | null;
  behaviour_temperature: string | null;
  behaviour_reason: string | null;
};

export type IntelligenceSystemActivityRow = {
  system_key: string;
  system_name: string;
  activity_count: number | string | null;
  successful_count: number | string | null;
  failure_count: number | string | null;
  pending_count: number | string | null;
  latest_activity_at: string | null;
};

export type IntelligenceCalibrationRow = {
  signal_id: string;
  role_scope: string;
  category: string;
  sample_band: string;
  outcome_observed_count: number | string | null;
  resolved_count: number | string | null;
  net_evidence_rate: number | string | null;
  calibration_ready: boolean | null;
  calibration_points: number | string | null;
  max_adjustment_points: number | string | null;
  calibration_reason: string | null;
};

export type IntelligenceAwarenessTrendRow = {
  snapshots_6h: number | string | null;
  snapshots_24h: number | string | null;
  latest_snapshot_at: string | null;
  previous_snapshot_at: string | null;
  latest_awareness_status: string | null;
  previous_awareness_status: string | null;
  latest_urgency_score: number | string | null;
  previous_urgency_score: number | string | null;
  urgency_delta: number | string | null;
  avg_urgency_6h: number | string | null;
  urgent_snapshots_6h: number | string | null;
  latest_top_issue_code: string | null;
  latest_top_issue_summary: string | null;
  previous_top_issue_code: string | null;
  same_top_issue_snapshots_6h: number | string | null;
  top_issue_persistence_hours_6h: number | string | null;
  latest_needs_reply: number | string | null;
  previous_needs_reply: number | string | null;
  needs_reply_delta: number | string | null;
  latest_high_intent_leads: number | string | null;
  previous_high_intent_leads: number | string | null;
  high_intent_delta: number | string | null;
  latest_system_failures_24h: number | string | null;
  previous_system_failures_24h: number | string | null;
  system_failures_delta: number | string | null;
  trend_status: string | null;
  trend_summary: string | null;
  directional_evidence_available: boolean | null;
};

export type IntelligenceCommandCenterRow = {
  command_status: string | null;
  command_summary: string | null;
  predictive_operating_state: string | null;
  predictive_readiness_status: string | null;
  prediction_generation_allowed: boolean | null;
  active_model_version: string | null;
  model_health_status: string | null;
  model_health_reason: string | null;
  model_age_days: number | string | null;
  predictions_7d: number | string | null;
  realized_outcomes_30d: number | string | null;
  predictive_leads: number | string | null;
  deterministic_guarded_leads: number | string | null;
  retraining_recommended: boolean | null;
  retraining_run_allowed: boolean | null;
  retraining_reason: string | null;
  recommendation_learning_status: string | null;
  recommendations_total: number | string | null;
  observed_acceptance_rate_pct: number | string | null;
  observed_completion_rate_pct: number | string | null;
  observed_positive_outcome_rate_pct: number | string | null;
};

export type SystemIntelligenceContext = {
  organizationId: string;
  role: IntelligenceRole;
  ownerSignals: IntelligenceOwnerSignalRow[];
  journey: IntelligenceJourneyRow[];
  systemActivity: IntelligenceSystemActivityRow[];
  calibration: IntelligenceCalibrationRow[];
  awarenessTrend: IntelligenceAwarenessTrendRow | null;
  commandCenter: IntelligenceCommandCenterRow | null;
  velocity: {
    inbound24h: number;
    inboundPrevious24h: number;
    outbound24h: number;
    outboundPrevious24h: number;
    newLeads24h: number;
    newLeadsPrevious24h: number;
  };
  degradedSources: string[];
};

function normalizeRole(value: string | null | undefined): IntelligenceRole {
  if (value === 'owner' || value === 'admin' || value === 'manager' || value === 'admissions') return value;
  return 'other';
}

function timestamp(value: unknown) {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function countByWindow<T>(rows: T[], getTime: (row: T) => unknown, nowMs: number) {
  const currentStart = nowMs - 24 * 60 * 60 * 1000;
  const previousStart = nowMs - 48 * 60 * 60 * 1000;
  let current = 0;
  let previous = 0;

  for (const row of rows) {
    const at = timestamp(getTime(row));
    if (!at) continue;
    if (at >= currentStart) current += 1;
    else if (at >= previousStart) previous += 1;
  }

  return { current, previous };
}

export async function getSystemIntelligenceContext(now = new Date()): Promise<SystemIntelligenceContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) throw new Error('Authentication required.');

  const workspace = await getCurrentWorkspaceContext(supabase);
  const organizationId = workspace.activeOrganizationId;
  if (!organizationId) throw new Error('Tenant context is not bound.');

  const role = normalizeRole(workspace.activeWorkspace?.role);
  const since48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  const [ownerSignalsResult, journeyResult, systemActivityResult, messagesResult, leadsResult, calibrationResult, awarenessTrendResult, commandCenterResult] = await Promise.all([
    supabase
      .from('v_admissions_owner_lead_signals')
      .select('lead_id,owner_user_id,current_stage,needs_reply,last_inbound_at,last_contacted_at,has_overdue_followup,priority_score,payment_status,outstanding_balance,currency')
      .eq('organization_id', organizationId)
      .limit(750),
    supabase
      .from('v_lead_journey_intelligence')
      .select('lead_id,lead_name,current_stage,last_visit_at,sessions_24h,sessions_7d,page_views_7d,high_intent_events_7d,days_since_previous_session,engagement_score,is_reengaged,behaviour_temperature,behaviour_reason')
      .eq('organization_id', organizationId)
      .limit(750),
    supabase
      .from('v_system_activity_24h')
      .select('system_key,system_name,activity_count,successful_count,failure_count,pending_count,latest_activity_at')
      .eq('organization_id', organizationId)
      .limit(100),
    supabase
      .from('messages')
      .select('direction,created_at,sent_at')
      .eq('organization_id', organizationId)
      .gte('created_at', since48h)
      .limit(5000),
    supabase
      .from('leads')
      .select('created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', since48h)
      .limit(5000),
    supabase.rpc('get_system_intelligence_recommendation_calibration_v1'),
    supabase
      .from('v_r10_system_awareness_trend_v1')
      .select('snapshots_6h,snapshots_24h,latest_snapshot_at,previous_snapshot_at,latest_awareness_status,previous_awareness_status,latest_urgency_score,previous_urgency_score,urgency_delta,avg_urgency_6h,urgent_snapshots_6h,latest_top_issue_code,latest_top_issue_summary,previous_top_issue_code,same_top_issue_snapshots_6h,top_issue_persistence_hours_6h,latest_needs_reply,previous_needs_reply,needs_reply_delta,latest_high_intent_leads,previous_high_intent_leads,high_intent_delta,latest_system_failures_24h,previous_system_failures_24h,system_failures_delta,trend_status,trend_summary,directional_evidence_available')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('v_r10_owner_command_center_v1')
      .select('command_status,command_summary,predictive_operating_state,predictive_readiness_status,prediction_generation_allowed,active_model_version,model_health_status,model_health_reason,model_age_days,predictions_7d,realized_outcomes_30d,predictive_leads,deterministic_guarded_leads,retraining_recommended,retraining_run_allowed,retraining_reason,recommendation_learning_status,recommendations_total,observed_acceptance_rate_pct,observed_completion_rate_pct,observed_positive_outcome_rate_pct')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ]);

  const degradedSources: string[] = [];
  if (ownerSignalsResult.error) degradedSources.push('admissions_signals');
  if (journeyResult.error) degradedSources.push('journey_intelligence');
  if (systemActivityResult.error) degradedSources.push('system_activity');
  if (messagesResult.error) degradedSources.push('message_velocity');
  if (leadsResult.error) degradedSources.push('lead_velocity');
  if (calibrationResult.error) degradedSources.push('recommendation_calibration');
  if (awarenessTrendResult.error) degradedSources.push('awareness_trend');
  if (commandCenterResult.error) degradedSources.push('owner_command_center');

  const messages = messagesResult.error ? [] : (messagesResult.data ?? []);
  const inboundRows = messages.filter((row) => row.direction === 'inbound');
  const outboundRows = messages.filter((row) => row.direction === 'outbound');
  const inbound = countByWindow(inboundRows, (row) => row.sent_at || row.created_at, now.getTime());
  const outbound = countByWindow(outboundRows, (row) => row.sent_at || row.created_at, now.getTime());
  const leads = countByWindow(leadsResult.error ? [] : (leadsResult.data ?? []), (row) => row.created_at, now.getTime());

  return {
    organizationId,
    role,
    ownerSignals: ownerSignalsResult.error ? [] : (ownerSignalsResult.data ?? []) as IntelligenceOwnerSignalRow[],
    journey: journeyResult.error ? [] : (journeyResult.data ?? []) as IntelligenceJourneyRow[],
    systemActivity: systemActivityResult.error ? [] : (systemActivityResult.data ?? []) as IntelligenceSystemActivityRow[],
    calibration: calibrationResult.error ? [] : (calibrationResult.data ?? []) as IntelligenceCalibrationRow[],
    awarenessTrend: awarenessTrendResult.error ? null : (awarenessTrendResult.data as IntelligenceAwarenessTrendRow | null),
    commandCenter: commandCenterResult.error ? null : (commandCenterResult.data as IntelligenceCommandCenterRow | null),
    velocity: {
      inbound24h: inbound.current,
      inboundPrevious24h: inbound.previous,
      outbound24h: outbound.current,
      outboundPrevious24h: outbound.previous,
      newLeads24h: leads.current,
      newLeadsPrevious24h: leads.previous,
    },
    degradedSources,
  };
}
