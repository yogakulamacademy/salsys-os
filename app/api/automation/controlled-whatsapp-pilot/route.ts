import { createHash, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { executePreparedWhatsAppProviderSend } from '@/lib/integrations/whatsapp-provider-send';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONTROLLED_ORG_ID = '566132f7-a762-474a-85e6-e31edbf6adfb';

type JsonRecord = Record<string, unknown>;

function sha256(value: string) {
  return createHash('sha256').update(value).digest();
}

function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return false;
  return timingSafeEqual(sha256(token), sha256(secret));
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  if (!authorized(request.headers.get('authorization'))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: JsonRecord = {};
  try {
    body = asRecord(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const organizationId = text(body.organizationId);
  const approvalId = text(body.approvalId);
  const auditId = text(body.auditId);

  if (organizationId !== CONTROLLED_ORG_ID || !approvalId || !auditId) {
    return NextResponse.json({ ok: false, error: 'Controlled pilot identifiers are invalid.' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: settings, error: settingsError } = await admin
    .from('automation_provider_send_settings')
    .select('provider_send_enabled,pilot_mode_enabled,pilot_lead_id,pilot_started_at,pilot_max_messages,pilot_require_verified_primary_whatsapp')
    .eq('organization_id', organizationId)
    .eq('channel', 'whatsapp')
    .eq('provider', 'meta_cloud_api')
    .maybeSingle();

  if (settingsError || !settings) {
    return NextResponse.json({ ok: false, error: 'Pilot provider settings are unavailable.' }, { status: 409 });
  }

  if (
    settings.provider_send_enabled !== true ||
    settings.pilot_mode_enabled !== true ||
    !settings.pilot_lead_id ||
    !settings.pilot_started_at ||
    Number(settings.pilot_max_messages) !== 1 ||
    settings.pilot_require_verified_primary_whatsapp !== true
  ) {
    return NextResponse.json({ ok: false, error: 'Controlled pilot safety gates are not armed.' }, { status: 409 });
  }

  const { data: approval, error: approvalError } = await admin
    .from('automation_approval_requests')
    .select('id,status,lead_id,provider_send_audit_id')
    .eq('organization_id', organizationId)
    .eq('id', approvalId)
    .maybeSingle();

  if (
    approvalError ||
    !approval ||
    approval.status !== 'approved' ||
    approval.lead_id !== settings.pilot_lead_id ||
    approval.provider_send_audit_id !== auditId
  ) {
    return NextResponse.json({ ok: false, error: 'Approval is not eligible for the controlled pilot.' }, { status: 409 });
  }

  const { data: audit, error: auditError } = await admin
    .from('automation_provider_send_audits')
    .select('id,status,lead_id,approval_request_id,customer_message_sent,provider_message_id')
    .eq('organization_id', organizationId)
    .eq('id', auditId)
    .maybeSingle();

  if (
    auditError ||
    !audit ||
    audit.status !== 'ready' ||
    audit.lead_id !== settings.pilot_lead_id ||
    audit.approval_request_id !== approvalId ||
    audit.customer_message_sent === true ||
    audit.provider_message_id
  ) {
    return NextResponse.json({ ok: false, error: 'Provider audit is not ready for the controlled pilot.' }, { status: 409 });
  }

  const execution = await executePreparedWhatsAppProviderSend({ organizationId, auditId });

  if (!execution.ok || execution.status !== 'sent' || execution.customerMessageSent !== true) {
    return NextResponse.json({ ok: false, execution }, { status: execution.providerCallAttempted ? 502 : 409 });
  }

  const { data: completionData, error: completionError } = await admin.rpc('complete_whatsapp_send_approval_v1', {
    p_organization_id: organizationId,
    p_approval_request_id: approvalId,
    p_provider_send_audit_id: auditId,
  });

  if (completionError) {
    return NextResponse.json(
      { ok: false, execution, customerMessageSent: true, error: 'Provider accepted the pilot, but workflow completion needs review.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    execution: {
      status: execution.status,
      providerCallAttempted: execution.providerCallAttempted,
      providerMessageId: execution.providerMessageId,
      canonicalMessageId: execution.canonicalMessageId,
      customerMessageSent: execution.customerMessageSent,
    },
    completion: completionData,
    customerMessageSent: true,
  });
}
