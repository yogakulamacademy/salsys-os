import { CheckCircle2, MessageCircleReply, ShieldCheck, TimerOff, TimerReset } from 'lucide-react';

import {
  simulateControlledInboundReplyAction,
  startControlledReplyWaitAction,
} from '@/app/automation/reply-wait-test/actions';
import { processControlledReplyTimeoutAction } from '@/app/automation/reply-wait-test/timeout-action';
import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type Workflow = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  stop_on_reply: boolean;
};

type Lead = {
  id: string;
  display_name: string | null;
  current_contact_channel: string | null;
  current_stage: string | null;
};

type Enrollment = {
  id: string;
  status: string;
  lead_id: string;
  next_action_at: string | null;
  metadata: Record<string, unknown> | null;
};

type WaitState = {
  id: string;
  status: string;
  wait_type: string;
  lead_id: string;
  timeout_at: string | null;
  resumed_at: string | null;
  resume_event_id: string | null;
};

type ScheduledJob = {
  id: string;
  status: string;
  job_type: string;
  scheduled_for: string;
  attempt_count: number;
  cancelled_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export default async function ReplyWaitTestPage({
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
  let workflow: Workflow | null = null;
  let leads: Lead[] = [];
  let enrollment: Enrollment | null = null;
  let waitState: WaitState | null = null;
  let scheduledJob: ScheduledJob | null = null;

  if (user) {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const [manageResult, workflowResult, leadResult, enrollmentResult, waitResult, jobResult] = await Promise.all([
        supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
        supabase
          .from('automation_workflows')
          .select('id,name,status,stop_on_reply')
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
        supabase
          .from('automation_enrollments')
          .select('id,status,lead_id,next_action_at,metadata')
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('automation_wait_states')
          .select('id,status,wait_type,lead_id,timeout_at,resumed_at,resume_event_id')
          .eq('organization_id', organizationId)
          .eq('wait_type', 'reply')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('automation_scheduled_jobs')
          .select('id,status,job_type,scheduled_for,attempt_count,cancelled_at')
          .eq('organization_id', organizationId)
          .eq('job_type', 'resume_reply_timeout')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      canManage = manageResult.data === true;
      workflow = (workflowResult.data ?? null) as Workflow | null;
      leads = (leadResult.data ?? []) as Lead[];
      enrollment = (enrollmentResult.data ?? null) as Enrollment | null;
      waitState = (waitResult.data ?? null) as WaitState | null;
      scheduledJob = (jobResult.data ?? null) as ScheduledJob | null;
    }
  }

  const waitingReply = waitState?.status === 'waiting';
  const timeoutScheduled = scheduledJob?.status === 'scheduled';
  const timeoutDue = scheduledJob
    ? new Date(scheduledJob.scheduled_for).getTime() <= Date.now()
    : false;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Reply Wait Test"
        title="Wait for Reply Runtime Test"
        description={`Validate reply-wins and no-reply timeout behavior for ${organizationName} without sending any customer message.`}
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
            <strong>Controlled mode:</strong> this page only writes internal automation state and synthetic test events when you press a button. It does not send WhatsApp, Instagram, email, SMS, or any other customer message.
          </div>
        </div>
      </div>

      {!canManage ? (
        <div className="card-pad text-sm text-slate-600">Organization admin access is required.</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
                <TimerReset size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">1. Start waiting for a reply</h2>
                <p className="mt-1 text-sm text-slate-500">Creates one enrollment, one reply wait-state and one timeout job.</p>
              </div>
            </div>

            {workflow ? (
              <form action={startControlledReplyWaitAction} className="mt-5 space-y-4">
                <input type="hidden" name="workflow_id" value={workflow.id} />
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-bold text-slate-900">{workflow.name}</div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Active · Stop on reply {workflow.stop_on_reply ? 'ON' : 'OFF'}
                  </div>
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
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Reply timeout</span>
                  <select name="timeout_minutes" defaultValue="1" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
                    <option value="1">1 minute</option>
                    <option value="5">5 minutes</option>
                    <option value="10">10 minutes</option>
                  </select>
                </label>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                  This starts an internal reply wait only. It does not contact the selected lead.
                </div>

                <button type="submit" className="btn-primary">
                  <TimerReset size={15} />
                  Start controlled reply wait
                </button>
              </form>
            ) : (
              <div className="mt-5 text-sm text-slate-500">An active workflow is required.</div>
            )}
          </section>

          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <MessageCircleReply size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">2. Reply arrives</h2>
                <p className="mt-1 text-sm text-slate-500">Simulates the inbound event that should cancel the no-reply timeout path.</p>
              </div>
            </div>

            {waitingReply && waitState ? (
              <form action={simulateControlledInboundReplyAction} className="mt-5 space-y-4">
                <input type="hidden" name="wait_state_id" value={waitState.id} />
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <div><strong>Status:</strong> waiting</div>
                  <div className="mt-1"><strong>Timeout:</strong> {formatDate(waitState.timeout_at)}</div>
                </div>
                <button type="submit" className="btn-primary">
                  <MessageCircleReply size={15} />
                  Simulate inbound reply
                </button>
              </form>
            ) : waitState ? (
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                <CheckCircle2 size={16} />
                Latest reply wait is {waitState.status}.
              </div>
            ) : (
              <div className="mt-5 text-sm text-slate-500">Start a reply wait first.</div>
            )}
          </section>

          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <TimerOff size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">3. No reply timeout</h2>
                <p className="mt-1 text-sm text-slate-500">Manually simulates the future scheduler worker taking the no-reply branch.</p>
              </div>
            </div>

            {waitingReply && timeoutScheduled && scheduledJob ? (
              <form action={processControlledReplyTimeoutAction} className="mt-5 space-y-4">
                <input type="hidden" name="job_id" value={scheduledJob.id} />
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <div><strong>Job:</strong> scheduled</div>
                  <div className="mt-1"><strong>Due:</strong> {formatDate(scheduledJob.scheduled_for)}</div>
                  <div className="mt-1"><strong>Due now:</strong> {timeoutDue ? 'Yes' : 'No'}</div>
                  <div className="mt-1"><strong>Attempts:</strong> {scheduledJob.attempt_count}</div>
                </div>
                <button type="submit" className="btn-primary">
                  <TimerOff size={15} />
                  Process no-reply timeout
                </button>
              </form>
            ) : scheduledJob ? (
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Timeout job is {scheduledJob.status}.
              </div>
            ) : (
              <div className="mt-5 text-sm text-slate-500">Start a reply wait first.</div>
            )}
          </section>
        </div>
      )}

      <section className="card-pad">
        <h2 className="font-bold text-slate-950">Persisted reply-wait state</h2>
        <p className="mt-1 text-sm text-slate-500">Latest tenant-scoped rows from the wait-for-reply foundation.</p>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Enrollment</div>
            <div className="mt-2 font-semibold text-slate-900">{enrollment?.status || 'None'}</div>
            <div className="mt-1 text-slate-500">next_action_at: {formatDate(enrollment?.next_action_at ?? null)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Reply wait</div>
            <div className="mt-2 font-semibold text-slate-900">{waitState?.status || 'None'}</div>
            <div className="mt-1 text-slate-500">resume event: {waitState?.resume_event_id ? 'recorded' : 'none'}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Timeout job</div>
            <div className="mt-2 font-semibold text-slate-900">{scheduledJob?.status || 'None'}</div>
            <div className="mt-1 text-slate-500">scheduled: {formatDate(scheduledJob?.scheduled_for ?? null)}</div>
            <div className="mt-1 text-slate-500">attempts: {scheduledJob?.attempt_count ?? 0}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
