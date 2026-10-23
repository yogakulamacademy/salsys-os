'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function organizationsUrl(key: 'notice' | 'error', message: string) {
  const params = new URLSearchParams({ [key]: message });
  return `/settings/organizations?${params.toString()}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect('/login');

  const workspace = await getCurrentWorkspaceContext(supabase);
  const active = workspace.activeWorkspace;

  if (
    !active ||
    active.organizationSlug !== 'salsysos' ||
    !['owner', 'admin'].includes(active.role)
  ) {
    redirect('/dashboard');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    redirect('/dashboard');
  }

  return { user };
}

export async function provisionCustomerOrganizationAction(formData: FormData) {
  await requirePlatformAdmin();

  const organizationName = value(formData, 'organization_name');
  const requestedSlug = value(formData, 'organization_slug');
  const ownerFullName = value(formData, 'owner_full_name');
  const ownerEmail = value(formData, 'owner_email').toLowerCase();
  const temporaryPassword = value(formData, 'temporary_password');
  const organizationSlug = slugify(requestedSlug || organizationName);

  if (organizationName.length < 2 || organizationName.length > 180) {
    redirect(organizationsUrl('error', 'Enter a valid organization name.'));
  }

  if (!organizationSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug)) {
    redirect(organizationsUrl('error', 'Enter a valid organization slug.'));
  }

  if (ownerFullName.length < 2 || ownerFullName.length > 180) {
    redirect(organizationsUrl('error', 'Enter the owner name.'));
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    redirect(organizationsUrl('error', 'Enter a valid owner email address.'));
  }

  if (temporaryPassword.length < 12) {
    redirect(
      organizationsUrl(
        'error',
        'Temporary password must contain at least 12 characters.',
      ),
    );
  }

  const admin = createAdminClient();

  const { data: existingOrganization, error: organizationLookupError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', organizationSlug)
    .maybeSingle();

  if (organizationLookupError) {
    redirect(
      organizationsUrl(
        'error',
        `Unable to verify organization slug: ${organizationLookupError.message}`,
      ),
    );
  }

  if (existingOrganization) {
    redirect(organizationsUrl('error', 'That organization slug is already in use.'));
  }

  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: ownerFullName,
      crm_role: 'admin',
      tenant_role: 'owner',
    },
  });

  if (createUserError || !created.user) {
    redirect(
      organizationsUrl(
        'error',
        createUserError?.message ?? 'Unable to create the owner login.',
      ),
    );
  }

  const ownerUserId = created.user.id;
  const { data: organizationId, error: provisionError } = await admin.rpc(
    'provision_customer_organization_v1',
    {
      p_user_id: ownerUserId,
      p_organization_name: organizationName,
      p_organization_slug: organizationSlug,
      p_owner_full_name: ownerFullName,
    },
  );

  if (provisionError || !organizationId) {
    await admin.auth.admin.deleteUser(ownerUserId);

    redirect(
      organizationsUrl(
        'error',
        `Owner login was rolled back because the customer workspace could not be provisioned: ${provisionError?.message ?? 'Unknown provisioning error.'}`,
      ),
    );
  }

  revalidatePath('/settings/organizations');

  redirect(
    organizationsUrl(
      'notice',
      `${organizationName} was provisioned. The owner will enter onboarding on first sign-in.`,
    ),
  );
}
