import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

import { getVercelOidcToken } from '@vercel/oidc';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  consumeTrackingRateLimit,
  type GenericTrackingEvent,
  type TrackingSourceRuntime,
} from '@/lib/tracking/runtime';

const QUEUE_REGION = process.env.SALSYS_EVENT_QUEUE_REGION?.trim() || 'sin1';
const QUEUE_TOPIC = process.env.SALSYS_EVENT_QUEUE_TOPIC?.trim() || 'salsys-trusted-events-v1';
const QUEUE_CONSUMER =
  process.env.SALSYS_EVENT_QUEUE_CONSUMER?.trim() || 'supabase-ingestion-v1';

export const DURABLE_EVENT_EDGE_MAX_BYTES = 64 * 1024;
const QUEUE_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const QUEUE_VISIBILITY_TIMEOUT_SECONDS = 120;
const QUEUE_REQUEST_TIMEOUT_MS = 4000;

export type DurableTrustedEventEnvelope = {
  version: 1;
  queuedAt: string;
  sourceKey: string;
  secretHash: string;
  contentLength: number;
  requestContext: {
    userAgent: string | null;
    ipPresent: boolean;
  };
  event: GenericTrackingEvent;
};

type QueueReceivedMessage = {
  messageId: string;
  receiptHandle: string;
  deliveryCount: number;
  timestamp: string | null;
  expiresAt: string | null;
  envelope: DurableTrustedEventEnvelope;
};

export type DurableEventProcessResult = {
  accepted: boolean;
  duplicate: boolean;
  rawEventId: string | null;
  eventFamily: string | null;
  contractStatus: string | null;
  reason: string | null;
  processing: Record<string, unknown> | null;
};

export class DurableEventTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DurableEventTransientError';
  }
}

export class DurableEventPermanentError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = 'DurableEventPermanentError';
  }
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeHexEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }

  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function queueBaseUrl() {
  return `https://${QUEUE_REGION}.vercel-queue.com/api/v3`;
}

async function getQueueToken() {
  try {
    return await getVercelOidcToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OIDC token unavailable.';
    throw new DurableEventTransientError(`Queue authentication failed: ${message}`);
  }
}

