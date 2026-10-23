import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

import { createSmartTriggerWorkflowAction } from '@/app/automation/actions';
import { FlowCanvas } from '@/app/automation/flow-builder/flow-canvas';
import {
  publishAutomationFlowAction,
  validateAutomationFlowAction,
} from '@/app/automation/flow-builder/publish-actions';
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
    loadError = error instanceof Error ? error.message : 'Unable to load the flow builder.';
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
    <div className="space-y-4">
      <header className="flex min-h-[68px] flex-col gap-4 border-b border-[#e0e9e3] pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/automation"
            aria-label="Back to automation overview"
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#dfe8e2] bg-white text-[#60786b] transition hover:bg-[#f2f7f4]"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#7d9187]">
              <Link href="/automation" className="hover:text-[#236950]">Automation</Link>
              <span>›</span>
              <span>Flow builder</span>
              {workflow ? <><span>›</span><span className="font-semibold text-[#456b59]">{workflow.name}</span></> : null}
            </div>
            <h1 className="mt-1 text-[23px] font-bold leading-tight tracking-[-0.035em] text-[#183f33]">
              {workflow?.name || 'Conversation Flow Builder'}
            </h1>
            <p className="mt-1 text-[12px] text-[#758a80]">
              {workflow
                ? `Build, validate and publish the journey for ${organizationName}.`
                : `Build reliable messaging and CRM journeys for ${organizationName}.`}
            </p>
          </div>
        </div>

        {workflow ? (
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#d6e8dc] bg-[#eff6f1] px-2.5 text-[11px] font-bold text-[#527560]">
              <CircleDot size={12} /> Draft · v{draftVersion}
            </span>
            <form action={validateAutomationFlowAction}>
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <input type="hidden" name="version_number" value={draftVersion} />
              <button type="submit" className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-[#dbe7df] bg-white px-3 text-xs font-semibold text-[#315f4b] transition hover:bg-[#f3f8f4]">
                <RefreshCw size={14} /> Validate flow
              </button>
            </form>
            <form action={publishAutomationFlowAction}>
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <input type="hidden" name="version_number" value={draftVersion} />
              <button
                type="submit"
                disabled={!validationFresh}
                title={validationFresh ? 'Publish this validated definition' : 'Validate the current draft before publishing'}
                className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-[#236950] bg-[#236950] px-3 text-xs font-bold text-white transition hover:bg-[#19533f] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Rocket size={14} /> Publish flow
              </button>
            </form>
          </div>
        ) : null}
      </header>

      {query.notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{query.notice}</div> : null}
      {query.error || loadError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{query.error || loadError}</div> : null}

      {workflow ? (
        <div className="flex flex-col gap-2 rounded-xl border border-[#dbe8df] bg-[#f7faf8] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e7f3eb] text-[#236950]"><ShieldCheck size={15} /></div>
            <div>
              <div className="text-xs font-bold text-[#234c3b]">Safe draft workflow</div>
              <div className="mt-0.5 text-[11px] leading-4 text-[#71877b]">Publishing does not automatically enable runtime or provider sending.</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${validationFresh ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {validationFresh ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              {validationFresh ? 'Validated' : storedValid ? 'Draft changed' : 'Needs validation'}
            </span>
            <span className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${workflow.runtime_flow_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              Runtime {workflow.runtime_flow_enabled ? 'on' : 'off'}
            </span>
            <Link href="/automation/readiness" className="text-[11px] font-bold text-[#2f7558] hover:text-[#183f33]">Launch readiness →</Link>
          </div>
        </div>
      ) : null}

      {canManage && workflows.length > 0 ? (
        <section className="rounded-xl border border-[#e0e9e3] bg-white px-3.5 py-3">
          <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#87988f]">Open workflow</span>
              <select name="workflow" defaultValue={workflow?.id ?? ''} className="h-9 w-full rounded-lg border border-[#dbe7df] bg-white px-3 text-xs font-semibold text-[#294839]">
                {workflows.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.status.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
            <button type="submit" className="h-9 rounded-lg border border-[#dbe7df] bg-white px-3 text-xs font-bold text-[#315f4b] hover:bg-[#f3f8f4]">Open flow</button>
          </form>
        </section>
      ) : null}

      {!canManage ? (
        <div className="card-pad text-sm text-slate-600">Organization admin access is required.</div>
      ) : !workflow ? (
        <section className="overflow-hidden rounded-2xl border border-[#dfe8e2] bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="p-7 sm:p-9">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#eaf5ee] text-[#236950]"><Workflow size={22} /></div>
              <h2 className="mt-5 text-2xl font-bold tracking-tight text-[#183f33]">Create your first automation flow</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#71877b]">Start with a simple lead follow-up flow, then add waits, branches, approvals and WhatsApp template actions.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <form action={createSmartTriggerWorkflowAction}>
                  <input type="hidden" name="return_to" value="flow_builder" />
                  <input type="hidden" name="name" value="New lead follow-up" />
                  <input type="hidden" name="description" value="Create an internal follow-up when a new lead enters SalsysOS." />
                  <input type="hidden" name="event_name" value="lead.created" />
                  <input type="hidden" name="followup_title" value="Follow up with new lead" />
                  <input type="hidden" name="followup_delay_minutes" value="0" />
                  <button type="submit" className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#236950] px-3.5 text-xs font-bold text-white hover:bg-[#19533f]"><Plus size={15} /> Create starter flow</button>
                </form>
                <Link href="/automation/recipes" className="inline-flex h-9 items-center rounded-lg border border-[#dbe7df] bg-white px-3.5 text-xs font-bold text-[#315f4b] hover:bg-[#f3f8f4]">Browse recipes</Link>
              </div>
              <p className="mt-5 text-xs leading-5 text-[#8b9b92]">Starts as a draft. Nothing runs until validation, publication and explicit runtime activation.</p>
            </div>
            <div className="border-t border-[#edf1ee] bg-[#f8faf9] p-7 lg:border-l lg:border-t-0 sm:p-9">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8c9d94]">Starter journey</div>
              <div className="mt-5 space-y-3">
                {[
                  ['1', 'New lead created', 'Trigger'],
                  ['2', 'Create follow-up', 'Internal action'],
                  ['3', 'Completed', 'End'],
                ].map(([step, label, kind]) => (
                  <div key={step} className="flex items-center gap-3 rounded-xl border border-[#e0e9e3] bg-white p-3.5">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eaf5ee] text-xs font-bold text-[#236950]">{step}</div>
                    <div><div className="text-sm font-semibold text-[#1e4033]">{label}</div><div className="text-xs text-[#8a9b92]">{kind}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <>
          {(validationErrors.length > 0 || validationWarnings.length > 0) ? (
            <section className="space-y-2">
              {validationErrors.length > 0 ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-800"><strong>Fix before publishing:</strong> {validationErrors.join(' · ')}</div> : null}
              {validationWarnings.length > 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800"><strong>Review:</strong> {validationWarnings.join(' · ')}</div> : null}
            </section>
          ) : null}

          {nodes.length === 0 ? (
            <div className="card-pad">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf5ee] text-[#236950]"><Workflow size={18} /></div>
                <div>
                  <h2 className="font-bold text-[#183f33]">This workflow has no visual draft yet</h2>
                  <p className="mt-1 text-sm text-[#71877b]">Open Smart Triggers or install a starter recipe to create an editable flow definition.</p>
                  <div className="mt-4 flex flex-wrap gap-2"><Link href="/automation/triggers" className="btn-secondary">Open Smart Triggers</Link><Link href="/automation/recipes" className="btn-secondary">Starter recipes</Link></div>
                </div>
              </div>
            </div>
          ) : (
            <FlowCanvas workflowId={workflow.id} versionNumber={draftVersion} initialNodes={nodes} edges={edges} whatsappTemplates={whatsappTemplates} />
          )}
        </>
      )}
    </div>
  );
}
