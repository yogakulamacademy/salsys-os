import { NextRequest, NextResponse } from 'next/server';

import { bearerMatchesAnySecret } from '@/lib/security/machine-bearer-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MIN_SNAPSHOT_INTERVAL_MS = 50 * 60 * 1000;
const URGENCY_CHANGE_THRESHOLD = 10;
const REPLY_BACKLOG_CHANGE_THRESHOLD = 3;
const HIGH_INTENT_CHANGE_THRESHOLD = 2;

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

  return bearerMatchesAnySecret(authorization, secrets);
}

type AwarenessPayload = Record<string, unknown>;

type AwarenessRow = {
  organization_id: string;
  awareness_status: string;
  urgency_score: number | string | null;
  top_issue_code: string | null;
  top_issue_summary: string | null;
  awareness_payload: AwarenessPayload | null;
  observed_at: string | null;
};

type SnapshotRow = {
  id: string;
  awareness_status: string;
  urgency_score: number | string | null;
  top_issue_code: string | null;
  top_issue_summary: string | null;
  awareness_payload: AwarenessPayload | null;
  captured_at: string;
};

type IntelligenceEventType =
  | 'issue_appeared'
  | 'issue_resolved'
  | 'issue_changed'
  | 'urgency_escalated'
  | 'urgency_deescalated'
  | 'reply_backlog_changed'
  | 'high_intent_changed'
  | 'system_failure_appeared'
  | 'system_failure_resolved';

type IntelligenceEventSeverity = 'info' | 'warning' | 'critical' | 'opportunity';

type IntelligenceEventInsert = {
  organization_id: string;
  event_version: 'r10-event-v1';
  event_key: string;
  event_type: IntelligenceEventType;
  severity: IntelligenceEventSeverity;
  title: string;
  summary: string;
  previous_snapshot_id: string;
  source_snapshot_id: string;
  evidence: Record<string, unknown>;
  observational: true;
  occurred_at: string;
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
}

function rawNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function payloadMetric(payload: AwarenessPayload | null, section: string, metric: string) {
  const sectionValue = objectValue(payload?.[section]);
  return rawNumber(sectionValue[metric]);
}

function isDominantIssue(value: string | null | undefined) {
  return Boolean(value && value !== 'no_dominant_issue');
}

function eventKey(sourceSnapshotId: string, eventType: IntelligenceEventType) {
  return `${sourceSnapshotId}:${eventType}`;
}

