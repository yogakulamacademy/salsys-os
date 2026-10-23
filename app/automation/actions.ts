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

type SmartTriggerRule = {
  field: 'source' | 'country' | 'stage' | 'priority' | 'course';
  op: 'is' | 'is_not';
  value: string;
};

type SmartTriggerGroup = {
  join: 'AND' | 'OR';
  rules: SmartTriggerRule[];
};

type SmartTriggerExpression = {
  mode: 'all' | 'specific';
  groupsJoin: 'AND' | 'OR';
  groups: SmartTriggerGroup[];
};

const allowedRuleFields = new Set(['source', 'country', 'stage', 'priority', 'course']);

function parseSmartTriggerExpression(raw: string): SmartTriggerExpression {
  if (!raw) return { mode: 'all', groupsJoin: 'OR', groups: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Smart Trigger conditions are invalid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Smart Trigger conditions are invalid.');
  }

  const input = parsed as Record<string, unknown>;
  const mode = input.mode === 'specific' ? 'specific' : 'all';
  const groupsJoin = input.groupsJoin === 'AND' ? 'AND' : 'OR';
  const inputGroups = Array.isArray(input.groups) ? input.groups : [];

  if (inputGroups.length > 4) throw new Error('Smart Triggers support up to 4 condition groups.');

  const groups: SmartTriggerGroup[] = inputGroups.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('A condition group is invalid.');
    }
    const group = candidate as Record<string, unknown>;
    const rulesRaw = Array.isArray(group.rules) ? group.rules : [];
    if (rulesRaw.length < 1 || rulesRaw.length > 6) {
      throw new Error('Each condition group must contain between 1 and 6 rules.');
    }

    const rules: SmartTriggerRule[] = rulesRaw.map((candidateRule) => {
      if (!candidateRule || typeof candidateRule !== 'object' || Array.isArray(candidateRule)) {
        throw new Error('A Smart Trigger rule is invalid.');
      }
      const rule = candidateRule as Record<string, unknown>;
      const field = String(rule.field ?? '').trim();
      const op = rule.op === 'is_not' ? 'is_not' : 'is';
      const value = String(rule.value ?? '').trim().slice(0, 160);
      if (!allowedRuleFields.has(field) || !value) {
        throw new Error('Every Smart Trigger rule needs a supported field and value.');
      }
      return { field: field as SmartTriggerRule['field'], op, value };
    });

    return { join: group.join === 'OR' ? 'OR' : 'AND', rules };
  });

  if (mode === 'specific' && groups.length === 0) {
    throw new Error('Add at least one condition group or choose Every lead.');
  }

  return { mode, groupsJoin, groups: mode === 'specific' ? groups : [] };
}

export async function createSmartTriggerWorkflowAction(formData: FormData) {
  if (useMockData) {
    automationRedirect('error', 'Mock mode is active. Smart Triggers were not changed.');
  }

  const name = textValue(formData, 'name');
  const description = textValue(formData, 'description');
  const eventName = textValue(formData, 'event_name') || 'lead.created';
  const actionType = textValue(formData, 'action_type') || 'create_followup';
  const actionTitle = textValue(formData, 'action_title') || 'Follow up with new lead';
  const actionOwner = textValue(formData, 'action_owner') || 'lead_owner';
  const followupDelayMinutes = Math.max(
    0,
    Math.min(Number(textValue(formData, 'followup_delay_minutes') || '0') || 0, 10080),
  );
  const returnTo = textValue(formData, 'return_to');

  if (!name) automationRedirect('error', 'Workflow name is required.');
  if (name.length > 180) automationRedirect('error', 'Workflow name must be 180 characters or fewer.');
  if (!['lead.created', 'message.received', 'lead.stage_changed', 'payment.pending'].includes(eventName)) {
    automationRedirect('error', 'Unsupported Smart Trigger event.');
  }
  if (!['create_followup', 'assign_owner', 'notify_user'].includes(actionType)) {
    automationRedirect('error', 'Unsupported Smart Trigger action.');
  }

  let conditionExpression: SmartTriggerExpression;
  try {
    conditionExpression = parseSmartTriggerExpression(textValue(formData, 'condition_expression'));
  } catch (error) {
    automationRedirect('error', error instanceof Error ? error.message : 'Smart Trigger conditions are invalid.');
  }

  const hasRuntimePendingConditions = conditionExpression.mode === 'specific';
  const hasRuntimePendingAction = actionType !== 'create_followup';
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
        builder_version: 'smart_triggers_v2',
        safety_mode: 'draft_only',
        smart_trigger_conditions: conditionExpression,
        smart_trigger_condition_runtime_pending: hasRuntimePendingConditions,
        smart_trigger_action_runtime_pending: hasRuntimePendingAction,
      },
    })
    .select('id')
    .single();

  if (workflowError || !workflow?.id) {
    automationRedirect('error', workflowError?.message || 'Unable to create workflow.');
  }

  const actionConfig = {
    title: actionTitle,
    owner_mode: actionOwner,
    delay_minutes: followupDelayMinutes,
  };

  const [{ error: triggerError }, { error: actionError }] = await Promise.all([
    supabase.from('automation_triggers').insert({
      organization_id: organizationId,
      workflow_id: workflow.id,
      trigger_type: 'event',
      event_name: eventName,
      position: 0,
      enabled: true,
      config: {
        condition_expression: conditionExpression,
        expression_version: 1,
      },
    }),
    supabase.from('automation_actions').insert({
      organization_id: organizationId,
      workflow_id: workflow.id,
      action_type: actionType,
      position: 0,
      enabled: true,
      requires_approval: false,
      config: actionConfig,
    }),
  ]);

  try {
    if (triggerError || actionError) throw triggerError || actionError;

    await initializeAutomationFlowDraft({
      organizationId,
      workflowId: workflow.id,
      userId: user.id,
      eventName,
      actionType,
      actionTitle,
      actionOwner,
      followupDelayMinutes,
      conditionExpression,
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

  const pendingReasons = [
    hasRuntimePendingConditions ? 'AND/OR condition evaluation' : '',
    hasRuntimePendingAction ? `${actionType.replaceAll('_', ' ')} execution` : '',
  ].filter(Boolean);
  const notice = pendingReasons.length > 0
    ? `Smart Trigger draft saved. Runtime activation stays blocked until ${pendingReasons.join(' and ')} is supported by the execution engine.`
    : 'Draft flow created. Nothing will run automatically until the flow is validated, published and runtime is explicitly enabled.';

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
  if (!workflowId) automationRedirect('error', 'Workflow is required.');

  const { supabase, organizationId } = await currentContext();
  const { error } = await supabase
    .from('automation_workflows')
    .update({ status: 'archived' })
    .eq('organization_id', organizationId)
    .eq('id', workflowId);

  if (error) automationRedirect('error', error.message);

  revalidatePath('/automation');
  revalidatePath('/automation/triggers');
  revalidatePath('/automation/flow-builder');
  automationRedirect('notice', 'Workflow archived.');
}
