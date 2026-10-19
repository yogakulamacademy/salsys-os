import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileSearch,
  GitBranch,
  MessageSquareText,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type Json = Record<string, unknown>;

type AuditRow = {
  id: string;
  workflow_id: string | null;
  enrollment_id: string | null;
  action_run_id: string | null;
  lead_id: string;
  channel: string;
  provider: string;
  whatsapp_account_id: string | null;
  whatsapp_template_id: string | null;
  request_mode: string;
  idempotency_key: string;
  status: string;
  policy_snapshot: Json | null;
  request_payload: Json | null;
  block_reasons: unknown;
  provider_message_id: string | null;
  provider_error: string | null;
  customer_message_sent: boolean;
  prepared_at: string;
  sent_at: string | null;
  failed_at: string | null;
  crm_message_id: string | null;
  provider_delivery_status: string | null;
  delivered_at: string | null;
  read_at: string | null;
  delivery_failed_at: string | null;
  delivery_error: Json | null;
  approval_request_id: string | null;
};

type ApprovalRow = {
  id: string;
  flow_version: number;
  node_id: string;
  status: string;
  template_name: string | null;
  template_language: string | null;
  requested_at: string;
  decided_at: string | null;
  decision_reason: string | null;
};

type EnrollmentRow = {
  id: string;
  status: string;
  flow_version: number;
  current_node_id: string | null;
  next_action_at: string | null;
  stopped_reason: string | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  external_message_id: string | null;
  direction: string;
  sender_type: string;
  message_type: string;
  body: string | null;
  template_key: string | null;
  status: string;
  ai_generated: boolean;
  human_approved: boolean;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  received_at: string | null;
  metadata: Json | null;
};

type WorkflowRow = { id: string; name: string; status: string; current_published_version: number | null; runtime_flow_enabled: boolean };
type LeadRow = { id: string; lead_code: string | null };
type ContactRow = { normalized_value: string | null; verified: boolean; is_primary: boolean };
type NodeRow = { id: string; node_key: string; node_type: string; label: string };

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

