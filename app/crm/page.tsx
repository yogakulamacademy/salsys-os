import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  Clock3,
  Facebook,
  Globe2,
  Inbox,
  Instagram,
  ListChecks,
  MessageCircle,
  Search,
  Sparkles,
  Target,
  UserRoundCheck,
  Users,
} from 'lucide-react';

import { getAdmissionsSnapshot } from '@/lib/admissions-data';
import {
  getDashboardSnapshot,
  type DashboardRevenueSummary,
  type DashboardSource,
} from '@/lib/dashboard-data';

type PriorityRow = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  current_stage: string | null;
  intent: string | null;
  first_touch_source: string | null;
  current_contact_channel: string | null;
  course_name: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  priority_score: number | string | null;
  priority_band: string | null;
  priority_reason: string | null;
  next_best_action: string | null;
  next_followup_due_at: string | null;
  followup_overdue: boolean | null;
  outstanding_balance: number | string | null;
  currency: string | null;
};

type FollowUpRow = {
  task_id: string;
  lead_id: string;
  lead_name: string | null;
  due_at: string | null;
};

type OwnerWorkloadRow = {
  owner_user_id: string | null;
  owner_name: string | null;
  active_leads: number | string | null;
  needs_reply: number | string | null;
  overdue_followups: number | string | null;
  payment_pending: number | string | null;
  critical_priority: number | string | null;
  high_priority: number | string | null;
  action_load: number | string | null;
};

const ACTIVE_STAGE_ORDER = [
  'new',
  'contacted',
  'engaged',
  'qualified',
  'high_intent',
  'payment_pending',
  'enrolled',
] as const;

