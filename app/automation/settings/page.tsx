import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LockKeyhole,
  MessageCircle,
  Power,
  Settings2,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

import {
  updateWhatsAppMessagingPolicyAction,
  updateWorkflowRuntimeAction,
  updateWorkflowSafetyAction,
} from '@/app/automation/settings/actions';
import { PageHeader } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type WorkflowRow = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  approval_mode: string;
  stop_on_reply: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  current_published_version: number | null;
  runtime_flow_enabled: boolean;
};

type MessagingPolicy = {
  policy_enabled: boolean;
  autonomous_send_enabled: boolean;
  requires_human_approval: boolean;
  max_messages_24h: number;
  max_messages_7d: number;
  min_gap_minutes: number;
};

type ProviderSettings = {
  provider_send_enabled: boolean;
  pilot_mode_enabled: boolean;
  pilot_max_messages: number;
  pilot_lead_id: string | null;
  pilot_require_verified_primary_whatsapp: boolean;
  pilot_started_at: string | null;
};

function timeValue(value: string | null, fallback: string) {
  return value ? value.slice(0, 5) : fallback;
}

function statusPill(enabled: boolean, on: string, off: string) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
        enabled
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-slate-100 text-slate-600 ring-slate-200'
      }`}
    >
      {enabled ? on : off}
    </span>
  );
}

export default async function AutomationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="card-pad">
        <p className="text-sm text-slate-600">Sign in to manage Smart Trigger settings.</p>
      </div>
    );
  }

  let organizationId: string | null = null;
  let organizationName = 'Current organization';
  let canManage = false;
  let workflows: WorkflowRow[] = [];
  let policy: MessagingPolicy = {
    policy_enabled: false,
    autonomous_send_enabled: false,
    requires_human_approval: true,
    max_messages_24h: 3,
    max_messages_7d: 8,
    min_gap_minutes: 30,
  };
  let provider: ProviderSettings = {
    provider_send_enabled: false,
    pilot_mode_enabled: false,
    pilot_max_messages: 1,
    pilot_lead_id: null,
    pilot_require_verified_primary_whatsapp: true,
    pilot_started_at: null,
  };
  let approvedTemplates = 0;
  let activeWhatsAppAccounts = 0;
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const admin = createAdminClient();
      const [
        { data: manageData, error: manageError },
        { data: workflowRows, error: workflowError },
        { data: policyRow, error: policyError },
        { data: providerRow, error: providerError },
        { count: templateCount, error: templateError },
        { count: accountCount, error: accountError },
      ] = await Promise.all([
        supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
        supabase
          .from('automation_workflows')
          .select(
            'id,name,status,approval_mode,stop_on_reply,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone,current_published_version,runtime_flow_enabled',
          )
          .eq('organization_id', organizationId)
          .neq('status', 'archived')
          .order('updated_at', { ascending: false }),
        admin
          .from('automation_messaging_policies')
          .select(
            'policy_enabled,autonomous_send_enabled,requires_human_approval,max_messages_24h,max_messages_7d,min_gap_minutes',
          )
          .eq('organization_id', organizationId)
          .eq('channel', 'whatsapp')
          .maybeSingle(),
        admin
          .from('automation_provider_send_settings')
          .select(
            'provider_send_enabled,pilot_mode_enabled,pilot_max_messages,pilot_lead_id,pilot_require_verified_primary_whatsapp,pilot_started_at',
          )
          .eq('organization_id', organizationId)
          .eq('channel', 'whatsapp')
          .eq('provider', 'meta_cloud_api')
          .maybeSingle(),
        admin
          .from('automation_whatsapp_templates')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('approval_status', 'approved')
          .eq('active', true),
        admin
          .from('whatsapp_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('active', true),
      ]);

      canManage = manageData === true;
      const error =
        manageError || workflowError || policyError || providerError || templateError || accountError;
      if (error) throw error;

      workflows = (workflowRows ?? []) as WorkflowRow[];
      if (policyRow) policy = policyRow as MessagingPolicy;
      if (providerRow) provider = providerRow as ProviderSettings;
      approvedTemplates = templateCount ?? 0;
      activeWhatsAppAccounts = accountCount ?? 0;
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load automation settings.';
  }

  const activeRuntimeWorkflows = workflows.filter(
    (workflow) => workflow.status === 'active' && workflow.runtime_flow_enabled,
  ).length;
  const providerBoundaryClosed = provider.provider_send_enabled !== true;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="Smart Trigger settings"
        description={`Control runtime eligibility and WhatsApp safety for ${organizationName}. Provider execution stays behind a separate kill switch so policy changes cannot silently start customer messaging.`}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/automation"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Smart Triggers
        </Link>
        <Link
          href="/automation/flow-builder"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Workflow size={16} />
          Flow Builder
        </Link>
        <Link
          href="/automation/approvals"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ShieldCheck size={16} />
          Approval Queue
        </Link>
      </div>

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

      <section className="grid gap-4 md:grid-cols-4">
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Runtime workflows</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{activeRuntimeWorkflows}</div>
          <div className="mt-1 text-xs text-slate-500">Active + runtime enabled</div>
        </div>
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Messaging policy</div>
          <div className="mt-3">{statusPill(policy.policy_enabled, 'Enabled', 'Blocked')}</div>
          <div className="mt-2 text-xs text-slate-500">Autonomous send remains locked off</div>
        </div>
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Provider boundary</div>
          <div className="mt-3">
            {statusPill(!providerBoundaryClosed, 'Provider ON', 'Provider OFF')}
          </div>
          <div className="mt-2 text-xs text-slate-500">Separate final execution gate</div>
        </div>
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">WhatsApp readiness</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{approvedTemplates}</div>
          <div className="mt-1 text-xs text-slate-500">
            approved template{approvedTemplates === 1 ? '' : 's'} · {activeWhatsAppAccounts} active account{activeWhatsAppAccounts === 1 ? '' : 's'}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="card-pad">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <MessageCircle size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950">WhatsApp messaging policy</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Defines eligibility and frequency. Enabling this policy does not enable autonomous sending or the Meta provider boundary.
              </p>
            </div>
          </div>

          {canManage ? (
            <form action={updateWhatsAppMessagingPolicyAction} className="mt-5 space-y-4">
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
                <input
                  type="checkbox"
                  name="policy_enabled"
                  defaultChecked={policy.policy_enabled}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-900">Messaging policy enabled</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Human-approved WhatsApp actions may pass the policy layer when every other safety check is satisfied.
                  </span>
                </span>
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label>
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Max / 24h</span>
                  <input
                    type="number"
                    name="max_messages_24h"
                    min="1"
                    max="1000"
                    defaultValue={policy.max_messages_24h}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Max / 7 days</span>
                  <input
                    type="number"
                    name="max_messages_7d"
                    min="1"
                    max="5000"
                    defaultValue={policy.max_messages_7d}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Min gap (min)</span>
                  <input
                    type="number"
                    name="min_gap_minutes"
                    min="0"
                    max="10080"
                    defaultValue={policy.min_gap_minutes}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs leading-5 text-emerald-800">
                <strong>Locked safeguards:</strong> autonomous sending is OFF and human approval is required. This form cannot change either control.
              </div>

              <button type="submit" className="btn-primary">
                <Settings2 size={15} />
                Save messaging policy
              </button>
            </form>
          ) : (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Organization admin access is required to change messaging policy.
            </div>
          )}
        </div>

        <div className="card-pad">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
              <LockKeyhole size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950">Provider execution boundary</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Final Meta Cloud API execution remains operator-controlled and intentionally read-only in this settings screen.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">Provider send</span>
              {statusPill(provider.provider_send_enabled, 'Enabled', 'Disabled')}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">Pilot mode</span>
              {statusPill(provider.pilot_mode_enabled, 'Pilot ON', 'Pilot OFF')}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">Pilot message cap</span>
              <span className="text-sm font-bold text-slate-900">{provider.pilot_max_messages}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">Pilot lead allowlist</span>
              <span className="text-sm font-bold text-slate-900">{provider.pilot_lead_id ? 'Configured' : 'Not configured'}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">Verified primary WhatsApp required</span>
              <span className="text-sm font-bold text-slate-900">
                {provider.pilot_require_verified_primary_whatsapp ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
            <strong>No accidental go-live:</strong> this page cannot turn on the provider kill switch. A controlled live rollout remains a separate operator action with explicit verification.
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-950">Workflow runtime & safety</h2>
          <p className="mt-1 text-sm text-slate-500">
            Runtime activation requires an existing published flow. Quiet hours and stop-on-reply are enforced again at send time.
          </p>
        </div>

        {workflows.length === 0 ? (
          <div className="card-pad text-sm text-slate-500">No non-archived workflows are available.</div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {workflows.map((workflow) => {
              const published = workflow.current_published_version !== null;
              return (
                <article key={workflow.id} className="card-pad space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Workflow size={16} className="text-violet-600" />
                        <h3 className="font-bold text-slate-950">{workflow.name}</h3>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Published version: {workflow.current_published_version ?? 'none'} · Approval: {workflow.approval_mode.replaceAll('_', ' ')}
                      </p>
                    </div>
                    {published ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        <CheckCircle2 size={13} /> Ready to activate
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
                        <AlertTriangle size={13} /> Publish first
                      </span>
                    )}
                  </div>

                  {canManage ? (
                    <form action={updateWorkflowRuntimeAction} className="space-y-3 rounded-2xl border border-slate-200 p-4">
                      <input type="hidden" name="workflow_id" value={workflow.id} />
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <Power size={15} /> Runtime
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label>
                          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Status</span>
                          <select
                            name="status"
                            defaultValue={workflow.status === 'active' ? 'active' : 'paused'}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                          >
                            <option value="paused">Paused</option>
                            <option value="active" disabled={!published}>Active</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                          <input
                            type="checkbox"
                            name="runtime_flow_enabled"
                            defaultChecked={workflow.runtime_flow_enabled}
                            disabled={!published}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className="text-sm font-semibold text-slate-700">Runtime flow enabled</span>
                        </label>
                      </div>
                      <button type="submit" className="btn-secondary" disabled={!published}>
                        Save runtime
                      </button>
                    </form>
                  ) : null}

                  {canManage ? (
                    <form action={updateWorkflowSafetyAction} className="space-y-3 rounded-2xl border border-slate-200 p-4">
                      <input type="hidden" name="workflow_id" value={workflow.id} />
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <ShieldCheck size={15} /> Safety
                      </div>

                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          name="stop_on_reply"
                          defaultChecked={workflow.stop_on_reply}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span className="text-sm font-semibold text-slate-700">Stop workflow after customer reply</span>
                      </label>

                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          name="quiet_hours_enabled"
                          defaultChecked={workflow.quiet_hours_enabled}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span className="text-sm font-semibold text-slate-700">Enforce quiet hours</span>
                      </label>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <label>
                          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Start</span>
                          <input
                            type="time"
                            name="quiet_hours_start"
                            defaultValue={timeValue(workflow.quiet_hours_start, '22:00')}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                          />
                        </label>
                        <label>
                          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">End</span>
                          <input
                            type="time"
                            name="quiet_hours_end"
                            defaultValue={timeValue(workflow.quiet_hours_end, '08:00')}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                          />
                        </label>
                        <label>
                          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Timezone</span>
                          <input
                            name="timezone"
                            defaultValue={workflow.timezone || 'Asia/Kolkata'}
                            placeholder="Asia/Kolkata"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                          />
                        </label>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock3 size={13} />
                        Overnight windows such as 22:00 → 08:00 are supported and enforced at the final policy boundary.
                      </div>

                      <button type="submit" className="btn-secondary">
                        Save safety settings
                      </button>
                    </form>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Organization admin access is required to change workflow runtime settings.
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 text-sm leading-6 text-violet-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <div>
            <strong>Controlled rollout sequence:</strong> publish a validated flow → configure stop-on-reply and quiet hours → activate runtime → enable messaging policy → review approval queue → only then open the provider boundary for an explicitly allowlisted pilot.
          </div>
        </div>
      </div>
    </div>
  );
}
