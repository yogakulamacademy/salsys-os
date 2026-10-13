import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveBrowserTrackingCredential,
  trackingOriginHostname,
} from "@/lib/tracking/browser-auth";
import {
  isTrackingOriginAllowed,
  sanitizeTrackingPayload,
  trackingCorsHeaders,
} from "@/lib/tracking/server";

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

function browserTrackingCorsHeaders(origin: string | null) {
  const legacy = trackingCorsHeaders(origin);

  return {
    ...legacy,
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "Content-Type, X-Salsys-Key",
    Vary: "Origin",
  };
}

function getBrowserPublicKey(request: NextRequest) {
  return (
    request.headers.get("x-salsys-key")?.trim() ||
    request.nextUrl.searchParams.get("salsys_key")?.trim() ||
    null
  );
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");

  // Preflight is not authorization. The POST below validates the public key,
  // allowed hostname, credential status/scope and organization binding.
  return new NextResponse(null, {
    status: 204,
    headers: browserTrackingCorsHeaders(origin),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const cors = browserTrackingCorsHeaders(origin);
  const browserPublicKey = getBrowserPublicKey(request);

  try {
    const length = Number(request.headers.get("content-length") || "0");

    if (length > 32_000) {
      return NextResponse.json(
        { ok: false, error: "Payload too large" },
        { status: 413, headers: cors },
      );
    }

    const payload = sanitizeTrackingPayload(await request.json());
    const supabase = createAdminClient();
    const geo = getRequestGeo(request);
    const originHostname = trackingOriginHostname(origin);

    if (!originHostname) {
      return NextResponse.json(
        { ok: false, error: "Unable to resolve tracking hostname." },
        { status: 403, headers: cors },
      );
    }

    let organizationId: string;
    let trustedSite: string;
    let credentialId: string | null = null;
    let credentialPublicKey: string | null = null;

    if (browserPublicKey) {
      const credential = await resolveBrowserTrackingCredential({
        supabase,
        publicKey: browserPublicKey,
        origin,
        requiredScope: "events:write",
      });

      if (!credential) {
        return NextResponse.json(
          {
            ok: false,
            error: "Tracking key is invalid for this website.",
          },
          { status: 403, headers: cors },
        );
      }

      organizationId = credential.organizationId;
      trustedSite = credential.hostname;
      credentialId = credential.credentialId;
      credentialPublicKey = credential.publicKey;
    } else {
      // Temporary legacy path for the existing Yogakulam installation.
      // New Salsys SDK installs should always provide data-key.
      if (!isTrackingOriginAllowed(origin)) {
        return NextResponse.json(
          { ok: false, error: "Origin not allowed" },
          { status: 403, headers: cors },
        );
      }

      const { data: organizationSite, error: organizationSiteError } =
        await supabase
          .from("organization_sites")
          .select("organization_id, hostname")
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

      organizationId = organizationSite.organization_id;
      trustedSite = organizationSite.hostname;
    }

    const occurredAt = payload.occurredAt || new Date().toISOString();

    const { data: rawEventResult, error: rawEventError } = await supabase.rpc(
      "ingest_raw_event",
      {
        p_organization_id: organizationId,
        p_source_system: "website",
        p_source_event_id: payload.eventId,
        p_source_event_type: payload.eventType,
        p_ingestion_method: "tracking_collect",
        p_occurred_at: occurredAt,
        p_source_account_id: credentialPublicKey,
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
          browser_auth: credentialId ? "publishable_key" : "legacy_origin",
          credential_id: credentialId,
        },
        p_schema_version: 1,
      },
    );

    if (rawEventError || !rawEventResult?.event_id) {
      throw new Error(
        rawEventError?.message ||
          "Unable to persist canonical website event before normalization.",
      );
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
          p_consent_source:
            payload.consent.source ||
            (credentialId ? "salsys_browser_sdk" : "yk_tracker"),
          p_raw_event_id: rawEventResult.event_id,
          p_metadata: {
            adapter: "app/api/tracking/collect",
            provenance: "event_time_snapshot",
            credential_id: credentialId,
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
        p_processor_version: credentialId ? "salsys-sdk-key-v1" : "phase3b",
        p_processing_error: null,
        p_processing_metadata: {
          normalized_target: "web_sessions,touchpoints",
          normalizer: "process_website_raw_event",
          match_signals_projected: Boolean(payload.fbc || payload.fbp),
          consent_snapshot_persisted: Boolean(payload.consent),
          credential_id: credentialId,
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
    const message =
      error instanceof Error ? error.message : "Tracking ingest failed";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: cors },
    );
  }
}
