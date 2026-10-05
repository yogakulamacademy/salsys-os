import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  isTrackingOriginAllowed,
  trackingCorsHeaders,
} from "@/lib/tracking/server";

import {
  isWebsiteCaptureAuthorized,
  sanitizeWebsiteLeadPayload,
} from "@/lib/website-leads/server";

/* =========================================================

   HELPERS

========================================================= */

function inferCoursePreferences(course: string | null | undefined) {
  const value = (course || "").toLowerCase();

  let preferredLocation: string | null = null;

  let preferredMode: string | null = null;

  if (value.includes("mysore") || value.includes("mysuru")) {
    preferredLocation = "Mysore";
  } else if (
    value.includes("kerala") ||
    value.includes("varkala") ||
    value.includes("paravur")
  ) {
    preferredLocation = "Kerala";
  } else if (value.includes("bengaluru") || value.includes("bangalore")) {
    preferredLocation = "Bengaluru";
  } else if (value.includes("goa")) {
    preferredLocation = "Goa";
  } else if (value.includes("nepal")) {
    preferredLocation = "Nepal";
  } else if (value.includes("online")) {
    preferredLocation = "Online";
  }

  if (value.includes("online")) {
    preferredMode = "Online";
  } else if (preferredLocation && preferredLocation !== "Online") {
    preferredMode = "Offline";
  }

  return {
    preferredLocation,

    preferredMode,
  };
}

function getLeadOrigin(formName?: string | null) {
  const name = (formName || "").toLowerCase();

  if (name.includes("contact")) {
    return "Website Contact Form";
  }

  if (name.includes("brochure") || name.includes("leadpopup")) {
    return "Website Brochure Form";
  }

  if (name.includes("reservation") || name.includes("booking")) {
    return "Website Reservation Form";
  }

  if (name.includes("enroll")) {
    return "Website Enrollment Form";
  }

  return "Website";
}

function metadataValue(
  metadata: unknown,

  key: string,
): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];

  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value);
}

function metadataNumber(
  metadata: unknown,

  key: string,
): number | null {
  const value = metadataValue(metadata, key);

  if (!value) return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

/* =========================================================

   OPTIONS

========================================================= */

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,

    headers: {
      ...trackingCorsHeaders(request.headers.get("origin")),

      "Access-Control-Allow-Headers": "Content-Type, X-Website-Secret",
    },
  });
}

