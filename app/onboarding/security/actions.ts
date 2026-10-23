'use server';

import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

function securityUrl(message: string) {
  return `/onboarding/security?error=${encodeURIComponent(message)}`;
}

export async function replaceProvisionedOwnerPasswordAction(formData: FormData) {
  const currentPassword = String(formData.get('current_password') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');

  if (!currentPassword) {
    redirect(securityUrl('Enter your current temporary password.'));
  }

  if (password.length < 12) {
    redirect(securityUrl('Use a password with at least 12 characters.'));
  }

  if (password !== confirmPassword) {
    redirect(securityUrl('Passwords do not match.'));
  }

  if (password === currentPassword) {
    redirect(securityUrl('Choose a new password that is different from the temporary password.'));
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?error=Your%20session%20expired.%20Sign%20in%20again.');
  }

  if (user.app_metadata?.require_password_change !== true) {
    redirect('/onboarding');
  }

  const workspace = await getCurrentWorkspaceContext(supabase);
  const organizationId = workspace.activeOrganizationId;

  if (!organizationId) {
    redirect('/login?error=Unable%20to%20resolve%20your%20workspace.');
  }

  const { data: canManage, error: permissionError } = await supabase.rpc(
    'can_manage_organization',
    { p_organization_id: organizationId },
  );

  if (permissionError || !canManage) {
    redirect('/login?error=Your%20workspace%20does%20not%20permit%20account%20setup.');
  }

  const { error: passwordError } = await supabase.auth.updateUser({
    password,
    current_password: currentPassword,
  });

  if (passwordError) {
    redirect(
      securityUrl(
        passwordError.message ||
          'Unable to update your password. Confirm the temporary password and try again.',
      ),
    );
  }

  const admin = createAdminClient();
  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      require_password_change: false,
      provisioned_customer_owner: true,
      password_changed_at: new Date().toISOString(),
    },
  });

  if (metadataError) {
    // Keep the gate enforced if metadata cannot be cleared. The password has
    // changed successfully, but the owner must retry this step rather than
    // silently entering the application with stale provisioning state.
    redirect(
      securityUrl(
        'Your password was updated, but account setup could not be finalized. Use the password you just created as your current password and choose another new password to retry.',
      ),
    );
  }

  // Refresh best-effort so the current session sees the admin-owned app
  // metadata immediately. Middleware also calls getUser(), so the server-side
  // flag remains authoritative if refresh is temporarily unavailable.
  await supabase.auth.refreshSession().catch(() => null);

  redirect('/onboarding');
}
