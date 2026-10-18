import { createHash } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { getDashboardSnapshot } from '@/lib/dashboard-data';
import { getSystemIntelligenceContext } from '@/lib/intelligence/system-intelligence-context';
import { buildSystemIntelligenceV2 } from '@/lib/intelligence/system-intelligence-v2';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const feedbackEvents = new Set(['accepted', 'dismissed', 'action_started', 'action_completed']);

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
