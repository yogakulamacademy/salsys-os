import {
  AlertTriangle,
  CheckCircle2,
  LockKeyhole,
  MessageSquareText,
  Power,
  RotateCcw,
  ShieldCheck,
  Target,
  UserCheck,
} from 'lucide-react';

import {
  closeWhatsAppProviderGateAction,
  prepareWhatsAppPilotAction,
  resetWhatsAppPilotAction,
} from '@/app/automation/pilot/actions';
import { PageHeader } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type ProviderSettings = {
  provider_send_enabled: boolean;
  pilot_mode_enabled: boolean;
  pilot_lead_id: string | null;
  pilot_started_at: string | null;
  pilot_max_messages: number;
  pilot_require_verified_primary_whatsapp: boolean;
};

type MessagingPolicy = {
  policy_enabled: boolean;
  autonomous_send_enabled: boolean;
  requires_human_approval: boolean;
};

type ContactRow = {
  lead_id: string;
  normalized_value: string | null;
};

type LeadRow = {
  id: string;
  lead_code: string | null;
};

type AuditRow = {
  id: string;
  status: string;
  request_mode: string;
  customer_message_sent: boolean;
  provider_delivery_status: string | null;
  prepared_at: string;
  sent_at: string | null;
};

function maskWhatsApp(value: string | null) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return 'Verified WhatsApp';
  return `••••${digits.slice(-4)}`;
}

function formatTime(value: string | null) {
  if (!value) return 'Not started';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return `${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

function pill(enabled: boolean, on: string, off: string, danger = false) {
  const className = enabled
    ? danger
      ? 'bg-rose-50 text-rose-700 ring-rose-200'
      : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : 'bg-slate-100 text-slate-600 ring-slate-200';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${className}`}>
      {enabled ? on : off}
    </span>
  );
}

function ChecklistRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
      {ok ? (
        <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" />
      )}
      <div>
        <div className="text-sm font-bold text-slate-900">{label}</div>
        <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
      </div>
    </div>
  );
}

