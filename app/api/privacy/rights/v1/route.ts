import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  consumeTrackingRateLimit,
  corsHeadersForTrackingOrigin,
  resolveBrowserTrackingSource,
} from '@/lib/tracking/runtime';

export const dynamic = 'force-dynamic';

const REQUEST_TYPES = new Set([
  'access',
  'correction',
  'deletion',
  'restriction',
  'portability',
  'objection',
  'opt_out_sale_sharing',
  'limit_sensitive',
  'withdraw_consent',
  'grievance',
]);

const OPTIONAL_PURPOSES = new Set([
  'analytics',
  'marketing',
  'advertising',
  'sale_sharing',
  'personalization',
]);

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function browserOrigin(request: NextRequest) {
  return request.headers.get('origin')?.trim() || null;
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

export async function OPTIONS(request: NextRequest) {
  const origin = browserOrigin(request);
  const source = await resolveBrowserTrackingSource(origin);
  return new NextResponse(null, {
    status: source ? 204 : 403,
    headers: corsHeadersForTrackingOrigin(origin, Boolean(source)),
  });
}

export async function POST(request: NextRequest) {
  const origin = browserOrigin(request);
  const source = await resolveBrowserTrackingSource(origin);
  const cors = corsHeadersForTrackingOrigin(origin, Boolean(source));

  if (!source) {
    return json({ ok: false, error: 'Unrecognized browser tracking origin.' }, 403, cors);
  }

  const rate = await consumeTrackingRateLimit(source);
  if (!rate.allowed) {
    return json({ ok: false, error: 'Rate limit exceeded.' }, 429, {
      ...cors,
      'Retry-After': '60',
    });
  }

  try {
    const raw = await request.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Invalid privacy request payload.');
    }

    const input = raw as Record<string, unknown>;
    const requestType = text(input.request_type, 80)?.toLowerCase();
    const visitorId = text(input.visitor_id ?? input.anonymous_visitor_id, 180);
    const jurisdiction = text(input.jurisdiction, 80);
    const requesterEmail = text(input.email ?? input.requester_email, 320);
    const requesterPhone = text(input.phone ?? input.requester_phone, 80);
    const purposeKey = text(input.purpose_key, 80)?.toLowerCase();

    if (!requestType || !REQUEST_TYPES.has(requestType)) {
      throw new Error('Unsupported privacy request type.');
    }
    if (!visitorId) throw new Error('visitor_id is required.');
    if (requestType === 'withdraw_consent' && (!purposeKey || !OPTIONAL_PURPOSES.has(purposeKey))) {
      throw new Error('A supported purpose_key is required to withdraw consent.');
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc('intake_privacy_request_v1', {
      p_organization_id: source.organizationId,
      p_request_type: requestType,
      p_jurisdiction: jurisdiction,
      p_person_id: null,
      p_lead_id: null,
      p_anonymous_visitor_id: visitorId,
      p_requester_email: requesterEmail,
      p_requester_phone: requesterPhone,
      p_source: 'privacy_portal_browser_v1',
      p_purpose_key: purposeKey,
      p_metadata: {
        tracking_source_id: source.id,
        source_key: source.sourceKey,
        origin,
        user_agent_present: Boolean(request.headers.get('user-agent')),
      },
    });

    if (error) throw new Error(error.message);

    return json(
      {
        ok: true,
        request_id: data?.request_id ?? null,
        status: data?.status ?? 'received',
        verification_status: data?.verification_status ?? 'pending',
        due_at: data?.due_at ?? null,
        processing_reduced: Boolean(data?.processing_reduced),
        received_at: new Date().toISOString(),
      },
      202,
      cors,
    );
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to submit privacy request.',
      },
      400,
      cors,
    );
  }
}
