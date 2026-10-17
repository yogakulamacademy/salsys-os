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
  redirect(`/automation/flow-validation-test?${type}=${encodeURIComponent(message)}`);
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
    go('error', 'Only organization admins can validate conversation flows.');
  }

  return { organizationId };
}

type NodeRow = {
  id: string;
  node_key: string;
  node_type: string;
  label: string;
  config: Record<string, unknown> | null;
  enabled: boolean;
};

type EdgeRow = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_key: string;
  label: string | null;
  condition: Record<string, unknown> | null;
};

function textConfig(config: Record<string, unknown> | null, key: string) {
  const raw = config?.[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function numberConfig(config: Record<string, unknown> | null, key: string) {
  const raw = Number(config?.[key]);
  return Number.isFinite(raw) ? raw : null;
}

function boolConfig(config: Record<string, unknown> | null, key: string) {
  const raw = config?.[key];
  return typeof raw === 'boolean' ? raw : null;
}

function validateGraph(nodes: NodeRow[], edges: EdgeRow[]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const enabledNodes = nodes.filter((node) => node.enabled !== false);
  const nodeMap = new Map(enabledNodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, EdgeRow[]>();

  for (const node of enabledNodes) outgoing.set(node.id, []);

  for (const edge of edges) {
    if (!nodeMap.has(edge.source_node_id) || !nodeMap.has(edge.target_node_id)) {
      errors.push(`Connection ${edge.edge_key} points to a missing or disabled node.`);
      continue;
    }
    outgoing.get(edge.source_node_id)?.push(edge);
  }

  const triggers = enabledNodes.filter((node) => node.node_type === 'trigger');
  if (triggers.length !== 1) {
    errors.push(`Flow must contain exactly one enabled trigger node; found ${triggers.length}.`);
  }

  const trigger = triggers[0] ?? null;
  if (trigger && (outgoing.get(trigger.id)?.length ?? 0) === 0) {
    errors.push('Trigger node must have an outgoing connection.');
  }

  const terminalTypes = new Set(['end', 'human_handoff']);
  const safeActionTypes = new Set(['create_followup', 'assign_owner', 'add_tag', 'notify_user']);

  for (const node of enabledNodes) {
    const nodeEdges = outgoing.get(node.id) ?? [];

    if (terminalTypes.has(node.node_type)) {
      if (nodeEdges.length > 0) {
        errors.push(`${node.label} is terminal and cannot have outgoing connections.`);
      }
      continue;
    }

    if (nodeEdges.length === 0) {
      errors.push(`${node.label} has no outgoing connection.`);
    }

    if (node.node_type === 'condition') {
      if (nodeEdges.length < 2) {
        errors.push(`${node.label} must have at least two branches.`);
      }
      const values = nodeEdges.map((edge) => textConfig(edge.condition, 'equals')).filter(Boolean);
      const unique = new Set(values);
      if (values.length !== nodeEdges.length) {
        errors.push(`${node.label} has a branch without a branch value.`);
      }
      if (unique.size !== values.length) {
        errors.push(`${node.label} has duplicate branch values.`);
      }
    }

    if (node.node_type === 'wait') {
      const delay = numberConfig(node.config, 'delay_minutes');
      if (delay === null || delay < 1 || delay > 10080) {
        errors.push(`${node.label} has an invalid delay.`);
      }
    }

    if (node.node_type === 'wait_for_reply') {
      const timeout = numberConfig(node.config, 'timeout_minutes');
      if (timeout === null || timeout < 1 || timeout > 10080) {
        errors.push(`${node.label} has an invalid reply timeout.`);
      }
      if (boolConfig(node.config, 'stop_on_reply') !== true) {
        warnings.push(`${node.label} does not currently stop the pending no-reply path when a reply arrives.`);
      }
    }

    if (node.node_type === 'action') {
      const actionType = textConfig(node.config, 'action_type');
      if (!safeActionTypes.has(actionType)) {
        errors.push(`${node.label} uses an action that is not allowed in controlled V1.`);
      }
    }
  }

  if (trigger) {
    const reachable = new Set<string>();
    const visiting = new Set<string>();
    let hasCycle = false;

    function walk(nodeId: string) {
      if (visiting.has(nodeId)) {
        hasCycle = true;
        return;
      }
      if (reachable.has(nodeId)) return;

      visiting.add(nodeId);
      reachable.add(nodeId);
      for (const edge of outgoing.get(nodeId) ?? []) {
        walk(edge.target_node_id);
      }
      visiting.delete(nodeId);
    }

    walk(trigger.id);

    for (const node of enabledNodes) {
      if (!reachable.has(node.id)) {
        errors.push(`${node.label} is not reachable from the trigger.`);
      }
    }

    if (hasCycle) {
      errors.push('Cycles are blocked in controlled V1. Remove looped connections before publish eligibility.');
    }
  }

  if (!enabledNodes.some((node) => terminalTypes.has(node.node_type))) {
    errors.push('Flow must contain at least one terminal End or Human handoff node.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checked_at: new Date().toISOString(),
    node_count: enabledNodes.length,
    edge_count: edges.length,
    validator_version: 'v1',
    customer_messaging_enabled: false,
  };
}

export async function validateControlledFlowAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const versionNumber = Number(value(formData, 'version_number') || '1');

  if (!workflowId) go('error', 'Workflow is required.');
  if (!Number.isInteger(versionNumber) || versionNumber < 1) go('error', 'Flow version is invalid.');

  const { organizationId } = await adminContext();
  const admin = createAdminClient();

  const [{ data: workflow, error: workflowError }, { data: nodes, error: nodeError }, { data: edges, error: edgeError }] = await Promise.all([
    admin
      .from('automation_workflows')
      .select('id,metadata')
      .eq('organization_id', organizationId)
      .eq('id', workflowId)
      .maybeSingle(),
    admin
      .from('automation_flow_nodes')
      .select('id,node_key,node_type,label,config,enabled')
      .eq('organization_id', organizationId)
      .eq('workflow_id', workflowId)
      .eq('version_number', versionNumber),
    admin
      .from('automation_flow_edges')
      .select('id,source_node_id,target_node_id,edge_key,label,condition')
      .eq('organization_id', organizationId)
      .eq('workflow_id', workflowId)
      .eq('version_number', versionNumber),
  ]);

  if (workflowError || !workflow) go('error', workflowError?.message || 'Workflow was not found in this organization.');
  if (nodeError) go('error', nodeError.message);
  if (edgeError) go('error', edgeError.message);

  const result = validateGraph((nodes ?? []) as NodeRow[], (edges ?? []) as EdgeRow[]);
  const existingMetadata = (workflow.metadata ?? {}) as Record<string, unknown>;
  const metadata = {
    ...existingMetadata,
    flow_validation: {
      ...result,
      version_number: versionNumber,
    },
    flow_publish_eligible: result.valid,
    safety_mode: 'draft_only',
  };

  const { error: updateError } = await admin
    .from('automation_workflows')
    .update({ metadata })
    .eq('organization_id', organizationId)
    .eq('id', workflowId);

  if (updateError) go('error', updateError.message);

  revalidatePath('/automation/flow-validation-test');
  revalidatePath('/automation/flow-builder');

  if (result.valid) {
    go('notice', `Draft validation passed: ${result.node_count} nodes and ${result.edge_count} connections are structurally valid. This does not publish or execute the flow.`);
  }

  go('error', `Draft validation found ${result.errors.length} blocking issue${result.errors.length === 1 ? '' : 's'}. Nothing was published or executed.`);
}
