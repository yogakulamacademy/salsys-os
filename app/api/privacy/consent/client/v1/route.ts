import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  consumePublishableClientRateLimit,
  corsHeadersForPublishableClient,
  resolvePublishableClientSource,
} from '@/lib/tracking/publishable-client';

export const dynamic = 'force-dynamic';

const ALLOWED_PURPOSES = new Set([
  'analytics',
  'marketing',
  'advertising',
  'sale_sharing',
  'personalization',
]);

const ALLOWED_DECISIONS = new Set([
  'granted',
  'denied',
  'withdrawn',
  'opted_out',
  'limited',
]);

class PublicRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function json(body: Record<string, unknown>, status: number, extra?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...corsHeadersForPublishableClient(),
      ...extra,
      'Cache-Control': 'no-store',
    },
  });
}

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function declaredContentLength(request: NextRequest) {
  const header = request.headers.get('content-length');
  if (!header) return null;

  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function readBoundedJson(request: NextRequest, maxBytes: number) {
  const declared = declaredContentLength(request);
  if (declared !== null && declared > maxBytes) {
    throw new PublicRequestError('Payload too large.', 413);
  }

  if (!request.body) {
    throw new PublicRequestError('Invalid JSON payload.', 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new PublicRequestError('Payload too large.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new PublicRequestError('Invalid JSON payload.', 400);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeadersForPublishableClient(),
  });
}

export async function POST(request: NextRequest) {
  const source = await resolvePublishableClientSource(
    request.headers.get('x-salsys-source-key'),
  );

  if (!source) {
    return json({ ok: false, error: 'Unknown or inactive publishable client source.' }, 401);
  }

  const declared = declaredContentLength(request);
  if (declared !== null && declared > source.maxPayloadBytes) {
    return json({ ok: false, error: 'Payload too large.' }, 413);
  }

  const rate = await consumePublishableClientRateLimit(source);
  if (!rate.allowed) {
    return json(
      { ok: false, error: 'Rate limit exceeded.' },
      429,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': '0',
        'Retry-After': '60',
      },
    );
  }

  let raw: unknown;
  try {
    raw = await readBoundedJson(request, source.maxPayloadBytes);
  } catch (error) {
    const requestError =
      error instanceof PublicRequestError
        ? error
        : new PublicRequestError('Invalid JSON payload.', 400);

    return json(
      { ok: false, error: requestError.message },
      requestError.status,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return json(
      { ok: false, error: 'Invalid privacy preference payload.' },
      400,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }

  const input = raw as Record<string, unknown>;
  const visitorId = text(input.visitor_id ?? input.anonymous_visitor_id, 180);
  const eventId = text(input.event_id, 160);
  const occurredAt = text(input.occurred_at, 80) ?? new Date().toISOString();
  const platform = text(input.platform, 40)?.toLowerCase() ?? null;
  const decisionsRaw = input.decisions;
  const gpc =
    input.gpc === true ||
    input.gpc === 1 ||
    input.gpc === '1' ||
    request.headers.get('sec-gpc') === '1';

  if (!visitorId) {
    return json({ ok: false, error: 'visitor_id is required.' }, 400);
  }
  if (!eventId) {
    return json({ ok: false, error: 'event_id is required.' }, 400);
  }
  if (!decisionsRaw || typeof decisionsRaw !== 'object' || Array.isArray(decisionsRaw)) {
    return json({ ok: false, error: 'decisions object is required.' }, 400);
  }

  const configuredPlatform = text(source.metadata.platform, 40)?.toLowerCase() ?? null;
  if (configuredPlatform && platform && configuredPlatform !== platform) {
    return json(
      { ok: false, error: 'Client platform does not match the configured source.' },
      400,
    );
  }

  const decisions = new Map<string, string>();
  for (const [purpose, decisionValue] of Object.entries(
    decisionsRaw as Record<string, unknown>,
  )) {
    if (!ALLOWED_PURPOSES.has(purpose)) continue;
    const decision = text(decisionValue, 40)?.toLowerCase();
    if (!decision || !ALLOWED_DECISIONS.has(decision)) {
      return json({ ok: false, error: `Invalid decision for ${purpose}.` }, 400);
    }
    decisions.set(purpose, decision);
  }

  if (gpc && source.honorGpc) {
    decisions.set('sale_sharing', 'opted_out');
  }

  if (decisions.size === 0) {
    return json({ ok: false, error: 'No supported privacy decisions supplied.' }, 400);
  }

  try {
    const admin = createAdminClient();
    const receipts: Array<{ purpose: string; decision: string; receipt_id: string }> = [];

    for (const [purpose, decision] of decisions) {
      const { data: receiptId, error } = await admin.rpc('record_privacy_preference_v1', {
        p_organization_id: source.organizationId,
        p_purpose_key: purpose,
        p_decision: decision,
        p_source: 'publishable_client_v1',
        p_occurred_at: occurredAt,
        p_person_id: null,
        p_lead_id: null,
        p_anonymous_visitor_id: visitorId,
        p_notice_version: source.privacyNoticeVersion,
        p_evidence: {
          event_id: eventId,
          platform,
          gpc,
        },
        p_metadata: {
          tracking_source_id: source.id,
          source_key: source.sourceKey,
          platform,
          client_type: source.metadata.platform ?? null,
        },
      });

      if (error) {
        throw new Error(`Unable to record ${purpose} preference: ${error.message}`);
      }

      receipts.push({
        purpose,
        decision,
        receipt_id: String(receiptId),
      });
    }

    return json(
      {
        ok: true,
        visitor_id: visitorId,
        platform,
        gpc,
        notice_version: source.privacyNoticeVersion,
        receipts,
        effective_decisions: Object.fromEntries(decisions),
        received_at: new Date().toISOString(),
      },
      200,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  } catch (error) {
    console.error('Public client consent persistence failed.', error);
    return json(
      {
        ok: false,
        error: 'Unable to save privacy preferences.',
      },
      500,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }
}
