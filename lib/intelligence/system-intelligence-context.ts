import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

export type IntelligenceRole = 'owner' | 'admin' | 'manager' | 'admissions' | 'other';

export type IntelligenceOwnerSignalRow = {
  lead_id: string;
  owner_user_id: string | null;
  current_stage: string | null;
  created_at: string | null;
  last_contacted_at: string | null;
  needs_reply: boolean | null;
  last_inbound_at: string | null;
  has_overdue_followup: boolean | null;
  followups_next_24h: number | string | null;
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

export type IntelligenceLearningProfile = {
  signal_id: string;
  role_scope: string;
  outcome_samples: number | string | null;
  score_adjustment: number | string | null;
  confidence: number | string | null;
  positive_count: number | string | null;
  negative_count: number | string | null;
  neutral_count: number | string | null;
};

export type IntelligenceTeamMember = {
  user_id: string;
  full_name: string | null;
  role: string | null;
  active: boolean | null;
};

export type IntelligenceSeoDailyRow = {
  date: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type IntelligencePaidCampaignRow = {
  provider: 'meta' | 'google';
  campaign_id: string;
  campaign_name: string | null;
  spend: number | string | null;
  crm_leads: number | string | null;
  qualified_leads: number | string | null;
  enrolled_leads: number | string | null;
  cpl: number | string | null;
};

export type SystemIntelligenceContext = {
  organizationId: string;
  role: IntelligenceRole;
  ownerSignals: IntelligenceOwnerSignalRow[];
  journey: IntelligenceJourneyRow[];
  systemActivity: IntelligenceSystemActivityRow[];
  learningProfiles: IntelligenceLearningProfile[];
  teamMembers: IntelligenceTeamMember[];
  seoDaily: IntelligenceSeoDailyRow[];
  paidCampaigns: IntelligencePaidCampaignRow[];
  velocity: {
    inbound24h: number;
    inboundPrevious24h: number;
    outbound24h: number;
    outboundPrevious24h: number;
    newLeads24h: number;
    newLeadsPrevious24h: number;
  };
  historical: {
    newLeads7d: number;
    newLeadsPrevious7d: number;
    seoClicks7d: number;
    seoClicksPrevious7d: number;
    seoImpressions7d: number;
    seoImpressionsPrevious7d: number;
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

function countBySevenDayWindow<T>(rows: T[], getTime: (row: T) => unknown, nowMs: number) {
  const currentStart = nowMs - 7 * 24 * 60 * 60 * 1000;
  const previousStart = nowMs - 14 * 24 * 60 * 60 * 1000;
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

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function seoWindow(rows: IntelligenceSeoDailyRow[], nowMs: number) {
  const currentStart = nowMs - 7 * 24 * 60 * 60 * 1000;
  const previousStart = nowMs - 14 * 24 * 60 * 60 * 1000;
  let clicksCurrent = 0;
  let clicksPrevious = 0;
  let impressionsCurrent = 0;
  let impressionsPrevious = 0;

  for (const row of rows) {
    const at = timestamp(`${row.date}T00:00:00Z`);
    if (!at) continue;
    if (at >= currentStart) {
      clicksCurrent += number(row.clicks);
      impressionsCurrent += number(row.impressions);
    } else if (at >= previousStart) {
      clicksPrevious += number(row.clicks);
      impressionsPrevious += number(row.impressions);
    }
  }

  return { clicksCurrent, clicksPrevious, impressionsCurrent, impressionsPrevious };
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
  const since14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const since14dDate = since14d.slice(0, 10);

  const [
    ownerSignalsResult,
    journeyResult,
    systemActivityResult,
    messagesResult,
    leadsResult,
    learningResult,
    teamResult,
    seoDailyResult,
    metaCampaignResult,
    googleCampaignResult,
  ] = await Promise.all([
    supabase
      .from('v_admissions_owner_lead_signals')
      .select('lead_id,owner_user_id,current_stage,created_at,last_contacted_at,needs_reply,last_inbound_at,has_overdue_followup,followups_next_24h,priority_score,payment_status,outstanding_balance,currency')
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
      .gte('created_at', since14d)
      .limit(5000),
    supabase
      .from('system_intelligence_learning_profiles')
      .select('signal_id,role_scope,outcome_samples,score_adjustment,confidence,positive_count,negative_count,neutral_count')
      .eq('organization_id', organizationId)
      .limit(250),
    supabase
      .from('v_admissions_team_members')
      .select('user_id,full_name,role,active')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .limit(100),
    supabase
      .from('gsc_daily')
      .select('date,clicks,impressions,ctr,avg_position')
      .eq('organization_id', organizationId)
      .gte('date', since14dDate)
      .order('date', { ascending: false })
      .limit(100),
    supabase
      .from('v_meta_ads_campaign_crm_30d')
      .select('campaign_id,campaign_name,spend,crm_leads,qualified_leads,enrolled_leads,cpl')
      .eq('organization_id', organizationId)
      .limit(100),
    supabase
      .from('v_google_ads_campaign_crm_30d')
      .select('campaign_id,campaign_name,spend,crm_leads,qualified_leads,enrolled_leads,cpl')
      .eq('organization_id', organizationId)
      .limit(100),
  ]);

  const degradedSources: string[] = [];
  if (ownerSignalsResult.error) degradedSources.push('admissions_signals');
  if (journeyResult.error) degradedSources.push('journey_intelligence');
  if (systemActivityResult.error) degradedSources.push('system_activity');
  if (messagesResult.error) degradedSources.push('message_velocity');
  if (leadsResult.error) degradedSources.push('lead_velocity');
  if (learningResult.error) degradedSources.push('recommendation_learning');
  if (teamResult.error) degradedSources.push('team_capacity');
  if (seoDailyResult.error) degradedSources.push('seo_history');
  if (metaCampaignResult.error) degradedSources.push('meta_campaign_performance');
  if (googleCampaignResult.error) degradedSources.push('google_campaign_performance');

  const messages = messagesResult.error ? [] : (messagesResult.data ?? []);
  const inboundRows = messages.filter((row) => row.direction === 'inbound');
  const outboundRows = messages.filter((row) => row.direction === 'outbound');
  const inbound = countByWindow(inboundRows, (row) => row.sent_at || row.created_at, now.getTime());
  const outbound = countByWindow(outboundRows, (row) => row.sent_at || row.created_at, now.getTime());
  const leadRows = leadsResult.error ? [] : (leadsResult.data ?? []);
  const leads24h = countByWindow(leadRows, (row) => row.created_at, now.getTime());
  const leads7d = countBySevenDayWindow(leadRows, (row) => row.created_at, now.getTime());
  const seoDaily = seoDailyResult.error ? [] : (seoDailyResult.data ?? []) as IntelligenceSeoDailyRow[];
  const seo = seoWindow(seoDaily, now.getTime());

  const paidCampaigns: IntelligencePaidCampaignRow[] = [
    ...((metaCampaignResult.error ? [] : metaCampaignResult.data ?? []).map((row) => ({ ...row, provider: 'meta' as const }))),
    ...((googleCampaignResult.error ? [] : googleCampaignResult.data ?? []).map((row) => ({ ...row, provider: 'google' as const }))),
  ];

  return {
    organizationId,
    role,
    ownerSignals: ownerSignalsResult.error ? [] : (ownerSignalsResult.data ?? []) as IntelligenceOwnerSignalRow[],
    journey: journeyResult.error ? [] : (journeyResult.data ?? []) as IntelligenceJourneyRow[],
    systemActivity: systemActivityResult.error ? [] : (systemActivityResult.data ?? []) as IntelligenceSystemActivityRow[],
    learningProfiles: learningResult.error ? [] : (learningResult.data ?? []) as IntelligenceLearningProfile[],
    teamMembers: teamResult.error ? [] : (teamResult.data ?? []) as IntelligenceTeamMember[],
    seoDaily,
    paidCampaigns,
    velocity: {
      inbound24h: inbound.current,
      inboundPrevious24h: inbound.previous,
      outbound24h: outbound.current,
      outboundPrevious24h: outbound.previous,
      newLeads24h: leads24h.current,
      newLeadsPrevious24h: leads24h.previous,
    },
    historical: {
      newLeads7d: leads7d.current,
      newLeadsPrevious7d: leads7d.previous,
      seoClicks7d: seo.clicksCurrent,
      seoClicksPrevious7d: seo.clicksPrevious,
      seoImpressions7d: seo.impressionsCurrent,
      seoImpressionsPrevious7d: seo.impressionsPrevious,
    },
    degradedSources,
  };
}
