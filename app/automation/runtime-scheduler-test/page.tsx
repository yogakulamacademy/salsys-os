import { CalendarClock, CheckCircle2, Play, ShieldCheck } from 'lucide-react';

import {
  prepareRuntimeSchedulerTestAction,
  runRuntimeSchedulerSweepAction,
  verifyProductionSchedulerGateAction,
  verifyRuntimeSchedulerApiDisabledAction,
} from '@/app/automation/runtime-scheduler-test/actions';
import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type WorkflowRow = {
  id: string;
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

type JobRow = {
  id: string;
  status: string;
  job_type: string;
  scheduled_for: string;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export default async function RuntimeSchedulerTestPage({
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
          .select('id,current_published_version,current_draft_version,runtime_flow_enabled')
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
          .eq('metadata->>source', 'runtime_scheduler_controlled_test')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        enrollment = (enrollmentData ?? null) as EnrollmentRow | null;

        if (enrollment?.id) {
          const { data: jobData } = await supabase
            .from('automation_scheduled_jobs')
            .select('id,status,job_type,scheduled_for,attempt_count,max_attempts,last_error')
            .eq('organization_id', organizationId)
            .eq('enrollment_id', enrollment.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          latestJob = (jobData ?? null) as JobRow | null;
        }
      }
    }
  }

  const metadata = (enrollment?.metadata ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Scheduler"
        title="Controlled Runtime Scheduler Test"
        description={`Validate due-job pickup for ${organizationName} without enabling recurring background runtime or customer messaging.`}
      />

      {query.notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{query.notice}</div> : null}
      {query.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{query.error}</div> : null}

      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <div><strong>Controlled scheduler mode:</strong> prepares already-due internal jobs and manually runs the same due-job sweep logic that a future cron will call. No cron is enabled, no AI runs, and no provider/customer message is sent.</div>
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
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><CalendarClock size={18} /></div>
              <div>
                <h2 className="font-bold text-slate-950">1. Prepare one due scheduler job</h2>
                <p className="mt-1 text-sm text-slate-500">Creates a pinned Published v{workflow.current_published_version ?? '—'} enrollment on the delay node with one already-due `resume_wait` job.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Published</div><div className="mt-1 font-semibold text-slate-900">v{workflow.current_published_version ?? '—'}</div></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Draft</div><div className="mt-1 font-semibold text-slate-900">v{workflow.current_draft_version ?? '—'}</div></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Background runtime</div><div className="mt-1 font-semibold text-slate-900">{workflow.runtime_flow_enabled ? 'Enabled' : 'Disabled'}</div></div>
            </div>

            <form action={prepareRuntimeSchedulerTestAction} className="mt-5 space-y-4">
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Test lead</span>
                <select name="lead_id" required defaultValue="" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
                  <option value="" disabled>Select a lead</option>
                  {leads.map((lead) => <option key={lead.id} value={lead.id}>{(lead.display_name || 'Unnamed lead')} · {(lead.current_contact_channel || 'unknown')} · {(lead.current_stage || 'unknown')}</option>)}
                </select>
              </label>
              <button type="submit" className="btn-primary">Prepare due scheduler job</button>
            </form>
          </section>

          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><Play size={18} /></div>
              <div>
                <h2 className="font-bold text-slate-950">2. Run one scheduler sweep</h2>
                <p className="mt-1 text-sm text-slate-500">Finds due controlled scheduler jobs, then claims and processes them through the generic worker.</p>
              </div>
            </div>

            {!enrollment ? (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Prepare a due scheduler job first.</div>
            ) : (
              <div className="mt-5 space-y-3 text-sm">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div><strong>Enrollment:</strong> {enrollment.status}</div>
                  <div className="mt-1"><strong>Pinned version:</strong> v{enrollment.flow_version}</div>
                  <div className="mt-1"><strong>Next action:</strong> {formatDate(enrollment.next_action_at)}</div>
                  <div className="mt-1"><strong>Customer message sent:</strong> {metadata.customer_message_sent === true ? 'Yes' : 'No'}</div>
                </div>

                {latestJob ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div><strong>Job:</strong> {latestJob.job_type} · {latestJob.status}</div>
                    <div className="mt-1"><strong>Scheduled:</strong> {formatDate(latestJob.scheduled_for)}</div>
                    <div className="mt-1"><strong>Attempts:</strong> {latestJob.attempt_count} / {latestJob.max_attempts}</div>
                    {latestJob.last_error ? <div className="mt-1 text-rose-700"><strong>Last error:</strong> {latestJob.last_error}</div> : null}
                  </div>
                ) : null}

                {latestJob?.status === 'scheduled' && enrollment.status === 'active' ? (
                  <form action={runRuntimeSchedulerSweepAction} className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                    <div className="mb-3 text-xs leading-5 text-sky-800">This manually invokes only the controlled scheduler sweep. It does not enable Vercel cron or set `runtime_flow_enabled=true`.</div>
                    <button type="submit" className="btn-primary">Run controlled scheduler sweep</button>
                  </form>
                ) : null}

                {enrollment.status === 'completed' ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                      <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Due-job scheduler path completed.</div>
                      <div className="mt-1 text-xs">Recurring background scheduling is still disabled.</div>
                    </div>
                    {!workflow.runtime_flow_enabled ? (
                      <form action={verifyProductionSchedulerGateAction} className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                        <input type="hidden" name="workflow_id" value={workflow.id} />
                        <div className="mb-3 text-xs leading-5 text-violet-800">
                          Final safety gate: invoke the production scheduler path while `runtime_flow_enabled=false`. It must scan 0 workflows and claim 0 jobs.
                        </div>
                        <button type="submit" className="btn-primary">Verify production scheduler gate</button>
                      </form>
                    ) : null}
                    <form action={verifyRuntimeSchedulerApiDisabledAction} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 text-xs leading-5 text-slate-700">
                        Protected API gate: invokes the scheduler route with server-side `CRON_SECRET` while the global `AUTOMATION_SCHEDULER_ENABLED` kill switch remains false/unset. It must return enabled=false and process 0 jobs.
                      </div>
                      <button type="submit" className="btn-primary">Verify scheduler API disabled gate</button>
                    </form>
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
