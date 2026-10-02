import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTrackingOriginAllowed, trackingCorsHeaders } from '@/lib/tracking/server';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: trackingCorsHeaders(request.headers.get('origin')) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const cors = trackingCorsHeaders(origin);
  if (!isTrackingOriginAllowed(origin)) return NextResponse.json({ ok: false, error: 'Origin not allowed' }, { status: 403, headers: cors });
  const expected = process.env.TRACKING_INGEST_SECRET;
  if (!expected || request.headers.get('x-tracking-secret') !== expected) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: cors });
  }

  try {
    const body = await request.json();
    const leadId = typeof body.leadId === 'string' ? body.leadId : '';
    const visitorId = typeof body.anonymousVisitorId === 'string' ? body.anonymousVisitorId : '';
    const sessionKey = typeof body.sessionKey === 'string' ? body.sessionKey : null;
    if (!leadId || !visitorId) throw new Error('leadId and anonymousVisitorId are required.');

    const supabase = createAdminClient();

const {
  data: lead,
  error: leadError,
} = await supabase
  .from('leads')
  .select('organization_id')
  .eq('id', leadId)
  .maybeSingle();

if (leadError) throw leadError;

if (!lead?.organization_id) {
  throw new Error('Lead organization could not be resolved.');
}

const organizationId = lead.organization_id;

const { error: linkError } = await supabase
  .from('visitor_identity_links')
  .upsert(
    {
      organization_id: organizationId,
      anonymous_visitor_id: visitorId,
      lead_id: leadId,
      last_session_key: sessionKey,
      source_system: 'tracking-identify',
      linked_at: new Date().toISOString(),
      metadata: {},
    },
    {
      onConflict: 'organization_id,anonymous_visitor_id',
    }
  );
    if (linkError) throw linkError;

    const { data, error } = await supabase.rpc('attach_visitor_journey_to_lead', {
      p_lead_id: leadId,
      p_anonymous_visitor_id: visitorId,
      p_session_key: sessionKey,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, attribution: data }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lead identification failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: cors });
  }
}