function shortId(value: string | null) {
  if (!value) return '—';
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-5)}` : value;
}

function maskWhatsApp(value: string | null) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? `••••${digits.slice(-4)}` : '—';
}

function statusClass(status: string) {
  const value = status.toLowerCase();
  if (['sent', 'delivered', 'read', 'completed', 'approved', 'active'].includes(value)) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  }
  if (['failed', 'blocked', 'rejected', 'stopped', 'cancelled'].includes(value)) {
    return 'bg-rose-50 text-rose-700 ring-rose-200';
  }
  return 'bg-amber-50 text-amber-700 ring-amber-200';
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${statusClass(status)}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  const empty = value === null || value === undefined || (Array.isArray(value) && value.length === 0);
  const text = empty ? 'None' : JSON.stringify(value, null, 2);
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</div>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{text}</pre>
    </div>
  );
}

function TimelineRow({
  complete,
  title,
  time,
  detail,
}: {
  complete: boolean;
  title: string;
  time: string | null;
  detail: string;
}) {
  return (
    <div className="grid grid-cols-[28px_1fr] gap-3">
      <div className="pt-0.5">
        {complete ? <CheckCircle2 size={18} className="text-emerald-600" /> : <Clock3 size={18} className="text-slate-300" />}
      </div>
      <div className="border-b border-slate-100 pb-4 last:border-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold text-slate-900">{title}</div>
          <div className="text-xs text-slate-400">{formatTime(time)}</div>
        </div>
        <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
      </div>
    </div>
  );
}

export default async function ProviderAuditDetailPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="card-pad text-sm text-slate-600">Sign in to inspect provider audit lineage.</div>;
  }

  if (!validUuid(auditId)) {
    return (
      <div className="space-y-4">
        <Link href="/automation/audits" className="inline-flex items-center gap-2 text-sm font-bold text-violet-700">
          <ArrowLeft size={15} /> Back to Provider Audits
        </Link>
        <div className="card-pad text-sm text-rose-700">The provider audit identifier is invalid.</div>
      </div>
    );
  }

  let organizationName = 'Current organization';
  let audit: AuditRow | null = null;
  let approval: ApprovalRow | null = null;
  let enrollment: EnrollmentRow | null = null;
  let message: MessageRow | null = null;
  let workflow: WorkflowRow | null = null;
  let lead: LeadRow | null = null;
  let contact: ContactRow | null = null;
  let node: NodeRow | null = null;
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;

    if (organizationId) {
      const admin = createAdminClient();
      const auditResult = await admin
        .from('automation_provider_send_audits')
        .select(
          'id,workflow_id,enrollment_id,action_run_id,lead_id,channel,provider,whatsapp_account_id,whatsapp_template_id,request_mode,idempotency_key,status,policy_snapshot,request_payload,block_reasons,provider_message_id,provider_error,customer_message_sent,prepared_at,sent_at,failed_at,crm_message_id,provider_delivery_status,delivered_at,read_at,delivery_failed_at,delivery_error,approval_request_id',
        )
        .eq('organization_id', organizationId)
        .eq('id', auditId)
        .maybeSingle();

      if (auditResult.error) throw auditResult.error;
      audit = (auditResult.data ?? null) as AuditRow | null;

      if (audit) {
        const [workflowResult, leadResult, contactResult, approvalResult, enrollmentResult, messageResult] = await Promise.all([
          audit.workflow_id
            ? admin
                .from('automation_workflows')
                .select('id,name,status,current_published_version,runtime_flow_enabled')
                .eq('organization_id', organizationId)
                .eq('id', audit.workflow_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          admin
            .from('leads')
            .select('id,lead_code')
            .eq('organization_id', organizationId)
            .eq('id', audit.lead_id)
            .maybeSingle(),
          admin
            .from('lead_contacts')
            .select('normalized_value,verified,is_primary')
            .eq('organization_id', organizationId)
            .eq('lead_id', audit.lead_id)
            .eq('contact_type', 'whatsapp')
            .order('is_primary', { ascending: false })
            .order('verified', { ascending: false })
            .limit(1)
            .maybeSingle(),
          audit.approval_request_id
            ? admin
                .from('automation_approval_requests')
                .select('id,flow_version,node_id,status,template_name,template_language,requested_at,decided_at,decision_reason')
                .eq('organization_id', organizationId)
                .eq('id', audit.approval_request_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          audit.enrollment_id
            ? admin
                .from('automation_enrollments')
                .select('id,status,flow_version,current_node_id,next_action_at,stopped_reason,metadata,created_at,updated_at')
                .eq('organization_id', organizationId)
                .eq('id', audit.enrollment_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          audit.crm_message_id
            ? admin
                .from('messages')
                .select('id,conversation_id,external_message_id,direction,sender_type,message_type,body,template_key,status,ai_generated,human_approved,sent_at,delivered_at,read_at,received_at,metadata')
                .eq('organization_id', organizationId)
                .eq('id', audit.crm_message_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        const firstError = [
          workflowResult.error,
          leadResult.error,
          contactResult.error,
          approvalResult.error,
          enrollmentResult.error,
          messageResult.error,
        ].find(Boolean);
        if (firstError) throw firstError;

        workflow = (workflowResult.data ?? null) as WorkflowRow | null;
        lead = (leadResult.data ?? null) as LeadRow | null;
        contact = (contactResult.data ?? null) as ContactRow | null;
        approval = (approvalResult.data ?? null) as ApprovalRow | null;
        enrollment = (enrollmentResult.data ?? null) as EnrollmentRow | null;
        message = (messageResult.data ?? null) as MessageRow | null;

        if (approval?.node_id && audit.workflow_id) {
          const nodeResult = await admin
            .from('automation_flow_nodes')
            .select('id,node_key,node_type,label')
            .eq('organization_id', organizationId)
            .eq('workflow_id', audit.workflow_id)
            .eq('version_number', approval.flow_version)
            .eq('id', approval.node_id)
            .maybeSingle();
          if (nodeResult.error) throw nodeResult.error;
          node = (nodeResult.data ?? null) as NodeRow | null;
        }
      }
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load provider audit lineage.';
  }

  if (!audit && !loadError) {
    return (
      <div className="space-y-4">
        <Link href="/automation/audits" className="inline-flex items-center gap-2 text-sm font-bold text-violet-700">
          <ArrowLeft size={15} /> Back to Provider Audits
        </Link>
        <div className="card-pad text-sm text-slate-600">Provider audit not found in the active workspace.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/automation/audits" className="inline-flex items-center gap-2 text-sm font-bold text-violet-700 hover:text-violet-800">
        <ArrowLeft size={15} /> Back to Provider Audits
      </Link>

      <PageHeader
        eyebrow="Automation · Provider audit"
        title="WhatsApp Send Lineage"
        description={`Read-only trace for ${organizationName}. Audit ${shortId(auditId)}.`}
      />

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{loadError}</div>
      ) : null}

      {audit ? (
        <>
          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 text-sm leading-6 text-violet-900">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 shrink-0" size={18} />
              <div><strong>Immutable inspection:</strong> this route only reads the existing lineage. It cannot approve, retry, resend, alter delivery status, or open provider execution.</div>
            </div>
          </div>

          <section className="grid gap-4 md:grid-cols-4">
            <div className="card-pad">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Audit status</div>
              <div className="mt-3"><StatusPill status={audit.status} /></div>
              <div className="mt-2 text-xs text-slate-500">Mode: {audit.request_mode.replaceAll('_', ' ')}</div>
            </div>
            <div className="card-pad">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Customer message</div>
              <div className="mt-2 text-xl font-bold text-slate-950">{audit.customer_message_sent ? 'Sent' : 'Not sent'}</div>
              <div className="mt-1 text-xs text-slate-500">Canonical CRM: {audit.crm_message_id ? 'Recorded' : 'None'}</div>
            </div>
            <div className="card-pad">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Delivery</div>
              <div className="mt-2 text-xl font-bold text-slate-950">{audit.provider_delivery_status || '—'}</div>
              <div className="mt-1 text-xs text-slate-500">Provider webhook state</div>
            </div>
            <div className="card-pad">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Lead</div>
              <div className="mt-2 text-xl font-bold text-slate-950">{lead?.lead_code || shortId(audit.lead_id)}</div>
              <div className="mt-1 text-xs text-slate-500">WhatsApp {maskWhatsApp(contact?.normalized_value ?? null)}{contact?.verified ? ' · verified' : ''}</div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
            <div className="card-pad">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><MessageSquareText size={18} /></div>
                <div>
                  <h2 className="font-bold text-slate-950">Provider → delivery timeline</h2>
                  <p className="mt-1 text-sm text-slate-500">Separate each state transition instead of treating “sent” as delivered.</p>
                </div>
              </div>
              <div className="mt-6 space-y-4">
                <TimelineRow complete={true} title="Provider request prepared" time={audit.prepared_at} detail={`Policy evaluated for ${audit.provider} on ${audit.channel}.`} />
                <TimelineRow complete={Boolean(approval?.decided_at && approval.status === 'approved')} title="Human approval" time={approval?.decided_at ?? null} detail={approval ? `${approval.status.replaceAll('_', ' ')}${approval.decision_reason ? ` · ${approval.decision_reason}` : ''}` : 'No linked approval request.'} />
                <TimelineRow complete={Boolean(audit.sent_at && audit.customer_message_sent)} title="Provider accepted send" time={audit.sent_at} detail={audit.provider_message_id ? `Provider message ${shortId(audit.provider_message_id)}` : audit.provider_error || 'No provider message ID recorded.'} />
                <TimelineRow complete={Boolean(message)} title="Canonical CRM message" time={message?.sent_at ?? null} detail={message ? `${message.message_type}${message.template_key ? ` · template ${message.template_key}` : ''} · ${message.status}` : 'No canonical CRM message linked.'} />
                <TimelineRow complete={Boolean(audit.delivered_at)} title="Delivered" time={audit.delivered_at} detail={audit.delivered_at ? 'Delivery webhook reconciled.' : 'No delivered webhook recorded.'} />
                <TimelineRow complete={Boolean(audit.read_at)} title="Read" time={audit.read_at} detail={audit.read_at ? 'Read webhook reconciled.' : 'No read webhook recorded.'} />
              </div>
            </div>

            <div className="space-y-5">
              <div className="card-pad">
                <div className="flex items-start gap-3">
                  <GitBranch size={18} className="mt-0.5 shrink-0 text-violet-600" />
                  <div>
                    <h2 className="font-bold text-slate-950">Workflow lineage</h2>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex justify-between gap-4"><span className="text-slate-500">Workflow</span><span className="text-right font-semibold text-slate-900">{workflow?.name || shortId(audit.workflow_id)}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-slate-500">Workflow status</span><span>{workflow ? <StatusPill status={workflow.status} /> : '—'}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-slate-500">Flow version</span><span className="font-semibold text-slate-900">{approval?.flow_version ?? enrollment?.flow_version ?? '—'}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-slate-500">Action node</span><span className="text-right font-semibold text-slate-900">{node?.label || shortId(approval?.node_id ?? null)}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-slate-500">Enrollment</span><span className="text-right font-semibold text-slate-900">{shortId(audit.enrollment_id)}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-slate-500">Enrollment state</span><span>{enrollment ? <StatusPill status={enrollment.status} /> : '—'}</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card-pad">
                <div className="flex items-start gap-3">
                  <UserCheck size={18} className="mt-0.5 shrink-0 text-violet-600" />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-slate-950">Approval lineage</h2>
                    {approval ? (
                      <div className="mt-4 space-y-3 text-sm">
                        <div className="flex justify-between gap-4"><span className="text-slate-500">Status</span><StatusPill status={approval.status} /></div>
                        <div className="flex justify-between gap-4"><span className="text-slate-500">Template</span><span className="text-right font-semibold text-slate-900">{approval.template_name || '—'} {approval.template_language ? `(${approval.template_language})` : ''}</span></div>
                        <div className="flex justify-between gap-4"><span className="text-slate-500">Requested</span><span className="text-right text-slate-600">{formatTime(approval.requested_at)}</span></div>
                        <div className="flex justify-between gap-4"><span className="text-slate-500">Decided</span><span className="text-right text-slate-600">{formatTime(approval.decided_at)}</span></div>
                        {approval.decision_reason ? <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{approval.decision_reason}</div> : null}
                      </div>
                    ) : <p className="mt-3 text-sm text-slate-500">No approval request linked.</p>}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-3">
            <JsonPanel title="Policy snapshot" value={audit.policy_snapshot} />
            <JsonPanel title="Block reasons" value={audit.block_reasons} />
            <JsonPanel title="Delivery error" value={audit.delivery_error} />
          </section>

          <section className="card-pad">
            <div className="flex items-start gap-3">
              <FileSearch size={18} className="mt-0.5 shrink-0 text-violet-600" />
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-slate-950">Audit identifiers</h2>
                <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
                  {[
                    ['Audit ID', audit.id],
                    ['Approval ID', audit.approval_request_id],
                    ['CRM message ID', audit.crm_message_id],
                    ['Provider message ID', audit.provider_message_id],
                    ['Enrollment ID', audit.enrollment_id],
                    ['Action run ID', audit.action_run_id],
                    ['Idempotency key', audit.idempotency_key],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="font-bold uppercase tracking-wide text-slate-400">{label}</div>
                      <div className="mt-1 break-all font-mono text-slate-700">{value || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {audit.provider_error || audit.delivery_failed_at ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm leading-6 text-rose-800">
              <div className="flex items-start gap-3">
                <CircleAlert size={18} className="mt-0.5 shrink-0" />
                <div><strong>Failure recorded:</strong> {audit.provider_error || `delivery failed at ${formatTime(audit.delivery_failed_at)}`}</div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
