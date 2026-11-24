import 'server-only';
import { requirePlatformAdminAccess } from '@/lib/platform-admin-access';
import { getCurrentWorkspaceAccess } from '@/lib/workspace-access';
import { createAdminClient } from '@/lib/supabase/admin';

const providers = ['google', 'meta', 'instagram', 'whatsapp'] as const;
const statuses = ['pending', 'connected', 'expired', 'error', 'revoked', 'disconnected'] as const;
type Provider = typeof providers[number];
type Status = typeof statuses[number];
export type BusinessReadiness = {
  workspaceCodes: string[];
  connections: Record<Provider, Status[]> | null;
};

export async function loadPlatformBusinessReadiness(): Promise<BusinessReadiness> {
  if (process.env.SALSYS_PLATFORM_ADMIN_ENABLED !== 'true') throw new Error('Platform overview unavailable.');
  const { activeWorkspace } = await requirePlatformAdminAccess();
  const access = await getCurrentWorkspaceAccess();
  if (!access || access.organizationId !== activeWorkspace.organizationId ||
      !['owner', 'admin'].includes(access.role)) throw new Error('Workspace unavailable.');
  const workspaceCodes = access.workspaceCodes;
  // Only provider and status, bound to the authenticated internal tenant.
  // No tokens, accounts, provider metadata, customer data or external calls.
  const { data, error, count } = await createAdminClient().from('integration_connections')
    .select('provider,status', { count: 'exact' })
    .eq('organization_id', access.organizationId).in('provider', [...providers]).limit(100);
  const connections: Record<Provider, Status[]> = { google: [], meta: [], instagram: [], whatsapp: [] };
  if (error || !Array.isArray(data) || count !== data.length ||
      data.some(row => !providers.includes(row.provider) || !statuses.includes(row.status))) {
    return { workspaceCodes, connections: null };
  }
  for (const row of data) connections[row.provider as Provider].push(row.status as Status);
  return { workspaceCodes, connections };
}
