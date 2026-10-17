import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeTrackingPayload } from "@/lib/tracking/server";
import {
  consumeTrackingRateLimit,
  corsHeadersForTrackingOrigin,
  resolveBrowserTrackingSource,
} from "@/lib/tracking/runtime";

function decodeGeoHeader(value: string | null) {
  if (!value) return null;

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getRequestGeo(request: NextRequest) {
  return {
    country: request.headers.get("x-vercel-ip-country") || null,
    region: request.headers.get("x-vercel-ip-country-region") || null,
    city: decodeGeoHeader(request.headers.get("x-vercel-ip-city")),
    timezone: request.headers.get("x-vercel-ip-timezone") || null,
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const source = await resolveBrowserTrackingSource(origin);

  return new NextResponse(null, {
    status: source ? 204 : 403,
    headers: corsHeadersForTrackingOrigin(origin, Boolean(source)),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const source = await resolveBrowserTrackingSource(origin);
  const cors = corsHeadersForTrackingOrigin(origin, Boolean(source));

  if (!source) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        error: "Tracking source is not registered or active.",
      },
      {
        status: 403,
        headers: cors,
      },
    );
  }

  const length = Number(request.headers.get("content-length") || "0");

  if (length > source.maxPayloadBytes) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        error: "Payload too large",
      },
      {
        status: 413,
        headers: cors,
      },
    );
  }

  const rate = await consumeTrackingRateLimit(source);

  if (!rate.allowed) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        error: "Rate limit exceeded",
      },
      {
        status: 429,
        headers: {
          ...cors,
          "Retry-After": "60",
          "X-RateLimit-Limit": String(rate.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  try {
    const payload = sanitizeTrackingPayload(await request.json());
    const supabase = createAdminClient();
    const geo = getRequestGeo(request);
    const organizationId = source.organizationId;
    const trustedSite = source.hostname;
    const occurredAt = payload.occurredAt || new Date().toISOString();

    if (!trustedSite) {
      throw new Error("Website tracking source is missing its trusted hostname.");
    }

    const { data: rawEventResult, error: rawEventError } = await supabase.rpc(
      "ingest_tracking_event_v1",
      {
        p_organization_id: organizationId,
        p_tracking_source_id: source.id,
        p_source_event_id: payload.eventId,
        p_event_name: payload.eventType,
        p_ingestion_method: "tracking_collect_v1",
        p_occurred_at: occurredAt,
        p_anonymous_visitor_id: payload.anonymousVisitorId,
        p_session_key: payload.sessionKey,
        p_external_message_id: null,
        p_site: trustedSite,
        p_payload: payload,
        p_context: {
          origin_hostname: trustedSite,
          trusted_site: trustedSite,
          geo_country: geo.country,
          geo_region: geo.region,
          geo_city: geo.city,
          geo_timezone: geo.timezone,
          user_agent: request.headers.get("user-agent"),
        },
        p_metadata: {
          adapter: "app/api/tracking/collect",
          reported_site: payload.site || null,
          dynamic_source_resolution: true,
        },
        p_schema_version: 1,
        p_is_browser: true,
      },
    );

    if (rawEventError || !rawEventResult?.event_id) {
      throw new Error(
        rawEventError?.message ||
          "Unable to persist canonical website event before normalization.",
      );
    }

    if (!rawEventResult.accepted) {
      return NextResponse.json(
        {
          ok: true,
          accepted: false,
          quarantined: true,
          duplicate: Boolean(rawEventResult.duplicate),
          raw_event_id: rawEventResult.event_id,
          reason: rawEventResult.reason || "event_not_processable",
        },
        {
          status: 202,
          headers: {
            ...cors,
            "X-RateLimit-Limit": String(rate.limit),
            "X-RateLimit-Remaining": String(rate.remaining),
          },
        },
      );
    }

    const { error: processingError } = await supabase.rpc(
      "process_website_raw_event",
      {
        p_organization_id: organizationId,
        p_raw_event_id: rawEventResult.event_id,
      },
    );

    if (processingError) {
      throw processingError;
    }

    if (payload.fbc || payload.fbp) {
      const { error: matchSignalError } = await supabase.rpc(
        "apply_tracking_match_signals",
        {
          p_organization_id: organizationId,
          p_raw_event_id: rawEventResult.event_id,
        },
      );

      if (matchSignalError) {
        throw matchSignalError;
      }
    }

    if (payload.consent) {
      const { error: consentSnapshotError } = await supabase.rpc(
        "ingest_tracking_consent_event",
        {
          p_organization_id: organizationId,
          p_source_event_id: payload.eventId,
          p_occurred_at: occurredAt,
          p_anonymous_visitor_id: payload.anonymousVisitorId,
          p_session_key: payload.sessionKey,
          p_site: trustedSite,
          p_consent_analytics: payload.consent.analytics,
          p_consent_ad_user_data: payload.consent.adUserData,
          p_consent_ad_personalization:
            payload.consent.adPersonalization,
          p_consent_marketing: payload.consent.marketing,
          p_consent_mode: payload.consent.mode || null,
          p_consent_source:
            payload.consent.source || "yk_tracker",
          p_raw_event_id: rawEventResult.event_id,
          p_metadata: {
            adapter: "app/api/tracking/collect",
            provenance: "event_time_snapshot",
          },
        },
      );

      if (consentSnapshotError) {
        throw consentSnapshotError;
      }
    }

    const { error: rawProcessingError } = await supabase.rpc(
      "set_raw_event_processing_status",
      {
        p_organization_id: organizationId,
        p_source_system: source.sourceSystem,
        p_source_event_id: payload.eventId,
        p_status: "processed",
        p_processor_name: "tracking_collect_v1",
        p_processor_version: "tracking-platform-v1",
        p_processing_error: null,
        p_processing_metadata: {
          normalized_target: "web_sessions,touchpoints",
          normalizer: "process_website_raw_event",
          tracking_source_id: source.id,
          match_signals_projected: Boolean(payload.fbc || payload.fbp),
          consent_snapshot_persisted: Boolean(payload.consent),
        },
      },
    );

    if (rawProcessingError) {
      console.error("Raw website event processing sync failed", {
        organizationId,
        eventId: payload.eventId,
        eventType: payload.eventType,
        message: rawProcessingError.message,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        accepted: true,
        duplicate: Boolean(rawEventResult.duplicate),
        raw_event_id: rawEventResult.event_id,
        event_family: rawEventResult.event_family,
      },
      {
        status: 202,
        headers: {
          ...cors,
          "X-RateLimit-Limit": String(rate.limit),
          "X-RateLimit-Remaining": String(rate.remaining),
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tracking ingest failed";

    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        error: message,
      },
      {
        status: 400,
        headers: {
          ...cors,
          "X-RateLimit-Limit": String(rate.limit),
          "X-RateLimit-Remaining": String(rate.remaining),
        },
      },
    );
  }
}
