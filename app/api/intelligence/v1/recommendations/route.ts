import { createHash } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { getDashboardSnapshot } from '@/lib/dashboard-data';
import {
  getSystemIntelligenceContext,
  type SystemIntelligenceContext,
} from '@/lib/intelligence/system-intelligence-context';
import { buildSystemIntelligenceV2 } from '@/lib/intelligence/system-intelligence-v2';
import type { SystemIntelligenceSignal } from '@/lib/intelligence/system-intelligence';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const feedbackEvents = new Set(['accepted', 'dismissed', 'action_started', 'action_completed']);
const ACTIVE_STAGES = new Set(['new', 'contacted', 'engaged', 'qualified', 'high_intent', 'payment_pending']);

type DesiredDirection = 'increase' | 'decrease' | null;

type RecommendationLearningMetadata = {
  baselineMetric: string | null;
  baselineValue: number | null;
  desiredDirection: DesiredDirection;
  targetLeadIds: string[];
};

function safeText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function recommendationKey(input: {
  role: string;
  signalId: string;
  score: number;
  metricValue: string;
  action: string;
}) {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
    .slice(0, 24);
  return `system-intelligence-v2:${input.role}:${input.signalId}:${fingerprint}`;
}

function uniqueLeadIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))].slice(0, 500);
}

