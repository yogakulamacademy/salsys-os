import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Smartphone,
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
  if (state === 'ready') {
    return {
      icon: CheckCircle2,
      label: 'Ready',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    };
  }
  if (state === 'safe') {
    return {
      icon: LockKeyhole,
      label: 'Safe',
      className: 'bg-sky-50 text-sky-700 ring-sky-200',
    };
  }
  if (state === 'next') {
    return {
      icon: CircleDashed,
      label: 'Next',
      className: 'bg-amber-50 text-amber-700 ring-amber-200',
    };
  }
  return {
    icon: AlertTriangle,
    label: 'Blocked',
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
  };
}

function ChecklistItem({ item, index }: { item: ReadinessItem; index: number }) {
  const badge = stateBadge(item.state);
  const BadgeIcon = badge.icon;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-black text-slate-600">
          {index + 1}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-950">{item.label}</h3>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${badge.className}`}>
              <BadgeIcon size={12} />
              {badge.label}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
        </div>
      </div>
      {item.href && item.action ? (
        <Link
          href={item.href}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          {item.action}
          <ExternalLink size={12} />
        </Link>
      ) : null}
    </div>
  );
}

export default async function AutomationReadinessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="card-pad">
        <p className="text-sm text-slate-600">Sign in to review automation rollout readiness.</p>
      </div>
    );
  }

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
      const [accountResult, templateResult, workflowResult, policyResult, providerResult, suppressionResult] =
        await Promise.all([
          admin
            .from('whatsapp_accounts')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .eq('active', true)
            .eq('is_default', true),
          admin
            .from('automation_whatsapp_templates')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .eq('active', true)
            .eq('approval_status', 'approved'),
          admin
            .from('automation_workflows')
            .select('id,name,status,current_published_version,runtime_flow_enabled,stop_on_reply,quiet_hours_enabled')
            .eq('organization_id', organizationId)
            .neq('status', 'archived')
            .order('updated_at', { ascending: false }),
          admin
            .from('automation_messaging_policies')
            .select('policy_enabled,autonomous_send_enabled,requires_human_approval,max_messages_24h,max_messages_7d,min_gap_minutes')
            .eq('organization_id', organizationId)
            .eq('channel', 'whatsapp')
            .maybeSingle(),
          admin
            .from('automation_provider_send_settings')
            .select('provider_send_enabled,pilot_mode_enabled,pilot_max_messages,pilot_lead_id,pilot_started_at,pilot_require_verified_primary_whatsapp')
            .eq('organization_id', organizationId)
            .eq('channel', 'whatsapp')
            .eq('provider', 'meta_cloud_api')
            .maybeSingle(),
          admin
            .from('automation_suppressions')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .eq('channel', 'whatsapp')
            .eq('active', true),
        ]);

      const error =
        accountResult.error ||
        templateResult.error ||
        workflowResult.error ||
        policyResult.error ||
        providerResult.error ||
        suppressionResult.error;
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
  const runtimeWorkflows = publishedWorkflows.filter(
    (row) => row.status === 'active' && row.runtime_flow_enabled,
  );
  const safePolicyDefaults =
    policy?.autonomous_send_enabled === false && policy?.requires_human_approval === true;
  const providerClosed = provider?.provider_send_enabled !== true;
  const pilotConfigured =
    provider?.pilot_mode_enabled === true &&
    Boolean(provider.pilot_lead_id) &&
    provider.pilot_max_messages === 1 &&
    provider.pilot_require_verified_primary_whatsapp === true;

  const setupItems: ReadinessItem[] = [
    {
      label: 'WhatsApp connection',
      description: defaultAccount
        ? 'An active default WhatsApp sender is available for this workspace.'
        : 'Connect WhatsApp Business and select an active default sender before building customer-message actions.',
      state: defaultAccount ? 'ready' : 'next',
      href: '/settings/integrations',
      action: defaultAccount ? 'Review connection' : 'Connect WhatsApp',
    },
    {
      label: 'Approved WhatsApp template',
      description:
        approvedTemplateCount > 0
          ? `${approvedTemplateCount} active provider-approved template${approvedTemplateCount === 1 ? ' is' : 's are'} synchronized.`
          : 'No active provider-approved template is synchronized yet. Sync from Meta before binding a template action.',
      state: approvedTemplateCount > 0 ? 'ready' : defaultAccount ? 'next' : 'blocked',
      href: '/automation/templates',
      action: approvedTemplateCount > 0 ? 'Review templates' : 'Sync templates',
    },
    {
      label: 'Workflow foundation',
      description:
        workflows.length > 0
          ? `${workflows.length} non-archived workflow${workflows.length === 1 ? ' exists' : 's exist'} in this workspace.`
          : 'Create the workflow as a draft first. Draft workflows cannot send customer messages.',
      state: workflows.length > 0 ? 'ready' : 'next',
      href: '/automation',
      action: workflows.length > 0 ? 'Review workflows' : 'Create draft',
    },
    {
      label: 'Published flow version',
      description:
        publishedWorkflows.length > 0
          ? `${publishedWorkflows.length} workflow${publishedWorkflows.length === 1 ? ' has' : 's have'} a published version.`
          : 'Validate and publish the flow before runtime execution can be enabled.',
      state: publishedWorkflows.length > 0 ? 'ready' : workflows.length > 0 ? 'next' : 'blocked',
      href: '/automation/flow-builder',
      action: 'Open Flow Builder',
    },
    {
      label: 'Human-approval safety defaults',
      description: safePolicyDefaults
        ? 'Autonomous customer sending is disabled and human approval is required.'
        : 'Safety defaults are not in the required fail-closed state. Restore human approval and disable autonomous sending before rollout.',
      state: safePolicyDefaults ? 'ready' : 'blocked',
      href: '/automation/settings',
      action: 'Review safety',
    },
  ];

  const controlledRolloutItems: ReadinessItem[] = [
    {
      label: 'Workflow runtime',
      description:
        runtimeWorkflows.length > 0
          ? `${runtimeWorkflows.length} published workflow${runtimeWorkflows.length === 1 ? ' is' : 's are'} active at the runtime layer.`
          : 'Keep runtime disabled while configuration is incomplete. Enable it only after the flow and safety settings are reviewed.',
      state: runtimeWorkflows.length > 0 ? 'ready' : publishedWorkflows.length > 0 ? 'next' : 'blocked',
      href: '/automation/settings',
      action: 'Runtime settings',
    },
    {
      label: 'Messaging policy',
      description:
        policy?.policy_enabled === true
          ? `Policy is enabled with caps of ${policy.max_messages_24h}/24h, ${policy.max_messages_7d}/7d and a ${policy.min_gap_minutes}-minute minimum gap.`
          : 'Policy is currently disabled, so WhatsApp automation sends remain blocked at the policy boundary. This is the correct state until a controlled rollout is approved.',
      state: policy?.policy_enabled === true ? 'ready' : 'safe',
      href: '/automation/settings',
      action: 'Policy settings',
    },
    {
      label: 'Pilot allowlist',
      description: pilotConfigured
        ? 'Pilot mode has one allowlisted lead, a one-message cap, and requires a verified primary WhatsApp contact.'
        : 'No fully configured single-lead pilot is active. Keep it this way until the exact pilot recipient is explicitly selected.',
      state: pilotConfigured ? 'ready' : 'safe',
    },
    {
      label: 'Provider kill switch',
      description: providerClosed
        ? 'Meta provider execution is OFF. No automation can cross the final provider boundary.'
        : 'Provider execution is ON. Confirm this is an intentional, time-bounded controlled rollout.',
      state: providerClosed ? 'safe' : 'ready',
      href: '/automation/settings',
      action: 'Review boundary',
    },
  ];

  const foundationReady =
    defaultAccount && approvedTemplateCount > 0 && publishedWorkflows.length > 0 && safePolicyDefaults;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="Rollout readiness"
        description={`A fail-closed launch checklist for ${organizationName}. Setup readiness and live-provider readiness are deliberately separated so configuration work cannot silently start customer messaging.`}
      />

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {loadError}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="card-pad">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            <Smartphone size={14} /> Sender
          </div>
          <div className="mt-3 text-lg font-bold text-slate-950">{defaultAccount ? 'Ready' : 'Missing'}</div>
        </div>
        <div className="card-pad">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            <MessageSquareText size={14} /> Approved templates
          </div>
          <div className="mt-3 text-lg font-bold text-slate-950">{approvedTemplateCount}</div>
        </div>
        <div className="card-pad">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            <Workflow size={14} /> Published workflows
          </div>
          <div className="mt-3 text-lg font-bold text-slate-950">{publishedWorkflows.length}</div>
        </div>
        <div className="card-pad">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            <ShieldCheck size={14} /> Foundation
          </div>
          <div className={`mt-3 text-lg font-bold ${foundationReady ? 'text-emerald-700' : 'text-amber-700'}`}>
            {foundationReady ? 'Ready' : 'In progress'}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">Setup foundation</h2>
            <p className="mt-1 text-sm text-slate-500">Complete these steps before considering a live pilot.</p>
          </div>
          {setupItems.map((item, index) => (
            <ChecklistItem key={item.label} item={item} index={index} />
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">Controlled rollout gates</h2>
            <p className="mt-1 text-sm text-slate-500">OFF can be the correct state here. These gates are opened only when an explicit pilot is approved.</p>
          </div>
          {controlledRolloutItems.map((item, index) => (
            <ChecklistItem key={item.label} item={item} index={index} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Active suppressions</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{activeSuppressions}</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Suppression remains authoritative even after approval and is rechecked before provider execution.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Runtime workflows</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{runtimeWorkflows.length}</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Active published flows with runtime execution enabled.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Provider boundary</div>
          <div className={`mt-2 text-lg font-bold ${providerClosed ? 'text-sky-700' : 'text-amber-700'}`}>
            {providerClosed ? 'Closed — safe' : 'Open'}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Final Meta execution gate, independent from workflow activation and messaging policy.</p>
        </div>
      </section>

      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
        <strong>Recommended launch order:</strong> connect sender → sync approved template → create draft workflow → validate and publish → configure stop-on-reply/quiet hours → enable runtime → enable messaging policy → select one verified pilot lead → explicitly open provider execution for the pilot → immediately close the provider boundary after proof.
      </div>
    </div>
  );
}
