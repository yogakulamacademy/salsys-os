import { AlertTriangle, CheckCircle2, RefreshCcw, ShieldCheck } from 'lucide-react';

import {
  prepareRuntimeWorkerRetryTestAction,
  probeFailedRuntimeWorkerJobAction,
  processRuntimeWorkerRetryAttemptAction,
} from '@/app/automation/runtime-worker-retry-test/actions';
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

type JobRow = {
  id: string;
  status: string;
  job_type: string;
  scheduled_for: string;
  claimed_at: string | null;
  completed_at: string | null;
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

export default async function RuntimeWorkerRetryTestPage({
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
  let job: JobRow | null = null;

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

      const { data: jobData } = await supabase
        .from('automation_scheduled_jobs')
        .select('id,status,job_type,scheduled_for,claimed_at,completed_at,attempt_count,max_attempts,last_error,payload')
        .eq('organization_id', organizationId)
        .eq('payload->>source', 'runtime_worker_retry_controlled_test')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      job = (jobData ?? null) as JobRow | null;
    }
  }

  const payload = (job?.payload ?? {}) as Record<string, unknown>;
  const probe = (payload.terminal_failure_probe ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Runtime Worker"
        title="Retry & Terminal Failure Test"
        description={`Safely validate retry backoff and terminal failure handling for ${organizationName} without enabling background runtime or customer messaging.`}
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
            <strong>Controlled failure-only mode:</strong> this creates a `workflow_wakeup` job that the current worker intentionally does not support. The failure exercises retry/backoff only; no enrollment is advanced and no provider or customer message is sent.
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
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">1. Prepare failure-only job</h2>
                <p className="mt-1 text-sm text-slate-500">Creates one scheduled unsupported job with max attempts = 3.</p>
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

            <form action={prepareRuntimeWorkerRetryTestAction} className="mt-5 space-y-4">
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

              <button type="submit" className="btn-primary">Prepare failure-only job</button>
            </form>
          </section>

          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
                <RefreshCcw size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">2. Run retry attempts</h2>
                <p className="mt-1 text-sm text-slate-500">Each click uses the same atomic claim + worker failure path and fast-forwards the scheduled retry for controlled testing.</p>
              </div>
            </div>

            {!job ? (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Prepare a failure-only job first.</div>
            ) : (
              <div className="mt-5 space-y-3 text-sm">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div><strong>Job type:</strong> {job.job_type}</div>
                  <div className="mt-1"><strong>Status:</strong> {job.status}</div>
                  <div className="mt-1"><strong>Attempts:</strong> {job.attempt_count} / {job.max_attempts}</div>
                  <div className="mt-1"><strong>Scheduled:</strong> {formatDate(job.scheduled_for)}</div>
                  <div className="mt-1"><strong>Claimed:</strong> {formatDate(job.claimed_at)}</div>
                  <div className="mt-1"><strong>Completed:</strong> {formatDate(job.completed_at)}</div>
                  <div className="mt-1"><strong>Customer message sent:</strong> {payload.customer_message_sent === true ? 'Yes' : 'No'}</div>
                  {job.last_error ? <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-rose-700"><strong>Last error:</strong> {job.last_error}</div> : null}
                </div>

                {job.status === 'scheduled' ? (
                  <form action={processRuntimeWorkerRetryAttemptAction} className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                    <input type="hidden" name="job_id" value={job.id} />
                    <div className="mb-3 text-xs leading-5 text-sky-800">
                      Controlled fast-forward ignores the future scheduled time for this exact test job. Attempt 1 should requeue ~30 seconds later, attempt 2 ~60 seconds later, and attempt 3 should become terminal `failed`.
                    </div>
                    <button type="submit" className="btn-primary">Run one failure attempt</button>
                  </form>
                ) : null}

                {job.status === 'failed' ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                      <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Terminal failure reached.</div>
                      <div className="mt-1 text-xs">The job has exhausted its maximum attempts and is no longer scheduled.</div>
                    </div>
                    <form action={probeFailedRuntimeWorkerJobAction} className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                      <input type="hidden" name="job_id" value={job.id} />
                      <div className="mb-3 text-xs leading-5 text-violet-800">Final probe: confirm the atomic claim RPC returns zero rows for this failed job.</div>
                      <button type="submit" className="btn-primary">Verify failed job cannot be reclaimed</button>
                    </form>
                  </div>
                ) : null}

                {probe.claims_observed === 0 ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                    <strong>Terminal no-reclaim verified:</strong> failed job returned 0 claims.
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
