'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/flow-builder-test?${type}=${encodeURIComponent(message)}`);
}

async function adminContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) go('error', 'Your session has expired. Sign in again.');

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage } = await supabase.rpc('can_manage_organization', {
    p_organization_id: organizationId,
  });

  if (canManage !== true) {
    go('error', 'Only organization admins can create controlled flow graphs.');
  }

  return { organizationId };
}

export async function createControlledConversationFlowAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  if (!workflowId) go('error', 'Workflow is required.');

  const { organizationId } = await adminContext();
  const admin = createAdminClient();

  const { data: workflow, error: workflowError } = await admin
    .from('automation_workflows')
    .select('id,name,status')
    .eq('organization_id', organizationId)
    .eq('id', workflowId)
    .maybeSingle();

  if (workflowError || !workflow) {
    go('error', workflowError?.message || 'Workflow was not found in this organization.');
  }

  const versionNumber = 1;

  const { data: existingNodes, error: existingNodesError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', versionNumber);

  if (existingNodesError) go('error', existingNodesError.message);

  if ((existingNodes ?? []).length > 0) {
    go('notice', 'Flow graph already exists for this workflow version. No duplicate nodes were created.');
  }

  const nodeDefinitions = [
    {
      node_key: 'trigger_new_lead',
      node_type: 'trigger',
      label: 'New lead created',
      config: { event_name: 'lead.created' },
      position_x: 80,
      position_y: 160,
    },
    {
      node_key: 'wait_for_reply',
      node_type: 'wait_for_reply',
      label: 'Wait for customer reply',
      config: { timeout_minutes: 360, stop_on_reply: true },
      position_x: 360,
      position_y: 160,
    },
    {
      node_key: 'branch_reply_outcome',
      node_type: 'condition',
      label: 'Did the customer reply?',
      config: { variable: 'reply_outcome', operator: 'equals' },
      position_x: 680,
      position_y: 160,
    },
    {
      node_key: 'end_replied',
      node_type: 'end',
      label: 'Reply branch',
      config: { outcome: 'reply_received' },
      position_x: 980,
      position_y: 60,
    },
    {
      node_key: 'end_no_reply',
      node_type: 'end',
      label: 'No reply branch',
      config: { outcome: 'reply_timeout' },
      position_x: 980,
      position_y: 260,
    },
  ];

  const { data: nodes, error: nodeError } = await admin
    .from('automation_flow_nodes')
    .insert(
      nodeDefinitions.map((node) => ({
        organization_id: organizationId,
        workflow_id: workflowId,
        version_number: versionNumber,
        ...node,
      })),
    )
    .select('id,node_key');

  if (nodeError || !nodes) {
    go('error', nodeError?.message || 'Unable to create controlled flow nodes.');
  }

  const nodeByKey = new Map(nodes.map((node) => [String(node.node_key), String(node.id)]));

  const triggerId = nodeByKey.get('trigger_new_lead');
  const waitId = nodeByKey.get('wait_for_reply');
  const conditionId = nodeByKey.get('branch_reply_outcome');
  const repliedId = nodeByKey.get('end_replied');
  const noReplyId = nodeByKey.get('end_no_reply');

  if (!triggerId || !waitId || !conditionId || !repliedId || !noReplyId) {
    go('error', 'Controlled flow graph node mapping is incomplete.');
  }

  const edges = [
    {
      source_node_id: triggerId,
      target_node_id: waitId,
      edge_key: 'next',
      label: 'Start conversation wait',
      condition: {},
      priority: 0,
    },
    {
      source_node_id: waitId,
      target_node_id: conditionId,
      edge_key: 'resolved',
      label: 'Reply wait resolved',
      condition: {},
      priority: 0,
    },
    {
      source_node_id: conditionId,
      target_node_id: repliedId,
      edge_key: 'reply_received',
      label: 'Reply received',
      condition: { variable: 'reply_outcome', equals: 'reply_received' },
      priority: 0,
    },
    {
      source_node_id: conditionId,
      target_node_id: noReplyId,
      edge_key: 'reply_timeout',
      label: 'No reply',
      condition: { variable: 'reply_outcome', equals: 'reply_timeout' },
      priority: 1,
    },
  ];

  const { error: edgeError } = await admin.from('automation_flow_edges').insert(
    edges.map((edge) => ({
      organization_id: organizationId,
      workflow_id: workflowId,
      version_number: versionNumber,
      ...edge,
    })),
  );

  if (edgeError) go('error', edgeError.message);

  revalidatePath('/automation/flow-builder-test');
  go('notice', 'Controlled conversation flow graph created: 5 nodes and 4 edges. Nothing was executed and no customer message was sent.');
}
