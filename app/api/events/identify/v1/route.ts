import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  authenticateServerTrackingSource,
  consumeTrackingRateLimit,
} from '@/lib/tracking/runtime';

export const dynamic = 'force-dynamic';

class PublicRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  return authorization.slice(7).trim() || null;
}

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function json(
  body: Record<string, unknown>,
  status: number,
  extraHeaders?: Record<string, string>,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
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

/**
 * Universal trusted identity handoff.
 *
 * Browser/device identifiers are never treated as permanent human identity.
 * The authenticated tracking source supplies the tenant boundary and the exact
 * session must already exist for the supplied anonymous visitor. All identity
 * mutations are performed atomically by attach_exact_session_identity_v1.
 */
export async function POST(request: NextRequest) {
  const source = await authenticateServerTrackingSource(
    request.headers.get('x-salsys-source-key'),
    bearerToken(request),
  );

  if (!source) {
    return json(
      {
        ok: false,
        linked: false,
        error: 'Unauthorized tracking source.',
      },
      401,
    );
  }

  const maxBytes = Math.min(source.maxPayloadBytes, 16_000);
  const declared = declaredContentLength(request);
  if (declared !== null && declared > maxBytes) {
    return json(
      {
        ok: false,
        linked: false,
        error: 'Payload too large.',
      },
      413,
    );
  }

  const rate = await consumeTrackingRateLimit(source);
  if (!rate.allowed) {
    return json(
      {
        ok: false,
        linked: false,
        error: 'Rate limit exceeded.',
      },
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
    raw = await readBoundedJson(request, maxBytes);
  } catch (error) {
    const requestError =
      error instanceof PublicRequestError
        ? error
        : new PublicRequestError('Invalid JSON payload.', 400);

    return json(
      {
        ok: false,
        linked: false,
        error: requestError.message,
      },
      requestError.status,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return json(
      {
        ok: false,
        linked: false,
        error: 'Invalid identity payload.',
      },
      400,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }

  const input = raw as Record<string, unknown>;
  const eventId = text(input.event_id ?? input.eventId, 160);
  const leadId = text(input.lead_id ?? input.leadId, 100);
  const visitorId = text(
    input.anonymous_visitor_id ?? input.anonymousVisitorId ?? input.visitor_id,
    180,
  );
  const sessionKey = text(
    input.session_key ?? input.sessionKey ?? input.session_id,
    180,
  );

  if (!leadId || !visitorId || !sessionKey) {
    return json(
      {
        ok: false,
        linked: false,
        error: 'lead_id, anonymous_visitor_id and session_key are required.',
      },
      400,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('attach_exact_session_identity_v1', {
      p_organization_id: source.organizationId,
      p_lead_id: leadId,
      p_anonymous_visitor_id: visitorId,
      p_session_key: sessionKey,
      p_source_system: 'events-identify-v1',
      p_metadata: {
        tracking_source_id: source.id,
        source_key: source.sourceKey,
        event_id: eventId,
      },
    });

    if (error) throw error;

    const result = objectValue(data);
    if (result.ok !== true) {
      throw new Error('Atomic identity handoff did not complete.');
    }

    return json(
      {
        ...result,
        linked: true,
        event_id: eventId,
      },
      200,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  } catch (error) {
    console.error('Trusted identity handoff failed.', error);
    return json(
      {
        ok: false,
        linked: false,
        error: 'Identity handoff failed.',
      },
      500,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }
}
