import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
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
import { getWhatsAppSenderReadiness, type WhatsAppSenderReadiness } from '@/lib/integrations/whatsapp-sender-readiness';
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
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${enabled ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
      {enabled ? on : off}
    </span>
  );
}

function MetricCard({ label, value, note, icon: Icon, tone }: { label: string; value: React.ReactNode; note: string; icon: React.ComponentType<{ size?: number }>; tone: 'violet' | 'amber' | 'sky' | 'emerald' }) {
  const iconClass = tone === 'amber' ? 'bg-amber-50 text-amber-700' : tone === 'sky' ? 'bg-sky-50 text-sky-700' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className={`grid h-10 w-10 place-items-center rounded-xl ${iconClass}`}><Icon size={18} /></div>
      <div className="mt-3 text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-slate-500">{note}</div>
    </div>
  );
}

export default async function AutomationSettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="card-pad text-sm text-slate-600">Sign in to manage automation settings.</div>;

  let organizationName = 'Current organization';
  let canManage = false;
  let workflows: WorkflowRow[] = [];
  let policy: MessagingPolicy = { policy_enabled: false, autonomous_send_enabled: false, requires_human_approval: true, max_messages_24h: 3, max_messages_7d: 8, min_gap_minutes: 30 };
  let provider: ProviderSettings = { provider_send_enabled: false, pilot_mode_enabled: false, pilot_max_messages: 1, pilot_lead_id: null, pilot_require_verified_primary_whatsapp: true, pilot_started_at: null };
  let senderReadiness: WhatsAppSenderReadiness | null = null;
  let approvedTemplates = 0;
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;
    if (organizationId) {
      const admin = createAdminClient();
      const [{ data: manageData, error: manageError }, { data: workflowRows, error: workflowError }, { data: policyRow, error: policyError }, { data: providerRow, error: providerError }, { count: templateCount, error: templateError }, senderResult] = await Promise.all([
        supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
        supabase.from('automation_workflows').select('id,name,status,approval_mode,stop_on_reply,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone,current_published_version,runtime_flow_enabled').eq('organization_id', organizationId).neq('status', 'archived').order('updated_at', { ascending: false }),
        admin.from('automation_messaging_policies').select('policy_enabled,autonomous_send_enabled,requires_human_approval,max_messages_24h,max_messages_7d,min_gap_minutes').eq('organization_id', organizationId).eq('channel', 'whatsapp').maybeSingle(),
        admin.from('automation_provider_send_settings').select('provider_send_enabled,pilot_mode_enabled,pilot_max_messages,pilot_lead_id,pilot_require_verified_primary_whatsapp,pilot_started_at').eq('organization_id', organizationId).eq('channel', 'whatsapp').eq('provider', 'meta_cloud_api').maybeSingle(),
        admin.from('automation_whatsapp_templates').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('approval_status', 'approved').eq('active', true),
        getWhatsAppSenderReadiness(organizationId),
      ]);
      canManage = manageData === true;
      const error = manageError || workflowError || policyError || providerError || templateError;
      if (error) throw error;
      workflows = (workflowRows ?? []) as WorkflowRow[];
      if (policyRow) policy = policyRow as MessagingPolicy;
      if (providerRow) provider = providerRow as ProviderSettings;
      senderReadiness = senderResult;
      approvedTemplates = templateCount ?? 0;
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load automation settings.';
  }

  const activeRuntimeWorkflows = workflows.filter((workflow) => workflow.status === 'active' && workflow.runtime_flow_enabled).length;
  const providerBoundaryClosed = provider.provider_send_enabled !== true;
  const senderConnected = senderReadiness?.connected === true;
  const senderNote = senderConnected
    ? `${senderReadiness?.displayPhoneNumber ?? 'Default sender'} connected${senderReadiness && senderReadiness.unboundActiveAccountCount > 0 ? ` · ${senderReadiness.unboundActiveAccountCount} unbound historical record${senderReadiness.unboundActiveAccountCount === 1 ? '' : 's'} ignored` : ''}`
    : senderReadiness?.issueMessage ?? 'Sender readiness unavailable';

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Automation · System</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Automation Settings</h1>
          <p className="mt-1.5 text-sm text-slate-500">Control runtime eligibility, messaging limits and safety boundaries for {organizationName}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/automation/readiness" className="btn-secondary"><ShieldCheck size={15} /> Launch readiness</Link>
          <Link href="/automation/approvals" className="btn-secondary">Approval queue <ArrowRight size={14} /></Link>
        </div>
      </header>

      {query.notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{query.notice}</div> : null}
      {query.error || loadError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{query.error || loadError}</div> : null}
      {senderReadiness && senderReadiness.unboundActiveAccountCount > 0 ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">WhatsApp readiness ignores {senderReadiness.unboundActiveAccountCount} unbound historical active account record{senderReadiness.unboundActiveAccountCount === 1 ? '' : 's'}. Only the bound connected default sender can satisfy rollout readiness.</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Runtime workflows" value={activeRuntimeWorkflows} note="Active and runtime enabled" icon={Power} tone="violet" />
        <MetricCard label="Messaging policy" value={statusPill(policy.policy_enabled, 'Enabled', 'Blocked')} note="Autonomous send remains locked off" icon={ShieldCheck} tone="amber" />
        <MetricCard label="Provider boundary" value={statusPill(!providerBoundaryClosed, 'Provider ON', 'Provider OFF')} note="Separate final provider gate" icon={LockKeyhole} tone="sky" />
        <MetricCard label="WhatsApp readiness" value={statusPill(senderConnected, 'Sender connected', 'Sender unavailable')} note={`${approvedTemplates} approved template${approvedTemplates === 1 ? '' : 's'} · ${senderNote}`} icon={MessageCircle} tone={senderConnected ? 'emerald' : 'amber'} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><MessageCircle size={18} /></div>
            <div><h2 className="text-base font-bold text-slate-950">WhatsApp messaging policy</h2><p className="mt-0.5 text-xs leading-5 text-slate-500">Control eligibility and frequency. Provider execution remains separate.</p></div>
          </div>

          {canManage ? (
            <form action={updateWhatsAppMessagingPolicyAction} className="mt-5 space-y-4">
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
                <input type="checkbox" name="policy_enabled" defaultChecked={policy.policy_enabled} className="mt-1 h-4 w-4 rounded border-slate-300" />
                <span><span className="block text-sm font-bold text-slate-900">Messaging policy enabled</span><span className="mt-1 block text-xs leading-5 text-slate-500">Human-approved actions may pass this layer when all other safety checks are satisfied.</span></span>
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Max / 24h</span><input type="number" name="max_messages_24h" min="1" max="1000" defaultValue={policy.max_messages_24h} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label>
                <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Max / 7 days</span><input type="number" name="max_messages_7d" min="1" max="5000" defaultValue={policy.max_messages_7d} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label>
                <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Min gap (min)</span><input type="number" name="min_gap_minutes" min="0" max="10080" defaultValue={policy.min_gap_minutes} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs leading-5 text-emerald-800"><strong>Locked safeguards:</strong> autonomous sending is OFF and human approval is required.</div>
              <button type="submit" className="btn-primary"><Settings2 size={14} /> Save messaging policy</button>
            </form>
          ) : <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Organization admin access is required to change policy.</div>}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><LockKeyhole size={18} /></div>
            <div><h2 className="text-base font-bold text-slate-950">Provider execution boundary</h2><p className="mt-0.5 text-xs leading-5 text-slate-500">Final Meta Cloud API execution remains intentionally separate from policy settings.</p></div>
          </div>
          <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3"><span className="text-sm font-semibold text-slate-700">Provider send</span>{statusPill(provider.provider_send_enabled, 'Enabled', 'Disabled')}</div>
            <div className="flex items-center justify-between px-4 py-3"><span className="text-sm font-semibold text-slate-700">Pilot mode</span>{statusPill(provider.pilot_mode_enabled, 'Pilot ON', 'Pilot OFF')}</div>
            <div className="flex items-center justify-between px-4 py-3"><span className="text-sm font-semibold text-slate-700">Pilot message cap</span><span className="text-sm font-bold text-slate-900">{provider.pilot_max_messages}</span></div>
            <div className="flex items-center justify-between px-4 py-3"><span className="text-sm font-semibold text-slate-700">Pilot lead allowlist</span><span className="text-sm font-bold text-slate-900">{provider.pilot_lead_id ? 'Configured' : 'Not configured'}</span></div>
            <div className="flex items-center justify-between px-4 py-3"><span className="text-sm font-semibold text-slate-700">Verified WhatsApp required</span><span className="text-sm font-bold text-slate-900">{provider.pilot_require_verified_primary_whatsapp ? 'Yes' : 'No'}</span></div>
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800"><strong>No accidental go-live:</strong> this page cannot open the provider kill switch.</div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="text-base font-bold text-slate-950">Workflow runtime & safety</h2><p className="mt-0.5 text-xs text-slate-500">Expand a workflow to change runtime, stop-on-reply and quiet hours.</p></div>
          <Link href="/automation/flow-builder" className="text-xs font-bold text-violet-700">Open Flow Builder <ArrowRight size={12} className="inline" /></Link>
        </div>

        {workflows.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-500">No non-archived workflows are available.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {workflows.map((workflow) => {
              const published = workflow.current_published_version !== null;
              const eligible = published && workflow.status === 'active' && workflow.runtime_flow_enabled;
              return (
                <details key={workflow.id} className="group rounded-xl border border-slate-200 bg-white open:bg-slate-50/40">
                  <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Workflow size={16} /></div>
                      <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{workflow.name}</div><div className="mt-0.5 text-[11px] text-slate-500">Published {workflow.current_published_version ?? 'none'} · {workflow.approval_mode.replaceAll('_', ' ')}</div></div>
                    </div>
                    <div className="flex items-center gap-2">
                      {published ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> Published</span> : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700"><AlertTriangle size={11} /> Publish first</span>}
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${eligible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{eligible ? 'Runtime eligible' : 'Not active'}</span>
                      <span className="text-xs text-slate-400 group-open:rotate-90">›</span>
                    </div>
                  </summary>

                  <div className="border-t border-slate-200 p-4">
                    {canManage ? (
                      <div className="grid gap-4 xl:grid-cols-2">
                        <form action={updateWorkflowRuntimeAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                          <input type="hidden" name="workflow_id" value={workflow.id} />
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Power size={15} /> Runtime</div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Status</span><select name="status" defaultValue={workflow.status === 'active' ? 'active' : 'paused'} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="paused">Paused</option><option value="active" disabled={!published}>Active</option></select></label>
                            <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"><input type="checkbox" name="runtime_flow_enabled" defaultChecked={workflow.runtime_flow_enabled} disabled={!published} className="h-4 w-4 rounded border-slate-300" /><span className="text-xs font-semibold text-slate-700">Runtime enabled</span></label>
                          </div>
                          <button type="submit" className="btn-secondary !py-2 text-xs" disabled={!published}>Save runtime</button>
                        </form>

                        <form action={updateWorkflowSafetyAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                          <input type="hidden" name="workflow_id" value={workflow.id} />
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><ShieldCheck size={15} /> Safety</div>
                          <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" name="stop_on_reply" defaultChecked={workflow.stop_on_reply} className="h-4 w-4 rounded border-slate-300" /> Stop after customer reply</label>
                          <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" name="quiet_hours_enabled" defaultChecked={workflow.quiet_hours_enabled} className="h-4 w-4 rounded border-slate-300" /> Enforce quiet hours</label>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Start</span><input type="time" name="quiet_hours_start" defaultValue={timeValue(workflow.quiet_hours_start, '22:00')} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" /></label>
                            <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">End</span><input type="time" name="quiet_hours_end" defaultValue={timeValue(workflow.quiet_hours_end, '08:00')} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" /></label>
                            <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Timezone</span><input name="timezone" defaultValue={workflow.timezone || 'Asia/Kolkata'} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" /></label>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400"><Clock3 size={12} /> Overnight windows are supported.</div>
                          <button type="submit" className="btn-secondary !py-2 text-xs">Save safety</button>
                        </form>
                      </div>
                    ) : <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Organization admin access is required to change workflow settings.</div>}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-violet-700" size={17} /><div><div className="text-sm font-bold text-violet-950">Controlled rollout sequence</div><div className="mt-0.5 text-xs leading-5 text-violet-800">Publish flow → configure safety → enable runtime → enable policy → approve actions → open provider boundary only for a controlled pilot.</div></div></div>
        <Link href="/automation/readiness" className="btn-secondary shrink-0 !py-2 text-xs">View rollout guide <ArrowRight size={12} /></Link>
      </div>
    </div>
  );
}
