import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveBrowserTrackingCredential,
  trackingOriginHostname,
} from "@/lib/tracking/browser-auth";
import { ingestBrowserTrackingEvent } from "@/lib/tracking/ingest-browser-event";
import {
  isTrackingOriginAllowed,
  sanitizeTrackingPayload,
  trackingCorsHeaders,
} from "@/lib/tracking/server";

const MAX_BATCH_SIZE = 20;
const MAX_PAYLOAD_BYTES = 128_000;
const CURRENT_SCHEMA_VERSION = 1;

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

function browserTrackingCorsHeaders(origin: string | null) {
  const legacy = trackingCorsHeaders(origin);

  return {
    ...legacy,
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers":
      "Content-Type, X-Salsys-Key, X-Salsys-SDK-Version, X-Salsys-Schema-Version",
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

function parseSchemaVersion(request: NextRequest) {
  const value = Number(
    request.headers.get("x-salsys-schema-version") || CURRENT_SCHEMA_VERSION,
  );

  return Number.isInteger(value) && value > 0 && value <= CURRENT_SCHEMA_VERSION
    ? value
    : null;
}

function parseSdkVersion(request: NextRequest) {
  const value = request.headers.get("x-salsys-sdk-version")?.trim();
  return value ? value.slice(0, 80) : null;
}

function getRawEvents(body: unknown): unknown[] {
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Array.isArray((body as Record<string, unknown>).events)
  ) {
    return (body as { events: unknown[] }).events;
  }

  return [body];
}

function candidateEventId(rawEvent: unknown, index: number) {
  if (
    rawEvent &&
    typeof rawEvent === "object" &&
    !Array.isArray(rawEvent)
  ) {
    const value = (rawEvent as Record<string, unknown>).eventId;

    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, 100);
    }
  }

  return `batch_item_${index + 1}`;
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");

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

    if (length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Payload too large" },
        { status: 413, headers: cors },
      );
    }

    const schemaVersion = parseSchemaVersion(request);

    if (!schemaVersion) {
      return NextResponse.json(
        { ok: false, error: "Unsupported tracking schema version." },
        { status: 400, headers: cors },
      );
    }

    const requestBody = await request.json();
    const rawEvents = getRawEvents(requestBody);

    if (rawEvents.length === 0 || rawEvents.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        {
          ok: false,
          error: `Tracking batch must contain between 1 and ${MAX_BATCH_SIZE} events.`,
        },
        { status: 400, headers: cors },
      );
    }

    const supabase = createAdminClient();
    const geo = getRequestGeo(request);
    const originHostname = trackingOriginHostname(origin);
    const sdkVersion = parseSdkVersion(request);

    if (!originHostname) {
      return NextResponse.json(
        { ok: false, error: "Unable to resolve tracking hostname." },
        { status: 403, headers: cors },
      );
    }

    let organizationId: string;
    let trustedSite: string;
    let credentialId: string | null = null;
    let credentialPublicKey: string | null = null;

    if (browserPublicKey) {
      const credential = await resolveBrowserTrackingCredential({
        supabase,
        publicKey: browserPublicKey,
        origin,
        requiredScope: "events:write",
      });

      if (!credential) {
        return NextResponse.json(
          { ok: false, error: "Tracking key is invalid for this website." },
          { status: 403, headers: cors },
        );
      }

      organizationId = credential.organizationId;
      trustedSite = credential.hostname;
      credentialId = credential.credentialId;
      credentialPublicKey = credential.publicKey;
    } else {
      // Temporary compatibility path for the current Yogakulam install.
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

    const results: Array<{
      eventId: string;
      ok: boolean;
      retryable: boolean;
      error?: string;
    }> = [];

    for (let index = 0; index < rawEvents.length; index += 1) {
      const rawEvent = rawEvents[index];
      let payload;

      try {
        payload = sanitizeTrackingPayload(rawEvent);
      } catch (error) {
        results.push({
          eventId: candidateEventId(rawEvent, index),
          ok: false,
          retryable: false,
          error:
            error instanceof Error
              ? error.message
              : "Invalid tracking event payload",
        });
        continue;
      }

      try {
        await ingestBrowserTrackingEvent({
          supabase,
          payload,
          organizationId,
          trustedSite,
          originHostname,
          geo,
          userAgent: request.headers.get("user-agent"),
          credentialId,
          credentialPublicKey,
          schemaVersion,
          sdkVersion,
        });

        results.push({
          eventId: payload.eventId,
          ok: true,
          retryable: false,
        });
      } catch (error) {
        results.push({
          eventId: payload.eventId,
          ok: false,
          retryable: true,
          error:
            error instanceof Error
              ? error.message
              : "Tracking ingest failed",
        });
      }
    }

    const accepted = results.filter((result) => result.ok).length;
    const failed = results.length - accepted;
    const retryableFailed = results.filter(
      (result) => !result.ok && result.retryable,
    ).length;
    const permanentFailed = failed - retryableFailed;

    /*
     * Retryable failure wins for the whole transport batch.
     *
     * The browser will retry the same event IDs. raw_events has a tenant +
     * source + source_event_id uniqueness guarantee, so already-accepted items
     * are safe to replay while the transient item is retried.
     *
     * If the only failures are permanent validation failures, 200 is returned
     * when at least one event was accepted so the browser can discard that
     * batch instead of retrying malformed local data forever.
     */
    const status =
      retryableFailed > 0
        ? 503
        : accepted > 0
          ? 200
          : 400;

    return NextResponse.json(
      {
        ok: retryableFailed === 0 && accepted > 0,
        batch: rawEvents.length > 1,
        accepted,
        failed,
        retryableFailed,
        permanentFailed,
        results,
      },
      {
        status,
        headers: cors,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tracking ingest failed";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: cors },
    );
  }
}
