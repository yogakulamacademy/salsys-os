import { AlarmClock, CheckCircle2, Clock3, PlayCircle, ShieldCheck } from 'lucide-react';

import {
  resumeControlledDueWaitAction,
  scheduleControlledDelayAction,
} from '@/app/automation/scheduler-test/actions';
import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type Workflow = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
};

type Lead = {
  id: string;
  display_name: string | null;
  current_contact_channel: string | null;
  current_stage: string | null;
};

type ScheduledJob = {
  id: string;
  status: 'scheduled' | 'claimed' | 'completed' | 'cancelled' | 'failed';
  scheduled_for: string;
  workflow_id: string;
  lead_id: string;
  enrollment_id: string | null;
  wait_state_id: string | null;
  attempt_count: number;
};

type Enrollment = {
  id: string;
  workflow_id: string;
  lead_id: string;
  status: 'active' | 'paused' | 'completed' | 'stopped' | 'cancelled';
  next_action_at: string | null;
  metadata: Record<string, unknown> | null;
};

type WaitState = {
  id: string;
  status: 'waiting' | 'ready' | 'resumed' | 'cancelled' | 'expired' | 'failed';
  wait_type: 'delay' | 'until' | 'reply';
  resume_at: string | null;
  enrollment_id: string | null;
  lead_id: string;
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export default async function AutomationSchedulerTestPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let workflows: Workflow[] = [];
  let leads: Lead[] = [];
  let jobs: ScheduledJob[] = [];
  let enrollments: Enrollment[] = [];
  let waits: WaitState[] = [];
  let organizationName = 'Current organization';
  let canManage = false;

  if (user) {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const [
        { data: manageData },
        { data: workflowRows },
        { data: leadRows },
        { data: jobRows },
        { data: enrollmentRows },
        { data: waitRows },
      ] = await Promise.all([
        supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
        supabase
          .from('automation_workflows')
          .select('id,name,status')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .order('updated_at', { ascending: false }),
        supabase
          .from('leads')
          .select('id,display_name,current_contact_channel,current_stage')
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false })
          .limit(25),
        supabase
          .from('automation_scheduled_jobs')
          .select('id,status,scheduled_for,workflow_id,lead_id,enrollment_id,wait_state_id,attempt_count')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('automation_enrollments')
          .select('id,workflow_id,lead_id,status,next_action_at,metadata')
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false })
          .limit(10),
        supabase
          .from('automation_wait_states')
          .select('id,status,wait_type,resume_at,enrollment_id,lead_id')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      canManage = manageData === true;
      workflows = (workflowRows ?? []) as Workflow[];
      leads = (leadRows ?? []) as Lead[];
      jobs = (jobRows ?? []) as ScheduledJob[];
      enrollments = (enrollmentRows ?? []) as Enrollment[];
      waits = (waitRows ?? []) as WaitState[];
    }
  }

  const activeWorkflow = workflows[0];
  const latestJob = jobs[0];
  const latestEnrollment = enrollments[0];
  const latestWait = waits[0];
  const latestJobDue = latestJob ? new Date(latestJob.scheduled_for).getTime() <= Date.now() : false;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Scheduler Test"
        title="Wait & Scheduler Runtime Test"
        description={`Validate per-lead waiting and due-job resumption for ${organizationName} without enabling background scheduling or customer messaging.`}
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
            <strong>Controlled mode:</strong> this page persists enrollment/wait/job state only when you press a button. There is no cron worker, provider send, WhatsApp message, Instagram message, email, or SMS action on this page.
          </div>
        </div>
      </div>

      {!canManage ? (
        <div className="card-pad text-sm text-slate-600">Organization admin access is required.</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
                <AlarmClock size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">1. Schedule a controlled delay</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Creates one enrollment, one delay wait-state and one deduped scheduled job.
                </p>
              </div>
            </div>

            {activeWorkflow ? (
              <form action={scheduleControlledDelayAction} className="mt-5 space-y-4">
                <input type="hidden" name="workflow_id" value={activeWorkflow.id} />
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-bold text-slate-900">{activeWorkflow.name}</div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">Active workflow</div>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Test lead</span>
                  <select name="lead_id" required className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
                    <option value="">Select a lead</option>
                    {leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {(lead.display_name || 'Unnamed lead')} · {(lead.current_contact_channel || 'unknown')} · {(lead.current_stage || 'unknown')}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Delay</span>
                  <select name="delay_minutes" defaultValue="1" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
                    <option value="1">1 minute</option>
                    <option value="2">2 minutes</option>
                    <option value="5">5 minutes</option>
                    <option value="10">10 minutes</option>
                  </select>
                </label>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                  Scheduling this test writes internal automation state only. It does not contact the selected lead.
                </div>

                <button type="submit" className="btn-primary">
                  <Clock3 size={15} />
                  Schedule controlled wait
                </button>
              </form>
            ) : (
              <div className="mt-5 text-sm text-slate-500">Activate a Smart Trigger workflow first.</div>
            )}
          </section>

          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <PlayCircle size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">2. Resume the due wait</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Manually simulates what the future scheduler worker will do when a job becomes due.
                </p>
              </div>
            </div>

            {latestJob ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-slate-900">Latest scheduled job</span>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${latestJob.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {latestJob.status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-600">
                    <div><strong>Scheduled for:</strong> {formatDate(latestJob.scheduled_for)}</div>
                    <div><strong>Due now:</strong> {latestJobDue ? 'Yes' : 'No'}</div>
                    <div><strong>Attempts:</strong> {latestJob.attempt_count}</div>
                  </div>
                </div>

                {latestJob.status === 'scheduled' ? (
                  <form action={resumeControlledDueWaitAction}>
                    <input type="hidden" name="job_id" value={latestJob.id} />
                    <button type="submit" className="btn-primary">
                      <PlayCircle size={15} />
                      Resume due wait
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                    <CheckCircle2 size={16} />
                    Latest job is {latestJob.status}.
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 text-sm text-slate-500">Schedule a controlled wait first.</div>
            )}
          </section>
        </div>
      )}

      {canManage ? (
        <section className="card-pad">
          <h2 className="font-bold text-slate-950">Persisted scheduler state</h2>
          <p className="mt-1 text-sm text-slate-500">Latest tenant-scoped rows from the scheduler foundation.</p>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Enrollment</div>
              <div className="mt-2 text-sm font-bold text-slate-900">{latestEnrollment?.status || 'None'}</div>
              <div className="mt-2 text-xs leading-5 text-slate-600">
                Next action: {formatDate(latestEnrollment?.next_action_at ?? null)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Wait state</div>
              <div className="mt-2 text-sm font-bold text-slate-900">{latestWait?.status || 'None'}</div>
              <div className="mt-2 text-xs leading-5 text-slate-600">
                Type: {latestWait?.wait_type || '—'}<br />
                Resume: {formatDate(latestWait?.resume_at ?? null)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Scheduled job</div>
              <div className="mt-2 text-sm font-bold text-slate-900">{latestJob?.status || 'None'}</div>
              <div className="mt-2 text-xs leading-5 text-slate-600">
                Due: {formatDate(latestJob?.scheduled_for ?? null)}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
