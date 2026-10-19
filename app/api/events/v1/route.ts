import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  authenticateServerTrackingSource,
  consumeTrackingRateLimit,
  sanitizeGenericTrackingEvent,
} from '@/lib/tracking/runtime';

export const dynamic = 'force-dynamic';

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  return authorization.slice(7).trim() || null;
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

function gpcEnabled(request: NextRequest, context: Record<string, unknown>) {
  if (request.headers.get('sec-gpc') === '1') return true;
  const value = context.gpc;
  return value === true || value === 1 || value === '1';
}

export async function POST(request: NextRequest) {
  const sourceKey = request.headers.get('x-salsys-source-key');
  const source = await authenticateServerTrackingSource(
    sourceKey,
    bearerToken(request),
  );

  if (!source) {
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Unauthorized tracking source.',
      },
      401,
    );
  }

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > source.maxPayloadBytes) {
    return json(
      {
        ok: false,
        accepted: false,
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
        accepted: false,
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
    const event = sanitizeGenericTrackingEvent(await request.json());
    const admin = createAdminClient();
    const gpc = gpcEnabled(request, event.context);

    // Server-side relays are allowed to deliver browser-originated events, but
    // they do not bypass privacy policy. The server remains the authoritative
    // privacy gate for optional analytics/advertising events.
    const { data: privacyGate, error: privacyGateError } = await admin.rpc(
      'privacy_gate_tracking_event_v1',
      {
        p_organization_id: source.organizationId,
        p_event_name: event.eventName,
        p_person_id: null,
        p_lead_id: null,
        p_anonymous_visitor_id: event.anonymousVisitorId,
        p_gpc: gpc,
      },
    );

    if (privacyGateError) {
      throw new Error(`Privacy gate failed: ${privacyGateError.message}`);
    }

    if (!privacyGate?.allowed) {
      return json(
        {
          ok: true,
          accepted: false,
          privacy_blocked: true,
          reason: privacyGate?.reason ?? 'privacy_policy_blocked',
          purpose: privacyGate?.mapped_purpose ?? privacyGate?.purpose ?? null,
          received_at: new Date().toISOString(),
        },
        200,
        {
          'X-RateLimit-Limit': String(rate.limit),
          'X-RateLimit-Remaining': String(rate.remaining),
        },
      );
    }

    const forwardedFor = request.headers.get('x-forwarded-for');
    const ipPresent = Boolean(forwardedFor?.trim());

    const { data, error } = await admin.rpc(
      'ingest_tracking_event_v1',
      {
        p_organization_id: source.organizationId,
        p_tracking_source_id: source.id,
        p_source_event_id: event.eventId,
        p_event_name: event.eventName,
        p_ingestion_method: 'events_api_v1',
        p_occurred_at: event.occurredAt,
        p_anonymous_visitor_id: event.anonymousVisitorId,
        p_session_key: event.sessionKey,
        p_external_message_id: event.externalMessageId,
        p_site: event.site,
        p_payload: event.payload,
        p_context: {
          ...event.context,
          gpc,
          user_agent: request.headers.get('user-agent'),
          ip_present: ipPresent,
        },
        p_metadata: {
          ...event.metadata,
          adapter: 'app/api/events/v1',
          source_key: source.sourceKey,
          privacy_gate_reason: privacyGate?.reason ?? null,
          privacy_purpose: privacyGate?.mapped_purpose ?? privacyGate?.purpose ?? null,
        },
        p_schema_version: event.schemaVersion,
        p_is_browser: false,
      },
    );

    if (error) {
      throw new Error(error.message);
    }

    const accepted = Boolean(data?.accepted);
    const duplicate = Boolean(data?.duplicate);
    const rawEventId = data?.event_id ? String(data.event_id) : null;

    let processing: Record<string, unknown> | null = null;

    if (accepted && rawEventId) {
      const {
        data: processingData,
        error: processingError,
      } = await admin.rpc(
        'process_tracking_raw_event_v1',
        {
          p_organization_id: source.organizationId,
          p_raw_event_id: rawEventId,
        },
      );

      if (processingError) {
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

    return json(
      {
        ok: true,
        accepted,
        duplicate,
        privacy_blocked: false,
        quarantined: !accepted,
        raw_event_id: rawEventId,
        event_family: data?.event_family ?? null,
        contract_status: data?.contract_status ?? null,
        reason: data?.reason ?? null,
        processing,
        received_at: new Date().toISOString(),
      },
      202,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Event ingestion failed.';

    return json(
      {
        ok: false,
        accepted: false,
        error: message,
      },
      400,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }
}
