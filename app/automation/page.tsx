import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  GitBranch,
  ListChecks,
  MessageSquareText,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type WorkflowRow = { status: string };
type TemplateRow = { approval_status: string; active: boolean };
type SyncRow = { status: string; started_at: string; provider_error: string | null };

function relativeSync(value: string | null) {
  if (!value) return 'Not synced yet';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function AutomationOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let organizationName = 'Current organization';
  let workflows: WorkflowRow[] = [];
  let templates: TemplateRow[] = [];
  let awaitingApproval = 0;
  let latestSync: SyncRow | null = null;
  let loadError: string | null = null;

  if (user) {
    try {
      const workspace = await getCurrentWorkspaceContext(supabase);
      const organizationId = workspace.activeOrganizationId;
      organizationName = workspace.activeWorkspace?.organizationName || organizationName;

      if (organizationId) {
        const [workflowResult, approvalResult, templateResult, syncResult] = await Promise.all([
          supabase
            .from('automation_workflows')
            .select('status')
            .eq('organization_id', organizationId),
          supabase
            .from('automation_action_runs')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .eq('status', 'awaiting_approval'),
          supabase
            .from('automation_whatsapp_templates')
            .select('approval_status,active')
            .eq('organization_id', organizationId),
          supabase
            .from('automation_whatsapp_template_sync_runs')
            .select('status,started_at,provider_error')
            .eq('organization_id', organizationId)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        const error = workflowResult.error || approvalResult.error || templateResult.error || syncResult.error;
        if (error) throw error;

        workflows = (workflowResult.data ?? []) as WorkflowRow[];
        templates = (templateResult.data ?? []) as TemplateRow[];
        awaitingApproval = approvalResult.count ?? 0;
        latestSync = (syncResult.data ?? null) as SyncRow | null;
      }
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Unable to load automation overview.';
    }
  }

  const activeFlows = workflows.filter((row) => row.status === 'active').length;
  const draftFlows = workflows.filter((row) => row.status === 'draft').length;
  const activeTemplates = templates.filter((row) => row.active);
  const approvedTemplates = activeTemplates.filter((row) => row.approval_status === 'approved').length;
  const pendingTemplates = activeTemplates.filter((row) => row.approval_status === 'pending').length;
  const rejectedTemplates = activeTemplates.filter((row) => row.approval_status === 'rejected').length;
  const syncNeedsAttention = latestSync?.status === 'failed' ? 1 : 0;
  const attentionCount = awaitingApproval + pendingTemplates + rejectedTemplates + syncNeedsAttention;

  const attentionItems = [
    awaitingApproval > 0
      ? {
          title: `${awaitingApproval} automation action${awaitingApproval === 1 ? '' : 's'} awaiting approval`,
          detail: 'Review customer-impacting actions before they can continue.',
          href: '/automation/approvals',
          label: 'Review approvals',
          tone: 'amber',
        }
      : null,
    pendingTemplates > 0
      ? {
          title: `${pendingTemplates} WhatsApp template${pendingTemplates === 1 ? '' : 's'} pending Meta review`,
          detail: 'Pending templates cannot be used for outbound automation yet.',
          href: '/automation/templates',
          label: 'View templates',
          tone: 'amber',
        }
      : null,
    rejectedTemplates > 0
      ? {
          title: `${rejectedTemplates} WhatsApp template${rejectedTemplates === 1 ? '' : 's'} rejected`,
          detail: 'Review the rejected template before depending on it in a flow.',
          href: '/automation/templates',
          label: 'Review templates',
          tone: 'rose',
        }
      : null,
    latestSync?.status === 'failed'
      ? {
          title: 'WhatsApp template sync needs attention',
          detail: 'The latest provider sync did not complete successfully.',
          href: '/automation/templates',
          label: 'View sync details',
          tone: 'rose',
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    detail: string;
    href: string;
    label: string;
    tone: 'amber' | 'rose';
  }>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="Automation"
        description={`Build, monitor and manage customer messaging workflows for ${organizationName}.`}
      />

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          Automation data is temporarily unavailable. Refresh the page to try again.
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/automation/flow-builder" className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Active flows</span>
            <Workflow size={17} className="text-violet-500" />
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-950">{activeFlows}</div>
          <div className="mt-1 text-xs text-slate-500">{draftFlows} draft{draftFlows === 1 ? '' : 's'}</div>
        </Link>

        <Link href="/automation/approvals" className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Pending approvals</span>
            <ListChecks size={17} className="text-violet-500" />
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-950">{awaitingApproval}</div>
          <div className="mt-1 text-xs text-slate-500">Human review queue</div>
        </Link>

        <Link href="/automation/templates" className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Approved templates</span>
            <MessageSquareText size={17} className="text-violet-500" />
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-950">{approvedTemplates}</div>
          <div className="mt-1 text-xs text-slate-500">Ready for eligible sends</div>
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Needs attention</span>
            <ShieldAlert size={17} className={attentionCount ? 'text-amber-500' : 'text-emerald-500'} />
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-950">{attentionCount}</div>
          <div className="mt-1 text-xs text-slate-500">Across approvals, templates and provider sync</div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Priority</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">What needs attention</h2>
            </div>
            <Sparkles size={19} className="text-violet-500" />
          </div>

          {attentionItems.length ? (
            <div className="mt-4 divide-y divide-slate-100">
              {attentionItems.map((item) => (
                <div key={`${item.href}-${item.title}`} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex gap-3">
                    <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.tone === 'rose' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900">{item.title}</div>
                      <div className="mt-1 text-sm text-slate-500">{item.detail}</div>
                      <Link href={item.href} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-900">
                        {item.label} <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-4 text-emerald-900">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">No urgent automation issues</div>
                <div className="mt-1 text-sm text-emerald-800">Approvals, template review and the latest provider sync do not currently require action.</div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Quick actions</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <Link href="/automation/flow-builder" className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">
              <span className="flex items-center gap-2"><Plus size={15} /> Create flow</span><ArrowRight size={14} className="text-slate-400" />
            </Link>
            <Link href="/automation/triggers" className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">
              <span className="flex items-center gap-2"><Zap size={15} /> Create trigger</span><ArrowRight size={14} className="text-slate-400" />
            </Link>
            <Link href="/automation/templates" className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">
              <span className="flex items-center gap-2"><RefreshCw size={15} /> Sync templates</span><ArrowRight size={14} className="text-slate-400" />
            </Link>
            <Link href="/automation/approvals" className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">
              <span className="flex items-center gap-2"><ListChecks size={15} /> Review approvals</span><ArrowRight size={14} className="text-slate-400" />
            </Link>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Activity size={15} className="text-slate-500" /> Provider sync
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">Latest template sync</span>
              <span className="font-semibold text-slate-800">{relativeSync(latestSync?.started_at ?? null)}</span>
            </div>
            {latestSync?.status ? (
              <div className="mt-1 text-xs text-slate-500">Status: {latestSync.status.replaceAll('_', ' ')}</div>
            ) : null}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Workspaces</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Jump back into your automation work</h2>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            { href: '/automation/flow-builder', title: 'Flows', copy: 'Build and manage customer automation journeys.', icon: Workflow },
            { href: '/automation/templates', title: 'WhatsApp Templates', copy: 'Manage approved templates and Meta sync.', icon: MessageSquareText },
            { href: '/automation/runs', title: 'Execution Monitor', copy: 'Inspect recent runs, failures and runtime evidence.', icon: Activity },
            { href: '/automation/approvals', title: 'Approval Queue', copy: 'Review actions that require a human decision.', icon: ListChecks },
            { href: '/automation/triggers', title: 'Smart Triggers', copy: 'Define event-driven rules and deterministic actions.', icon: GitBranch },
            { href: '/automation/recipes', title: 'Starter Recipes', copy: 'Start from reusable automation patterns.', icon: Sparkles },
          ].map(({ href, title, copy, icon: Icon }) => (
            <Link key={href} href={href} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-700"><Icon size={17} /></div>
                <ArrowRight size={15} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
              </div>
              <div className="mt-4 font-bold text-slate-900">{title}</div>
              <div className="mt-1 text-sm leading-5 text-slate-500">{copy}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
