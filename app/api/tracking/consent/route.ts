import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  isTrackingOriginAllowed,
  sanitizeTrackingConsentPayload,
  trackingCorsHeaders,
} from "@/lib/tracking/server";


function getOriginHostname(origin: string | null) {
  if (!origin) return null;

  try {
    return new URL(origin)
      .hostname
      .trim()
      .toLowerCase()
      .replace(/\.$/, "");
  } catch {
    return null;
  }
}


export async function OPTIONS(request: NextRequest) {
  const origin =
    request.headers.get("origin");

  return new NextResponse(null, {
    status: 204,
    headers: trackingCorsHeaders(origin),
  });
}


export async function POST(request: NextRequest) {
  const origin =
    request.headers.get("origin");

  const cors =
    trackingCorsHeaders(origin);


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
    const length =
      Number(
        request.headers.get("content-length") ||
          "0",
      );


    if (length > 16_000) {
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


    const payload =
      sanitizeTrackingConsentPayload(
        await request.json(),
      );


    const originHostname =
      getOriginHostname(origin);


    if (!originHostname) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unable to resolve tracking hostname.",
        },
        {
          status: 403,
          headers: cors,
        },
      );
    }


    const supabase =
      createAdminClient();


    /*
     * Tenant identity is trusted server-side state.
     *
     * organization_id is never accepted from the browser.
     */
    const {
      data: organizationSite,
      error: organizationSiteError,
    } =
      await supabase
        .from("organization_sites")
        .select(
          `
            organization_id,
            hostname
          `,
        )
        .eq(
          "hostname",
          originHostname,
        )
        .eq(
          "status",
          "active",
        )
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


    const organizationId =
      organizationSite.organization_id;

    const trustedSite =
      organizationSite.hostname;

    const occurredAt =
      payload.occurredAt ||
      new Date().toISOString();


    /*
     * Consent storage is deliberately separate from analytics
     * event collection.
     *
     * This route therefore remains usable when analytics consent
     * is explicitly FALSE.
     *
     * No page URL, referrer, attribution data, user agent,
     * advertising identifier, email, phone, or browser metadata
     * is persisted here.
     */
    const {
      data: consentResult,
      error: consentError,
    } =
      await supabase.rpc(
        "ingest_tracking_consent_event",
        {
          p_organization_id:
            organizationId,

          p_source_event_id:
            payload.eventId,

          p_occurred_at:
            occurredAt,

          p_anonymous_visitor_id:
            payload.anonymousVisitorId ||
            null,

          p_session_key:
            payload.sessionKey ||
            null,

          p_site:
            trustedSite,

          p_consent_analytics:
            payload.consent.analytics,

          p_consent_ad_user_data:
            payload.consent.adUserData,

          p_consent_ad_personalization:
            payload.consent
              .adPersonalization,

          p_consent_marketing:
            payload.consent.marketing,

          p_consent_mode:
            payload.consent.mode ||
            null,

          p_consent_source:
            payload.consent.source ||
            "yk_tracker",

          p_raw_event_id:
            null,

          p_metadata: {
            adapter:
              "app/api/tracking/consent",
          },
        },
      );


    if (consentError) {
      throw consentError;
    }


    return NextResponse.json(
      {
        ok: true,
        created:
          Boolean(
            consentResult?.created,
          ),
      },
      {
        headers: cors,
      },
    );

  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Tracking consent ingest failed";


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
