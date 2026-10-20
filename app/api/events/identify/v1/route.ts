import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  authenticateServerTrackingSource,
  consumeTrackingRateLimit,
} from '@/lib/tracking/runtime';

export const dynamic = 'force-dynamic';

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

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > Math.min(source.maxPayloadBytes, 16_000)) {
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

  try {
    const raw = await request.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Invalid identity payload.');
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
      throw new Error(
        'lead_id, anonymous_visitor_id and session_key are required.',
      );
    }

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
    return json(
      {
        ok: false,
        linked: false,
        error: error instanceof Error ? error.message : 'Identity handoff failed.',
      },
      400,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }
}
