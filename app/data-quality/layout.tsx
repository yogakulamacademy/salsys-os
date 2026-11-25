import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { CrmWorkspaceFrame } from '@/components/crm/crm-workspace-frame';
import { requirePrivilegedWorkspaceAccess } from '@/lib/route-access';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

// Data quality is a CRM tab for admins only (owner request, 25 Nov 2026).
export default async function DataQualityLayout({ children }: { children: ReactNode }) {
  await requirePrivilegedWorkspaceAccess();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: isAdmin } = await supabase.rpc('can_manage_organization', { p_organization_id: organizationId });
  if (isAdmin !== true) redirect('/leads');
  return <CrmWorkspaceFrame>{children}</CrmWorkspaceFrame>;
}
