'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function teamUrl(key: 'notice' | 'error', message: string) {
  const params = new URLSearchParams({ [key]: message });
  return `/settings/team?${params.toString()}`;
}

async function requireTenantAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);

  const [{ data: profile, error: profileError }, { data: membership, error: membershipError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, active')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('organization_members')
        .select('organization_id, role, active')
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .eq('active', true)
        .maybeSingle(),
    ]);

  if (
    profileError ||
    membershipError ||
    !profile ||
    profile.active !== true ||
    !membership ||
    !['owner', 'admin'].includes(String(membership.role ?? ''))
  ) {
    redirect('/dashboard');
  }

  return {
    user,
    organizationId,
  };
}

export async function createEmployeeAction(formData: FormData) {
  const { organizationId } = await requireTenantAdmin();

  const fullName = value(formData, 'full_name');
  const email = value(formData, 'email').toLowerCase();
  const password = value(formData, 'password');

  if (fullName.length < 2) {
    redirect(teamUrl('error', 'Employee name is required.'));
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(teamUrl('error', 'Enter a valid employee email address.'));
  }

  if (password.length < 10) {
    redirect(
      teamUrl('error', 'Temporary password must be at least 10 characters.'),
    );
  }

  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      crm_role: 'admissions',
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

  const { error: provisionError } = await admin.rpc('provision_tenant_employee', {
    p_user_id: userId,
    p_organization_id: organizationId,
    p_full_name: fullName,
  });

  if (provisionError) {
    await admin.auth.admin.deleteUser(userId);

    redirect(
      teamUrl(
        'error',
        `Employee login was rolled back because tenant access could not be provisioned: ${provisionError.message}`,
      ),
    );
  }

  revalidatePath('/settings/team');
  revalidatePath('/admissions');

  redirect(teamUrl('notice', `${fullName} was created as an Employee.`));
}

export async function setEmployeeActiveAction(formData: FormData) {
  const { user: adminUser, organizationId } = await requireTenantAdmin();

  const employeeId = value(formData, 'employee_id');
  const nextActive = value(formData, 'active') === 'true';

  if (!employeeId) {
    redirect(teamUrl('error', 'Employee is missing.'));
  }

  if (employeeId === adminUser.id) {
    redirect(
      teamUrl('error', 'You cannot change your own admin access from here.'),
    );
  }

  const admin = createAdminClient();

  const { data: tenantMembership, error: membershipError } = await admin
    .from('organization_members')
    .select('user_id, role, active')
    .eq('organization_id', organizationId)
    .eq('user_id', employeeId)
    .maybeSingle();

  if (
    membershipError ||
    !tenantMembership ||
    tenantMembership.role !== 'admissions'
  ) {
    redirect(
      teamUrl(
        'error',
        membershipError?.message ?? 'Employee was not found in this organization.',
      ),
    );
  }

  const { data: targetProfile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', employeeId)
    .maybeSingle();

  const { error: updateError } = await admin.rpc('set_tenant_employee_active', {
    p_organization_id: organizationId,
    p_user_id: employeeId,
    p_active: nextActive,
  });

  if (updateError) {
    redirect(teamUrl('error', updateError.message));
  }

  revalidatePath('/settings/team');
  revalidatePath('/admissions');

  redirect(
    teamUrl(
      'notice',
      `${targetProfile?.full_name ?? 'Employee'} is now ${nextActive ? 'active' : 'inactive'} in this organization.`,
    ),
  );
}
