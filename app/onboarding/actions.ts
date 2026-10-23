'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

const allowedIndustries = new Set([
  'wellness_education',
  'real_estate',
  'professional_services',
  'ecommerce',
  'healthcare',
  'other',
]);

const allowedGoals = new Set([
  'lead_management',
  'attribution',
  'whatsapp',
  'automation',
  'seo',
  'revenue',
  'team_performance',
  'customer_journey',
]);

function textValue(formData: FormData, key: string, max = 180) {
  return String(formData.get(key) ?? '').trim().slice(0, max);
}

function normalizedWebsite(value: string) {
  if (!value) return '';
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

async function requireManageableWorkspace() {
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

  return { supabase, organizationId };
}

async function loadCompletedSteps(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
) {
  const { data } = await supabase
    .from('organization_onboarding')
    .select('completed_steps')
    .eq('organization_id', organizationId)
    .maybeSingle();

  return Array.isArray(data?.completed_steps)
    ? data.completed_steps.map((value) => String(value))
    : [];
}

function withCompletedStep(current: string[], step: string) {
  return Array.from(new Set([...current, step]));
}

export async function saveOnboardingBusinessAction(formData: FormData) {
  const businessName = textValue(formData, 'business_name');
  const industry = textValue(formData, 'industry', 80);
  const countryCode = textValue(formData, 'country_code', 12).toUpperCase();
  const timezone = textValue(formData, 'timezone', 80);
  const website = normalizedWebsite(textValue(formData, 'website_url', 240));

  if (!businessName || businessName.length < 2) {
    redirect('/onboarding?step=business&error=Enter%20your%20business%20name.');
  }

  if (!allowedIndustries.has(industry)) {
    redirect('/onboarding?step=business&error=Choose%20your%20industry.');
  }

  if (!countryCode) {
    redirect('/onboarding?step=business&error=Choose%20your%20country.');
  }

  if (!timezone) {
    redirect('/onboarding?step=business&error=Choose%20your%20timezone.');
  }

  const { supabase, organizationId } = await requireManageableWorkspace();
  const completedSteps = withCompletedStep(
    await loadCompletedSteps(supabase, organizationId),
    'business',
  );

  const { error: organizationError } = await supabase
    .from('organizations')
    .update({ name: businessName })
    .eq('id', organizationId);

  if (organizationError) {
    throw new Error(`Unable to update business profile: ${organizationError.message}`);
  }

  const { error: onboardingError } = await supabase
    .from('organization_onboarding')
    .upsert(
      {
        organization_id: organizationId,
        status: 'in_progress',
        current_step: 'goals',
        industry,
        country_code: countryCode,
        timezone,
        website_url: website || null,
        completed_steps: completedSteps,
      },
      { onConflict: 'organization_id' },
    );

  if (onboardingError) {
    throw new Error(`Unable to save onboarding progress: ${onboardingError.message}`);
  }

  revalidatePath('/onboarding');
  redirect('/onboarding?step=goals');
}

export async function saveOnboardingGoalsAction(formData: FormData) {
  const goals = formData
    .getAll('goals')
    .map((value) => String(value).trim())
    .filter((value) => allowedGoals.has(value));

  if (goals.length === 0) {
    redirect('/onboarding?step=goals&error=Choose%20at%20least%20one%20goal.');
  }

  const { supabase, organizationId } = await requireManageableWorkspace();
  const completedSteps = withCompletedStep(
    await loadCompletedSteps(supabase, organizationId),
    'goals',
  );

  const { error } = await supabase
    .from('organization_onboarding')
    .upsert(
      {
        organization_id: organizationId,
        status: 'in_progress',
        current_step: 'website',
        goals,
        completed_steps: completedSteps,
      },
      { onConflict: 'organization_id' },
    );

  if (error) {
    throw new Error(`Unable to save onboarding goals: ${error.message}`);
  }

  revalidatePath('/onboarding');
  redirect('/onboarding?step=website');
}

export async function resumeOnboardingStepAction(formData: FormData) {
  const requestedStep = textValue(formData, 'step', 40);
  const allowedSteps = new Set(['business', 'goals', 'website', 'channels', 'team', 'finish']);
  const nextStep = allowedSteps.has(requestedStep) ? requestedStep : 'business';

  const { supabase, organizationId } = await requireManageableWorkspace();
  const { error } = await supabase
    .from('organization_onboarding')
    .upsert(
      {
        organization_id: organizationId,
        status: 'in_progress',
        current_step: nextStep,
      },
      { onConflict: 'organization_id' },
    );

  if (error) {
    throw new Error(`Unable to update onboarding step: ${error.message}`);
  }

  revalidatePath('/onboarding');
  redirect(`/onboarding?step=${encodeURIComponent(nextStep)}`);
}
