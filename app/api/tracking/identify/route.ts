import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  isTrackingOriginAllowed,
  trackingCorsHeaders,
} from "@/lib/tracking/server";

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
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

  /*
   * This endpoint is designed for server-to-server identification.
   * If an Origin header is present, it must still be on the tracking
   * allowlist. Requests without Origin are authenticated by the
   * server-only tracking secret below.
   */
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

  const expected = process.env.TRACKING_INGEST_SECRET;
  const supplied = request.headers.get("x-tracking-secret");

  if (!expected || !supplied || supplied !== expected) {
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
    const length = Number(request.headers.get("content-length") || "0");

    if (length > 8_000) {
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

    const body = await request.json();

    const leadId = cleanText(body.leadId, 100);
    const visitorId = cleanText(body.anonymousVisitorId, 180);
    const sessionKey = cleanText(body.sessionKey, 180);

    /*
     * Exact-session identity is required.
     *
     * We deliberately do not use the legacy no-session fallback here,
     * because one browser/visitor ID may legitimately be used by more
     * than one person over time.
     */
    if (!leadId || !visitorId || !sessionKey) {
      throw new Error(
        "leadId, anonymousVisitorId and sessionKey are required.",
      );
    }

    const supabase = createAdminClient();

    /*
     * Resolve the authoritative organization from the lead.
     */
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, organization_id")
      .eq("id", leadId)
      .maybeSingle();

    if (leadError) throw leadError;

    if (!lead?.organization_id) {
      throw new Error("Lead organization could not be resolved.");
    }

    const organizationId = lead.organization_id;

    /*
     * Cross-tenant and shared-browser protection.
     *
     * The exact session must already exist inside the same organization
     * as the lead and must belong to the supplied anonymous visitor.
     * This is stronger than trusting a browser ID or Origin alone.
     */
    const { data: session, error: sessionError } = await supabase
      .from("web_sessions")
      .select(
        `
          id,
          organization_id,
          anonymous_visitor_id,
          session_key,
          lead_id
        `,
      )
      .eq("organization_id", organizationId)
      .eq("session_key", sessionKey)
      .eq("anonymous_visitor_id", visitorId)
      .maybeSingle();

    if (sessionError) throw sessionError;

    if (!session) {
      throw new Error(
        "Matching tracking session was not found for this lead organization.",
      );
    }

    /*
     * Keep visitor_identity_links as current-session routing state,
     * not as permanent Person identity.
     */
    const { error: linkError } = await supabase
      .from("visitor_identity_links")
      .upsert(
        {
          organization_id: organizationId,
          anonymous_visitor_id: visitorId,
          lead_id: leadId,
          last_session_key: sessionKey,
          source_system: "tracking-identify",
          linked_at: new Date().toISOString(),
          metadata: {
            identity_scope: "exact_session",
          },
        },
        {
          onConflict: "organization_id,anonymous_visitor_id",
        },
      );

    if (linkError) throw linkError;

    /*
     * Attach only the exact session and its touchpoints to this lead.
     * Historical sessions for the same browser remain untouched.
     */
    const { data: attribution, error: attachError } = await supabase.rpc(
      "attach_visitor_journey_to_lead",
      {
        p_lead_id: leadId,
        p_anonymous_visitor_id: visitorId,
        p_session_key: sessionKey,
      },
    );

    if (attachError) throw attachError;

    /*
     * The session now has an authoritative lead_id. Refresh the canonical
     * Person graph so person_sessions reflects this identification too.
     *
     * resolve_person_for_lead is service-role only; this route uses the
     * server-side admin client intentionally.
     */
    const { error: personError } = await supabase.rpc(
      "resolve_person_for_lead",
      {
        p_lead_id: leadId,
        p_source_system: "tracking-identify",
      },
    );

    if (personError) throw personError;

    return NextResponse.json(
      {
        ok: true,
        attribution,
      },
      {
        headers: cors,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lead identification failed";

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
