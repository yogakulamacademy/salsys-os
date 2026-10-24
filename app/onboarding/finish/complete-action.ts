'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

function withCompletedStep(current: string[], step: string) {
  return Array.from(new Set([...current, step]));
}

export async function completeOnboardingWithOptionalSetupAction() {
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

  const { data: onboarding, error: onboardingError } = await supabase
    .from('organization_onboarding')
    .select('completed_steps')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (onboardingError || !onboarding) {
    throw new Error(
      `Unable to load onboarding readiness: ${onboardingError?.message ?? 'Onboarding record not found.'}`,
    );
  }

  const completedSteps = Array.isArray(onboarding.completed_steps)
    ? onboarding.completed_steps.map(String)
    : [];

  const requiredSteps = ['business', 'goals'];
  const missingRequired = requiredSteps.filter((step) => !completedSteps.includes(step));

  if (missingRequired.length > 0) {
    redirect(
      `/onboarding/finish?error=${encodeURIComponent(`Complete the required setup first: ${missingRequired.join(', ')}.`)}`,
    );
  }

  const finalSteps = withCompletedStep(completedSteps, 'finish');
  const { error } = await supabase
    .from('organization_onboarding')
    .update({
      status: 'completed',
      current_step: 'finish',
      completed_steps: finalSteps,
      completed_at: new Date().toISOString(),
      dismissed_at: null,
    })
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Unable to complete onboarding: ${error.message}`);
  }

  revalidatePath('/onboarding');
  revalidatePath('/onboarding/finish');
  revalidatePath('/home');
  revalidatePath('/dashboard');
  redirect('/onboarding/finish?completed=1');
}
