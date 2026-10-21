import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  GitBranch,
  ListChecks,
  MessageCircleMore,
  MessageSquareText,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type WorkflowRow = { status: string };
type TemplateRow = { approval_status: string; active: boolean };
type SyncRow = { status: string; started_at: string; provider_error: string | null };

function relativeTime(value: string | null) {
  if (!value) return 'Not synced yet';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: 'violet' | 'amber' | 'emerald' | 'rose';
  href?: string;
}) {
  const tones = {
    violet: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
  };

  const content = (
    <div className="group h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon size={18} />
        </div>
        <div className="flex h-8 items-end gap-1 opacity-50" aria-hidden="true">
          {[2, 5, 3, 7, 4, 8, 6].map((height, index) => (
            <span
              key={index}
              className={`w-1 rounded-full ${tone === 'rose' ? 'bg-rose-300' : tone === 'amber' ? 'bg-amber-300' : tone === 'emerald' ? 'bg-emerald-300' : 'bg-violet-300'}`}
              style={{ height: `${height * 3}px` }}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 text-[28px] font-bold tracking-tight text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
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
  let activeWhatsAppAccounts = 0;
  let latestSync: SyncRow | null = null;
  let loadError: string | null = null;

  if (user) {
    try {
      const workspace = await getCurrentWorkspaceContext(supabase);
      const organizationId = workspace.activeOrganizationId;
      organizationName = workspace.activeWorkspace?.organizationName || organizationName;

      if (organizationId) {
        const [workflowResult, approvalResult, templateResult, syncResult, whatsappResult] =
          await Promise.all([
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
            supabase
              .from('whatsapp_accounts')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', organizationId)
              .eq('active', true),
          ]);

        const error =
          workflowResult.error ||
          approvalResult.error ||
          templateResult.error ||
          syncResult.error ||
          whatsappResult.error;
        if (error) throw error;

        workflows = (workflowResult.data ?? []) as WorkflowRow[];
        templates = (templateResult.data ?? []) as TemplateRow[];
        awaitingApproval = approvalResult.count ?? 0;
        activeWhatsAppAccounts = whatsappResult.count ?? 0;
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
  const providerNeedsAttention = activeWhatsAppAccounts === 0 ? 1 : 0;
  const attentionCount =
    awaitingApproval + pendingTemplates + rejectedTemplates + syncNeedsAttention + providerNeedsAttention;

  const attentionItems = [
    activeWhatsAppAccounts === 0
      ? {
          title: 'WhatsApp sender is not connected',
          detail: 'Connect an active WhatsApp Business sender before customer messaging can run.',
          href: '/settings/integrations',
          label: 'Connect sender',
          tone: 'rose' as const,
        }
      : null,
    awaitingApproval > 0
      ? {
          title: `${awaitingApproval} automation action${awaitingApproval === 1 ? '' : 's'} awaiting approval`,
          detail: 'Human review is required before these customer-impacting actions can continue.',
          href: '/automation/approvals',
          label: 'Review',
          tone: 'amber' as const,
        }
      : null,
    pendingTemplates > 0
      ? {
          title: `${pendingTemplates} WhatsApp template${pendingTemplates === 1 ? '' : 's'} pending review`,
          detail: 'Pending templates are not eligible for outbound automation.',
          href: '/automation/templates',
          label: 'Review',
          tone: 'amber' as const,
        }
      : null,
    rejectedTemplates > 0
      ? {
          title: `${rejectedTemplates} WhatsApp template${rejectedTemplates === 1 ? '' : 's'} rejected`,
          detail: 'Review rejected templates before depending on them in customer flows.',
          href: '/automation/templates',
          label: 'Review',
          tone: 'rose' as const,
        }
      : null,
    latestSync?.status === 'failed'
      ? {
          title: 'Template synchronization failed',
          detail: 'The latest Meta template synchronization did not finish successfully.',
          href: '/automation/templates',
          label: 'View details',
          tone: 'rose' as const,
        }
      : null,
  ].filter(Boolean) as Array<{
    title: string;
    detail: string;
    href: string;
    label: string;
    tone: 'amber' | 'rose';
  }>;

  const workspaceLinks = [
    {
      href: '/automation/flow-builder',
      title: 'Flows',
      value: `${activeFlows} active`,
      copy: 'Build and manage workflows',
      icon: Workflow,
      tone: 'violet',
    },
    {
      href: '/automation/triggers',
      title: 'Smart Triggers',
      value: `${workflows.length} workflows`,
      copy: 'Event-based automation',
      icon: Zap,
      tone: 'sky',
    },
    {
      href: '/automation/whatsapp',
      title: 'WhatsApp Ops',
      value: activeWhatsAppAccounts ? 'Connected' : 'Not connected',
      copy: 'Manage messaging operations',
      icon: MessageCircleMore,
      tone: activeWhatsAppAccounts ? 'emerald' : 'rose',
    },
    {
      href: '/automation/approvals',
      title: 'Approval Queue',
      value: `${awaitingApproval} pending`,
      copy: 'Review human-gated actions',
      icon: ListChecks,
      tone: awaitingApproval ? 'amber' : 'emerald',
    },
    {
      href: '/automation/readiness',
      title: 'Launch Readiness',
      value: attentionCount === 0 ? 'Ready to review' : `${attentionCount} checks`,
      copy: 'Validate before going live',
      icon: ShieldCheck,
      tone: attentionCount === 0 ? 'emerald' : 'violet',
    },
  ] as const;

  const iconTone = (tone: string) => {
    if (tone === 'emerald') return 'bg-emerald-50 text-emerald-700';
    if (tone === 'amber') return 'bg-amber-50 text-amber-700';
    if (tone === 'rose') return 'bg-rose-50 text-rose-700';
    if (tone === 'sky') return 'bg-sky-50 text-sky-700';
    return 'bg-violet-50 text-violet-700';
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Automation</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Automation Overview</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Build, monitor and manage safe customer messaging workflows for {organizationName}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/automation/flow-builder" className="btn-primary">
            <Plus size={15} />
            New flow
          </Link>
          <Link href="/automation/readiness" className="btn-secondary">
            <BookOpen size={15} />
            Automation guide
          </Link>
        </div>
      </header>

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          Automation data is temporarily unavailable. Refresh the page to try again.
        </div>
      ) : (
        <div
          className={`flex flex-col gap-4 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between ${
            attentionCount === 0
              ? 'border-emerald-200 bg-emerald-50/70'
              : 'border-amber-200 bg-amber-50/70'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                attentionCount === 0 ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
              }`}
            >
              {attentionCount === 0 ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">
                {attentionCount === 0 ? 'No detected automation issues' : `${attentionCount} item${attentionCount === 1 ? '' : 's'} need attention`}
              </div>
              <div className="mt-0.5 text-xs leading-5 text-slate-600">
                {attentionCount === 0
                  ? 'Current approvals, templates, sender connection and provider sync do not require action.'
                  : 'Review the items below before increasing automation or customer messaging activity.'}
              </div>
            </div>
          </div>
          <Link href="/automation/readiness" className="btn-secondary shrink-0 !py-2 text-xs">
            View system health <ArrowRight size={14} />
          </Link>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active flows"
          value={activeFlows}
          note={`${draftFlows} draft${draftFlows === 1 ? '' : 's'} in progress`}
          icon={Workflow}
          tone="violet"
          href="/automation/flow-builder"
        />
        <MetricCard
          label="Pending approvals"
          value={awaitingApproval}
          note="Requires human review"
          icon={Clock3}
          tone="amber"
          href="/automation/approvals"
        />
        <MetricCard
          label="Approved templates"
          value={approvedTemplates}
          note="Ready for eligible sends"
          icon={MessageSquareText}
          tone="emerald"
          href="/automation/templates"
        />
        <MetricCard
          label="Needs attention"
          value={attentionCount}
          note="Across safety and messaging"
          icon={ShieldAlert}
          tone="rose"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 text-rose-600">
                <ShieldAlert size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-950">What needs attention</h2>
                <p className="mt-0.5 text-xs text-slate-500">Items that require review or action to keep messaging safe.</p>
              </div>
            </div>
          </div>

          {attentionItems.length ? (
            <div className="mt-4 space-y-2">
              {attentionItems.slice(0, 4).map((item) => (
                <div key={`${item.href}-${item.title}`} className="flex flex-col gap-3 rounded-xl border border-slate-200 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.tone === 'rose' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                      <div className="mt-0.5 text-xs leading-5 text-slate-500">{item.detail}</div>
                    </div>
                  </div>
                  <Link href={item.href} className="btn-secondary shrink-0 !px-3 !py-2 text-xs">
                    {item.label} <ArrowRight size={13} />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-4">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
              <div>
                <div className="text-sm font-semibold text-emerald-900">Nothing requires immediate review</div>
                <div className="mt-1 text-xs leading-5 text-emerald-700">Continue building flows or review launch readiness before enabling more automation.</div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <Zap size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950">Quick actions</h2>
              <p className="mt-0.5 text-xs text-slate-500">Common tasks to keep automation moving.</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {[
              ['/automation/flow-builder', 'Create flow', 'Start a new customer messaging workflow', Workflow],
              ['/automation/triggers', 'Create smart trigger', 'Automate based on customer events', Zap],
              ['/automation/templates', 'Sync templates', 'Sync approved WhatsApp templates from Meta', RefreshCw],
              ['/automation/approvals', 'Review approval queue', 'Check customer-impacting actions', ListChecks],
            ].map(([href, title, copy, Icon]) => {
              const ActionIcon = Icon as React.ComponentType<{ size?: number }>;
              return (
                <Link key={href as string} href={href as string} className="group flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 transition hover:bg-slate-50">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
                    <ActionIcon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900">{title as string}</div>
                    <div className="truncate text-xs text-slate-500">{copy as string}</div>
                  </div>
                  <ArrowRight size={14} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={17} className="text-violet-600" />
          <div>
            <h2 className="text-base font-bold text-slate-950">Jump back into your automation work</h2>
            <p className="text-xs text-slate-500">Quick access to the workspaces you use most.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {workspaceLinks.map(({ href, title, value, copy, icon: Icon, tone }) => (
            <Link key={href} href={href} className="group rounded-2xl border border-slate-200 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className={`grid h-9 w-9 place-items-center rounded-xl ${iconTone(tone)}`}>
                  <Icon size={17} />
                </div>
                <ArrowRight size={14} className="text-slate-300 group-hover:text-violet-500" />
              </div>
              <div className="mt-3 text-sm font-bold text-slate-900">{title}</div>
              <div className={`mt-0.5 text-xs font-semibold ${tone === 'emerald' ? 'text-emerald-600' : tone === 'rose' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-600' : 'text-violet-600'}`}>{value}</div>
              <div className="mt-1 text-[11px] leading-4 text-slate-500">{copy}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Activity size={16} className="text-violet-600" /> Provider sync snapshot</div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
            <span className="text-slate-500">WhatsApp templates</span>
            <span className="font-semibold text-slate-900">{relativeTime(latestSync?.started_at ?? null)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-500">Latest status</span>
            <span className={latestSync?.status === 'failed' ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>{latestSync?.status ? latestSync.status.replaceAll('_', ' ') : 'No sync yet'}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><ShieldCheck size={16} className="text-violet-600" /> Safety posture</div>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs">
            <div className="flex items-center justify-between"><span className="text-slate-500">Human approvals</span><span className="font-semibold text-slate-900">{awaitingApproval ? `${awaitingApproval} pending` : 'Clear'}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-500">Approved templates</span><span className="font-semibold text-slate-900">{approvedTemplates}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-500">Active WhatsApp senders</span><span className="font-semibold text-slate-900">{activeWhatsAppAccounts}</span></div>
          </div>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-violet-950"><GitBranch size={16} /> Recommended next step</div>
          <p className="mt-3 text-xs leading-5 text-violet-800">
            {activeWhatsAppAccounts === 0
              ? 'Connect a WhatsApp Business sender before building customer-message actions.'
              : approvedTemplates === 0
                ? 'Sync at least one approved WhatsApp template before configuring outbound template actions.'
                : workflows.length === 0
                  ? 'Create your first flow, validate it, then review launch readiness before enabling runtime.'
                  : attentionCount > 0
                    ? 'Resolve the current attention items before expanding automated customer messaging.'
                    : 'Review launch readiness and controlled rollout before increasing automation volume.'}
          </p>
          <Link href="/automation/readiness" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-violet-700 hover:text-violet-950">
            Open launch readiness <ArrowRight size={13} />
          </Link>
        </div>
      </section>
    </div>
  );
}
