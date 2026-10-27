import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  isTrackingOriginAllowed,
  sanitizeTrackingConsentPayload,
  trackingCorsHeaders,
} from "@/lib/tracking/server";

const MAX_CONSENT_BYTES = 16_000;

class PublicRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
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
      { ok: false, error: "Origin not allowed" },
      { status: 403, headers: cors },
    );
  }

  const declared = declaredContentLength(request);
  if (declared !== null && declared > MAX_CONSENT_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Payload too large" },
      { status: 413, headers: cors },
    );
  }

  let raw: unknown;
  try {
    raw = await readBoundedJson(request, MAX_CONSENT_BYTES);
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

  let payload: ReturnType<typeof sanitizeTrackingConsentPayload>;
  try {
    payload = sanitizeTrackingConsentPayload(raw);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid tracking consent payload" },
      { status: 400, headers: cors },
    );
  }

  const originHostname = getOriginHostname(origin);
  if (!originHostname) {
    return NextResponse.json(
      { ok: false, error: "Unable to resolve tracking hostname." },
      { status: 403, headers: cors },
    );
  }

  try {
    const supabase = createAdminClient();

    /*
     * Tenant identity is trusted server-side state.
     * organization_id is never accepted from the browser.
     */
    const { data: organizationSite, error: organizationSiteError } =
      await supabase
        .from("organization_sites")
        .select("organization_id,hostname")
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

    const organizationId = organizationSite.organization_id;
    const trustedSite = organizationSite.hostname;
    const occurredAt = payload.occurredAt || new Date().toISOString();

    /*
     * Consent storage remains deliberately separate from analytics event
     * collection. This route stays usable when analytics consent is false and
     * does not persist page, referrer, attribution, UA, advertising IDs,
     * email, phone, or other browser metadata.
     */
    const { data: consentResult, error: consentError } = await supabase.rpc(
      "ingest_tracking_consent_event",
      {
        p_organization_id: organizationId,
        p_source_event_id: payload.eventId,
        p_occurred_at: occurredAt,
        p_anonymous_visitor_id: payload.anonymousVisitorId || null,
        p_session_key: payload.sessionKey || null,
        p_site: trustedSite,
        p_consent_analytics: payload.consent.analytics,
        p_consent_ad_user_data: payload.consent.adUserData,
        p_consent_ad_personalization: payload.consent.adPersonalization,
        p_consent_marketing: payload.consent.marketing,
        p_consent_mode: payload.consent.mode || null,
        p_consent_source: payload.consent.source || "salsys_tracker",
        p_raw_event_id: null,
        p_metadata: {
          adapter: "app/api/tracking/consent",
        },
      },
    );

    if (consentError) throw consentError;

    return NextResponse.json(
      {
        ok: true,
        created: Boolean(consentResult?.created),
      },
      { headers: cors },
    );
  } catch (error) {
    console.error("Tracking consent ingest failed.", error);
    return NextResponse.json(
      { ok: false, error: "Tracking consent ingest failed" },
      { status: 500, headers: cors },
    );
  }
}
