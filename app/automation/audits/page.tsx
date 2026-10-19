import Link from 'next/link';
import { ArrowRight, CheckCircle2, FileSearch, MessageSquareText, ShieldCheck } from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type AuditRow = {
  id: string;
  workflow_id: string | null;
  lead_id: string;
  approval_request_id: string | null;
  request_mode: string;
  status: string;
  customer_message_sent: boolean;
  provider_delivery_status: string | null;
  prepared_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  provider_error: string | null;
};

type WorkflowRow = { id: string; name: string };
type LeadRow = { id: string; lead_code: string | null };

function formatTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

function statusClass(status: string) {
  const value = status.toLowerCase();
  if (['sent', 'delivered', 'read', 'completed', 'approved'].includes(value)) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  }
  if (['failed', 'blocked', 'rejected', 'cancelled'].includes(value)) {
    return 'bg-rose-50 text-rose-700 ring-rose-200';
  }
  return 'bg-amber-50 text-amber-700 ring-amber-200';
}

export default async function AutomationAuditsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="card-pad text-sm text-slate-600">Sign in to inspect provider audits.</div>;
  }

  let organizationName = 'Current organization';
  let audits: AuditRow[] = [];
  let workflows: WorkflowRow[] = [];
  let leads: LeadRow[] = [];
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const admin = createAdminClient();
      const [auditResult, workflowResult] = await Promise.all([
        admin
          .from('automation_provider_send_audits')
          .select(
            'id,workflow_id,lead_id,approval_request_id,request_mode,status,customer_message_sent,provider_delivery_status,prepared_at,sent_at,delivered_at,read_at,provider_error',
          )
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(100),
        admin
          .from('automation_workflows')
          .select('id,name')
          .eq('organization_id', organizationId),
      ]);

      if (auditResult.error || workflowResult.error) throw auditResult.error || workflowResult.error;
      audits = (auditResult.data ?? []) as AuditRow[];
      workflows = (workflowResult.data ?? []) as WorkflowRow[];

      const leadIds = Array.from(new Set(audits.map((audit) => audit.lead_id)));
      if (leadIds.length > 0) {
        const leadResult = await admin
          .from('leads')
          .select('id,lead_code')
          .eq('organization_id', organizationId)
          .in('id', leadIds);
        if (leadResult.error) throw leadResult.error;
        leads = (leadResult.data ?? []) as LeadRow[];
      }
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load provider audits.';
  }

  const workflowMap = new Map(workflows.map((workflow) => [workflow.id, workflow.name]));
  const leadMap = new Map(leads.map((lead) => [lead.id, lead.lead_code || lead.id.slice(0, 8)]));
  const sentCount = audits.filter((audit) => audit.customer_message_sent).length;
  const blockedCount = audits.filter((audit) => ['blocked', 'failed'].includes(audit.status)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation · Audit lineage"
        title="Provider Audit Explorer"
        description={`Trace WhatsApp provider decisions for ${organizationName} from approval through canonical CRM message and delivery state. This view is read-only.`}
      />

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {loadError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 text-sm leading-6 text-violet-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <div>
            <strong>Read-only lineage:</strong> opening an audit never retries a provider call, changes an approval, modifies policy, or sends a customer message.
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Recent audits</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{audits.length}</div>
          <div className="mt-1 text-xs text-slate-500">Latest 100 rows</div>
        </div>
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Customer sends</div>
          <div className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-950">
            <CheckCircle2 size={18} className="text-emerald-600" /> {sentCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Audited sends in this view</div>
        </div>
        <div className="card-pad">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Blocked / failed</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{blockedCount}</div>
          <div className="mt-1 text-xs text-slate-500">Policy or provider failures</div>
        </div>
      </section>

      <section className="card-pad">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-950">Provider audit ledger</h2>
            <p className="mt-1 text-sm text-slate-500">Open a row to inspect approval, workflow, CRM message and delivery lineage.</p>
          </div>
          <FileSearch size={18} className="text-slate-400" />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr className="border-b border-slate-200">
                <th className="pb-3 pr-4">Lead</th>
                <th className="pb-3 pr-4">Workflow</th>
                <th className="pb-3 pr-4">Mode</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Customer sent</th>
                <th className="pb-3 pr-4">Delivery</th>
                <th className="pb-3 pr-4">Prepared</th>
                <th className="pb-3 pr-4">Sent</th>
                <th className="pb-3 text-right">Detail</th>
              </tr>
            </thead>
            <tbody>
              {audits.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-slate-500">No provider audits recorded.</td></tr>
              ) : audits.map((audit) => (
                <tr key={audit.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="py-3 pr-4 font-semibold text-slate-900">{leadMap.get(audit.lead_id) || audit.lead_id.slice(0, 8)}</td>
                  <td className="py-3 pr-4 text-slate-700">{audit.workflow_id ? workflowMap.get(audit.workflow_id) || audit.workflow_id.slice(0, 8) : '—'}</td>
                  <td className="py-3 pr-4 text-slate-600">{audit.request_mode.replaceAll('_', ' ')}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${statusClass(audit.status)}`}>
                      {audit.status.replaceAll('_', ' ')}
                    </span>
                    {audit.provider_error ? <div className="mt-1 max-w-[220px] text-xs text-rose-600">{audit.provider_error}</div> : null}
                  </td>
                  <td className="py-3 pr-4">{audit.customer_message_sent ? 'Yes' : 'No'}</td>
                  <td className="py-3 pr-4 text-slate-600">{audit.provider_delivery_status || '—'}</td>
                  <td className="py-3 pr-4 text-slate-500">{formatTime(audit.prepared_at)}</td>
                  <td className="py-3 pr-4 text-slate-500">{formatTime(audit.sent_at)}</td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/automation/audits/${audit.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Trace <ArrowRight size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
        <div className="flex items-start gap-3">
          <MessageSquareText size={17} className="mt-0.5 shrink-0 text-slate-400" />
          <div>Provider acceptance and customer delivery are separate states. Use the detail trace to distinguish preparation, provider send, canonical CRM persistence, delivered/read webhooks and any delivery failure.</div>
        </div>
      </div>
    </div>
  );
}
