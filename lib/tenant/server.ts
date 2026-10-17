import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type ActiveTenantContext = {
  userId: string;
  organizationId: string;
  role: string;
};

export async function requireSingleActiveTenant(): Promise<ActiveTenantContext> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw new Error('AUTH_REQUIRED');
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id,role')
    .eq('user_id', authData.user.id)
    .eq('active', true)
    .limit(2);

  if (membershipError) {
    throw new Error('TENANT_RESOLUTION_FAILED');
  }

  if (!memberships || memberships.length !== 1) {
    throw new Error(
      memberships && memberships.length > 1
        ? 'MULTIPLE_ACTIVE_TENANTS'
        : 'ACTIVE_TENANT_REQUIRED',
    );
  }

  return {
    userId: authData.user.id,
    organizationId: String(memberships[0].organization_id),
    role: String(memberships[0].role),
  };
}
