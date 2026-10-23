'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getTrackingPlatformWorkspace } from '@/lib/tracking-platform-data';
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
  redirect('/onboarding/website');
}

export async function verifyOnboardingWebsiteAction() {
  const { supabase, organizationId } = await requireManageableWorkspace();
  const tracking = await getTrackingPlatformWorkspace();

  if (tracking.organizationId !== organizationId) {
    throw new Error('Tracking workspace does not match the active onboarding tenant.');
  }

  const healthyWebsite = tracking.sources.find(
    (source) => source.sourceType === 'website' && source.healthStatus === 'healthy',
  );

  if (!healthyWebsite) {
    redirect(
      '/onboarding/website?error=No%20healthy%20website%20tracking%20source%20was%20found.%20Install%20tracking%20and%20send%20a%20real%20event%20before%20continuing.',
    );
  }

  const completedSteps = withCompletedStep(
    await loadCompletedSteps(supabase, organizationId),
    'website',
  );

  const websiteUrl = healthyWebsite.hostname
    ? `https://${healthyWebsite.hostname.replace(/^https?:\/\//i, '').replace(/\/$/, '')}`
    : null;

  const { error } = await supabase
    .from('organization_onboarding')
    .update({
      status: 'in_progress',
      current_step: 'channels',
      website_url: websiteUrl,
      completed_steps: completedSteps,
    })
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Unable to verify website onboarding: ${error.message}`);
  }

  revalidatePath('/onboarding');
  revalidatePath('/onboarding/website');
  redirect('/onboarding/channels');
}

export async function verifyOnboardingChannelsAction() {
  const { supabase, organizationId } = await requireManageableWorkspace();
  const admin = createAdminClient();

  const { data: connections, error: connectionError } = await admin
    .from('integration_connections')
    .select('id,provider,status')
    .eq('organization_id', organizationId)
    .eq('status', 'connected');

  if (connectionError) {
    throw new Error(`Unable to verify connected channels: ${connectionError.message}`);
  }

  if (!connections?.length) {
    redirect(
      '/onboarding/channels?error=No%20connected%20channel%20was%20found.%20Connect%20at%20least%20one%20provider%20or%20skip%20this%20step%20for%20now.',
    );
  }

  const completedSteps = withCompletedStep(
    await loadCompletedSteps(supabase, organizationId),
    'channels',
  );

  const { error } = await supabase
    .from('organization_onboarding')
    .update({
      status: 'in_progress',
      current_step: 'team',
      completed_steps: completedSteps,
    })
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Unable to verify channel onboarding: ${error.message}`);
  }

  revalidatePath('/onboarding');
  revalidatePath('/onboarding/channels');
  redirect('/onboarding/team');
}

export async function skipOnboardingChannelsAction() {
  const { supabase, organizationId } = await requireManageableWorkspace();
  const { error } = await supabase
    .from('organization_onboarding')
    .update({
      status: 'in_progress',
      current_step: 'team',
    })
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Unable to skip channel onboarding: ${error.message}`);
  }

  revalidatePath('/onboarding');
  redirect('/onboarding/team');
}

export async function verifyOnboardingTeamAction() {
  const { supabase, organizationId } = await requireManageableWorkspace();
  const admin = createAdminClient();

  const { data: memberships, error: membershipError } = await admin
    .from('organization_members')
    .select('user_id,role,active')
    .eq('organization_id', organizationId)
    .eq('role', 'admissions')
    .eq('active', true);

  if (membershipError) {
    throw new Error(`Unable to verify team access: ${membershipError.message}`);
  }

  const employeeIds = (memberships ?? []).map((membership) => membership.user_id);
  let activeEmployeeCount = 0;

  if (employeeIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id,active')
      .in('id', employeeIds)
      .eq('active', true);

    if (profileError) {
      throw new Error(`Unable to verify active team profiles: ${profileError.message}`);
    }

    activeEmployeeCount = profiles?.length ?? 0;
  }

  if (activeEmployeeCount === 0) {
    redirect(
      '/onboarding/team?error=No%20active%20employee%20was%20found.%20Add%20and%20activate%20a%20team%20member%20or%20choose%20the%20solo%20setup%20option.',
    );
  }

  const completedSteps = withCompletedStep(
    await loadCompletedSteps(supabase, organizationId),
    'team',
  );

  const { error } = await supabase
    .from('organization_onboarding')
    .update({
      status: 'in_progress',
      current_step: 'finish',
      completed_steps: completedSteps,
    })
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Unable to verify team onboarding: ${error.message}`);
  }

  revalidatePath('/onboarding');
  revalidatePath('/onboarding/team');
  redirect('/onboarding?step=finish');
}

export async function skipOnboardingTeamAction() {
  const { supabase, organizationId } = await requireManageableWorkspace();
  const { error } = await supabase
    .from('organization_onboarding')
    .update({
      status: 'in_progress',
      current_step: 'finish',
    })
    .eq('organization_id', organizationId);

  if (error) {
    throw new Error(`Unable to continue with solo onboarding: ${error.message}`);
  }

  revalidatePath('/onboarding');
  redirect('/onboarding?step=finish');
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
