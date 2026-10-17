import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeTrackingConsentPayload } from "@/lib/tracking/server";
import {
  consumeTrackingRateLimit,
  corsHeadersForTrackingOrigin,
  resolveBrowserTrackingSource,
} from "@/lib/tracking/runtime";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  const source = await resolveBrowserTrackingSource(origin);

  return new NextResponse(null, {
    status: source ? 204 : 403,
    headers: corsHeadersForTrackingOrigin(origin, Boolean(source)),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const source = await resolveBrowserTrackingSource(origin);
  const cors = corsHeadersForTrackingOrigin(origin, Boolean(source));

  if (!source || !source.hostname) {
    return NextResponse.json(
      {
        ok: false,
        error: "Tracking source is not registered or active.",
      },
      {
        status: 403,
        headers: cors,
      },
    );
  }

  const length = Number(request.headers.get("content-length") || "0");
  const maxPayload = Math.min(source.maxPayloadBytes, 16_000);

  if (length > maxPayload) {
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

  const rate = await consumeTrackingRateLimit(source);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "Rate limit exceeded",
      },
      {
        status: 429,
        headers: {
          ...cors,
          "Retry-After": "60",
          "X-RateLimit-Limit": String(rate.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  try {
    const payload = sanitizeTrackingConsentPayload(await request.json());
    const supabase = createAdminClient();
    const occurredAt = payload.occurredAt || new Date().toISOString();

    const { data: consentResult, error: consentError } = await supabase.rpc(
      "ingest_tracking_consent_event",
      {
        p_organization_id: source.organizationId,
        p_source_event_id: payload.eventId,
        p_occurred_at: occurredAt,
        p_anonymous_visitor_id: payload.anonymousVisitorId || null,
        p_session_key: payload.sessionKey || null,
        p_site: source.hostname,
        p_consent_analytics: payload.consent.analytics,
        p_consent_ad_user_data: payload.consent.adUserData,
        p_consent_ad_personalization: payload.consent.adPersonalization,
        p_consent_marketing: payload.consent.marketing,
        p_consent_mode: payload.consent.mode || null,
        p_consent_source: payload.consent.source || "yk_tracker",
        p_raw_event_id: null,
        p_metadata: {
          adapter: "app/api/tracking/consent",
          tracking_source_id: source.id,
          dynamic_source_resolution: true,
        },
      },
    );

    if (consentError) throw consentError;

    return NextResponse.json(
      {
        ok: true,
        created: Boolean(consentResult?.created),
      },
      {
        status: 202,
        headers: {
          ...cors,
          "X-RateLimit-Limit": String(rate.limit),
          "X-RateLimit-Remaining": String(rate.remaining),
        },
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
        headers: {
          ...cors,
          "X-RateLimit-Limit": String(rate.limit),
          "X-RateLimit-Remaining": String(rate.remaining),
        },
      },
    );
  }
}
