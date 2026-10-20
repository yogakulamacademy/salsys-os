import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  consumePublishableClientRateLimit,
  corsHeadersForPublishableClient,
  resolvePublishableClientSource,
} from '@/lib/tracking/publishable-client';

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

function json(body: Record<string, unknown>, status: number, extra?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...corsHeadersForPublishableClient(),
      ...extra,
      'Cache-Control': 'no-store',
    },
  });
}

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeadersForPublishableClient(),
  });
}

export async function POST(request: NextRequest) {
  const source = await resolvePublishableClientSource(
    request.headers.get('x-salsys-source-key'),
  );

  if (!source) {
    return json({ ok: false, error: 'Unknown or inactive publishable client source.' }, 401);
  }

  const rate = await consumePublishableClientRateLimit(source);
  if (!rate.allowed) {
    return json(
      { ok: false, error: 'Rate limit exceeded.' },
      429,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': '0',
        'Retry-After': '60',
      },
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
    const platform = text(input.platform, 40)?.toLowerCase() ?? null;
    const decisionsRaw = input.decisions;
    const gpc =
      input.gpc === true ||
      input.gpc === 1 ||
      input.gpc === '1' ||
      request.headers.get('sec-gpc') === '1';

    if (!visitorId) throw new Error('visitor_id is required.');
    if (!eventId) throw new Error('event_id is required.');
    if (!decisionsRaw || typeof decisionsRaw !== 'object' || Array.isArray(decisionsRaw)) {
      throw new Error('decisions object is required.');
    }

    const configuredPlatform = text(source.metadata.platform, 40)?.toLowerCase() ?? null;
    if (configuredPlatform && platform && configuredPlatform !== platform) {
      throw new Error('Client platform does not match the configured source.');
    }

    const decisions = new Map<string, string>();
    for (const [purpose, decisionValue] of Object.entries(
      decisionsRaw as Record<string, unknown>,
    )) {
      if (!ALLOWED_PURPOSES.has(purpose)) continue;
      const decision = text(decisionValue, 40)?.toLowerCase();
      if (!decision || !ALLOWED_DECISIONS.has(decision)) {
        throw new Error(`Invalid decision for ${purpose}.`);
      }
      decisions.set(purpose, decision);
    }

    if (gpc && source.honorGpc) {
      decisions.set('sale_sharing', 'opted_out');
    }

    if (decisions.size === 0) {
      throw new Error('No supported privacy decisions supplied.');
    }

    const admin = createAdminClient();
    const receipts: Array<{ purpose: string; decision: string; receipt_id: string }> = [];

    for (const [purpose, decision] of decisions) {
      const { data: receiptId, error } = await admin.rpc('record_privacy_preference_v1', {
        p_organization_id: source.organizationId,
        p_purpose_key: purpose,
        p_decision: decision,
        p_source: 'publishable_client_v1',
        p_occurred_at: occurredAt,
        p_person_id: null,
        p_lead_id: null,
        p_anonymous_visitor_id: visitorId,
        p_notice_version: source.privacyNoticeVersion,
        p_evidence: {
          event_id: eventId,
          platform,
          gpc,
        },
        p_metadata: {
          tracking_source_id: source.id,
          source_key: source.sourceKey,
          platform,
          client_type: source.metadata.platform ?? null,
        },
      });

      if (error) {
        throw new Error(`Unable to record ${purpose} preference: ${error.message}`);
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
        platform,
        gpc,
        notice_version: source.privacyNoticeVersion,
        receipts,
        effective_decisions: Object.fromEntries(decisions),
        received_at: new Date().toISOString(),
      },
      200,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to save privacy preferences.',
      },
      400,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }
}
