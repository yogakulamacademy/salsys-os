import {
  createHash,
  randomBytes,
} from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { ok: false, error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
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
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'external_system';
}

function sha256(value: string) {
  return createHash('sha256')
    .update(value, 'utf8')
    .digest('hex');
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

export async function GET() {
  const auth = await adminWorkspace();
  if ('error' in auth) return auth.error;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tracking_sources')
    .select(
      'id,name,source_type,source_system,source_key,auth_mode,hostname,status,allowed_event_prefixes,max_payload_bytes,rate_limit_per_minute,accepted_event_count,duplicate_event_count,rejected_event_count,last_seen_at,last_rejected_at,created_at,updated_at',
    )
    .eq('organization_id', auth.organizationId)
    .order('created_at', { ascending: true });

  if (error) return jsonError(error.message, 500);

  return NextResponse.json(
    { ok: true, sources: data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return jsonError('Invalid request origin.', 403);
  }

  const auth = await adminWorkspace();
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Invalid source payload.', 400);
  }

  const raw = body as Record<string, unknown>;
  const name = cleanText(raw.name, 120);
  const requestedType = cleanText(raw.sourceType ?? raw.source_type, 30);
  const sourceType =
    requestedType && ['api', 'webhook', 'system'].includes(requestedType)
      ? requestedType
      : 'api';

  if (!name) return jsonError('Source name is required.', 400);

  const sourceSystem =
    cleanText(raw.sourceSystem ?? raw.source_system, 80) || slug(name);

  const rawPrefixes = raw.allowedEventPrefixes ?? raw.allowed_event_prefixes;
  const allowedEventPrefixes = Array.isArray(rawPrefixes)
    ? rawPrefixes
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => /^[a-z][a-z0-9_]*\.$/.test(value))
        .slice(0, 50)
    : [];

  const requestedLimit = Number(raw.rateLimitPerMinute ?? raw.rate_limit_per_minute ?? 600);
  const rateLimitPerMinute = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 100000))
    : 600;

  const requestedBytes = Number(raw.maxPayloadBytes ?? raw.max_payload_bytes ?? 32768);
  const maxPayloadBytes = Number.isInteger(requestedBytes)
    ? Math.max(1024, Math.min(requestedBytes, 1048576))
    : 32768;

  const secret = `sls_${randomBytes(32).toString('base64url')}`;
  const secretHash = sha256(secret);
  const sourceKey = `src_${randomBytes(18).toString('base64url')}`;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('tracking_sources')
    .insert({
      organization_id: auth.organizationId,
      name,
      source_type: sourceType,
      source_system: sourceSystem,
      source_key: sourceKey,
      auth_mode: 'secret',
      secret_hash: secretHash,
      status: 'active',
      allowed_event_prefixes: allowedEventPrefixes,
      max_payload_bytes: maxPayloadBytes,
      rate_limit_per_minute: rateLimitPerMinute,
      metadata: {
        provisioned_by: auth.user.id,
        provisioned_via: 'app/api/tracking/sources',
      },
    })
    .select(
      'id,name,source_type,source_system,source_key,status,allowed_event_prefixes,max_payload_bytes,rate_limit_per_minute,created_at',
    )
    .single();

  if (error || !data) {
    return jsonError(error?.message ?? 'Unable to create tracking source.', 500);
  }

  return NextResponse.json(
    {
      ok: true,
      source: data,
      credentials: {
        source_key: sourceKey,
        secret,
        shown_once: true,
      },
    },
    {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
