'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { initializeAutomationFlowDraft } from '@/lib/automation/initialize-flow-draft';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function automationRedirect(
  type: 'notice' | 'error',
  message: string,
  path = '/automation/triggers',
): never {
  redirect(`${path}?${type}=${encodeURIComponent(message)}`);
}

async function currentContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    automationRedirect('error', 'Your session has expired. Sign in again.');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage, error: manageError } = await supabase.rpc(
    'can_manage_organization',
    { p_organization_id: organizationId },
  );

  if (manageError || canManage !== true) {
    automationRedirect('error', 'Only organization admins can manage Smart Triggers.');
  }

  return { supabase, user, organizationId };
}

export async function createSmartTriggerWorkflowAction(formData: FormData) {
  if (useMockData) {
    automationRedirect('error', 'Mock mode is active. Smart Triggers were not changed.');
  }

  const name = textValue(formData, 'name');
  const description = textValue(formData, 'description');
  const eventName = textValue(formData, 'event_name') || 'lead.created';
  const followupTitle = textValue(formData, 'followup_title') || 'Follow up with new lead';
  const followupDelayMinutes = Math.max(
    0,
    Math.min(Number(textValue(formData, 'followup_delay_minutes') || '0') || 0, 10080),
  );
  const returnTo = textValue(formData, 'return_to');

  if (!name) {
    automationRedirect('error', 'Workflow name is required.');
  }

  const { supabase, user, organizationId } = await currentContext();

  const { data: workflow, error: workflowError } = await supabase
    .from('automation_workflows')
    .insert({
      organization_id: organizationId,
      name,
      description: description || null,
      status: 'draft',
      approval_mode: 'human_review',
      origin: 'custom',
      stop_on_reply: true,
      max_attempts: 2,
      runtime_flow_enabled: false,
      created_by: user.id,
      metadata: {
        builder_version: 'v1',
        safety_mode: 'draft_only',
      },
    })
    .select('id')
    .single();

  if (workflowError || !workflow?.id) {
    automationRedirect('error', workflowError?.message || 'Unable to create workflow.');
  }

  const [{ error: triggerError }, { error: actionError }] = await Promise.all([
    supabase.from('automation_triggers').insert({
      organization_id: organizationId,
      workflow_id: workflow.id,
      trigger_type: 'event',
      event_name: eventName,
      position: 0,
      enabled: true,
      config: {},
    }),
    supabase.from('automation_actions').insert({
      organization_id: organizationId,
      workflow_id: workflow.id,
      action_type: 'create_followup',
      position: 0,
      enabled: true,
      requires_approval: false,
      config: {
        title: followupTitle,
        delay_minutes: followupDelayMinutes,
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
      eventName,
      followupTitle,
      followupDelayMinutes,
    });
  } catch (error) {
    await supabase
      .from('automation_workflows')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', workflow.id);

    automationRedirect(
      'error',
      error instanceof Error ? error.message : 'Unable to configure workflow.',
    );
  }

  revalidatePath('/automation');
  revalidatePath('/automation/triggers');
  revalidatePath('/automation/flow-builder');
  revalidatePath('/automation/readiness');

  const notice =
    'Draft flow created. Nothing will run automatically until the flow is validated, published and runtime is explicitly enabled.';

  if (returnTo === 'flow_builder') {
    const query = new URLSearchParams({ workflow: workflow.id, notice });
    redirect(`/automation/flow-builder?${query.toString()}`);
  }

  automationRedirect('notice', notice);
}

export async function archiveSmartTriggerWorkflowAction(formData: FormData) {
  if (useMockData) {
    automationRedirect('error', 'Mock mode is active. Smart Triggers were not changed.');
  }

  const workflowId = textValue(formData, 'workflow_id');
  if (!workflowId) {
    automationRedirect('error', 'Workflow is required.');
  }

  const { supabase, organizationId } = await currentContext();
  const { error } = await supabase
    .from('automation_workflows')
    .update({ status: 'archived' })
    .eq('organization_id', organizationId)
    .eq('id', workflowId);

  if (error) {
    automationRedirect('error', error.message);
  }

  revalidatePath('/automation');
  revalidatePath('/automation/triggers');
  revalidatePath('/automation/flow-builder');
  automationRedirect('notice', 'Workflow archived.');
}