async function queueFetch(path: string, init: RequestInit) {
  const token = await getQueueToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUEUE_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${queueBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Queue request failed.';
    throw new DurableEventTransientError(`Queue request failed: ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSourceKey(value: string | null) {
  const sourceKey = value?.trim() ?? '';
  if (!/^src_[A-Za-z0-9_-]{12,160}$/.test(sourceKey)) {
    throw new DurableEventPermanentError('Invalid tracking source key.', 'invalid_source_key');
  }
  return sourceKey;
}

function normalizeSecret(value: string | null) {
  const secret = value?.trim() ?? '';
  if (secret.length < 16 || secret.length > 1000) {
    throw new DurableEventPermanentError('Invalid tracking source secret.', 'invalid_secret');
  }
  return secret;
}

function buildEnvelope(input: {
  sourceKey: string | null;
  bearerSecret: string | null;
  contentLength: number;
  userAgent: string | null;
  ipPresent: boolean;
  event: GenericTrackingEvent;
}): DurableTrustedEventEnvelope {
  const sourceKey = normalizeSourceKey(input.sourceKey);
  const secret = normalizeSecret(input.bearerSecret);

  return {
    version: 1,
    queuedAt: new Date().toISOString(),
    sourceKey,
    secretHash: sha256(secret),
    contentLength: Math.max(0, Math.floor(input.contentLength)),
    requestContext: {
      userAgent: input.userAgent?.slice(0, 1000) ?? null,
      ipPresent: input.ipPresent,
    },
    event: input.event,
  };
}

export async function publishDurableTrustedEvent(input: {
  sourceKey: string | null;
  bearerSecret: string | null;
  contentLength: number;
  userAgent: string | null;
  ipPresent: boolean;
  event: GenericTrackingEvent;
}) {
  const envelope = buildEnvelope(input);
  const response = await queueFetch(`/topic/${encodeURIComponent(QUEUE_TOPIC)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Vqs-Retention-Seconds': String(QUEUE_RETENTION_SECONDS),
      'Vqs-Idempotency-Key': `${envelope.sourceKey}:${envelope.event.eventId}`.slice(0, 256),
    },
    body: JSON.stringify(envelope),
  });

  if (response.status !== 201 && response.status !== 202) {
    const detail = (await response.text()).slice(0, 500);
    throw new DurableEventTransientError(
      `Queue publish failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    );
  }

  let responseBody: Record<string, unknown> = {};
  try {
    responseBody = (await response.json()) as Record<string, unknown>;
  } catch {
    // A successful queue response can be empty; the status code is authoritative.
  }

  return {
    envelope,
    messageId:
      typeof responseBody.messageId === 'string'
        ? responseBody.messageId
        : response.headers.get('vqs-message-id'),
    deferred: response.status === 202 || responseBody.deferred === true,
  };
}

async function resolveTrustedSource(
  sourceKey: string,
  secretHash: string,
): Promise<TrackingSourceRuntime> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tracking_sources')
    .select(
      'id,organization_id,organization_site_id,source_key,source_system,source_type,auth_mode,hostname,secret_hash,status,max_payload_bytes,rate_limit_per_minute',
    )
    .eq('source_key', sourceKey)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    throw new DurableEventTransientError(`Tracking source lookup failed: ${error.message}`);
  }

  if (!data || data.auth_mode !== 'secret' || !data.secret_hash) {
    throw new DurableEventPermanentError('Unauthorized tracking source.', 'unauthorized_source');
  }

  if (!safeHexEqual(secretHash, String(data.secret_hash))) {
    throw new DurableEventPermanentError('Unauthorized tracking source.', 'unauthorized_secret');
  }

  return {
    id: String(data.id),
    organizationId: String(data.organization_id),
    organizationSiteId: data.organization_site_id
      ? String(data.organization_site_id)
      : null,
    publicSiteId: null,
    siteIdVerified: false,
    siteEnvironment: null,
    sourceKey: String(data.source_key),
    sourceSystem: String(data.source_system),
    sourceType: data.source_type as TrackingSourceRuntime['sourceType'],
    authMode: data.auth_mode as TrackingSourceRuntime['authMode'],
    hostname: data.hostname ? String(data.hostname) : null,
    maxPayloadBytes: Number(data.max_payload_bytes ?? 32768),
    rateLimitPerMinute: Number(data.rate_limit_per_minute ?? 600),
  };
}

export async function processDurableTrustedEvent(
  envelope: DurableTrustedEventEnvelope,
): Promise<DurableEventProcessResult> {
  if (envelope.version !== 1) {
    throw new DurableEventPermanentError('Unsupported durable event version.', 'unsupported_version');
  }

  const source = await resolveTrustedSource(envelope.sourceKey, envelope.secretHash);

  if (envelope.contentLength > source.maxPayloadBytes) {
    throw new DurableEventPermanentError('Payload too large.', 'payload_too_large');
  }

  let rate: Awaited<ReturnType<typeof consumeTrackingRateLimit>>;
  try {
    rate = await consumeTrackingRateLimit(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Rate limit lookup failed.';
    throw new DurableEventTransientError(message);
  }

  if (!rate.allowed) {
    throw new DurableEventPermanentError('Rate limit exceeded.', 'rate_limited');
  }

  const admin = createAdminClient();
  const event = envelope.event;
  const { data, error } = await admin.rpc('ingest_tracking_event_v1', {
    p_organization_id: source.organizationId,
    p_tracking_source_id: source.id,
    p_source_event_id: event.eventId,
    p_event_name: event.eventName,
    p_ingestion_method: 'events_api_v1_durable',
    p_occurred_at: event.occurredAt,
    p_anonymous_visitor_id: event.anonymousVisitorId,
    p_session_key: event.sessionKey,
    p_external_message_id: event.externalMessageId,
    p_site: event.site,
    p_payload: event.payload,
    p_context: {
      ...event.context,
      user_agent: envelope.requestContext.userAgent,
      ip_present: envelope.requestContext.ipPresent,
    },
    p_metadata: {
      ...event.metadata,
      adapter: 'durable_event_queue_v1',
      source_key: source.sourceKey,
      queued_at: envelope.queuedAt,
    },
    p_schema_version: event.schemaVersion,
    p_is_browser: false,
  });

  if (error) {
    throw new DurableEventTransientError(`Event ingestion failed: ${error.message}`);
  }

  const accepted = Boolean(data?.accepted);
  const duplicate = Boolean(data?.duplicate);
  const rawEventId = data?.event_id ? String(data.event_id) : null;
  let processing: Record<string, unknown> | null = null;

  if (accepted && rawEventId) {
    const { data: processingData, error: processingError } = await admin.rpc(
      'process_tracking_raw_event_v1',
      {
        p_organization_id: source.organizationId,
        p_raw_event_id: rawEventId,
      },
    );

    if (processingError) {
      // The raw event is already durable in Postgres. The existing sweeper can
      // retry projection/processing, so the external queue can safely ack.
      processing = {
        ok: false,
        processed: false,
        reason: 'processor_rpc_failed',
      };
    } else if (
      processingData &&
      typeof processingData === 'object' &&
      !Array.isArray(processingData)
    ) {
      processing = processingData as Record<string, unknown>;
    }
  }

  return {
    accepted,
    duplicate,
    rawEventId,
    eventFamily: data?.event_family ? String(data.event_family) : null,
    contractStatus: data?.contract_status ? String(data.contract_status) : null,
    reason: data?.reason ? String(data.reason) : null,
    processing,
  };
}

function parseQueueLine(line: string): QueueReceivedMessage {
  const record = JSON.parse(line) as Record<string, unknown>;
  const encodedBody = typeof record.body === 'string' ? record.body : '';
  const decoded = Buffer.from(encodedBody, 'base64').toString('utf8');
  const envelope = JSON.parse(decoded) as DurableTrustedEventEnvelope;

  if (!record.messageId || !record.receiptHandle || !envelope?.event?.eventId) {
    throw new DurableEventPermanentError('Malformed queue message.', 'malformed_queue_message');
  }

  return {
    messageId: String(record.messageId),
    receiptHandle: String(record.receiptHandle),
    deliveryCount: Number(record.deliveryCount ?? 1),
    timestamp: record.timestamp ? String(record.timestamp) : null,
    expiresAt: record.expiresAt ? String(record.expiresAt) : null,
    envelope,
  };
}

async function receiveQueuedEvents(limit: number) {
  const response = await queueFetch(
    `/topic/${encodeURIComponent(QUEUE_TOPIC)}/consumer/${encodeURIComponent(QUEUE_CONSUMER)}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/x-ndjson',
        'Vqs-Max-Messages': String(Math.max(1, Math.min(10, limit))),
        'Vqs-Visibility-Timeout-Seconds': String(QUEUE_VISIBILITY_TIMEOUT_SECONDS),
      },
    },
  );

  if (response.status === 204) return [] as QueueReceivedMessage[];
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new DurableEventTransientError(
      `Queue receive failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    );
  }

  const body = await response.text();
  if (!body.trim()) return [] as QueueReceivedMessage[];

  const messages: QueueReceivedMessage[] = [];
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    messages.push(parseQueueLine(line));
  }
  return messages;
}

async function acknowledgeQueuedEvent(receiptHandle: string) {
  const response = await queueFetch(
    `/topic/${encodeURIComponent(QUEUE_TOPIC)}/consumer/${encodeURIComponent(QUEUE_CONSUMER)}/lease/${encodeURIComponent(receiptHandle)}`,
    { method: 'DELETE' },
  );

  if (response.status !== 204) {
    const detail = (await response.text()).slice(0, 500);
    throw new DurableEventTransientError(
      `Queue acknowledge failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    );
  }
}

