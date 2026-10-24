import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  consumeTrackingRateLimit,
  corsHeadersForTrackingOrigin,
  resolveBrowserTrackingSource,
} from '@/lib/tracking/runtime';
import { sanitizeWebsiteLeadPayload } from '@/lib/website-leads/server';

export const dynamic = 'force-dynamic';

function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...headers,
      'Cache-Control': 'no-store',
    },
  });
}

function browserOrigin(request: NextRequest) {
  return request.headers.get('origin')?.trim() || null;
}

function publicSiteId(request: NextRequest) {
  return (
    request.nextUrl.searchParams.get('site_id')?.trim() ||
    request.headers.get('x-salsys-site-id')?.trim() ||
    null
  );
}

function browserGpc(request: NextRequest) {
  return request.headers.get('sec-gpc') === '1';
}

export async function OPTIONS(request: NextRequest) {
  const origin = browserOrigin(request);

  /*
   * CORS preflight is not authorization. Answer it without touching the
   * database so browsers can proceed to POST. The POST handler below still
   * performs the strict public Site ID + registered Origin verification
   * before any lead data is accepted or ingested.
   */
  return new NextResponse(null, {
    status: origin ? 204 : 400,
    headers: corsHeadersForTrackingOrigin(origin, Boolean(origin)),
  });
}

export async function POST(request: NextRequest) {
  const origin = browserOrigin(request);
  const siteId = publicSiteId(request);
  const source = await resolveBrowserTrackingSource(origin, siteId);
  const cors = corsHeadersForTrackingOrigin(origin, Boolean(source));

  if (!source) {
    return json(
      {
        ok: false,
        accepted: false,
        error: siteId
          ? 'Tracking Site ID does not match this browser origin.'
          : 'Unrecognized browser tracking origin.',
      },
      403,
      cors,
    );
  }

  const contentLength = Number(request.headers.get('content-length') || '0');
  const maxBytes = Math.min(source.maxPayloadBytes, 32_000);

  if (contentLength > maxBytes) {
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Payload too large.',
      },
      413,
      cors,
    );
  }

  const rate = await consumeTrackingRateLimit(source);

  if (!rate.allowed) {
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Rate limit exceeded.',
      },
      429,
      {
        ...cors,
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': '0',
        'Retry-After': '60',
      },
    );
  }

  try {
    const payload = sanitizeWebsiteLeadPayload(await request.json());
    const admin = createAdminClient();

    /*
     * Lead capture is a deliberate user submission rather than anonymous
     * analytics. Still run it through the same privacy policy engine so a
     * workspace can block the event when its configured policy requires it.
     */
    const { data: privacyGate, error: privacyGateError } = await admin.rpc(
      'privacy_gate_tracking_event_v1',
      {
        p_organization_id: source.organizationId,
        p_event_name: 'lead.submitted',
        p_person_id: null,
        p_lead_id: null,
        p_anonymous_visitor_id: payload.anonymousVisitorId ?? null,
        p_gpc: browserGpc(request),
      },
    );

    if (privacyGateError) {
      throw new Error(`Privacy gate failed: ${privacyGateError.message}`);
    }

    if (!privacyGate?.allowed) {
      return json(
        {
          ok: true,
          accepted: false,
          privacy_blocked: true,
          reason: privacyGate?.reason ?? 'privacy_policy_blocked',
          purpose: privacyGate?.mapped_purpose ?? privacyGate?.purpose ?? null,
        },
        200,
        {
          ...cors,
          'X-RateLimit-Limit': String(rate.limit),
          'X-RateLimit-Remaining': String(rate.remaining),
        },
      );
    }

    const { data, error } = await admin.rpc(
      'ingest_website_lead_for_organization',
      {
        p_organization_id: source.organizationId,
        p_external_event_id: payload.externalEventId,
        p_site: source.hostname,
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
          capture_auth_mode: 'public_site_id_origin_bound',
          capture_adapter: 'app/api/leads/browser/v1',
          organization_site_id: source.organizationSiteId,
          public_site_id: source.publicSiteId,
          tracking_source_id: source.id,
          tracking_source_key: source.sourceKey,
          request_user_agent: request.headers.get('user-agent'),
          privacy_gate_reason: privacyGate?.reason ?? null,
          privacy_purpose:
            privacyGate?.mapped_purpose ?? privacyGate?.purpose ?? null,
        },
      },
    );

    if (error) throw new Error(error.message);

    const result = Array.isArray(data) ? data[0] : data;
    const row =
      result && typeof result === 'object' && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : {};

    return json(
      {
        ok: true,
        accepted: true,
        privacy_blocked: false,
        lead_id: row.lead_id ?? null,
        organization_id: row.organization_id ?? source.organizationId,
        created: row.created ?? null,
        matched_existing: row.matched_existing ?? null,
        identity_linked: row.identity_linked ?? null,
        sessions_linked: row.sessions_linked ?? null,
        touchpoints_linked: row.touchpoints_linked ?? null,
        site_id: source.publicSiteId,
        site_id_verified: source.siteIdVerified,
      },
      202,
      {
        ...cors,
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  } catch (error) {
    return json(
      {
        ok: false,
        accepted: false,
        error:
          error instanceof Error
            ? error.message
            : 'Browser lead capture failed.',
      },
      400,
      {
        ...cors,
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }
}