function learningMetadata(
  signal: SystemIntelligenceSignal,
  context: SystemIntelligenceContext,
): RecommendationLearningMetadata {
  const none: RecommendationLearningMetadata = {
    baselineMetric: null,
    baselineValue: null,
    desiredDirection: null,
    targetLeadIds: [],
  };

  if (signal.id === 'conversation-reply-pressure-correlated') {
    const rows = context.ownerSignals.filter(
      (row) => row.needs_reply === true && ACTIVE_STAGES.has(String(row.current_stage || '')),
    );
    return {
      baselineMetric: 'active_leads_needing_reply',
      baselineValue: rows.length,
      desiredDirection: 'decrease',
      targetLeadIds: uniqueLeadIds(rows.map((row) => row.lead_id)),
    };
  }

  if (signal.id === 'behavior-reengaged-leads') {
    const rows = context.journey.filter(
      (row) => row.is_reengaged === true && ACTIVE_STAGES.has(String(row.current_stage || '')),
    );
    return {
      baselineMetric: 'active_reengaged_leads',
      baselineValue: rows.length,
      desiredDirection: null,
      targetLeadIds: uniqueLeadIds(rows.map((row) => row.lead_id)),
    };
  }

  if (signal.id === 'pipeline-first-touch') {
    const rows = context.ownerSignals.filter(
      (row) => row.current_stage === 'new' && !row.last_contacted_at,
    );
    return {
      baselineMetric: 'new_leads_without_first_touch',
      baselineValue: rows.length,
      desiredDirection: 'decrease',
      targetLeadIds: uniqueLeadIds(rows.map((row) => row.lead_id)),
    };
  }

  if (signal.id === 'follow-up-due') {
    const rows = context.ownerSignals.filter((row) => row.has_overdue_followup === true);
    return {
      baselineMetric: 'leads_with_overdue_followup',
      baselineValue: rows.length,
      desiredDirection: 'decrease',
      targetLeadIds: uniqueLeadIds(rows.map((row) => row.lead_id)),
    };
  }

  if (signal.id === 'pipeline-payment-pending') {
    const rows = context.ownerSignals.filter((row) => row.current_stage === 'payment_pending');
    return {
      baselineMetric: 'payment_pending_leads',
      baselineValue: rows.length,
      desiredDirection: 'decrease',
      targetLeadIds: uniqueLeadIds(rows.map((row) => row.lead_id)),
    };
  }

  if (signal.id === 'pipeline-high-intent') {
    const rows = context.ownerSignals.filter((row) => row.current_stage === 'high_intent');
    return {
      baselineMetric: 'high_intent_leads',
      baselineValue: rows.length,
      desiredDirection: 'decrease',
      targetLeadIds: uniqueLeadIds(rows.map((row) => row.lead_id)),
    };
  }

  if (signal.id === 'velocity-inbound-24h') {
    return {
      baselineMetric: 'inbound_messages_24h',
      baselineValue: context.velocity.inbound24h,
      desiredDirection: null,
      targetLeadIds: [],
    };
  }

  if (signal.id === 'velocity-new-leads-24h') {
    return {
      baselineMetric: 'new_leads_24h',
      baselineValue: context.velocity.newLeads24h,
      desiredDirection: null,
      targetLeadIds: [],
    };
  }

  if (signal.id === 'system-health-operational-pressure') {
    const failures = context.systemActivity.reduce((sum, row) => {
      const value = Number(row.failure_count);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    return {
      baselineMetric: 'system_failures_24h',
      baselineValue: failures,
      desiredDirection: 'decrease',
      targetLeadIds: [],
    };
  }

  return none;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const event = safeText(body?.event, 40);
    const supabase = await createClient();

    if (event === 'shown') {
      const signalId = safeText(body?.signal_id, 160);
      if (!signalId) {
        return NextResponse.json({ ok: false, error: 'Signal is required.' }, { status: 400 });
      }

      const [snapshot, context] = await Promise.all([
        getDashboardSnapshot(),
        getSystemIntelligenceContext(),
      ]);
      const brief = buildSystemIntelligenceV2(snapshot, context);
      const signal = brief.signals.find((item) => item.id === signalId);
      if (!signal) {
        return NextResponse.json({ ok: false, error: 'Current intelligence signal not found.' }, { status: 404 });
      }

      const key = recommendationKey({
        role: context.role,
        signalId: signal.id,
        score: signal.score,
        metricValue: signal.metricValue,
        action: signal.recommendedAction,
      });
      const learning = learningMetadata(signal, context);

      const { data, error } = await supabase.rpc('touch_system_intelligence_recommendation_v2', {
        p_recommendation_key: key,
        p_surface: 'system_intelligence',
        p_source_version: 'v2',
        p_signal_id: signal.id,
        p_category: signal.category,
        p_role_scope: context.role,
        p_score: signal.score,
        p_action_text: signal.recommendedAction,
        p_reason_text: signal.reason,
        p_baseline_metric: learning.baselineMetric,
        p_baseline_value: learning.baselineValue,
        p_desired_direction: learning.desiredDirection,
        p_target_lead_ids: learning.targetLeadIds,
      });

      if (error || !data) throw new Error(`INTELLIGENCE_RECOMMENDATION_TOUCH_FAILED:${error?.message || 'unknown'}`);

      return NextResponse.json(
        { ok: true, recommendation_id: data },
        { headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex' } },
      );
    }

    if (feedbackEvents.has(event)) {
      const recommendationId = safeText(body?.recommendation_id, 80);
      const note = safeText(body?.note, 500) || null;
      if (!recommendationId) {
        return NextResponse.json({ ok: false, error: 'Recommendation is required.' }, { status: 400 });
      }

      const { data, error } = await supabase.rpc('record_system_intelligence_recommendation_feedback_v1', {
        p_recommendation_id: recommendationId,
        p_event_type: event,
        p_note: note,
      });

      if (error || data !== true) throw new Error(`INTELLIGENCE_RECOMMENDATION_FEEDBACK_FAILED:${error?.message || 'unknown'}`);

      return NextResponse.json(
        { ok: true },
        { headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex' } },
      );
    }

    return NextResponse.json({ ok: false, error: 'Unsupported feedback event.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message.toLowerCase().includes('authenticate') || message.toLowerCase().includes('authenticated');
    return NextResponse.json(
      { ok: false, error: unauthenticated ? 'Authentication required.' : 'Unable to record intelligence feedback.' },
      { status: unauthenticated ? 401 : 503, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex' } },
    );
  }
}