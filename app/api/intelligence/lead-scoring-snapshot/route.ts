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

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

    const [{ data: leadData, error: leadError }, { data: outcomeData, error: outcomeError }] = await Promise.all([
      admin
        .from('v_r10_smart_lead_scoring_v1')
        .select('organization_id,lead_id,current_stage,lead_status,stored_intent,derived_intent,intent_confidence,engagement_score,behaviour_temperature,high_intent_events_7d,whatsapp_clicks_7d,reservation_starts_7d,payment_starts_7d,enquiry_clicks_7d,brochure_downloads_7d,sessions_7d,page_views_7d,days_since_last_visit,has_returned_after_becoming_lead,is_reengaged,payment_status,net_paid,outstanding_balance,operational_priority_score,operational_priority_band,next_action_code,owner_user_id,lead_created_at,last_contacted_at,last_inbound_at,last_outbound_at,next_followup_at'),
      admin
        .from('v_r10_lead_outcome_evidence_v1')
        .select('organization_id,lead_id,outcome_label,outcome_at,outcome_source,outcome_confidence'),
    ]);

    if (leadError || outcomeError) {
      console.error('R10_LEAD_FEATURE_SOURCE_FAILED', { leadError, outcomeError });
      return NextResponse.json(
        { ok: false, error: 'Lead scoring sources could not be read.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const leads = (leadData ?? []) as SmartLeadRow[];
    const outcomes = (outcomeData ?? []) as OutcomeRow[];
    const outcomeByLead = new Map(outcomes.map((row) => [`${row.organization_id}:${row.lead_id}`, row]));

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
      action: 'inserted' | 'skipped_recent' | 'skipped_terminal' | 'failed';
      error?: string;
    }> = [];

    for (const lead of leads) {
      const stage = String(lead.current_stage || '');
      const outcome = outcomeByLead.get(`${lead.organization_id}:${lead.lead_id}`);

      if (outcome?.outcome_label || !ACTIVE_STAGES.has(stage)) {
        results.push({
          organizationId: lead.organization_id,
          leadId: lead.lead_id,
          action: 'skipped_terminal',
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

      const featurePayload = {
        stage,
        lead_status: lead.lead_status,
        stored_intent: lead.stored_intent,
        derived_intent: lead.derived_intent,
        intent_confidence: lead.intent_confidence,
        engagement_score: finiteNumber(lead.engagement_score),
        behaviour_temperature: lead.behaviour_temperature,
        high_intent_events_7d: finiteNumber(lead.high_intent_events_7d),
        whatsapp_clicks_7d: finiteNumber(lead.whatsapp_clicks_7d),
        reservation_starts_7d: finiteNumber(lead.reservation_starts_7d),
        payment_starts_7d: finiteNumber(lead.payment_starts_7d),
        enquiry_clicks_7d: finiteNumber(lead.enquiry_clicks_7d),
        brochure_downloads_7d: finiteNumber(lead.brochure_downloads_7d),
        sessions_7d: finiteNumber(lead.sessions_7d),
        page_views_7d: finiteNumber(lead.page_views_7d),
        days_since_last_visit: finiteNumber(lead.days_since_last_visit),
        has_returned_after_becoming_lead: lead.has_returned_after_becoming_lead === true,
        is_reengaged: lead.is_reengaged === true,
        payment_status: lead.payment_status,
        net_paid: finiteNumber(lead.net_paid),
        outstanding_balance: finiteNumber(lead.outstanding_balance),
        owner_assigned: Boolean(lead.owner_user_id),
        lead_age_hours: lead.lead_created_at
          ? Math.max(0, Math.round((Date.now() - Date.parse(lead.lead_created_at)) / 3600000))
          : null,
        hours_since_last_contact: lead.last_contacted_at
          ? Math.max(0, Math.round((Date.now() - Date.parse(lead.last_contacted_at)) / 3600000))
          : null,
        hours_since_last_inbound: lead.last_inbound_at
          ? Math.max(0, Math.round((Date.now() - Date.parse(lead.last_inbound_at)) / 3600000))
          : null,
        followup_due: Boolean(lead.next_followup_at && Date.parse(lead.next_followup_at) <= Date.now()),
        operational_context: {
          priority_score: finiteNumber(lead.operational_priority_score),
          priority_band: lead.operational_priority_band,
          next_action_code: lead.next_action_code,
        },
      };

      const { error: insertError } = await admin
        .from('lead_scoring_feature_snapshots')
        .insert({
          organization_id: lead.organization_id,
          lead_id: lead.lead_id,
          snapshot_version: 'r10-lead-features-v1',
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
    const failed = results.filter((row) => row.action === 'failed').length + labelFailures;

    return NextResponse.json(
      {
        ok: failed === 0,
        observedLeads: leads.length,
        inserted,
        skippedRecent,
        skippedTerminal,
        labeledSnapshots,
        labelFailures,
        failed,
        results,
        guardrails: {
          terminal_leads_are_not_snapshotted_after_outcome: true,
          labels_only_apply_to_pre_outcome_snapshots: true,
          unlabeled_leads_remain_unlabeled: true,
          probability_generation_is_not_performed_here: true,
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
