import { redirect } from 'next/navigation';

import AdminTeamPerformancePage from '@/app/team-performance/admin-page';
import ReadOnlyTeamPerformancePage from '@/app/team-performance/read-only-page';
import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

type PageQuery = {
  range?: string;
  start?: string;
  end?: string;
  employee?: string;
  notice?: string;
  error?: string;
};

export default async function TeamPerformancePage({
  searchParams,
}: {
  searchParams: Promise<PageQuery>;
}) {
  if (useMockData) {
    return (
      <AdminTeamPerformancePage
        searchParams={searchParams}
      />
    );
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
    redirect('/workspace?next=%2Fteam-performance');
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

  const canManageAssignments =
    organization.role === 'owner' ||
    organization.role === 'admin';

  if (canManageAssignments) {
    return (
      <AdminTeamPerformancePage
        searchParams={searchParams}
      />
    );
  }

  return (
    <ReadOnlyTeamPerformancePage
      searchParams={searchParams}
    />
  );
}
