import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  consumeTrackingRateLimit,
  corsHeadersForTrackingOrigin,
  resolveBrowserTrackingSource,
  sanitizeGenericTrackingEvent,
} from '@/lib/tracking/runtime';

export const dynamic = 'force-dynamic';

function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...headers,
      'Cache-Control': 'no-store',
    },
  });
}

function browserOrigin(request: NextRequest) {
  return request.headers.get('origin')?.trim() || null;
}

function browserGpc(request: NextRequest, context: Record<string, unknown>) {
  const secGpc = request.headers.get('sec-gpc');
  if (secGpc === '1') return true;

  const contextGpc = context.gpc;
  return contextGpc === true || contextGpc === 1 || contextGpc === '1';
}

function decodeHeader(value: string | null) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Location enrichment is derived only from trusted hosting/proxy headers.
 * No raw client IP address is persisted by this route.
 *
 * Vercel headers are first because they are used by the current deployment.
 * Common proxy aliases are accepted so the ingestion contract itself does not
 * depend on a single hosting platform.
 */
function requestGeo(request: NextRequest) {
  return {
    country:
      request.headers.get('x-vercel-ip-country') ||
      request.headers.get('cf-ipcountry') ||
      request.headers.get('x-country-code') ||
      null,
    region:
      request.headers.get('x-vercel-ip-country-region') ||
      request.headers.get('x-region-code') ||
      null,
    city: decodeHeader(
      request.headers.get('x-vercel-ip-city') ||
        request.headers.get('x-city') ||
        null,
    ),
    timezone:
      request.headers.get('x-vercel-ip-timezone') ||
      request.headers.get('x-timezone') ||
      null,
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = browserOrigin(request);
  const source = await resolveBrowserTrackingSource(origin);

  return new NextResponse(null, {
    status: source ? 204 : 403,
    headers: corsHeadersForTrackingOrigin(origin, Boolean(source)),
  });
}

export async function POST(request: NextRequest) {
  const origin = browserOrigin(request);
  const source = await resolveBrowserTrackingSource(origin);
  const cors = corsHeadersForTrackingOrigin(origin, Boolean(source));

  if (!source) {
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Unrecognized browser tracking origin.',
      },
      403,
      cors,
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
      cors,
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
        ...cors,
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': '0',
        'Retry-After': '60',
      },
    );
  }

  try {
    const event = sanitizeGenericTrackingEvent(await request.json());
    const gpc = browserGpc(request, event.context);
    const geo = requestGeo(request);
    const admin = createAdminClient();

    // Privacy is enforced before raw-event persistence. Optional events that are
    // not permitted are not copied into raw_events at all.
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
          ...cors,
          'X-RateLimit-Limit': String(rate.limit),
          'X-RateLimit-Remaining': String(rate.remaining),
        },
      );
    }

    const { data, error } = await admin.rpc('ingest_tracking_event_v1', {
      p_organization_id: source.organizationId,
      p_tracking_source_id: source.id,
      p_source_event_id: event.eventId,
      p_event_name: event.eventName,
      p_ingestion_method: 'browser_events_v1',
      p_occurred_at: event.occurredAt,
      p_anonymous_visitor_id: event.anonymousVisitorId,
      p_session_key: event.sessionKey,
      p_external_message_id: event.externalMessageId,
      p_site: event.site ?? source.hostname,
      p_payload: event.payload,
      p_context: {
        ...event.context,
        gpc,
        origin,
        user_agent: request.headers.get('user-agent'),
        geo_country: geo.country,
        geo_region: geo.region,
        geo_city: geo.city,
        geo_timezone: geo.timezone,
      },
      p_metadata: {
        ...event.metadata,
        adapter: 'app/api/events/browser/v1',
        source_key: source.sourceKey,
        privacy_gate_reason: privacyGate?.reason ?? null,
        privacy_purpose: privacyGate?.mapped_purpose ?? privacyGate?.purpose ?? null,
        geo_enrichment: Boolean(
          geo.country || geo.region || geo.city || geo.timezone,
        ),
      },
      p_schema_version: event.schemaVersion,
      p_is_browser: true,
    });

    if (error) throw new Error(error.message);

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

      processing = processingError
        ? { ok: false, processed: false, reason: 'processor_rpc_failed' }
        : processingData && typeof processingData === 'object' && !Array.isArray(processingData)
          ? (processingData as Record<string, unknown>)
          : null;
    }

    return json(
      {
        ok: true,
        accepted,
        duplicate,
        privacy_blocked: false,
        raw_event_id: rawEventId,
        event_family: data?.event_family ?? null,
        contract_status: data?.contract_status ?? null,
        reason: data?.reason ?? null,
        processing,
        received_at: new Date().toISOString(),
      },
      202,
      {
        ...cors,
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  } catch (error) {
    return json(
      {
        ok: false,
        accepted: false,
        error: error instanceof Error ? error.message : 'Browser event ingestion failed.',
      },
      400,
      {
        ...cors,
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }
}
