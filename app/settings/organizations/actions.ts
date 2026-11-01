'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requirePlatformAdminAccess } from '@/lib/platform-admin-access';
import { createAdminClient } from '@/lib/supabase/admin';

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

export async function provisionCustomerOrganizationAction(formData: FormData) {
  await requirePlatformAdminAccess();

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
    app_metadata: {
      require_password_change: true,
      provisioned_customer_owner: true,
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
    const { error: rollbackError } = await admin.auth.admin.deleteUser(ownerUserId);

    if (rollbackError) {
      console.error('Customer organization provisioning cleanup failed', {
        ownerUserId,
        provisioningError: provisionError?.message ?? 'Unknown provisioning error.',
        cleanupError: rollbackError.message,
      });

      redirect(
        organizationsUrl(
          'error',
          'Customer workspace provisioning failed, and SalsysOS could not verify removal of the temporary owner login. Do not retry this email until a platform administrator removes the orphaned Auth identity.',
        ),
      );
    }

    redirect(
      organizationsUrl(
        'error',
        `Owner login was removed because the customer workspace could not be provisioned: ${provisionError?.message ?? 'Unknown provisioning error.'}`,
      ),
    );
  }

  revalidatePath('/settings/organizations');

  redirect(
    organizationsUrl(
      'notice',
      `${organizationName} was provisioned. The owner must replace the temporary password before onboarding begins.`,
    ),
  );
}
