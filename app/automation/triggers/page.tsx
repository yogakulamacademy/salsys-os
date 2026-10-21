import Link from 'next/link';
import {
  Archive,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  FileText,
  GitBranch,
  Plus,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

import {
  archiveSmartTriggerWorkflowAction,
  createSmartTriggerWorkflowAction,
} from '@/app/automation/actions';
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
  if (status === 'draft') return 'bg-violet-50 text-violet-700 ring-violet-200';
  if (status === 'paused') return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: React.ComponentType<{ size?: number }>;
  tone: 'violet' | 'emerald' | 'amber' | 'sky' | 'rose';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700'
        : tone === 'sky'
          ? 'bg-sky-50 text-sky-700'
          : tone === 'rose'
            ? 'bg-rose-50 text-rose-700'
            : 'bg-violet-50 text-violet-700';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${toneClass}`}>
          <Icon size={18} />
        </div>
        <div className="flex h-8 items-end gap-1 opacity-50" aria-hidden="true">
          {[3, 5, 4, 8, 6, 9, 7].map((height, index) => (
            <span
              key={index}
              className={`w-1 rounded-full ${tone === 'emerald' ? 'bg-emerald-300' : tone === 'amber' ? 'bg-amber-300' : tone === 'sky' ? 'bg-sky-300' : tone === 'rose' ? 'bg-rose-300' : 'bg-violet-300'}`}
              style={{ height: `${height * 2.5}px` }}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 text-[28px] font-bold tracking-tight text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
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

          const error = workflowError || triggerError || actionError || runError || approvalError;
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
        loadError = error instanceof Error ? error.message : 'Unable to load Smart Triggers.';
      }
    }
  }

  const active = workflows.filter((workflow) => workflow.status === 'active').length;
  const drafts = workflows.filter((workflow) => workflow.status === 'draft').length;
  const visibleWorkflows = workflows.filter((workflow) => workflow.status !== 'archived');

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Automation</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Smart Triggers</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Build event-based workflows for {organizationName}. New workflows stay in draft until reviewed and activated.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#create-trigger" className="btn-primary"><Plus size={15} /> New trigger</a>
          <Link href="/automation/recipes" className="btn-secondary"><Sparkles size={15} /> Starter recipes</Link>
        </div>
      </header>

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

      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
            <ShieldCheck size={17} />
          </div>
          <div>
            <div className="text-sm font-bold text-emerald-950">Safe rollout mode</div>
            <div className="mt-0.5 text-xs leading-5 text-emerald-800">
              Smart Triggers are created as drafts. Customer messaging does not start from this screen.
            </div>
          </div>
        </div>
        <Link href="/automation/settings" className="btn-secondary shrink-0 !py-2 text-xs">View safety settings <ArrowRight size={13} /></Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Workflows" value={visibleWorkflows.length} note="Configured workflows" icon={GitBranch} tone="violet" />
        <Metric label="Active" value={active} note="Currently active" icon={CheckCircle2} tone="emerald" />
        <Metric label="Drafts" value={drafts} note="Complete and review" icon={FileText} tone="amber" />
        <Metric label="Runs" value={runs} note="Recorded executions" icon={Zap} tone="sky" />
        <Metric label="Awaiting approval" value={awaitingApproval} note="Requires human review" icon={Clock3} tone="rose" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,.92fr)_minmax(0,1.08fr)]">
        <div id="create-trigger" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Plus size={18} /></div>
              <div>
                <h2 className="text-base font-bold text-slate-950">Create Smart Trigger</h2>
                <p className="mt-0.5 text-xs text-slate-500">Define the event and internal follow-up to create.</p>
              </div>
            </div>
            <Link href="/automation/recipes" className="text-xs font-semibold text-violet-700 hover:text-violet-900">Use a recipe</Link>
          </div>

          {canManage ? (
            <form action={createSmartTriggerWorkflowAction} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">1. Workflow name <span className="text-rose-500">*</span></span>
                <input name="name" required maxLength={180} placeholder="e.g. New lead follow-up" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">2. Description</span>
                <textarea name="description" rows={3} placeholder="Explain what this workflow does and when it should run..." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">3. Event trigger <span className="text-rose-500">*</span></span>
                <select name="event_name" defaultValue="lead.created" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
                  <option value="lead.created">New lead created</option>
                  <option value="message.received">Inbound message received</option>
                  <option value="lead.stage_changed">Lead stage changed</option>
                  <option value="payment.pending">Payment pending</option>
                </select>
                <span className="mt-1 block text-[11px] text-slate-400">This event starts the workflow.</span>
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-xs font-bold text-slate-700">4. Follow-up action <span className="text-rose-500">*</span></div>
                <div className="mt-1 text-[11px] text-slate-400">This creates an internal CRM follow-up. Customer messages can be added later in Flow Builder.</div>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[11px] font-semibold text-slate-500">Follow-up title</span>
                  <input name="followup_title" required defaultValue="Follow up with new lead" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                </label>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[11px] font-semibold text-slate-500">Delay</span>
                  <select name="followup_delay_minutes" defaultValue="0" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
                    <option value="0">Immediately</option>
                    <option value="10">After 10 minutes</option>
                    <option value="30">After 30 minutes</option>
                    <option value="60">After 1 hour</option>
                    <option value="1440">After 1 day</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="text-[11px] leading-4 text-slate-400">Saved as draft. Review in Flow Builder before activation.</div>
                <button type="submit" className="btn-primary shrink-0"><FileText size={14} /> Save draft</button>
              </div>
            </form>
          ) : (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Organization admin access is required to manage Smart Triggers.</div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-950">Workflow library</h2>
              <p className="mt-0.5 text-xs text-slate-500">Manage your Smart Trigger workflows and open their visual flow.</p>
            </div>
            <Link href="/automation/flow-builder" className="btn-secondary !py-2 text-xs">Open Flow Builder <ArrowRight size={13} /></Link>
          </div>

          {visibleWorkflows.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
              <BellRing className="mx-auto text-slate-300" size={28} />
              <div className="mt-3 text-sm font-semibold text-slate-800">No Smart Triggers yet</div>
              <div className="mt-1 text-xs text-slate-500">Create your first draft using the form on the left.</div>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {visibleWorkflows.map((workflow) => {
                const workflowTriggers = triggers.filter((trigger) => trigger.workflow_id === workflow.id);
                const workflowActions = actions.filter((action) => action.workflow_id === workflow.id);
                const triggerLabel = workflowTriggers[0]?.event_name
                  ? pretty(workflowTriggers[0].event_name as string)
                  : workflowTriggers[0]
                    ? pretty(workflowTriggers[0].trigger_type)
                    : 'No trigger configured';
                const actionLabel = workflowActions[0]
                  ? pretty(workflowActions[0].action_type)
                  : 'No action configured';

                return (
                  <article key={workflow.id} className="group rounded-xl border border-slate-200 bg-white px-3.5 py-3 transition hover:border-violet-200 hover:bg-slate-50/50">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Zap size={17} /></div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-bold text-slate-900">{workflow.name}</h3>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${statusClass(workflow.status)}`}>{pretty(workflow.status)}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500">
                            <span>{triggerLabel}</span><span>→</span><span>{actionLabel}</span>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">Updated {relativeTime(workflow.updated_at)}</div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Link href={`/automation/flow-builder?workflow=${workflow.id}`} className="btn-secondary !px-3 !py-2 text-xs">{workflow.status === 'draft' ? 'Edit' : 'View'}</Link>
                        {canManage ? (
                          <form action={archiveSmartTriggerWorkflowAction}>
                            <input type="hidden" name="workflow_id" value={workflow.id} />
                            <button type="submit" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:text-rose-600" title="Archive workflow"><Archive size={14} /></button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 p-4 text-center">
            <Sparkles className="mx-auto text-violet-600" size={18} />
            <div className="mt-2 text-sm font-bold text-violet-950">Need inspiration?</div>
            <div className="mt-1 text-xs text-violet-700">Start from a reusable workflow pattern and customize it for {organizationName}.</div>
            <Link href="/automation/recipes" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-violet-700 hover:text-violet-950">Browse starter recipes <ArrowRight size={13} /></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
