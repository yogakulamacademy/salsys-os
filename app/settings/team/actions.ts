'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function values(formData: FormData, key: string) {
  return Array.from(
    new Set(
      formData
        .getAll(key)
        .map((entry) => String(entry).trim().toLowerCase())
        .filter(Boolean),
    ),
  );
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

async function rollbackNewEmployee(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  userId: string,
) {
  await admin
    .from('workspace_memberships')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', userId);

  await admin
    .from('organization_members')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', userId);

  await admin.from('profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId);
}

type ExistingWorkspaceMembership = {
  workspace_code: string;
  role: string;
  active: boolean;
};

async function restoreEmployeeAccess(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  userId: string,
  organizationRole: string,
  profileRole: string,
  workspaceMemberships: ExistingWorkspaceMembership[],
) {
  await admin
    .from('workspace_memberships')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', userId);

  if (workspaceMemberships.length > 0) {
    await admin.from('workspace_memberships').insert(
      workspaceMemberships.map((membership) => ({
        organization_id: organizationId,
        workspace_code: membership.workspace_code,
        user_id: userId,
        role: membership.role,
        active: membership.active,
      })),
    );
  }

  await admin
    .from('organization_members')
    .update({ role: organizationRole })
    .eq('organization_id', organizationId)
    .eq('user_id', userId);

  await admin.from('profiles').update({ role: profileRole }).eq('id', userId);
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

export async function createEmployeeAction(formData: FormData) {
  const { organization } = await requireOrganizationAdmin();

  const fullName = value(formData, 'full_name');
  const email = value(formData, 'email').toLowerCase();
  const password = value(formData, 'password');
  const selectedWorkspaceCodes = values(formData, 'workspace_codes');

  if (fullName.length < 2) {
    redirect(teamUrl('error', 'Employee name is required.'));
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(teamUrl('error', 'Enter a valid employee email address.'));
  }

  if (password.length < 10) {
    redirect(
      teamUrl(
        'error',
        'Temporary password must be at least 10 characters.',
      ),
    );
  }

  if (selectedWorkspaceCodes.length === 0) {
    redirect(teamUrl('error', 'Select at least one workspace.'));
  }

  if (selectedWorkspaceCodes.includes('admin')) {
    redirect(
      teamUrl(
        'error',
        'The Admin workspace is reserved for organization owners and admins.',
      ),
    );
  }

  const admin = createAdminClient();
  const organizationId = organization.organizationId;

  const { data: enabledWorkspaceRows, error: enabledWorkspaceError } = await admin
    .from('organization_workspaces')
    .select('workspace_code')
    .eq('organization_id', organizationId)
    .eq('enabled', true);

  if (enabledWorkspaceError) {
    redirect(
      teamUrl(
        'error',
        `Unable to validate workspace access: ${enabledWorkspaceError.message}`,
      ),
    );
  }

  const enabledWorkspaceCodes = new Set(
    (enabledWorkspaceRows ?? []).map((row) =>
      String(row.workspace_code ?? '').trim().toLowerCase(),
    ),
  );

  const invalidWorkspace = selectedWorkspaceCodes.find(
    (workspaceCode) =>
      workspaceCode === 'admin' || !enabledWorkspaceCodes.has(workspaceCode),
  );

  if (invalidWorkspace) {
    redirect(
      teamUrl(
        'error',
        `Workspace "${invalidWorkspace}" is not enabled for this organization.`,
      ),
    );
  }

  const salesSelected = selectedWorkspaceCodes.includes('sales');
  const legacyProfileRole = salesSelected ? 'admissions' : 'viewer';
  const organizationRole = salesSelected ? 'admissions' : 'viewer';

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        crm_role: legacyProfileRole,
      },
    });

  if (createError || !created.user) {
    redirect(
      teamUrl(
        'error',
        createError?.message ?? 'Unable to create employee login.',
      ),
    );
  }

  const userId = created.user.id;

  const { error: profileInsertError } = await admin.from('profiles').insert({
    id: userId,
    full_name: fullName,
    role: legacyProfileRole,
    active: true,
  });

  if (profileInsertError) {
    await rollbackNewEmployee(admin, organizationId, userId);

    redirect(
      teamUrl(
        'error',
        `Employee creation was rolled back because the CRM profile could not be created: ${profileInsertError.message}`,
      ),
    );
  }

  const { error: organizationMembershipError } = await admin
    .from('organization_members')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      role: organizationRole,
      active: true,
    });

  if (organizationMembershipError) {
    await rollbackNewEmployee(admin, organizationId, userId);

    redirect(
      teamUrl(
        'error',
        `Employee creation was rolled back because organization access could not be created: ${organizationMembershipError.message}`,
      ),
    );
  }

  const workspaceMembershipRows = selectedWorkspaceCodes.map(
    (workspaceCode) => ({
      organization_id: organizationId,
      workspace_code: workspaceCode,
      user_id: userId,
      role: 'member',
      active: true,
    }),
  );

  const { error: workspaceMembershipError } = await admin
    .from('workspace_memberships')
    .insert(workspaceMembershipRows);

  if (workspaceMembershipError) {
    await rollbackNewEmployee(admin, organizationId, userId);

    redirect(
      teamUrl(
        'error',
        `Employee creation was rolled back because workspace access could not be created: ${workspaceMembershipError.message}`,
      ),
    );
  }

  revalidatePath('/settings/team');

  if (salesSelected) {
    revalidatePath('/admissions');
  }

  redirect(
    teamUrl(
      'notice',
      `${fullName} was created with ${selectedWorkspaceCodes.length} workspace${selectedWorkspaceCodes.length === 1 ? '' : 's'}.`,
    ),
  );
}

