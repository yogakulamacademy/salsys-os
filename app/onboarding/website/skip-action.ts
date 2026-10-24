'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

export async function skipOnboardingWebsiteAction() {
  const supabase = await createClient();
  const workspace = await getCurrentWorkspaceContext(supabase);
  const organizationId = workspace.activeOrganizationId;

  if (!organizationId) {
    throw new Error('No active organization is available for onboarding.');
  }

  const { data: canManage, error: permissionError } = await supabase.rpc(
    'can_manage_organization',
    { p_organization_id: organizationId },
  );

  if (permissionError || !canManage) {
    throw new Error('Only organization owners and admins can manage onboarding.');
  }

  const { error } = await supabase
    .from('organization_onboarding')
    .update({
      status: 'in_progress',
      current_step: 'channels',
    })
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Unable to skip website onboarding: ${error.message}`);
  }

  revalidatePath('/onboarding');
  revalidatePath('/onboarding/website');
  redirect('/onboarding/channels');
}
