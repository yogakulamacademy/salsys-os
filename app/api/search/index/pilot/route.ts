import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

const PILOT_ORGANIZATION_SLUG = 'yogakulam-academy';
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

async function resolvePilotOrganizationId() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', PILOT_ORGANIZATION_SLUG)
    .maybeSingle();

  if (error) throw new Error(`pilot_organization_resolve_failed:${error.message}`);
  if (!data?.id) throw new Error('pilot_organization_not_found');
  return String(data.id);
}

async function getStatus(organizationId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('search_index_settings')
    .select('organization_id,provider,indexing_enabled,batch_size,max_attempts,pilot_mode_enabled,pilot_started_at,pilot_max_documents,pilot_seeded_at,pilot_completed_at,updated_at')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw new Error(`pilot_status_failed:${error.message}`);
  return data;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return unauthorized();

  try {
    const organizationId = await resolvePilotOrganizationId();
    return NextResponse.json({
      ok: true,
      organizationSlug: PILOT_ORGANIZATION_SLUG,
      organizationId,
      settings: await getStatus(organizationId),
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
  const supabase = createAdminClient();

  try {
    const organizationId = await resolvePilotOrganizationId();

    if (body.organizationId != null && String(body.organizationId).trim() !== organizationId) {
      return NextResponse.json(
        { ok: false, error: 'This endpoint is locked to the live Yogakulam pilot organization.' },
        { status: 403 },
      );
    }

    if (action === 'stage') {
      const requested = Number(body.maxDocuments ?? 25);
      const maxDocuments = Number.isInteger(requested)
        ? Math.min(MAX_PILOT_DOCUMENTS, Math.max(1, requested))
        : MAX_PILOT_DOCUMENTS;

      const { data, error } = await supabase.rpc('stage_search_index_pilot_v1', {
        p_organization_id: organizationId,
        p_max_documents: maxDocuments,
        p_confirm_controlled_pilot: body.confirm === true,
      });
      if (error) throw new Error(`pilot_stage_failed:${error.message}`);

      return NextResponse.json({ ok: true, action, organizationId, result: data, settings: await getStatus(organizationId) });
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
        p_organization_id: organizationId,
        p_entity_types: entityTypes,
      });
      if (error) throw new Error(`pilot_seed_failed:${error.message}`);

      return NextResponse.json({ ok: true, action, organizationId, result: data, settings: await getStatus(organizationId) });
    }

    if (action === 'arm') {
      if (body.confirm !== true) {
        return NextResponse.json(
          { ok: false, error: 'Explicit confirm=true is required to arm external indexing.' },
          { status: 400 },
        );
      }

      const { data, error } = await supabase.rpc('arm_search_index_pilot_v1', {
        p_organization_id: organizationId,
        p_confirm_external_indexing: true,
      });
      if (error) throw new Error(`pilot_arm_failed:${error.message}`);

      return NextResponse.json({ ok: true, action, organizationId, result: data, settings: await getStatus(organizationId) });
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
