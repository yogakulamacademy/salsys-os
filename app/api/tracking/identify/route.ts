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

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET() {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null;

  return NextResponse.json(
    {
      ok: Boolean(commitSha),
      commit_sha: commitSha,
    },
    {
      status: commitSha ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
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
   * Legacy compatibility endpoint for trusted server-to-server identification.
   * New integrations should use /api/events/identify/v1. Both routes share the
   * same atomic exact-session database boundary.
   */
  if (origin && !isTrackingOriginAllowed(origin)) {
    return NextResponse.json(
      { ok: false, error: "Origin not allowed" },
      { status: 403, headers: cors },
    );
  }

  const expected = process.env.TRACKING_INGEST_SECRET;
  const supplied = request.headers.get("x-tracking-secret");

  if (!expected || !supplied || supplied !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: cors },
    );
  }

  try {
    const length = Number(request.headers.get("content-length") || "0");
    if (length > 8_000) {
      return NextResponse.json(
        { ok: false, error: "Payload too large" },
        { status: 413, headers: cors },
      );
    }

    const body = await request.json();
    const leadId = cleanText(body.leadId, 100);
    const visitorId = cleanText(body.anonymousVisitorId, 180);
    const sessionKey = cleanText(body.sessionKey, 180);

    if (!leadId || !visitorId || !sessionKey) {
      throw new Error(
        "leadId, anonymousVisitorId and sessionKey are required.",
      );
    }

    const supabase = createAdminClient();

    /*
     * Resolve organization from the authoritative lead row. The client never
     * supplies an organization ID on this compatibility route.
     */
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id,organization_id")
      .eq("id", leadId)
      .maybeSingle();

    if (leadError) throw leadError;
    if (!lead?.organization_id) {
      throw new Error("Lead organization could not be resolved.");
    }

    const { data, error } = await supabase.rpc(
      "attach_exact_session_identity_v1",
      {
        p_organization_id: lead.organization_id,
        p_lead_id: leadId,
        p_anonymous_visitor_id: visitorId,
        p_session_key: sessionKey,
        p_source_system: "tracking-identify",
        p_metadata: {
          compatibility_route: true,
        },
      },
    );

    if (error) throw error;

    const result = objectValue(data);
    if (result.ok !== true) {
      throw new Error("Atomic identity handoff did not complete.");
    }

    return NextResponse.json(result, { headers: cors });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lead identification failed";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: cors },
    );
  }
}
