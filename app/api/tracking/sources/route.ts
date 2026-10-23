import { createHash, randomBytes } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const CLIENT_PLATFORMS = new Set(['android', 'ios', 'shopify', 'web']);
const WEBSITE_PLATFORMS = new Set([
  'custom_web',
  'wordpress',
  'webflow',
  'framer',
  'react',
  'nextjs',
  'vue',
  'angular',
]);
const SITE_ENVIRONMENTS = new Set([
  'production',
  'staging',
  'development',
]);

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
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'external_system'
  );
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeHostname(value: unknown) {
  const raw = cleanText(value, 300)?.toLowerCase() ?? null;
  if (!raw) return null;

  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname || hostname.length > 253) return null;
    if (!/^[a-z0-9.-]+$/.test(hostname)) return null;
    if (
      hostname.startsWith('.') ||
      hostname.endsWith('.') ||
      hostname.includes('..')
    ) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
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
      'id,organization_site_id,name,source_type,source_system,source_key,auth_mode,hostname,status,allowed_event_prefixes,max_payload_bytes,rate_limit_per_minute,accepted_event_count,duplicate_event_count,rejected_event_count,last_seen_at,last_rejected_at,privacy_mode,honor_gpc,require_consent_for_optional,privacy_notice_version,metadata,created_at,updated_at',
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
    requestedType &&
    ['website', 'client', 'api', 'webhook', 'system'].includes(requestedType)
      ? requestedType
      : 'api';

  if (!name) return jsonError('Source name is required.', 400);

  const requestedPlatform = cleanText(raw.platform, 40)?.toLowerCase() ?? null;
  const isWebsite = sourceType === 'website';
  const isPublishableClient = sourceType === 'client';

  if (
    isPublishableClient &&
    (!requestedPlatform || !CLIENT_PLATFORMS.has(requestedPlatform))
  ) {
    return jsonError(
      'Client sources require platform: android, ios, shopify, or web.',
      400,
    );
  }

  if (
    isWebsite &&
    requestedPlatform &&
    !WEBSITE_PLATFORMS.has(requestedPlatform)
  ) {
    return jsonError(
      'Website platform must be custom_web, wordpress, webflow, framer, react, nextjs, vue, or angular.',
      400,
    );
  }

  const platform = isWebsite
    ? requestedPlatform ?? 'custom_web'
    : requestedPlatform;
  const hostname = isWebsite
    ? normalizeHostname(raw.hostname ?? raw.origin ?? raw.url)
    : null;

  if (isWebsite && !hostname) {
    return jsonError(
      'Website sources require a valid hostname or origin.',
      400,
    );
  }

  const requestedEnvironment =
    cleanText(raw.environment ?? raw.siteEnvironment ?? raw.site_environment, 30)
      ?.toLowerCase() ?? 'production';
  const environment = SITE_ENVIRONMENTS.has(requestedEnvironment)
    ? requestedEnvironment
    : null;

  if (isWebsite && !environment) {
    return jsonError(
      'Website environment must be production, staging, or development.',
      400,
    );
  }

  const defaultSourceSystem = isWebsite
    ? 'website'
    : isPublishableClient
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

  if (isWebsite) {
    allowedEventPrefixes = ['web.'];
  } else if (isPublishableClient) {
    const platformPrefix =
      platform === 'android' || platform === 'ios' ? 'app.' : 'web.';
    allowedEventPrefixes = allowedEventPrefixes.filter(
      (prefix) => prefix === platformPrefix,
    );
    if (allowedEventPrefixes.length === 0) {
      allowedEventPrefixes = [platformPrefix];
    }
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

  if ((isWebsite || isPublishableClient) && !privacyNoticeVersion) {
    return jsonError(
      `${isWebsite ? 'Website' : 'Client'} sources require a privacy notice version.`,
      400,
    );
  }

  const sourceKey = `src_${randomBytes(18).toString('base64url')}`;
  const hasPublicCredential = isWebsite || isPublishableClient;
  const secret = hasPublicCredential
    ? null
    : `sls_${randomBytes(32).toString('base64url')}`;
  const secretHash = secret ? sha256(secret) : null;
  const authMode = isWebsite ? 'origin' : isPublishableClient ? 'publishable' : 'secret';
  const admin = createAdminClient();

  if (isWebsite && hostname && environment) {
    const { data: provision, error: provisionError } = await admin.rpc(
      'provision_browser_tracking_source_v1',
      {
        p_organization_id: auth.organizationId,
        p_name: name,
        p_hostname: hostname,
        p_source_key: sourceKey,
        p_source_system: sourceSystem,
        p_platform: platform,
        p_max_payload_bytes: maxPayloadBytes,
        p_rate_limit_per_minute: rateLimitPerMinute,
        p_privacy_notice_version: privacyNoticeVersion,
        p_provisioned_by: auth.user.id,
        p_environment: environment,
      },
    );

    if (provisionError || !provision?.ok) {
      if (provisionError?.code === '23505') {
        return jsonError(
          `The hostname ${hostname} is already registered to another workspace or source.`,
          409,
        );
      }
      return jsonError(
        provisionError?.message ?? 'Unable to provision website tracking source.',
        500,
      );
    }

    const { data, error } = await admin
      .from('tracking_sources')
      .select(
        'id,organization_site_id,name,source_type,source_system,source_key,auth_mode,hostname,status,allowed_event_prefixes,max_payload_bytes,rate_limit_per_minute,privacy_notice_version,metadata,created_at',
      )
      .eq('id', String(provision.tracking_source_id))
      .eq('organization_id', auth.organizationId)
      .single();

    if (error || !data) {
      return jsonError(
        error?.message ?? 'Website source was provisioned but could not be reloaded.',
        500,
      );
    }

    const publicSiteId = String(provision.public_site_id);

    return NextResponse.json(
      {
        ok: true,
        source: data,
        site: {
          id: String(provision.organization_site_id),
          public_site_id: publicSiteId,
          hostname: String(provision.hostname),
          environment: String(provision.environment),
        },
        credentials: {
          site_id: publicSiteId,
          source_key: data.source_key,
          origin_bound: true,
          publishable: true,
          secret: null,
          shown_once: false,
        },
      },
      {
        status: 201,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  const { data, error } = await admin
    .from('tracking_sources')
    .insert({
      organization_id: auth.organizationId,
      organization_site_id: null,
      name,
      source_type: sourceType,
      source_system: sourceSystem,
      source_key: sourceKey,
      auth_mode: authMode,
      hostname,
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
        credential_class: isPublishableClient
          ? 'publishable_identifier'
          : 'server_secret',
        authority: isPublishableClient
          ? 'non_authoritative_client_telemetry'
          : 'trusted_server_source',
      },
    })
    .select(
      'id,organization_site_id,name,source_type,source_system,source_key,auth_mode,hostname,status,allowed_event_prefixes,max_payload_bytes,rate_limit_per_minute,privacy_notice_version,metadata,created_at',
    )
    .single();

  if (error || !data) {
    return jsonError(error?.message ?? 'Unable to create tracking source.', 500);
  }

  const credentials = isPublishableClient
    ? {
        source_key: data.source_key,
        publishable: true,
        secret: null,
        shown_once: false,
      }
    : {
        source_key: data.source_key,
        secret,
        publishable: false,
        shown_once: true,
      };

  return NextResponse.json(
    {
      ok: true,
      source: data,
      credentials,
    },
    {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
