import { redirect } from 'next/navigation';

import LegacyContactIntelligencePage from '@/app/contact-intelligence/legacy-page';
import ScopedContactIntelligencePage from '@/app/contact-intelligence/scoped-page';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default async function ContactIntelligencePage() {
  const mock =
    process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false';

  if (mock) {
    return <LegacyContactIntelligencePage />;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    redirect('/login?error=access-disabled');
  }

  const workspaceContext = await getWorkspaceContextForUser(
    supabase,
    user.id,
  );
  const organization = workspaceContext.activeWorkspace;

  if (!organization) {
    redirect('/workspace?next=%2Fcontact-intelligence');
  }

  const reportsWorkspace = workspaceContext.functionalWorkspaces.find(
    (workspace) => workspace.code === 'reports',
  );
  const reportsRole = reportsWorkspace?.role ?? null;
  const hasReportsAccess =
    reportsWorkspace != null &&
    ['owner', 'admin', 'manager', 'member', 'service_role'].includes(
      String(reportsRole ?? '').toLowerCase(),
    );

  if (!hasReportsAccess) {
    redirect('/workspace/reports?restricted=1');
  }

  return (
    <ScopedContactIntelligencePage
      organizationId={organization.organizationId}
    />
  );
}
