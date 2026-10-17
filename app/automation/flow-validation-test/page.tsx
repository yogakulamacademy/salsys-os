import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';

import { validateControlledFlowAction } from '@/app/automation/flow-validation-test/actions';
import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type WorkflowRow = {
  id: string;
  name: string;
  status: string;
  metadata: Record<string, unknown> | null;
  current_draft_version: number | null;
  current_published_version: number | null;
  runtime_flow_enabled: boolean;
};

type ValidationResult = {
  valid?: boolean;
  errors?: string[];
  warnings?: string[];
  checked_at?: string;
  node_count?: number;
  edge_count?: number;
  validator_version?: string;
  customer_messaging_enabled?: boolean;
  version_number?: number;
  definition_hash?: string;
};

export default async function FlowValidationTestPage({
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
  let validation: ValidationResult | null = null;

  if (user) {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const [manageResult, workflowResult] = await Promise.all([
        supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
        supabase
          .from('automation_workflows')
          .select('id,name,status,metadata,current_draft_version,current_published_version,runtime_flow_enabled')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      canManage = manageResult.data === true;
      workflow = (workflowResult.data ?? null) as WorkflowRow | null;

      const metadata = (workflow?.metadata ?? {}) as Record<string, unknown>;
      validation = (metadata.flow_validation ?? null) as ValidationResult | null;
    }
  }

  const draftVersion = Number(workflow?.current_draft_version ?? 1);
  const validationMatchesDraft = Number(validation?.version_number ?? 0) === draftVersion;
  const errors = validationMatchesDraft ? validation?.errors ?? [] : [];
  const warnings = validationMatchesDraft ? validation?.warnings ?? [] : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Flow Validation"
        title="Conversation Flow Validation Test"
        description={`Validate the persisted draft graph for ${organizationName} before any publish/runtime work is enabled.`}
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
            <strong>Validation-only mode:</strong> this check reads the tenant-scoped current draft graph and writes only a validation lock. It does not publish, enroll a lead, execute nodes, schedule jobs, call AI, or send customer messages.
          </div>
        </div>
      </div>

      {!canManage ? (
        <div className="card-pad text-sm text-slate-600">Organization admin access is required.</div>
      ) : !workflow ? (
        <div className="card-pad text-sm text-slate-600">An active Smart Trigger workflow is required.</div>
      ) : (
        <>
          <section className="card-pad">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-bold text-slate-950">{workflow.name}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Validate Draft Version {draftVersion} before publish eligibility is considered.
                  {workflow.current_published_version ? ` Published Version ${workflow.current_published_version} remains unchanged.` : ''}
                </p>
              </div>
              <form action={validateControlledFlowAction}>
                <input type="hidden" name="workflow_id" value={workflow.id} />
                <input type="hidden" name="version_number" value={draftVersion} />
                <button type="submit" className="btn-primary">Run draft validation</button>
              </form>
            </div>
          </section>

          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${validationMatchesDraft && validation?.valid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {validationMatchesDraft && validation?.valid ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              </div>
              <div>
                <h2 className="font-bold text-slate-950">Latest validation result</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {!validationMatchesDraft
                    ? `Draft Version ${draftVersion} has not been validation-locked yet.`
                    : validation?.valid
                      ? `Draft Version ${draftVersion} is structurally valid and hash-locked.`
                      : 'Blocking structural issues remain.'}
                </p>
              </div>
            </div>

            {validationMatchesDraft && validation ? (
              <div className="mt-5 grid gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</div>
                  <div className={`mt-2 font-bold ${validation.valid ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {validation.valid ? 'Passed' : 'Blocked'}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Nodes</div>
                  <div className="mt-2 font-bold text-slate-900">{validation.node_count ?? '—'}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Connections</div>
                  <div className="mt-2 font-bold text-slate-900">{validation.edge_count ?? '—'}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Customer messaging</div>
                  <div className="mt-2 font-bold text-slate-900">Disabled</div>
                </div>
              </div>
            ) : null}

            {errors.length > 0 ? (
              <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-sm font-bold text-rose-800">Blocking issues</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
                  {errors.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ) : null}

            {warnings.length > 0 ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm font-bold text-amber-800">Warnings</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">
                  {warnings.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
