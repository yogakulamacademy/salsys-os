import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  consumeTrackingRateLimit,
  corsHeadersForTrackingOrigin,
  resolveBrowserTrackingSource,
} from '@/lib/tracking/runtime';
import { sanitizeWebsiteLeadPayload } from '@/lib/website-leads/server';

export const dynamic = 'force-dynamic';

class PublicRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

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

function declaredContentLength(request: NextRequest) {
  const header = request.headers.get('content-length');
  if (!header) return null;

  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function readBoundedJson(request: NextRequest, maxBytes: number) {
  const declared = declaredContentLength(request);
  if (declared !== null && declared > maxBytes) {
    throw new PublicRequestError('Payload too large.', 413);
  }

  if (!request.body) {
    throw new PublicRequestError('Invalid JSON payload.', 400);
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
        throw new PublicRequestError('Payload too large.', 413);
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
    throw new PublicRequestError('Invalid JSON payload.', 400);
  }
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function metadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  return stringValue((metadata as Record<string, unknown>)[key]);
}

function touchValue(touch: unknown, key: string) {
  if (!touch || typeof touch !== 'object' || Array.isArray(touch)) return null;
  return stringValue((touch as Record<string, unknown>)[key]);
}

function leadOriginForForm(formName: string | null | undefined) {
  const name = String(formName ?? '').trim().toLowerCase();

  if (name.includes('contact')) return 'Website Contact Form';
  if (name.includes('brochure') || name.includes('leadpopup')) {
    return 'Website Brochure Form';
  }
  if (name.includes('reservation') || name.includes('booking')) {
    return 'Website Reservation Form';
  }
  if (name.includes('enroll') || name.includes('enrol')) {
    return 'Website Enrollment Form';
  }

  return 'Website';
}

function absoluteLandingPage(
  hostname: string | null | undefined,
  value: string | null,
) {
  if (!value || !hostname) return null;

  try {
    return new URL(value, `https://${hostname}`).toString();
  } catch {
    return null;
  }
}

function normalizeCourseTrackingValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function resolveCourseCode(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  value: string | null | undefined,
) {
  const raw = stringValue(value);
  if (!raw) {
    return { raw: null, code: null, matchedBy: null as string | null };
  }

  const { data: codeRows, error: codeError } = await admin
    .from('courses')
    .select('id,code')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .in('code', [raw, raw.toUpperCase()])
    .limit(1);

  if (codeError) {
    console.error('Course code lookup failed:', codeError);
  } else if (Array.isArray(codeRows) && codeRows[0]?.code) {
    return {
      raw,
      code: String(codeRows[0].code),
      matchedBy: 'course_code',
    };
  }

  const normalized = normalizeCourseTrackingValue(raw);
  const { data: aliasRows, error: aliasError } = await admin
    .from('course_tracking_aliases')
    .select('course_id,alias_type,priority')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .eq('normalized_alias_value', normalized)
    .order('priority', { ascending: false })
    .limit(1);

  if (aliasError) {
    console.error('Course alias lookup failed:', aliasError);
    return { raw, code: null, matchedBy: null as string | null };
  }

  const alias = Array.isArray(aliasRows) ? aliasRows[0] : null;
  const courseId = stringValue(alias?.course_id);
  if (!courseId) {
    return { raw, code: null, matchedBy: null as string | null };
  }

  const { data: course, error: courseError } = await admin
    .from('courses')
    .select('code')
    .eq('organization_id', organizationId)
    .eq('id', courseId)
    .eq('active', true)
    .maybeSingle();

  if (courseError) {
    console.error('Resolved course lookup failed:', courseError);
    return { raw, code: null, matchedBy: null as string | null };
  }

  return {
    raw,
    code: stringValue(course?.code),
    matchedBy: course?.code
      ? `course_alias:${stringValue(alias?.alias_type) ?? 'unknown'}`
      : null,
  };
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

  const maxBytes = Math.min(source.maxPayloadBytes, 32_000);
  const declared = declaredContentLength(request);

  if (declared !== null && declared > maxBytes) {
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

  let raw: unknown;
  try {
    raw = await readBoundedJson(request, maxBytes);
  } catch (error) {
    const requestError =
      error instanceof PublicRequestError
        ? error
        : new PublicRequestError('Invalid JSON payload.', 400);

    return json(
      {
        ok: false,
        accepted: false,
        error: requestError.message,
      },
      requestError.status,
      {
        ...cors,
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }

  let payload: ReturnType<typeof sanitizeWebsiteLeadPayload>;
  try {
    payload = sanitizeWebsiteLeadPayload(raw);
  } catch {
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Invalid lead payload.',
      },
      400,
      {
        ...cors,
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }

  try {
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

    const courseResolution = await resolveCourseCode(
      admin,
      source.organizationId,
      payload.courseCode,
    );

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
        p_course_code: courseResolution.code ?? payload.courseCode ?? null,
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
          course_capture_value: courseResolution.raw,
          course_resolved_code: courseResolution.code,
          course_resolution: courseResolution.matchedBy,
        },
      },
    );

    if (error) throw new Error(error.message);

    const result = Array.isArray(data) ? data[0] : data;
    const row =
      result && typeof result === 'object' && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : {};

    const leadId = stringValue(row.lead_id);
    let sourceEnriched = false;

    /*
     * Universal Lead Sources V1
     *
     * The proven ingest RPC owns lead creation + identity resolution. The
     * public browser adapter additionally projects first-party journey context
     * onto the CRM lead so source information is immediately usable in Leads,
     * Person 360, funnels and later revenue attribution.
     *
     * First-touch fields are immutable once known. Repeat enquiries refresh
     * only last-touch fields. This prevents a later direct visit from erasing
     * the lead's original acquisition source.
     */
    if (leadId) {
      let session: Record<string, unknown> | null = null;

      if (payload.sessionKey) {
        const { data: sessionData, error: sessionError } = await admin
          .from('web_sessions')
          .select(
            'source,medium,campaign_name,landing_page,referrer,utm_source,utm_medium,utm_campaign',
          )
          .eq('organization_id', source.organizationId)
          .eq('session_key', payload.sessionKey)
          .maybeSingle();

        if (sessionError) {
          console.error('Universal lead source session lookup failed:', sessionError);
        } else {
          session = sessionData;
        }
      }

      const firstSource =
        touchValue(payload.firstTouch, 'source') ??
        stringValue(session?.utm_source) ??
        stringValue(session?.source);
      const firstMedium =
        touchValue(payload.firstTouch, 'medium') ??
        stringValue(session?.utm_medium) ??
        stringValue(session?.medium);
      const firstCampaign =
        touchValue(payload.firstTouch, 'campaign') ??
        stringValue(session?.utm_campaign) ??
        stringValue(session?.campaign_name);

      const lastSource =
        touchValue(payload.sessionTouch, 'source') ??
        stringValue(session?.utm_source) ??
        stringValue(session?.source) ??
        firstSource;
      const lastMedium =
        touchValue(payload.sessionTouch, 'medium') ??
        stringValue(session?.utm_medium) ??
        stringValue(session?.medium) ??
        firstMedium;
      const lastCampaign =
        touchValue(payload.sessionTouch, 'campaign') ??
        stringValue(session?.utm_campaign) ??
        stringValue(session?.campaign_name) ??
        firstCampaign;

      const pagePath = metadataValue(payload.metadata, 'page_path');
      const landingPage =
        stringValue(session?.landing_page) ??
        absoluteLandingPage(source.hostname, pagePath);

      const { data: currentLead, error: currentLeadError } = await admin
        .from('leads')
        .select(
          'landing_page,lead_origin,first_touch_source,first_touch_medium,first_touch_campaign,last_touch_source,last_touch_medium,last_touch_campaign',
        )
        .eq('organization_id', source.organizationId)
        .eq('id', leadId)
        .maybeSingle();

      if (currentLeadError) {
        console.error('Universal lead source lead lookup failed:', currentLeadError);
      } else if (currentLead) {
        const { error: sourceUpdateError } = await admin
          .from('leads')
          .update({
            landing_page: currentLead.landing_page ?? landingPage,
            lead_origin:
              currentLead.lead_origin ?? leadOriginForForm(payload.formName),
            first_touch_source:
              currentLead.first_touch_source ?? firstSource,
            first_touch_medium:
              currentLead.first_touch_medium ?? firstMedium,
            first_touch_campaign:
              currentLead.first_touch_campaign ?? firstCampaign,
            last_touch_source:
              lastSource ??
              currentLead.last_touch_source ??
              currentLead.first_touch_source ??
              firstSource,
            last_touch_medium:
              lastMedium ??
              currentLead.last_touch_medium ??
              currentLead.first_touch_medium ??
              firstMedium,
            last_touch_campaign:
              lastCampaign ??
              currentLead.last_touch_campaign ??
              currentLead.first_touch_campaign ??
              firstCampaign,
          })
          .eq('organization_id', source.organizationId)
          .eq('id', leadId);

        if (sourceUpdateError) {
          console.error('Universal lead source enrichment failed:', sourceUpdateError);
        } else {
          sourceEnriched = true;
        }
      }
    }

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
        source_enriched: sourceEnriched,
        course_capture_value: courseResolution.raw,
        course_resolved_code: courseResolution.code,
        course_resolution: courseResolution.matchedBy,
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
    console.error('Browser lead capture failed.', error);
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Browser lead capture failed.',
      },
      500,
      {
        ...cors,
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }
}
