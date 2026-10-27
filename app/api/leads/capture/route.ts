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

const MAX_CAPTURE_BYTES = 48_000;

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

  return { preferredLocation, preferredMode };
}

function getLeadOrigin(formName?: string | null) {
  const name = (formName || "").toLowerCase();
  if (name.includes("contact")) return "Website Contact Form";
  if (name.includes("brochure") || name.includes("leadpopup")) {
    return "Website Brochure Form";
  }
  if (name.includes("reservation") || name.includes("booking")) {
    return "Website Reservation Form";
  }
  if (name.includes("enroll")) return "Website Enrollment Form";
  return "Website";
}

function metadataValue(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function metadataNumber(metadata: unknown, key: string): number | null {
  const value = metadataValue(metadata, key);
  if (!value) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSiteHostname(site: string | null | undefined) {
  const value = site?.trim();
  if (!value) return null;

  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
      ? value
      : `https://${value}`;
    const hostname = new URL(candidate).hostname
      .trim()
      .toLowerCase()
      .replace(/\.$/, "");
    return hostname || null;
  } catch {
    return null;
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...trackingCorsHeaders(request.headers.get("origin")),
      "Access-Control-Allow-Headers": "Content-Type, X-Website-Secret",
    },
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const cors = {
    ...trackingCorsHeaders(origin),
    "Access-Control-Allow-Headers": "Content-Type, X-Website-Secret",
  };

  const suppliedSalsysSecret = request.headers.get("x-salsys-secret");
  const hasSalsysCredential = suppliedSalsysSecret !== null;
  const salsysSecret = suppliedSalsysSecret?.trim() ?? "";

  if (!hasSalsysCredential) {
    if (origin && !isTrackingOriginAllowed(origin)) {
      return NextResponse.json(
        { ok: false, error: "Origin not allowed" },
        { status: 403, headers: cors },
      );
    }

    if (!isWebsiteCaptureAuthorized(request.headers.get("x-website-secret"))) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401, headers: cors },
      );
    }
  }

  const declared = declaredContentLength(request);
  if (declared !== null && declared > MAX_CAPTURE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Payload too large" },
      { status: 413, headers: cors },
    );
  }

  let raw: unknown;
  try {
    raw = await readBoundedJson(request, MAX_CAPTURE_BYTES);
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

  let payload: ReturnType<typeof sanitizeWebsiteLeadPayload>;
  try {
    payload = sanitizeWebsiteLeadPayload(raw);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid lead payload" },
      { status: 400, headers: cors },
    );
  }

  try {
    const supabase = createAdminClient();
    let credentialOrganizationId: string | null = null;

    if (hasSalsysCredential) {
      const hostname = normalizeSiteHostname(payload.site);
      const { data: credentialData, error: credentialError } = await supabase.rpc(
        "validate_integration_api_secret",
        {
          p_secret_key: salsysSecret,
          p_required_scope: "leads:write",
          p_hostname: hostname,
        },
      );

      if (credentialError) {
        console.error("Salsys credential validation failed:", credentialError);
        return NextResponse.json(
          { ok: false, error: "Credential validation failed" },
          { status: 500, headers: cors },
        );
      }

      const credential = Array.isArray(credentialData)
        ? credentialData[0]
        : credentialData;

      credentialOrganizationId =
        credential &&
        typeof credential === "object" &&
        "organization_id" in credential
          ? String(
              (credential as Record<string, unknown>).organization_id ?? "",
            ) || null
          : null;

      if (!credentialOrganizationId) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized" },
          { status: 401, headers: cors },
        );
      }
    }

    const ingestArgs = {
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
        capture_auth_mode: hasSalsysCredential
          ? "salsys_api_key"
          : "legacy_website_secret",
      },
    };

    const { data, error } = credentialOrganizationId
      ? await supabase.rpc("ingest_website_lead_for_organization", {
          p_organization_id: credentialOrganizationId,
          ...ingestArgs,
        })
      : await supabase.rpc("ingest_website_lead", ingestArgs);

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    const leadId =
      result && typeof result === "object"
        ? (result as Record<string, unknown>).lead_id
        : null;
    const organizationId =
      result && typeof result === "object"
        ? (result as Record<string, unknown>).organization_id
        : null;

    if (!leadId || typeof leadId !== "string") {
      return NextResponse.json(data ?? { ok: true }, { headers: cors });
    }

    if (!organizationId || typeof organizationId !== "string") {
      console.error("Website lead ingestion succeeded without organization_id.");
      return NextResponse.json(data ?? { ok: true }, { headers: cors });
    }

    let session: Record<string, any> | null = null;
    if (payload.sessionKey) {
      const { data: sessionData, error: sessionError } = await supabase
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
        console.error("Lead enrichment session lookup failed:", sessionError);
      } else {
        session = sessionData;
      }
    }

    const visitorId =
      payload.anonymousVisitorId ?? session?.anonymous_visitor_id ?? null;
    const resolvedSessionKey =
      payload.sessionKey ?? session?.session_key ?? null;

    let identityLinked = false;
    const sessionsLinked = Boolean(session?.id && session?.lead_id === leadId);
    let touchpointsLinked = false;
    const identityConflict = false;

    if (visitorId && resolvedSessionKey) {
      const { data: identityRow, error: identityCheckError } = await supabase
        .from("visitor_identity_links")
        .select("lead_id, last_session_key")
        .eq("organization_id", organizationId)
        .eq("anonymous_visitor_id", visitorId)
        .maybeSingle();

      if (identityCheckError) {
        console.error("Visitor identity verification failed:", identityCheckError);
      } else {
        identityLinked =
          identityRow?.lead_id === leadId &&
          identityRow?.last_session_key === resolvedSessionKey;
      }
    }

    if (session?.id) {
      const { count: linkedTouchpointCount, error: touchpointCheckError } =
        await supabase
          .from("touchpoints")
          .select("id", { count: "exact", head: true })
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

    const inferred = inferCoursePreferences(payload.courseCode);
    const preferredLocation =
      payload.preferredLocation ?? inferred.preferredLocation;
    const preferredMode = payload.preferredMode ?? inferred.preferredMode;
    const preferredMonth =
      payload.preferredMonth ?? metadataValue(payload.metadata, "preferred_month");
    const potentialValue = metadataNumber(payload.metadata, "potential_value");
    const potentialCurrency = metadataValue(
      payload.metadata,
      "potential_currency",
    );

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

    const leadUpdate: Record<string, unknown> = {
      preferred_location: preferredLocation ?? null,
      preferred_month: preferredMonth ?? null,
      preferred_mode: preferredMode ?? null,
      potential_value: potentialValue,
      potential_currency: potentialCurrency,
      geo_country: session?.geo_country ?? null,
      geo_region: session?.geo_region ?? null,
      geo_city: session?.geo_city ?? null,
      geo_timezone: session?.geo_timezone ?? null,
      landing_page: session?.landing_page ?? null,
      lead_origin: getLeadOrigin(payload.formName),
      first_touch_source: firstSource,
      first_touch_medium: firstMedium,
      first_touch_campaign: firstCampaign,
      last_touch_source: lastSource,
      last_touch_medium: lastMedium,
      last_touch_campaign: lastCampaign,
    };

    const { error: leadUpdateError } = await supabase
      .from("leads")
      .update(leadUpdate)
      .eq("organization_id", organizationId)
      .eq("id", leadId);

    if (leadUpdateError) {
      console.error("Lead enrichment update failed:", leadUpdateError);
    }

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
      { headers: cors },
    );
  } catch (error) {
    console.error("Website lead capture failed.", error);
    return NextResponse.json(
      { ok: false, error: "Website lead capture failed" },
      { status: 500, headers: cors },
    );
  }
}
