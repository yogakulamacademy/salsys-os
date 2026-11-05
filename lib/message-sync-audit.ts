import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';
import { isMockMode } from '@/lib/data';
import { parseMessageSyncAudit, type MessageSyncAudit } from '@/lib/message-sync-audit-validation';

export type MessageSyncAuditView = {
  workspaceName: string;
  audit: MessageSyncAudit;
  instagramEchoEnabled: boolean;
  instagramHistoryEnabled: boolean;
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

  const { data, error } = await (createAdminClient() as any).rpc(
    'get_message_sync_audit_v1',
    { p_organization_id: active.organizationId },
  );
  if (error || !data) throw new Error('Message synchronization audit is temporarily unavailable.');

  return {
    workspaceName: active.organizationName,
    audit: parseMessageSyncAudit(data),
    instagramEchoEnabled: process.env.INSTAGRAM_OUTBOUND_ECHO_ENABLED === 'true',
    instagramHistoryEnabled: process.env.INSTAGRAM_HISTORY_SYNC_ENABLED === 'true',
  };
}
