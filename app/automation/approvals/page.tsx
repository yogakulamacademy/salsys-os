import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  MessageCircle,
  ShieldAlert,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

import { ApprovalActions } from '@/app/automation/approvals/approval-actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type ApprovalRow = {
  id: string;
  lead_id: string;
  workflow_id: string;
  status: string;
  channel: string;
  template_name: string | null;
  template_language: string | null;
  request_payload: Record<string, unknown> | null;
  requested_at: string;
  decided_at: string | null;
  decision_reason: string | null;
  provider_send_audit_id: string | null;
};

type LeadSummary = {
  id: string;
  lead_code: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

type WorkflowSummary = {
  id: string;
  name: string;
};

type ProviderAuditSummary = {
  id: string;
  status: string;
  customer_message_sent: boolean;
  provider_error: string | null;
  failed_at: string | null;
};

function leadName(lead: LeadSummary | undefined) {
  if (!lead) return 'Unknown lead';
  if (lead.display_name?.trim()) return lead.display_name.trim();
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
  return name || lead.lead_code || 'Lead';
}

function messagePreview(payload: Record<string, unknown> | null) {
  if (!payload) return 'No message preview is stored for this approval.';
  const body =
    typeof payload.body === 'string'
      ? payload.body
      : typeof payload.text === 'string'
        ? payload.text
        : null;
  if (body) return body;
  const type = typeof payload.message_type === 'string' ? payload.message_type : 'message';
  return `WhatsApp ${type}`;
}

function statusClass(status: string) {
  if (status === 'pending') return 'bg-violet-50 text-violet-700 ring-violet-200';
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'rejected') return 'bg-rose-50 text-rose-700 ring-rose-200';
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

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  icon: React.ComponentType<{ size?: number }>;
  tone: 'amber' | 'rose' | 'emerald' | 'violet';
}) {
  const iconClass =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : tone === 'rose'
        ? 'bg-rose-50 text-rose-700'
        : tone === 'emerald'
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-violet-50 text-violet-700';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className={`grid h-10 w-10 place-items-center rounded-xl ${iconClass}`}><Icon size={18} /></div>
      <div className="mt-3 text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 text-[28px] font-bold tracking-tight text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
}

