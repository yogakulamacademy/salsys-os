import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  isTrackingOriginAllowed,
  sanitizeTrackingPayload,
  trackingCorsHeaders,
} from "@/lib/tracking/server";

const MAX_COLLECT_BYTES = 32_000;

class PublicRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function declaredContentLength(request: NextRequest) {
  const header = request.headers.get("content-length");
  if (!header) return null;

  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function readBoundedJson(request: NextRequest, maxBytes: number) {
  const declared = declaredContentLength(request);
  if (declared !== null && declared > maxBytes) {
    throw new PublicRequestError("Payload too large", 413);
  }

  if (!request.body) {
    throw new PublicRequestError("Invalid JSON payload", 400);
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
        throw new PublicRequestError("Payload too large", 413);
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
    throw new PublicRequestError("Invalid JSON payload", 400);
  }
}

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

/*
 * Trusted tenant resolution.
 *
 * organization_id is never accepted from the browser payload.
 * The tenant is resolved from the already allowlisted HTTP Origin.
 */
function getOriginHostname(origin: string | null) {
  if (!origin) return null;

  try {
    return new URL(origin).hostname.trim().toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");

  return new NextResponse(null, {
    status: 204,
    headers: trackingCorsHeaders(origin),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const cors = trackingCorsHeaders(origin);

  if (!isTrackingOriginAllowed(origin)) {
    return NextResponse.json(
      { ok: false, error: "Origin not allowed" },
      { status: 403, headers: cors },
    );
  }

  const declared = declaredContentLength(request);
  if (declared !== null && declared > MAX_COLLECT_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Payload too large" },
      { status: 413, headers: cors },
    );
  }

  let raw: unknown;
  try {
    raw = await readBoundedJson(request, MAX_COLLECT_BYTES);
  } catch (error) {
    const requestError =
      error instanceof PublicRequestError
        ? error
        : new PublicRequestError("Invalid JSON payload", 400);

    return NextResponse.json(
      { ok: false, error: requestError.message },
      { status: requestError.status, headers: cors },
    );
  }

  let payload: ReturnType<typeof sanitizeTrackingPayload>;
  try {
    payload = sanitizeTrackingPayload(raw);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid tracking payload" },
      { status: 400, headers: cors },
    );
  }

  try {
    const supabase = createAdminClient();
    const geo = getRequestGeo(request);
    const originHostname = getOriginHostname(origin);

    if (!originHostname) {
      return NextResponse.json(
        { ok: false, error: "Unable to resolve tracking hostname." },
        { status: 403, headers: cors },
      );
    }

    const { data: organizationSite, error: organizationSiteError } =
      await supabase
        .from("organization_sites")
        .select("organization_id,hostname")
        .eq("hostname", originHostname)
        .eq("status", "active")
        .maybeSingle();

    if (organizationSiteError) throw organizationSiteError;

    if (!organizationSite?.organization_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "No active organization is configured for this tracking domain.",
        },
        { status: 403, headers: cors },
      );
    }

    const organizationId = organizationSite.organization_id;
    const trustedSite = organizationSite.hostname;
    const occurredAt = payload.occurredAt || new Date().toISOString();

    /*
     * Capture the sanitized browser event in the canonical immutable raw-event
     * store before downstream session/touchpoint processing. Tenant selection
     * comes only from the trusted Origin mapping.
     */
    const { data: rawEventResult, error: rawEventError } = await supabase.rpc(
      "ingest_raw_event",
      {
        p_organization_id: organizationId,
        p_source_system: "website",
        p_source_event_id: payload.eventId,
        p_source_event_type: payload.eventType,
        p_ingestion_method: "tracking_collect",
        p_occurred_at: occurredAt,
        p_source_account_id: null,
        p_source_subject_id: null,
        p_anonymous_visitor_id: payload.anonymousVisitorId,
        p_session_key: payload.sessionKey,
        p_external_message_id: null,
        p_site: trustedSite,
        p_payload: payload,
        p_context: {
          origin_hostname: originHostname,
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
        },
        p_schema_version: 1,
      },
    );

    if (rawEventError) {
      console.error("Raw website event ingest failed", {
        organizationId,
        eventId: payload.eventId,
        eventType: payload.eventType,
        message: rawEventError.message,
      });
    }

    if (rawEventError || !rawEventResult?.event_id) {
      throw new Error("Unable to persist canonical website event before normalization.");
    }

    const { error: processingError } = await supabase.rpc(
      "process_website_raw_event",
      {
        p_organization_id: organizationId,
        p_raw_event_id: rawEventResult.event_id,
      },
    );

    if (processingError) throw processingError;

    if (payload.fbc || payload.fbp) {
      const { error: matchSignalError } = await supabase.rpc(
        "apply_tracking_match_signals",
        {
          p_organization_id: organizationId,
          p_raw_event_id: rawEventResult.event_id,
        },
      );

      if (matchSignalError) throw matchSignalError;
    }

    /*
     * Consent storage remains independent by category. A normal analytics
     * event may preserve the consent state that was effective at event time.
     * Revocation while analytics is disabled continues through
     * /api/tracking/consent.
     */
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
          p_consent_ad_personalization: payload.consent.adPersonalization,
          p_consent_marketing: payload.consent.marketing,
          p_consent_mode: payload.consent.mode || null,
          p_consent_source: payload.consent.source || "salsys_tracker",
          p_raw_event_id: rawEventResult.event_id,
          p_metadata: {
            adapter: "app/api/tracking/collect",
            provenance: "event_time_snapshot",
          },
        },
      );

      if (consentSnapshotError) throw consentSnapshotError;
    }

    const { error: rawProcessingError } = await supabase.rpc(
      "set_raw_event_processing_status",
      {
        p_organization_id: organizationId,
        p_source_system: "website",
        p_source_event_id: payload.eventId,
        p_status: "processed",
        p_processor_name: "tracking_collect",
        p_processor_version: "phase3b",
        p_processing_error: null,
        p_processing_metadata: {
          normalized_target: "web_sessions,touchpoints",
          normalizer: "process_website_raw_event",
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

    return NextResponse.json({ ok: true }, { headers: cors });
  } catch (error) {
    console.error("Tracking ingest failed.", error);
    return NextResponse.json(
      { ok: false, error: "Tracking ingest failed" },
      { status: 500, headers: cors },
    );
  }
}
