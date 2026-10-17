'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === 'on' || formData.get(key) === 'true';
}

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/flow-builder?${type}=${encodeURIComponent(message)}`);
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
    go('error', 'Only organization admins can edit conversation flows.');
  }

  return { organizationId };
}

type LayoutPoint = {
  id: string;
  x: number;
  y: number;
};

function parseLayout(raw: string): LayoutPoint[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Flow layout payload is invalid JSON.');
  }

  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 100) {
    throw new Error('Flow layout must contain between 1 and 100 nodes.');
  }

  return parsed.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new Error('Flow layout contains an invalid node entry.');
    }

    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const x = Number(row.x);
    const y = Number(row.y);

    if (!id || !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error('Flow layout contains an invalid node position.');
    }

    return {
      id,
      x: Math.max(0, Math.min(Math.round(x), 4000)),
      y: Math.max(0, Math.min(Math.round(y), 2400)),
    };
  });
}

async function assertOwnedNode({
  organizationId,
  workflowId,
  versionNumber,
  nodeId,
}: {
  organizationId: string;
  workflowId: string;
  versionNumber: number;
  nodeId: string;
}) {
  const admin = createAdminClient();
  const { data: node, error } = await admin
    .from('automation_flow_nodes')
    .select('id,node_type,config')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', versionNumber)
    .eq('id', nodeId)
    .maybeSingle();

  if (error || !node) go('error', error?.message || 'Flow node was not found in this organization/workflow/version.');
  return node;
}

export async function saveFlowLayoutAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const versionNumber = Number(value(formData, 'version_number') || '1');
  const rawLayout = value(formData, 'layout');

  if (!workflowId || !rawLayout) go('error', 'Workflow and layout are required.');
  if (!Number.isInteger(versionNumber) || versionNumber < 1) go('error', 'Flow version is invalid.');

  let layout: LayoutPoint[];
  try {
    layout = parseLayout(rawLayout);
  } catch (error) {
    go('error', error instanceof Error ? error.message : 'Flow layout is invalid.');
  }

  const { organizationId } = await adminContext();
  const admin = createAdminClient();
  const nodeIds = layout.map((node) => node.id);

  const { data: ownedNodes, error: ownedNodesError } = await admin
    .from('automation_flow_nodes')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', versionNumber)
    .in('id', nodeIds);

  if (ownedNodesError) go('error', ownedNodesError.message);

  const ownedIds = new Set((ownedNodes ?? []).map((node) => String(node.id)));
  if (ownedIds.size !== nodeIds.length || layout.some((node) => !ownedIds.has(node.id))) {
    go('error', 'One or more flow nodes do not belong to this organization/workflow/version.');
  }

  for (const node of layout) {
    const { error } = await admin
      .from('automation_flow_nodes')
      .update({ position_x: node.x, position_y: node.y })
      .eq('organization_id', organizationId)
      .eq('workflow_id', workflowId)
      .eq('version_number', versionNumber)
      .eq('id', node.id);

    if (error) go('error', error.message);
  }

  revalidatePath('/automation/flow-builder');
  revalidatePath('/automation/flow-builder-test');
  go('notice', 'Flow layout saved. Node positions were persisted; nothing was executed and no customer message was sent.');
}

export async function updateFlowNodeAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const versionNumber = Number(value(formData, 'version_number') || '1');
  const nodeId = value(formData, 'node_id');
  const label = value(formData, 'label');

  if (!workflowId || !nodeId || !label) go('error', 'Workflow, node and label are required.');
  if (!Number.isInteger(versionNumber) || versionNumber < 1) go('error', 'Flow version is invalid.');
  if (label.length > 120) go('error', 'Node label must be 120 characters or fewer.');

  const { organizationId } = await adminContext();
  const admin = createAdminClient();
  const node = await assertOwnedNode({ organizationId, workflowId, versionNumber, nodeId });
  const nodeType = String(node.node_type);
  let config = (node.config ?? {}) as Record<string, unknown>;

  if (nodeType === 'trigger') {
    const eventName = value(formData, 'event_name') || 'lead.created';
    if (!['lead.created', 'message.received', 'lead.stage_changed', 'payment.pending'].includes(eventName)) {
      go('error', 'Unsupported trigger event.');
    }
    config = { ...config, event_name: eventName };
  } else if (nodeType === 'wait_for_reply') {
    const timeoutMinutes = Number(value(formData, 'timeout_minutes') || '360');
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 10080) {
      go('error', 'Reply timeout must be between 1 and 10,080 minutes.');
    }
    config = {
      ...config,
      timeout_minutes: Math.round(timeoutMinutes),
      stop_on_reply: checked(formData, 'stop_on_reply'),
    };
  } else if (nodeType === 'condition') {
    const variable = value(formData, 'variable') || 'reply_outcome';
    const operator = value(formData, 'operator') || 'equals';
    if (variable.length > 80) go('error', 'Condition variable must be 80 characters or fewer.');
    if (!['equals', 'not_equals', 'exists'].includes(operator)) go('error', 'Unsupported condition operator.');
    config = { ...config, variable, operator };
  } else if (nodeType === 'end') {
    const outcome = value(formData, 'outcome');
    if (outcome.length > 80) go('error', 'Outcome must be 80 characters or fewer.');
    config = { ...config, outcome };
  }

  const { error } = await admin
    .from('automation_flow_nodes')
    .update({ label, config })
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', versionNumber)
    .eq('id', nodeId);

  if (error) go('error', error.message);

  revalidatePath('/automation/flow-builder');
  revalidatePath('/automation/flow-builder-test');
  go('notice', 'Node settings saved. Flow structure changed only; nothing was executed and no customer message was sent.');
}

export async function updateFlowEdgeAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const versionNumber = Number(value(formData, 'version_number') || '1');
  const edgeId = value(formData, 'edge_id');
  const label = value(formData, 'label');
  const branchValue = value(formData, 'branch_value');

  if (!workflowId || !edgeId) go('error', 'Workflow and edge are required.');
  if (!Number.isInteger(versionNumber) || versionNumber < 1) go('error', 'Flow version is invalid.');
  if (label.length > 120) go('error', 'Edge label must be 120 characters or fewer.');
  if (branchValue.length > 80) go('error', 'Branch value must be 80 characters or fewer.');

  const { organizationId } = await adminContext();
  const admin = createAdminClient();

  const { data: edge, error: edgeError } = await admin
    .from('automation_flow_edges')
    .select('id,condition')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', versionNumber)
    .eq('id', edgeId)
    .maybeSingle();

  if (edgeError || !edge) go('error', edgeError?.message || 'Flow edge was not found in this organization/workflow/version.');

  const existingCondition = (edge.condition ?? {}) as Record<string, unknown>;
  const condition = branchValue
    ? { ...existingCondition, equals: branchValue }
    : existingCondition;

  const { error } = await admin
    .from('automation_flow_edges')
    .update({ label: label || null, condition })
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', versionNumber)
    .eq('id', edgeId);

  if (error) go('error', error.message);

  revalidatePath('/automation/flow-builder');
  revalidatePath('/automation/flow-builder-test');
  go('notice', 'Branch settings saved. Flow structure changed only; nothing was executed and no customer message was sent.');
}
