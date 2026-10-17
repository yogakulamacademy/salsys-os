'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/runtime-scheduler-test?${type}=${encodeURIComponent(message)}`);
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) go('error', 'Your session has expired. Sign in again.');

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage } = await supabase.rpc('can_manage_organization', {
    p_organization_id: organizationId,
  });

  if (canManage !== true) go('error', 'Only organization admins can sync the scheduler secret.');
}

export async function syncRuntimeSchedulerVaultSecretAction() {
  await requireAdmin();

  if (process.env.AUTOMATION_SCHEDULER_ENABLED?.trim().toLowerCase() === 'true') {
    go('error', 'Disable AUTOMATION_SCHEDULER_ENABLED before syncing scheduler credentials.');
  }

  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) go('error', 'CRON_SECRET is not available in this deployment.');

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('sync_automation_scheduler_vault_secret_v1', {
    p_secret: secret,
  });

  if (error || !data) go('error', error?.message || 'Unable to sync CRON_SECRET into Supabase Vault.');

  revalidatePath('/automation/runtime-scheduler-test');
  go(
    'notice',
    'Scheduler credential sync passed: the deployment CRON_SECRET was securely copied into Supabase Vault. Global scheduler runtime remains disabled.',
  );
}
