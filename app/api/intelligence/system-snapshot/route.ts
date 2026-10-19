import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MIN_SNAPSHOT_INTERVAL_MS = 50 * 60 * 1000;

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

type AwarenessRow = {
  organization_id: string;
  awareness_status: string;
  urgency_score: number | string | null;
  top_issue_code: string | null;
  top_issue_summary: string | null;
  awareness_payload: Record<string, unknown> | null;
  observed_at: string | null;
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
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
      error?: string;
    }> = [];

    for (const row of awareness) {
      const { data: latest, error: latestError } = await admin
        .from('system_intelligence_snapshots')
        .select('captured_at')
        .eq('organization_id', row.organization_id)
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) {
        console.error('R10_SYSTEM_SNAPSHOT_LATEST_FAILED', row.organization_id, latestError);
      }

      const latestAt = latest?.captured_at ? Date.parse(latest.captured_at) : NaN;
      if (Number.isFinite(latestAt) && now - latestAt < MIN_SNAPSHOT_INTERVAL_MS) {
        results.push({
          organizationId: row.organization_id,
          action: 'skipped',
          awarenessStatus: row.awareness_status,
          urgencyScore: asNumber(row.urgency_score),
        });
        continue;
      }

      const { error: insertError } = await admin
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
        });

      if (insertError) {
        console.error('R10_SYSTEM_SNAPSHOT_INSERT_FAILED', row.organization_id, insertError);
        results.push({
          organizationId: row.organization_id,
          action: 'failed',
          awarenessStatus: row.awareness_status,
          urgencyScore: asNumber(row.urgency_score),
          error: 'Snapshot insert failed.',
        });
        continue;
      }

      results.push({
        organizationId: row.organization_id,
        action: 'inserted',
        awarenessStatus: row.awareness_status,
        urgencyScore: asNumber(row.urgency_score),
      });
    }

    const failed = results.filter((row) => row.action === 'failed').length;
    const inserted = results.filter((row) => row.action === 'inserted').length;
    const skipped = results.filter((row) => row.action === 'skipped').length;

    return NextResponse.json(
      {
        ok: failed === 0,
        observedOrganizations: awareness.length,
        inserted,
        skipped,
        failed,
        results,
        guardrails: {
          live_awareness_is_deterministic: true,
          snapshots_are_observational: true,
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
