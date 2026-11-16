import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminWorkspaceAccess } from '@/lib/route-access';
import {
  collectDeskcommReviewCandidates,
  reconcileDeskcommHumanReviewQueue,
  type DeskcommReviewCandidate,
} from '@/lib/integrations/deskcomm-human-review-queue';

export type DeskcommHumanReviewQueueReadiness = {
  status: 'disabled' | 'ready' | 'unavailable' | 'over_limit';
  checkedAt: string;
  lookbackDays: 7;
  candidateCount: number | null;
  displayedCount: number;
  rows: DeskcommReviewCandidate[];
};

/**
 * Strictly read-only. Uses existing canonical WhatsApp raw evidence, verified
 * tenant-owned message links and inbound CRM messages. No external network,
 * task mutation, automatic suppressions, provider sends or job queue claims.
 *
 * The result must never promise complete counts if the 1000 event bound fails.
 */
export async function getCurrentDeskcommHumanReviewQueue():
  Promise<DeskcommHumanReviewQueueReadiness> {
  const active = await requireAdminWorkspaceAccess();
  const checkedAt = new Date().toISOString();
  const base = { checkedAt, lookbackDays: 7 as const, displayedCount: 0, rows: [] as DeskcommReviewCandidate[] };

  if (process.env.SALSYS_DESKCOMM_INBOUND_SHADOW !== 'true') {
    return { ...base, status: 'disabled', candidateCount: null };
  }

  try {
    const admin = createAdminClient();
    const organizationId = active.organizationId;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: raw, error: rawError } = await admin
      .from('raw_events')
      .select('external_message_id,source_account_id,source_subject_id,received_at,metadata')
      .eq('organization_id', organizationId)
      .eq('source_system', 'whatsapp')
      .eq('ingestion_method', 'whatsapp_webhook')
      .gte('received_at', since)
      .order('received_at', { ascending: false })
      .limit(1001);

    if (rawError || !Array.isArray(raw)) {
      return { ...base, status: 'unavailable', candidateCount: null };
    }
    if (raw.length > 1000) {
      return { ...base, status: 'over_limit', candidateCount: null };
    }

    const candidates = collectDeskcommReviewCandidates(raw);
    if (!candidates) {
      return { ...base, status: 'unavailable', candidateCount: null };
    }

    const candidateCount = candidates.length;
    // Bound every downstream IN query. Older candidates are counted but not
    // expanded, so the reviewer sees a visibly labeled, recent subset.
    const recent = candidates.slice(0, 40);
    if (recent.length === 0) {
      return { ...base, status: 'ready', candidateCount: 0 };
    }
    const providerIds = [...new Set(recent.map((row) => row.providerMessageId))];

    const [{ data: linkRows, error: linkError }, { data: msgRows, error: msgError }] =
      await Promise.all([
        admin.from('whatsapp_crm_message_links')
          .select('external_message_id,lead_id,conversation_id')
          .eq('organization_id', organizationId)
          .in('external_message_id', providerIds)
          .limit(100),
        admin.from('messages')
          .select('external_message_id,lead_id,conversation_id,direction')
          .eq('organization_id', organizationId)
          .eq('direction', 'inbound')
          .in('external_message_id', providerIds)
          .limit(100),
      ]);

    if (linkError || msgError || !Array.isArray(linkRows) || !Array.isArray(msgRows)) {
      return { ...base, status: 'unavailable', candidateCount: null };
    }
    if (linkRows.length >= 100 || msgRows.length >= 100) {
      return { ...base, status: 'unavailable', candidateCount: null };
    }

    const conversationIds = [...new Set(linkRows.map((row) => String(row.conversation_id ?? '')))]
      .filter(Boolean);
    const leadIds = [...new Set(linkRows.map((row) => String(row.lead_id ?? '')))]
      .filter(Boolean);

    let conversationRows: Array<{
      id: string;
      lead_id: string;
      channel: string;
      external_account_id: string | null;
      external_conversation_id: string | null;
    }> = [];
    let verifiedLeadIds: string[] = [];

    if (conversationIds.length && leadIds.length) {
      const [{ data: convData, error: convError }, { data: leadData, error: leadError }] =
        await Promise.all([
          admin.from('conversations')
            .select('id,lead_id,channel,external_account_id,external_conversation_id')
            .eq('organization_id', organizationId)
            .eq('channel', 'whatsapp')
            .in('id', conversationIds)
            .limit(100),
          admin.from('leads')
            .select('id')
            .eq('organization_id', organizationId)
            .in('id', leadIds)
            .limit(100),
        ]);
      if (convError || leadError || !Array.isArray(convData) || !Array.isArray(leadData) ||
          convData.length >= 100 || leadData.length >= 100) {
        return { ...base, status: 'unavailable', candidateCount: null };
      }
      conversationRows = convData;
      verifiedLeadIds = leadData.map((row) => String(row.id));
    }

    const rows = reconcileDeskcommHumanReviewQueue({
      candidates: recent,
      links: linkRows,
      messages: msgRows,
      conversations: conversationRows,
      tenantLeadIds: verifiedLeadIds,
    });
    return { ...base, status: 'ready', candidateCount, displayedCount: rows.length, rows };
  } catch {
    return { ...base, status: 'unavailable', candidateCount: null };
  }
}
