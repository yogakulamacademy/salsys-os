import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveBrowserTrackingCredential,
  trackingOriginHostname,
} from "@/lib/tracking/browser-auth";
import {
  isTrackingOriginAllowed,
  sanitizeTrackingConsentPayload,
  trackingCorsHeaders,
} from "@/lib/tracking/server";

function browserTrackingCorsHeaders(origin: string | null) {
  const legacy = trackingCorsHeaders(origin);

  return {
    ...legacy,
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "Content-Type, X-Salsys-Key",
    Vary: "Origin",
  };
}

function getBrowserPublicKey(request: NextRequest) {
  return (
    request.headers.get("x-salsys-key")?.trim() ||
    request.nextUrl.searchParams.get("salsys_key")?.trim() ||
    null
  );
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");

  // Preflight is intentionally permissive for the requesting origin. The POST
  // below performs the real publishable-key + hostname authorization.
  return new NextResponse(null, {
    status: 204,
    headers: browserTrackingCorsHeaders(origin),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const cors = browserTrackingCorsHeaders(origin);
  const browserPublicKey = getBrowserPublicKey(request);

  try {
    const length = Number(request.headers.get("content-length") || "0");

    if (length > 16_000) {
      return NextResponse.json(
        { ok: false, error: "Payload too large" },
        { status: 413, headers: cors },
      );
    }

    const payload = sanitizeTrackingConsentPayload(await request.json());
    const originHostname = trackingOriginHostname(origin);

    if (!originHostname) {
      return NextResponse.json(
        { ok: false, error: "Unable to resolve tracking hostname." },
        { status: 403, headers: cors },
      );
    }

    const supabase = createAdminClient();

    let organizationId: string;
    let trustedSite: string;
    let credentialId: string | null = null;

    if (browserPublicKey) {
      const credential = await resolveBrowserTrackingCredential({
        supabase,
        publicKey: browserPublicKey,
        origin,
        requiredScope: "events:write",
      });

      if (!credential) {
        return NextResponse.json(
          {
            ok: false,
            error: "Tracking key is invalid for this website.",
          },
          { status: 403, headers: cors },
        );
      }

      organizationId = credential.organizationId;
      trustedSite = credential.hostname;
      credentialId = credential.credentialId;
    } else {
      // Temporary compatibility path for the existing Yogakulam tracker.
      if (!isTrackingOriginAllowed(origin)) {
        return NextResponse.json(
          { ok: false, error: "Origin not allowed" },
          { status: 403, headers: cors },
        );
      }

      const { data: organizationSite, error: organizationSiteError } =
        await supabase
          .from("organization_sites")
          .select("organization_id, hostname")
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

      organizationId = organizationSite.organization_id;
      trustedSite = organizationSite.hostname;
    }

    const occurredAt = payload.occurredAt || new Date().toISOString();

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
        p_consent_source:
          payload.consent.source ||
          (credentialId ? "salsys_browser_sdk" : "yk_tracker"),
        p_raw_event_id: null,
        p_metadata: {
          adapter: "app/api/tracking/consent",
          browser_auth: credentialId ? "publishable_key" : "legacy_origin",
          credential_id: credentialId,
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
    const message =
      error instanceof Error
        ? error.message
        : "Tracking consent ingest failed";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: cors },
    );
  }
}