export async function drainDurableTrustedEvents(options?: {
  maxBatches?: number;
  batchSize?: number;
}) {
  const maxBatches = Math.max(1, Math.min(20, options?.maxBatches ?? 5));
  const batchSize = Math.max(1, Math.min(10, options?.batchSize ?? 10));

  const summary = {
    ok: true,
    received: 0,
    acknowledged: 0,
    accepted: 0,
    duplicates: 0,
    discarded: 0,
    transientFailures: 0,
    stoppedForDependencyFailure: false,
  };

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const messages = await receiveQueuedEvents(batchSize);
    if (!messages.length) break;

    summary.received += messages.length;

    for (const message of messages) {
      try {
        const result = await processDurableTrustedEvent(message.envelope);
        if (result.accepted) summary.accepted += 1;
        if (result.duplicate) summary.duplicates += 1;
        await acknowledgeQueuedEvent(message.receiptHandle);
        summary.acknowledged += 1;
      } catch (error) {
        if (error instanceof DurableEventPermanentError) {
          console.warn('DURABLE_TRACKING_EVENT_DISCARDED', {
            messageId: message.messageId,
            deliveryCount: message.deliveryCount,
            eventId: message.envelope.event.eventId,
            reason: error.reason,
          });
          await acknowledgeQueuedEvent(message.receiptHandle);
          summary.acknowledged += 1;
          summary.discarded += 1;
          continue;
        }

        summary.ok = false;
        summary.transientFailures += 1;
        summary.stoppedForDependencyFailure = true;
        console.error('DURABLE_TRACKING_EVENT_RETRY_PENDING', {
          messageId: message.messageId,
          deliveryCount: message.deliveryCount,
          eventId: message.envelope.event.eventId,
          error: error instanceof Error ? error.message : 'Unknown transient failure',
        });
        return summary;
      }
    }

    if (messages.length < batchSize) break;
  }

  return summary;
}

export function buildDurableEnvelopeForFallback(input: {
  sourceKey: string | null;
  bearerSecret: string | null;
  contentLength: number;
  userAgent: string | null;
  ipPresent: boolean;
  event: GenericTrackingEvent;
}) {
  return buildEnvelope(input);
}
