import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type WorkflowRow = {
  id: string;
  name: string;
  status: string;
  current_published_version: number | null;
  runtime_flow_enabled: boolean;
};

type LeadRow = {
  id: string;
  lead_code: string | null;
};

type EnrollmentRow = {
  id: string;
  workflow_id: string;
  lead_id: string;
  status: string;
  attempt_count: number;
  next_action_at: string | null;
  last_event_at: string | null;
  stopped_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  current_node_id: string | null;
  flow_version: number;
};

type JobRow = {
  id: string;
  workflow_id: string;
  enrollment_id: string | null;
  lead_id: string;
  job_type: string;
  status: string;
  scheduled_for: string;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type ProviderAuditRow = {
  id: string;
  workflow_id: string | null;
  enrollment_id: string | null;
  lead_id: string;
  request_mode: string;
  status: string;
  block_reasons: unknown;
  provider_message_id: string | null;
  provider_error: string | null;
  customer_message_sent: boolean;
  prepared_at: string;
  sent_at: string | null;
  provider_delivery_status: string | null;
  delivered_at: string | null;
  read_at: string | null;
  delivery_failed_at: string | null;
};

type RunRow = {
  id: string;
  workflow_id: string;
  lead_id: string | null;
  status: string;
  reason: string | null;
  attempt_no: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
};

function formatTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

function shortId(value: string | null) {
  if (!value) return '—';
  return value.length > 13 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function metadataText(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function reasonsText(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return '—';
  return value
    .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
}

function statusClass(status: string) {
  const value = status.toLowerCase();
  if (['completed', 'sent', 'delivered', 'read', 'active', 'approved'].includes(value)) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  }
  if (['failed', 'error', 'blocked', 'rejected', 'cancelled', 'stopped'].includes(value)) {
    return 'bg-rose-50 text-rose-700 ring-rose-200';
  }
  if (['scheduled', 'waiting', 'pending', 'claimed', 'paused', 'awaiting_approval', 'ready'].includes(value)) {
    return 'bg-amber-50 text-amber-700 ring-amber-200';
  }
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${statusClass(status)}`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

export default async function AutomationRunsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="card-pad">
        <p className="text-sm text-slate-600">Sign in to inspect automation runtime activity.</p>
      </div>
    );
  }

  let organizationName = 'Current organization';
  let workflows: WorkflowRow[] = [];
  let enrollments: EnrollmentRow[] = [];
  let jobs: JobRow[] = [];
  let audits: ProviderAuditRow[] = [];
  let runs: RunRow[] = [];
  let leads: LeadRow[] = [];
  let totalRuns = 0;
  let activeEnrollments = 0;
  let pendingJobs = 0;
  let customerMessagesSent = 0;
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const admin = createAdminClient();
      const [
        workflowResult,
        enrollmentResult,
        jobResult,
        auditResult,
        runResult,
        totalRunsResult,
        activeEnrollmentResult,
        pendingJobResult,
        sentResult,
      ] = await Promise.all([
        admin
          .from('automation_workflows')
          .select('id,name,status,current_published_version,runtime_flow_enabled')
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false }),
        admin
          .from('automation_enrollments')
          .select(
            'id,workflow_id,lead_id,status,attempt_count,next_action_at,last_event_at,stopped_reason,metadata,created_at,updated_at,current_node_id,flow_version',
          )
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false })
          .limit(50),
        admin
          .from('automation_scheduled_jobs')
          .select(
            'id,workflow_id,enrollment_id,lead_id,job_type,status,scheduled_for,attempt_count,max_attempts,last_error,payload,created_at',
          )
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(50),
        admin
          .from('automation_provider_send_audits')
          .select(
            'id,workflow_id,enrollment_id,lead_id,request_mode,status,block_reasons,provider_message_id,provider_error,customer_message_sent,prepared_at,sent_at,provider_delivery_status,delivered_at,read_at,delivery_failed_at',
          )
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(50),
        admin
          .from('automation_runs')
          .select(
            'id,workflow_id,lead_id,status,reason,attempt_no,started_at,completed_at,error_message,created_at',
          )
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(50),
        admin
          .from('automation_runs')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId),
        admin
          .from('automation_enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('status', 'active'),
        admin
          .from('automation_scheduled_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .in('status', ['scheduled', 'claimed']),
        admin
          .from('automation_provider_send_audits')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('customer_message_sent', true),
      ]);

      const firstError = [
        workflowResult.error,
        enrollmentResult.error,
        jobResult.error,
        auditResult.error,
        runResult.error,
        totalRunsResult.error,
        activeEnrollmentResult.error,
        pendingJobResult.error,
        sentResult.error,
      ].find(Boolean);

      if (firstError) throw firstError;

      workflows = (workflowResult.data ?? []) as WorkflowRow[];
      enrollments = (enrollmentResult.data ?? []) as EnrollmentRow[];
      jobs = (jobResult.data ?? []) as JobRow[];
      audits = (auditResult.data ?? []) as ProviderAuditRow[];
      runs = (runResult.data ?? []) as RunRow[];
      totalRuns = totalRunsResult.count ?? 0;
      activeEnrollments = activeEnrollmentResult.count ?? 0;
      pendingJobs = pendingJobResult.count ?? 0;
      customerMessagesSent = sentResult.count ?? 0;

      const leadIds = Array.from(
        new Set(
          [
            ...enrollments.map((row) => row.lead_id),
            ...jobs.map((row) => row.lead_id),
            ...audits.map((row) => row.lead_id),
            ...runs.map((row) => row.lead_id).filter((id): id is string => Boolean(id)),
          ].filter(Boolean),
        ),
      );

      if (leadIds.length > 0) {
        const leadResult = await admin
          .from('leads')
          .select('id,lead_code')
          .eq('organization_id', organizationId)
          .in('id', leadIds);
        if (leadResult.error) throw leadResult.error;
        leads = (leadResult.data ?? []) as LeadRow[];
      }
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load runtime monitor.';
  }

  const workflowMap = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const workflowName = (id: string | null) => (id ? workflowMap.get(id)?.name || shortId(id) : '—');
  const leadName = (id: string | null) => {
    if (!id) return '—';
    const lead = leadMap.get(id);
    return lead?.lead_code || shortId(id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Observability"
        title="Runtime monitor"
        description={`Inspect Smart Trigger execution for ${organizationName}. This screen is read-only: it cannot run jobs, approve messages, retry providers, activate workflows, or send customer messages.`}
      />

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {loadError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 text-sm leading-6 text-violet-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <div>
            <strong>Audit-only view:</strong> use this page to understand what happened before changing safety gates. Runtime execution, human approvals, policy controls and provider execution remain separate actions elsewhere in Automation.
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="card-pad">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Automation runs</div>
            <Activity size={17} className="text-violet-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{totalRuns}</div>
          <div className="mt-1 text-xs text-slate-500">Trigger decision ledger</div>
        </div>
        <div className="card-pad">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Active enrollments</div>
            <Workflow size={17} className="text-violet-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{activeEnrollments}</div>
          <div className="mt-1 text-xs text-slate-500">Published-flow participants</div>
        </div>
        <div className="card-pad">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Pending jobs</div>
            <Clock3 size={17} className="text-violet-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{pendingJobs}</div>
          <div className="mt-1 text-xs text-slate-500">Scheduled or claimed</div>
        </div>
        <div className="card-pad">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Customer messages sent</div>
            <MessageSquareText size={17} className="text-violet-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{customerMessagesSent}</div>
          <div className="mt-1 text-xs text-slate-500">Provider-audited sends</div>
        </div>
      </section>

      <section className="card-pad">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-950">Workflow runtime posture</h2>
            <p className="mt-1 text-sm text-slate-500">Published version and runtime eligibility by workflow.</p>
          </div>
          <ShieldCheck size={18} className="text-slate-400" />
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr className="border-b border-slate-200">
                <th className="pb-3 pr-4">Workflow</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Published</th>
                <th className="pb-3 pr-4">Runtime</th>
              </tr>
            </thead>
            <tbody>
              {workflows.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-slate-500">No workflows found.</td></tr>
              ) : workflows.map((workflow) => (
                <tr key={workflow.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 font-semibold text-slate-900">{workflow.name}</td>
                  <td className="py-3 pr-4"><StatusPill status={workflow.status} /></td>
                  <td className="py-3 pr-4 text-slate-600">{workflow.current_published_version ? `Version ${workflow.current_published_version}` : 'None'}</td>
                  <td className="py-3 pr-4">
                    <StatusPill status={workflow.runtime_flow_enabled ? 'active' : 'disabled'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-pad">
        <div>
          <h2 className="font-bold text-slate-950">Recent flow enrollments</h2>
          <p className="mt-1 text-sm text-slate-500">Latest 50 lead journeys pinned to published flow versions.</p>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr className="border-b border-slate-200">
                <th className="pb-3 pr-4">Lead</th>
                <th className="pb-3 pr-4">Workflow</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Flow</th>
                <th className="pb-3 pr-4">Current node</th>
                <th className="pb-3 pr-4">Next action</th>
                <th className="pb-3 pr-4">Updated</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-slate-500">No enrollments yet.</td></tr>
              ) : enrollments.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="py-3 pr-4 font-semibold text-slate-900">{leadName(row.lead_id)}</td>
                  <td className="py-3 pr-4 text-slate-700">{workflowName(row.workflow_id)}</td>
                  <td className="py-3 pr-4"><StatusPill status={row.status} /></td>
                  <td className="py-3 pr-4 text-slate-600">v{row.flow_version}</td>
                  <td className="py-3 pr-4 text-slate-600">
                    {metadataText(row.metadata, 'current_node_key') || shortId(row.current_node_id)}
                    {row.stopped_reason ? <div className="mt-1 text-xs text-rose-600">{row.stopped_reason}</div> : null}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{formatTime(row.next_action_at)}</td>
                  <td className="py-3 pr-4 text-slate-500">{formatTime(row.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-pad">
        <div>
          <h2 className="font-bold text-slate-950">Scheduled runtime jobs</h2>
          <p className="mt-1 text-sm text-slate-500">Latest 50 wait/resume jobs with retry and error visibility.</p>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr className="border-b border-slate-200">
                <th className="pb-3 pr-4">Job</th>
                <th className="pb-3 pr-4">Lead</th>
                <th className="pb-3 pr-4">Workflow</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Scheduled</th>
                <th className="pb-3 pr-4">Attempts</th>
                <th className="pb-3 pr-4">Last error</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-slate-500">No scheduled jobs yet.</td></tr>
              ) : jobs.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="py-3 pr-4 font-semibold text-slate-900">{row.job_type.replaceAll('_', ' ')}</td>
                  <td className="py-3 pr-4 text-slate-700">{leadName(row.lead_id)}</td>
                  <td className="py-3 pr-4 text-slate-700">{workflowName(row.workflow_id)}</td>
                  <td className="py-3 pr-4"><StatusPill status={row.status} /></td>
                  <td className="py-3 pr-4 text-slate-600">{formatTime(row.scheduled_for)}</td>
                  <td className="py-3 pr-4 text-slate-600">{row.attempt_count}/{row.max_attempts}</td>
                  <td className="max-w-[320px] py-3 pr-4 text-xs leading-5 text-slate-500">{row.last_error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-pad">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-950">WhatsApp provider audit</h2>
            <p className="mt-1 text-sm text-slate-500">Latest 50 provider preparations, blocks, sends and delivery states.</p>
          </div>
          <MessageSquareText size={18} className="text-slate-400" />
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr className="border-b border-slate-200">
                <th className="pb-3 pr-4">Lead</th>
                <th className="pb-3 pr-4">Workflow</th>
                <th className="pb-3 pr-4">Mode</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Sent?</th>
                <th className="pb-3 pr-4">Delivery</th>
                <th className="pb-3 pr-4">Prepared</th>
                <th className="pb-3 pr-4">Block / error</th>
              </tr>
            </thead>
            <tbody>
              {audits.length === 0 ? (
                <tr><td colSpan={8} className="py-6 text-slate-500">No provider audit rows yet.</td></tr>
              ) : audits.map((row) => {
                const issue = row.provider_error || reasonsText(row.block_reasons);
                return (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="py-3 pr-4 font-semibold text-slate-900">{leadName(row.lead_id)}</td>
                    <td className="py-3 pr-4 text-slate-700">{workflowName(row.workflow_id)}</td>
                    <td className="py-3 pr-4 text-slate-600">{row.request_mode.replaceAll('_', ' ')}</td>
                    <td className="py-3 pr-4"><StatusPill status={row.status} /></td>
                    <td className="py-3 pr-4">
                      {row.customer_message_sent ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={13} /> Yes</span>
                      ) : (
                        <span className="text-xs font-bold text-slate-500">No</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{row.provider_delivery_status || '—'}</td>
                    <td className="py-3 pr-4 text-slate-500">{formatTime(row.prepared_at)}</td>
                    <td className="max-w-[340px] py-3 pr-4 text-xs leading-5 text-slate-500">{issue}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-pad">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-950">Trigger decision runs</h2>
            <p className="mt-1 text-sm text-slate-500">Latest 50 workflow run decisions and failures.</p>
          </div>
          <Activity size={18} className="text-slate-400" />
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr className="border-b border-slate-200">
                <th className="pb-3 pr-4">Workflow</th>
                <th className="pb-3 pr-4">Lead</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Attempt</th>
                <th className="pb-3 pr-4">Started</th>
                <th className="pb-3 pr-4">Reason / error</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-slate-500">No trigger runs yet.</td></tr>
              ) : runs.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="py-3 pr-4 font-semibold text-slate-900">{workflowName(row.workflow_id)}</td>
                  <td className="py-3 pr-4 text-slate-700">{leadName(row.lead_id)}</td>
                  <td className="py-3 pr-4"><StatusPill status={row.status} /></td>
                  <td className="py-3 pr-4 text-slate-600">{row.attempt_no}</td>
                  <td className="py-3 pr-4 text-slate-500">{formatTime(row.started_at || row.created_at)}</td>
                  <td className="max-w-[360px] py-3 pr-4 text-xs leading-5 text-slate-500">{row.error_message || row.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {customerMessagesSent === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-900">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
            <div><strong>No audited customer messages have been sent from this workspace.</strong> Provider audit rows may still exist for blocked or dry-run preparation.</div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <div><strong>{customerMessagesSent} provider-audited customer message{customerMessagesSent === 1 ? '' : 's'} sent.</strong> Review the provider audit above before changing rollout gates.</div>
          </div>
        </div>
      )}
    </div>
  );
}
