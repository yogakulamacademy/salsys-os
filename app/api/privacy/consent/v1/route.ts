import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  consumeTrackingRateLimit,
  corsHeadersForTrackingOrigin,
  resolveBrowserTrackingSource,
} from '@/lib/tracking/runtime';

export const dynamic = 'force-dynamic';

const ALLOWED_PURPOSES = new Set([
  'analytics',
  'marketing',
  'advertising',
  'sale_sharing',
  'personalization',
]);

const ALLOWED_DECISIONS = new Set([
  'granted',
  'denied',
  'withdrawn',
  'opted_out',
  'limited',
]);

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

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
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

export async function OPTIONS(request: NextRequest) {
  const origin = browserOrigin(request);
  const siteId = publicSiteId(request);
  const source = await resolveBrowserTrackingSource(origin, siteId);

  return new NextResponse(null, {
    status: source ? 204 : 403,
    headers: corsHeadersForTrackingOrigin(origin, Boolean(source)),
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
        error: siteId
          ? 'Tracking Site ID does not match this browser origin.'
          : 'Unrecognized browser tracking origin.',
      },
      403,
      cors,
    );
  }

  const declared = declaredContentLength(request);
  if (declared !== null && declared > source.maxPayloadBytes) {
    return json({ ok: false, error: 'Payload too large.' }, 413, cors);
  }

  const rate = await consumeTrackingRateLimit(source);
  if (!rate.allowed) {
    return json(
      { ok: false, error: 'Rate limit exceeded.' },
      429,
      { ...cors, 'Retry-After': '60' },
    );
  }

  let raw: unknown;
  try {
    raw = await readBoundedJson(request, source.maxPayloadBytes);
  } catch (error) {
    const requestError =
      error instanceof PublicRequestError
        ? error
        : new PublicRequestError('Invalid JSON payload.', 400);

    return json(
      { ok: false, error: requestError.message },
      requestError.status,
      cors,
    );
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return json({ ok: false, error: 'Invalid privacy preference payload.' }, 400, cors);
  }

  const input = raw as Record<string, unknown>;
  const visitorId = text(input.visitor_id ?? input.anonymous_visitor_id, 180);
  const eventId = text(input.event_id, 160);
  const occurredAt = text(input.occurred_at, 80) ?? new Date().toISOString();
  const gpc =
    input.gpc === true ||
    input.gpc === 1 ||
    input.gpc === '1' ||
    request.headers.get('sec-gpc') === '1';
  const decisionsRaw = input.decisions;

  if (!visitorId) {
    return json({ ok: false, error: 'visitor_id is required.' }, 400, cors);
  }
  if (!eventId) {
    return json({ ok: false, error: 'event_id is required.' }, 400, cors);
  }
  if (!decisionsRaw || typeof decisionsRaw !== 'object' || Array.isArray(decisionsRaw)) {
    return json({ ok: false, error: 'decisions object is required.' }, 400, cors);
  }

  const decisions = new Map<string, string>();
  for (const [purpose, decisionValue] of Object.entries(
    decisionsRaw as Record<string, unknown>,
  )) {
    if (!ALLOWED_PURPOSES.has(purpose)) continue;
    const decision = text(decisionValue, 40)?.toLowerCase();
    if (!decision || !ALLOWED_DECISIONS.has(decision)) {
      return json({ ok: false, error: `Invalid decision for ${purpose}.` }, 400, cors);
    }
    decisions.set(purpose, decision);
  }

  try {
    const admin = createAdminClient();
    const { data: sourceRow, error: sourceError } = await admin
      .from('tracking_sources')
      .select('privacy_notice_version,honor_gpc')
      .eq('id', source.id)
      .eq('organization_id', source.organizationId)
      .single();

    if (sourceError) {
      throw sourceError;
    }

    if (gpc && sourceRow?.honor_gpc !== false) {
      decisions.set('sale_sharing', 'opted_out');
    }

    if (decisions.size === 0) {
      return json({ ok: false, error: 'No supported privacy decisions supplied.' }, 400, cors);
    }

    const receipts: Array<{
      purpose: string;
      decision: string;
      receipt_id: string;
    }> = [];

    for (const [purpose, decision] of decisions) {
      const { data: receiptId, error } = await admin.rpc(
        'record_privacy_preference_v1',
        {
          p_organization_id: source.organizationId,
          p_purpose_key: purpose,
          p_decision: decision,
          p_source: 'browser_sdk_v1',
          p_occurred_at: occurredAt,
          p_person_id: null,
          p_lead_id: null,
          p_anonymous_visitor_id: visitorId,
          p_notice_version: sourceRow?.privacy_notice_version ?? null,
          p_evidence: {
            event_id: eventId,
            origin,
            gpc,
            public_site_id: source.publicSiteId,
            site_id_verified: source.siteIdVerified,
          },
          p_metadata: {
            tracking_source_id: source.id,
            source_key: source.sourceKey,
            organization_site_id: source.organizationSiteId,
            public_site_id: source.publicSiteId,
            site_id_verified: source.siteIdVerified,
            user_agent_present: Boolean(request.headers.get('user-agent')),
          },
        },
      );

      if (error) {
        throw error;
      }

      receipts.push({
        purpose,
        decision,
        receipt_id: String(receiptId),
      });
    }

    return json(
      {
        ok: true,
        visitor_id: visitorId,
        site_id: source.publicSiteId,
        site_id_verified: source.siteIdVerified,
        gpc,
        notice_version: sourceRow?.privacy_notice_version ?? null,
        receipts,
        effective_decisions: Object.fromEntries(decisions),
        received_at: new Date().toISOString(),
      },
      200,
      cors,
    );
  } catch (error) {
    console.error('Browser privacy preference persistence failed.', error);
    return json(
      {
        ok: false,
        error: 'Unable to save privacy preferences.',
      },
      500,
      cors,
    );
  }
}
