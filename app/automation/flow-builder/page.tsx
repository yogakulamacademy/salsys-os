import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

import { ConnectionCreator } from '@/app/automation/flow-builder/connection-creator';
import { FlowCanvas } from '@/app/automation/flow-builder/flow-canvas';
import {
  publishAutomationFlowAction,
  validateAutomationFlowAction,
} from '@/app/automation/flow-builder/publish-actions';
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

type FlowVersionRow = {
  status: string;
  validated_at: string | null;
  definition_hash: string | null;
  validation_snapshot: Record<string, unknown> | null;
};

function arrayStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

export default async function FlowBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ workflow?: string; notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let organizationName = 'Current organization';
  let canManage = false;
  let workflows: WorkflowRow[] = [];
  let workflow: WorkflowRow | null = null;
  let flowVersion: FlowVersionRow | null = null;
  let nodes: FlowNode[] = [];
  let edges: FlowEdge[] = [];
  let whatsappTemplates: WhatsAppTemplate[] = [];
  let currentDefinitionHash: string | null = null;
  let loadError: string | null = null;

  try {
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
            .order('updated_at', { ascending: false }),
          admin
            .from('automation_whatsapp_templates')
            .select('id,whatsapp_account_id,template_name,language_code,category')
            .eq('organization_id', organizationId)
            .eq('approval_status', 'approved')
            .eq('active', true)
            .order('template_name', { ascending: true })
            .order('language_code', { ascending: true }),
        ]);

        if (manageResult.error || workflowResult.error || templateResult.error) {
          throw manageResult.error || workflowResult.error || templateResult.error;
        }

        canManage = manageResult.data === true;
        workflows = (workflowResult.data ?? []) as WorkflowRow[];
        whatsappTemplates = (templateResult.data ?? []) as WhatsAppTemplate[];

        const requestedWorkflowId = query.workflow?.trim();
        workflow =
          (requestedWorkflowId
            ? workflows.find((candidate) => candidate.id === requestedWorkflowId)
            : null) ??
          workflows[0] ??
          null;

        const draftVersion = Number(workflow?.current_draft_version ?? 1);

        if (workflow?.id) {
          const [nodeResult, edgeResult, versionResult, hashResult] = await Promise.all([
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
            admin
              .from('automation_flow_versions')
              .select('status,validated_at,definition_hash,validation_snapshot')
              .eq('organization_id', organizationId)
              .eq('workflow_id', workflow.id)
              .eq('version_number', draftVersion)
              .maybeSingle(),
            admin.rpc('automation_flow_definition_hash_v1', {
              p_organization_id: organizationId,
              p_workflow_id: workflow.id,
              p_version_number: draftVersion,
            }),
          ]);

          if (nodeResult.error || edgeResult.error || versionResult.error || hashResult.error) {
            throw nodeResult.error || edgeResult.error || versionResult.error || hashResult.error;
          }

          nodes = (nodeResult.data ?? []) as FlowNode[];
          edges = (edgeResult.data ?? []) as FlowEdge[];
          flowVersion = (versionResult.data ?? null) as FlowVersionRow | null;
          currentDefinitionHash = typeof hashResult.data === 'string' ? hashResult.data : null;
        }
      }
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load the conversation flow builder.';
  }

  const draftVersion = Number(workflow?.current_draft_version ?? 1);
  const validation = flowVersion?.validation_snapshot ?? {};
  const validationErrors = arrayStrings(validation.errors);
  const validationWarnings = arrayStrings(validation.warnings);
  const storedValid = validation.valid === true && Boolean(flowVersion?.validated_at);
  const validationFresh =
    storedValid &&
    Boolean(flowVersion?.definition_hash) &&
    Boolean(currentDefinitionHash) &&
    flowVersion?.definition_hash === currentDefinitionHash;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Flow Builder"
        title="Conversation Flow Builder"
        description={`Arrange, validate and publish the persisted conversation journey for ${organizationName}. Publishing still leaves runtime execution OFF until explicitly enabled.`}
      />

      {query.notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {query.notice}
        </div>
      ) : null}

      {query.error || loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {query.error || loadError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <div>
            <strong>Fail-closed publishing:</strong> draft editing never executes a flow. Validation checks graph structure and guarded WhatsApp requirements. Publishing rechecks the exact definition hash, clones a fresh draft for future edits, and forces runtime execution OFF.
          </div>
        </div>
      </div>

      {canManage && workflows.length > 0 ? (
        <section className="card-pad">
          <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Workflow</span>
              <select
                name="workflow"
                defaultValue={workflow?.id ?? ''}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
              >
                {workflows.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} · {candidate.status.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn-secondary">Open workflow</button>
          </form>
        </section>
      ) : null}

      {!canManage ? (
        <div className="card-pad text-sm text-slate-600">Organization admin access is required.</div>
      ) : !workflow ? (
        <div className="card-pad text-sm text-slate-600">Create a non-archived Smart Trigger workflow before editing its draft flow.</div>
      ) : (
        <>
          <section className="card-pad">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-slate-950">{workflow.name}</h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                    {workflow.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Draft Version {draftVersion} · {nodes.length} nodes · {edges.length} edges
                  {workflow.current_published_version ? ` · Published Version ${workflow.current_published_version}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <form action={validateAutomationFlowAction}>
                  <input type="hidden" name="workflow_id" value={workflow.id} />
                  <input type="hidden" name="version_number" value={draftVersion} />
                  <button type="submit" className="btn-secondary">
                    <RefreshCw size={15} />
                    Validate draft
                  </button>
                </form>

                <form action={publishAutomationFlowAction}>
                  <input type="hidden" name="workflow_id" value={workflow.id} />
                  <input type="hidden" name="version_number" value={draftVersion} />
                  <button
                    type="submit"
                    disabled={!validationFresh}
                    className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                    title={validationFresh ? 'Publish this exact validated definition' : 'Validate the current draft before publishing'}
                  >
                    <Rocket size={15} />
                    Publish validated version
                  </button>
                </form>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {validationFresh ? (
                    <CheckCircle2 size={17} className="text-emerald-600" />
                  ) : (
                    <AlertTriangle size={17} className="text-amber-600" />
                  )}
                  <div className="text-sm font-bold text-slate-900">
                    {validationFresh
                      ? 'Current draft is validated and publish-eligible'
                      : storedValid
                        ? 'Draft changed after its last validation'
                        : 'Current draft is not yet publish-eligible'}
                  </div>
                </div>
                {flowVersion?.validated_at ? (
                  <div className="text-xs text-slate-500">
                    Last validated {new Date(flowVersion.validated_at).toLocaleString('en-IN')}
                  </div>
                ) : null}
              </div>

              {validationErrors.length > 0 ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-800">
                  <strong>Errors:</strong> {validationErrors.join(' · ')}
                </div>
              ) : null}

              {validationWarnings.length > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                  <strong>Warnings:</strong> {validationWarnings.join(' · ')}
                </div>
              ) : null}

              <p className="mt-3 text-xs leading-5 text-slate-500">
                Publish never enables runtime. After publication, SalsysOS creates the next draft version and requires an explicit runtime activation in Automation Settings.
              </p>
            </div>
          </section>

          {nodes.length === 0 ? (
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
                    <h2 className="font-bold text-slate-950">Draft canvas</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Editing changes only Version {draftVersion}; validate again after every structural or action change.
                    </p>
                  </div>
                  <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Structure-only editing</div>
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
        </>
      )}
    </div>
  );
}
