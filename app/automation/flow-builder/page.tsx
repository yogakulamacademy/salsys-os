import { ShieldCheck, Workflow } from 'lucide-react';

import { ConnectionCreator } from '@/app/automation/flow-builder/connection-creator';
import { FlowCanvas } from '@/app/automation/flow-builder/flow-canvas';
import { PageHeader } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type WorkflowRow = {
  id: string;
  name: string;
  status: string;
  current_draft_version: number | null;
  current_published_version: number | null;
  runtime_flow_enabled: boolean;
};

type FlowNode = {
  id: string;
  node_key: string;
  node_type: string;
  label: string;
  position_x: number;
  position_y: number;
  config: Record<string, unknown> | null;
};

type FlowEdge = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_key: string;
  label: string | null;
  condition: Record<string, unknown> | null;
};

type WhatsAppTemplate = {
  id: string;
  whatsapp_account_id: string;
  template_name: string;
  language_code: string;
  category: string | null;
};

export default async function FlowBuilderPage({
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
  let whatsappTemplates: WhatsAppTemplate[] = [];

  if (user) {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const admin = createAdminClient();
      const [manageResult, workflowResult, templateResult] = await Promise.all([
        supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
        supabase
          .from('automation_workflows')
          .select('id,name,status,current_draft_version,current_published_version,runtime_flow_enabled')
          .eq('organization_id', organizationId)
          .neq('status', 'archived')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from('automation_whatsapp_templates')
          .select('id,whatsapp_account_id,template_name,language_code,category')
          .eq('organization_id', organizationId)
          .eq('approval_status', 'approved')
          .eq('active', true)
          .order('template_name', { ascending: true })
          .order('language_code', { ascending: true }),
      ]);

      canManage = manageResult.data === true;
      workflow = (workflowResult.data ?? null) as WorkflowRow | null;
      whatsappTemplates = (templateResult.data ?? []) as WhatsAppTemplate[];

      const draftVersion = Number(workflow?.current_draft_version ?? 1);

      if (workflow?.id) {
        const [nodeResult, edgeResult] = await Promise.all([
          supabase
            .from('automation_flow_nodes')
            .select('id,node_key,node_type,label,position_x,position_y,config')
            .eq('organization_id', organizationId)
            .eq('workflow_id', workflow.id)
            .eq('version_number', draftVersion)
            .order('position_y', { ascending: true })
            .order('position_x', { ascending: true }),
          supabase
            .from('automation_flow_edges')
            .select('id,source_node_id,target_node_id,edge_key,label,condition')
            .eq('organization_id', organizationId)
            .eq('workflow_id', workflow.id)
            .eq('version_number', draftVersion)
            .order('priority', { ascending: true }),
        ]);

        nodes = (nodeResult.data ?? []) as FlowNode[];
        edges = (edgeResult.data ?? []) as FlowEdge[];
      }
    }
  }

  const draftVersion = Number(workflow?.current_draft_version ?? 1);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Flow Builder"
        title="Conversation Flow Builder"
        description={`Arrange and configure the persisted conversation journey for ${organizationName}. Draft editing never executes flows; guarded WhatsApp actions require synchronized provider-approved templates and force human approval.`}
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
            <strong>Structure-only mode:</strong> dragging nodes, editing settings, and creating/rerouting connections changes only the current draft version. Configuring a WhatsApp action stores an approved-template reference only; it does not enroll leads, execute a flow, schedule jobs, open provider execution, or send a message.
          </div>
        </div>
      </div>

      {!canManage ? (
        <div className="card-pad text-sm text-slate-600">Organization admin access is required.</div>
      ) : !workflow ? (
        <div className="card-pad text-sm text-slate-600">Create a non-archived Smart Trigger workflow before editing its draft flow.</div>
      ) : nodes.length === 0 ? (
        <div className="card-pad">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <Workflow size={18} />
            </div>
            <div>
              <h2 className="font-bold text-slate-950">No draft graph exists for Version {draftVersion}</h2>
              <p className="mt-1 text-sm text-slate-500">Create or clone a draft definition before editing.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <section className="card-pad">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-950">{workflow.name}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {workflow.status.replaceAll('_', ' ')} · Draft Version {draftVersion} · {nodes.length} nodes · {edges.length} edges
                  {workflow.current_published_version ? ` · Published Version ${workflow.current_published_version}` : ''}
                </p>
              </div>
              <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Draft canvas</div>
            </div>

            <FlowCanvas
              workflowId={workflow.id}
              versionNumber={draftVersion}
              initialNodes={nodes}
              edges={edges}
              whatsappTemplates={whatsappTemplates}
            />
          </section>

          <ConnectionCreator
            workflowId={workflow.id}
            versionNumber={draftVersion}
            nodes={nodes.map((node) => ({
              id: node.id,
              node_key: node.node_key,
              node_type: node.node_type,
              label: node.label,
            }))}
          />
        </div>
      )}
    </div>
  );
}
