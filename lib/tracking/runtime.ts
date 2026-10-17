import 'server-only';

import {
  createHash,
  timingSafeEqual,
} from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';

export type TrackingSourceRuntime = {
  id: string;
  organizationId: string;
  sourceKey: string;
  sourceSystem: string;
  sourceType: 'website' | 'api' | 'webhook' | 'system';
  authMode: 'origin' | 'secret' | 'hmac' | 'internal';
  hostname: string | null;
  maxPayloadBytes: number;
  rateLimitPerMinute: number;
};

const FORBIDDEN_KEYS = new Set([
  'password',
  'passwd',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
  'client_secret',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'private_key',
]);

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function sanitizeUnknown(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 8) return '[max_depth]';

  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return value.slice(0, 4000);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => sanitizeUnknown(item, depth + 1));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [rawKey, rawValue] of Object.entries(
      value as Record<string, unknown>,
    ).slice(0, 200)) {
      const key = rawKey.trim().slice(0, 120);
      if (!key) continue;

      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        result[key] = '[redacted]';
        continue;
      }

      result[key] = sanitizeUnknown(rawValue, depth + 1);
    }

    return result;
  }

  return String(value).slice(0, 1000);
}

export type GenericTrackingEvent = {
  eventId: string;
  eventName: string;
  schemaVersion: number;
  occurredAt: string | null;
  anonymousVisitorId: string | null;
  sessionKey: string | null;
  externalMessageId: string | null;
  site: string | null;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export function sanitizeGenericTrackingEvent(
  input: unknown,
): GenericTrackingEvent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid event payload.');
  }

  const raw = input as Record<string, unknown>;
  const eventId =
    text(raw.eventId ?? raw.event_id, 160);
  const eventName =
    text(raw.eventName ?? raw.event_name ?? raw.eventType ?? raw.event_type, 120);

  if (!eventId || !eventName) {
    throw new Error('event_id and event_name are required.');
  }

  const rawVersion = Number(
    raw.schemaVersion ?? raw.schema_version ?? 1,
  );
  const schemaVersion =
    Number.isInteger(rawVersion) && rawVersion >= 1 && rawVersion <= 100
      ? rawVersion
      : 1;

  const payloadSource =
    raw.properties ?? raw.payload ?? {};
  const contextSource =
    raw.context ?? {};
  const metadataSource =
    raw.metadata ?? {};

  const sanitizedPayload = sanitizeUnknown(payloadSource);
  const sanitizedContext = sanitizeUnknown(contextSource);
  const sanitizedMetadata = sanitizeUnknown(metadataSource);

  return {
    eventId,
    eventName: eventName.toLowerCase(),
    schemaVersion,
    occurredAt:
      text(raw.occurredAt ?? raw.occurred_at, 80),
    anonymousVisitorId:
      text(raw.anonymousVisitorId ?? raw.anonymous_visitor_id, 180),
    sessionKey:
      text(raw.sessionKey ?? raw.session_key, 180),
    externalMessageId:
      text(raw.externalMessageId ?? raw.external_message_id, 240),
    site: text(raw.site, 240),
    payload:
      sanitizedPayload && typeof sanitizedPayload === 'object' && !Array.isArray(sanitizedPayload)
        ? (sanitizedPayload as Record<string, unknown>)
        : { value: sanitizedPayload },
    context:
      sanitizedContext && typeof sanitizedContext === 'object' && !Array.isArray(sanitizedContext)
        ? (sanitizedContext as Record<string, unknown>)
        : {},
    metadata:
      sanitizedMetadata && typeof sanitizedMetadata === 'object' && !Array.isArray(sanitizedMetadata)
        ? (sanitizedMetadata as Record<string, unknown>)
        : {},
  };
}

export async function resolveBrowserTrackingSource(
  origin: string | null,
): Promise<TrackingSourceRuntime | null> {
  if (!origin) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    'resolve_tracking_source_by_origin_v1',
    { p_origin: origin },
  );

  if (error || !data?.ok) return null;

  return {
    id: String(data.tracking_source_id),
    organizationId: String(data.organization_id),
    sourceKey: String(data.source_key),
    sourceSystem: String(data.source_system),
    sourceType: 'website',
    authMode: 'origin',
    hostname: data.hostname ? String(data.hostname) : null,
    maxPayloadBytes: Number(data.max_payload_bytes ?? 32768),
    rateLimitPerMinute: Number(data.rate_limit_per_minute ?? 600),
  };
}

function sha256(value: string) {
  return createHash('sha256')
    .update(value, 'utf8')
    .digest('hex');
}

function safeHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }

  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');

  return a.length === b.length && timingSafeEqual(a, b);
}

export async function authenticateServerTrackingSource(
  sourceKey: string | null,
  bearerSecret: string | null,
): Promise<TrackingSourceRuntime | null> {
  const normalizedKey = text(sourceKey, 160);
  const secret = text(bearerSecret, 1000);

  if (!normalizedKey || !secret) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tracking_sources')
    .select(
      'id,organization_id,source_key,source_system,source_type,auth_mode,hostname,secret_hash,status,max_payload_bytes,rate_limit_per_minute',
    )
    .eq('source_key', normalizedKey)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !data) return null;
  if (data.auth_mode !== 'secret' || !data.secret_hash) return null;

  if (!safeHexEqual(sha256(secret), String(data.secret_hash))) {
    return null;
  }

  return {
    id: String(data.id),
    organizationId: String(data.organization_id),
    sourceKey: String(data.source_key),
    sourceSystem: String(data.source_system),
    sourceType: data.source_type as TrackingSourceRuntime['sourceType'],
    authMode: data.auth_mode as TrackingSourceRuntime['authMode'],
    hostname: data.hostname ? String(data.hostname) : null,
    maxPayloadBytes: Number(data.max_payload_bytes ?? 32768),
    rateLimitPerMinute: Number(data.rate_limit_per_minute ?? 600),
  };
}

export async function consumeTrackingRateLimit(
  source: TrackingSourceRuntime,
) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    'consume_tracking_source_rate_limit_v1',
    {
      p_organization_id: source.organizationId,
      p_tracking_source_id: source.id,
      p_now: new Date().toISOString(),
    },
  );

  if (error) {
    throw new Error(`Unable to enforce tracking rate limit: ${error.message}`);
  }

  return {
    allowed: Boolean(data?.allowed),
    count: Number(data?.count ?? 0),
    limit: Number(data?.limit ?? source.rateLimitPerMinute),
    remaining: Number(data?.remaining ?? 0),
    reason: data?.reason ? String(data.reason) : null,
  };
}

export function corsHeadersForTrackingOrigin(
  origin: string | null,
  allowed: boolean,
) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Salsys-Source-Key, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };

  if (allowed && origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}
