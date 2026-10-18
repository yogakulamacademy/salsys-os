import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

const PILOT_ORGANIZATION_ID = '11111111-1111-1111-1111-111111111111';
const MAX_PILOT_DOCUMENTS = 25;
const ALLOWED_ENTITY_TYPES = new Set([
  'lead',
  'conversation',
  'message',
  'knowledge_chunk',
]);

function authorized(request: NextRequest) {
  const expected = process.env.SEARCH_INDEX_WORKER_SECRET?.trim();
  if (!expected) return false;
  const authorization = request.headers.get('authorization') ?? '';
  return authorization === `Bearer ${expected}`;
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
}

async function getStatus() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('search_index_settings')
    .select('organization_id,provider,indexing_enabled,batch_size,max_attempts,pilot_mode_enabled,pilot_started_at,pilot_max_documents,pilot_seeded_at,pilot_completed_at,updated_at')
    .eq('organization_id', PILOT_ORGANIZATION_ID)
    .maybeSingle();

  if (error) throw new Error(`pilot_status_failed:${error.message}`);
  return data;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return unauthorized();

  try {
    return NextResponse.json({
      ok: true,
      organizationId: PILOT_ORGANIZATION_ID,
      settings: await getStatus(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Pilot status failed.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return unauthorized();

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = String(body.action ?? '').trim();
  const suppliedOrganizationId = String(body.organizationId ?? PILOT_ORGANIZATION_ID).trim();

  if (suppliedOrganizationId !== PILOT_ORGANIZATION_ID) {
    return NextResponse.json(
      { ok: false, error: 'This endpoint is locked to the controlled Yogakulam pilot organization.' },
      { status: 403 },
    );
  }

  const supabase = createAdminClient();

  try {
    if (action === 'stage') {
      const requested = Number(body.maxDocuments ?? 25);
      const maxDocuments = Number.isInteger(requested)
        ? Math.min(MAX_PILOT_DOCUMENTS, Math.max(1, requested))
        : MAX_PILOT_DOCUMENTS;

      const { data, error } = await supabase.rpc('stage_search_index_pilot_v1', {
        p_organization_id: PILOT_ORGANIZATION_ID,
        p_max_documents: maxDocuments,
        p_confirm_controlled_pilot: body.confirm === true,
      });
      if (error) throw new Error(`pilot_stage_failed:${error.message}`);

      return NextResponse.json({ ok: true, action, result: data, settings: await getStatus() });
    }

    if (action === 'seed') {
      const requestedTypes = Array.isArray(body.entityTypes)
        ? body.entityTypes.map((value) => String(value).trim())
        : ['lead', 'conversation', 'message', 'knowledge_chunk'];
      const entityTypes = [...new Set(requestedTypes.filter((value) => ALLOWED_ENTITY_TYPES.has(value)))];

      if (entityTypes.length === 0) {
        return NextResponse.json({ ok: false, error: 'No allowed entity types supplied.' }, { status: 400 });
      }

      const { data, error } = await supabase.rpc('seed_search_index_pilot_v1', {
        p_organization_id: PILOT_ORGANIZATION_ID,
        p_entity_types: entityTypes,
      });
      if (error) throw new Error(`pilot_seed_failed:${error.message}`);

      return NextResponse.json({ ok: true, action, result: data, settings: await getStatus() });
    }

    if (action === 'arm') {
      if (body.confirm !== true) {
        return NextResponse.json(
          { ok: false, error: 'Explicit confirm=true is required to arm external indexing.' },
          { status: 400 },
        );
      }

      const { data, error } = await supabase.rpc('arm_search_index_pilot_v1', {
        p_organization_id: PILOT_ORGANIZATION_ID,
        p_confirm_external_indexing: true,
      });
      if (error) throw new Error(`pilot_arm_failed:${error.message}`);

      return NextResponse.json({ ok: true, action, result: data, settings: await getStatus() });
    }

    return NextResponse.json(
      { ok: false, error: 'Unsupported action. Use stage, seed, or arm.' },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Pilot operation failed.' },
      { status: 500 },
    );
  }
}
