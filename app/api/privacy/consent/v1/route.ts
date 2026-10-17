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

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
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
    return json(
      { ok: false, error: 'Rate limit exceeded.' },
      429,
      { ...cors, 'Retry-After': '60' },
    );
  }

  try {
    const raw = await request.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Invalid privacy preference payload.');
    }

    const input = raw as Record<string, unknown>;
    const visitorId = text(input.visitor_id ?? input.anonymous_visitor_id, 180);
    const eventId = text(input.event_id, 160);
    const occurredAt = text(input.occurred_at, 80) ?? new Date().toISOString();
    const gpc = input.gpc === true || input.gpc === 1 || input.gpc === '1' || request.headers.get('sec-gpc') === '1';
    const decisionsRaw = input.decisions;

    if (!visitorId) throw new Error('visitor_id is required.');
    if (!eventId) throw new Error('event_id is required.');
    if (!decisionsRaw || typeof decisionsRaw !== 'object' || Array.isArray(decisionsRaw)) {
      throw new Error('decisions object is required.');
    }

    const admin = createAdminClient();
    const { data: sourceRow, error: sourceError } = await admin
      .from('tracking_sources')
      .select('privacy_notice_version,honor_gpc')
      .eq('id', source.id)
      .eq('organization_id', source.organizationId)
      .single();

    if (sourceError) throw new Error(`Unable to resolve privacy policy: ${sourceError.message}`);

    const decisions = new Map<string, string>();
    for (const [purpose, decisionValue] of Object.entries(decisionsRaw as Record<string, unknown>)) {
      if (!ALLOWED_PURPOSES.has(purpose)) continue;
      const decision = text(decisionValue, 40)?.toLowerCase();
      if (!decision || !ALLOWED_DECISIONS.has(decision)) {
        throw new Error(`Invalid decision for ${purpose}.`);
      }
      decisions.set(purpose, decision);
    }

    // Global Privacy Control is authoritative for sale/sharing when the source honors it.
    if (gpc && sourceRow?.honor_gpc !== false) {
      decisions.set('sale_sharing', 'opted_out');
    }

    if (decisions.size === 0) throw new Error('No supported privacy decisions supplied.');

    const receipts: Array<{ purpose: string; decision: string; receipt_id: string }> = [];
    for (const [purpose, decision] of decisions) {
      const { data: receiptId, error } = await admin.rpc('record_privacy_preference_v1', {
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
        },
        p_metadata: {
          tracking_source_id: source.id,
          source_key: source.sourceKey,
          user_agent_present: Boolean(request.headers.get('user-agent')),
        },
      });

      if (error) throw new Error(`Unable to record ${purpose} preference: ${error.message}`);
      receipts.push({ purpose, decision, receipt_id: String(receiptId) });
    }

    return json(
      {
        ok: true,
        visitor_id: visitorId,
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
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to save privacy preferences.',
      },
      400,
      cors,
    );
  }
}
