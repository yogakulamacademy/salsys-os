import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type WorkflowRow = { id: string; name: string; status: string; current_published_version: number | null; runtime_flow_enabled: boolean };
type LeadRow = { id: string; lead_code: string | null };
type EnrollmentRow = { id: string; workflow_id: string; lead_id: string; status: string; attempt_count: number; next_action_at: string | null; last_event_at: string | null; stopped_reason: string | null; metadata: Record<string, unknown> | null; created_at: string; updated_at: string; current_node_id: string | null; flow_version: number };
type JobRow = { id: string; workflow_id: string; enrollment_id: string | null; lead_id: string; job_type: string; status: string; scheduled_for: string; attempt_count: number; max_attempts: number; last_error: string | null; payload: Record<string, unknown> | null; created_at: string };
type ProviderAuditRow = { id: string; workflow_id: string | null; enrollment_id: string | null; lead_id: string; request_mode: string; status: string; block_reasons: unknown; provider_message_id: string | null; provider_error: string | null; customer_message_sent: boolean; prepared_at: string; sent_at: string | null; provider_delivery_status: string | null; delivered_at: string | null; read_at: string | null; delivery_failed_at: string | null };
type RunRow = { id: string; workflow_id: string; lead_id: string | null; status: string; reason: string | null; attempt_no: number; started_at: string | null; completed_at: string | null; error_message: string | null; created_at: string };

function formatTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(date);
}
function shortId(value: string | null) { if (!value) return '—'; return value.length > 13 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value; }
function metadataText(metadata: Record<string, unknown> | null, key: string) { const value = metadata?.[key]; return typeof value === 'string' && value.trim() ? value : null; }
function reasonsText(value: unknown) { if (!Array.isArray(value) || value.length === 0) return '—'; return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).filter(Boolean).slice(0, 3).join(', '); }
function statusClass(status: string) {
  const value = status.toLowerCase();
  if (['completed','sent','delivered','read','active','approved','enrolled'].includes(value)) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (['failed','error','blocked','rejected','cancelled','stopped','not_eligible'].includes(value)) return 'bg-rose-50 text-rose-700 ring-rose-200';
  if (['scheduled','waiting','pending','claimed','paused','awaiting_approval','ready'].includes(value)) return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}
