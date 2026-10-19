import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  authenticateServerTrackingSource,
  consumeTrackingRateLimit,
} from '@/lib/tracking/runtime';

export const dynamic = 'force-dynamic';

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  return authorization.slice(7).trim() || null;
}

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function json(
  body: Record<string, unknown>,
  status: number,
  extraHeaders?: Record<string, string>,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

/**
 * Universal trusted identity handoff.
 *
 * This preserves the strongest behavior of the pre-existing tracking system:
 * a browser identifier alone is never enough to attach history to a CRM lead.
 * The exact session must already exist inside the same tenant and must belong
 * to the supplied anonymous visitor.
 */
export async function POST(request: NextRequest) {
  const source = await authenticateServerTrackingSource(
    request.headers.get('x-salsys-source-key'),
    bearerToken(request),
  );

  if (!source) {
    return json(
      {
        ok: false,
        linked: false,
        error: 'Unauthorized tracking source.',
      },
      401,
    );
  }

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > Math.min(source.maxPayloadBytes, 16_000)) {
    return json(
      {
        ok: false,
        linked: false,
        error: 'Payload too large.',
      },
      413,
    );
  }

  const rate = await consumeTrackingRateLimit(source);
  if (!rate.allowed) {
    return json(
      {
        ok: false,
        linked: false,
        error: 'Rate limit exceeded.',
      },
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
      throw new Error('Invalid identity payload.');
    }

    const input = raw as Record<string, unknown>;
    const eventId = text(input.event_id ?? input.eventId, 160);
    const leadId = text(input.lead_id ?? input.leadId, 100);
    const visitorId = text(
      input.anonymous_visitor_id ?? input.anonymousVisitorId ?? input.visitor_id,
      180,
    );
    const sessionKey = text(input.session_key ?? input.sessionKey ?? input.session_id, 180);

    if (!leadId || !visitorId || !sessionKey) {
      throw new Error(
        'lead_id, anonymous_visitor_id and session_key are required.',
      );
    }

    const admin = createAdminClient();

    const { data: lead, error: leadError } = await admin
      .from('leads')
      .select('id,organization_id')
      .eq('id', leadId)
      .eq('organization_id', source.organizationId)
      .maybeSingle();

    if (leadError) throw leadError;
    if (!lead?.organization_id) {
      throw new Error('Lead was not found for this tracking source tenant.');
    }

    const { data: session, error: sessionError } = await admin
      .from('web_sessions')
      .select('id,organization_id,anonymous_visitor_id,session_key,lead_id')
      .eq('organization_id', source.organizationId)
      .eq('session_key', sessionKey)
      .eq('anonymous_visitor_id', visitorId)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      throw new Error(
        'Matching tracking session was not found for this lead organization.',
      );
    }

    const linkedAt = new Date().toISOString();

    const { error: linkError } = await admin
      .from('visitor_identity_links')
      .upsert(
        {
          organization_id: source.organizationId,
          anonymous_visitor_id: visitorId,
          lead_id: leadId,
          last_session_key: sessionKey,
          source_system: 'events-identify-v1',
          linked_at: linkedAt,
          metadata: {
            identity_scope: 'exact_session',
            tracking_source_id: source.id,
            source_key: source.sourceKey,
            event_id: eventId,
          },
        },
        {
          onConflict: 'organization_id,anonymous_visitor_id',
        },
      );

    if (linkError) throw linkError;

    const { data: attribution, error: attachError } = await admin.rpc(
      'attach_visitor_journey_to_lead',
      {
        p_lead_id: leadId,
        p_anonymous_visitor_id: visitorId,
        p_session_key: sessionKey,
      },
    );

    if (attachError) throw attachError;

    const { error: personError } = await admin.rpc('resolve_person_for_lead', {
      p_lead_id: leadId,
      p_source_system: 'events-identify-v1',
    });

    if (personError) throw personError;

    return json(
      {
        ok: true,
        linked: true,
        lead_id: leadId,
        anonymous_visitor_id: visitorId,
        session_key: sessionKey,
        event_id: eventId,
        attribution,
        linked_at: linkedAt,
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
        linked: false,
        error: error instanceof Error ? error.message : 'Identity handoff failed.',
      },
      400,
      {
        'X-RateLimit-Limit': String(rate.limit),
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    );
  }
}