export default async function AutomationPilotPage({
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
        <p className="text-sm text-slate-600">Sign in to manage the bounded WhatsApp pilot.</p>
      </div>
    );
  }

  let organizationName = 'Current organization';
  let canManage = false;
  let provider: ProviderSettings = {
    provider_send_enabled: false,
    pilot_mode_enabled: false,
    pilot_lead_id: null,
    pilot_started_at: null,
    pilot_max_messages: 1,
    pilot_require_verified_primary_whatsapp: true,
  };
  let policy: MessagingPolicy = {
    policy_enabled: false,
    autonomous_send_enabled: false,
    requires_human_approval: true,
  };
  let contacts: ContactRow[] = [];
  let leads: LeadRow[] = [];
  let audits: AuditRow[] = [];
  let runtimeWorkflows = 0;
  let approvedTemplates = 0;
  let activeWhatsAppAccounts = 0;
  let activeSuppressions = 0;
  let sentSincePilot = 0;
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const admin = createAdminClient();
      const { data: providerRow, error: providerError } = await admin
        .from('automation_provider_send_settings')
        .select(
          'provider_send_enabled,pilot_mode_enabled,pilot_lead_id,pilot_started_at,pilot_max_messages,pilot_require_verified_primary_whatsapp',
        )
        .eq('organization_id', organizationId)
        .eq('channel', 'whatsapp')
        .eq('provider', 'meta_cloud_api')
        .maybeSingle();

      if (providerError) throw providerError;
      if (providerRow) provider = providerRow as ProviderSettings;

      const [
        manageResult,
        policyResult,
        contactResult,
        runtimeResult,
        templateResult,
        accountResult,
        auditResult,
      ] = await Promise.all([
        supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
        admin
          .from('automation_messaging_policies')
          .select('policy_enabled,autonomous_send_enabled,requires_human_approval')
          .eq('organization_id', organizationId)
          .eq('channel', 'whatsapp')
          .maybeSingle(),
        admin
          .from('lead_contacts')
          .select('lead_id,normalized_value')
          .eq('organization_id', organizationId)
          .eq('contact_type', 'whatsapp')
          .eq('verified', true)
          .eq('is_primary', true)
          .order('created_at', { ascending: false })
          .limit(100),
        admin
          .from('automation_workflows')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .eq('runtime_flow_enabled', true)
          .not('current_published_version', 'is', null),
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
        admin
          .from('automation_provider_send_audits')
          .select('id,status,request_mode,customer_message_sent,provider_delivery_status,prepared_at,sent_at')
          .eq('organization_id', organizationId)
          .eq('lead_id', provider.pilot_lead_id || '00000000-0000-0000-0000-000000000000')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const firstError = [
        manageResult.error,
        policyResult.error,
        contactResult.error,
        runtimeResult.error,
        templateResult.error,
        accountResult.error,
        auditResult.error,
      ].find(Boolean);
      if (firstError) throw firstError;

      canManage = manageResult.data === true;
      if (policyResult.data) policy = policyResult.data as MessagingPolicy;
      contacts = (contactResult.data ?? []) as ContactRow[];
      audits = (auditResult.data ?? []) as AuditRow[];
      runtimeWorkflows = runtimeResult.count ?? 0;
      approvedTemplates = templateResult.count ?? 0;
      activeWhatsAppAccounts = accountResult.count ?? 0;

      const leadIds = Array.from(new Set(contacts.map((contact) => contact.lead_id)));
      if (leadIds.length > 0) {
        const leadResult = await admin
          .from('leads')
          .select('id,lead_code')
          .eq('organization_id', organizationId)
          .in('id', leadIds);
        if (leadResult.error) throw leadResult.error;
        leads = (leadResult.data ?? []) as LeadRow[];
      }

      if (provider.pilot_lead_id) {
        const { data: suppressionRows, error: suppressionError } = await admin
          .from('automation_suppressions')
          .select('id,expires_at')
          .eq('organization_id', organizationId)
          .eq('lead_id', provider.pilot_lead_id)
          .eq('active', true)
          .or('channel.is.null,channel.eq.whatsapp');
        if (suppressionError) throw suppressionError;

        const now = Date.now();
        activeSuppressions = (suppressionRows ?? []).filter((row) => {
          if (!row.expires_at) return true;
          const expiry = new Date(row.expires_at).getTime();
          return Number.isFinite(expiry) && expiry > now;
        }).length;
      }

      if (provider.pilot_started_at && provider.pilot_lead_id) {
        const { count, error: sentError } = await admin
          .from('automation_provider_send_audits')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('lead_id', provider.pilot_lead_id)
          .eq('customer_message_sent', true)
          .gte('sent_at', provider.pilot_started_at);
        if (sentError) throw sentError;
        sentSincePilot = count ?? 0;
      }
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load pilot control.';
  }

  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const contactMap = new Map(contacts.map((contact) => [contact.lead_id, contact]));
  const pilotLead = provider.pilot_lead_id ? leadMap.get(provider.pilot_lead_id) ?? null : null;
  const pilotContact = provider.pilot_lead_id ? contactMap.get(provider.pilot_lead_id) ?? null : null;
  const selectedLeadReady = Boolean(provider.pilot_lead_id && pilotLead && pilotContact);
  const capAvailable = sentSincePilot < provider.pilot_max_messages;
  const armReadiness =
    provider.pilot_mode_enabled &&
    selectedLeadReady &&
    policy.policy_enabled &&
    policy.autonomous_send_enabled === false &&
    policy.requires_human_approval === true &&
    runtimeWorkflows > 0 &&
    approvedTemplates > 0 &&
    activeWhatsAppAccounts > 0 &&
    activeSuppressions === 0 &&
    capAvailable;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Controlled rollout"
        title="WhatsApp Pilot Control"
        description={`Prepare and safely disarm a one-lead WhatsApp pilot for ${organizationName}. This page deliberately cannot arm provider execution or send a customer message.`}
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

      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 text-sm leading-6 text-violet-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <div>
            <strong>Fail-closed control surface:</strong> preparing a pilot always forces provider execution OFF, fixes the pilot cap at one message, requires a verified primary WhatsApp contact, and does not change the messaging policy or human-approval requirement.
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Provider gate</div>
          <div className="mt-3">{pill(provider.provider_send_enabled, 'OPEN', 'CLOSED', true)}</div>
          <div className="mt-2 text-xs text-slate-500">Final Meta execution boundary</div>
        </div>
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Pilot mode</div>
          <div className="mt-3">{pill(provider.pilot_mode_enabled, 'Prepared', 'Not prepared')}</div>
          <div className="mt-2 text-xs text-slate-500">Exact lead allowlist</div>
        </div>
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Pilot lead</div>
          <div className="mt-2 text-lg font-bold text-slate-950">{pilotLead?.lead_code || 'None'}</div>
          <div className="mt-1 text-xs text-slate-500">{pilotContact ? maskWhatsApp(pilotContact.normalized_value) : 'No verified primary contact selected'}</div>
        </div>
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Pilot usage</div>
          <div className="mt-2 text-lg font-bold text-slate-950">{sentSincePilot} / {provider.pilot_max_messages}</div>
          <div className="mt-1 text-xs text-slate-500">Since {formatTime(provider.pilot_started_at)}</div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <div className="card-pad">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
              <Target size={18} />
            </div>
            <div>
              <h2 className="font-bold text-slate-950">Prepare bounded pilot</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Choose one verified primary WhatsApp lead. Preparation clears the pilot start time and closes the provider gate.
              </p>
            </div>
          </div>

          {canManage ? (
            <form action={prepareWhatsAppPilotAction} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Verified primary WhatsApp lead</span>
                <select
                  name="lead_id"
                  required
                  defaultValue={provider.pilot_lead_id || ''}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                >
                  <option value="" disabled>Select a lead</option>
                  {contacts.map((contact) => {
                    const lead = leadMap.get(contact.lead_id);
                    return (
                      <option key={contact.lead_id} value={contact.lead_id}>
                        {lead?.lead_code || contact.lead_id.slice(0, 8)} · {maskWhatsApp(contact.normalized_value)}
                      </option>
                    );
                  })}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
                  <strong className="text-slate-900">Message cap:</strong> fixed at 1.
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
                  <strong className="text-slate-900">Provider gate:</strong> forced OFF.
                </div>
              </div>

              <button type="submit" className="btn-primary" disabled={contacts.length === 0}>
                <UserCheck size={15} />
                Prepare pilot safely
              </button>
            </form>
          ) : (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Organization admin access is required to prepare a pilot.
            </div>
          )}

          {contacts.length === 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
              No lead currently has a verified primary WhatsApp contact in this workspace.
            </div>
          ) : null}
        </div>

        <div className="card-pad">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
              <LockKeyhole size={18} />
            </div>
            <div>
              <h2 className="font-bold text-slate-950">Provider-arm readiness</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                These checks are informational. This page has no provider-arm action.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <ChecklistRow
              ok={provider.pilot_mode_enabled && selectedLeadReady}
              label="Exact pilot lead prepared"
              detail={selectedLeadReady ? `${pilotLead?.lead_code || 'Selected lead'} has a verified primary WhatsApp contact.` : 'Prepare one verified primary WhatsApp lead.'}
            />
            <ChecklistRow
              ok={policy.policy_enabled}
              label="Messaging policy"
              detail={policy.policy_enabled ? 'WhatsApp policy is enabled.' : 'Policy is closed; provider claim would remain blocked.'}
            />
            <ChecklistRow
              ok={policy.autonomous_send_enabled === false && policy.requires_human_approval === true}
              label="Human-control safeguards"
              detail="Autonomous send must stay off and human approval must remain required."
            />
            <ChecklistRow
              ok={runtimeWorkflows > 0}
              label="Published runtime workflow"
              detail={`${runtimeWorkflows} active workflow${runtimeWorkflows === 1 ? '' : 's'} currently have runtime enabled.`}
            />
            <ChecklistRow
              ok={approvedTemplates > 0 && activeWhatsAppAccounts > 0}
              label="Provider-approved send assets"
              detail={`${approvedTemplates} approved template${approvedTemplates === 1 ? '' : 's'} · ${activeWhatsAppAccounts} active WhatsApp account${activeWhatsAppAccounts === 1 ? '' : 's'}.`}
            />
            <ChecklistRow
              ok={activeSuppressions === 0}
              label="No active pilot suppression"
              detail={activeSuppressions === 0 ? 'No active WhatsApp suppression is blocking the selected pilot lead.' : `${activeSuppressions} active suppression${activeSuppressions === 1 ? '' : 's'} block the selected lead.`}
            />
            <ChecklistRow
              ok={capAvailable}
              label="Pilot cap available"
              detail={capAvailable ? `${sentSincePilot} of ${provider.pilot_max_messages} allowed pilot messages used.` : 'Pilot cap is exhausted; prepare a new controlled pilot before any further provider test.'}
            />
          </div>

          <div className={`mt-4 rounded-xl border px-3 py-3 text-xs leading-5 ${armReadiness ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <strong>{armReadiness ? 'Readiness checks pass.' : 'Provider arm is not ready.'}</strong> Even when every check passes, provider execution remains a separate explicit operation and is not available on this screen.
          </div>
        </div>
      </section>

      <section className="card-pad">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-700">
            <Power size={18} />
          </div>
          <div>
            <h2 className="font-bold text-slate-950">Safe shutdown controls</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              These controls only reduce execution capability. Neither action can send a message.
            </p>
          </div>
        </div>

        {canManage ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <form action={closeWhatsAppProviderGateAction}>
              <button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-100">
                <LockKeyhole size={15} />
                Close provider gate
              </button>
            </form>
            <form action={resetWhatsAppPilotAction}>
              <button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <RotateCcw size={15} />
                Reset pilot configuration
              </button>
            </form>
          </div>
        ) : null}
      </section>

      <section className="card-pad">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-950">Recent pilot provider audit</h2>
            <p className="mt-1 text-sm text-slate-500">Latest provider audit rows for the selected pilot lead.</p>
          </div>
          <MessageSquareText size={18} className="text-slate-400" />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr className="border-b border-slate-200">
                <th className="pb-3 pr-4">Mode</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Customer sent</th>
                <th className="pb-3 pr-4">Delivery</th>
                <th className="pb-3 pr-4">Prepared</th>
                <th className="pb-3 pr-4">Sent</th>
              </tr>
            </thead>
            <tbody>
              {audits.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-slate-500">No provider audits for the selected pilot lead.</td></tr>
              ) : audits.map((audit) => (
                <tr key={audit.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 text-slate-700">{audit.request_mode.replaceAll('_', ' ')}</td>
                  <td className="py-3 pr-4 font-semibold text-slate-900">{audit.status.replaceAll('_', ' ')}</td>
                  <td className="py-3 pr-4">{audit.customer_message_sent ? 'Yes' : 'No'}</td>
                  <td className="py-3 pr-4 text-slate-600">{audit.provider_delivery_status || '—'}</td>
                  <td className="py-3 pr-4 text-slate-500">{formatTime(audit.prepared_at)}</td>
                  <td className="py-3 pr-4 text-slate-500">{formatTime(audit.sent_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
        <strong className="text-slate-900">Boundary:</strong> there is intentionally no “Send test”, “Arm provider”, or “Enable autonomous send” button on this page. A future provider-arm action must re-check the same policy, approval, suppression, verified-contact and pilot-cap boundaries immediately before opening execution.
      </div>
    </div>
  );
}