export default async function CrmCommandCenterPage() {
  const [admissions, dashboard] = await Promise.all([
    getAdmissionsSnapshot(),
    getDashboardSnapshot(),
  ]);

  const priorities = admissions.priorityQueue as PriorityRow[];
  const followups = admissions.followups as FollowUpRow[];
  const ownerWorkload = admissions.ownerWorkload as OwnerWorkloadRow[];

  const now = Date.now();
  const overdueFollowups = followups.filter((row) => {
    if (!row.due_at) return false;
    const due = new Date(row.due_at).getTime();
    return Number.isFinite(due) && due < now;
  });

  const highPriority = priorities.filter((row) =>
    row.priority_band === 'critical' || row.priority_band === 'high'
  );
  const unassignedPriority = highPriority.filter((row) => !row.owner_user_id);
  const needsReply = admissions.needsReplyTotal ?? dashboard.metrics.needsReply;
  const paymentPending = admissions.paymentPending.length || dashboard.metrics.paymentPending;
  const priorityPreview = (highPriority.length ? highPriority : priorities).slice(0, 6);
  const sourceRows = dashboard.sources.slice(0, 5);
  const stageRows = ACTIVE_STAGE_ORDER.map((stage) => ({
    stage,
    count: dashboard.counts[stage] ?? 0,
  }));
  const maxStage = Math.max(1, ...stageRows.map((row) => row.count));
  const actionSignals = needsReply + overdueFollowups.length + paymentPending + unassignedPriority.length;

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#216551]">
            SalsysOS / CRM Operations
          </div>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-[#192E29] dark:text-white">
            Command Center
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#6D7C76] dark:text-slate-400">
            Start with the leads and decisions that need human attention now, then drill into the evidence behind each signal.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/conversations" className="btn-secondary">
            <Inbox size={15} /> Inbox
          </Link>
          <Link href="/admissions" className="btn-primary">
            <Target size={15} /> Open Admissions Desk
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-2xl border border-[#204D3E] bg-[#153E33] px-5 py-6 text-white sm:px-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-emerald-200/10 blur-3xl" />
        <div className="relative grid gap-6 xl:grid-cols-[1.25fr_.75fr] xl:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100">
              <Sparkles size={13} /> Today&apos;s operating brief
            </div>
            <h2 className="mt-4 max-w-3xl text-2xl font-semibold tracking-[-0.03em] sm:text-[28px]">
              {actionSignals > 0
                ? `${actionSignals.toLocaleString('en-IN')} live action signals need review across CRM operations.`
                : 'No urgent CRM action signals are currently recorded.'}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/75">
              Signals are grounded in reply backlog, scheduled follow-ups, payment-stage opportunities and ownership gaps. Recommendations remain human-controlled.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/admissions" className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#DFF1C5] px-3.5 text-xs font-semibold text-[#244535] transition hover:bg-[#D4EBB7]">
                Work priority queue <ArrowRight size={13} />
              </Link>
              <Link href="/follow-ups" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/20 px-3.5 text-xs font-semibold text-white transition hover:bg-white/10">
                Plan follow-ups
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
            <HeroSignal label="Needs reply" value={needsReply} href="/conversations" />
            <HeroSignal label="Overdue tasks" value={overdueFollowups.length} href="/follow-ups" />
            <HeroSignal label="Payment stage" value={paymentPending} href="/pipeline" />
            <HeroSignal label="Unassigned priority" value={unassignedPriority.length} href="/admissions?owner=unassigned" />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ActionCard
          href="/conversations"
          icon={Inbox}
          label="Reply backlog"
          value={needsReply}
          detail={needsReply > 0 ? 'Customers waiting for a human response' : 'No reply backlog recorded'}
          tone={needsReply > 0 ? 'attention' : 'neutral'}
        />
        <ActionCard
          href="/follow-ups"
          icon={Clock3}
          label="Overdue follow-ups"
          value={overdueFollowups.length}
          detail="Confirmed CRM tasks past due"
          tone={overdueFollowups.length > 0 ? 'attention' : 'neutral'}
        />
        <ActionCard
          href="/pipeline"
          icon={CircleDollarSign}
          label="Payment decisions"
          value={paymentPending}
          detail="Payment-stage leads; balance evidence stays separate"
          tone={paymentPending > 0 ? 'money' : 'neutral'}
        />
        <ActionCard
          href="/admissions?owner=unassigned"
          icon={UserRoundCheck}
          label="Ownership gaps"
          value={unassignedPriority.length}
          detail="High-priority leads without an assigned owner"
          tone={unassignedPriority.length > 0 ? 'attention' : 'neutral'}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.8fr)]">
        <div className="overflow-hidden rounded-2xl border border-[#E4EAE6] bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-3 border-b border-[#EAF0EC] px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-900">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#63836C]">Priority intelligence</div>
              <h2 className="mt-1 text-base font-semibold text-[#192E29] dark:text-white">Who should the team act on next?</h2>
              <p className="mt-1 text-xs leading-5 text-[#74877C]">Canonical priority reasons and next-best actions from the CRM read model.</p>
            </div>
            <Link href="/admissions" className="inline-flex items-center gap-1 text-xs font-semibold text-[#216551] hover:underline">
              Full priority desk <ArrowRight size={12} />
            </Link>
          </div>

          {priorityPreview.length ? (
            <div className="divide-y divide-[#EDF2EE] dark:divide-slate-900">
              {priorityPreview.map((row, index) => (
                <PriorityItem key={row.lead_id} row={row} rank={index + 1} />
              ))}
            </div>
          ) : (
            <div className="px-5 py-10">
              <div className="text-sm font-semibold text-[#334B3C] dark:text-slate-100">Priority read model is unavailable or currently empty.</div>
              <p className="mt-1 text-sm leading-6 text-[#74877C]">Use Admissions, Follow-ups and Inbox for the underlying operational queues.</p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-[#E4EAE6] bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="border-b border-[#EAF0EC] px-5 py-4 dark:border-slate-900">
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#63836C]">Team pressure</div>
              <h2 className="mt-1 text-base font-semibold text-[#192E29] dark:text-white">Owner action load</h2>
            </div>
            <div className="p-5">
              {ownerWorkload.length ? (
                <div className="space-y-4">
                  {ownerWorkload.slice(0, 6).map((row) => <OwnerLoad key={row.owner_user_id || row.owner_name || 'unassigned'} row={row} />)}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#DCE5DE] bg-[#FAFCFA] px-4 py-6 text-sm leading-6 text-[#74877C] dark:border-slate-800 dark:bg-slate-900/50">
                  Owner workload is not available in the current snapshot.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[#E4EAE6] bg-[#F7FAF8] p-5 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EAF4ED] text-[#216551]">
                <ListChecks size={16} />
              </span>
              <div>
                <div className="text-sm font-semibold text-[#192E29] dark:text-white">Suggested ≠ scheduled</div>
                <p className="mt-1 text-xs leading-5 text-[#6D7C76]">
                  A recommended next action only becomes accountable work after a human creates or confirms the follow-up task.
                </p>
                <Link href="/follow-ups" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#216551] hover:underline">
                  Manage tasks <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          </section>
        </aside>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-[#E4EAE6] bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-[#EAF0EC] px-5 py-4 dark:border-slate-900">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#63836C]">Acquisition</div>
              <h2 className="mt-1 text-base font-semibold text-[#192E29] dark:text-white">Lead source mix</h2>
              <p className="mt-1 text-xs text-[#74877C]">CRM source labels, not campaign attribution.</p>
            </div>
            <Link href="/leads" className="text-xs font-semibold text-[#216551] hover:underline">Open leads</Link>
          </div>
          <div className="space-y-3 p-5">
            {sourceRows.length ? sourceRows.map((source) => <SourceRow key={source.source} source={source} />) : (
              <EmptyEvidence text="No source distribution is available from the current CRM snapshot." />
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#E4EAE6] bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-[#EAF0EC] px-5 py-4 dark:border-slate-900">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#63836C]">Pipeline</div>
              <h2 className="mt-1 text-base font-semibold text-[#192E29] dark:text-white">Current stage distribution</h2>
              <p className="mt-1 text-xs text-[#74877C]">Present-state counts; not historical conversion rates.</p>
            </div>
            <Link href="/pipeline" className="text-xs font-semibold text-[#216551] hover:underline">Open board</Link>
          </div>
          <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {stageRows.map((row) => (
              <Link key={row.stage} href={`/leads?stage=${row.stage}`} className="rounded-xl border border-[#E8EFE9] bg-[#FAFCFA] p-3 transition hover:border-[#BDD5C3] hover:bg-white dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7C9082]">{pretty(row.stage)}</span>
                  <span className="text-lg font-semibold text-[#192E29] dark:text-white">{row.count}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#EAF0EB] dark:bg-slate-800">
                  <div className="h-full rounded-full bg-[#5C9870]" style={{ width: `${Math.max(3, (row.count / maxStage) * 100)}%` }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#E4EAE6] bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-3 border-b border-[#EAF0EC] px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-900">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#63836C]">Commercial evidence</div>
            <h2 className="mt-1 text-base font-semibold text-[#192E29] dark:text-white">Revenue and balance readiness</h2>
            <p className="mt-1 text-xs text-[#74877C]">Currencies stay separate; CRM stages never stand in for verified payment evidence.</p>
          </div>
          <Link href="/revenue" className="inline-flex items-center gap-1 text-xs font-semibold text-[#216551] hover:underline">
            Revenue workspace <ArrowRight size={12} />
          </Link>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {dashboard.revenueSummary.length ? dashboard.revenueSummary.slice(0, 4).map((row) => <RevenueEvidence key={row.currency} row={row} />) : (
            <div className="sm:col-span-2 xl:col-span-4"><EmptyEvidence text="Verified revenue summary is not available in the current CRM snapshot." /></div>
          )}
        </div>
      </section>
    </div>
  );
}

function HeroSignal({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10">
      <div className="text-[10px] uppercase tracking-[0.08em] text-emerald-100/65">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{value.toLocaleString('en-IN')}</div>
    </Link>
  );
}

function ActionCard({
  href,
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number;
  detail: string;
  tone: 'attention' | 'money' | 'neutral';
}) {
  const iconClass = tone === 'attention'
    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/25 dark:text-amber-300'
    : tone === 'money'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/25 dark:text-emerald-300'
      : 'bg-[#EAF4ED] text-[#216551]';

  return (
    <Link href={href} className="group rounded-2xl border border-[#E4EAE6] bg-white p-4 transition hover:border-[#BFD3C4] hover:bg-[#FCFDFC] dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900/70">
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${iconClass}`}><Icon size={16} /></span>
        <ArrowRight size={14} className="text-[#A9B6AE] transition group-hover:translate-x-0.5 group-hover:text-[#216551]" />
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[#192E29] dark:text-white">{value.toLocaleString('en-IN')}</div>
      <div className="mt-1 text-sm font-semibold text-[#334B3C] dark:text-slate-100">{label}</div>
      <p className="mt-1 text-xs leading-5 text-[#74877C]">{detail}</p>
    </Link>
  );
}

function PriorityItem({ row, rank }: { row: PriorityRow; rank: number }) {
  const reason = row.priority_reason || 'Priority reason is not available from the current read model.';
  const action = row.next_best_action || 'Review lead';
  const score = toNumber(row.priority_score);

  return (
    <div className="grid gap-3 px-5 py-4 transition hover:bg-[#FBFDFB] dark:hover:bg-slate-900/60 lg:grid-cols-[42px_minmax(180px,.9fr)_minmax(260px,1.35fr)_150px_auto] lg:items-center">
      <div className="grid h-9 w-9 place-items-center rounded-xl border border-[#DFE9E1] bg-[#F4F8F3] text-xs font-bold text-[#52735E]">{String(rank).padStart(2, '0')}</div>
      <div className="min-w-0">
        <Link href={`/leads/${row.lead_id}`} className="truncate text-sm font-semibold text-[#192E29] hover:text-[#216551] dark:text-white">
          {row.lead_name || row.lead_code || 'Lead'}
        </Link>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <StageChip value={row.current_stage || 'new'} />
          {row.priority_band ? <BandChip value={row.priority_band} /> : null}
          {score > 0 ? <span className="rounded-md bg-[#F1F4F2] px-1.5 py-0.5 text-[9px] font-semibold text-[#66776E]">{score} priority</span> : null}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#89988F]">Why now</div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5F7467]">{reason}</p>
        <div className="mt-1 text-[11px] font-semibold text-[#216551]">{action}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.08em] text-[#89988F]">Owner</div>
        <div className="mt-1 text-xs font-semibold text-[#334B3C] dark:text-slate-100">{row.owner_name || 'Unassigned'}</div>
        {row.next_followup_due_at ? <div className="mt-1 text-[10px] text-[#7C8D83]">Due {formatDateTime(row.next_followup_due_at)}</div> : null}
      </div>
      <Link href={`/leads/${row.lead_id}`} className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-[#DCE5DE] px-2.5 text-[11px] font-semibold text-[#365644] transition hover:border-[#B7D0BD] hover:bg-[#F3F8F4]">
        Review <ArrowRight size={11} />
      </Link>
    </div>
  );
}

function OwnerLoad({ row }: { row: OwnerWorkloadRow }) {
  const load = toNumber(row.action_load);
  const active = toNumber(row.active_leads);
  const pressure = Math.min(100, active > 0 ? (load / Math.max(active, load)) * 100 : load > 0 ? 100 : 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <div>
          <div className="font-semibold text-[#334B3C] dark:text-slate-100">{row.owner_name || 'Unassigned'}</div>
          <div className="mt-0.5 text-[10px] text-[#84958A]">{active} active · {toNumber(row.needs_reply)} replies · {toNumber(row.overdue_followups)} overdue</div>
        </div>
        <div className="text-sm font-semibold text-[#192E29] dark:text-white">{load}</div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EDF2EE] dark:bg-slate-800">
        <div className="h-full rounded-full bg-[#69A07A]" style={{ width: `${Math.max(load > 0 ? 4 : 0, pressure)}%` }} />
      </div>
    </div>
  );
}

function SourceRow({ source }: { source: DashboardSource }) {
  const Icon = sourceIcon(source.source);
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_minmax(80px,.7fr)_40px] items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#F0F5F1] text-[#52735E]"><Icon size={14} /></span>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-[#334B3C] dark:text-slate-100">{pretty(source.source)}</div>
        <div className="mt-0.5 text-[10px] text-[#89988F]">{source.qualified} qualified</div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#EDF2EE] dark:bg-slate-800">
        <div className="h-full rounded-full bg-[#5C9870]" style={{ width: `${Math.max(4, source.share)}%` }} />
      </div>
      <div className="text-right text-xs font-semibold text-[#192E29] dark:text-white">{source.leads}</div>
    </div>
  );
}

function RevenueEvidence({ row }: { row: DashboardRevenueSummary }) {
  return (
    <div className="rounded-xl border border-[#E8EFE9] bg-[#FAFCFA] p-4 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#7B8F81]">{row.currency}</span>
        <Activity size={14} className="text-[#6E9B79]" />
      </div>
      <div className="mt-3 text-lg font-semibold tracking-[-0.03em] text-[#192E29] dark:text-white">{formatMoney(row.collected, row.currency)}</div>
      <div className="mt-1 text-[10px] text-[#84958A]">verified collected</div>
      <div className="mt-3 flex items-center justify-between border-t border-[#E9EFEA] pt-3 text-[11px] dark:border-slate-800">
        <span className="text-[#74877C]">Outstanding</span>
        <span className="font-semibold text-[#334B3C] dark:text-slate-100">{formatMoney(row.outstanding, row.currency)}</span>
      </div>
    </div>
  );
}

function EmptyEvidence({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#DCE5DE] bg-[#FAFCFA] px-4 py-6 text-sm leading-6 text-[#74877C] dark:border-slate-800 dark:bg-slate-900/50">
      {text}
    </div>
  );
}

function StageChip({ value }: { value: string }) {
  return <span className="rounded-md bg-[#EAF4ED] px-1.5 py-0.5 text-[9px] font-semibold text-[#397052]">{pretty(value)}</span>;
}

function BandChip({ value }: { value: string }) {
  const tone = value === 'critical'
    ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
    : value === 'high'
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
      : 'bg-[#F1F4F2] text-[#66776E]';
  return <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${tone}`}>{pretty(value)}</span>;
}

function sourceIcon(source: string) {
  const value = source.toLowerCase();
  if (value.includes('google') || value.includes('search')) return Search;
  if (value.includes('whatsapp')) return MessageCircle;
  if (value.includes('instagram')) return Instagram;
  if (value.includes('facebook') || value.includes('meta')) return Facebook;
  if (value.includes('website') || value.includes('direct')) return Globe2;
  return Users;
}

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number | string | null | undefined, currency: string) {
  const amount = toNumber(value);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || ''} ${amount.toLocaleString('en-IN')}`.trim();
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
