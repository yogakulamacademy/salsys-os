import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Smartphone,
  Workflow,
} from 'lucide-react';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type WorkflowRow = {
  id: string;
  name: string;
  status: string;
  current_published_version: number | null;
  runtime_flow_enabled: boolean;
  stop_on_reply: boolean;
  quiet_hours_enabled: boolean;
};

type PolicyRow = {
  policy_enabled: boolean;
  autonomous_send_enabled: boolean;
  requires_human_approval: boolean;
  max_messages_24h: number;
  max_messages_7d: number;
  min_gap_minutes: number;
};

type ProviderRow = {
  provider_send_enabled: boolean;
  pilot_mode_enabled: boolean;
  pilot_max_messages: number;
  pilot_lead_id: string | null;
  pilot_started_at: string | null;
  pilot_require_verified_primary_whatsapp: boolean;
};

type ReadinessItem = {
  label: string;
  description: string;
  state: 'ready' | 'next' | 'blocked' | 'safe';
  href?: string;
  action?: string;
};

function stateBadge(state: ReadinessItem['state']) {
  if (state === 'ready') return { icon: CheckCircle2, label: 'Ready', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
  if (state === 'safe') return { icon: LockKeyhole, label: 'Safe', className: 'bg-sky-50 text-sky-700 ring-sky-200' };
  if (state === 'next') return { icon: CircleDashed, label: 'Next', className: 'bg-amber-50 text-amber-700 ring-amber-200' };
  return { icon: AlertTriangle, label: 'Blocked', className: 'bg-rose-50 text-rose-700 ring-rose-200' };
}

function ChecklistItem({ item, index }: { item: ReadinessItem; index: number }) {
  const badge = stateBadge(item.state);
  const BadgeIcon = badge.icon;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-black text-slate-600">{index + 1}</div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-950">{item.label}</h3>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${badge.className}`}><BadgeIcon size={11} />{badge.label}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
        </div>
      </div>
      {item.href && item.action ? (
        <Link href={item.href} className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
          {item.action}<ExternalLink size={11} />
        </Link>
      ) : null}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, note, tone }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string | number; note: string; tone: 'violet' | 'emerald' | 'amber' | 'sky' }) {
  const color = tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : tone === 'sky' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}><Icon size={18} /></div>
      <div className="mt-3 text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 text-xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-slate-500">{note}</div>
    </div>
  );
}

export default async function AutomationReadinessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="card-pad text-sm text-slate-600">Sign in to review automation rollout readiness.</div>;

  let organizationName = 'Current organization';
  let defaultAccount = false;
  let approvedTemplateCount = 0;
  let workflows: WorkflowRow[] = [];
  let policy: PolicyRow | null = null;
  let provider: ProviderRow | null = null;
  let activeSuppressions = 0;
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;
    if (organizationId) {
      const admin = createAdminClient();
      const [accountResult, templateResult, workflowResult, policyResult, providerResult, suppressionResult] = await Promise.all([
        admin.from('whatsapp_accounts').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('active', true).eq('is_default', true),
        admin.from('automation_whatsapp_templates').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('active', true).eq('approval_status', 'approved'),
        admin.from('automation_workflows').select('id,name,status,current_published_version,runtime_flow_enabled,stop_on_reply,quiet_hours_enabled').eq('organization_id', organizationId).neq('status', 'archived').order('updated_at', { ascending: false }),
        admin.from('automation_messaging_policies').select('policy_enabled,autonomous_send_enabled,requires_human_approval,max_messages_24h,max_messages_7d,min_gap_minutes').eq('organization_id', organizationId).eq('channel', 'whatsapp').maybeSingle(),
        admin.from('automation_provider_send_settings').select('provider_send_enabled,pilot_mode_enabled,pilot_max_messages,pilot_lead_id,pilot_started_at,pilot_require_verified_primary_whatsapp').eq('organization_id', organizationId).eq('channel', 'whatsapp').eq('provider', 'meta_cloud_api').maybeSingle(),
        admin.from('automation_suppressions').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('channel', 'whatsapp').eq('active', true),
      ]);
      const error = accountResult.error || templateResult.error || workflowResult.error || policyResult.error || providerResult.error || suppressionResult.error;
      if (error) throw error;
      defaultAccount = (accountResult.count ?? 0) > 0;
      approvedTemplateCount = templateResult.count ?? 0;
      workflows = (workflowResult.data ?? []) as WorkflowRow[];
      policy = (policyResult.data ?? null) as PolicyRow | null;
      provider = (providerResult.data ?? null) as ProviderRow | null;
      activeSuppressions = suppressionResult.count ?? 0;
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to calculate rollout readiness.';
  }

  const publishedWorkflows = workflows.filter((row) => row.current_published_version !== null);
  const runtimeWorkflows = publishedWorkflows.filter((row) => row.status === 'active' && row.runtime_flow_enabled);
  const safePolicyDefaults = policy?.autonomous_send_enabled === false && policy?.requires_human_approval === true;
  const providerClosed = provider?.provider_send_enabled !== true;
  const pilotConfigured = provider?.pilot_mode_enabled === true && Boolean(provider.pilot_lead_id) && provider.pilot_max_messages === 1 && provider.pilot_require_verified_primary_whatsapp === true;

  const setupItems: ReadinessItem[] = [
    { label: 'WhatsApp connection', description: defaultAccount ? 'An active default WhatsApp sender is connected.' : 'Connect WhatsApp Business and select an active default sender.', state: defaultAccount ? 'ready' : 'next', href: '/settings/integrations', action: defaultAccount ? 'Review connection' : 'Connect WhatsApp' },
    { label: 'Approved WhatsApp template', description: approvedTemplateCount > 0 ? `${approvedTemplateCount} active provider-approved template${approvedTemplateCount === 1 ? '' : 's'} available.` : 'Sync at least one provider-approved template before template-based customer sends.', state: approvedTemplateCount > 0 ? 'ready' : defaultAccount ? 'next' : 'blocked', href: '/automation/templates', action: approvedTemplateCount > 0 ? 'Review templates' : 'Sync templates' },
    { label: 'Workflow foundation', description: workflows.length > 0 ? `${workflows.length} non-archived workflow${workflows.length === 1 ? '' : 's'} configured.` : 'Create the workflow as a draft first.', state: workflows.length > 0 ? 'ready' : 'next', href: '/automation/triggers', action: workflows.length > 0 ? 'Review workflows' : 'Create draft' },
    { label: 'Published flow version', description: publishedWorkflows.length > 0 ? `${publishedWorkflows.length} workflow${publishedWorkflows.length === 1 ? ' has' : 's have'} a published version.` : 'Validate and publish a flow before runtime can be enabled.', state: publishedWorkflows.length > 0 ? 'ready' : workflows.length > 0 ? 'next' : 'blocked', href: '/automation/flow-builder', action: 'Open Flow Builder' },
    { label: 'Human-approval safety defaults', description: safePolicyDefaults ? 'Autonomous customer sending is disabled and human approval is required.' : 'Restore human approval and disable autonomous sending before rollout.', state: safePolicyDefaults ? 'ready' : 'blocked', href: '/automation/settings', action: 'Review safety' },
  ];

  const controlledRolloutItems: ReadinessItem[] = [
    { label: 'Workflow runtime', description: runtimeWorkflows.length > 0 ? `${runtimeWorkflows.length} published workflow${runtimeWorkflows.length === 1 ? ' is' : 's are'} active at runtime.` : 'Keep runtime disabled until the flow and safety settings are reviewed.', state: runtimeWorkflows.length > 0 ? 'ready' : publishedWorkflows.length > 0 ? 'next' : 'blocked', href: '/automation/settings', action: 'Runtime settings' },
    { label: 'Messaging policy', description: policy?.policy_enabled === true ? `Enabled with ${policy.max_messages_24h}/24h, ${policy.max_messages_7d}/7d and ${policy.min_gap_minutes} min gap.` : 'Policy is disabled, so automation sends remain blocked at this gate.', state: policy?.policy_enabled === true ? 'ready' : 'safe', href: '/automation/settings', action: 'Policy settings' },
    { label: 'Pilot allowlist', description: pilotConfigured ? 'One verified pilot lead is configured with a one-message cap.' : 'No fully configured single-lead pilot is active.', state: pilotConfigured ? 'ready' : 'safe', href: '/automation/pilot', action: 'Manage pilot' },
    { label: 'Provider kill switch', description: providerClosed ? 'Meta provider execution is OFF. Nothing can cross the final provider boundary.' : 'Provider execution is ON. Confirm this is an intentional controlled rollout.', state: providerClosed ? 'safe' : 'ready', href: '/automation/settings', action: 'Review boundary' },
  ];

  const readyFoundationCount = setupItems.filter((item) => item.state === 'ready').length;
  const foundationReady = readyFoundationCount === setupItems.length;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Automation · Governance</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Launch Readiness</h1>
          <p className="mt-1.5 text-sm text-slate-500">Complete the launch checklist before enabling customer messaging for {organizationName}.</p>
        </div>
        <Link href="/automation/settings" className="btn-secondary"><ShieldCheck size={15} /> Safety settings</Link>
      </header>

      {loadError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">Readiness data is temporarily unavailable.</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Smartphone} label="Sender" value={defaultAccount ? 'Connected' : 'Not connected'} note={defaultAccount ? 'Default WhatsApp sender available' : 'Connect WhatsApp Business'} tone={defaultAccount ? 'emerald' : 'violet'} />
        <SummaryCard icon={MessageSquareText} label="Approved templates" value={approvedTemplateCount} note="Available for eligible sends" tone="emerald" />
        <SummaryCard icon={Workflow} label="Published workflows" value={publishedWorkflows.length} note="Validated and published" tone="violet" />
        <SummaryCard icon={ShieldCheck} label="Foundation" value={`${readyFoundationCount} / ${setupItems.length}`} note={foundationReady ? 'Setup foundation complete' : 'Setup steps remaining'} tone={foundationReady ? 'emerald' : 'amber'} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Workflow size={18} /></div>
            <div><h2 className="text-base font-bold text-slate-950">Setup foundation</h2><p className="mt-0.5 text-xs text-slate-500">Complete these steps before considering a live pilot.</p></div>
          </div>
          <div className="mt-4 space-y-2">{setupItems.map((item, index) => <ChecklistItem key={item.label} item={item} index={index} />)}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><ShieldCheck size={18} /></div>
            <div><h2 className="text-base font-bold text-slate-950">Controlled rollout gates</h2><p className="mt-0.5 text-xs text-slate-500">OFF can be the safe state until an explicit pilot is approved.</p></div>
          </div>
          <div className="mt-4 space-y-2">{controlledRolloutItems.map((item, index) => <ChecklistItem key={item.label} item={item} index={index} />)}</div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Link href="/automation/pilot" className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Active suppressions</div><div className="mt-2 text-2xl font-bold text-slate-950">{activeSuppressions}</div><p className="mt-1 text-xs leading-5 text-slate-500">Suppression remains authoritative even after approval.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-violet-700">View controls <ArrowRight size={12} /></span>
        </Link>
        <Link href="/automation/runs" className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Runtime workflows</div><div className="mt-2 text-2xl font-bold text-slate-950">{runtimeWorkflows.length}</div><p className="mt-1 text-xs leading-5 text-slate-500">Published flows currently eligible to execute.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-violet-700">Execution monitor <ArrowRight size={12} /></span>
        </Link>
        <Link href="/automation/audits" className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Provider boundary</div><div className={`mt-2 text-lg font-bold ${providerClosed ? 'text-sky-700' : 'text-amber-700'}`}>{providerClosed ? 'Closed — safe' : 'Open'}</div><p className="mt-1 text-xs leading-5 text-slate-500">Final provider execution gate, separate from workflow activation.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-violet-700">Provider health <ArrowRight size={12} /></span>
        </Link>
      </section>

      <div className="rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3.5 text-xs leading-5 text-violet-900">
        <strong>Recommended launch order:</strong> connect sender → sync approved template → create draft flow → validate and publish → review safety → enable runtime → enable messaging policy → configure one verified pilot → open provider execution only for the controlled test.
      </div>
    </div>
  );
}