/* =========================================================

   POST

========================================================= */

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  const cors = {
    ...trackingCorsHeaders(origin),

    "Access-Control-Allow-Headers": "Content-Type, X-Website-Secret",
  };

  /* -------------------------------------------------------

     SECURITY

  ------------------------------------------------------- */

  if (origin && !isTrackingOriginAllowed(origin)) {
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

  if (!isWebsiteCaptureAuthorized(request.headers.get("x-website-secret"))) {
    return NextResponse.json(
      {
        ok: false,

        error: "Unauthorized",
      },

      {
        status: 401,

        headers: cors,
      },
    );
  }

  try {
    /* -----------------------------------------------------

       SIZE LIMIT

    ----------------------------------------------------- */

    const length = Number(request.headers.get("content-length") || "0");

    if (length > 48_000) {
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

    /* -----------------------------------------------------

       PAYLOAD

    ----------------------------------------------------- */

    const payload = sanitizeWebsiteLeadPayload(await request.json());

    const supabase = createAdminClient();

    /* =====================================================

       STEP 1

       CREATE / MATCH LEAD

       Existing working RPC

    ===================================================== */

    const { data, error } = await supabase.rpc(
      "ingest_website_lead",

      {
        p_external_event_id: payload.externalEventId,

        p_site: payload.site ?? null,

        p_form_name: payload.formName ?? null,

        p_first_name: payload.firstName ?? null,

        p_last_name: payload.lastName ?? null,

        p_email: payload.email ?? null,

        p_phone: payload.phone ?? null,

        p_course_code: payload.courseCode ?? null,

        p_preferred_location: payload.preferredLocation ?? null,

        p_preferred_month: payload.preferredMonth ?? null,

        p_preferred_mode: payload.preferredMode ?? null,

        p_country: payload.country ?? null,

        p_timezone: payload.timezone ?? null,

        p_message: payload.message ?? null,

        p_anonymous_visitor_id: payload.anonymousVisitorId ?? null,

        p_session_key: payload.sessionKey ?? null,

        p_first_touch: payload.firstTouch ?? {},

        p_session_touch: payload.sessionTouch ?? {},

        p_metadata: {
          ...(payload.metadata ?? {}),

          request_user_agent: request.headers.get("user-agent"),
        },
      },
    );

    if (error) {
      throw error;
    }

    /* =====================================================

       NORMALIZE RPC RESULT

    ===================================================== */

    const result = Array.isArray(data) ? data[0] : data;

    const leadId =
      result && typeof result === "object"
        ? (result as Record<string, unknown>).lead_id
        : null;

    const organizationId =
      result && typeof result === "object"
        ? (result as Record<string, unknown>).organization_id
        : null;

    /*

     * If RPC somehow succeeds without returning lead_id,

     * don't break lead capture.

     */

    if (!leadId || typeof leadId !== "string") {
      return NextResponse.json(
        data ?? { ok: true },

        { headers: cors },
      );
    }

    if (!organizationId || typeof organizationId !== "string") {
      console.error(
        "Website lead ingestion succeeded without organization_id.",
      );

      return NextResponse.json(data ?? { ok: true }, { headers: cors });
    }

    /* =====================================================

       STEP 2

       FIND VISITOR SESSION

    ===================================================== */

    let session: Record<string, any> | null = null;

    if (payload.sessionKey) {
      const {
        data: sessionData,

        error: sessionError,
      } = await supabase

        .from("web_sessions")

        .select(
          `

          id,

          anonymous_visitor_id,

          session_key,

          lead_id,

          source,

          medium,

          campaign_name,

          landing_page,

          referrer,

          utm_source,

          utm_medium,

          utm_campaign,

          geo_country,

          geo_region,

          geo_city,

          geo_timezone,

          last_seen_at

        `,
        )

        .eq("organization_id", organizationId)
        .eq("session_key", payload.sessionKey)
        .maybeSingle();

      if (sessionError) {
        console.error(
          "Lead enrichment session lookup failed:",

          sessionError,
        );
      } else {
        session = sessionData;
      }
    }

    /* =====================================================

       STEP 3

       VERIFY DATABASE-OWNED EXACT-SESSION LINKING

       ingest_website_lead() owns visitor/session attachment.
       This route must not infer identity from browser history.

    ===================================================== */

    const visitorId =
      payload.anonymousVisitorId ?? session?.anonymous_visitor_id ?? null;

    const resolvedSessionKey =
      payload.sessionKey ?? session?.session_key ?? null;

    let identityLinked = false;

    const sessionsLinked = Boolean(session?.id && session?.lead_id === leadId);

    let touchpointsLinked = false;

    const identityConflict = false;

    if (visitorId && resolvedSessionKey) {
      const {
        data: identityRow,

        error: identityCheckError,
      } = await supabase

        .from("visitor_identity_links")

        .select("lead_id, last_session_key")

        .eq("organization_id", organizationId)

        .eq("anonymous_visitor_id", visitorId)

        .maybeSingle();

      if (identityCheckError) {
        console.error(
          "Visitor identity verification failed:",

          identityCheckError,
        );
      } else {
        identityLinked =
          identityRow?.lead_id === leadId &&
          identityRow?.last_session_key === resolvedSessionKey;
      }
    }

    if (session?.id) {
      const {
        count: linkedTouchpointCount,

        error: touchpointCheckError,
      } = await supabase

        .from("touchpoints")

        .select("id", {
          count: "exact",

          head: true,
        })

        .eq("organization_id", organizationId)

        .eq("web_session_id", session.id)

        .eq("lead_id", leadId);

      if (touchpointCheckError) {
        console.error(
          "Exact-session touchpoint verification failed:",

          touchpointCheckError,
        );
      } else {
        touchpointsLinked = (linkedTouchpointCount ?? 0) > 0;
      }
    }

    /* =====================================================

       STEP 4

       DERIVE COURSE INFORMATION

    ===================================================== */

    const inferred = inferCoursePreferences(payload.courseCode);

    const preferredLocation =
      payload.preferredLocation ?? inferred.preferredLocation;

    const preferredMode = payload.preferredMode ?? inferred.preferredMode;

    const preferredMonth =
      payload.preferredMonth ??
      metadataValue(
        payload.metadata,

        "preferred_month",
      );

    /*

     * Potential value should preferably come from:

     *

     * - selected course/batch

     * - accommodation selection

     * - website pricing system

     *

     * rather than being guessed.

     *

     * For now we support explicit metadata.

     */

    const potentialValue = metadataNumber(
      payload.metadata,

      "potential_value",
    );

    const potentialCurrency = metadataValue(
      payload.metadata,

      "potential_currency",
    );

    /* =====================================================

       STEP 5

       ATTRIBUTION

    ===================================================== */

    const firstTouch = payload.firstTouch ?? {};

    const lastTouch = payload.sessionTouch ?? {};

    const firstSource =
      firstTouch.source ?? session?.utm_source ?? session?.source ?? null;

    const firstMedium =
      firstTouch.medium ?? session?.utm_medium ?? session?.medium ?? null;

    const firstCampaign =
      firstTouch.campaign ??
      session?.utm_campaign ??
      session?.campaign_name ??
      null;

    const lastSource = lastTouch.source ?? session?.source ?? null;

    const lastMedium = lastTouch.medium ?? session?.medium ?? null;

    const lastCampaign = lastTouch.campaign ?? session?.campaign_name ?? null;

    /* =====================================================

       STEP 6

       UPDATE LEAD WITH INTELLIGENCE

    ===================================================== */

    const leadUpdate: Record<string, unknown> = {
      /* Course intent */

      preferred_location: preferredLocation ?? null,

      preferred_month: preferredMonth ?? null,

      preferred_mode: preferredMode ?? null,

      /* Revenue */

      potential_value: potentialValue,

      potential_currency: potentialCurrency,

      /* Approx visitor geography */

      geo_country: session?.geo_country ?? null,

      geo_region: session?.geo_region ?? null,

      geo_city: session?.geo_city ?? null,

      geo_timezone: session?.geo_timezone ?? null,

      /* Journey */

      landing_page: session?.landing_page ?? null,

      lead_origin: getLeadOrigin(payload.formName),

      /* First attribution */

      first_touch_source: firstSource,

      first_touch_medium: firstMedium,

      first_touch_campaign: firstCampaign,

      /* Last attribution */

      last_touch_source: lastSource,

      last_touch_medium: lastMedium,

      last_touch_campaign: lastCampaign,
    };

    const { error: leadUpdateError } = await supabase

      .from("leads")

      .update(leadUpdate)

      .eq("organization_id", organizationId)

      .eq("id", leadId);

    /*

     * Lead enrichment should never cause

     * a successfully created lead to fail.

     */

    if (leadUpdateError) {
      console.error(
        "Lead enrichment update failed:",

        leadUpdateError,
      );
    }

    /* =====================================================

       FINAL RESPONSE

    ===================================================== */

    return NextResponse.json(
      {
        ...(result ?? { ok: true }),

        enrichment: {
          applied: !leadUpdateError,

          geo: Boolean(session?.geo_country || session?.geo_city),

          attribution: Boolean(firstSource || firstCampaign),

          preferred_location: preferredLocation,

          preferred_mode: preferredMode,
        },

        linking: {
          visitor_id_present: Boolean(visitorId),

          identity_linked: identityLinked,

          sessions_linked: sessionsLinked,

          touchpoints_linked: touchpointsLinked,

          identity_conflict: identityConflict,
        },
      },

      {
        headers: cors,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Website lead capture failed";

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
