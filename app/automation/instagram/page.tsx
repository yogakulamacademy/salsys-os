import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Instagram,
  MessageCircleMore,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UsersRound,
  XCircle,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';
import {
  addInstagramPilotAllowlistAction,
  approveInstagramAutomationRunAction,
  archiveInstagramQuickReplyAction,
  cancelInstagramAutomationRunAction,
  createInstagramAutomationRuleAction,
  createInstagramQuickReplyAction,
  removeInstagramPilotAllowlistAction,
  resetInstagramPilotAction,
  toggleInstagramAutomationRuleAction,
  unsuppressInstagramUserAction,
  updateInstagramPolicyAction,
} from '@/app/automation/instagram/actions';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ConnectionRow = {
  id: string;
  status: string;
  external_account_id: string | null;
  account_name: string | null;
  scopes: string[] | null;
  token_expires_at: string | null;
  last_verified_at: string | null;
  last_error: string | null;
};

type PolicyRow = {
  automation_enabled: boolean;
  dm_automation_enabled: boolean;
  comment_private_reply_enabled: boolean;
  provider_send_enabled: boolean;
  requires_human_approval: boolean;
  pilot_mode_enabled: boolean;
  pilot_max_messages: number;
  pilot_sent_count: number;
  max_automated_messages_per_user_24h: number;
};

type QuickReplyRow = {
  id: string;
  title: string;
  shortcut: string;
  body: string;
  category: string | null;
  active: boolean;
};

type RuleRow = {
  id: string;
  name: string;
  trigger_type: string;
  match_mode: string;
  keywords: string[] | null;
  response_text: string;
  public_reply_text: string | null;
  active: boolean;
  priority: number;
  requires_human_approval: boolean;
};

type RunRow = {
  id: string;
  rule_id: string;
  trigger_type: string;
  lead_id: string | null;
  instagram_user_id: string | null;
  comment_id: string | null;
  response_text: string;
  status: string;
  human_approved: boolean;
  scheduled_at: string;
  sent_at: string | null;
  block_reasons: unknown;
  provider_error: string | null;
  created_at: string;
};

type AllowlistRow = {
  id: string;
  target_type: string;
  target_value: string;
  label: string | null;
  active: boolean;
};

type PreferenceRow = {
  instagram_user_id: string;
  suppression_reason: string | null;
  suppressed_at: string | null;
};

type ReachabilityRow = {
  reachable_now: boolean;
  window_expires_at: string | null;
};

type PerformanceRow = {
  rule_id: string;
  rule_name: string;
  trigger_type: string;
  run_count: number | string;
  pending_approval_count: number | string;
  sent_count: number | string;
  failed_count: number | string;
  blocked_count: number | string;
};

