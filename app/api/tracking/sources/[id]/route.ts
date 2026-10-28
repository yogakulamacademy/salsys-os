import { createHash, randomBytes } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { readBoundedJson } from '@/lib/security/bounded-json-body';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const TRACKING_ADMIN_BODY_MAX_BYTES = 32 * 1024;

const SERVER_SOURCE_TYPES = new Set(['api', 'webhook', 'system']);
const ALLOWED_SERVER_PREFIXES = new Set([
  'web.',
  'lead.',
  'booking.',
  'payment.',
  'enrollment.',
]);

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function sameOrigin(request: NextRequest) {
  return request.headers.get('origin') === request.nextUrl.origin;
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'website_backend'
  );
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function adminWorkspace() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: jsonError('Sign in to manage tracking sources.', 401) };
  }

  const context = await getWorkspaceContextForUser(supabase, user.id);
  const workspace = context.activeWorkspace;

  if (!workspace || !['owner', 'admin'].includes(workspace.role)) {
    return {
      error: jsonError(
        'You do not have permission to manage tracking sources for this workspace.',
        403,
      ),
    };
  }

  return {
    user,
    organizationId: workspace.organizationId,
  };
}

async function loadServerSource(id: string, organizationId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tracking_sources')
    .select(
      'id,name,source_type,source_system,source_key,auth_mode,status,allowed_event_prefixes,max_payload_bytes,rate_limit_per_minute,secret_version,accepted_event_count,duplicate_event_count,rejected_event_count,last_seen_at,metadata,updated_at',
    )
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single();

  if (error || !data) return null;
  if (!SERVER_SOURCE_TYPES.has(String(data.source_type))) return null;
  if (String(data.auth_mode) !== 'secret') return null;
  return data;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request)) return jsonError('Invalid request origin.', 403);

  const auth = await adminWorkspace();
  if ('error' in auth) return auth.error;

  const { id } = await context.params;
  const source = await loadServerSource(id, auth.organizationId);
  if (!source) return jsonError('Server tracking source not found.', 404);

  const parsedBody = await readBoundedJson<Record<string, unknown>>(
    request,
    TRACKING_ADMIN_BODY_MAX_BYTES,
  );
  if (!parsedBody.ok) return jsonError(parsedBody.error, parsedBody.status);

  const body = parsedBody.value;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Invalid source payload.', 400);
  }

  const raw = body as Record<string, unknown>;
  const name = cleanText(raw.name, 120);
  const sourceSystemRaw = cleanText(raw.sourceSystem ?? raw.source_system, 80);
  const statusRaw = cleanText(raw.status, 20)?.toLowerCase();

  if (!name) return jsonError('Source name is required.', 400);
  if (!sourceSystemRaw) return jsonError('Source system key is required.', 400);

  const sourceSystem = slug(sourceSystemRaw);
  const status = statusRaw === 'paused' ? 'paused' : statusRaw === 'active' ? 'active' : null;
  if (!status) return jsonError('Status must be active or paused.', 400);

  const rawPrefixes = raw.allowedEventPrefixes ?? raw.allowed_event_prefixes;
  const allowedEventPrefixes = Array.isArray(rawPrefixes)
    ? Array.from(
        new Set(
          rawPrefixes
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim().toLowerCase())
            .filter((value) => ALLOWED_SERVER_PREFIXES.has(value)),
        ),
      )
    : [];

  if (allowedEventPrefixes.length === 0) {
    return jsonError('Choose at least one allowed server event family.', 400);
  }

  const requestedLimit = Number(raw.rateLimitPerMinute ?? raw.rate_limit_per_minute);
  const rateLimitPerMinute = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 100000))
    : Number(source.rate_limit_per_minute ?? 1200);

  const requestedBytes = Number(raw.maxPayloadBytes ?? raw.max_payload_bytes);
  const maxPayloadBytes = Number.isInteger(requestedBytes)
    ? Math.max(1024, Math.min(requestedBytes, 1048576))
    : Number(source.max_payload_bytes ?? 65536);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tracking_sources')
    .update({
      name,
      source_system: sourceSystem,
      status,
      allowed_event_prefixes: allowedEventPrefixes,
      rate_limit_per_minute: rateLimitPerMinute,
      max_payload_bytes: maxPayloadBytes,
      metadata: {
        ...(source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
          ? source.metadata
          : {}),
        last_edited_by: auth.user.id,
        last_edited_via: 'app/api/tracking/sources/[id]',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .select(
      'id,name,source_type,source_system,source_key,auth_mode,status,allowed_event_prefixes,max_payload_bytes,rate_limit_per_minute,secret_version,accepted_event_count,duplicate_event_count,rejected_event_count,last_seen_at,metadata,updated_at',
    )
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      return jsonError('That source system key is already in use.', 409);
    }
    return jsonError(error?.message ?? 'Unable to update server tracking source.', 500);
  }

  return NextResponse.json(
    { ok: true, source: data },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request)) return jsonError('Invalid request origin.', 403);

  const auth = await adminWorkspace();
  if ('error' in auth) return auth.error;

  const { id } = await context.params;
  const source = await loadServerSource(id, auth.organizationId);
  if (!source) return jsonError('Server tracking source not found.', 404);

  const hasHistory =
    Number(source.accepted_event_count ?? 0) > 0 ||
    Number(source.duplicate_event_count ?? 0) > 0 ||
    Number(source.rejected_event_count ?? 0) > 0 ||
    Boolean(source.last_seen_at);

  if (hasHistory) {
    return jsonError(
      'This source already has tracking history and cannot be permanently deleted. Pause it instead to preserve reporting and audit history.',
      409,
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tracking_sources')
    .delete()
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .select('id,name')
    .single();

  if (error || !data) {
    return jsonError(
      error?.message ?? 'Unable to delete unused server tracking source.',
      500,
    );
  }

  return NextResponse.json(
    { ok: true, deleted: data },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request)) return jsonError('Invalid request origin.', 403);

  const auth = await adminWorkspace();
  if ('error' in auth) return auth.error;

  const { id } = await context.params;
  const source = await loadServerSource(id, auth.organizationId);
  if (!source) return jsonError('Server tracking source not found.', 404);

  const parsedBody = await readBoundedJson<Record<string, unknown>>(
    request,
    TRACKING_ADMIN_BODY_MAX_BYTES,
  );
  if (!parsedBody.ok) return jsonError(parsedBody.error, parsedBody.status);

  const body = parsedBody.value;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Invalid action payload.', 400);
  }

  const action = cleanText((body as Record<string, unknown>).action, 40);
  if (action !== 'rotate_secret') {
    return jsonError('Unsupported source action.', 400);
  }

  const secret = `sls_${randomBytes(32).toString('base64url')}`;
  const secretHash = sha256(secret);
  const nextVersion = Math.max(1, Number(source.secret_version ?? 1) + 1);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tracking_sources')
    .update({
      secret_hash: secretHash,
      secret_version: nextVersion,
      metadata: {
        ...(source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
          ? source.metadata
          : {}),
        secret_rotated_at: new Date().toISOString(),
        secret_rotated_by: auth.user.id,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', auth.organizationId)
    .select('id,name,source_key,secret_version,status,updated_at')
    .single();

  if (error || !data) {
    return jsonError(error?.message ?? 'Unable to rotate server secret.', 500);
  }

  return NextResponse.json(
    {
      ok: true,
      source: data,
      credentials: {
        source_key: data.source_key,
        secret,
        shown_once: true,
        secret_version: data.secret_version,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
