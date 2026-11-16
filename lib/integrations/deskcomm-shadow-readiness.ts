import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminWorkspaceAccess } from '@/lib/route-access';
import {
  summarizeDeskcommInboundShadow,
  type DeskcommShadowSummary,
} from '@/lib/integrations/deskcomm-shadow-summary';

export type DeskcommShadowReadiness = {
  status: 'disabled' | 'ready' | 'unavailable' | 'over_limit';
  checkedAt: string;
  windowDays: 7;
  summary: DeskcommShadowSummary | null;
};

/**
 * Existing raw_events only; never read messages, source IDs, phone numbers,
 * raw payloads, customer identity or provider credentials. Recheck workspace
 * owner/admin access BEFORE creating a privileged database client.
 *
 * This 7-day view is only complete if the result fits the 1,000-row bound.
 * Otherwise report unavailable instead of incorrectly claiming zero failures.
 */
export async function getCurrentDeskcommShadowReadiness(): Promise<DeskcommShadowReadiness> {
  const active = await requireAdminWorkspaceAccess();
  const checkedAt = new Date().toISOString();

  if (process.env.SALSYS_DESKCOMM_INBOUND_SHADOW !== 'true') {
    return { status: 'disabled', checkedAt, windowDays: 7, summary: null };
  }

  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin.from('raw_events')
      .select('metadata,received_at')
      .eq('organization_id', active.organizationId)
      .eq('source_system', 'whatsapp')
      .eq('ingestion_method', 'whatsapp_webhook')
      .gte('received_at', since)
      .order('received_at', { ascending: false })
      .limit(1001);

    if (error || !Array.isArray(data)) {
      return { status: 'unavailable', checkedAt, windowDays: 7, summary: null };
    }
    if (data.length > 1000) {
      return { status: 'over_limit', checkedAt, windowDays: 7, summary: null };
    }
    const summary = summarizeDeskcommInboundShadow(data);
    if (!summary) {
      return { status: 'unavailable', checkedAt, windowDays: 7, summary: null };
    }

    return { status: 'ready', checkedAt, windowDays: 7, summary };
  } catch {
    return { status: 'unavailable', checkedAt, windowDays: 7, summary: null };
  }
}
