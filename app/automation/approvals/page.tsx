import Link from 'next/link';
import { ArrowLeft, Clock3, MessageCircle, ShieldCheck } from 'lucide-react';

import { ApprovalActions } from '@/app/automation/approvals/approval-actions';
import { PageHeader } from '@/components/ui';
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
};

function leadName(lead: LeadSummary | undefined) {
  if (!lead) return 'Unknown lead';
  if (lead.display_name?.trim()) return lead.display_name.trim();
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
  return name || lead.lead_code || 'Lead';
}

function messagePreview(payload: Record<string, unknown> | null) {
  if (!payload) return 'No message preview stored.';
  const body = typeof payload.body === 'string' ? payload.body : typeof payload.text === 'string' ? payload.text : null;
  if (body) return body;
  const type = typeof payload.message_type === 'string' ? payload.message_type : 'message';
  return `WhatsApp ${type}`;
}

function statusClass(status: string) {
  if (status === 'pending') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'rejected') return 'bg-rose-50 text-rose-700 ring-rose-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

export default async function AutomationApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="card-pad">
        <p className="text-sm text-slate-600">Sign in to review automation approvals.</p>
      </div>
    );
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
              .select('id,status,customer_message_sent')
              .eq('organization_id', organizationId)
              .in('id', auditIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (leadError) throw leadError;
      if (workflowError) throw workflowError;
      if (auditError) throw auditError;

      leads = new Map(((leadRows ?? []) as LeadSummary[]).map((row) => [row.id, row]));
      workflows = new Map(((workflowRows ?? []) as WorkflowSummary[]).map((row) => [row.id, row]));
      providerAudits = new Map(
        ((auditRows ?? []) as ProviderAuditSummary[]).map((row) => [row.id, row]),
      );
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load approval queue.';
  }

  const canApprove = role ? ['owner', 'admin', 'admissions'].includes(role) : false;
  const pending = approvals.filter((row) => row.status === 'pending');
  const recent = approvals.filter((row) => row.status !== 'pending').slice(0, 30);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="Human approval queue"
        description={`Review WhatsApp automation sends for ${organizationName}. Approval never bypasses suppression, frequency limits, channel policy, or the provider kill switch.`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/automation"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back to Smart Triggers
        </Link>
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          {pending.length} pending approval{pending.length === 1 ? '' : 's'}
        </div>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {loadError}
        </div>
      ) : null}

      {!canApprove ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          You can view this queue, but only workspace owners, admins, or admissions users can approve or reject sends.
        </div>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-amber-600" />
          <h2 className="text-base font-bold text-slate-950">Pending review</h2>
        </div>

        {pending.length === 0 ? (
          <div className="card-pad text-sm text-slate-500">No WhatsApp automation sends are waiting for approval.</div>
        ) : (
          <div className="space-y-4">
            {pending.map((approval) => {
              const lead = leads.get(approval.lead_id);
              const workflow = workflows.get(approval.workflow_id);
              return (
                <article key={approval.id} className="card-pad space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-950">{leadName(lead)}</h3>
                        {lead?.lead_code ? <span className="text-xs font-semibold text-slate-400">{lead.lead_code}</span> : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{workflow?.name || 'Automation workflow'}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusClass(approval.status)}`}>
                      Pending
                    </span>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <MessageCircle size={14} />
                      WhatsApp message
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{messagePreview(approval.request_payload)}</p>
                    {approval.template_name ? (
                      <p className="mt-3 text-xs text-slate-500">
                        Template: <strong>{approval.template_name}</strong>
                        {approval.template_language ? ` · ${approval.template_language}` : ''}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock3 size={14} />
                    Requested {new Date(approval.requested_at).toLocaleString('en-IN')}
                  </div>

                  <ApprovalActions approvalId={approval.id} disabled={!canApprove} />
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-bold text-slate-950">Recent decisions</h2>
        {recent.length === 0 ? (
          <div className="card-pad text-sm text-slate-500">No recent approval decisions.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="divide-y divide-slate-100">
              {recent.map((approval) => {
                const audit = approval.provider_send_audit_id
                  ? providerAudits.get(approval.provider_send_audit_id)
                  : undefined;
                const canExecuteApprovedSend =
                  canApprove &&
                  approval.status === 'approved' &&
                  audit?.status === 'ready' &&
                  audit.customer_message_sent !== true;

                return (
                  <div key={approval.id} className="space-y-3 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{leadName(leads.get(approval.lead_id))}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{workflows.get(approval.workflow_id)?.name || 'Automation workflow'}</p>
                        {audit ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Provider audit: {audit.customer_message_sent ? 'sent' : audit.status.replaceAll('_', ' ')}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusClass(approval.status)}`}>
                          {approval.status.replaceAll('_', ' ')}
                        </span>
                        {approval.decided_at ? (
                          <p className="mt-1.5 text-xs text-slate-400">{new Date(approval.decided_at).toLocaleString('en-IN')}</p>
                        ) : null}
                      </div>
                    </div>

                    {canExecuteApprovedSend ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="mb-2 text-xs leading-5 text-emerald-800">
                          This send was already human-approved and is waiting at the provider boundary. Executing it still rechecks suppression, frequency caps, WhatsApp template eligibility, pilot allowlist, and the provider kill switch.
                        </p>
                        <ApprovalActions approvalId={approval.id} disabled={!canApprove} mode="execute" />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
