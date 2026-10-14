import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/supabase/admin';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export class IntegrationTenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationTenantError';
  }
}

/**
 * Resolve the only tenant an authenticated request may administer for
 * integration setup. The tenant comes from the trusted workspace/session
 * resolver, never from query parameters, form data, or a browser-provided
 * organization id.
 */
export async function requireIntegrationAdminTenant(
  supabase: SupabaseClient,
  userId: string,
) {
  const workspaceContext = await getWorkspaceContextForUser(
    supabase,
    userId,
  );

  const activeWorkspace = workspaceContext.activeWorkspace;

  if (
    !activeWorkspace ||
    !['owner', 'admin'].includes(activeWorkspace.role)
  ) {
    throw new IntegrationTenantError(
      'You do not have permission to manage integrations for this workspace.',
    );
  }

  const admin = createAdminClient();
  const organizationId = activeWorkspace.organizationId;

  const { data: organization, error: organizationError } = await admin
    .from('organizations')
    .select('id, status')
    .eq('id', organizationId)
    .maybeSingle();

  if (
    organizationError ||
    !organization ||
    organization.status !== 'active'
  ) {
    throw new IntegrationTenantError('This workspace is not active.');
  }

  return {
    admin,
    organizationId,
    activeWorkspace,
  };
}
