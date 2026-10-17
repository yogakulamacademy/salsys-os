import { ArrowRight, GitBranch, MessageSquareReply, ShieldCheck, Workflow } from 'lucide-react';

import { createControlledConversationFlowAction } from '@/app/automation/flow-builder-test/actions';
import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type WorkflowRow = {
  id: string;
  name: string;
  status: string;
};

type FlowNode = {
  id: string;
  node_key: string;
  node_type: string;
  label: string;
  position_x: number;
  position_y: number;
};

type FlowEdge = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_key: string;
  label: string | null;
};

const typeLabel: Record<string, string> = {
  trigger: 'Trigger',
  wait_for_reply: 'Wait for Reply',
  condition: 'Condition',
  end: 'End',
};

export default async function FlowBuilderTestPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let organizationName = 'Current organization';
  let canManage = false;
  let workflow: WorkflowRow | null = null;
  let nodes: FlowNode[] = [];
  let edges: FlowEdge[] = [];

  if (user) {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const [manageResult, workflowResult] = await Promise.all([
        supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
        supabase
          .from('automation_workflows')
          .select('id,name,status')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      canManage = manageResult.data === true;
      workflow = (workflowResult.data ?? null) as WorkflowRow | null;

      if (workflow?.id) {
        const [nodeResult, edgeResult] = await Promise.all([
          supabase
            .from('automation_flow_nodes')
            .select('id,node_key,node_type,label,position_x,position_y')
            .eq('organization_id', organizationId)
            .eq('workflow_id', workflow.id)
            .eq('version_number', 1)
            .order('position_x', { ascending: true })
            .order('position_y', { ascending: true }),
          supabase
            .from('automation_flow_edges')
            .select('id,source_node_id,target_node_id,edge_key,label')
            .eq('organization_id', organizationId)
            .eq('workflow_id', workflow.id)
            .eq('version_number', 1)
            .order('priority', { ascending: true }),
        ]);

        nodes = (nodeResult.data ?? []) as FlowNode[];
        edges = (edgeResult.data ?? []) as FlowEdge[];
      }
    }
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Flow Graph Test"
        title="Conversation Flow Graph"
        description={`Validate the graph structure for ${organizationName} before building the full drag-and-drop editor.`}
      />

      {query.notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {query.notice}
        </div>
      ) : null}

      {query.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {query.error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <div>
            <strong>Structure-only mode:</strong> this page creates and reads a tenant-scoped flow graph. It does not enroll a lead, execute nodes, schedule jobs, or send any customer message.
          </div>
        </div>
      </div>

      {!canManage ? (
        <div className="card-pad text-sm text-slate-600">Organization admin access is required.</div>
      ) : !workflow ? (
        <div className="card-pad text-sm text-slate-600">An active Smart Trigger workflow is required.</div>
      ) : nodes.length === 0 ? (
        <section className="card-pad">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <Workflow size={18} />
            </div>
            <div>
              <h2 className="font-bold text-slate-950">Create the first controlled conversation graph</h2>
              <p className="mt-1 text-sm text-slate-500">
                This seeds a safe example with a trigger, wait-for-reply step, outcome branch and two end nodes.
              </p>
            </div>
          </div>

          <form action={createControlledConversationFlowAction} className="mt-5">
            <input type="hidden" name="workflow_id" value={workflow.id} />
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div className="font-bold text-slate-900">{workflow.name}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">Active · Version 1</div>
            </div>
            <button type="submit" className="btn-primary mt-4">
              <Workflow size={15} />
              Create controlled flow graph
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="card-pad">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-bold text-slate-950">{workflow.name}</h2>
                <p className="mt-1 text-sm text-slate-500">Version 1 · {nodes.length} nodes · {edges.length} edges</p>
              </div>
              <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Graph persisted</div>
            </div>

            <div className="mt-6 overflow-x-auto pb-2">
              <div className="flex min-w-[980px] items-center gap-3">
                {nodes.map((node, index) => (
                  <div key={node.id} className="flex items-center gap-3">
                    <div className="w-44 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        {node.node_type === 'condition' ? <GitBranch size={14} /> : null}
                        {node.node_type === 'wait_for_reply' ? <MessageSquareReply size={14} /> : null}
                        {typeLabel[node.node_type] || node.node_type}
                      </div>
                      <div className="mt-2 text-sm font-bold text-slate-950">{node.label}</div>
                      <div className="mt-2 text-xs text-slate-400">{node.node_key}</div>
                    </div>
                    {index < nodes.length - 1 ? <ArrowRight className="text-slate-300" size={18} /> : null}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card-pad">
            <h2 className="font-bold text-slate-950">Persisted edges</h2>
            <p className="mt-1 text-sm text-slate-500">These are the branch connections the future visual canvas will render and execute.</p>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {edges.map((edge) => {
                const source = nodeMap.get(edge.source_node_id);
                const target = nodeMap.get(edge.target_node_id);
                return (
                  <div key={edge.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <div className="font-semibold text-slate-900">
                      {source?.label || 'Unknown'} → {target?.label || 'Unknown'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{edge.label || edge.edge_key}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
