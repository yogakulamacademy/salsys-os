'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
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

export async function createFlowEdgeAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const versionNumber = Number(value(formData, 'version_number') || '1');
  const sourceNodeId = value(formData, 'source_node_id');
  const targetNodeId = value(formData, 'target_node_id');
  const label = value(formData, 'label');
  const branchValue = value(formData, 'branch_value');

  if (!workflowId || !sourceNodeId || !targetNodeId) {
    go('error', 'Workflow, source node and target node are required.');
  }
  if (!Number.isInteger(versionNumber) || versionNumber < 1) go('error', 'Flow version is invalid.');
  if (sourceNodeId === targetNodeId) go('error', 'A node cannot connect to itself.');
  if (label.length > 120) go('error', 'Connection label must be 120 characters or fewer.');
  if (branchValue.length > 80) go('error', 'Branch value must be 80 characters or fewer.');

  const { organizationId } = await adminContext();
  const admin = createAdminClient();

  const { data: nodes, error: nodesError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_type')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', versionNumber)
    .in('id', [sourceNodeId, targetNodeId]);

  if (nodesError) go('error', nodesError.message);
  if ((nodes ?? []).length !== 2) {
    go('error', 'Source or target node does not belong to this organization/workflow/version.');
  }

  const source = (nodes ?? []).find((node) => String(node.id) === sourceNodeId);
  if (!source) go('error', 'Source node was not found.');
  if (String(source.node_type) === 'end') {
    go('error', 'End nodes cannot have outgoing connections.');
  }

  const { data: duplicate, error: duplicateError } = await admin
    .from('automation_flow_edges')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', versionNumber)
    .eq('source_node_id', sourceNodeId)
    .eq('target_node_id', targetNodeId)
    .maybeSingle();

  if (duplicateError) go('error', duplicateError.message);
  if (duplicate?.id) {
    go('notice', 'That draft connection already exists. No duplicate edge was created.');
  }

  const { data: sourceEdges, error: sourceEdgesError } = await admin
    .from('automation_flow_edges')
    .select('priority')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', versionNumber)
    .eq('source_node_id', sourceNodeId);

  if (sourceEdgesError) go('error', sourceEdgesError.message);

  const priority = (sourceEdges ?? []).reduce(
    (max, edge) => Math.max(max, Number(edge.priority ?? 0)),
    -1,
  ) + 1;

  const edgeKey = `edge_${randomUUID().slice(0, 8)}`;
  const condition = branchValue ? { equals: branchValue } : {};

  const { error } = await admin.from('automation_flow_edges').insert({
    organization_id: organizationId,
    workflow_id: workflowId,
    version_number: versionNumber,
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    edge_key: edgeKey,
    label: label || null,
    condition,
    priority,
  });

  if (error) go('error', error.message);

  revalidatePath('/automation/flow-builder');
  revalidatePath('/automation/flow-builder-test');
  go('notice', 'Draft connection created. The graph changed only; nothing was executed and no customer message was sent.');
}
