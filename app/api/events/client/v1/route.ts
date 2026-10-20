import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  consumePublishableClientRateLimit,
  corsHeadersForPublishableClient,
  publishableClientEventAllowed,
  resolvePublishableClientSource,
  sanitizePublishableClientTrackingEvent,
} from '@/lib/tracking/publishable-client';

export const dynamic = 'force-dynamic';

const ALLOWED_PLATFORMS = new Set(['android', 'ios', 'web', 'shopify']);

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

function platformFromEvent(
  context: Record<string, unknown>,
  metadata: Record<string, unknown>,
) {
  const platform = text(context.platform ?? metadata.platform, 40)?.toLowerCase() ?? null;
  return platform && ALLOWED_PLATFORMS.has(platform) ? platform : null;
}

function sdkDescriptor(metadata: Record<string, unknown>) {
  const sdk = metadata.sdk;
  if (sdk && typeof sdk === 'object' && !Array.isArray(sdk)) {
    const row = sdk as Record<string, unknown>;
    return {
      name: text(row.name, 100),
      version: text(row.version, 40),
      integration: text(row.integration, 80),
    };
  }

  return {
    name: text(metadata.sdk_name ?? metadata.sdk, 100),
    version: text(metadata.sdk_version, 40),
    integration: text(metadata.integration_type, 80),
  };
}

function requestGpc(request: NextRequest, context: Record<string, unknown>) {
  if (request.headers.get('sec-gpc') === '1') return true;
  const value = context.gpc;
  return value === true || value === 1 || value === '1';
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
    return json(
      { ok: false, accepted: false, error: 'Unknown or inactive publishable client source.' },
      401,
    );
  }

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > source.maxPayloadBytes) {
    return json(
      { ok: false, accepted: false, error: 'Payload too large.' },
      413,
    );
  }

  const rate = await consumePublishableClientRateLimit(source);
  if (!rate.allowed) {
    return json(
      { ok: false, accepted: false, error: 'Rate limit exceeded.' },
      429,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': '0',
        'Retry-After': '60',
      },
    );
  }

  try {
    const event = sanitizePublishableClientTrackingEvent(await request.json());

    if (!publishableClientEventAllowed(source, event.eventName)) {
      return json(
        {
          ok: false,
          accepted: false,
          error: 'Event is not allowed for this publishable source.',
        },
        403,
      );
    }

    const platform = platformFromEvent(event.context, event.metadata);
    if (!platform) {
      return json(
        {
          ok: false,
          accepted: false,
          error: 'A supported client platform is required.',
        },
        400,
      );
    }

    const sdk = sdkDescriptor(event.metadata);
    if (!sdk.name || !sdk.version) {
      return json(
        {
          ok: false,
          accepted: false,
          error: 'metadata.sdk.name and metadata.sdk.version are required.',
        },
        400,
      );
    }

    const configuredPlatform = text(source.metadata.platform, 40)?.toLowerCase() ?? null;
    if (configuredPlatform && configuredPlatform !== platform) {
      return json(
        {
          ok: false,
          accepted: false,
          error: 'Client platform does not match the configured source.',
        },
        403,
      );
    }

    const gpc = source.honorGpc ? requestGpc(request, event.context) : false;
    const admin = createAdminClient();

    // Publishable clients are untrusted. Privacy permission is checked before
    // the immutable raw-event ledger is written.
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

    const { data, error } = await admin.rpc('ingest_tracking_event_v1', {
      p_organization_id: source.organizationId,
      p_tracking_source_id: source.id,
      p_source_event_id: event.eventId,
      p_event_name: event.eventName,
      p_ingestion_method: 'publishable_client_v1',
      p_occurred_at: event.occurredAt,
      p_anonymous_visitor_id: event.anonymousVisitorId,
      p_session_key: event.sessionKey,
      p_external_message_id: event.externalMessageId,
      p_site: event.site,
      p_payload: event.payload,
      p_context: {
        ...event.context,
        platform,
        gpc,
        user_agent_present: Boolean(request.headers.get('user-agent')),
      },
      p_metadata: {
        ...event.metadata,
        sdk,
        platform,
        adapter: 'app/api/events/client/v1',
        source_key: source.sourceKey,
        authority: 'non_authoritative_client_telemetry',
        pii_policy: 'public_client_redaction_v1',
        privacy_gate_reason: privacyGate?.reason ?? null,
        privacy_purpose: privacyGate?.mapped_purpose ?? privacyGate?.purpose ?? null,
      },
      p_schema_version: event.schemaVersion,
      p_is_browser: false,
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
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  } catch (error) {
    return json(
      {
        ok: false,
        accepted: false,
        error: error instanceof Error ? error.message : 'Client event ingestion failed.',
      },
      400,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }
}
