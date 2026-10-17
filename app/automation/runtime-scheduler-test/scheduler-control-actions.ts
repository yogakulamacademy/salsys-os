'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/runtime-scheduler-test?${type}=${encodeURIComponent(message)}`);
}

export async function syncAndEnableSupabaseSchedulerGateTestAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) go('error', 'Your session has expired. Sign in again.');

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage } = await supabase.rpc('can_manage_organization', {
    p_organization_id: organizationId,
  });
  if (canManage !== true) go('error', 'Only organization admins can run scheduler gate tests.');

  if (process.env.AUTOMATION_SCHEDULER_ENABLED?.trim().toLowerCase() === 'true') {
    go('error', 'Vercel AUTOMATION_SCHEDULER_ENABLED must remain false/unset for this gate test.');
  }

  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) go('error', 'CRON_SECRET is not available in this deployment.');

  const admin = createAdminClient();
  const { error: vaultError } = await admin.rpc('upsert_automation_scheduler_vault_secret_v1', {
    p_secret: secret,
  });
  if (vaultError) go('error', `Vault sync failed: ${vaultError.message}`);

  const { error: settingsError } = await admin
    .from('automation_scheduler_settings')
    .update({ enabled: true, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (settingsError) go('error', `Scheduler setting update failed: ${settingsError.message}`);

  const { data: requestId, error: invokeError } = await admin.rpc('invoke_automation_runtime_scheduler_v1');
  if (invokeError) go('error', `Scheduler invocation failed: ${invokeError.message}`);

  revalidatePath('/automation/runtime-scheduler-test');
  go(
    'notice',
    `Supabase scheduler gate armed safely. CRON_SECRET was synced to Vault, DB scheduler enabled, and request ${requestId ?? 'queued'} was invoked while Vercel global scheduler remains disabled.`,
  );
}
