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

/* ============================================================
   TRUSTED TENANT RESOLUTION

   We resolve the organization from the HTTP Origin hostname.

   IMPORTANT:
   - organization_id is NOT accepted from browser payload
   - payload.site is NOT trusted for tenant selection
   - origin has already passed TRACKING_ALLOWED_ORIGINS
   ============================================================ */

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

  /* ==========================================================
     1. ORIGIN SECURITY
     ========================================================== */

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
    /* ========================================================
       2. BASIC REQUEST PROTECTION
       ======================================================== */

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

    /* ========================================================
       3. NORMALIZE TRACKING PAYLOAD
       ======================================================== */

    const payload = sanitizeTrackingPayload(await request.json());

    const supabase = createAdminClient();

    const touch = payload.sessionTouch || {};

    const geo = getRequestGeo(request);

    /* ========================================================
       4. RESOLVE ORGANIZATION FROM TRUSTED ORIGIN
       ======================================================== */

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

    /* ========================================================
       5. RESOLVE EXISTING VISITOR → LEAD IDENTITY

       visitor_identity_links is currently still global.

       Therefore, if an identity link exists, we verify that
       its lead actually belongs to the organization resolved
       above before attaching it to this session/event.
       ======================================================== */

    const { data: identity, error: identityError } = await supabase
      .from("visitor_identity_links")
      .select("lead_id")
      .eq("anonymous_visitor_id", payload.anonymousVisitorId)
      .maybeSingle();

    if (identityError) {
      throw identityError;
    }

    let resolvedLeadId: string | null = null;

    if (identity?.lead_id) {
      const { data: organizationLead, error: organizationLeadError } =
        await supabase
          .from("leads")
          .select("id")
          .eq("id", identity.lead_id)
          .eq("organization_id", organizationId)
          .maybeSingle();

      if (organizationLeadError) {
        throw organizationLeadError;
      }

      resolvedLeadId = organizationLead?.id ?? null;
    }

    /* ========================================================
       6. FIND EXISTING SESSION

       Session lookup is now tenant scoped.

       This prevents Organization B from ever reusing an
       Organization A session just by submitting its key.
       ======================================================== */

    const { data: existingSession, error: existingError } = await supabase
      .from("web_sessions")
      .select(
        `
        id,
        organization_id
      `,
      )
      .eq("session_key", payload.sessionKey)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    let session = existingSession;

    /* ========================================================
       7. UPDATE EXISTING SESSION
       ======================================================== */

    if (existingSession) {
      const { error: updateError } = await supabase
        .from("web_sessions")
        .update({
          /*
           * Reassert organization ownership.
           * This should already match because the lookup
           * above is organization scoped.
           */
          organization_id: organizationId,

          last_seen_at: new Date().toISOString(),

          ...(resolvedLeadId
            ? {
                lead_id: resolvedLeadId,
              }
            : {}),

          ...(geo.country
            ? {
                geo_country: geo.country,
              }
            : {}),

          ...(geo.region
            ? {
                geo_region: geo.region,
              }
            : {}),

          ...(geo.city
            ? {
                geo_city: geo.city,
              }
            : {}),

          ...(geo.timezone
            ? {
                geo_timezone: geo.timezone,
              }
            : {}),
        })
        .eq("id", existingSession.id)
        .eq("organization_id", organizationId);

      if (updateError) {
        throw updateError;
      }
    } else {

    /* ========================================================
       8. CREATE NEW SESSION
       ======================================================== */
      const sessionRow = {
        /*
         * Tenant ownership
         */
        organization_id: organizationId,

        anonymous_visitor_id: payload.anonymousVisitorId,

        lead_id: resolvedLeadId,

        session_key: payload.sessionKey,

        /*
         * Use the server-resolved hostname instead of trusting
         * payload.site for tenant identity.
         */
        site: trustedSite,

        source: touch.source || null,

        medium: touch.medium || null,

        geo_country: geo.country,

        geo_region: geo.region,

        geo_city: geo.city,

        geo_timezone: geo.timezone,

        campaign_name: touch.campaign || null,

        landing_page: payload.pageUrl || payload.pagePath || null,

        referrer: payload.referrer || null,

        utm_source: touch.source || null,

        utm_medium: touch.medium || null,

        utm_campaign: touch.campaign || null,

        utm_content: touch.content || null,

        utm_term: touch.term || null,

        gclid: touch.gclid || null,

        gbraid: touch.gbraid || null,

        wbraid: touch.wbraid || null,

        fbclid: touch.fbclid || null,

        user_agent: request.headers.get("user-agent"),

        last_seen_at: new Date().toISOString(),

        metadata: {
          /*
           * Server-trusted site identity.
           */
          site: trustedSite,

          /*
           * Keep the browser supplied value only as diagnostic
           * metadata. It never determines the organization.
           */
          reported_site: payload.site || null,

          page_title: payload.pageTitle,

          first_touch: payload.firstTouch,

          utm_id: touch.utmId,

          adgroup_id: touch.adgroupId,

          creative_id: touch.creativeId,
        },
      };

      const { data: createdSession, error: sessionError } = await supabase
        .from("web_sessions")
        .insert(sessionRow)
        .select(
          `
          id,
          organization_id
        `,
        )
        .single();

      if (sessionError) {
        throw sessionError;
      }

      session = createdSession;
    }

    if (!session) {
      throw new Error("Unable to create tracking session.");
    }

    /* ========================================================
       9. CREATE TENANT-SCOPED TOUCHPOINT
       ======================================================== */

    const eventRow = {
      /*
       * Tenant ownership
       */
      organization_id: organizationId,

      event_id: payload.eventId,

      lead_id: resolvedLeadId,

      web_session_id: session.id,

      anonymous_visitor_id: payload.anonymousVisitorId,

      geo_country: geo.country,

      geo_region: geo.region,

      geo_city: geo.city,

      occurred_at: payload.occurredAt || new Date().toISOString(),

      source: touch.source || null,

      medium: touch.medium || null,

      campaign_name: touch.campaign || null,

      content: touch.content || null,

      term: touch.term || null,

      platform: touch.source || null,

      channel: "website",

      landing_page: payload.pageUrl || payload.pagePath || null,

      referrer: payload.referrer || null,

      event_type: payload.eventType,

      utm_source: touch.source || null,

      utm_medium: touch.medium || null,

      utm_campaign: touch.campaign || null,

      utm_content: touch.content || null,

      utm_term: touch.term || null,

      gclid: touch.gclid || null,

      gbraid: touch.gbraid || null,

      wbraid: touch.wbraid || null,

      fbclid: touch.fbclid || null,

      external_campaign_id: touch.campaignId || null,

      external_adset_id: touch.adsetId || null,

      external_ad_id: touch.adId || touch.creativeId || null,

      metadata: {
        /*
         * Again, site identity comes from the trusted origin.
         */
        site: trustedSite,

        reported_site: payload.site || null,

        page_title: payload.pageTitle,

        page_path: payload.pagePath,

        first_touch: payload.firstTouch,

        utm_id: touch.utmId,

        adgroup_id: touch.adgroupId,

        ...payload.metadata,
      },
    };

    /* ========================================================
       IMPORTANT

       event_id is still globally unique in the current schema.

       We deliberately keep onConflict: 'event_id' FOR NOW.

       During the upcoming tenant-uniqueness migration this
       becomes:

       organization_id,event_id

       Do not change that early or Supabase upsert will fail.
       ======================================================== */

    const { error: eventError } = await supabase
      .from("touchpoints")
      .upsert(eventRow, {
        onConflict: "event_id",

        ignoreDuplicates: true,
      });

    if (eventError) {
      throw eventError;
    }

    /* ========================================================
       10. SUCCESS
       ======================================================== */

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
