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

export async function setEmployeeActiveAction() {
  await requireOrganizationAdmin();

  redirect(
    teamUrl(
      'error',
      'Activation changes are temporarily unavailable while organization-scoped employee controls are being upgraded.',
    ),
  );
}