function bool(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function statusClass(status: string) {
  if (status === 'sent') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (['approved', 'queued', 'running'].includes(status)) {
    return 'bg-sky-50 text-sky-700 ring-sky-200';
  }
  if (status === 'pending_approval') {
    return 'bg-amber-50 text-amber-700 ring-amber-200';
  }
  if (['failed', 'blocked', 'cancelled'].includes(status)) {
    return 'bg-rose-50 text-rose-700 ring-rose-200';
  }
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

function dateLabel(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function reasonsLabel(value: unknown) {
  return Array.isArray(value) && value.length
    ? value.map((item) => String(item)).join(', ')
    : '—';
}

function triggerLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function Checkbox({
  name,
  label,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="h-4 w-4 rounded border-slate-300"
      />
      {label}
    </label>
  );
}

export default async function InstagramOperationsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const notice = typeof params.notice === 'string' ? params.notice : '';
  const errorMessage = typeof params.error === 'string' ? params.error : '';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        Sign in to manage Instagram operations.
      </div>
    );
  }

  const workspace = await getCurrentWorkspaceContext(supabase);
  const organizationId = workspace.activeOrganizationId;

  if (!organizationId) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Select an active workspace before managing Instagram operations.
      </div>
    );
  }

  const { data: canManage } = await supabase.rpc('can_manage_organization', {
    p_organization_id: organizationId,
  });
  const canManageInstagram = canManage === true;
  const admin = createAdminClient();

  const [
    connectionResult,
    policyResult,
    quickReplyResult,
    ruleResult,
    runResult,
    allowlistResult,
    preferenceResult,
    reachabilityResult,
    performanceResult,
    commentCountResult,
  ] = await Promise.all([
    admin
      .from('integration_connections')
      .select('id,status,external_account_id,account_name,scopes,token_expires_at,last_verified_at,last_error')
      .eq('organization_id', organizationId)
      .eq('provider', 'instagram')
      .eq('status', 'connected')
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('instagram_channel_policies')
      .select('automation_enabled,dm_automation_enabled,comment_private_reply_enabled,provider_send_enabled,requires_human_approval,pilot_mode_enabled,pilot_max_messages,pilot_sent_count,max_automated_messages_per_user_24h')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    admin
      .from('instagram_quick_replies')
      .select('id,title,shortcut,body,category,active')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .order('category', { ascending: true, nullsFirst: false })
      .order('title', { ascending: true }),
    admin
      .from('instagram_automation_rules')
      .select('id,name,trigger_type,match_mode,keywords,response_text,public_reply_text,active,priority,requires_human_approval')
      .eq('organization_id', organizationId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true }),
    admin
      .from('instagram_automation_runs')
      .select('id,rule_id,trigger_type,lead_id,instagram_user_id,comment_id,response_text,status,human_approved,scheduled_at,sent_at,block_reasons,provider_error,created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(80),
    admin
      .from('instagram_pilot_allowlist')
      .select('id,target_type,target_value,label,active')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .order('created_at', { ascending: false }),
    admin
      .from('instagram_channel_preferences')
      .select('instagram_user_id,suppression_reason,suppressed_at')
      .eq('organization_id', organizationId)
      .eq('suppressed', true)
      .order('suppressed_at', { ascending: false })
      .limit(50),
    admin
      .from('v_instagram_reachability_v1')
      .select('reachable_now,window_expires_at')
      .eq('organization_id', organizationId),
    admin
      .from('v_instagram_automation_performance_v1')
      .select('rule_id,rule_name,trigger_type,run_count,pending_approval_count,sent_count,failed_count,blocked_count')
      .eq('organization_id', organizationId),
    admin
      .from('instagram_comment_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
  ]);

  const connection = connectionResult.data as ConnectionRow | null;
  const rawPolicy = policyResult.data as PolicyRow | null;
  const policy: PolicyRow = rawPolicy ?? {
    automation_enabled: false,
    dm_automation_enabled: false,
    comment_private_reply_enabled: false,
    provider_send_enabled: false,
    requires_human_approval: true,
    pilot_mode_enabled: true,
    pilot_max_messages: 1,
    pilot_sent_count: 0,
    max_automated_messages_per_user_24h: 3,
  };
  const quickReplies = (quickReplyResult.data ?? []) as QuickReplyRow[];
  const rules = (ruleResult.data ?? []) as RuleRow[];
  const runs = (runResult.data ?? []) as RunRow[];
  const allowlist = (allowlistResult.data ?? []) as AllowlistRow[];
  const suppressed = (preferenceResult.data ?? []) as PreferenceRow[];
  const reachability = (reachabilityResult.data ?? []) as ReachabilityRow[];
  const performance = (performanceResult.data ?? []) as PerformanceRow[];
  const ruleNames = new Map(rules.map((rule) => [rule.id, rule.name]));
  const pendingRuns = runs.filter((run) => run.status === 'pending_approval');
  const reachableNow = reachability.filter((row) => row.reachable_now).length;
  const scopes = Array.isArray(connection?.scopes) ? connection.scopes : [];
  const hasMessageScope = scopes.includes('instagram_business_manage_messages');
  const hasCommentScope = scopes.includes('instagram_business_manage_comments');
  const tokenExpired = Boolean(
    connection?.token_expires_at && Date.parse(connection.token_expires_at) <= Date.now(),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Messaging operations"
        title="Instagram Operations"
        description="Customer-initiated Instagram messaging, comment-to-DM automation, quick replies and guarded workflow execution connected to the Salsys CRM journey."
      />

      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Connected account</p>
              <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-950">
                <Instagram size={20} />
                {connection?.account_name ? `@${connection.account_name}` : 'Instagram not connected'}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {connection
                  ? `Account ${connection.external_account_id ?? '—'} · verified ${dateLabel(connection.last_verified_at)}`
                  : 'Connect an Instagram professional account from Settings → Integrations.'}
              </p>
            </div>
            <Link
              href="/settings/integrations"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {connection ? 'Reconnect / manage' : 'Connect Instagram'}
            </Link>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className={`rounded-xl border p-3 ${hasMessageScope && !tokenExpired ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">DM permission</p>
              <p className="mt-1 text-sm font-semibold">{hasMessageScope && !tokenExpired ? 'Ready' : 'Reconnect required'}</p>
            </div>
            <div className={`rounded-xl border p-3 ${hasCommentScope && !tokenExpired ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">Comment permission</p>
              <p className="mt-1 text-sm font-semibold">{hasCommentScope && !tokenExpired ? 'Ready' : 'Reconnect required'}</p>
            </div>
            <div className={`rounded-xl border p-3 ${policy.provider_send_enabled ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">Provider automation</p>
              <p className="mt-1 text-sm font-semibold">{policy.provider_send_enabled ? 'ON' : 'OFF · fail closed'}</p>
            </div>
          </div>

          {connection?.last_error ? (
            <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{connection.last_error}</p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
          <div className="flex items-center gap-2 font-semibold text-violet-950">
            <ShieldCheck size={18} /> Official API guardrails
          </div>
          <ul className="mt-3 space-y-2 text-sm text-violet-900">
            <li>• Standard DMs require a customer-initiated Instagram conversation.</li>
            <li>• Salsys rechecks the standard 24-hour reply window immediately before every software send.</li>
            <li>• Comment-to-DM is modeled as a one-time private reply within its allowed comment window.</li>
            <li>• Instagram is not treated as a cold/bulk broadcast channel.</li>
          </ul>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Reachable now', reachableNow, Clock3],
          ['Pending approval', pendingRuns.length, UserCheck],
          ['Automation sent', runs.filter((run) => run.status === 'sent').length, MessageCircleMore],
          ['Comment events', commentCountResult.count ?? 0, MessageSquareText],
          ['Suppressed users', suppressed.length, XCircle],
        ].map(([label, value, Icon]) => {
          const MetricIcon = Icon as typeof Clock3;
          return (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <MetricIcon size={15} /> {String(label)}
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-950">{Number(value)}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Automation safety policy</h2>
            <p className="mt-1 text-sm text-slate-600">
              New workspaces remain fail-closed. Turning on a rule never bypasses reply-window, suppression, frequency, pilot or provider checks.
            </p>
          </div>
          <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
            Pilot {policy.pilot_sent_count}/{policy.pilot_max_messages}
          </div>
        </div>

        <form action={updateInstagramPolicyAction} className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <p className="font-semibold text-slate-900">Execution gates</p>
            <Checkbox name="automation_enabled" label="Automation engine enabled" defaultChecked={bool(policy.automation_enabled)} disabled={!canManageInstagram} />
            <Checkbox name="dm_automation_enabled" label="DM automation enabled" defaultChecked={bool(policy.dm_automation_enabled)} disabled={!canManageInstagram} />
            <Checkbox name="comment_private_reply_enabled" label="Comment private replies enabled" defaultChecked={bool(policy.comment_private_reply_enabled)} disabled={!canManageInstagram} />
            <Checkbox name="provider_send_enabled" label="Provider sending enabled" defaultChecked={bool(policy.provider_send_enabled)} disabled={!canManageInstagram} />
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <p className="font-semibold text-slate-900">Human + pilot controls</p>
            <Checkbox name="requires_human_approval" label="Require human approval" defaultChecked={bool(policy.requires_human_approval, true)} disabled={!canManageInstagram} />
            <Checkbox name="pilot_mode_enabled" label="Pilot mode enabled" defaultChecked={bool(policy.pilot_mode_enabled, true)} disabled={!canManageInstagram} />
            <label className="block text-xs font-semibold text-slate-600">
              Pilot max messages
              <input className="input mt-1" name="pilot_max_messages" type="number" min="1" max="20" defaultValue={policy.pilot_max_messages} disabled={!canManageInstagram} />
            </label>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <p className="font-semibold text-slate-900">Frequency</p>
            <label className="block text-xs font-semibold text-slate-600">
              Automated sends / user / 24h
              <input className="input mt-1" name="max_automated_messages_per_user_24h" type="number" min="1" max="20" defaultValue={policy.max_automated_messages_per_user_24h} disabled={!canManageInstagram} />
            </label>
            <button className="btn-primary w-full" type="submit" disabled={!canManageInstagram}>Save Instagram policy</button>
          </div>
        </form>

        <form action={resetInstagramPilotAction} className="mt-3">
          <button className="text-xs font-semibold text-slate-500 hover:text-violet-700" type="submit" disabled={!canManageInstagram}>
            Reset pilot counter and leave provider sending OFF
          </button>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-violet-600" />
            <h2 className="text-lg font-semibold text-slate-950">Automation rules</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">Create keyword/event rules inactive, review them, then enable explicitly.</p>

          <form action={createInstagramAutomationRuleAction} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="input" name="name" placeholder="Rule name" disabled={!canManageInstagram} />
              <select className="input" name="trigger_type" defaultValue="dm_keyword" disabled={!canManageInstagram}>
                <option value="dm_keyword">DM keyword</option>
                <option value="comment_keyword">Comment keyword → private reply</option>
                <option value="story_reply">Story reply</option>
                <option value="story_mention">Story mention</option>
                <option value="postback">Postback</option>
                <option value="referral">Referral</option>
              </select>
              <select className="input" name="match_mode" defaultValue="contains_any" disabled={!canManageInstagram}>
                <option value="contains_any">Contains any keyword</option>
                <option value="exact_any">Exact keyword</option>
                <option value="any">Any event</option>
              </select>
              <input className="input" name="keywords" placeholder="Keywords: fees, dates, price" disabled={!canManageInstagram} />
              <input className="input" name="priority" type="number" min="1" max="10000" defaultValue="100" disabled={!canManageInstagram} />
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm text-slate-700">
                <input type="checkbox" name="requires_human_approval" value="true" defaultChecked disabled={!canManageInstagram} />
                Require human approval
              </label>
            </div>
            <textarea className="input min-h-24" name="response_text" maxLength={1000} placeholder="Private Instagram response" disabled={!canManageInstagram} />
            <input className="input" name="public_reply_text" maxLength={2200} placeholder="Optional public comment reply (stored for future use; private reply is the V1 action)" disabled={!canManageInstagram} />
            <button className="btn-primary" type="submit" disabled={!canManageInstagram}>Create inactive rule</button>
          </form>

          <div className="mt-5 space-y-3">
            {rules.length ? rules.map((rule) => (
              <div key={rule.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{rule.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {triggerLabel(rule.trigger_type)} · {rule.match_mode} · priority {rule.priority}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">{rule.response_text}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Keywords: {rule.keywords?.length ? rule.keywords.join(', ') : 'any'} · approval {rule.requires_human_approval ? 'required' : 'rule allows auto'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${rule.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {rule.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <form action={toggleInstagramAutomationRuleAction} className="mt-3">
                  <input type="hidden" name="rule_id" value={rule.id} />
                  <input type="hidden" name="active" value={rule.active ? 'false' : 'true'} />
                  <button className="text-xs font-semibold text-violet-700 hover:text-violet-900" type="submit" disabled={!canManageInstagram}>
                    {rule.active ? 'Disable rule' : 'Enable reviewed rule'}
                  </button>
                </form>
              </div>
            )) : (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No Instagram automation rules yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Quick replies</h2>
          <p className="mt-1 text-sm text-slate-600">Reusable human replies appear inside the Instagram conversation composer. They never auto-send.</p>
          <form action={createInstagramQuickReplyAction} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="input" name="title" placeholder="Fees reply" disabled={!canManageInstagram} />
              <input className="input" name="shortcut" placeholder="/fees" disabled={!canManageInstagram} />
              <input className="input" name="category" placeholder="Admissions" disabled={!canManageInstagram} />
            </div>
            <textarea className="input min-h-24" name="body" maxLength={1000} placeholder="Reply text" disabled={!canManageInstagram} />
            <button className="btn-primary" type="submit" disabled={!canManageInstagram}>Save quick reply</button>
          </form>

          <div className="mt-5 space-y-3">
            {quickReplies.length ? quickReplies.map((reply) => (
              <div key={reply.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{reply.shortcut} · {reply.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{reply.body}</p>
                    {reply.category ? <p className="mt-1 text-xs text-slate-400">{reply.category}</p> : null}
                  </div>
                  <form action={archiveInstagramQuickReplyAction}>
                    <input type="hidden" name="quick_reply_id" value={reply.id} />
                    <button className="text-xs font-semibold text-slate-400 hover:text-rose-600" type="submit" disabled={!canManageInstagram}>Archive</button>
                  </form>
                </div>
              </div>
            )) : (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No Instagram quick replies yet.</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-center gap-2">
          <UserCheck size={18} className="text-amber-700" />
          <h2 className="text-lg font-semibold text-amber-950">Human approval queue</h2>
        </div>
        <p className="mt-1 text-sm text-amber-800">
          Approval records intent only. The provider runner rechecks the latest reply window and every safety gate immediately before sending.
        </p>

        <div className="mt-4 space-y-3">
          {pendingRuns.length ? pendingRuns.map((run) => (
            <div key={run.id} className="rounded-xl border border-amber-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{ruleNames.get(run.rule_id) ?? 'Instagram automation'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {triggerLabel(run.trigger_type)} · {run.instagram_user_id ? `user ${run.instagram_user_id}` : `comment ${run.comment_id ?? '—'}`}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">{run.response_text}</p>
                </div>
                <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">Pending approval</span>
              </div>
              <div className="mt-3 flex gap-2">
                <form action={approveInstagramAutomationRunAction}>
                  <input type="hidden" name="run_id" value={run.id} />
                  <button className="btn-primary" type="submit" disabled={!canManageInstagram}>Approve</button>
                </form>
                <form action={cancelInstagramAutomationRunAction}>
                  <input type="hidden" name="run_id" value={run.id} />
                  <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" type="submit" disabled={!canManageInstagram}>Cancel</button>
                </form>
              </div>
            </div>
          )) : (
            <p className="rounded-xl bg-white/80 p-4 text-sm text-amber-800">No Instagram automation runs are waiting for approval.</p>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Pilot allowlist</h2>
          <p className="mt-1 text-sm text-slate-600">In pilot mode an automated DM/user or comment must be explicitly allowlisted before the provider gate can pass.</p>
          <form action={addInstagramPilotAllowlistAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <select className="input" name="target_type" defaultValue="instagram_user_id" disabled={!canManageInstagram}>
              <option value="instagram_user_id">Instagram user ID</option>
              <option value="comment_id">Comment ID</option>
            </select>
            <input className="input" name="target_value" placeholder="Scoped user ID or comment ID" disabled={!canManageInstagram} />
            <input className="input" name="label" placeholder="Internal label" disabled={!canManageInstagram} />
            <button className="btn-primary" type="submit" disabled={!canManageInstagram}>Add pilot target</button>
          </form>
          <div className="mt-4 space-y-2">
            {allowlist.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-800">{row.label || row.target_value}</p>
                  <p className="text-xs text-slate-500">{row.target_type} · {row.target_value}</p>
                </div>
                <form action={removeInstagramPilotAllowlistAction}>
                  <input type="hidden" name="allowlist_id" value={row.id} />
                  <button className="text-xs font-semibold text-rose-600" type="submit" disabled={!canManageInstagram}>Remove</button>
                </form>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Suppression / STOP</h2>
          <p className="mt-1 text-sm text-slate-600">Inbound STOP-style requests suppress automated Instagram sends for the scoped user. An admin can clear suppression deliberately.</p>
          <div className="mt-4 space-y-2">
            {suppressed.length ? suppressed.map((row) => (
              <div key={row.instagram_user_id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-800">{row.instagram_user_id}</p>
                  <p className="text-xs text-slate-500">{row.suppression_reason ?? 'suppressed'} · {dateLabel(row.suppressed_at)}</p>
                </div>
                <form action={unsuppressInstagramUserAction}>
                  <input type="hidden" name="instagram_user_id" value={row.instagram_user_id} />
                  <button className="text-xs font-semibold text-violet-700" type="submit" disabled={!canManageInstagram}>Clear</button>
                </form>
              </div>
            )) : (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No Instagram users are currently suppressed.</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Rule performance</h2>
        <p className="mt-1 text-sm text-slate-600">Operational delivery counts only. These are not causal conversion claims.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Rule</th>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Runs</th>
                <th className="px-3 py-2">Pending</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Failed</th>
                <th className="px-3 py-2">Blocked</th>
              </tr>
            </thead>
            <tbody>
              {performance.length ? performance.map((row) => (
                <tr key={row.rule_id} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-semibold text-slate-800">{row.rule_name}</td>
                  <td className="px-3 py-3 text-slate-600">{triggerLabel(row.trigger_type)}</td>
                  <td className="px-3 py-3">{numberValue(row.run_count)}</td>
                  <td className="px-3 py-3">{numberValue(row.pending_approval_count)}</td>
                  <td className="px-3 py-3">{numberValue(row.sent_count)}</td>
                  <td className="px-3 py-3">{numberValue(row.failed_count)}</td>
                  <td className="px-3 py-3">{numberValue(row.blocked_count)}</td>
                </tr>
              )) : (
                <tr><td className="px-3 py-4 text-slate-500" colSpan={7}>No Instagram automation outcomes yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Recent automation runs</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Rule</th>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Policy / error</th>
                <th className="px-3 py-2">Sent</th>
              </tr>
            </thead>
            <tbody>
              {runs.length ? runs.map((run) => (
                <tr key={run.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3 whitespace-nowrap text-slate-500">{dateLabel(run.created_at)}</td>
                  <td className="px-3 py-3 font-semibold text-slate-800">{ruleNames.get(run.rule_id) ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-600">{triggerLabel(run.trigger_type)}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(run.status)}`}>{run.status.replaceAll('_', ' ')}</span>
                  </td>
                  <td className="max-w-sm px-3 py-3 text-xs text-slate-500">{run.provider_error || reasonsLabel(run.block_reasons)}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-500">{dateLabel(run.sent_at)}</td>
                </tr>
              )) : (
                <tr><td className="px-3 py-4 text-slate-500" colSpan={6}>No Instagram automation runs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {!hasCommentScope && connection ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Comment automation needs a fresh Instagram authorization.</p>
              <p className="mt-1">The existing connection predates the comments permission. Reconnect Instagram after this release and grant comment access before enabling comment-to-DM.</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <div className="flex gap-3">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Safe by default</p>
            <p className="mt-1">Creating quick replies, rules, approvals or pilot allowlist entries does not itself send a customer message. Provider execution happens only through the guarded runner after the live policy claim succeeds.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
