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
    const touch = payload.sessionTouch || {};
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

    /*
     * Find the exact tenant-scoped session first.
     *
     * If this session already has a lead_id, that exact session assignment
     * is more authoritative than the browser-level visitor_identity_links
     * pointer.
     */
    const { data: existingSession, error: existingError } = await supabase
      .from("web_sessions")
      .select(
        `
          id,
          organization_id,
          anonymous_visitor_id,
          lead_id
        `,
      )
      .eq("session_key", payload.sessionKey)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (
      existingSession &&
      existingSession.anonymous_visitor_id !== payload.anonymousVisitorId
    ) {
      throw new Error(
        "Tracking session does not belong to the supplied anonymous visitor.",
      );
    }

    /*
     * visitor_identity_links is current-session routing state, not a
     * permanent Person identity.
     *
     * A browser may be shared by multiple people. Therefore a historical
     * visitor -> lead link is used only when it explicitly points to this
     * exact current session.
     */
    const { data: identity, error: identityError } = await supabase
      .from("visitor_identity_links")
      .select("lead_id, last_session_key")
      .eq("organization_id", organizationId)
      .eq("anonymous_visitor_id", payload.anonymousVisitorId)
      .maybeSingle();

    if (identityError) {
      throw identityError;
    }

    let candidateLeadId: string | null = null;

    if (existingSession?.lead_id) {
      candidateLeadId = existingSession.lead_id;
    } else if (
      identity?.lead_id &&
      identity.last_session_key === payload.sessionKey
    ) {
      candidateLeadId = identity.lead_id;
    }

    /*
     * Because this route uses the admin client, explicitly verify that any
     * candidate lead belongs to the organization resolved from Origin.
     */
    let resolvedLeadId: string | null = null;

    if (candidateLeadId) {
      const { data: organizationLead, error: organizationLeadError } =
        await supabase
          .from("leads")
          .select("id")
          .eq("id", candidateLeadId)
          .eq("organization_id", organizationId)
          .maybeSingle();

      if (organizationLeadError) {
        throw organizationLeadError;
      }

      resolvedLeadId = organizationLead?.id ?? null;
    }

    let session = existingSession;

    if (existingSession) {
      const { error: updateError } = await supabase
        .from("web_sessions")
        .update({
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
      /*
       * New sessions stay anonymous unless this exact session has already
       * been explicitly identified. A previous session from the same browser
       * must never automatically identify the new session.
       */
      const sessionRow = {
        organization_id: organizationId,
        anonymous_visitor_id: payload.anonymousVisitorId,
        lead_id: resolvedLeadId,
        session_key: payload.sessionKey,
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
          site: trustedSite,

          /*
           * Browser-supplied site is diagnostic metadata only and is never
           * used for tenant selection.
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
            organization_id,
            anonymous_visitor_id,
            lead_id
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

    /*
     * The raw tracking event remains tenant scoped.
     *
     * lead_id is set only when the exact session has an authoritative lead
     * association. Historical browser identity alone is never enough.
     */
    const eventRow = {
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

    /*
     * Event IDs are tenant scoped.
     */
    const { error: eventError } = await supabase
      .from("touchpoints")
      .upsert(eventRow, {
        onConflict: "organization_id,event_id",
        ignoreDuplicates: true,
      });

    if (eventError) {
      throw eventError;
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
