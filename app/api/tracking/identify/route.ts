import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  authenticateServerTrackingSource,
  consumeTrackingRateLimit,
} from "@/lib/tracking/runtime";

const LEGACY_TRACKING_ORGANIZATION_SLUG = "yogakulam-academy";

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  return authorization.slice(7).trim() || null;
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function POST(request: NextRequest) {
  const sourceKey = request.headers.get("x-salsys-source-key");
  const bearer = bearerToken(request);
  const source = await authenticateServerTrackingSource(sourceKey, bearer);

  const legacyExpected = process.env.TRACKING_INGEST_SECRET?.trim() ?? "";
  const legacySupplied = request.headers.get("x-tracking-secret")?.trim() ?? "";
  const legacyAuthorized =
    !sourceKey &&
    !bearer &&
    Boolean(
      legacyExpected &&
        legacySupplied &&
        constantTimeEqual(legacySupplied, legacyExpected),
    );

  if (!source && !legacyAuthorized) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized tracking source",
      },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  let rate:
    | {
        allowed: boolean;
        count: number;
        limit: number;
        remaining: number;
        reason: string | null;
      }
    | null = null;

  if (source) {
    rate = await consumeTrackingRateLimit(source);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": "60",
            "X-RateLimit-Limit": String(rate.limit),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }
  }

  try {
    const length = Number(request.headers.get("content-length") || "0");
    const maxPayload = source ? Math.min(source.maxPayloadBytes, 8_000) : 8_000;

    if (length > maxPayload) {
      return NextResponse.json(
        { ok: false, error: "Payload too large" },
        { status: 413, headers: { "Cache-Control": "no-store" } },
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

    if (source && source.organizationId !== organizationId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Tracking source does not belong to the lead organization.",
        },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    if (legacyAuthorized) {
      /*
       * TRACKING_INGEST_SECRET is a backwards-compatibility credential for
       * the original Yogakulam server-to-server integration. It must never
       * become a global multi-tenant credential. Resolve that legacy tenant
       * server-side and reject lead IDs from every other organization.
       */
      const { data: legacyOrganization, error: legacyOrganizationError } =
        await supabase
          .from("organizations")
          .select("id")
          .eq("slug", LEGACY_TRACKING_ORGANIZATION_SLUG)
          .eq("status", "active")
          .maybeSingle();

      if (legacyOrganizationError || !legacyOrganization?.id) {
        throw new Error("Legacy tracking organization is unavailable.");
      }

      if (legacyOrganization.id !== organizationId) {
        return NextResponse.json(
          {
            ok: false,
            error: "Unauthorized tracking source",
          },
          {
            status: 403,
            headers: { "Cache-Control": "no-store" },
          },
        );
      }
    }

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

    const { error: linkError } = await supabase
      .from("visitor_identity_links")
      .upsert(
        {
          organization_id: organizationId,
          anonymous_visitor_id: visitorId,
          lead_id: leadId,
          last_session_key: sessionKey,
          source_system: source?.sourceSystem || "tracking-identify-legacy",
          linked_at: new Date().toISOString(),
          metadata: {
            identity_scope: "exact_session",
            tracking_source_id: source?.id || null,
            legacy_auth: legacyAuthorized,
          },
        },
        {
          onConflict: "organization_id,anonymous_visitor_id",
        },
      );

    if (linkError) throw linkError;

    const { data: attribution, error: attachError } = await supabase.rpc(
      "attach_visitor_journey_to_lead",
      {
        p_lead_id: leadId,
        p_anonymous_visitor_id: visitorId,
        p_session_key: sessionKey,
      },
    );

    if (attachError) throw attachError;

    const { error: personError } = await supabase.rpc(
      "resolve_person_for_lead",
      {
        p_lead_id: leadId,
        p_source_system: source?.sourceSystem || "tracking-identify-legacy",
      },
    );

    if (personError) throw personError;

    return NextResponse.json(
      {
        ok: true,
        attribution,
        source_auth: source ? "tracking_source" : "legacy_secret",
      },
      {
        headers: {
          "Cache-Control": "no-store",
          ...(rate
            ? {
                "X-RateLimit-Limit": String(rate.limit),
                "X-RateLimit-Remaining": String(rate.remaining),
              }
            : {}),
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lead identification failed";

    return NextResponse.json(
      { ok: false, error: message },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