export default async function AutomationApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ approval?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="card-pad text-sm text-slate-600">Sign in to review automation approvals.</div>;
  }

  let organizationName = 'Current organization';
  let organizationId: string | null = null;
  let role: string | null = null;
  let loadError: string | null = null;
  let approvals: ApprovalRow[] = [];
  let leads = new Map<string, LeadSummary>();
  let workflows = new Map<string, WorkflowSummary>();
  let providerAudits = new Map<string, ProviderAuditSummary>();

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;
    role = workspace.activeWorkspace?.role || null;

    if (organizationId) {
      const { data, error } = await supabase
        .from('automation_approval_requests')
        .select(
          'id,lead_id,workflow_id,status,channel,template_name,template_language,request_payload,requested_at,decided_at,decision_reason,provider_send_audit_id',
        )
        .eq('organization_id', organizationId)
        .order('requested_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      approvals = (data ?? []) as ApprovalRow[];

      const leadIds = [...new Set(approvals.map((row) => row.lead_id))];
      const workflowIds = [...new Set(approvals.map((row) => row.workflow_id))];
      const auditIds = [
        ...new Set(
          approvals
            .map((row) => row.provider_send_audit_id)
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      const admin = createAdminClient();

      const [
        { data: leadRows, error: leadError },
        { data: workflowRows, error: workflowError },
        { data: auditRows, error: auditError },
      ] = await Promise.all([
        leadIds.length
          ? supabase
              .from('leads')
              .select('id,lead_code,display_name,first_name,last_name')
              .eq('organization_id', organizationId)
              .in('id', leadIds)
          : Promise.resolve({ data: [], error: null }),
        workflowIds.length
          ? supabase
              .from('automation_workflows')
              .select('id,name')
              .eq('organization_id', organizationId)
              .in('id', workflowIds)
          : Promise.resolve({ data: [], error: null }),
        auditIds.length
          ? admin
              .from('automation_provider_send_audits')
              .select('id,status,customer_message_sent,provider_error,failed_at')
              .eq('organization_id', organizationId)
              .in('id', auditIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (leadError) throw leadError;
      if (workflowError) throw workflowError;
      if (auditError) throw auditError;

      leads = new Map(((leadRows ?? []) as LeadSummary[]).map((row) => [row.id, row]));
      workflows = new Map(((workflowRows ?? []) as WorkflowSummary[]).map((row) => [row.id, row]));
      providerAudits = new Map(((auditRows ?? []) as ProviderAuditSummary[]).map((row) => [row.id, row]));
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load approval queue.';
  }

  const canApprove = role ? ['owner', 'admin', 'admissions'].includes(role) : false;
  const pending = approvals.filter((row) => row.status === 'pending');
  const recent = approvals.filter((row) => row.status !== 'pending').slice(0, 30);
  const now = Date.now();
  const dueSoon = pending.filter((row) => now - new Date(row.requested_at).getTime() >= 4 * 60 * 60 * 1000).length;
  const escalations = pending.filter((row) => now - new Date(row.requested_at).getTime() >= 24 * 60 * 60 * 1000).length;
  const selected =
    approvals.find((row) => row.id === query.approval) ?? pending[0] ?? recent[0] ?? null;
  const selectedLead = selected ? leads.get(selected.lead_id) : undefined;
  const selectedWorkflow = selected ? workflows.get(selected.workflow_id) : undefined;
  const selectedAudit = selected?.provider_send_audit_id
    ? providerAudits.get(selected.provider_send_audit_id)
    : undefined;
  const selectedCanExecute =
    Boolean(selected && canApprove && selected.status === 'approved' && selectedAudit?.status === 'ready' && selectedAudit.customer_message_sent !== true);
  const selectedCanRetry =
    Boolean(selected && canApprove && selected.status === 'approved' && selectedAudit?.status === 'failed' && selectedAudit.customer_message_sent !== true);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Automation · Governance</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Human Approval Queue</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Review customer-impacting automation for {organizationName}. Approval never bypasses messaging safety controls.
          </p>
        </div>
        <Link href="/automation/readiness" className="btn-secondary"><ShieldCheck size={15} /> Automation guide</Link>
      </header>

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">Approval data is temporarily unavailable.</div>
      ) : null}

      {!canApprove ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">You can inspect this queue, but only workspace owners, admins, or admissions users can approve or reject sends.</div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pending approvals" value={pending.length} note="Awaiting human review" icon={Clock3} tone="amber" />
        <MetricCard label="SLA due soon" value={dueSoon} note="Waiting at least 4 hours" icon={ShieldAlert} tone="rose" />
        <MetricCard label="Decision history" value={recent.length} note="Recent recorded decisions" icon={FileCheck2} tone="emerald" />
        <MetricCard label="Escalations" value={escalations} note="Waiting at least 24 hours" icon={Workflow} tone="violet" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(320px,.72fr)_minmax(0,1.28fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between px-2 py-2">
            <div>
              <h2 className="text-sm font-bold text-slate-950">Pending review</h2>
              <p className="mt-0.5 text-xs text-slate-500">Select an item to inspect its evidence.</p>
            </div>
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">{pending.length}</span>
          </div>

          {pending.length === 0 ? (
            <div className="m-2 rounded-xl border border-dashed border-slate-200 px-5 py-10 text-center">
              <CheckCircle2 className="mx-auto text-emerald-500" size={24} />
              <div className="mt-2 text-sm font-semibold text-slate-800">Queue is clear</div>
              <div className="mt-1 text-xs text-slate-500">No customer-impacting automation is waiting for approval.</div>
            </div>
          ) : (
            <div className="mt-1 space-y-2">
              {pending.map((approval) => {
                const active = selected?.id === approval.id;
                const lead = leads.get(approval.lead_id);
                const workflow = workflows.get(approval.workflow_id);
                return (
                  <Link
                    key={approval.id}
                    href={`/automation/approvals?approval=${approval.id}`}
                    className={`block rounded-xl border px-3.5 py-3 transition ${active ? 'border-violet-300 bg-violet-50/60 ring-1 ring-violet-100' : 'border-slate-200 hover:border-violet-200 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-900">{leadName(lead)}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">{workflow?.name || 'Automation workflow'}</div>
                        <div className="mt-1 text-[10px] text-slate-400">Requested {relativeTime(approval.requested_at)}</div>
                      </div>
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-100">Pending</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {!selected ? (
            <div className="grid min-h-[360px] place-items-center text-center">
              <div>
                <ShieldCheck className="mx-auto text-slate-300" size={30} />
                <div className="mt-3 text-sm font-semibold text-slate-800">Select an approval</div>
                <div className="mt-1 text-xs text-slate-500">Approval details and evidence will appear here.</div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-950">{leadName(selectedLead)}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${statusClass(selected.status)}`}>{selected.status.replaceAll('_', ' ')}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{selectedWorkflow?.name || 'Automation workflow'} · {selected.channel}</p>
                  <p className="mt-1 text-xs text-slate-400">Requested {new Date(selected.requested_at).toLocaleString('en-IN')}</p>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(260px,.95fr)]">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><MessageCircle size={14} /> Message preview</div>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{messagePreview(selected.request_payload)}</p>
                    {selected.template_name ? (
                      <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">Template: <strong className="text-slate-700">{selected.template_name}</strong>{selected.template_language ? ` · ${selected.template_language}` : ''}</div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Review evidence</div>
                    <div className="mt-3 space-y-2.5 text-xs">
                      <div className="flex items-start gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span className="text-slate-600">Human approval is required for this action.</span></div>
                      <div className="flex items-start gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span className="text-slate-600">Lead and workflow are linked to the active organization.</span></div>
                      <div className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-violet-600" /><span className="text-slate-600">Provider execution remains subject to suppression, frequency and provider-boundary checks.</span></div>
                    </div>
                  </div>

                  {selectedAudit ? (
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Provider state</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">{selectedAudit.customer_message_sent ? 'Customer message sent' : selectedAudit.status.replaceAll('_', ' ')}</div>
                      {selectedAudit.provider_error ? <div className="mt-1 text-xs leading-5 text-rose-600">{selectedAudit.provider_error}</div> : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {selected.status === 'pending' ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Decision</div>
                  <ApprovalActions approvalId={selected.id} disabled={!canApprove} />
                </div>
              ) : selectedCanExecute ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="mb-3 text-xs leading-5 text-emerald-800">This action is approved and waiting at the provider boundary. Execution will recheck all messaging safety controls.</p>
                  <ApprovalActions approvalId={selected.id} disabled={!canApprove} mode="execute" />
                </div>
              ) : selectedCanRetry ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-3 text-xs leading-5 text-amber-900">The previous provider attempt failed before a customer send was recorded. Retry will create a new audit record and recheck policy.</p>
                  <ApprovalActions approvalId={selected.id} disabled={!canApprove} mode="retry" />
                </div>
              ) : selected.decision_reason ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><strong>Decision note:</strong> {selected.decision_reason}</div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-950">Recent decisions</h2>
            <p className="mt-0.5 text-xs text-slate-500">Latest recorded human decisions and provider state.</p>
          </div>
          <span className="text-xs font-semibold text-slate-400">{recent.length} shown</span>
        </div>

        {recent.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-500">No recent approval decisions.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2">Lead</th>
                  <th className="px-3 py-2">Workflow</th>
                  <th className="px-3 py-2">Decision</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Decided</th>
                  <th className="px-3 py-2 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((approval) => {
                  const audit = approval.provider_send_audit_id ? providerAudits.get(approval.provider_send_audit_id) : undefined;
                  return (
                    <tr key={approval.id} className="text-slate-600 hover:bg-slate-50/70">
                      <td className="px-3 py-3 font-semibold text-slate-900">{leadName(leads.get(approval.lead_id))}</td>
                      <td className="px-3 py-3">{workflows.get(approval.workflow_id)?.name || 'Automation workflow'}</td>
                      <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ring-1 ring-inset ${statusClass(approval.status)}`}>{approval.status.replaceAll('_', ' ')}</span></td>
                      <td className="px-3 py-3">{audit ? (audit.customer_message_sent ? 'sent' : audit.status.replaceAll('_', ' ')) : '—'}</td>
                      <td className="px-3 py-3">{approval.decided_at ? new Date(approval.decided_at).toLocaleString('en-IN') : '—'}</td>
                      <td className="px-3 py-3 text-right"><Link href={`/automation/approvals?approval=${approval.id}`} className="inline-flex items-center gap-1 font-semibold text-violet-700">View <ArrowRight size={12} /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
