import { CheckCircle2, Cpu, ShieldCheck, TimerReset, Workflow } from 'lucide-react';

import {
  prepareRuntimeWorkerTestAction,
  processRuntimeWorkerJobAction,
  runRuntimeWorkerDoubleClaimTestAction,
} from '@/app/automation/runtime-worker-test/actions';
import { runRuntimeWorkerCrossTenantTestAction } from '@/app/automation/runtime-worker-test/cross-tenant-action';
import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type WorkflowRow = {
  id: string;
  name: string;
  status: string;
  current_published_version: number | null;
  current_draft_version: number | null;
  runtime_flow_enabled: boolean;
};

type LeadRow = {
  id: string;
  display_name: string | null;
  current_contact_channel: string | null;
  current_stage: string | null;
};

type EnrollmentRow = {
  id: string;
  status: string;
  flow_version: number;
  current_node_id: string | null;
  next_action_at: string | null;
  metadata: Record<string, unknown> | null;
};

type NodeRow = {
  id: string;
  node_key: string;
  node_type: string;
  label: string;
};

type WaitRow = {
  id: string;
  wait_type: string;
  status: string;
  resume_at: string | null;
  timeout_at: string | null;
};

type JobRow = {
  id: string;
  job_type: string;
  status: string;
  scheduled_for: string;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  payload: Record<string, unknown> | null;
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export default async function RuntimeWorkerTestPage({
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
  let leads: LeadRow[] = [];
  let enrollment: EnrollmentRow | null = null;
  let currentNode: NodeRow | null = null;
  let latestWait: WaitRow | null = null;
  let latestJob: JobRow | null = null;

  if (user) {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const [manageResult, workflowResult, leadResult] = await Promise.all([
        supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
        supabase
          .from('automation_workflows')
          .select('id,name,status,current_published_version,current_draft_version,runtime_flow_enabled')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('leads')
          .select('id,display_name,current_contact_channel,current_stage')
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false })
          .limit(25),
      ]);

      canManage = manageResult.data === true;
      workflow = (workflowResult.data ?? null) as WorkflowRow | null;
      leads = (leadResult.data ?? []) as LeadRow[];

      if (workflow?.id) {
        const { data: enrollmentData } = await supabase
          .from('automation_enrollments')
          .select('id,status,flow_version,current_node_id,next_action_at,metadata')
          .eq('organization_id', organizationId)
          .eq('workflow_id', workflow.id)
          .eq('metadata->>source', 'runtime_worker_controlled_test')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        enrollment = (enrollmentData ?? null) as EnrollmentRow | null;

        if (enrollment?.id) {
          const [waitResult, jobResult] = await Promise.all([
            supabase
              .from('automation_wait_states')
              .select('id,wait_type,status,resume_at,timeout_at')
              .eq('organization_id', organizationId)
              .eq('enrollment_id', enrollment.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('automation_scheduled_jobs')
              .select('id,job_type,status,scheduled_for,attempt_count,max_attempts,last_error,payload')
              .eq('organization_id', organizationId)
              .eq('enrollment_id', enrollment.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);

          latestWait = (waitResult.data ?? null) as WaitRow | null;
          latestJob = (jobResult.data ?? null) as JobRow | null;

          if (enrollment.current_node_id) {
            const { data: nodeData } = await supabase
              .from('automation_flow_nodes')
              .select('id,node_key,node_type,label')
              .eq('organization_id', organizationId)
              .eq('workflow_id', workflow.id)
              .eq('version_number', enrollment.flow_version)
              .eq('id', enrollment.current_node_id)
              .maybeSingle();
            currentNode = (nodeData ?? null) as NodeRow | null;
          }
        }
      }
    }
  }

  const metadata = (enrollment?.metadata ?? {}) as Record<string, unknown>;
  const canProcess = latestJob?.status === 'scheduled' && enrollment?.status === 'active';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Runtime Worker"
        title="Controlled Runtime Worker Test"
        description={`Validate generic scheduled-job claiming and published-flow continuation for ${organizationName} without enabling background runtime or customer messaging.`}
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
            <strong>Controlled worker mode:</strong> the test can prepare one internal published-flow enrollment and manually invoke the generic scheduled-job worker. There is no cron/background worker, no AI call, and no WhatsApp, Instagram, email, or SMS send.
          </div>
        </div>
      </div>

      {!canManage ? (
        <div className="card-pad text-sm text-slate-600">Organization admin access is required.</div>
      ) : !workflow ? (
        <div className="card-pad text-sm text-slate-600">An active Smart Trigger workflow is required.</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
                <Workflow size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">1. Prepare one worker job</h2>
                <p className="mt-1 text-sm text-slate-500">Creates a pinned Published v{workflow.current_published_version ?? '—'} enrollment already waiting for a reply, plus one scheduled reply-timeout job.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Published</div>
                <div className="mt-1 font-semibold text-slate-900">v{workflow.current_published_version ?? '—'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Draft</div>
                <div className="mt-1 font-semibold text-slate-900">v{workflow.current_draft_version ?? '—'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Background runtime</div>
                <div className="mt-1 font-semibold text-slate-900">{workflow.runtime_flow_enabled ? 'Enabled' : 'Disabled'}</div>
              </div>
            </div>

            <form action={prepareRuntimeWorkerTestAction} className="mt-5 space-y-4">
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Test lead</span>
                <select name="lead_id" required defaultValue="" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
                  <option value="" disabled>Select a lead</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {(lead.display_name || 'Unnamed lead')} · {(lead.current_contact_channel || 'unknown')} · {(lead.current_stage || 'unknown')}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                Preparation writes internal enrollment/wait/job state only. It does not contact the selected lead.
              </div>

              <button type="submit" className="btn-primary">Prepare controlled worker job</button>
            </form>
          </section>

          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
                <Cpu size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">2. Process with generic worker</h2>
                <p className="mt-1 text-sm text-slate-500">Atomically claims exactly this scheduled job and runs the reusable published-flow worker code.</p>
              </div>
            </div>

            {!enrollment ? (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Prepare a controlled worker job first.</div>
            ) : (
              <div className="mt-5 space-y-3 text-sm">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div><strong>Enrollment:</strong> {enrollment.status}</div>
                  <div className="mt-1"><strong>Pinned version:</strong> v{enrollment.flow_version}</div>
                  <div className="mt-1"><strong>Current node:</strong> {currentNode ? `${currentNode.label} (${currentNode.node_type})` : '—'}</div>
                  <div className="mt-1"><strong>Next action:</strong> {formatDate(enrollment.next_action_at)}</div>
                  <div className="mt-1"><strong>Customer message sent:</strong> {metadata.customer_message_sent === true ? 'Yes' : 'No'}</div>
                </div>

                {latestWait ? (
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-violet-900">
                    <div><strong>Wait:</strong> {latestWait.wait_type} · {latestWait.status}</div>
                    <div className="mt-1"><strong>Resume:</strong> {formatDate(latestWait.resume_at)}</div>
                    <div className="mt-1"><strong>Timeout:</strong> {formatDate(latestWait.timeout_at)}</div>
                  </div>
                ) : null}

                {latestJob ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div><strong>Scheduled job:</strong> {latestJob.job_type} · {latestJob.status}</div>
                    <div className="mt-1"><strong>Scheduled:</strong> {formatDate(latestJob.scheduled_for)}</div>
                    <div className="mt-1"><strong>Attempts:</strong> {latestJob.attempt_count} / {latestJob.max_attempts}</div>
                    {latestJob.last_error ? <div className="mt-1 text-rose-700"><strong>Last error:</strong> {latestJob.last_error}</div> : null}
                  </div>
                ) : null}

                {canProcess && latestJob ? (
                  <div className="space-y-3">
                    <form action={processRuntimeWorkerJobAction} className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                      <input type="hidden" name="job_id" value={latestJob.id} />
                      <div className="mb-3 flex items-start gap-2 text-xs leading-5 text-sky-800">
                        <TimerReset className="mt-0.5 shrink-0" size={15} />
                        <span>Controlled fast-forward allows this specific job to be claimed before its real due time. The same atomic claim path will later be used by the scheduler worker.</span>
                      </div>
                      <button type="submit" className="btn-primary">Process one job with generic worker</button>
                    </form>

                    <form action={runRuntimeWorkerDoubleClaimTestAction} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <input type="hidden" name="job_id" value={latestJob.id} />
                      <div className="mb-3 text-xs leading-5 text-amber-800">
                        Concurrency test: two independent service-role workers will race to atomically claim this exact scheduled job. Exactly one must win; the loser must receive no claim.
                      </div>
                      <button type="submit" className="btn-primary">Run double-claim race test</button>
                    </form>

                    <form action={runRuntimeWorkerCrossTenantTestAction} className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-4">
                      <input type="hidden" name="job_id" value={latestJob.id} />
                      <div className="mb-3 text-xs leading-5 text-fuchsia-900">
                        Tenant isolation test: a worker scoped to a different organization will try to claim this exact job. It must receive zero rows, and this job must remain scheduled with attempts unchanged.
                      </div>
                      <button type="submit" className="btn-primary">Run cross-tenant isolation test</button>
                    </form>
                  </div>
                ) : null}

                {enrollment.status === 'completed' ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                    <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Worker-controlled flow completed.</div>
                    <div className="mt-1 text-xs">No background runtime or customer messaging was enabled.</div>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
