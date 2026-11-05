import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';
import { isMockMode } from '@/lib/data';
import { parseMessageSyncAudit, type MessageSyncAudit } from '@/lib/message-sync-audit-validation';
import {
  parseInstagramReceiptReconciliation,
  type InstagramReceiptReconciliation,
} from '@/lib/instagram-receipt-reconciliation-validation';

export type MessageSyncAuditView = {
  workspaceName: string;
  audit: MessageSyncAudit;
  instagramEchoEnabled: boolean;
  instagramHistoryEnabled: boolean;
  instagramConnections: Array<{ id: string; label: string }>;
  instagramReceiptReconciliation: InstagramReceiptReconciliation | null;
};

/**
 * Read-only operations audit.
 *
 * Fresh auth, active profile, active tenant membership and owner/admin role
 * must be resolved BEFORE a service-role RPC can execute. The client cannot
 * choose an organization; only aggregate counts leave the server.
 */
export async function getCurrentMessageSyncAudit(): Promise<MessageSyncAuditView | null> {
  if (isMockMode()) return null;

  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user?.id) return null;

  const { data: profile, error: profileError } = await session.from('profiles')
    .select('active')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || profile?.active !== true) return null;

  const workspace = await getWorkspaceContextForUser(session, user.id);
  const active = workspace.activeWorkspace;
  if (!active || !['owner', 'admin'].includes(active.role) ||
      workspace.activeOrganizationId !== active.organizationId ||
      !workspace.memberships.some(member =>
        member.organizationId === active.organizationId &&
        member.role === active.role)) {
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await (admin as any).rpc(
    'get_message_sync_audit_v1',
    { p_organization_id: active.organizationId },
  );
  if (error || !data) throw new Error('Message synchronization audit is temporarily unavailable.');

  // Only return opaque connection IDs after the same fresh owner/admin and
  // workspace authorization used for the aggregate operational audit.
  const { data: connections, error: connectionsError } = await admin.from('integration_connections')
    .select('id')
    .eq('organization_id', active.organizationId)
    .eq('provider', 'instagram')
    .eq('status', 'connected')
    .order('connected_at', { ascending: false })
    .limit(10);
  if (connectionsError) throw new Error('Instagram subscription inventory is temporarily unavailable.');
  const ids = (connections ?? []).map(row => row.id);
  if (ids.some(id => typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error('Instagram subscription inventory contains invalid identifiers.');
  }

  // Optional read-only service-role RPC. Strictly tenant-bound; a migration
  // rollout gap or malformed report cannot break the established audit.
  // No raw webhook payloads, customer IDs or provider message IDs leave SQL.
  let instagramReceiptReconciliation: InstagramReceiptReconciliation | null = null;
  try {
    const { data: receiptData, error: receiptError } = await (admin as any).rpc(
      'get_instagram_receipt_reconciliation_v1',
      { p_organization_id: active.organizationId },
    );
    if (!receiptError && receiptData) {
      instagramReceiptReconciliation = parseInstagramReceiptReconciliation(receiptData);
    }
  } catch {
    instagramReceiptReconciliation = null;
  }

  return {
    workspaceName: active.organizationName,
    audit: parseMessageSyncAudit(data),
    instagramEchoEnabled: process.env.INSTAGRAM_OUTBOUND_ECHO_ENABLED === 'true',
    instagramHistoryEnabled: process.env.INSTAGRAM_HISTORY_SYNC_ENABLED === 'true',
    instagramReceiptReconciliation,
    instagramConnections: ids.map((id, index) => ({
      id,
      label: `Instagram connection ${index + 1}`,
    })),
  };
}
