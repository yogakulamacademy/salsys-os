import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
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
      {
        ok: false,
        error: "Origin not allowed",
      },
      {
        status: 403,
        headers: cors,
      },
    );
  }

  try {
    const length = Number(request.headers.get("content-length") || "0");

    if (length > 32_000) {
      return NextResponse.json(
        {
          ok: false,
          error: "Payload too large",
        },
        {
          status: 413,
          headers: cors,
        },
      );
    }

    const payload = sanitizeTrackingPayload(await request.json());

    const supabase = createAdminClient();
    const geo = getRequestGeo(request);

    /*
     * Resolve organization from trusted Origin.
     */
    const originHostname = getOriginHostname(origin);

    if (!originHostname) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unable to resolve tracking hostname.",
        },
        {
          status: 403,
          headers: cors,
        },
      );
    }

    const { data: organizationSite, error: organizationSiteError } =
      await supabase
        .from("organization_sites")
        .select(
          `
            organization_id,
            hostname
          `,
        )
        .eq("hostname", originHostname)
        .eq("status", "active")
        .maybeSingle();

    if (organizationSiteError) {
      throw organizationSiteError;
    }

    if (!organizationSite?.organization_id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No active organization is configured for this tracking domain.",
        },
        {
          status: 403,
          headers: cors,
        },
      );
    }

    const organizationId = organizationSite.organization_id;
    const trustedSite = organizationSite.hostname;
    const occurredAt = payload.occurredAt || new Date().toISOString();

    /*
     * Phase 2C raw-event dual write.
     *
     * Capture the sanitized browser event in the canonical immutable raw-event
     * store before downstream session/touchpoint processing. Phase 3B now uses
     * this canonical raw record as the required source for deterministic
     * normalization.
     *
     * Tenant selection still comes only from the trusted Origin mapping.
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

    /*
     * Phase 3B canonical website normalization.
     *
     * Session creation/update and touchpoint normalization now live behind the
     * database processor so the same deterministic rules can later be reused by
     * a claimed background worker. The processor itself is processing-state
     * neutral; Phase 2 lifecycle synchronization remains below.
     */
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

    if (processingError) {
      throw processingError;
    }

    /*
     * Phase 2E1 processing-state synchronization.
     *
     * Mark the canonical raw event processed only after the canonical
     * website normalizer succeeds. Keep lifecycle bookkeeping non-blocking so
     * status synchronization cannot interrupt successful website tracking.
     */
    if (!rawEventError) {
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
    }

    return NextResponse.json(
      {
        ok: true,
      },
      {
        headers: cors,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tracking ingest failed";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 400,
        headers: cors,
      },
    );
  }
}
