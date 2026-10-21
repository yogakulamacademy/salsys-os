'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { initializeAutomationFlowDraft } from '@/lib/automation/initialize-flow-draft';
import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

type RecipeDefinition = {
  name: string;
  description: string;
  eventName: 'lead.created' | 'message.received' | 'lead.stage_changed' | 'payment.pending';
  followupTitle: string;
  delayMinutes: number;
};

const RECIPE_VERSION = 1;

const recipes: Record<string, RecipeDefinition> = {
  new_lead_response_sla: {
    name: 'New lead response SLA',
    description: 'Create an immediate internal follow-up whenever a new lead enters SalsysOS.',
    eventName: 'lead.created',
    followupTitle: 'Respond to new lead',
    delayMinutes: 0,
  },
  inbound_message_review: {
    name: 'Inbound message review',
    description: 'Create a reply task whenever an inbound customer message is recorded.',
    eventName: 'message.received',
    followupTitle: 'Review and reply to inbound message',
    delayMinutes: 0,
  },
  payment_pending_followup: {
    name: 'Payment pending follow-up',
    description: 'Create a controlled follow-up task one hour after a payment-pending event.',
    eventName: 'payment.pending',
    followupTitle: 'Follow up on pending payment',
    delayMinutes: 60,
  },
  lead_stage_change_review: {
    name: 'Lead stage change review',
    description: 'Create an internal review task whenever a lead changes stage.',
    eventName: 'lead.stage_changed',
    followupTitle: 'Review lead stage change',
    delayMinutes: 0,
  },
};

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/recipes?${type}=${encodeURIComponent(message)}`);
}

export async function installSmartTriggerRecipeAction(formData: FormData) {
  if (useMockData) {
    go('error', 'Mock mode is active. Starter recipe was not installed.');
  }

  const recipeKey = textValue(formData, 'recipe_key');
  const recipe = recipes[recipeKey];
  if (!recipe) {
    go('error', 'Unknown or unsupported starter recipe.');
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    go('error', 'Your session has expired. Sign in again.');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage, error: manageError } = await supabase.rpc('can_manage_organization', {
    p_organization_id: organizationId,
  });

  if (manageError || canManage !== true) {
    go('error', 'Only organization admins can install Smart Trigger recipes.');
  }

  const { data: existing, error: existingError } = await supabase
    .from('automation_workflows')
    .select('id,name,status,metadata')
    .eq('organization_id', organizationId)
    .neq('status', 'archived')
    .contains('metadata', { recipe_key: recipeKey })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    go('error', existingError.message);
  }

  if (existing?.id) {
    go('notice', `${recipe.name} is already installed as a ${existing.status} workflow.`);
  }

  const { data: workflow, error: workflowError } = await supabase
    .from('automation_workflows')
    .insert({
      organization_id: organizationId,
      name: recipe.name,
      description: recipe.description,
      status: 'draft',
      approval_mode: 'human_review',
      origin: 'recipe',
      stop_on_reply: true,
      max_attempts: 2,
      runtime_flow_enabled: false,
      created_by: user.id,
      metadata: {
        builder_version: 'v1',
        safety_mode: 'draft_only',
        recipe_key: recipeKey,
        recipe_version: RECIPE_VERSION,
        installed_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (workflowError || !workflow?.id) {
    go('error', workflowError?.message || 'Unable to install starter recipe.');
  }

  const [{ error: triggerError }, { error: actionError }] = await Promise.all([
    supabase.from('automation_triggers').insert({
      organization_id: organizationId,
      workflow_id: workflow.id,
      trigger_type: 'event',
      event_name: recipe.eventName,
      position: 0,
      enabled: true,
      config: { recipe_key: recipeKey, recipe_version: RECIPE_VERSION },
    }),
    supabase.from('automation_actions').insert({
      organization_id: organizationId,
      workflow_id: workflow.id,
      action_type: 'create_followup',
      position: 0,
      enabled: true,
      requires_approval: false,
      config: {
        title: recipe.followupTitle,
        delay_minutes: recipe.delayMinutes,
        recipe_key: recipeKey,
        recipe_version: RECIPE_VERSION,
      },
    }),
  ]);

  try {
    if (triggerError || actionError) {
      throw triggerError || actionError;
    }

    await initializeAutomationFlowDraft({
      organizationId,
      workflowId: workflow.id,
      userId: user.id,
      eventName: recipe.eventName,
      followupTitle: recipe.followupTitle,
      followupDelayMinutes: recipe.delayMinutes,
    });
  } catch (error) {
    await supabase
      .from('automation_workflows')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', workflow.id);

    go(
      'error',
      error instanceof Error
        ? error.message
        : 'Unable to configure starter recipe.',
    );
  }

  revalidatePath('/automation');
  revalidatePath('/automation/triggers');
  revalidatePath('/automation/recipes');
  revalidatePath('/automation/flow-builder');
  revalidatePath('/automation/readiness');
  go('notice', `${recipe.name} installed as an editable draft flow. Runtime and customer messaging remain disabled.`);
}
