import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MIN_FEATURE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ACTIVE_STAGES = new Set(['new', 'contacted', 'engaged', 'qualified', 'high_intent', 'payment_pending', 'nurture', 'not_now']);

type SmartLeadRow = {
  organization_id: string;
  lead_id: string;
  current_stage: string | null;
  lead_status: string | null;
  stored_intent: string | null;
  derived_intent: string | null;
  intent_confidence: string | null;
  engagement_score: number | null;
  behaviour_temperature: string | null;
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
  payment_status: string | null;
  net_paid: number | string | null;
  outstanding_balance: number | string | null;
  operational_priority_score: number | null;
  operational_priority_band: string | null;
  next_action_code: string | null;
  owner_user_id: string | null;
  lead_created_at: string | null;
  last_contacted_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  next_followup_at: string | null;
};

type OutcomeRow = {
  organization_id: string;
  lead_id: string;
  outcome_label: 'positive' | 'negative' | null;
  outcome_at: string | null;
  outcome_source: string | null;
  outcome_confidence: string | null;
};

type SignalQualityRow = {
  organization_id: string;
  lead_id: string;
  linked_person_count: number | string | null;
  linked_visitor_count: number | string | null;
  linked_session_count: number | string | null;
  linked_sessions_30d: number | string | null;
  analytics_preference_count: number | string | null;
  profiling_allowed: boolean | null;
  web_behavior_usable_for_profiling: boolean | null;
  analytics_evidence_state: string | null;
  evidence_quality_band: string | null;
  identity_evidence_state: string | null;
  evidence_quality_reasons: string[] | null;
  block_optional_tracking: boolean | null;
  block_profiling: boolean | null;
  restrict_processing: boolean | null;
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

function nullableFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function elapsedHours(timestamp: string | null) {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 3600000));
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

    const [
      { data: leadData, error: leadError },
      { data: outcomeData, error: outcomeError },
      { data: qualityData, error: qualityError },
    ] = await Promise.all([
      admin
        .from('v_r10_smart_lead_scoring_v1')
        .select('organization_id,lead_id,current_stage,lead_status,stored_intent,derived_intent,intent_confidence,engagement_score,behaviour_temperature,high_intent_events_7d,whatsapp_clicks_7d,reservation_starts_7d,payment_starts_7d,enquiry_clicks_7d,brochure_downloads_7d,sessions_7d,page_views_7d,days_since_last_visit,has_returned_after_becoming_lead,is_reengaged,payment_status,net_paid,outstanding_balance,operational_priority_score,operational_priority_band,next_action_code,owner_user_id,lead_created_at,last_contacted_at,last_inbound_at,last_outbound_at,next_followup_at'),
      admin
        .from('v_r10_lead_outcome_evidence_v1')
        .select('organization_id,lead_id,outcome_label,outcome_at,outcome_source,outcome_confidence'),
      admin
        .from('v_r10_lead_signal_quality_v1')
        .select('organization_id,lead_id,linked_person_count,linked_visitor_count,linked_session_count,linked_sessions_30d,analytics_preference_count,profiling_allowed,web_behavior_usable_for_profiling,analytics_evidence_state,evidence_quality_band,identity_evidence_state,evidence_quality_reasons,block_optional_tracking,block_profiling,restrict_processing'),
    ]);

    if (leadError || outcomeError || qualityError) {
      console.error('R10_LEAD_FEATURE_SOURCE_FAILED', { leadError, outcomeError, qualityError });
      return NextResponse.json(
        { ok: false, error: 'Lead scoring or signal-quality sources could not be read.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const leads = (leadData ?? []) as SmartLeadRow[];
    const outcomes = (outcomeData ?? []) as OutcomeRow[];
    const qualities = (qualityData ?? []) as SignalQualityRow[];
    const outcomeByLead = new Map(outcomes.map((row) => [`${row.organization_id}:${row.lead_id}`, row]));
    const qualityByLead = new Map(qualities.map((row) => [`${row.organization_id}:${row.lead_id}`, row]));

    let labeledSnapshots = 0;
    let labelFailures = 0;

    for (const outcome of outcomes) {
      if (!outcome.outcome_label || !outcome.outcome_at) continue;

      const { data: updatedRows, error } = await admin
        .from('lead_scoring_feature_snapshots')
        .update({
          outcome_label: outcome.outcome_label,
          outcome_at: outcome.outcome_at,
          outcome_source: outcome.outcome_source,
          labeled_at: nowIso,
        })
        .eq('organization_id', outcome.organization_id)
        .eq('lead_id', outcome.lead_id)
        .is('outcome_label', null)
        .lt('observed_at', outcome.outcome_at)
        .select('id');

      if (error) {
        labelFailures += 1;
        console.error('R10_LEAD_FEATURE_LABEL_FAILED', outcome.organization_id, outcome.lead_id, error);
        continue;
      }

      labeledSnapshots += updatedRows?.length ?? 0;
    }

    const results: Array<{
      organizationId: string;
      leadId: string;
      action: 'inserted' | 'skipped_recent' | 'skipped_terminal' | 'skipped_privacy_restricted' | 'failed';
      error?: string;
    }> = [];

    for (const lead of leads) {
      const key = `${lead.organization_id}:${lead.lead_id}`;
      const stage = String(lead.current_stage || '');
      const outcome = outcomeByLead.get(key);
      const quality = qualityByLead.get(key);

      if (outcome?.outcome_label || !ACTIVE_STAGES.has(stage)) {
        results.push({
          organizationId: lead.organization_id,
          leadId: lead.lead_id,
          action: 'skipped_terminal',
        });
        continue;
      }

      if (!quality || quality.profiling_allowed !== true || quality.restrict_processing === true || quality.block_profiling === true) {
        results.push({
          organizationId: lead.organization_id,
          leadId: lead.lead_id,
          action: 'skipped_privacy_restricted',
        });
        continue;
      }

      const { data: latest, error: latestError } = await admin
        .from('lead_scoring_feature_snapshots')
        .select('observed_at')
        .eq('organization_id', lead.organization_id)
        .eq('lead_id', lead.lead_id)
        .order('observed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) {
        console.error('R10_LEAD_FEATURE_LATEST_FAILED', lead.organization_id, lead.lead_id, latestError);
      }

      const latestAt = latest?.observed_at ? Date.parse(latest.observed_at) : NaN;
      if (Number.isFinite(latestAt) && Date.now() - latestAt < MIN_FEATURE_INTERVAL_MS) {
        results.push({
          organizationId: lead.organization_id,
          leadId: lead.lead_id,
          action: 'skipped_recent',
        });
        continue;
      }

      const webBehaviorUsable = quality.web_behavior_usable_for_profiling === true;
      const webNumber = (value: unknown) => webBehaviorUsable ? nullableFiniteNumber(value) : null;
      const webBoolean = (value: boolean | null) => webBehaviorUsable ? value : null;

      const featurePayload = {
        stage,
        lead_status: lead.lead_status,
        stored_intent: lead.stored_intent,
        derived_intent: lead.derived_intent,
        intent_confidence: lead.intent_confidence,
        engagement_score: webNumber(lead.engagement_score),
        behaviour_temperature: webBehaviorUsable ? lead.behaviour_temperature : null,
        high_intent_events_7d: webNumber(lead.high_intent_events_7d),
        whatsapp_clicks_7d: webNumber(lead.whatsapp_clicks_7d),
        reservation_starts_7d: webNumber(lead.reservation_starts_7d),
        payment_starts_7d: webNumber(lead.payment_starts_7d),
        enquiry_clicks_7d: webNumber(lead.enquiry_clicks_7d),
        brochure_downloads_7d: webNumber(lead.brochure_downloads_7d),
        sessions_7d: webNumber(lead.sessions_7d),
        page_views_7d: webNumber(lead.page_views_7d),
        days_since_last_visit: webNumber(lead.days_since_last_visit),
        has_returned_after_becoming_lead: webBoolean(lead.has_returned_after_becoming_lead),
        is_reengaged: webBoolean(lead.is_reengaged),
        payment_status: lead.payment_status,
        net_paid: nullableFiniteNumber(lead.net_paid),
        outstanding_balance: nullableFiniteNumber(lead.outstanding_balance),
        owner_assigned: Boolean(lead.owner_user_id),
        lead_age_hours: elapsedHours(lead.lead_created_at),
        hours_since_last_contact: elapsedHours(lead.last_contacted_at),
        hours_since_last_inbound: elapsedHours(lead.last_inbound_at),
        followup_due: Boolean(lead.next_followup_at && Date.parse(lead.next_followup_at) <= Date.now()),
        operational_context: {
          priority_score: nullableFiniteNumber(lead.operational_priority_score),
          priority_band: lead.operational_priority_band,
          next_action_code: lead.next_action_code,
        },
        feature_availability: {
          profiling_allowed: true,
          web_behavior_usable: webBehaviorUsable,
          crm_context_available: true,
          transaction_context_available: true,
        },
        evidence_quality: {
          band: quality.evidence_quality_band,
          analytics_evidence_state: quality.analytics_evidence_state,
          identity_evidence_state: quality.identity_evidence_state,
          reasons: quality.evidence_quality_reasons ?? [],
          linked_person_count: nullableFiniteNumber(quality.linked_person_count),
          linked_visitor_count: nullableFiniteNumber(quality.linked_visitor_count),
          linked_session_count: nullableFiniteNumber(quality.linked_session_count),
          linked_sessions_30d: nullableFiniteNumber(quality.linked_sessions_30d),
          analytics_preference_count: nullableFiniteNumber(quality.analytics_preference_count),
          optional_tracking_restricted: quality.block_optional_tracking === true,
        },
      };

      const { error: insertError } = await admin
        .from('lead_scoring_feature_snapshots')
        .insert({
          organization_id: lead.organization_id,
          lead_id: lead.lead_id,
          snapshot_version: 'r10-lead-features-safe-v2',
          feature_payload: featurePayload,
          observed_stage: lead.current_stage,
          observed_status: lead.lead_status,
          observed_at: nowIso,
        });

      if (insertError) {
        console.error('R10_LEAD_FEATURE_INSERT_FAILED', lead.organization_id, lead.lead_id, insertError);
        results.push({
          organizationId: lead.organization_id,
          leadId: lead.lead_id,
          action: 'failed',
          error: 'Feature snapshot insert failed.',
        });
        continue;
      }

      results.push({
        organizationId: lead.organization_id,
        leadId: lead.lead_id,
        action: 'inserted',
      });
    }

    const inserted = results.filter((row) => row.action === 'inserted').length;
    const skippedRecent = results.filter((row) => row.action === 'skipped_recent').length;
    const skippedTerminal = results.filter((row) => row.action === 'skipped_terminal').length;
    const skippedPrivacyRestricted = results.filter((row) => row.action === 'skipped_privacy_restricted').length;
    const failed = results.filter((row) => row.action === 'failed').length + labelFailures;

    return NextResponse.json(
      {
        ok: failed === 0,
        observedLeads: leads.length,
        inserted,
        skippedRecent,
        skippedTerminal,
        skippedPrivacyRestricted,
        labeledSnapshots,
        labelFailures,
        failed,
        results,
        guardrails: {
          terminal_leads_are_not_snapshotted_after_outcome: true,
          labels_only_apply_to_pre_outcome_snapshots: true,
          unlabeled_leads_remain_unlabeled: true,
          privacy_restricted_leads_are_not_profiled: true,
          missing_or_withheld_web_evidence_is_null_not_zero: true,
          web_behavior_is_used_only_when_signal_quality_marks_it_usable: true,
          probability_generation_is_not_performed_here: true,
          snapshot_version: 'r10-lead-features-safe-v2',
        },
      },
      { status: failed === 0 ? 200 : 207, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('R10_LEAD_FEATURE_SNAPSHOT_RUNNER_FAILED', error);
    return NextResponse.json(
      { ok: false, error: 'Lead scoring feature snapshot runner is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