export async function updateEmployeeAccessAction(formData: FormData) {
  const { organization } = await requireOrganizationAdmin();
  const employeeId = value(formData, 'employee_id');
  const selectedWorkspaceCodes = values(formData, 'workspace_codes');

  if (!employeeId) {
    redirect(teamUrl('error', 'Employee is missing.'));
  }

  if (selectedWorkspaceCodes.length === 0) {
    redirect(
      teamUrl(
        'error',
        'Select at least one workspace or deactivate the employee instead.',
      ),
    );
  }

  if (selectedWorkspaceCodes.includes('admin')) {
    redirect(
      teamUrl(
        'error',
        'The Admin workspace is reserved for organization owners and admins.',
      ),
    );
  }

  const admin = createAdminClient();
  const organizationId = organization.organizationId;

  const [targetResult, enabledWorkspaceResult, profileResult, existingAccessResult] =
    await Promise.all([
      admin
        .from('organization_members')
        .select('user_id,role,active')
        .eq('organization_id', organizationId)
        .eq('user_id', employeeId)
        .maybeSingle(),
      admin
        .from('organization_workspaces')
        .select('workspace_code')
        .eq('organization_id', organizationId)
        .eq('enabled', true),
      admin
        .from('profiles')
        .select('id,full_name,role')
        .eq('id', employeeId)
        .maybeSingle(),
      admin
        .from('workspace_memberships')
        .select('workspace_code,role,active')
        .eq('organization_id', organizationId)
        .eq('user_id', employeeId),
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

  const targetRole = String(targetResult.data.role ?? '').trim().toLowerCase();

  if (targetRole === 'owner' || targetRole === 'admin') {
    redirect(
      teamUrl(
        'error',
        'Owner and Admin access cannot be edited from the employee workspace editor.',
      ),
    );
  }

  if (targetResult.data.active !== true) {
    redirect(
      teamUrl(
        'error',
        'Reactivate this employee before changing workspace access.',
      ),
    );
  }

  if (enabledWorkspaceResult.error) {
    redirect(
      teamUrl(
        'error',
        `Unable to validate workspace access: ${enabledWorkspaceResult.error.message}`,
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

  if (existingAccessResult.error) {
    redirect(
      teamUrl(
        'error',
        `Unable to load current workspace access: ${existingAccessResult.error.message}`,
      ),
    );
  }

  const enabledWorkspaceCodes = new Set(
    (enabledWorkspaceResult.data ?? []).map((row) =>
      String(row.workspace_code ?? '').trim().toLowerCase(),
    ),
  );
  const invalidWorkspace = selectedWorkspaceCodes.find(
    (workspaceCode) =>
      workspaceCode === 'admin' || !enabledWorkspaceCodes.has(workspaceCode),
  );

  if (invalidWorkspace) {
    redirect(
      teamUrl(
        'error',
        `Workspace "${invalidWorkspace}" is not enabled for this organization.`,
      ),
    );
  }

  const workspaceRoles = new Map<string, 'member' | 'manager'>();

  for (const workspaceCode of selectedWorkspaceCodes) {
    const requestedRole = value(formData, `workspace_role_${workspaceCode}`)
      .trim()
      .toLowerCase();

    if (requestedRole !== 'member' && requestedRole !== 'manager') {
      redirect(
        teamUrl(
          'error',
          `Choose Member or Manager for the ${workspaceCode} workspace.`,
        ),
      );
    }

    workspaceRoles.set(workspaceCode, requestedRole);
  }

  const originalOrganizationRole = targetRole;
  const originalProfileRole = String(profileResult.data.role ?? 'viewer');
  const originalWorkspaceMemberships = (
    existingAccessResult.data ?? []
  ).map((membership) => ({
    workspace_code: String(membership.workspace_code),
    role: String(membership.role),
    active: membership.active === true,
  }));
  const employeeName =
    String(profileResult.data.full_name ?? '').trim() || 'Employee';

  try {
    const selectedRows = selectedWorkspaceCodes.map((workspaceCode) => ({
      organization_id: organizationId,
      workspace_code: workspaceCode,
      user_id: employeeId,
      role: workspaceRoles.get(workspaceCode) ?? 'member',
      active: true,
    }));

    const { error: selectedAccessError } = await admin
      .from('workspace_memberships')
      .upsert(selectedRows, {
        onConflict: 'organization_id,workspace_code,user_id',
      });

    if (selectedAccessError) {
      throw new Error(selectedAccessError.message);
    }

    const selectedSet = new Set(selectedWorkspaceCodes);
    const membershipsToDeactivate = originalWorkspaceMemberships.filter(
      (membership) => !selectedSet.has(membership.workspace_code),
    );

    for (const membership of membershipsToDeactivate) {
      const { error: deactivateError } = await admin
        .from('workspace_memberships')
        .update({ active: false })
        .eq('organization_id', organizationId)
        .eq('workspace_code', membership.workspace_code)
        .eq('user_id', employeeId);

      if (deactivateError) {
        throw new Error(deactivateError.message);
      }
    }

    const nextOrganizationRole =
      targetRole === 'manager'
        ? 'manager'
        : selectedSet.has('sales')
          ? 'admissions'
          : 'viewer';
    const { error: organizationRoleError } = await admin
      .from('organization_members')
      .update({ role: nextOrganizationRole })
      .eq('organization_id', organizationId)
      .eq('user_id', employeeId);

    if (organizationRoleError) {
      throw new Error(organizationRoleError.message);
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
    await restoreEmployeeAccess(
      admin,
      organizationId,
      employeeId,
      originalOrganizationRole,
      originalProfileRole,
      originalWorkspaceMemberships,
    );

    redirect(
      teamUrl(
        'error',
        `Workspace access was rolled back: ${error instanceof Error ? error.message : 'Unable to update employee access.'}`,
      ),
    );
  }

  revalidatePath('/settings/team');
  revalidatePath('/admissions');

  redirect(
    teamUrl(
      'notice',
      `${employeeName}'s workspace access was updated.`,
    ),
  );
}

export async function setEmployeeActiveAction() {
  await requireOrganizationAdmin();

  redirect(
    teamUrl(
      'error',
      'Activation changes are temporarily unavailable while organization-scoped employee controls are being upgraded.',
    ),
  );
}