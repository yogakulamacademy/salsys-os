import { createHash, randomBytes } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const CLIENT_PLATFORMS = new Set(['android', 'ios', 'shopify', 'web']);

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

export async function GET() {
  const auth = await adminWorkspace();
  if ('error' in auth) return auth.error;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tracking_sources')
    .select(
      'id,name,source_type,source_system,source_key,auth_mode,hostname,status,allowed_event_prefixes,max_payload_bytes,rate_limit_per_minute,accepted_event_count,duplicate_event_count,rejected_event_count,last_seen_at,last_rejected_at,privacy_mode,honor_gpc,require_consent_for_optional,privacy_notice_version,metadata,created_at,updated_at',
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
    requestedType && ['client', 'api', 'webhook', 'system'].includes(requestedType)
      ? requestedType
      : 'api';

  if (!name) return jsonError('Source name is required.', 400);

  const platform = cleanText(raw.platform, 40)?.toLowerCase() ?? null;
  const isPublishableClient = sourceType === 'client';

  if (isPublishableClient && (!platform || !CLIENT_PLATFORMS.has(platform))) {
    return jsonError('Client sources require platform: android, ios, shopify, or web.', 400);
  }

  const defaultSourceSystem = isPublishableClient
    ? platform === 'android' || platform === 'ios'
      ? 'app'
      : 'website'
    : slug(name);

  const sourceSystem =
    cleanText(raw.sourceSystem ?? raw.source_system, 80) || defaultSourceSystem;

  const rawPrefixes = raw.allowedEventPrefixes ?? raw.allowed_event_prefixes;
  let allowedEventPrefixes = Array.isArray(rawPrefixes)
    ? rawPrefixes
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => /^[a-z][a-z0-9_]*\.$/.test(value))
        .slice(0, 50)
    : [];

  if (isPublishableClient) {
    const platformPrefix = platform === 'android' || platform === 'ios' ? 'app.' : 'web.';
    allowedEventPrefixes = allowedEventPrefixes.filter((prefix) => prefix === platformPrefix);
    if (allowedEventPrefixes.length === 0) allowedEventPrefixes = [platformPrefix];
  }

  const requestedLimit = Number(
    raw.rateLimitPerMinute ?? raw.rate_limit_per_minute ?? 600,
  );
  const rateLimitPerMinute = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 100000))
    : 600;

  const requestedBytes = Number(
    raw.maxPayloadBytes ?? raw.max_payload_bytes ?? 32768,
  );
  const maxPayloadBytes = Number.isInteger(requestedBytes)
    ? Math.max(1024, Math.min(requestedBytes, 1048576))
    : 32768;

  const privacyNoticeVersion = cleanText(
    raw.privacyNoticeVersion ?? raw.privacy_notice_version,
    120,
  );

  if (isPublishableClient && !privacyNoticeVersion) {
    return jsonError('Client sources require a privacy notice version.', 400);
  }

  const sourceKey = `src_${randomBytes(18).toString('base64url')}`;
  const secret = isPublishableClient
    ? null
    : `sls_${randomBytes(32).toString('base64url')}`;
  const secretHash = secret ? sha256(secret) : null;
  const authMode = isPublishableClient ? 'publishable' : 'secret';
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('tracking_sources')
    .insert({
      organization_id: auth.organizationId,
      name,
      source_type: sourceType,
      source_system: sourceSystem,
      source_key: sourceKey,
      auth_mode: authMode,
      secret_hash: secretHash,
      status: 'active',
      allowed_event_prefixes: allowedEventPrefixes,
      max_payload_bytes: maxPayloadBytes,
      rate_limit_per_minute: rateLimitPerMinute,
      privacy_mode: 'strict',
      honor_gpc: true,
      require_consent_for_optional: true,
      privacy_notice_version: privacyNoticeVersion,
      metadata: {
        provisioned_by: auth.user.id,
        provisioned_via: 'app/api/tracking/sources',
        platform,
        credential_class: isPublishableClient ? 'publishable_identifier' : 'server_secret',
        authority: isPublishableClient
          ? 'non_authoritative_client_telemetry'
          : 'trusted_server_source',
      },
    })
    .select(
      'id,name,source_type,source_system,source_key,auth_mode,status,allowed_event_prefixes,max_payload_bytes,rate_limit_per_minute,privacy_notice_version,metadata,created_at',
    )
    .single();

  if (error || !data) {
    return jsonError(error?.message ?? 'Unable to create tracking source.', 500);
  }

  return NextResponse.json(
    {
      ok: true,
      source: data,
      credentials: isPublishableClient
        ? {
            source_key: sourceKey,
            publishable: true,
            secret: null,
            shown_once: false,
          }
        : {
            source_key: sourceKey,
            secret,
            publishable: false,
            shown_once: true,
          },
    },
    {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
