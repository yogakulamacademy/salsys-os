import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function reply(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function authorized() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  return { supabase, user, organizationId };
}

/** Private, user-scoped, small in-app alert feed. No phone/message content. */
export async function GET() {
  if (process.env.SALSYS_DESKCOMM_HANDOFF_ACTIONS !== 'true') {
    return reply({ enabled: false, alerts: [] });
  }
  try {
    const ctx = await authorized();
    if (!ctx) return reply({ enabled: true, error: 'unauthorized' }, 401);
    const { data, error } = await ctx.supabase
      .from('whatsapp_handoff_staff_notifications')
      .select('id,lead_id,task_id,created_at,read_at')
      .eq('organization_id', ctx.organizationId)
      .eq('recipient_user_id', ctx.user.id)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !Array.isArray(data)) {
      return reply({ enabled: true, error: 'notifications_unavailable' }, 503);
    }
    return reply({
      enabled: true,
      alerts: data.map((row) => ({
        id: row.id,
        leadId: row.lead_id,
        taskId: row.task_id,
        createdAt: row.created_at,
      })),
    });
  } catch {
    return reply({ enabled: true, error: 'notifications_unavailable' }, 503);
  }
}

/** Only the currently signed-in recipient can acknowledge their own alert. */
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return reply({ ok: false, error: 'invalid_origin' }, 403);
  }
  if (process.env.SALSYS_DESKCOMM_HANDOFF_ACTIONS !== 'true') {
    return reply({ ok: false, error: 'disabled' }, 403);
  }
  try {
    const ctx = await authorized();
    if (!ctx) return reply({ ok: false, error: 'unauthorized' }, 401);
    const raw = await request.json().catch(() => null);
    const notificationId = typeof raw?.notificationId === 'string'
      ? raw.notificationId.trim() : '';
    if (!UUID.test(notificationId)) {
      return reply({ ok: false, error: 'invalid_notification' }, 400);
    }
    const { data, error } = await ctx.supabase.rpc(
      'acknowledge_whatsapp_handoff_staff_alert_v1',
      {
        p_organization_id: ctx.organizationId,
        p_notification_id: notificationId,
      },
    );
    if (error || !data || typeof data !== 'object' ||
        !('ok' in data) || data.ok !== true) {
      return reply({ ok: false, error: 'not_accessible' }, 409);
    }
    return reply({ ok: true });
  } catch {
    return reply({ ok: false, error: 'notifications_unavailable' }, 503);
  }
}
