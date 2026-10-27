import { NextRequest, NextResponse } from "next/server";

import { secretMatches } from "@/lib/security/machine-bearer-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isTrackingOriginAllowed,
  trackingCorsHeaders,
} from "@/lib/tracking/server";

const MAX_IDENTIFY_BYTES = 8_000;

class PublicRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

  if (!secretMatches(supplied, expected)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: cors },
    );
  }

  const declared = declaredContentLength(request);
  if (declared !== null && declared > MAX_IDENTIFY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Payload too large" },
      { status: 413, headers: cors },
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_IDENTIFY_BYTES);
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

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { ok: false, error: "Invalid identification payload" },
      { status: 400, headers: cors },
    );
  }

  const input = body as Record<string, unknown>;
  const leadId = cleanText(input.leadId, 100);
  const visitorId = cleanText(input.anonymousVisitorId, 180);
  const sessionKey = cleanText(input.sessionKey, 180);

  if (!leadId || !visitorId || !sessionKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "leadId, anonymousVisitorId and sessionKey are required.",
      },
      { status: 400, headers: cors },
    );
  }

  try {
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
      return NextResponse.json(
        { ok: false, error: "Lead could not be resolved" },
        { status: 400, headers: cors },
      );
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
    console.error("Legacy lead identification failed.", error);
    return NextResponse.json(
      { ok: false, error: "Lead identification failed" },
      { status: 500, headers: cors },
    );
  }
}
