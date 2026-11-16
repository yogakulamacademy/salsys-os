import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminWorkspaceAccess } from '@/lib/route-access';
import {
  collectDeskcommReviewCandidates,
  reconcileDeskcommHumanReviewQueue,
  type DeskcommReviewCandidate,
} from '@/lib/integrations/deskcomm-human-review-queue';

export type DeskcommHandoffAssignee = {
  id: string;
  name: string;
  role: string;
};

export type DeskcommReviewActionRow = DeskcommReviewCandidate & {
  handoff: {
    id: string;
    status: 'open' | 'closed';
    assignedTo: string;
    taskId: string;
    aiHoldActive: boolean;
  } | null;
};

export type DeskcommHumanReviewQueueReadiness = {
  actionsEnabled: boolean;
  assignees: DeskcommHandoffAssignee[];
  status: 'disabled' | 'ready' | 'unavailable' | 'over_limit';
  checkedAt: string;
  lookbackDays: 7;
  candidateCount: number | null;
  displayedCount: number;
  rows: DeskcommReviewActionRow[];
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
  const actionsRequested =
    process.env.SALSYS_DESKCOMM_HANDOFF_ACTIONS === 'true' &&
    process.env.SALSYS_DESKCOMM_INBOUND_SHADOW === 'true';
  const base = {
    checkedAt,
    lookbackDays: 7 as const,
    actionsEnabled: false,
    assignees: [] as DeskcommHandoffAssignee[],
    displayedCount: 0,
    rows: [] as DeskcommReviewActionRow[],
  };

  if (process.env.SALSYS_DESKCOMM_INBOUND_SHADOW !== 'true') {
    return { ...base, status: 'disabled', candidateCount: null };
  }

  try {
    const admin = createAdminClient();
    const organizationId = active.organizationId;

    // UI and database must both approve this organization. A missing config
    // row never enables a task; DB errors fail closed before showing buttons.
    if (actionsRequested) {
      const { data: pilot, error: pilotError } = await admin
        .from('whatsapp_handoff_pilot_controls')
        .select('actions_enabled')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (pilotError) {
        return { ...base, status: 'unavailable', candidateCount: null };
      }
      base.actionsEnabled = pilot?.actions_enabled === true;
    }

    if (base.actionsEnabled) {
      const [
        { data: organizationMembers, error: orgError },
        { data: workspaceMembers, error: workspaceError },
        { data: salesWorkspace, error: salesError },
      ] = await Promise.all([
        admin.from('organization_members')
          .select('user_id,role')
          .eq('organization_id', organizationId)
          .eq('active', true)
          .limit(101),
        admin.from('workspace_memberships')
          .select('user_id,role')
          .eq('organization_id', organizationId)
          .eq('workspace_code', 'sales')
          .eq('active', true)
          .in('role', ['manager', 'member'])
          .limit(101),
        admin.from('organization_workspaces')
          .select('enabled')
          .eq('organization_id', organizationId)
          .eq('workspace_code', 'sales')
          .maybeSingle(),
      ]);
      if (orgError || workspaceError || salesError ||
          !organizationMembers || !workspaceMembers ||
          organizationMembers.length > 100 || workspaceMembers.length > 100 ||
          salesWorkspace?.enabled !== true) {
        return { ...base, status: 'unavailable', candidateCount: null };
      }

      const salesRoles = new Map(
        workspaceMembers.map((row) => [String(row.user_id), String(row.role)]),
      );
      const eligible = organizationMembers.filter((row) =>
        row.role === 'owner' || row.role === 'admin' ||
        salesRoles.has(String(row.user_id)),
      );
      const staffIds = [...new Set(eligible.map((row) => String(row.user_id)))];
      if (staffIds.length > 0) {
        const { data: profiles, error: profilesError } = await admin
          .from('profiles')
          .select('id,full_name,active')
          .in('id', staffIds)
          .eq('active', true)
          .limit(101);
        if (profilesError || !profiles || profiles.length > 100) {
          return { ...base, status: 'unavailable', candidateCount: null };
        }
        const names = new Map(profiles.map((profile) => [
          String(profile.id),
          String(profile.full_name ?? '').trim() || 'CRM User',
        ]));
        base.assignees = eligible.flatMap((member) => {
          const id = String(member.user_id);
          if (!names.has(id)) return [];
          return [{
            id,
            name: names.get(id)!,
            role: member.role === 'owner' || member.role === 'admin'
              ? member.role : salesRoles.get(id) ?? 'member',
          }];
        }).sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: raw, error: rawError } = await admin
      .from('raw_events')
      .select('id,external_message_id,source_account_id,source_subject_id,received_at,metadata')
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

    const verifiedRows = reconcileDeskcommHumanReviewQueue({
      candidates: recent,
      links: linkRows,
      messages: msgRows,
      conversations: conversationRows,
      tenantLeadIds: verifiedLeadIds,
    });

    let handoffs = new Map<string, DeskcommReviewActionRow['handoff']>();
    // Continue displaying existing task/hold evidence when the DB pilot is
    // disabled, but NEVER show action buttons. This avoids hiding active
    // holds during an emergency rollback.
    if (actionsRequested) {
      // The handoff table exists only after the separately reviewed migration.
      // If that prerequisite is missing, fail closed rather than presenting
      // a button that could create duplicate or untracked work.
      const eventIds = [...new Set(verifiedRows.flatMap((row) =>
        row.rawEventId ? [row.rawEventId] : []))];
      if (eventIds.length) {
        const { data: handoffRows, error: handoffError } = await admin
          .from('whatsapp_human_handoffs')
          .select('id,raw_event_id,task_id,assigned_to,status,ai_hold_active')
          .eq('organization_id', organizationId)
          .in('raw_event_id', eventIds)
          .limit(100);
        if (handoffError || !Array.isArray(handoffRows) || handoffRows.length >= 100) {
          return { ...base, status: 'unavailable', candidateCount: null };
        }
        for (const handoff of handoffRows) {
          if ((handoff.status !== 'open' && handoff.status !== 'closed') ||
              typeof handoff.ai_hold_active !== 'boolean') {
            return { ...base, status: 'unavailable', candidateCount: null };
          }
          const rawId = String(handoff.raw_event_id ?? '');
          if (handoffs.has(rawId)) {
            return { ...base, status: 'unavailable', candidateCount: null };
          }
          handoffs.set(rawId, {
            id: String(handoff.id),
            status: handoff.status,
            assignedTo: String(handoff.assigned_to),
            taskId: String(handoff.task_id),
            aiHoldActive: handoff.ai_hold_active,
          });
        }
      }
    }

    const rows: DeskcommReviewActionRow[] = verifiedRows.map((row) => ({
      ...row,
      handoff: row.rawEventId ? handoffs.get(row.rawEventId) ?? null : null,
    }));

    return { ...base, status: 'ready', candidateCount, displayedCount: rows.length, rows };
  } catch {
    return { ...base, status: 'unavailable', candidateCount: null };
  }
}
