import { CheckCircle2, MessageCircleReply, ShieldCheck, Workflow } from 'lucide-react';

import {
  advancePinnedEnrollmentOneStepAction,
  pinLeadToPublishedFlowAction,
} from '@/app/automation/published-runtime-test/actions';
import { simulatePublishedInboundReplyAction } from '@/app/automation/published-runtime-test/reply-action';
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

type LeadRow = {
  id: string;
  display_name: string | null;
  current_contact_channel: string | null;
  current_stage: string | null;
};

type EnrollmentRow = {
  id: string;
  lead_id: string;
  status: string;
  flow_version: number;
  current_node_id: string | null;
  next_action_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type NodeRow = {
  id: string;
  node_key: string;
  node_type: string;
  label: string;
};

type WaitRow = {
  id: string;
  status: string;
  timeout_at: string | null;
};

type JobRow = {
  id: string;
  status: string;
  scheduled_for: string;
  attempt_count: number;
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export default async function PublishedRuntimeTestPage({
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
  let latestEnrollment: EnrollmentRow | null = null;
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
          .select('id,name,status,current_draft_version,current_published_version,runtime_flow_enabled')
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
        const { data: enrollment } = await supabase
          .from('automation_enrollments')
          .select('id,lead_id,status,flow_version,current_node_id,next_action_at,metadata,created_at')
          .eq('organization_id', organizationId)
          .eq('workflow_id', workflow.id)
          .eq('metadata->>source', 'published_flow_controlled_pin_test')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        latestEnrollment = (enrollment ?? null) as EnrollmentRow | null;

        if (latestEnrollment?.current_node_id) {
          const [{ data: node }, { data: wait }, { data: job }] = await Promise.all([
            supabase
              .from('automation_flow_nodes')
              .select('id,node_key,node_type,label')
              .eq('organization_id', organizationId)
              .eq('workflow_id', workflow.id)
              .eq('version_number', latestEnrollment.flow_version)
              .eq('id', latestEnrollment.current_node_id)
              .maybeSingle(),
            supabase
              .from('automation_wait_states')
              .select('id,status,timeout_at')
              .eq('organization_id', organizationId)
              .eq('enrollment_id', latestEnrollment.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('automation_scheduled_jobs')
              .select('id,status,scheduled_for,attempt_count')
              .eq('organization_id', organizationId)
              .eq('enrollment_id', latestEnrollment.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);

          currentNode = (node ?? null) as NodeRow | null;
          latestWait = (wait ?? null) as WaitRow | null;
          latestJob = (job ?? null) as JobRow | null;
        }
      }
    }
  }

  const metadata = (latestEnrollment?.metadata ?? {}) as Record<string, unknown>;
  const canAdvance = latestEnrollment?.status === 'active' && currentNode?.node_type === 'trigger';
  const canSimulateReply =
    latestEnrollment?.status === 'active' &&
    currentNode?.node_type === 'wait_for_reply' &&
    latestWait?.status === 'waiting';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Published Runtime Test"
        title="Published Flow Enrollment Pin Test"
        description={`Verify that ${organizationName} can pin and advance a controlled enrollment against the immutable published flow snapshot while the editable draft continues separately.`}
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
            <strong>Controlled mode:</strong> these actions read only the enrollment’s pinned published version. They may create internal wait/job/event/variable state, but automatic runtime remains disabled and no customer message is sent.
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
                <h2 className="font-bold text-slate-950">Pin one lead to the published flow</h2>
                <p className="mt-1 text-sm text-slate-500">The enrollment must use Published Version {workflow.current_published_version ?? '—'}, not Draft Version {workflow.current_draft_version ?? '—'}.</p>
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
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Auto runtime</div>
                <div className="mt-1 font-semibold text-slate-900">{workflow.runtime_flow_enabled ? 'Enabled' : 'Disabled'}</div>
              </div>
            </div>

            <form action={pinLeadToPublishedFlowAction} className="mt-5 space-y-4">
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
                This writes one internal enrollment record only. It will not execute the trigger or contact the selected lead.
              </div>

              <button type="submit" className="btn-primary">Pin controlled enrollment</button>
            </form>
          </section>

          <section className="card-pad">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">Latest controlled pin</h2>
                <p className="mt-1 text-sm text-slate-500">This remains tied to the published snapshot even if Draft Version {workflow.current_draft_version ?? '—'} changes.</p>
              </div>
            </div>

            {latestEnrollment ? (
              <div className="mt-5 space-y-3 text-sm">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div><strong>Status:</strong> {latestEnrollment.status}</div>
                  <div className="mt-1"><strong>Pinned flow version:</strong> v{latestEnrollment.flow_version}</div>
                  <div className="mt-1"><strong>Draft version at start:</strong> v{String(metadata.draft_version_at_start ?? '—')}</div>
                  <div className="mt-1"><strong>Current node:</strong> {currentNode ? `${currentNode.label} (${currentNode.node_type})` : '—'}</div>
                  <div className="mt-1"><strong>Next action:</strong> {formatDate(latestEnrollment.next_action_at)}</div>
                  <div className="mt-1"><strong>Customer message sent:</strong> {metadata.customer_message_sent === true ? 'Yes' : 'No'}</div>
                </div>

                {canAdvance ? (
                  <form action={advancePinnedEnrollmentOneStepAction}>
                    <input type="hidden" name="workflow_id" value={workflow.id} />
                    <input type="hidden" name="enrollment_id" value={latestEnrollment.id} />
                    <button type="submit" className="btn-primary">Advance one published step</button>
                  </form>
                ) : null}

                {canSimulateReply && latestWait ? (
                  <form action={simulatePublishedInboundReplyAction} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <input type="hidden" name="workflow_id" value={workflow.id} />
                    <input type="hidden" name="enrollment_id" value={latestEnrollment.id} />
                    <input type="hidden" name="wait_state_id" value={latestWait.id} />
                    <div className="mb-3 text-xs leading-5 text-emerald-800">
                      This creates a synthetic inbound <strong>message.received</strong> event, cancels the timeout, evaluates the published v{latestEnrollment.flow_version} reply branch, and sends nothing to the customer.
                    </div>
                    <button type="submit" className="btn-primary">
                      <MessageCircleReply size={15} />
                      Simulate published inbound reply
                    </button>
                  </form>
                ) : null}

                {latestWait ? (
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-violet-900">
                    <div><strong>Reply wait:</strong> {latestWait.status}</div>
                    <div className="mt-1"><strong>Timeout:</strong> {formatDate(latestWait.timeout_at)}</div>
                  </div>
                ) : null}

                {latestJob ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div><strong>Timeout job:</strong> {latestJob.status}</div>
                    <div className="mt-1"><strong>Scheduled:</strong> {formatDate(latestJob.scheduled_for)}</div>
                    <div className="mt-1"><strong>Attempts:</strong> {latestJob.attempt_count}</div>
                  </div>
                ) : null}

                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                  {currentNode?.node_type === 'trigger'
                    ? 'Enrollment is parked only. No graph step has executed.'
                    : latestEnrollment.status === 'completed'
                      ? 'Controlled published branch completed. No customer message was sent.'
                      : 'Enrollment advanced only inside the pinned published version. No customer message was sent.'}
                </div>
              </div>
            ) : (
              <div className="mt-5 text-sm text-slate-500">No controlled published-flow enrollment has been created yet.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
