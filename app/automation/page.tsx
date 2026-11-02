import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Clock3,
  GitBranch,
  Instagram,
  MessageCircleMore,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Workflow,
  Zap,
} from 'lucide-react';

import { getWhatsAppSenderReadiness, type WhatsAppSenderReadiness } from '@/lib/integrations/whatsapp-sender-readiness';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type WorkflowRow = { status: string };
type TemplateRow = { approval_status: string; active: boolean };
type SyncRow = { status: string; started_at: string; provider_error: string | null };
type RunRow = { id: string; status: string; created_at: string };

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
}: {
  label: string;
  value: string | number;
  note: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-[#e4eae6] bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-[#6d7c76]">
        <span>{label}</span>
        <Icon size={16} className="text-[#91a496]" />
      </div>
      <div className="mt-2 text-[29px] font-semibold leading-none tracking-[-1px] text-[#192e29]">{value}</div>
      <div className="mt-2 text-[10px] leading-4 text-[#8a988f]">{note}</div>
    </div>
  );
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
  let senderReadiness: WhatsAppSenderReadiness | null = null;
  let latestSync: SyncRow | null = null;
  let runs: RunRow[] = [];
  let loadError: string | null = null;

  if (user) {
    try {
      const workspace = await getCurrentWorkspaceContext(supabase);
      const organizationId = workspace.activeOrganizationId;
      organizationName = workspace.activeWorkspace?.organizationName || organizationName;

      if (organizationId) {
        const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
        since.setHours(0, 0, 0, 0);

        const [workflowResult, approvalResult, templateResult, syncResult, senderResult, runResult] =
          await Promise.all([
            supabase
              .from('automation_workflows')
              .select('status')
              .eq('organization_id', organizationId),
            supabase
              .from('automation_approval_requests')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', organizationId)
              .eq('status', 'pending'),
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
            getWhatsAppSenderReadiness(organizationId),
            supabase
              .from('automation_action_runs')
              .select('id,status,created_at')
              .eq('organization_id', organizationId)
              .gte('created_at', since.toISOString())
              .order('created_at', { ascending: true }),
          ]);

        const error =
          workflowResult.error ||
          approvalResult.error ||
          templateResult.error ||
          syncResult.error ||
          runResult.error;
        if (error) throw error;

        workflows = (workflowResult.data ?? []) as WorkflowRow[];
        templates = (templateResult.data ?? []) as TemplateRow[];
        awaitingApproval = approvalResult.count ?? 0;
        senderReadiness = senderResult;
        latestSync = (syncResult.data ?? null) as SyncRow | null;
        runs = (runResult.data ?? []) as RunRow[];
      }
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Unable to load automation overview.';
    }
  }

  const dataAvailable = loadError == null;
  const senderConnected = senderReadiness?.connected === true;
  const activeFlows = workflows.filter((row) => row.status === 'active').length;
  const activeTemplates = templates.filter((row) => row.active);
  const approvedTemplates = activeTemplates.filter((row) => row.approval_status === 'approved').length;
  const pendingTemplates = activeTemplates.filter((row) => row.approval_status === 'pending').length;
  const rejectedTemplates = activeTemplates.filter((row) => row.approval_status === 'rejected').length;
  const syncNeedsAttention = dataAvailable && latestSync?.status === 'failed' ? 1 : 0;
  const providerNeedsAttention = dataAvailable && !senderConnected ? 1 : 0;
  const attentionCount = dataAvailable
    ? awaitingApproval + pendingTemplates + rejectedTemplates + syncNeedsAttention + providerNeedsAttention
    : null;

  const launchChecks = [
    {
      label: 'Create your first flow',
      hint: workflows.length ? `${workflows.length} workflow${workflows.length === 1 ? '' : 's'} available` : 'Design the conversation',
      ok: workflows.length > 0,
      href: '/automation/flow-builder',
    },
    {
      label: 'Connect a WhatsApp sender',
      hint: senderConnected
        ? `${senderReadiness?.displayPhoneNumber ?? 'Default sender'} bound and connected`
        : senderReadiness?.issueMessage ?? 'No connected default sender verified',
      ok: senderConnected,
      href: '/settings/integrations',
    },
    {
      label: 'Sync an approved template',
      hint: approvedTemplates ? `${approvedTemplates} approved template${approvedTemplates === 1 ? '' : 's'}` : 'No approved template available',
      ok: approvedTemplates > 0,
      href: '/automation/templates',
    },
    {
      label: 'Prepare an active workflow',
      hint: activeFlows ? `${activeFlows} active workflow${activeFlows === 1 ? '' : 's'}` : 'Keep the first flow in draft until reviewed',
      ok: activeFlows > 0,
      href: '/automation/flow-builder',
    },
    {
      label: 'Review current attention items',
      hint: attentionCount == null
        ? 'Status unavailable'
        : attentionCount === 0
          ? 'No detected blockers in this overview'
          : `${attentionCount} item${attentionCount === 1 ? '' : 's'} need review`,
      ok: attentionCount === 0,
      href: '/automation/readiness',
    },
  ];
  const passedLaunchChecks = dataAvailable ? launchChecks.filter((item) => item.ok).length : null;

  const dayBuckets = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    const count = runs.filter((run) => {
      const value = new Date(run.created_at).getTime();
      return value >= date.getTime() && value < next.getTime();
    }).length;
    return {
      label: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
      count,
    };
  });
  const maxRuns = Math.max(1, ...dayBuckets.map((day) => day.count));

  const recipes = [
    {
      title: 'Qualify an inbound lead',
      copy: 'Capture intent, create the next action and keep a human checkpoint in the journey.',
      icon: GitBranch,
      meta: 'Sales · WhatsApp',
    },
    {
      title: 'Turn comments into conversations',
      copy: 'Start from an Instagram engagement event and route the right response safely.',
      icon: Instagram,
      meta: 'Engagement · Instagram',
    },
    {
      title: 'Follow up at the right moment',
      copy: 'Use a controlled delay and an approved next step instead of manual reminders.',
      icon: Clock3,
      meta: 'Retention · WhatsApp',
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#89978f]">Automation Studio</div>
          <h1 className="mt-1 text-[29px] font-semibold leading-tight text-[#192e29]">Automation Overview</h1>
          <p className="mt-1.5 text-[12px] text-[#6d7c76]">Your command center for thoughtful, reliable automation at {organizationName}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/automation/readiness" className="btn-secondary">View readiness</Link>
          <Link href="/automation/flow-builder" className="btn-primary"><Plus size={14} /> Create automation</Link>
        </div>
      </header>

      {loadError ? (
        <div className="rounded-lg border border-[#efd9d5] bg-[#fcf0ef] px-4 py-3 text-[11px] font-medium text-[#ae4545]">
          Automation data is temporarily unavailable. Metrics and readiness states are hidden until the data can be verified.
        </div>
      ) : null}
      {senderReadiness && senderReadiness.unboundActiveAccountCount > 0 ? (
        <div className="rounded-lg border border-[#ecdcae] bg-[#fff9e8] px-4 py-3 text-[11px] leading-5 text-[#8a641d]">
          {senderReadiness.unboundActiveAccountCount} unbound historical active WhatsApp account record{senderReadiness.unboundActiveAccountCount === 1 ? '' : 's'} are excluded from launch readiness. Only the connected default sender counts.
        </div>
      ) : null}

      <section className="grid min-h-[220px] overflow-hidden rounded-[13px] bg-[#163f35] text-white lg:grid-cols-[1.2fr_1fr]">
        <div className="relative z-10 p-7 lg:p-8">
          <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#a8c7b3]">Purposeful automation. Human control.</div>
          <h2 className="mt-3 text-[27px] font-medium leading-[1.25] tracking-[-0.7px] !text-white">A little less busywork.<br />A lot more possibility.</h2>
          <p className="mt-3 max-w-md text-[11px] leading-5 text-[#bed3c6]">Build conversations that move your business forward. Start with a flow and keep your team in control.</p>
          <Link href="/automation/flow-builder" className="mt-5 inline-flex items-center gap-2 rounded-[7px] border border-[#dff2c5] bg-[#dff2c5] px-4 py-2.5 text-[11px] font-semibold text-[#254834] transition hover:bg-white">
            <Plus size={14} /> Build your first flow
          </Link>
        </div>
        <div className="relative hidden min-h-[210px] items-center justify-center gap-5 bg-[radial-gradient(#90b39a29_1px,transparent_1px)] [background-size:17px_17px] lg:flex">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-[#769d8055]" />
          {[
            ['Conversation', 'A new connection', MessageCircleMore],
            ['Smart action', 'The right next step', Zap],
            ['Human review', 'You have the last word', ShieldCheck],
          ].map(([title, copy, Icon], index) => {
            const NodeIcon = Icon as React.ComponentType<{ size?: number }>;
            return (
              <div key={title as string} className={`relative z-10 min-w-[105px] rounded-[9px] border border-[#66867670] bg-white/[0.06] px-3 py-3 text-[#d5e7db] backdrop-blur-sm ${index === 1 ? '-translate-y-5' : ''}`}>
                <div className="mb-3 inline-grid h-8 w-8 place-items-center rounded-[7px] bg-[#335a48] text-[#cee4b4]"><NodeIcon size={16} /></div>
                <strong className="block text-[10px] font-semibold">{title as string}</strong>
                <span className="mt-0.5 block text-[8px] text-[#91b09c]">{copy as string}</span>
              </div>
            );
          })}
          <div className="absolute bottom-4 right-5 flex items-center gap-1 text-[8px] text-[#93b29e]"><ShieldCheck size={10} /> Safe by design</div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active automations"
          value={dataAvailable ? activeFlows : '—'}
          note={dataAvailable ? 'Live workflow status from this workspace' : 'Status unavailable until data reloads'}
          icon={Workflow}
        />
        <MetricCard
          label="Executions"
          value={dataAvailable ? runs.length : '—'}
          note={dataAvailable ? 'Recorded automation actions in the last 7 days' : 'Execution history unavailable'}
          icon={Zap}
        />
        <MetricCard label="Delivery success rate" value="—" note="No valid provider-delivery denominator on this overview" icon={MessageSquareText} />
        <MetricCard
          label="Awaiting approval"
          value={dataAvailable ? awaitingApproval : '—'}
          note={dataAvailable ? 'Pending requests in the human approval queue' : 'Approval queue unavailable'}
          icon={ShieldCheck}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <div className="rounded-xl border border-[#e4eae6] bg-white">
          <div className="flex items-center justify-between border-b border-[#e4eae6] px-5 py-4">
            <div>
              <h2 className="text-[16px] font-semibold">Execution activity</h2>
              <p className="mt-1 text-[11px] text-[#6d7c76]">Observed action runs from the last 7 days.</p>
            </div>
            <span className="rounded-md border border-[#e4eae6] px-2 py-1 text-[9px] text-[#6d7c76]">Last 7 days</span>
          </div>
          <div className="p-5">
            {!dataAvailable ? (
              <div className="grid h-[215px] place-items-center rounded-lg border border-dashed border-[#dce6e1] bg-[#f8faf8] px-6 text-center">
                <div>
                  <div className="text-[12px] font-semibold text-[#6d7c76]">Execution data unavailable</div>
                  <p className="mt-1 text-[10px] text-[#98a29b]">No zero-value assumption is shown while the source data cannot be verified.</p>
                </div>
              </div>
            ) : runs.length ? (
              <div>
                <div className="flex h-[190px] items-end gap-3 border-b border-[#e4eae6] px-2 pb-0">
                  {dayBuckets.map((day) => (
                    <div key={day.label} className="flex h-full flex-1 items-end justify-center">
                      <div className="w-full max-w-10 rounded-t bg-[#82af91]" style={{ height: `${Math.max(6, Math.round((day.count / maxRuns) * 100))}%` }} title={`${day.count} runs`} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-7 text-center text-[9px] text-[#98a29b]">
                  {dayBuckets.map((day) => <span key={day.label}>{day.label}</span>)}
                </div>
              </div>
            ) : (
              <div className="grid h-[215px] place-items-center rounded-lg bg-[#f8faf8] text-center">
                <div>
                  <div className="text-[12px] font-semibold text-[#6d7c76]">No execution data yet</div>
                  <p className="mt-1 text-[10px] text-[#98a29b]">Recorded automation activity will appear here when it exists.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[#e4eae6] bg-white">
          <div className="flex items-center justify-between border-b border-[#e4eae6] px-5 py-4">
            <div>
              <h2 className="text-[16px] font-semibold">Your path to launch</h2>
              <p className="mt-1 text-[11px] text-[#6d7c76]">A few checks for a confident first run.</p>
            </div>
            <span className="rounded-md border border-[#e4eae6] px-2 py-1 text-[9px] text-[#6d7c76]">{passedLaunchChecks == null ? 'Unavailable' : `${passedLaunchChecks} / 5`}</span>
          </div>
          {dataAvailable ? (
            <>
              <div className="px-5 pt-4">
                <div className="h-[5px] overflow-hidden rounded-full bg-[#edf1ed]"><div className="h-full rounded-full bg-[#69a87e]" style={{ width: `${(passedLaunchChecks ?? 0) * 20}%` }} /></div>
              </div>
              <div className="px-5 pb-3 pt-2">
                {launchChecks.map((item, index) => (
                  <Link key={item.label} href={item.href} className="flex items-center gap-3 border-b border-[#edf1ed] py-3 last:border-0">
                    <span className={`grid h-[23px] w-[23px] shrink-0 place-items-center rounded-full border text-[9px] ${item.ok ? 'border-[#b8d3bf] bg-[#f0f7f3] text-[#216551]' : 'border-[#dce5de] text-[#9aaa9e]'}`}>{item.ok ? <Check size={12} /> : index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-[#192e29]">{item.label}</div>
                      <div className="mt-0.5 truncate text-[9px] text-[#98a399]">{item.hint}</div>
                    </div>
                    <ArrowRight size={13} className="text-[#91a096]" />
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <div className="grid min-h-[210px] place-items-center px-6 text-center">
              <div>
                <ShieldCheck size={24} className="mx-auto text-[#91a496]" />
                <div className="mt-3 text-[12px] font-semibold text-[#6d7c76]">Readiness cannot be verified</div>
                <p className="mt-1 max-w-sm text-[10px] leading-5 text-[#98a29b]">Launch checks are hidden until automation, provider and approval data can be loaded safely.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-[14px] font-semibold">A head start for your next flow</h2>
          <Link href="/automation/recipes" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#216551]">Explore all recipes <ArrowRight size={13} /></Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {recipes.map(({ title, copy, icon: Icon, meta }, index) => (
            <article key={title} className="flex min-h-[200px] flex-col rounded-xl border border-[#e4eae6] bg-white p-5 transition hover:border-[#a1c3ad] hover:shadow-[0_8px_30px_#142b2310]">
              <div className={`grid h-[34px] w-[34px] place-items-center rounded-[9px] ${index === 1 ? 'bg-[#edf2fa] text-[#7b94ba]' : index === 2 ? 'bg-[#f2eff8] text-[#9480ae]' : 'bg-[#ecf5ed] text-[#5d836a]'}`}><Icon size={17} /></div>
              <span className="mt-4 w-fit rounded-md border border-[#e4eae6] px-2 py-1 text-[9px] text-[#69796f]">{meta.split(' · ')[1]}</span>
              <h3 className="mt-3 text-[13px] font-semibold">{title}</h3>
              <p className="mt-1.5 flex-1 text-[11px] leading-5 text-[#6d7c76]">{copy}</p>
              <div className="mt-4 flex items-center justify-between border-t border-[#e4eae6] pt-3">
                <span className="text-[9px] text-[#93a096]">{meta.split(' · ')[0]}</span>
                <Link href="/automation/recipes" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#216551]">Use recipe <ArrowRight size={12} /></Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <div className="rounded-xl border border-[#e4eae6] bg-white">
          <div className="flex items-center justify-between border-b border-[#e4eae6] px-5 py-4">
            <h2 className="text-[16px] font-semibold">Your channels</h2>
            <Link href="/settings/integrations" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#216551]">Manage providers <ArrowRight size={12} /></Link>
          </div>
          <div className="flex items-center gap-3 border-b border-[#e4eae6] px-5 py-4">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#ecf5ed] text-[#216551]"><MessageCircleMore size={16} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold">WhatsApp</div>
              <div className="mt-0.5 text-[9px] text-[#6d7c76]">
                {!dataAvailable
                  ? 'Connection status unavailable'
                  : senderConnected
                    ? `${senderReadiness?.displayPhoneNumber ?? 'Default sender'} connected${senderReadiness && senderReadiness.unboundActiveAccountCount > 0 ? ` · ${senderReadiness.unboundActiveAccountCount} unbound record${senderReadiness.unboundActiveAccountCount === 1 ? '' : 's'} ignored` : ''}`
                    : senderReadiness?.issueMessage ?? 'No connected default sender verified'}
              </div>
            </div>
            <span className={`rounded-md px-2 py-1 text-[9px] font-semibold ${!dataAvailable ? 'bg-[#f0f3f1] text-[#69796f]' : senderConnected ? 'bg-[#eaf5ed] text-[#397052]' : 'bg-[#fcf4e5] text-[#9b6720]'}`}>
              {!dataAvailable ? 'Unavailable' : senderConnected ? 'Connected' : 'Not connected'}
            </span>
            <Link href="/automation/whatsapp" aria-label="Open WhatsApp operations"><ArrowRight size={13} className="text-[#91a096]" /></Link>
          </div>
          <div className="flex items-center gap-3 px-5 py-4">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f2eff8] text-[#9480ae]"><Instagram size={16} /></span>
            <div className="min-w-0 flex-1"><div className="text-[11px] font-semibold">Instagram</div><div className="mt-0.5 text-[9px] text-[#6d7c76]">Review connection and event eligibility in the channel workspace</div></div>
            <span className="rounded-md bg-[#f0f3f1] px-2 py-1 text-[9px] font-semibold text-[#69796f]">Review setup</span>
            <Link href="/automation/instagram" aria-label="Open Instagram operations"><ArrowRight size={13} className="text-[#91a096]" /></Link>
          </div>
        </div>

        <aside className="flex gap-3 rounded-xl border border-[#deeadb] bg-[#f1f6ef] p-5">
          <ShieldCheck size={22} className="mt-0.5 shrink-0 text-[#6f9575]" />
          <div>
            <h3 className="text-[12px] font-semibold">Automation with a safety net</h3>
            <p className="mt-1.5 text-[10px] leading-5 text-[#81917f]">Provider checks, consent rules and human approval protect customer-facing workflows. Unknown readiness should stop execution rather than guess.</p>
            <Link href="/automation/settings" className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#216551]">Review your guardrails <ArrowRight size={12} /></Link>
          </div>
        </aside>
      </section>

      <div className="flex flex-col justify-between gap-2 border-t border-[#e4eae6] pt-4 text-[9px] text-[#9aa69e] sm:flex-row">
        <span>
          {dataAvailable
            ? `Latest template sync: ${relativeTime(latestSync?.started_at ?? null)}${latestSync?.status ? ` · ${latestSync.status.replaceAll('_', ' ')}` : ''}`
            : 'Latest template sync: unavailable'}
        </span>
        <span>
          {attentionCount == null
            ? 'Overview attention status unavailable'
            : attentionCount
              ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} currently need review`
              : 'No detected overview blockers'}
        </span>
      </div>
    </div>
  );
}
