import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  sanitizeGenericTrackingEvent,
  type GenericTrackingEvent,
} from '@/lib/tracking/runtime';

export type PublishableClientSource = {
  id: string;
  organizationId: string;
  sourceKey: string;
  sourceSystem: string;
  sourceType: 'client';
  authMode: 'publishable';
  status: 'active';
  allowedEventPrefixes: string[];
  maxPayloadBytes: number;
  rateLimitPerMinute: number;
  privacyNoticeVersion: string | null;
  honorGpc: boolean;
  requireConsentForOptional: boolean;
  metadata: Record<string, unknown>;
};

const PUBLIC_CLIENT_PII_KEYS = new Set([
  'email',
  'email_address',
  'e_mail',
  'phone',
  'phone_number',
  'telephone',
  'mobile',
  'mobile_number',
  'first_name',
  'last_name',
  'full_name',
  'name',
  'address',
  'street',
  'street_address',
  'postal_code',
  'postcode',
  'zip',
  'zip_code',
  'dob',
  'date_of_birth',
  'birth_date',
  'person_id',
  'lead_id',
  'customer_id',
  'user_id',
  'ip',
  'ip_address',
]);

const PUBLIC_CLIENT_PII_KEY_PATTERN =
  /(?:^|[_-])(?:email|e_mail|phone|telephone|mobile|first_name|last_name|full_name|name|address|street|postal|postcode|zip|dob|birth|person_id|lead_id|customer_id|user_id|ip_address|ip)(?:$|[_-])/i;

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function isPublicClientPiiKey(key: string) {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return false;
  return (
    PUBLIC_CLIENT_PII_KEYS.has(normalized) ||
    PUBLIC_CLIENT_PII_KEY_PATTERN.test(normalized) ||
    /(?:email|phone|mobile|telephone|postal|postcode|zipcode|birthdate|fullname|firstname|lastname|streetaddress)$/i.test(
      normalized,
    )
  );
}

function redactPublicClientValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[max_depth]';

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => redactPublicClientValue(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 200)) {
      const key = rawKey.trim().slice(0, 120);
      if (!key) continue;
      if (isPublicClientPiiKey(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = redactPublicClientValue(rawValue, depth + 1);
      }
    }
    return out;
  }

  return value;
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function sanitizePublishableClientTrackingEvent(
  input: unknown,
): GenericTrackingEvent {
  const event = sanitizeGenericTrackingEvent(input);

  return {
    ...event,
    payload: objectValue(redactPublicClientValue(event.payload)),
    context: objectValue(redactPublicClientValue(event.context)),
    metadata: objectValue(redactPublicClientValue(event.metadata)),
  };
}

export async function resolvePublishableClientSource(
  sourceKey: string | null,
): Promise<PublishableClientSource | null> {
  const normalizedKey = cleanText(sourceKey, 160);
  if (!normalizedKey) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tracking_sources')
    .select(
      'id,organization_id,source_key,source_system,source_type,auth_mode,status,allowed_event_prefixes,max_payload_bytes,rate_limit_per_minute,privacy_notice_version,honor_gpc,require_consent_for_optional,metadata',
    )
    .eq('source_key', normalizedKey)
    .eq('source_type', 'client')
    .eq('auth_mode', 'publishable')
    .eq('status', 'active')
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: String(data.id),
    organizationId: String(data.organization_id),
    sourceKey: String(data.source_key),
    sourceSystem: String(data.source_system),
    sourceType: 'client',
    authMode: 'publishable',
    status: 'active',
    allowedEventPrefixes: Array.isArray(data.allowed_event_prefixes)
      ? data.allowed_event_prefixes.map(String)
      : [],
    maxPayloadBytes: Number(data.max_payload_bytes ?? 32768),
    rateLimitPerMinute: Number(data.rate_limit_per_minute ?? 600),
    privacyNoticeVersion: data.privacy_notice_version
      ? String(data.privacy_notice_version)
      : null,
    honorGpc: data.honor_gpc !== false,
    requireConsentForOptional: data.require_consent_for_optional !== false,
    metadata: objectValue(data.metadata),
  };
}

export function publishableClientEventAllowed(
  source: PublishableClientSource,
  eventName: string,
) {
  const normalized = eventName.toLowerCase();
  if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(normalized)) return false;

  // Publishable clients are never authoritative for CRM, payment, enrollment,
  // booking, conversation, message, advertising, or other business facts.
  if (!normalized.startsWith('app.') && !normalized.startsWith('web.')) return false;

  if (source.allowedEventPrefixes.length === 0) return false;
  return source.allowedEventPrefixes.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
}

export async function consumePublishableClientRateLimit(
  source: PublishableClientSource,
) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('consume_tracking_source_rate_limit_v1', {
    p_organization_id: source.organizationId,
    p_tracking_source_id: source.id,
    p_now: new Date().toISOString(),
  });

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

export function corsHeadersForPublishableClient() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Salsys-Source-Key',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
  };
}
