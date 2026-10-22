import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

type InitializeFlowDraftParams = {
  organizationId: string;
  workflowId: string;
  userId: string;
  eventName: string;
  followupTitle: string;
  followupDelayMinutes: number;
};

const eventLabels: Record<string, string> = {
  'lead.created': 'New lead created',
  'message.received': 'Inbound message received',
  'lead.stage_changed': 'Lead stage changed',
  'payment.pending': 'Payment pending',
};

export async function initializeAutomationFlowDraft({
  organizationId,
  workflowId,
  userId,
  eventName,
  followupTitle,
  followupDelayMinutes,
}: InitializeFlowDraftParams) {
  const admin = createAdminClient();
  const versionNumber = 1;

  const { error: versionError } = await admin.from('automation_flow_versions').insert({
    organization_id: organizationId,
    workflow_id: workflowId,
    version_number: versionNumber,
    status: 'draft',
    created_by: userId,
    validation_snapshot: {},
  });

  if (versionError) {
    throw new Error(`Unable to create the first flow draft: ${versionError.message}`);
  }

  const { data: nodeRows, error: nodeError } = await admin
    .from('automation_flow_nodes')
    .insert([
      {
        organization_id: organizationId,
        workflow_id: workflowId,
        version_number: versionNumber,
        node_key: 'trigger_entry',
        node_type: 'trigger',
        label: eventLabels[eventName] || 'Automation trigger',
        config: { event_name: eventName },
        position_x: 80,
        position_y: 160,
      },
      {
        organization_id: organizationId,
        workflow_id: workflowId,
        version_number: versionNumber,
        node_key: 'create_followup',
        node_type: 'action',
        label: followupTitle || 'Create follow-up',
        config: {
          action_type: 'create_followup',
          title: followupTitle || 'Follow up',
          delay_minutes: followupDelayMinutes,
        },
        position_x: 390,
        position_y: 160,
      },
      {
        organization_id: organizationId,
        workflow_id: workflowId,
        version_number: versionNumber,
        node_key: 'end_complete',
        node_type: 'end',
        label: 'Completed',
        config: { outcome: 'completed' },
        position_x: 700,
        position_y: 160,
      },
    ])
    .select('id,node_key');

  if (nodeError || !nodeRows) {
    throw new Error(`Unable to create the starter flow nodes: ${nodeError?.message || 'Unknown error'}`);
  }

  const nodes = new Map(nodeRows.map((node) => [String(node.node_key), String(node.id)]));
  const triggerNodeId = nodes.get('trigger_entry');
  const actionNodeId = nodes.get('create_followup');
  const endNodeId = nodes.get('end_complete');

  if (!triggerNodeId || !actionNodeId || !endNodeId) {
    throw new Error('Unable to resolve the starter flow nodes.');
  }

  const { error: edgeError } = await admin.from('automation_flow_edges').insert([
    {
      organization_id: organizationId,
      workflow_id: workflowId,
      version_number: versionNumber,
      source_node_id: triggerNodeId,
      target_node_id: actionNodeId,
      edge_key: 'next',
      label: 'Continue',
      condition: {},
      priority: 0,
    },
    {
      organization_id: organizationId,
      workflow_id: workflowId,
      version_number: versionNumber,
      source_node_id: actionNodeId,
      target_node_id: endNodeId,
      edge_key: 'complete',
      label: 'Complete',
      condition: {},
      priority: 0,
    },
  ]);

  if (edgeError) {
    throw new Error(`Unable to connect the starter flow: ${edgeError.message}`);
  }

  const { error: workflowUpdateError } = await admin
    .from('automation_workflows')
    .update({
      current_draft_version: versionNumber,
      runtime_flow_enabled: false,
    })
    .eq('organization_id', organizationId)
    .eq('id', workflowId);

  if (workflowUpdateError) {
    throw new Error(`Unable to attach the starter draft to the workflow: ${workflowUpdateError.message}`);
  }

  return { versionNumber };
}
