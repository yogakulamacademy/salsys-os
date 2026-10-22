import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  MessageSquareText,
  Send,
  ShieldCheck,
} from 'lucide-react';

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
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(date);
}
function statusClass(status: string) {
  const value = status.toLowerCase();
  if (['sent','delivered','read','completed','approved'].includes(value)) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (['failed','blocked','rejected','cancelled'].includes(value)) return 'bg-rose-50 text-rose-700 ring-rose-200';
  return 'bg-amber-50 text-amber-700 ring-amber-200';
}
function MetricCard({ label, value, note, icon: Icon, tone }: { label: string; value: number; note: string; icon: React.ComponentType<{ size?: number }>; tone: 'violet'|'emerald'|'rose'|'sky' }) {
  const iconClass = tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : tone === 'rose' ? 'bg-rose-50 text-rose-700' : tone === 'sky' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700';
  return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className={`grid h-10 w-10 place-items-center rounded-xl ${iconClass}`}><Icon size={18}/></div><div className="mt-3 text-xs font-semibold text-slate-500">{label}</div><div className="mt-0.5 text-[28px] font-bold tracking-tight text-slate-950">{value}</div><div className="mt-1 text-[11px] text-slate-500">{note}</div></div>;
}
function TraceStep({ label, time, state = 'done', detail }: { label: string; time: string | null; state?: 'done'|'pending'|'failed'; detail?: string }) {
  const icon = state === 'failed' ? <AlertTriangle size={13}/> : state === 'done' ? <CheckCircle2 size={13}/> : <span className="h-2 w-2 rounded-full bg-slate-300"/>;
  const tone = state === 'failed' ? 'bg-rose-50 text-rose-700' : state === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500';
  return <div className="flex gap-3"><div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${tone}`}>{icon}</div><div className="min-w-0 flex-1 pb-4"><div className="flex items-start justify-between gap-3"><div className="text-xs font-bold text-slate-900">{label}</div><div className="shrink-0 text-[10px] text-slate-400">{formatTime(time)}</div></div>{detail?<div className={`mt-0.5 text-[11px] leading-4 ${state==='failed'?'text-rose-600':'text-slate-500'}`}>{detail}</div>:null}</div></div>;
}

export default async function AutomationAuditsPage({ searchParams }: { searchParams: Promise<{ audit?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="card-pad text-sm text-slate-600">Sign in to inspect provider audits.</div>;

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
        admin.from('automation_provider_send_audits').select('id,workflow_id,lead_id,approval_request_id,request_mode,status,customer_message_sent,provider_delivery_status,prepared_at,sent_at,delivered_at,read_at,provider_error').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(100),
        admin.from('automation_workflows').select('id,name').eq('organization_id',organizationId),
      ]);
      if (auditResult.error || workflowResult.error) throw auditResult.error || workflowResult.error;
      audits = (auditResult.data ?? []) as AuditRow[]; workflows = (workflowResult.data ?? []) as WorkflowRow[];
      const leadIds = Array.from(new Set(audits.map(a=>a.lead_id)));
      if (leadIds.length) { const leadResult = await admin.from('leads').select('id,lead_code').eq('organization_id',organizationId).in('id',leadIds); if (leadResult.error) throw leadResult.error; leads = (leadResult.data ?? []) as LeadRow[]; }
    }
  } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load provider audits.'; }

  const workflowMap = new Map(workflows.map(w=>[w.id,w.name]));
  const leadMap = new Map(leads.map(l=>[l.id,l.lead_code || l.id.slice(0,8)]));
  const sentCount = audits.filter(a=>a.customer_message_sent).length;
  const blockedCount = audits.filter(a=>['blocked','failed'].includes(a.status)).length;
  const deliveredCount = audits.filter(a=>Boolean(a.delivered_at) || ['delivered','read'].includes((a.provider_delivery_status||'').toLowerCase())).length;
  const selected = audits.find(a=>a.id===query.audit) ?? audits[0] ?? null;
  const selectedLead = selected ? leadMap.get(selected.lead_id) || selected.lead_id.slice(0,8) : null;
  const selectedWorkflow = selected?.workflow_id ? workflowMap.get(selected.workflow_id) || selected.workflow_id.slice(0,8) : '—';

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Automation · Provider Health</div><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Provider Audit Explorer</h1><p className="mt-1.5 text-sm text-slate-500">Trace provider decisions for {organizationName} from preparation through delivery.</p></div><Link href="/automation/runs" className="btn-secondary">Execution monitor <ArrowRight size={13}/></Link></header>
      {loadError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">Provider audit data is temporarily unavailable.</div> : null}
      <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3.5"><ShieldCheck className="mt-0.5 shrink-0 text-violet-700" size={17}/><div><div className="text-sm font-bold text-violet-950">Read-only lineage</div><div className="mt-0.5 text-xs leading-5 text-violet-800">Opening an audit never retries a provider call, changes approval state or sends a customer message.</div></div></div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Recent audits" value={audits.length} note="Latest records loaded" icon={FileSearch} tone="violet" />
        <MetricCard label="Customer sends" value={sentCount} note="Audited provider sends" icon={Send} tone="emerald" />
        <MetricCard label="Blocked / failed" value={blockedCount} note="Policy or provider failures" icon={AlertTriangle} tone="rose" />
        <MetricCard label="Delivery confirmations" value={deliveredCount} note="Delivered or read evidence" icon={ShieldCheck} tone="sky" />
      </section>

      <section className={`grid gap-4 ${selected ? 'xl:grid-cols-[minmax(0,1.4fr)_360px]' : ''}`}>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div><h2 className="text-sm font-bold text-slate-950">Audit records <span className="font-semibold text-slate-400">({audits.length})</span></h2><p className="mt-0.5 text-xs text-slate-500">Select a row to inspect its provider timeline.</p></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-400"><th className="px-2 py-2">Lead</th><th className="px-2 py-2">Workflow</th><th className="px-2 py-2">Mode</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Sent</th><th className="px-2 py-2">Delivered</th><th className="px-2 py-2">Read</th><th className="px-2 py-2">Error</th><th className="px-2 py-2 text-right">Detail</th></tr></thead><tbody className="divide-y divide-slate-100">{audits.length===0?<tr><td colSpan={9} className="px-2 py-10 text-center text-slate-500">No provider audits recorded.</td></tr>:audits.map(a=><tr key={a.id} className={`${selected?.id===a.id?'bg-violet-50/60':'hover:bg-slate-50/70'}`}><td className="px-2 py-3 font-semibold text-slate-900">{leadMap.get(a.lead_id)||a.lead_id.slice(0,8)}</td><td className="px-2 py-3 text-slate-600">{a.workflow_id?workflowMap.get(a.workflow_id)||a.workflow_id.slice(0,8):'—'}</td><td className="px-2 py-3 text-slate-600">{a.request_mode.replaceAll('_',' ')}</td><td className="px-2 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${statusClass(a.status)}`}>{a.status.replaceAll('_',' ')}</span></td><td className="px-2 py-3 text-slate-500">{formatTime(a.sent_at)}</td><td className="px-2 py-3 text-slate-500">{formatTime(a.delivered_at)}</td><td className="px-2 py-3 text-slate-500">{formatTime(a.read_at)}</td><td className="max-w-[160px] truncate px-2 py-3 text-rose-600" title={a.provider_error??''}>{a.provider_error||'—'}</td><td className="px-2 py-3 text-right"><Link href={`/automation/audits?audit=${a.id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700">View <ArrowRight size={10}/></Link></td></tr>)}</tbody></table></div>
        </div>

        {selected ? <aside className="rounded-2xl border border-slate-200 bg-white p-4 xl:sticky xl:top-20 xl:self-start">
          <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-slate-950">{selectedLead}</div><div className="mt-0.5 text-xs text-slate-500">{selectedWorkflow}</div></div><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${statusClass(selected.status)}`}>{selected.status.replaceAll('_',' ')}</span></div>
          <div className="mt-4 border-t border-slate-100 pt-4"><div className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Audit trace</div><TraceStep label="Message prepared" time={selected.prepared_at} detail={`Mode: ${selected.request_mode.replaceAll('_',' ')}`} /><TraceStep label="Provider send" time={selected.sent_at} state={selected.sent_at?'done':selected.provider_error?'failed':'pending'} detail={selected.provider_error||undefined}/><TraceStep label="Delivered" time={selected.delivered_at} state={selected.delivered_at?'done':'pending'} detail={selected.provider_delivery_status||undefined}/><TraceStep label="Read" time={selected.read_at} state={selected.read_at?'done':'pending'} /></div>
          <div className={`mt-2 rounded-xl border px-3 py-3 ${selected.customer_message_sent?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-slate-50'}`}><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Result</div><div className={`mt-1 text-sm font-bold ${selected.customer_message_sent?'text-emerald-700':'text-slate-700'}`}>{selected.customer_message_sent?'Customer send recorded':'No customer send recorded'}</div></div>
          <Link href={`/automation/audits/${selected.id}`} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Open full lineage <ArrowRight size={12}/></Link>
        </aside>:null}
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5"><MessageSquareText size={16} className="mt-0.5 shrink-0 text-slate-400"/><div className="text-xs leading-5 text-slate-600">Provider acceptance and customer delivery are separate states. Use the trace to distinguish preparation, send, delivery and read evidence.</div></div>
    </div>
  );
}
