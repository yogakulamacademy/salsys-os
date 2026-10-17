import { CheckCircle2, GitBranch, ShieldCheck } from 'lucide-react';

import { publishControlledFlowVersionAction } from '@/app/automation/flow-publish-test/actions';
import { PageHeader } from '@/components/ui';
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

type VersionRow = {
  id: string;
  version_number: number;
  status: 'draft' | 'published' | 'retired';
  definition_hash: string | null;
  validated_at: string | null;
  validation_snapshot: Record<string, unknown> | null;
  published_at: string | null;
  created_from_version: number | null;
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export default async function FlowPublishTestPage({
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
  let versions: VersionRow[] = [];

  if (user) {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const [manageResult, workflowResult] = await Promise.all([
        supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
        supabase
          .from('automation_workflows')
          .select('id,name,status,current_draft_version,current_published_version,runtime_flow_enabled')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      canManage = manageResult.data === true;
      workflow = (workflowResult.data ?? null) as WorkflowRow | null;

      if (workflow?.id) {
        const { data: versionRows } = await supabase
          .from('automation_flow_versions')
          .select('id,version_number,status,definition_hash,validated_at,validation_snapshot,published_at,created_from_version')
          .eq('organization_id', organizationId)
          .eq('workflow_id', workflow.id)
          .order('version_number', { ascending: false });

        versions = (versionRows ?? []) as VersionRow[];
      }
    }
  }

  const draftVersionNumber = Number(workflow?.current_draft_version ?? 0);
  const draftVersion = versions.find((item) => item.version_number === draftVersionNumber) ?? null;
  const validation = (draftVersion?.validation_snapshot ?? {}) as Record<string, unknown>;
  const draftValidated = draftVersion?.status === 'draft' && validation.valid === true && Boolean(draftVersion.validated_at && draftVersion.definition_hash);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Flow Versions"
        title="Controlled Flow Publish Test"
        description={`Publish a validated definition for ${organizationName} while keeping runtime execution and customer messaging disabled.`}
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
            <strong>Definition-only publishing:</strong> publishing freezes the validated version and clones a new editable draft. Runtime remains disabled. It does not enroll leads, execute nodes, schedule jobs, call AI, or send WhatsApp/Instagram messages.
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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-slate-950">{workflow.name}</h2>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Draft v{draftVersionNumber || '—'}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Published v{workflow.current_published_version ?? 'none'}</span>
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">Runtime {workflow.runtime_flow_enabled ? 'enabled' : 'disabled'}</span>
                </div>
              </div>

              {draftValidated && draftVersion ? (
                <form action={publishControlledFlowVersionAction}>
                  <input type="hidden" name="workflow_id" value={workflow.id} />
                  <input type="hidden" name="version_number" value={draftVersion.version_number} />
                  <button type="submit" className="btn-primary">
                    <GitBranch size={15} />
                    Publish Version {draftVersion.version_number}
                  </button>
                </form>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Current draft must pass hash-locked validation first.
                </div>
              )}
            </div>
          </section>

          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">Version history</h2>
                <p className="mt-1 text-sm text-slate-500">Published definitions are frozen snapshots; edits continue only in the current draft.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {versions.map((version) => {
                const snapshot = (version.validation_snapshot ?? {}) as Record<string, unknown>;
                return (
                  <div key={version.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900">Version {version.version_number}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {version.created_from_version ? `Cloned from v${version.created_from_version} · ` : ''}
                          Validated: {formatDate(version.validated_at)} · Published: {formatDate(version.published_at)}
                        </div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                        version.status === 'published'
                          ? 'bg-emerald-100 text-emerald-800'
                          : version.status === 'draft'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-700'
                      }`}>
                        {version.status}
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-slate-600">
                      Validation: {snapshot.valid === true ? 'passed' : 'not locked'} · Customer messaging: disabled
                    </div>
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
