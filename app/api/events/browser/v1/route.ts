import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  consumeTrackingRateLimit,
  corsHeadersForTrackingOrigin,
  resolveBrowserTrackingSource,
  sanitizeGenericTrackingEvent,
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

function publicSiteId(request: NextRequest) {
  return (
    request.nextUrl.searchParams.get('site_id')?.trim() ||
    request.headers.get('x-salsys-site-id')?.trim() ||
    null
  );
}

function browserGpc(request: NextRequest, context: Record<string, unknown>) {
  const secGpc = request.headers.get('sec-gpc');
  if (secGpc === '1') return true;

  const contextGpc = context.gpc;
  return contextGpc === true || contextGpc === 1 || contextGpc === '1';
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

function decodeHeader(value: string | null) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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
  const siteId = publicSiteId(request);
  const source = await resolveBrowserTrackingSource(origin, siteId);

  return new NextResponse(null, {
    status: source ? 204 : 403,
    headers: corsHeadersForTrackingOrigin(origin, Boolean(source)),
  });
}

export async function POST(request: NextRequest) {
  const origin = browserOrigin(request);
  const siteId = publicSiteId(request);
  const source = await resolveBrowserTrackingSource(origin, siteId);
  const cors = corsHeadersForTrackingOrigin(origin, Boolean(source));

  if (!source) {
    return json(
      {
        ok: false,
        accepted: false,
        error: siteId
          ? 'Tracking Site ID does not match this browser origin.'
          : 'Unrecognized browser tracking origin.',
      },
      403,
      cors,
    );
  }

  const declared = declaredContentLength(request);
  if (declared !== null && declared > source.maxPayloadBytes) {
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

  let raw: unknown;
  try {
    raw = await readBoundedJson(request, source.maxPayloadBytes);
  } catch (error) {
    const requestError =
      error instanceof PublicRequestError
        ? error
        : new PublicRequestError('Invalid JSON payload.', 400);

    return json(
      {
        ok: false,
        accepted: false,
        error: requestError.message,
      },
      requestError.status,
      {
        ...cors,
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }

  let event: ReturnType<typeof sanitizeGenericTrackingEvent>;
  try {
    event = sanitizeGenericTrackingEvent(raw);
  } catch {
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Invalid browser event payload.',
      },
      400,
      {
        ...cors,
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }

  try {
    const gpc = browserGpc(request, event.context);
    const geo = requestGeo(request);
    const admin = createAdminClient();

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
        organization_site_id: source.organizationSiteId,
        public_site_id: source.publicSiteId,
        site_id_verified: source.siteIdVerified,
        site_environment: source.siteEnvironment,
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
        organization_site_id: source.organizationSiteId,
        public_site_id: source.publicSiteId,
        site_id_verified: source.siteIdVerified,
        site_environment: source.siteEnvironment,
        privacy_gate_reason: privacyGate?.reason ?? null,
        privacy_purpose:
          privacyGate?.mapped_purpose ?? privacyGate?.purpose ?? null,
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
        : processingData &&
            typeof processingData === 'object' &&
            !Array.isArray(processingData)
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
        site_id: source.publicSiteId,
        site_id_verified: source.siteIdVerified,
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
    console.error('Browser event ingestion failed.', error);
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Browser event ingestion failed.',
      },
      500,
      {
        ...cors,
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }
}
