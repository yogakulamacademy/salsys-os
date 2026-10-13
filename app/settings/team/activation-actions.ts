'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function teamUrl(key: 'notice' | 'error', message: string) {
  const params = new URLSearchParams({
    [key]: message,
  });

  return `/settings/team?${params.toString()}`;
}

async function requireOrganizationAdmin() {
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

  const workspaceContext = await getWorkspaceContextForUser(supabase, user.id);
  const organization = workspaceContext.activeWorkspace;

  if (!organization) {
    redirect('/workspace?next=%2Fsettings%2Fteam');
  }

  if (organization.role !== 'owner' && organization.role !== 'admin') {
    redirect('/workspace/admin?restricted=1');
  }

  return {
    user,
    organization,
  };
}

async function deriveLegacyProfileRole(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { data: membershipRows, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id,role')
    .eq('user_id', userId)
    .eq('active', true);

  if (membershipError) {
    throw new Error(
      `Unable to evaluate organization roles: ${membershipError.message}`,
    );
  }

  const activeMemberships = (membershipRows ?? []).map((membership) => ({
    organizationId: String(membership.organization_id ?? ''),
    role: String(membership.role ?? '').trim().toLowerCase(),
  }));

  const organizationIds = Array.from(
    new Set(
      activeMemberships
        .map((membership) => membership.organizationId)
        .filter(Boolean),
    ),
  );

  if (organizationIds.length === 0) {
    return 'viewer';
  }

  const { data: organizationRows, error: organizationError } = await admin
    .from('organizations')
    .select('id')
    .in('id', organizationIds)
    .eq('status', 'active');

  if (organizationError) {
    throw new Error(
      `Unable to evaluate active organizations: ${organizationError.message}`,
    );
  }

  const activeOrganizationIds = new Set(
    (organizationRows ?? []).map((organization) => String(organization.id)),
  );
  const relevantMemberships = activeMemberships.filter((membership) =>
    activeOrganizationIds.has(membership.organizationId),
  );

  if (
    relevantMemberships.some(
      (membership) => membership.role === 'owner' || membership.role === 'admin',
    )
  ) {
    return 'admin';
  }

  if (relevantMemberships.some((membership) => membership.role === 'manager')) {
    return 'manager';
  }

  const relevantOrganizationIds = relevantMemberships.map(
    (membership) => membership.organizationId,
  );

  if (relevantOrganizationIds.length === 0) {
    return 'viewer';
  }

  const [salesMembershipsResult, salesWorkspaceResult] = await Promise.all([
    admin
      .from('workspace_memberships')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('workspace_code', 'sales')
      .eq('active', true)
      .in('organization_id', relevantOrganizationIds),
    admin
      .from('organization_workspaces')
      .select('organization_id')
      .eq('workspace_code', 'sales')
      .eq('enabled', true)
      .in('organization_id', relevantOrganizationIds),
  ]);

  if (salesMembershipsResult.error) {
    throw new Error(
      `Unable to evaluate Sales memberships: ${salesMembershipsResult.error.message}`,
    );
  }

  if (salesWorkspaceResult.error) {
    throw new Error(
      `Unable to evaluate enabled Sales workspaces: ${salesWorkspaceResult.error.message}`,
    );
  }

  const enabledSalesOrganizationIds = new Set(
    (salesWorkspaceResult.data ?? []).map((workspace) =>
      String(workspace.organization_id),
    ),
  );
  const hasActiveSalesAccess = (salesMembershipsResult.data ?? []).some(
    (membership) =>
      enabledSalesOrganizationIds.has(String(membership.organization_id)),
  );

  return hasActiveSalesAccess ? 'admissions' : 'viewer';
}

export async function setEmployeeOrganizationActiveAction(formData: FormData) {
  const { user: adminUser, organization } = await requireOrganizationAdmin();
  const employeeId = value(formData, 'employee_id');
  const nextActive = value(formData, 'active') === 'true';

  if (!employeeId) {
    redirect(teamUrl('error', 'Employee is missing.'));
  }

  if (employeeId === adminUser.id) {
    redirect(
      teamUrl(
        'error',
        'You cannot change your own organization access from this screen.',
      ),
    );
  }

  const admin = createAdminClient();
  const organizationId = organization.organizationId;

  const [targetResult, profileResult] = await Promise.all([
    admin
      .from('organization_members')
      .select('user_id,role,active')
      .eq('organization_id', organizationId)
      .eq('user_id', employeeId)
      .maybeSingle(),
    admin
      .from('profiles')
      .select('id,full_name,role,active')
      .eq('id', employeeId)
      .maybeSingle(),
  ]);

  if (targetResult.error || !targetResult.data) {
    redirect(
      teamUrl(
        'error',
        targetResult.error?.message ??
          'Employee does not belong to this organization.',
      ),
    );
  }

  if (profileResult.error || !profileResult.data) {
    redirect(
      teamUrl(
        'error',
        profileResult.error?.message ?? 'Employee profile was not found.',
      ),
    );
  }

  const targetRole = String(targetResult.data.role ?? '').trim().toLowerCase();

  if (targetRole === 'owner' || targetRole === 'admin') {
    redirect(
      teamUrl(
        'error',
        'Owner and Admin organization access cannot be changed from the employee controls.',
      ),
    );
  }

  const originalActive = targetResult.data.active === true;
  const originalProfileRole = String(profileResult.data.role ?? 'viewer');
  const employeeName =
    String(profileResult.data.full_name ?? '').trim() || 'Employee';

  if (originalActive === nextActive) {
    redirect(
      teamUrl(
        'notice',
        `${employeeName}'s organization access is already ${nextActive ? 'active' : 'suspended'}.`,
      ),
    );
  }

  try {
    const { error: membershipUpdateError } = await admin
      .from('organization_members')
      .update({ active: nextActive })
      .eq('organization_id', organizationId)
      .eq('user_id', employeeId);

    if (membershipUpdateError) {
      throw new Error(membershipUpdateError.message);
    }

    const nextProfileRole = await deriveLegacyProfileRole(admin, employeeId);
    const { error: profileRoleError } = await admin
      .from('profiles')
      .update({ role: nextProfileRole })
      .eq('id', employeeId);

    if (profileRoleError) {
      throw new Error(profileRoleError.message);
    }
  } catch (error) {
    await admin
      .from('organization_members')
      .update({ active: originalActive })
      .eq('organization_id', organizationId)
      .eq('user_id', employeeId);

    await admin
      .from('profiles')
      .update({ role: originalProfileRole })
      .eq('id', employeeId);

    redirect(
      teamUrl(
        'error',
        `Organization access change was rolled back: ${error instanceof Error ? error.message : 'Unable to change employee access.'}`,
      ),
    );
  }

  revalidatePath('/settings/team');
  revalidatePath('/admissions');

  redirect(
    teamUrl(
      'notice',
      `${employeeName}'s access to ${organization.organizationName} is now ${nextActive ? 'active' : 'suspended'}.`,
    ),
  );
}
