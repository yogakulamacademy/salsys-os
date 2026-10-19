import { NextResponse } from 'next/server';

import { runSearchIndexWorker } from '@/lib/search/opensearch';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PILOT_ORGANIZATION_ID = '3d9ef175-1624-4d89-a0bd-73d3f82c23c0';
const PILOT_BRANCH = 'pilot/event-intelligence-opensearch-v1-20261019';
const PILOT_SCOPE = 'event_intelligence_v1';
const MAX_PILOT_DOCUMENTS = 10;

function blocked(reason: string, status = 409, details?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, controlledPilot: true, reason, ...details },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return blocked('preview_environment_required', 403);
  }

  if (process.env.VERCEL_GIT_COMMIT_REF !== PILOT_BRANCH) {
    return blocked('controlled_pilot_branch_required', 403, {
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    });
  }

  const admin = createAdminClient();
  let armed = false;

  try {
    const { data: settings, error: settingsError } = await admin
      .from('search_index_settings')
      .select(
        'organization_id,indexing_enabled,pilot_mode_enabled,pilot_started_at,pilot_max_documents,pilot_seeded_at',
      )
      .eq('organization_id', PILOT_ORGANIZATION_ID)
      .maybeSingle();

    if (settingsError) throw settingsError;
    if (!settings) return blocked('search_index_settings_missing');
    if (settings.indexing_enabled === true) {
      return blocked('indexing_must_start_disabled');
    }
    if (settings.pilot_mode_enabled !== true) {
      return blocked('pilot_mode_required');
    }
    if (!settings.pilot_seeded_at) {
      return blocked('pilot_not_seeded');
    }
    if (Number(settings.pilot_max_documents ?? 0) > MAX_PILOT_DOCUMENTS) {
      return blocked('pilot_cap_too_large', 409, {
        configuredCap: settings.pilot_max_documents,
        allowedCap: MAX_PILOT_DOCUMENTS,
      });
    }

    const { data: pendingRows, error: pendingError } = await admin
      .from('search_index_outbox')
      .select('id,entity_type,metadata,status')
      .eq('organization_id', PILOT_ORGANIZATION_ID)
      .in('status', ['pending', 'retry', 'processing'])
      .eq('metadata->>seed', 'pilot_v1');

    if (pendingError) throw pendingError;

    const pending = pendingRows ?? [];
    if (pending.length === 0) return blocked('pilot_queue_empty');
    if (pending.length > MAX_PILOT_DOCUMENTS) {
      return blocked('pilot_queue_exceeds_controlled_cap', 409, {
        queued: pending.length,
        cap: MAX_PILOT_DOCUMENTS,
      });
    }

    const unsafe = pending.filter((row) => {
      const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
      return (
        metadata.pilot_scope !== PILOT_SCOPE ||
        !['event_feature', 'event_prediction'].includes(String(row.entity_type ?? ''))
      );
    });

    if (unsafe.length > 0) {
      return blocked('non_event_intelligence_pilot_rows_present', 409, {
        unsafeCount: unsafe.length,
      });
    }

    const { data: armResult, error: armError } = await admin.rpc(
      'arm_search_index_pilot_v1',
      {
        p_organization_id: PILOT_ORGANIZATION_ID,
        p_confirm_external_indexing: true,
      },
    );

    if (armError) throw armError;
    if (!armResult?.ok || !armResult?.armed) {
      return blocked('pilot_arm_rejected', 409, { armResult });
    }
    armed = true;

    const worker = await runSearchIndexWorker({
      organizationId: PILOT_ORGANIZATION_ID,
      limit: Math.min(pending.length, MAX_PILOT_DOCUMENTS),
    });

    return NextResponse.json(
      {
        ok: worker.ok,
        controlledPilot: true,
        organizationId: PILOT_ORGANIZATION_ID,
        pilotScope: PILOT_SCOPE,
        queuedBeforeRun: pending.length,
        worker,
        safety: {
          sourceOfTruth: 'postgresql',
          rawEventsIndexed: false,
          autonomousBusinessActions: false,
          disarmInFinally: true,
        },
      },
      {
        status: worker.ok ? 200 : 207,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Controlled OpenSearch pilot failed.';
    console.error('Event Intelligence controlled OpenSearch pilot failed.', error);
    return NextResponse.json(
      { ok: false, controlledPilot: true, error: message.slice(0, 1000) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    if (armed) {
      const { error } = await admin.rpc('disarm_search_index_pilot_v1', {
        p_organization_id: PILOT_ORGANIZATION_ID,
      });
      if (error) {
        console.error('Unable to disarm Event Intelligence OpenSearch pilot.', error);
      }
    }
  }
}
