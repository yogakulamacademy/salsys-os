import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

type SmartTriggerRule = {
  field: 'source' | 'country' | 'stage' | 'priority' | 'course';
  op: 'is' | 'is_not';
  value: string;
};

type SmartTriggerExpression = {
  mode: 'all' | 'specific';
  groupsJoin: 'AND' | 'OR';
  groups: Array<{ join: 'AND' | 'OR'; rules: SmartTriggerRule[] }>;
};

type InitializeFlowDraftParams = {
  organizationId: string;
  workflowId: string;
  userId: string;
  eventName: string;
  actionType?: string;
  actionTitle?: string;
  actionOwner?: string;
  followupTitle?: string;
  followupDelayMinutes: number;
  conditionExpression?: SmartTriggerExpression;
};

const eventLabels: Record<string, string> = {
  'lead.created': 'New lead created',
  'message.received': 'Inbound message received',
  'lead.stage_changed': 'Lead stage changed',
  'payment.pending': 'Payment pending',
};

const actionLabels: Record<string, string> = {
  create_followup: 'Create follow-up task',
  assign_owner: 'Assign lead owner',
  notify_user: 'Notify teammate',
};

export async function initializeAutomationFlowDraft({
  organizationId,
  workflowId,
  userId,
  eventName,
  actionType = 'create_followup',
  actionTitle,
  actionOwner = 'lead_owner',
  followupTitle,
  followupDelayMinutes,
  conditionExpression = { mode: 'all', groupsJoin: 'OR', groups: [] },
}: InitializeFlowDraftParams) {
  const admin = createAdminClient();
  const versionNumber = 1;
  const resolvedTitle = actionTitle || followupTitle || 'Follow up';
  const hasConditions = conditionExpression.mode === 'specific';

  const { error: versionError } = await admin.from('automation_flow_versions').insert({
    organization_id: organizationId,
    workflow_id: workflowId,
    version_number: versionNumber,
    status: 'draft',
    created_by: userId,
    validation_snapshot: {},
  });

  if (versionError) throw new Error(`Unable to create the first flow draft: ${versionError.message}`);

  const nodePayload = [
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
    ...(hasConditions
      ? [
          {
            organization_id: organizationId,
            workflow_id: workflowId,
            version_number: versionNumber,
            node_key: 'smart_trigger_conditions',
            node_type: 'condition',
            label: 'Smart Trigger conditions',
            config: {
              variable: 'smart_trigger_expression',
              operator: 'equals',
              expression_version: 1,
              expression: conditionExpression,
              runtime_support: 'pending',
            },
            position_x: 390,
            position_y: 160,
          },
        ]
      : []),
    {
      organization_id: organizationId,
      workflow_id: workflowId,
      version_number: versionNumber,
      node_key: 'smart_trigger_action',
      node_type: 'action',
      label: resolvedTitle || actionLabels[actionType] || 'Internal action',
      config: {
        action_type: actionType,
        title: resolvedTitle,
        owner_mode: actionOwner,
        delay_minutes: followupDelayMinutes,
      },
      position_x: hasConditions ? 700 : 390,
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
      position_x: hasConditions ? 1010 : 700,
      position_y: 160,
    },
  ];

  const { data: nodeRows, error: nodeError } = await admin
    .from('automation_flow_nodes')
    .insert(nodePayload)
    .select('id,node_key');

  if (nodeError || !nodeRows) {
    throw new Error(`Unable to create the starter flow nodes: ${nodeError?.message || 'Unknown error'}`);
  }

  const nodes = new Map(nodeRows.map((node) => [String(node.node_key), String(node.id)]));
  const triggerNodeId = nodes.get('trigger_entry');
  const conditionNodeId = nodes.get('smart_trigger_conditions');
  const actionNodeId = nodes.get('smart_trigger_action');
  const endNodeId = nodes.get('end_complete');

  if (!triggerNodeId || !actionNodeId || !endNodeId || (hasConditions && !conditionNodeId)) {
    throw new Error('Unable to resolve the starter flow nodes.');
  }

  const edgePayload = hasConditions
    ? [
        {
          organization_id: organizationId,
          workflow_id: workflowId,
          version_number: versionNumber,
          source_node_id: triggerNodeId,
          target_node_id: conditionNodeId!,
          edge_key: 'evaluate',
          label: 'Evaluate conditions',
          condition: {},
          priority: 0,
        },
        {
          organization_id: organizationId,
          workflow_id: workflowId,
          version_number: versionNumber,
          source_node_id: conditionNodeId!,
          target_node_id: actionNodeId,
          edge_key: 'matched',
          label: 'Matched',
          condition: { equals: true },
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
      ]
    : [
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
      ];

  const { error: edgeError } = await admin.from('automation_flow_edges').insert(edgePayload);
  if (edgeError) throw new Error(`Unable to connect the starter flow: ${edgeError.message}`);

  const { error: workflowUpdateError } = await admin
    .from('automation_workflows')
    .update({ current_draft_version: versionNumber, runtime_flow_enabled: false })
    .eq('organization_id', organizationId)
    .eq('id', workflowId);

  if (workflowUpdateError) {
    throw new Error(`Unable to attach the starter draft to the workflow: ${workflowUpdateError.message}`);
  }

  return { versionNumber };
}