function buildEvents(
  organizationId: string,
  previous: SnapshotRow,
  current: SnapshotRow,
): IntelligenceEventInsert[] {
  const events: IntelligenceEventInsert[] = [];
  const occurredAt = current.captured_at;
  const previousUrgency = asNumber(previous.urgency_score);
  const currentUrgency = asNumber(current.urgency_score);
  const urgencyDelta = currentUrgency - previousUrgency;
  const previousIssue = previous.top_issue_code;
  const currentIssue = current.top_issue_code;

  const baseEvidence = {
    previous_snapshot_id: previous.id,
    source_snapshot_id: current.id,
    previous_awareness_status: previous.awareness_status,
    current_awareness_status: current.awareness_status,
    previous_urgency_score: previousUrgency,
    current_urgency_score: currentUrgency,
    urgency_delta: urgencyDelta,
    previous_top_issue_code: previousIssue,
    current_top_issue_code: currentIssue,
  };

  const push = (
    eventType: IntelligenceEventType,
    severity: IntelligenceEventSeverity,
    title: string,
    summary: string,
    evidence: Record<string, unknown> = {},
  ) => {
    events.push({
      organization_id: organizationId,
      event_version: 'r10-event-v1',
      event_key: eventKey(current.id, eventType),
      event_type: eventType,
      severity,
      title,
      summary,
      previous_snapshot_id: previous.id,
      source_snapshot_id: current.id,
      evidence: { ...baseEvidence, ...evidence },
      observational: true,
      occurred_at: occurredAt,
    });
  };

  if (!isDominantIssue(previousIssue) && isDominantIssue(currentIssue)) {
    push(
      'issue_appeared',
      current.awareness_status === 'urgent' ? 'critical' : 'warning',
      `Operating issue appeared: ${String(currentIssue).replace(/_/g, ' ')}`,
      current.top_issue_summary || 'A new dominant operating issue appeared between consecutive system observations.',
    );
  } else if (isDominantIssue(previousIssue) && !isDominantIssue(currentIssue)) {
    push(
      'issue_resolved',
      'opportunity',
      `Operating issue resolved: ${String(previousIssue).replace(/_/g, ' ')}`,
      'The previously dominant operating issue is no longer above the deterministic issue threshold.',
    );
  } else if (isDominantIssue(previousIssue) && isDominantIssue(currentIssue) && previousIssue !== currentIssue) {
    push(
      'issue_changed',
      current.awareness_status === 'urgent' ? 'critical' : 'warning',
      `Dominant issue changed to ${String(currentIssue).replace(/_/g, ' ')}`,
      current.top_issue_summary || 'The dominant operating issue changed between consecutive observations.',
    );
  }

  if (urgencyDelta >= URGENCY_CHANGE_THRESHOLD) {
    push(
      'urgency_escalated',
      currentUrgency >= 90 ? 'critical' : 'warning',
      `System urgency increased by ${urgencyDelta} points`,
      `Observed urgency increased from ${previousUrgency} to ${currentUrgency} between consecutive snapshots.`,
    );
  } else if (urgencyDelta <= -URGENCY_CHANGE_THRESHOLD) {
    push(
      'urgency_deescalated',
      'opportunity',
      `System urgency decreased by ${Math.abs(urgencyDelta)} points`,
      `Observed urgency decreased from ${previousUrgency} to ${currentUrgency} between consecutive snapshots.`,
    );
  }

  const previousReplies = payloadMetric(previous.awareness_payload, 'pipeline', 'needs_reply');
  const currentReplies = payloadMetric(current.awareness_payload, 'pipeline', 'needs_reply');
  const replyDelta = currentReplies - previousReplies;
  const replyThresholdCrossed = (previousReplies < 5 && currentReplies >= 5) || (previousReplies >= 5 && currentReplies < 5);
  if (Math.abs(replyDelta) >= REPLY_BACKLOG_CHANGE_THRESHOLD || replyThresholdCrossed) {
    push(
      'reply_backlog_changed',
      replyDelta > 0 ? (currentReplies >= 5 ? 'critical' : 'warning') : 'opportunity',
      replyDelta > 0 ? 'Reply backlog increased materially' : 'Reply backlog decreased materially',
      `Conversations needing a reply changed from ${Math.round(previousReplies)} to ${Math.round(currentReplies)}.`,
      {
        previous_needs_reply: previousReplies,
        current_needs_reply: currentReplies,
        needs_reply_delta: replyDelta,
        urgent_reply_threshold_crossed: replyThresholdCrossed,
      },
    );
  }

  const previousHighIntent = payloadMetric(previous.awareness_payload, 'pipeline', 'high_intent_leads');
  const currentHighIntent = payloadMetric(current.awareness_payload, 'pipeline', 'high_intent_leads');
  const highIntentDelta = currentHighIntent - previousHighIntent;
  if (Math.abs(highIntentDelta) >= HIGH_INTENT_CHANGE_THRESHOLD) {
    push(
      'high_intent_changed',
      highIntentDelta > 0 ? 'opportunity' : 'info',
      highIntentDelta > 0 ? 'High-intent lead volume increased' : 'High-intent lead volume decreased',
      `High-intent active leads changed from ${Math.round(previousHighIntent)} to ${Math.round(currentHighIntent)}.`,
      {
        previous_high_intent_leads: previousHighIntent,
        current_high_intent_leads: currentHighIntent,
        high_intent_delta: highIntentDelta,
      },
    );
  }

  const previousFailures = payloadMetric(previous.awareness_payload, 'operations', 'failures_24h');
  const currentFailures = payloadMetric(current.awareness_payload, 'operations', 'failures_24h');
  if (previousFailures <= 0 && currentFailures > 0) {
    push(
      'system_failure_appeared',
      'critical',
      'Backend/system failure appeared',
      `${Math.round(currentFailures)} backend or integration failure${currentFailures === 1 ? '' : 's'} are now present in the 24-hour operational window.`,
      {
        previous_system_failures_24h: previousFailures,
        current_system_failures_24h: currentFailures,
      },
    );
  } else if (previousFailures > 0 && currentFailures <= 0) {
    push(
      'system_failure_resolved',
      'opportunity',
      'Backend/system failure condition cleared',
      'The 24-hour system-awareness window no longer contains a backend or integration failure.',
      {
        previous_system_failures_24h: previousFailures,
        current_system_failures_24h: currentFailures,
      },
    );
  }

  return events;
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
    const { data, error } = await admin
      .from('v_r10_system_awareness_v1')
      .select('organization_id,awareness_status,urgency_score,top_issue_code,top_issue_summary,awareness_payload,observed_at');

    if (error) {
      console.error('R10_SYSTEM_AWARENESS_READ_FAILED', error);
      return NextResponse.json(
        { ok: false, error: 'System awareness could not be read.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const awareness = (data ?? []) as AwarenessRow[];
    const now = Date.now();
    const results: Array<{
      organizationId: string;
      action: 'inserted' | 'skipped' | 'failed';
      awarenessStatus: string;
      urgencyScore: number;
      eventsInserted: number;
      error?: string;
    }> = [];

    for (const row of awareness) {
      const { data: latest, error: latestError } = await admin
        .from('system_intelligence_snapshots')
        .select('id,awareness_status,urgency_score,top_issue_code,top_issue_summary,awareness_payload,captured_at')
        .eq('organization_id', row.organization_id)
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) {
        console.error('R10_SYSTEM_SNAPSHOT_LATEST_FAILED', row.organization_id, latestError);
      }

      const previousSnapshot = latestError ? null : (latest as SnapshotRow | null);
      const latestAt = previousSnapshot?.captured_at ? Date.parse(previousSnapshot.captured_at) : NaN;
      if (Number.isFinite(latestAt) && now - latestAt < MIN_SNAPSHOT_INTERVAL_MS) {
        results.push({
          organizationId: row.organization_id,
          action: 'skipped',
          awarenessStatus: row.awareness_status,
          urgencyScore: asNumber(row.urgency_score),
          eventsInserted: 0,
        });
        continue;
      }

      const { data: insertedSnapshot, error: insertError } = await admin
        .from('system_intelligence_snapshots')
        .insert({
          organization_id: row.organization_id,
          snapshot_version: 'r10-awareness-v1',
          awareness_status: row.awareness_status,
          urgency_score: asNumber(row.urgency_score),
          top_issue_code: row.top_issue_code,
          top_issue_summary: row.top_issue_summary,
          awareness_payload: row.awareness_payload ?? {},
          captured_by: 'scheduled_system_snapshot',
        })
        .select('id,awareness_status,urgency_score,top_issue_code,top_issue_summary,awareness_payload,captured_at')
        .single();

      if (insertError || !insertedSnapshot) {
        console.error('R10_SYSTEM_SNAPSHOT_INSERT_FAILED', row.organization_id, insertError);
        results.push({
          organizationId: row.organization_id,
          action: 'failed',
          awarenessStatus: row.awareness_status,
          urgencyScore: asNumber(row.urgency_score),
          eventsInserted: 0,
          error: 'Snapshot insert failed.',
        });
        continue;
      }

      let eventsInserted = 0;
      if (previousSnapshot) {
        const events = buildEvents(
          row.organization_id,
          previousSnapshot,
          insertedSnapshot as SnapshotRow,
        );

        if (events.length > 0) {
          const { error: eventError } = await admin
            .from('system_intelligence_events')
            .upsert(events, {
              onConflict: 'organization_id,event_key',
              ignoreDuplicates: true,
            });

          if (eventError) {
            console.error('R10_SYSTEM_EVENT_INSERT_FAILED', row.organization_id, eventError);
            results.push({
              organizationId: row.organization_id,
              action: 'failed',
              awarenessStatus: row.awareness_status,
              urgencyScore: asNumber(row.urgency_score),
              eventsInserted: 0,
              error: 'Snapshot inserted, but operational event memory failed.',
            });
            continue;
          }

          eventsInserted = events.length;
        }
      }

      results.push({
        organizationId: row.organization_id,
        action: 'inserted',
        awarenessStatus: row.awareness_status,
        urgencyScore: asNumber(row.urgency_score),
        eventsInserted,
      });
    }

    const failed = results.filter((row) => row.action === 'failed').length;
    const inserted = results.filter((row) => row.action === 'inserted').length;
    const skipped = results.filter((row) => row.action === 'skipped').length;
    const eventsInserted = results.reduce((sum, row) => sum + row.eventsInserted, 0);

    return NextResponse.json(
      {
        ok: failed === 0,
        observedOrganizations: awareness.length,
        inserted,
        skipped,
        failed,
        eventsInserted,
        results,
        guardrails: {
          live_awareness_is_deterministic: true,
          snapshots_are_observational: true,
          operational_events_are_observational: true,
          event_memory_uses_consecutive_real_snapshots: true,
          predictions_require_readiness_gate: true,
        },
      },
      { status: failed === 0 ? 200 : 207, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('R10_SYSTEM_SNAPSHOT_RUNNER_FAILED', error);
    return NextResponse.json(
      { ok: false, error: 'System intelligence snapshot runner is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