function StatusPill({ status }: { status: string }) { return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${statusClass(status)}`}>{status.replaceAll('_',' ')}</span>; }
function MetricCard({ label, value, note, icon: Icon, tone }: { label: string; value: number; note: string; icon: React.ComponentType<{ size?: number }>; tone: 'violet'|'amber'|'emerald'|'sky' }) {
  const iconClass = tone === 'amber' ? 'bg-amber-50 text-amber-700' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : tone === 'sky' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700';
  return <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className={`grid h-10 w-10 place-items-center rounded-xl ${iconClass}`}><Icon size={18}/></div><div className="mt-3 text-xs font-semibold text-slate-500">{label}</div><div className="mt-0.5 text-[28px] font-bold tracking-tight text-slate-950">{value}</div><div className="mt-1 text-[11px] text-slate-500">{note}</div></div>;
}

export default async function AutomationRunsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div className="card-pad text-sm text-slate-600">Sign in to inspect automation runtime activity.</div>;

  let organizationName = 'Current organization';
  let workflows: WorkflowRow[] = [];
  let enrollments: EnrollmentRow[] = [];
  let jobs: JobRow[] = [];
  let audits: ProviderAuditRow[] = [];
  let runs: RunRow[] = [];
  let leads: LeadRow[] = [];
  let totalRuns = 0, activeEnrollments = 0, pendingJobs = 0, customerMessagesSent = 0;
  let loadError: string | null = null;

  try {
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = workspace.activeOrganizationId;
    organizationName = workspace.activeWorkspace?.organizationName || organizationName;
    if (organizationId) {
      const admin = createAdminClient();
      const [workflowResult,enrollmentResult,jobResult,auditResult,runResult,totalRunsResult,activeEnrollmentResult,pendingJobResult,sentResult] = await Promise.all([
        admin.from('automation_workflows').select('id,name,status,current_published_version,runtime_flow_enabled').eq('organization_id', organizationId).order('updated_at',{ascending:false}),
        admin.from('automation_enrollments').select('id,workflow_id,lead_id,status,attempt_count,next_action_at,last_event_at,stopped_reason,metadata,created_at,updated_at,current_node_id,flow_version').eq('organization_id',organizationId).order('updated_at',{ascending:false}).limit(50),
        admin.from('automation_scheduled_jobs').select('id,workflow_id,enrollment_id,lead_id,job_type,status,scheduled_for,attempt_count,max_attempts,last_error,payload,created_at').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(50),
        admin.from('automation_provider_send_audits').select('id,workflow_id,enrollment_id,lead_id,request_mode,status,block_reasons,provider_message_id,provider_error,customer_message_sent,prepared_at,sent_at,provider_delivery_status,delivered_at,read_at,delivery_failed_at').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(50),
        admin.from('automation_runs').select('id,workflow_id,lead_id,status,reason,attempt_no,started_at,completed_at,error_message,created_at').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(50),
        admin.from('automation_runs').select('id',{count:'exact',head:true}).eq('organization_id',organizationId),
        admin.from('automation_enrollments').select('id',{count:'exact',head:true}).eq('organization_id',organizationId).eq('status','active'),
        admin.from('automation_scheduled_jobs').select('id',{count:'exact',head:true}).eq('organization_id',organizationId).in('status',['scheduled','claimed']),
        admin.from('automation_provider_send_audits').select('id',{count:'exact',head:true}).eq('organization_id',organizationId).eq('customer_message_sent',true),
      ]);
      const firstError = [workflowResult.error,enrollmentResult.error,jobResult.error,auditResult.error,runResult.error,totalRunsResult.error,activeEnrollmentResult.error,pendingJobResult.error,sentResult.error].find(Boolean);
      if (firstError) throw firstError;
      workflows = (workflowResult.data ?? []) as WorkflowRow[]; enrollments = (enrollmentResult.data ?? []) as EnrollmentRow[]; jobs = (jobResult.data ?? []) as JobRow[]; audits = (auditResult.data ?? []) as ProviderAuditRow[]; runs = (runResult.data ?? []) as RunRow[];
      totalRuns = totalRunsResult.count ?? 0; activeEnrollments = activeEnrollmentResult.count ?? 0; pendingJobs = pendingJobResult.count ?? 0; customerMessagesSent = sentResult.count ?? 0;
      const leadIds = Array.from(new Set([...enrollments.map(r=>r.lead_id),...jobs.map(r=>r.lead_id),...audits.map(r=>r.lead_id),...runs.map(r=>r.lead_id).filter((id):id is string=>Boolean(id))].filter(Boolean)));
      if (leadIds.length) { const leadResult = await admin.from('leads').select('id,lead_code').eq('organization_id',organizationId).in('id',leadIds); if (leadResult.error) throw leadResult.error; leads = (leadResult.data ?? []) as LeadRow[]; }
    }
  } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load runtime monitor.'; }

  const workflowMap = new Map(workflows.map(w=>[w.id,w])); const leadMap = new Map(leads.map(l=>[l.id,l]));
  const workflowName = (id:string|null)=>(id ? workflowMap.get(id)?.name || shortId(id) : '—');
  const leadName = (id:string|null)=> id ? leadMap.get(id)?.lead_code || shortId(id) : '—';

  return (
    <div className="space-y-5">
      <header>
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Automation · Observability</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Runtime Monitor</h1>
        <p className="mt-1.5 text-sm text-slate-500">Inspect flow execution, scheduled jobs and provider outcomes for {organizationName}.</p>
      </header>
      {loadError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">Runtime data is temporarily unavailable.</div> : null}
      <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3.5"><ShieldCheck className="mt-0.5 shrink-0 text-violet-700" size={17}/><div><div className="text-sm font-bold text-violet-950">Read-only operational view</div><div className="mt-0.5 text-xs leading-5 text-violet-800">Use this page to understand what happened. Runtime activation, approvals and provider controls are changed elsewhere.</div></div></div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Automation runs" value={totalRuns} note="Trigger decision records" icon={Activity} tone="violet" />
        <MetricCard label="Active enrollments" value={activeEnrollments} note="Currently in published flows" icon={Workflow} tone="amber" />
        <MetricCard label="Pending jobs" value={pendingJobs} note="Scheduled or claimed" icon={Clock3} tone="emerald" />
        <MetricCard label="Customer messages sent" value={customerMessagesSent} note="Provider-audited sends" icon={MessageSquareText} tone="sky" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div><h2 className="text-sm font-bold text-slate-950">Workflow runtime posture</h2><p className="mt-0.5 text-xs text-slate-500">Published version and runtime eligibility by workflow.</p></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-400"><th className="px-2 py-2">Workflow</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Published</th><th className="px-2 py-2">Runtime</th></tr></thead><tbody className="divide-y divide-slate-100">{workflows.length===0?<tr><td colSpan={4} className="px-2 py-8 text-center text-slate-500">No workflows found.</td></tr>:workflows.slice(0,8).map(w=><tr key={w.id} className="hover:bg-slate-50/70"><td className="px-2 py-3 font-semibold text-slate-900">{w.name}</td><td className="px-2 py-3"><StatusPill status={w.status}/></td><td className="px-2 py-3 text-slate-600">{w.current_published_version?`v${w.current_published_version}`:'—'}</td><td className="px-2 py-3"><StatusPill status={w.runtime_flow_enabled?'active':'disabled'}/></td></tr>)}</tbody></table></div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div><h2 className="text-sm font-bold text-slate-950">Recent flow enrollments</h2><p className="mt-0.5 text-xs text-slate-500">Latest lead journeys through published versions.</p></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-400"><th className="px-2 py-2">Lead</th><th className="px-2 py-2">Workflow</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Flow</th><th className="px-2 py-2">Updated</th></tr></thead><tbody className="divide-y divide-slate-100">{enrollments.length===0?<tr><td colSpan={5} className="px-2 py-8 text-center text-slate-500">No enrollments yet.</td></tr>:enrollments.slice(0,10).map(r=><tr key={r.id} className="hover:bg-slate-50/70"><td className="px-2 py-3 font-semibold text-slate-900">{leadName(r.lead_id)}</td><td className="px-2 py-3 text-slate-600">{workflowName(r.workflow_id)}</td><td className="px-2 py-3"><StatusPill status={r.status}/></td><td className="px-2 py-3 text-slate-600">v{r.flow_version}</td><td className="px-2 py-3 text-slate-500">{formatTime(r.updated_at)}</td></tr>)}</tbody></table></div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div><h2 className="text-sm font-bold text-slate-950">Scheduled runtime jobs</h2><p className="mt-0.5 text-xs text-slate-500">Upcoming and recently processed wait/resume jobs.</p></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-400"><th className="px-2 py-2">Job</th><th className="px-2 py-2">Workflow</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Scheduled</th><th className="px-2 py-2">Error</th></tr></thead><tbody className="divide-y divide-slate-100">{jobs.length===0?<tr><td colSpan={5} className="px-2 py-8 text-center text-slate-500">No scheduled jobs.</td></tr>:jobs.slice(0,10).map(r=><tr key={r.id} className="hover:bg-slate-50/70"><td className="px-2 py-3 font-semibold text-slate-900">{r.job_type.replaceAll('_',' ')}</td><td className="px-2 py-3 text-slate-600">{workflowName(r.workflow_id)}</td><td className="px-2 py-3"><StatusPill status={r.status}/></td><td className="px-2 py-3 text-slate-500">{formatTime(r.scheduled_for)}</td><td className="max-w-[180px] truncate px-2 py-3 text-rose-600" title={r.last_error ?? ''}>{r.last_error || '—'}</td></tr>)}</tbody></table></div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div><h2 className="text-sm font-bold text-slate-950">WhatsApp provider audit</h2><p className="mt-0.5 text-xs text-slate-500">Latest prepared sends, blocks and delivery states.</p></div>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-400"><th className="px-2 py-2">Lead</th><th className="px-2 py-2">Workflow</th><th className="px-2 py-2">Mode</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Delivery</th><th className="px-2 py-2">Issue</th></tr></thead><tbody className="divide-y divide-slate-100">{audits.length===0?<tr><td colSpan={6} className="px-2 py-8 text-center text-slate-500">No provider audit rows.</td></tr>:audits.slice(0,10).map(r=>{const issue=r.provider_error||reasonsText(r.block_reasons);return <tr key={r.id} className="hover:bg-slate-50/70"><td className="px-2 py-3 font-semibold text-slate-900">{leadName(r.lead_id)}</td><td className="px-2 py-3 text-slate-600">{workflowName(r.workflow_id)}</td><td className="px-2 py-3 text-slate-600">{r.request_mode.replaceAll('_',' ')}</td><td className="px-2 py-3"><StatusPill status={r.status}/></td><td className="px-2 py-3 text-slate-600">{r.provider_delivery_status||'—'}</td><td className="max-w-[180px] truncate px-2 py-3 text-slate-500" title={issue}>{issue}</td></tr>})}</tbody></table></div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div><h2 className="text-sm font-bold text-slate-950">Trigger decision runs</h2><p className="mt-0.5 text-xs text-slate-500">Latest workflow decisions and failures.</p></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wide text-slate-400"><th className="px-2 py-2">Run</th><th className="px-2 py-2">Workflow</th><th className="px-2 py-2">Lead</th><th className="px-2 py-2">Decision</th><th className="px-2 py-2">Evaluated</th><th className="px-2 py-2">Reason / error</th></tr></thead><tbody className="divide-y divide-slate-100">{runs.length===0?<tr><td colSpan={6} className="px-2 py-8 text-center text-slate-500">No trigger runs yet.</td></tr>:runs.slice(0,15).map(r=><tr key={r.id} className="hover:bg-slate-50/70"><td className="px-2 py-3 font-mono text-[10px] text-slate-500">{shortId(r.id)}</td><td className="px-2 py-3 font-semibold text-slate-900">{workflowName(r.workflow_id)}</td><td className="px-2 py-3 text-slate-600">{leadName(r.lead_id)}</td><td className="px-2 py-3"><StatusPill status={r.status}/></td><td className="px-2 py-3 text-slate-500">{formatTime(r.started_at||r.created_at)}</td><td className="max-w-[320px] truncate px-2 py-3 text-slate-500" title={r.error_message||r.reason||''}>{r.error_message||r.reason||'—'}</td></tr>)}</tbody></table></div>
      </section>

      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${customerMessagesSent===0?'border-emerald-200 bg-emerald-50/70':'border-amber-200 bg-amber-50/70'}`}>
        {customerMessagesSent===0?<CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={17}/>:<AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={17}/>}<div><div className="text-sm font-bold text-slate-900">{customerMessagesSent===0?'No audited customer sends yet':`${customerMessagesSent} audited customer message${customerMessagesSent===1?'':'s'} sent`}</div><div className="mt-0.5 text-xs leading-5 text-slate-600">Review provider evidence before changing rollout gates.</div></div>
      </div>
    </div>
  );
}
