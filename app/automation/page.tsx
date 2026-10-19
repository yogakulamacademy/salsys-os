import {
  Archive,
  BellRing,
  Bot,
  CheckCircle2,
  Clock3,
  GitBranch,
  ListChecks,
  Plus,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

import {
  archiveSmartTriggerWorkflowAction,
  createSmartTriggerWorkflowAction,
} from '@/app/automation/actions';
import { PageHeader, StatCard } from '@/components/ui';
import { getSupabasePublicConfig, useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type Workflow = {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused' | 'archived';
  approval_mode: 'human_review' | 'deterministic' | 'auto_low_risk';
  stop_on_reply: boolean;
  max_attempts: number;
  timezone: string;
  created_at: string;
  updated_at: string;
};

type WorkflowTrigger = {
  workflow_id: string;
  trigger_type: string;
  event_name: string | null;
  enabled: boolean;
};

type WorkflowAction = {
  workflow_id: string;
  action_type: string;
  requires_approval: boolean;
  config: Record<string, unknown> | null;
};

function pretty(value: string) {
  return value
    .replaceAll('_', ' ')
    .replaceAll('.', ' · ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: Workflow['status']) {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'draft') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (status === 'paused') return 'bg-sky-50 text-sky-700 ring-sky-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

export default async function AutomationPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const { configured } = getSupabasePublicConfig();
  const live = !useMockData && configured;

  let workflows: Workflow[] = [];
  let triggers: WorkflowTrigger[] = [];
  let actions: WorkflowAction[] = [];
  let runs = 0;
  let awaitingApproval = 0;
  let canManage = false;
  let organizationName = 'Current organization';
  let loadError: string | null = null;

  if (live) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      try {
        const workspace = await getCurrentWorkspaceContext(supabase);
        const organizationId = workspace.activeOrganizationId;
        organizationName = workspace.activeWorkspace?.organizationName || organizationName;

        if (organizationId) {
          const [
            { data: manageData },
            { data: workflowRows, error: workflowError },
            { data: triggerRows, error: triggerError },
            { data: actionRows, error: actionError },
            { count: runCount, error: runError },
            { count: approvalCount, error: approvalError },
          ] = await Promise.all([
            supabase.rpc('can_manage_organization', {
              p_organization_id: organizationId,
            }),
            supabase
              .from('automation_workflows')
              .select(
                'id, name, description, status, approval_mode, stop_on_reply, max_attempts, timezone, created_at, updated_at',
              )
              .eq('organization_id', organizationId)
              .order('updated_at', { ascending: false }),
            supabase
              .from('automation_triggers')
              .select('workflow_id, trigger_type, event_name, enabled')
              .eq('organization_id', organizationId),
            supabase
              .from('automation_actions')
              .select('workflow_id, action_type, requires_approval, config')
              .eq('organization_id', organizationId)
              .eq('enabled', true),
            supabase
              .from('automation_runs')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', organizationId),
            supabase
              .from('automation_action_runs')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', organizationId)
              .eq('status', 'awaiting_approval'),
          ]);

          canManage = manageData === true;

          const error =
            workflowError || triggerError || actionError || runError || approvalError;
          if (error) {
            loadError = error.message;
          } else {
            workflows = (workflowRows ?? []) as Workflow[];
            triggers = (triggerRows ?? []) as WorkflowTrigger[];
            actions = (actionRows ?? []) as WorkflowAction[];
            runs = runCount ?? 0;
            awaitingApproval = approvalCount ?? 0;
          }
        }
      } catch (error) {
        loadError =
          error instanceof Error ? error.message : 'Unable to load Smart Triggers.';
      }
    }
  }

  const active = workflows.filter((workflow) => workflow.status === 'active').length;
  const drafts = workflows.filter((workflow) => workflow.status === 'draft').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="Smart Triggers"
        description={`Build tenant-safe workflows for ${organizationName}. V1 is intentionally human-controlled: workflows are created as drafts and customer messaging is not auto-enabled.`}
      />

      {query.notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {query.notice}
        </div>
      ) : null}

      {query.error || loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {query.error || loadError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard label="Workflows" value={String(workflows.length)} icon={<GitBranch size={18} />} />
        <StatCard label="Active" value={String(active)} icon={<CheckCircle2 size={18} />} note="Runtime eligible" />
        <StatCard label="Drafts" value={String(drafts)} icon={<Clock3 size={18} />} note="Cannot run" />
        <StatCard label="Runs" value={String(runs)} icon={<Zap size={18} />} note="Execution ledger" />
        <StatCard label="Awaiting approval" value={String(awaitingApproval)} icon={<ShieldCheck size={18} />} note="Human gate" />
      </div>

      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 text-sm leading-6 text-violet-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <div>
            <strong>Safe rollout mode:</strong> this workspace can define automation logic, but V1 runtime execution and customer auto-send remain disabled until we validate event matching, deduplication, stop-on-reply, suppressions, and approval behavior.
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <section className="card-pad">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <Plus size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950">Create first Smart Trigger</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Start with a safe deterministic workflow: when a new lead is created, create a follow-up task.
              </p>
            </div>
          </div>

          {canManage ? (
            <form action={createSmartTriggerWorkflowAction} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Workflow name</span>
                <input
                  name="name"
                  required
                  maxLength={180}
                  defaultValue="New lead follow-up"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Description</span>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue="Create a follow-up task when a new lead enters SalsysOS."
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">When</span>
                <select
                  name="event_name"
                  defaultValue="lead.created"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                >
                  <option value="lead.created">New lead created</option>
                  <option value="message.received">Inbound message received</option>
                  <option value="lead.stage_changed">Lead stage changed</option>
                  <option value="payment.pending">Payment pending</option>
                </select>
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <ListChecks size={16} />
                  Then create follow-up
                </div>

                <label className="mt-3 block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Follow-up title</span>
                  <input
                    name="followup_title"
                    required
                    defaultValue="Follow up with new lead"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none"
                  />
                </label>

                <label className="mt-3 block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Delay in minutes</span>
                  <input
                    name="followup_delay_minutes"
                    type="number"
                    min="0"
                    max="10080"
                    defaultValue="0"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                <strong>Draft only:</strong> saving this workflow does not create a task, send a message, or call an AI model. Runtime activation comes after controlled validation.
              </div>

              <button type="submit" className="btn-primary">
                <Sparkles size={15} />
                Save draft workflow
              </button>
            </form>
          ) : (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Organization admin access is required to manage Smart Triggers.
            </div>
          )}
        </section>

        <section className="card-pad">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <Bot size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-950">Workflow library</h2>
                <p className="mt-1 text-sm text-slate-500">Tenant-scoped definitions and safety controls.</p>
              </div>
            </div>
            <div className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
              Smart Trigger V1
            </div>
          </div>

          {workflows.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center">
              <BellRing className="mx-auto text-slate-300" size={28} />
              <div className="mt-3 text-sm font-semibold text-slate-800">No Smart Triggers yet</div>
              <div className="mt-1 text-sm text-slate-500">Create the first draft workflow on the left.</div>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {workflows.map((workflow) => {
                const workflowTriggers = triggers.filter(
                  (trigger) => trigger.workflow_id === workflow.id,
                );
                const workflowActions = actions.filter(
                  (action) => action.workflow_id === workflow.id,
                );

                return (
                  <article key={workflow.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Zap size={15} className="text-violet-500" />
                          <h3 className="font-bold text-slate-900">{workflow.name}</h3>
                          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ring-1 ring-inset ${statusClass(workflow.status)}`}>
                            {pretty(workflow.status)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                            {pretty(workflow.approval_mode)}
                          </span>
                        </div>
                        {workflow.description ? (
                          <p className="mt-2 text-sm leading-6 text-slate-600">{workflow.description}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">When</div>
                        {workflowTriggers.length ? (
                          workflowTriggers.map((trigger, index) => (
                            <div key={`${workflow.id}-trigger-${index}`} className="mt-1 text-sm font-semibold text-slate-800">
                              {trigger.event_name ? pretty(trigger.event_name) : pretty(trigger.trigger_type)}
                            </div>
                          ))
                        ) : (
                          <div className="mt-1 text-sm text-slate-500">No trigger configured</div>
                        )}
                      </div>

                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Then</div>
                        {workflowActions.length ? (
                          workflowActions.map((action, index) => (
                            <div key={`${workflow.id}-action-${index}`} className="mt-1 text-sm font-semibold text-slate-800">
                              {pretty(action.action_type)}
                            </div>
                          ))
                        ) : (
                          <div className="mt-1 text-sm text-slate-500">No action configured</div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-slate-500">
                      <span>Stop on reply: {workflow.stop_on_reply ? 'Yes' : 'No'}</span>
                      <span>·</span>
                      <span>Max attempts: {workflow.max_attempts}</span>
                      <span>·</span>
                      <span>Timezone: {workflow.timezone}</span>
                    </div>

                    {canManage && workflow.status !== 'archived' ? (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                        <form action={archiveSmartTriggerWorkflowAction}>
                          <input type="hidden" name="workflow_id" value={workflow.id} />
                          <button type="submit" className="btn-secondary !px-3 !py-2 text-xs">
                            <Archive size={14} />
                            Archive
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
