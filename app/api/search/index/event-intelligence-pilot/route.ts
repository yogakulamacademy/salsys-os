import { NextResponse } from 'next/server';

import { runSearchIndexWorker } from '@/lib/search/opensearch';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PILOT_ORGANIZATION_ID = '3d9ef175-1624-4d89-a0bd-73d3f82c23c0';
const PILOT_BRANCH = 'feature/opensearch-runtime-20261019';
const PILOT_SCOPE = 'event_intelligence_v1';
const MAX_PILOT_DOCUMENTS = 10;

function blocked(reason: string, status = 409, details?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, controlledPilot: true, reason, ...details },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') return blocked('preview_environment_required', 403);
  if (process.env.VERCEL_GIT_COMMIT_REF !== PILOT_BRANCH) {
    return blocked('controlled_pilot_branch_required', 403);
  }

  const admin = createAdminClient();
  let armed = false;

  try {
    const { data: settings, error: settingsError } = await admin
      .from('search_index_settings')
      .select('indexing_enabled,pilot_mode_enabled,pilot_max_documents,pilot_seeded_at')
      .eq('organization_id', PILOT_ORGANIZATION_ID)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings) return blocked('search_index_settings_missing');
    if (settings.indexing_enabled === true) return blocked('indexing_must_start_disabled');
    if (settings.pilot_mode_enabled !== true) return blocked('pilot_mode_required');
    if (!settings.pilot_seeded_at) return blocked('pilot_not_seeded');
    if (Number(settings.pilot_max_documents ?? 0) > MAX_PILOT_DOCUMENTS) {
      return blocked('pilot_cap_too_large');
    }

    const { data: rows, error: rowsError } = await admin
      .from('search_index_outbox')
      .select('id,entity_type,metadata,status')
      .eq('organization_id', PILOT_ORGANIZATION_ID)
      .in('status', ['pending', 'retry', 'processing'])
      .eq('metadata->>seed', 'pilot_v1');
    if (rowsError) throw rowsError;

    const pending = rows ?? [];
    if (pending.length === 0) return blocked('pilot_queue_empty');
    if (pending.length > MAX_PILOT_DOCUMENTS) return blocked('pilot_queue_exceeds_controlled_cap');

    const unsafe = pending.filter((row) => {
      const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
      return metadata.pilot_scope !== PILOT_SCOPE ||
        !['event_feature', 'event_prediction'].includes(String(row.entity_type ?? ''));
    });
    if (unsafe.length > 0) return blocked('non_event_intelligence_pilot_rows_present');

    const { data: armResult, error: armError } = await admin.rpc('arm_search_index_pilot_v1', {
      p_organization_id: PILOT_ORGANIZATION_ID,
      p_confirm_external_indexing: true,
    });
    if (armError) throw armError;
    if (!armResult?.ok || !armResult?.armed) return blocked('pilot_arm_rejected', 409, { armResult });
    armed = true;

    const worker = await runSearchIndexWorker({ organizationId: PILOT_ORGANIZATION_ID });

    return NextResponse.json({
      ok: worker.ok,
      controlledPilot: true,
      queuedBeforeRun: pending.length,
      pilotScope: PILOT_SCOPE,
      worker,
      safety: {
        sourceOfTruth: 'postgresql',
        rawEventsIndexed: false,
        autonomousBusinessActions: false,
        disarmInFinally: true,
      },
    }, {
      status: worker.ok ? 200 : 207,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Controlled OpenSearch pilot failed.';
    return NextResponse.json(
      { ok: false, controlledPilot: true, error: message.slice(0, 1000) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    if (armed) {
      await admin.rpc('disarm_search_index_pilot_v1', { p_organization_id: PILOT_ORGANIZATION_ID });
    }
  }
}
