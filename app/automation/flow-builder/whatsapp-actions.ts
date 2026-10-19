'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

const INTERNAL_ACTIONS = new Set(['create_followup', 'assign_owner', 'add_tag', 'notify_user']);

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/flow-builder?${type}=${encodeURIComponent(message)}`);
}

async function adminContext() {
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
    go('error', 'Only organization admins can configure guarded WhatsApp flow actions.');
  }

  return { organizationId };
}

async function loadEditableActionNode(params: {
  organizationId: string;
  workflowId: string;
  nodeId: string;
  versionNumber: number;
}) {
  const admin = createAdminClient();
  const [{ data: workflow, error: workflowError }, { data: node, error: nodeError }] = await Promise.all([
    admin
      .from('automation_workflows')
      .select('id,current_draft_version')
      .eq('organization_id', params.organizationId)
      .eq('id', params.workflowId)
      .maybeSingle(),
    admin
      .from('automation_flow_nodes')
      .select('id,node_type,label,config')
      .eq('organization_id', params.organizationId)
      .eq('workflow_id', params.workflowId)
      .eq('version_number', params.versionNumber)
      .eq('id', params.nodeId)
      .maybeSingle(),
  ]);

  if (workflowError || !workflow) {
    go('error', workflowError?.message || 'Workflow was not found in this organization.');
  }
  if (workflow.current_draft_version !== params.versionNumber) {
    go('error', 'Actions can only be configured on the current draft flow version.');
  }
  if (nodeError || !node || node.node_type !== 'action') {
    go('error', nodeError?.message || 'Selected node is not an editable action node.');
  }

  return { admin, node };
}

export async function configureGuardedWhatsAppSendNodeAction(formData: FormData) {
  const workflowId = textValue(formData, 'workflow_id');
  const nodeId = textValue(formData, 'node_id');
  const templateId = textValue(formData, 'template_id');
  const label = textValue(formData, 'label');
  const versionNumber = Number(textValue(formData, 'version_number') || '0');

  if (!workflowId || !nodeId || !templateId || !label) {
    go('error', 'Workflow, action node, label and approved WhatsApp template are required.');
  }
  if (label.length > 120) {
    go('error', 'Node label must be 120 characters or fewer.');
  }
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    go('error', 'Flow version is invalid.');
  }

  const { organizationId } = await adminContext();
  const { admin, node } = await loadEditableActionNode({
    organizationId,
    workflowId,
    nodeId,
    versionNumber,
  });

  const { data: template, error: templateError } = await admin
    .from('automation_whatsapp_templates')
    .select('id,whatsapp_account_id,template_name,language_code,approval_status,active')
    .eq('organization_id', organizationId)
    .eq('id', templateId)
    .eq('approval_status', 'approved')
    .eq('active', true)
    .maybeSingle();

  if (templateError || !template) {
    go('error', templateError?.message || 'Select an active provider-approved template synchronized for this workspace.');
  }

  const { data: account, error: accountError } = await admin
    .from('whatsapp_accounts')
    .select('id,active')
    .eq('organization_id', organizationId)
    .eq('id', template.whatsapp_account_id)
    .eq('active', true)
    .maybeSingle();

  if (accountError || !account) {
    go('error', accountError?.message || 'The template is bound to an inactive or unavailable WhatsApp account.');
  }

  const currentConfig =
    node.config && typeof node.config === 'object' && !Array.isArray(node.config)
      ? (node.config as Record<string, unknown>)
      : {};

  const config = {
    ...currentConfig,
    action_type: 'send_message',
    channel: 'whatsapp',
    requires_approval: true,
    whatsapp_account_id: template.whatsapp_account_id,
    template_name: template.template_name,
    template_language: template.language_code,
    request_payload: {
      message_type: 'template',
      components: [],
      human_approved: false,
      ai_generated: false,
    },
  };

  const { error: updateError } = await admin
    .from('automation_flow_nodes')
    .update({ label, config })
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', versionNumber)
    .eq('id', nodeId)
    .eq('node_type', 'action');

  if (updateError) {
    go('error', updateError.message);
  }

  revalidatePath('/automation/flow-builder');
  revalidatePath('/automation/readiness');
  go(
    'notice',
    `Guarded WhatsApp template ${template.template_name} (${template.language_code}) configured. Human approval is forced ON; nothing was sent and runtime state was not changed.`,
  );
}

export async function convertGuardedWhatsAppNodeToInternalAction(formData: FormData) {
  const workflowId = textValue(formData, 'workflow_id');
  const nodeId = textValue(formData, 'node_id');
  const label = textValue(formData, 'label');
  const actionType = textValue(formData, 'action_type');
  const versionNumber = Number(textValue(formData, 'version_number') || '0');

  if (!workflowId || !nodeId || !label || !INTERNAL_ACTIONS.has(actionType)) {
    go('error', 'A valid workflow, node, label and safe internal action are required.');
  }
  if (label.length > 120) {
    go('error', 'Node label must be 120 characters or fewer.');
  }
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    go('error', 'Flow version is invalid.');
  }

  const { organizationId } = await adminContext();
  const { admin, node } = await loadEditableActionNode({
    organizationId,
    workflowId,
    nodeId,
    versionNumber,
  });

  const currentConfig =
    node.config && typeof node.config === 'object' && !Array.isArray(node.config)
      ? (node.config as Record<string, unknown>)
      : {};

  const {
    channel: _channel,
    requires_approval: _requiresApproval,
    whatsapp_account_id: _accountId,
    template_name: _templateName,
    template_language: _templateLanguage,
    request_payload: _requestPayload,
    ...remainingConfig
  } = currentConfig;

  const { error: updateError } = await admin
    .from('automation_flow_nodes')
    .update({
      label,
      config: {
        ...remainingConfig,
        action_type: actionType,
      },
    })
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', versionNumber)
    .eq('id', nodeId)
    .eq('node_type', 'action');

  if (updateError) {
    go('error', updateError.message);
  }

  revalidatePath('/automation/flow-builder');
  revalidatePath('/automation/readiness');
  go('notice', 'WhatsApp send configuration removed. The node is now a safe internal action.');
}
