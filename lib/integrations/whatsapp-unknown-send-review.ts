import 'server-only';

import { requireAdminWorkspaceAccess } from '@/lib/route-access';
import { createAdminClient } from '@/lib/supabase/admin';

const LOOKBACK_DAYS = 30;
const MAX_ROWS = 50;

type AuditRecord = {
  id: string;
  lead_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type UnknownWhatsAppSend = {
  auditId: string;
  leadId: string;
  createdAt: string;
  updatedAt: string;
};

export type UnknownWhatsAppSendReview = {
  status: 'ready' | 'unavailable';
  checkedAt: string;
  lookbackDays: number;
  hasMore: boolean;
  rows: UnknownWhatsAppSend[];
};

/**
 * An operator-only, strictly read-only investigation queue. It never marks
 * provider attempts failed, never declares an SMS/WhatsApp message unsent,
 * never infers an exact total, and cannot re-arm any delivery.
 */
export async function getUnknownWhatsAppSendReview(): Promise<UnknownWhatsAppSendReview> {
  // Authorize BEFORE obtaining a service-role client or accessing tenant data.
  const workspace = await requireAdminWorkspaceAccess();
  const checkedAt = new Date().toISOString();
  const base: UnknownWhatsAppSendReview = {
    status: 'unavailable',
    checkedAt,
    lookbackDays: LOOKBACK_DAYS,
    hasMore: false,
    rows: [],
  };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('automation_provider_send_audits')
      .select('id,lead_id,status,created_at,updated_at')
      .eq('organization_id', workspace.organizationId)
      .eq('channel', 'whatsapp')
      .eq('provider', 'meta_cloud_api')
      .eq('status', 'sending')
      .contains('provider_response', {
        transport_outcome: { status: 'unknown' },
      })
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(MAX_ROWS + 1);

    // A query failure is NOT an empty queue or evidence of delivery safety.
    if (error || !Array.isArray(data)) return base;

    const rows: UnknownWhatsAppSend[] = (data as AuditRecord[])
      .slice(0, MAX_ROWS)
      .map((item) => ({
        auditId: item.id,
        leadId: item.lead_id,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));

    return {
      ...base,
      status: 'ready',
      hasMore: data.length > MAX_ROWS,
      rows,
    };
  } catch {
    return base;
  }
}
