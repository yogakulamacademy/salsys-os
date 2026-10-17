'use server';

import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/flow-publish-test?${type}=${encodeURIComponent(message)}`);
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
    go('error', 'Only organization admins can publish conversation flow definitions.');
  }

  return { organizationId, userId: user.id };
}

type NodeRow = {
  id: string;
  node_key: string;
  node_type: string;
  label: string;
  config: Record<string, unknown> | null;
  enabled: boolean;
  position_x: number;
  position_y: number;
};

type EdgeRow = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_key: string;
  label: string | null;
  condition: Record<string, unknown> | null;
  priority: number;
};

function stableJson(input: unknown): string {
  if (Array.isArray(input)) return `[${input.map(stableJson).join(',')}]`;
  if (input && typeof input === 'object') {
    return `{${Object.entries(input as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(input);
}

function definitionHash(nodes: NodeRow[], edges: EdgeRow[]) {
  const canonicalNodes = [...nodes]
    .sort((a, b) => a.node_key.localeCompare(b.node_key))
    .map((node) => ({
      node_key: node.node_key,
      node_type: node.node_type,
      label: node.label,
      config: node.config ?? {},
      enabled: node.enabled !== false,
      position_x: Number(node.position_x ?? 0),
      position_y: Number(node.position_y ?? 0),
    }));

  const nodeKeyById = new Map(nodes.map((node) => [node.id, node.node_key]));
  const canonicalEdges = [...edges]
    .map((edge) => ({
      edge_key: edge.edge_key,
      source_node_key: nodeKeyById.get(edge.source_node_id) ?? edge.source_node_id,
      target_node_key: nodeKeyById.get(edge.target_node_id) ?? edge.target_node_id,
      label: edge.label ?? null,
      condition: edge.condition ?? {},
      priority: Number(edge.priority ?? 0),
    }))
    .sort((a, b) => a.edge_key.localeCompare(b.edge_key));

  return createHash('sha256')
    .update(stableJson({ nodes: canonicalNodes, edges: canonicalEdges }))
    .digest('hex');
}

export async function publishControlledFlowVersionAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const requestedVersion = Number(value(formData, 'version_number'));

  if (!workflowId || !Number.isInteger(requestedVersion) || requestedVersion < 1) {
    go('error', 'Workflow and valid draft version are required.');
  }

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const [{ data: workflow, error: workflowError }, { data: version, error: versionError }] = await Promise.all([
    admin
      .from('automation_workflows')
      .select('id,current_draft_version,current_published_version,runtime_flow_enabled')
      .eq('organization_id', organizationId)
      .eq('id', workflowId)
      .maybeSingle(),
    admin
      .from('automation_flow_versions')
      .select('id,version_number,status,definition_hash,validated_at,validation_snapshot')
      .eq('organization_id', organizationId)
      .eq('workflow_id', workflowId)
      .eq('version_number', requestedVersion)
      .maybeSingle(),
  ]);

  if (workflowError || !workflow) go('error', workflowError?.message || 'Workflow was not found in this organization.');
  if (versionError || !version) go('error', versionError?.message || 'Draft flow version was not found.');
  if (Number(workflow.current_draft_version) !== requestedVersion) {
    go('error', `Version ${requestedVersion} is not the current draft.`);
  }
  if (version.status !== 'draft') go('error', 'Only the current draft can be published.');

  const snapshot = (version.validation_snapshot ?? {}) as Record<string, unknown>;
  if (snapshot.valid !== true || !version.validated_at || !version.definition_hash) {
    go('error', `Draft Version ${requestedVersion} must pass validation before publish.`);
  }

  const [{ data: nodes, error: nodeError }, { data: edges, error: edgeError }] = await Promise.all([
    admin
      .from('automation_flow_nodes')
      .select('id,node_key,node_type,label,config,enabled,position_x,position_y')
      .eq('organization_id', organizationId)
      .eq('workflow_id', workflowId)
      .eq('version_number', requestedVersion),
    admin
      .from('automation_flow_edges')
      .select('id,source_node_id,target_node_id,edge_key,label,condition,priority')
      .eq('organization_id', organizationId)
      .eq('workflow_id', workflowId)
      .eq('version_number', requestedVersion),
  ]);

  if (nodeError) go('error', nodeError.message);
  if (edgeError) go('error', edgeError.message);

  const currentHash = definitionHash((nodes ?? []) as NodeRow[], (edges ?? []) as EdgeRow[]);
  if (currentHash !== version.definition_hash) {
    go('error', 'Draft changed after validation. Run draft validation again before publishing.');
  }

  const { data: publishResult, error: publishError } = await admin.rpc(
    'publish_and_clone_automation_flow_version_v1',
    {
      p_organization_id: organizationId,
      p_workflow_id: workflowId,
      p_version_number: requestedVersion,
      p_definition_hash: currentHash,
      p_actor_user_id: userId,
    },
  );

  if (publishError) go('error', publishError.message);

  const result = (publishResult ?? {}) as Record<string, unknown>;
  const nextDraftVersion = Number(result.next_draft_version ?? requestedVersion + 1);

  revalidatePath('/automation/flow-publish-test');
  revalidatePath('/automation/flow-builder');
  revalidatePath('/automation/flow-validation-test');

  go(
    'notice',
    `Version ${requestedVersion} published as an immutable definition and Draft Version ${nextDraftVersion} was cloned for future edits. Runtime execution and customer messaging remain disabled.`,
  );
}
