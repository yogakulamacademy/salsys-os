import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  CircleDollarSign,
  Clock3,
  Flame,
  Inbox,
  MessageSquareMore,
  RotateCcw,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react';

import {
  completeFollowUpAction,
  snoozeFollowUpAction,
} from '@/app/actions/crm';
import { SubmitButton } from '@/components/submit-button';
import { Notice, PageHeader, StageBadge } from '@/components/ui';
import { getAdmissionsSnapshot } from '@/lib/admissions-data';
import {
  getFollowUpsWorkspace,
  type FollowUpsWorkspaceTask,
} from '@/lib/followups-data';
import { opportunityStageLabel } from '@/lib/crm/canonical-metrics';

type Tab = 'priority' | 'reply' | 'followups' | 'payment';

type PriorityRow = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  current_stage: string | null;
  intent: string | null;
  first_touch_source: string | null;
  current_contact_channel: string | null;
  course_name: string | null;
  preferred_location: string | null;
  priority_score: number | string | null;
  priority_band: string | null;
  priority_reason: string | null;
  next_best_action: string | null;
  next_followup_due_at: string | null;
  owner_name: string | null;
};

type PaymentRow = {
  lead_id: string;
  lead_name: string | null;
  current_stage: string | null;
  currency: string | null;
  outstanding_balance: number | string | null;
  payment_status: string | null;
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function WorkQueuePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const tab = parseTab(one(params.tab));
  const page = positiveInteger(one(params.page), 1);

  const [admissions, followups] = await Promise.all([
    getAdmissionsSnapshot(),
    getFollowUpsWorkspace({ page, pageSize: 50 }),
  ]);

  const priorityRows = admissions.priorityQueue as PriorityRow[];
  const paymentRows = admissions.paymentPending as PaymentRow[];
  const now = Date.now();
  const overdue = followups.tasks
    .filter((task) => new Date(task.dueAt).getTime() < now)
    .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime());
  const paymentTasks = followups.tasks.filter((task) => task.taskType === 'payment_check');
  const needsReply = admissions.needsReplyTotal ?? 0;
  const unread = admissions.unreadTotal ?? 0;
  const critical = priorityRows.filter((row) => String(row.priority_band || '').toLowerCase() === 'critical');
  const high = priorityRows.filter((row) => String(row.priority_band || '').toLowerCase() === 'high');
  const unassignedPriority = priorityRows.filter((row) => !row.owner_name).length;
  const oldestOverdue = overdue[0] ?? null;
  const queueOrder = buildQueueOrder({
    needsReply,
    overdueCount: overdue.length,
    criticalCount: critical.length,
    paymentCount: Math.max(paymentRows.length, paymentTasks.length),
    priorityCount: priorityRows.length,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales · Work Queue"
        title="Work Queue"
        description="One action surface for priority opportunities, replies, follow-ups and payment checks. The queue brief explains what should be worked first and why."
        actions={
          <Link href="/conversations" className="btn-primary">
            <Inbox size={15} /> Open Inbox
          </Link>
        }
      />

      {followups.warning ? (
        <Notice tone="warning" title="Follow-up queue loaded with a fallback path">
          {followups.warning}
        </Notice>
      ) : null}

      <QueueBrief
        queueOrder={queueOrder}
        criticalCount={critical.length}
        highCount={high.length}
        unassignedPriority={unassignedPriority}
        oldestOverdue={oldestOverdue}
        unread={unread}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QueueMetric
          icon={<Sparkles size={16} />}
          label="Priority opportunities"
          value={priorityRows.length}
          note={`${critical.length} critical · ${high.length} high`}
          href="/work-queue?tab=priority"
          active={tab === 'priority'}
        />
        <QueueMetric
          icon={<MessageSquareMore size={16} />}
          label="Needs reply"
          value={needsReply}
          note={unread > 0 ? `${unread} unread inbound` : 'Admissions-scoped conversations'}
          href="/work-queue?tab=reply"
          active={tab === 'reply'}
          tone="attention"
        />
        <QueueMetric
          icon={<CalendarClock size={16} />}
          label="Overdue follow-ups"
          value={overdue.length}
          note={oldestOverdue ? `Oldest overdue ${formatAge(oldestOverdue.dueAt)}` : 'No overdue scheduled action'}
          href="/work-queue?tab=followups"
          active={tab === 'followups'}
          tone="attention"
        />
        <QueueMetric
          icon={<CircleDollarSign size={16} />}
          label="Payment attention"
          value={Math.max(paymentRows.length, paymentTasks.length)}
          note={`${paymentRows.length} payment-stage · ${paymentTasks.length} verification task${paymentTasks.length === 1 ? '' : 's'}`}
          href="/work-queue?tab=payment"
          active={tab === 'payment'}
          tone="money"
        />
      </section>

      <QueueTabs active={tab} />

      {tab === 'priority' ? <PriorityQueue rows={priorityRows} /> : null}
      {tab === 'reply' ? <ReplyQueue count={needsReply} unread={unread} /> : null}
      {tab === 'followups' ? <FollowUpQueue tasks={followups.tasks} page={followups.pagination.page} totalPages={followups.pagination.totalPages} /> : null}
      {tab === 'payment' ? <PaymentQueue rows={paymentRows} tasks={paymentTasks} /> : null}
    </div>
  );
}

function QueueBrief({
  queueOrder,
  criticalCount,
  highCount,
  unassignedPriority,
  oldestOverdue,
  unread,
}: {
  queueOrder: QueueOrder;
  criticalCount: number;
  highCount: number;
  unassignedPriority: number;
  oldestOverdue: FollowUpsWorkspaceTask | null;
  unread: number;
}) {
  return (
    <section className="grid gap-4 rounded-panel border border-line bg-surface p-5 shadow-xs xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)] xl:items-center">
      <div>
        <div className="eyebrow">Queue brief</div>
        <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-copy-strong">{queueOrder.headline}</h2>
        <p className="mt-2 max-w-3xl text-[12px] leading-6 text-copy-muted">{queueOrder.detail}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={queueOrder.href} className="btn-primary">
            {queueOrder.action} <ArrowRight size={13} />
          </Link>
          <Link href="/work-queue/team" className="btn-secondary">
            <UserRoundCheck size={14} /> Team priority
          </Link>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <BriefEvidence
          icon={<Flame size={14} />}
          label="Ranked severity"
          value={`${criticalCount} critical · ${highCount} high`}
          note="Existing priority bands only"
          attention={criticalCount > 0}
        />
        <BriefEvidence
          icon={<UserRoundCheck size={14} />}
          label="Ownership gap"
          value={`${unassignedPriority.toLocaleString('en-IN')} unassigned`}
          note="Within the ranked queue"
          attention={unassignedPriority > 0}
        />
        <BriefEvidence
          icon={<Clock3 size={14} />}
          label="Oldest overdue"
          value={oldestOverdue ? formatAge(oldestOverdue.dueAt) : 'None'}
          note={oldestOverdue ? oldestOverdue.title : 'No overdue scheduled task'}
          attention={Boolean(oldestOverdue)}
        />
        <BriefEvidence
          icon={<Inbox size={14} />}
          label="Unread inbound"
          value={unread.toLocaleString('en-IN')}
          note="Conversation attention signal"
          attention={unread > 0}
        />
      </div>
    </section>
  );
}

function BriefEvidence({
  icon,
  label,
  value,
  note,
  attention = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  attention?: boolean;
}) {
  return (
    <div className={`rounded-ui border p-3.5 ${attention ? 'border-amber-200 bg-amber-50/50' : 'border-line bg-surface-soft/70'}`}>
      <div className="flex items-center justify-between gap-3 text-copy-subtle">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-[13px] font-semibold text-copy-strong">{value}</div>
      <div className="mt-1 line-clamp-1 text-[10px] text-copy-subtle">{note}</div>
    </div>
  );
}

function QueueTabs({ active }: { active: Tab }) {
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'priority', label: 'Priority', icon: <Sparkles size={14} /> },
    { id: 'reply', label: 'Needs Reply', icon: <MessageSquareMore size={14} /> },
    { id: 'followups', label: 'Follow-ups', icon: <CalendarClock size={14} /> },
    { id: 'payment', label: 'Payment', icon: <CircleDollarSign size={14} /> },
  ];

  return (
    <nav className="flex flex-wrap gap-1 rounded-panel border border-line bg-surface p-1.5 shadow-xs" aria-label="Work queue views">
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <Link
            key={tab.id}
            href={tab.id === 'priority' ? '/work-queue' : `/work-queue?tab=${tab.id}`}
            aria-current={selected ? 'page' : undefined}
            className={`inline-flex min-h-9 items-center gap-2 rounded-ui px-3 text-[12px] font-semibold transition ${selected ? 'bg-brand-50 text-brand-700' : 'text-copy-muted hover:bg-surface-soft hover:text-copy-strong'}`}
          >
            {tab.icon} {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function PriorityQueue({ rows }: { rows: PriorityRow[] }) {
  return (
    <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <div className="eyebrow">Decision queue</div>
          <h2 className="section-title mt-1">Highest-value next decisions</h2>
          <p className="mt-1 text-[12px] text-copy-subtle">Priority is explainable CRM evidence, not an automatic stage change or message.</p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-700">{rows.length.toLocaleString('en-IN')} ranked</span>
      </div>

      <div className="divide-y divide-line">
        {rows.slice(0, 50).map((row, index) => (
          <article key={row.lead_id} className="grid gap-3 px-5 py-4 hover:bg-surface-soft lg:grid-cols-[54px_minmax(210px,1fr)_130px_minmax(260px,1.35fr)_185px_auto] lg:items-center">
            <div>
              <div className="text-[12px] font-semibold text-brand-700">{String(index + 1).padStart(2, '0')}</div>
              <PriorityPill band={row.priority_band} score={row.priority_score} />
            </div>
            <div className="min-w-0">
              <Link href={`/leads/${row.lead_id}`} className="truncate text-[13px] font-semibold text-copy-strong hover:text-brand-700">
                {row.lead_name || row.lead_code || 'Opportunity'}
              </Link>
              <div className="mt-1 truncate text-[11px] text-copy-subtle">
                {[row.course_name, row.preferred_location, row.first_touch_source].filter(Boolean).join(' · ') || 'Commercial context incomplete'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-copy-subtle">Stage</div>
              <div className="mt-1 text-[12px] font-medium text-copy-muted">{opportunityStageLabel(row.current_stage)}</div>
              <div className="mt-1 text-[10px] text-copy-subtle">{pretty(row.intent || 'unknown')} intent</div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-copy-subtle">Why now</div>
              <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-copy-muted">{row.priority_reason || 'Current CRM state indicates this opportunity deserves review.'}</div>
            </div>
            <div>
              <div className="text-[10px] text-copy-subtle">Recommended action</div>
              <div className="mt-1 text-[12px] font-semibold text-copy-strong">{row.next_best_action || 'Review opportunity'}</div>
              <div className="mt-1 text-[10px] text-copy-subtle">{row.owner_name || 'Unassigned'}{row.next_followup_due_at ? ` · ${followupTiming(row.next_followup_due_at)}` : ''}</div>
            </div>
            <Link href={`/leads/${row.lead_id}`} className="inline-flex h-8 items-center gap-1.5 rounded-ui border border-line bg-surface px-2.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-50">
              Review <ArrowRight size={12} />
            </Link>
          </article>
        ))}

        {!rows.length ? (
          <div className="flex items-center gap-3 px-5 py-8 text-[13px] text-copy-muted">
            <Check size={18} className="text-emerald-600" /> No opportunities currently require ranked review.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PriorityPill({ band, score }: { band: string | null; score: number | string | null }) {
  const normalized = String(band || '').toLowerCase();
  const className = normalized === 'critical'
    ? 'bg-rose-50 text-rose-700'
    : normalized === 'high'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-surface-soft text-copy-subtle';
  const scoreValue = Number(score);

  return (
    <span className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${className}`}>
      {normalized ? pretty(normalized) : 'Ranked'}{Number.isFinite(scoreValue) ? ` · ${scoreValue}` : ''}
    </span>
  );
}

function ReplyQueue({ count, unread }: { count: number; unread: number }) {
  return (
    <section className="rounded-panel border border-line bg-surface p-5 shadow-xs">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-center">
        <div>
          <div className="eyebrow">Conversation attention</div>
          <h2 className="section-title mt-1">{count.toLocaleString('en-IN')} conversations need a reply</h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-copy-muted">
            The Admissions snapshot currently exposes a trustworthy aggregate count here. Record-level conversation ownership and unread state remain canonical in Inbox, so this queue deep-links there instead of reconstructing a second message list.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700">{count} need reply</span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">{unread} unread</span>
          </div>
        </div>
        <div className="rounded-panel border border-line bg-surface-soft p-4">
          <div className="text-[11px] font-semibold text-copy-strong">Canonical action</div>
          <p className="mt-1 text-[11px] leading-5 text-copy-subtle">Open Inbox to work the actual conversation thread, ownership and reply state.</p>
          <Link href="/conversations" className="btn-primary mt-4 w-full justify-center">
            <Inbox size={14} /> Open reply queue
          </Link>
        </div>
      </div>
    </section>
  );
}

function FollowUpQueue({ tasks, page, totalPages }: { tasks: FollowUpsWorkspaceTask[]; page: number; totalPages: number }) {
  return (
    <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <div className="eyebrow">Scheduled actions</div>
          <h2 className="section-title mt-1">Follow-ups</h2>
          <p className="mt-1 text-[12px] text-copy-subtle">Complete or reschedule the same persisted tasks that previously lived on a separate page.</p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-700">Page {page} of {totalPages}</span>
      </div>

      <div className="divide-y divide-line">
        {tasks.map((task) => (
          <FollowUpRow key={task.id} task={task} />
        ))}
        {!tasks.length ? (
          <div className="flex items-center gap-3 px-5 py-8 text-[13px] text-copy-muted">
            <Check size={18} className="text-emerald-600" /> No scheduled actions are due in this queue.
          </div>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          {page > 1 ? <Link className="btn-secondary" href={`/work-queue?tab=followups&page=${page - 1}`}>Previous</Link> : null}
          {page < totalPages ? <Link className="btn-secondary" href={`/work-queue?tab=followups&page=${page + 1}`}>Next</Link> : null}
        </div>
      ) : null}
    </section>
  );
}

function FollowUpRow({ task }: { task: FollowUpsWorkspaceTask }) {
  return (
    <article className="grid gap-3 px-5 py-4 hover:bg-surface-soft lg:grid-cols-[42px_minmax(220px,1fr)_170px_minmax(220px,1fr)_auto] lg:items-center">
      <form action={completeFollowUpAction}>
        <input type="hidden" name="task_id" value={task.id} />
        <input type="hidden" name="lead_id" value={task.leadId} />
        <SubmitButton pendingLabel="" aria-label={`Complete task for ${task.leadName}`} className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-copy-muted hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700">
          <Check size={14} />
        </SubmitButton>
      </form>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/leads/${task.leadId}`} className="truncate text-[13px] font-semibold text-copy-strong hover:text-brand-700">{task.leadName}</Link>
          <StageBadge stage={task.stage} />
        </div>
        <div className="mt-1 text-[12px] text-copy-muted">{task.title}</div>
      </div>

      <div>
        <div className="text-[10px] text-copy-subtle">Due</div>
        <div className="mt-1 flex items-center gap-1.5 text-[12px] font-medium text-copy-muted"><Clock3 size={13} /> {formatDateTime(task.dueAt)}</div>
      </div>

      <form action={snoozeFollowUpAction} className="flex items-center gap-2">
        <input type="hidden" name="task_id" value={task.id} />
        <RotateCcw size={13} className="text-copy-subtle" />
        <input type="datetime-local" name="due_at" required className="input h-8 min-h-8 flex-1 px-2 text-[11px]" aria-label={`New task time for ${task.leadName}`} />
        <SubmitButton pendingLabel="Saving..." className="btn-secondary h-8 min-h-8 px-2.5 text-[11px]">Reschedule</SubmitButton>
      </form>

      <Link href={`/conversations?lead=${task.leadId}`} className="inline-flex h-8 items-center gap-1.5 rounded-ui border border-line bg-surface px-2.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-50">
        Conversation <ArrowRight size={12} />
      </Link>
    </article>
  );
}

function PaymentQueue({ rows, tasks }: { rows: PaymentRow[]; tasks: FollowUpsWorkspaceTask[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
        <div className="border-b border-line px-5 py-4">
          <div className="eyebrow">Commercial stage</div>
          <h2 className="section-title mt-1">Payment-pending opportunities</h2>
          <p className="mt-1 text-[12px] text-copy-subtle">Opportunities whose CRM stage is currently payment pending.</p>
        </div>
        <div className="divide-y divide-line">
          {rows.slice(0, 40).map((row) => (
            <Link key={row.lead_id} href={`/leads/${row.lead_id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface-soft">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><CircleDollarSign size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-copy-strong">{row.lead_name || 'Opportunity'}</span>
                <span className="mt-0.5 block text-[11px] text-copy-subtle">{opportunityStageLabel(row.current_stage)}</span>
              </span>
              <span className="text-right">
                <span className="block text-[12px] font-semibold text-copy-strong">{formatMoney(row.outstanding_balance, row.currency)}</span>
                <span className="block text-[10px] text-copy-subtle">outstanding</span>
              </span>
              <ArrowRight size={13} className="text-copy-subtle" />
            </Link>
          ))}
          {!rows.length ? <EmptyRow text="No opportunities are currently in payment pending." /> : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-xs">
        <div className="border-b border-line px-5 py-4">
          <div className="eyebrow">Verification tasks</div>
          <h2 className="section-title mt-1">Payment checks</h2>
          <p className="mt-1 text-[12px] text-copy-subtle">Persisted tasks that specifically require payment verification.</p>
        </div>
        <div className="divide-y divide-line">
          {tasks.slice(0, 40).map((task) => (
            <div key={task.id} className="flex items-center gap-3 px-5 py-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-700"><AlertTriangle size={15} /></span>
              <span className="min-w-0 flex-1">
                <Link href={`/leads/${task.leadId}`} className="block truncate text-[13px] font-semibold text-copy-strong hover:text-brand-700">{task.leadName}</Link>
                <span className="mt-0.5 block text-[11px] text-copy-subtle">{task.title}</span>
              </span>
              <Link href={`/leads/${task.leadId}`} className="btn-secondary h-8 min-h-8 px-2.5 text-[11px]">Review</Link>
            </div>
          ))}
          {!tasks.length ? <EmptyRow text="No payment verification tasks are currently due." /> : null}
        </div>
      </section>
    </div>
  );
}

function QueueMetric({
  icon,
  label,
  value,
  note,
  href,
  active,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
  href: string;
  active: boolean;
  tone?: 'neutral' | 'attention' | 'money';
}) {
  const toneClass = tone === 'attention'
    ? 'text-rose-700'
    : tone === 'money'
      ? 'text-amber-700'
      : 'text-brand-700';

  return (
    <Link href={href} className={`rounded-panel border bg-surface p-4 shadow-xs transition hover:border-line-strong hover:shadow-sm ${active ? 'border-brand-200 ring-1 ring-brand-100' : 'border-line'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-copy-muted">{label}</span>
        <span className={toneClass}>{icon}</span>
      </div>
      <div className="mt-2 text-[28px] font-semibold tracking-tight text-copy-strong">{value.toLocaleString('en-IN')}</div>
      <div className="mt-1 text-[10px] leading-4 text-copy-subtle">{note}</div>
    </Link>
  );
}

type QueueOrder = {
  headline: string;
  detail: string;
  href: string;
  action: string;
};

function buildQueueOrder({
  needsReply,
  overdueCount,
  criticalCount,
  paymentCount,
  priorityCount,
}: {
  needsReply: number;
  overdueCount: number;
  criticalCount: number;
  paymentCount: number;
  priorityCount: number;
}): QueueOrder {
  if (needsReply > 0) {
    return {
      headline: `Start with ${needsReply.toLocaleString('en-IN')} conversations waiting for a reply.`,
      detail: 'Inbound customer attention is the strongest immediate queue signal because the conversation is already waiting on the team. After replies, clear overdue commitments before working lower-urgency ranked reviews.',
      href: '/work-queue?tab=reply',
      action: 'Work replies first',
    };
  }
  if (overdueCount > 0) {
    return {
      headline: `Clear ${overdueCount.toLocaleString('en-IN')} overdue follow-ups next.`,
      detail: 'These are persisted commitments whose due time has already passed. Work the oldest overdue item first, then return to critical ranked opportunities.',
      href: '/work-queue?tab=followups',
      action: 'Clear overdue work',
    };
  }
  if (criticalCount > 0) {
    return {
      headline: `${criticalCount.toLocaleString('en-IN')} critical ranked opportunities deserve review.`,
      detail: 'The CRM priority model has marked these as the strongest current review candidates. The priority reason remains visible on each row and no action is executed automatically.',
      href: '/work-queue?tab=priority',
      action: 'Review critical queue',
    };
  }
  if (paymentCount > 0) {
    return {
      headline: `${paymentCount.toLocaleString('en-IN')} payment-stage or verification items need attention.`,
      detail: 'Commercial stage and payment truth stay separate. Review payment-stage opportunities and verification tasks without treating a CRM stage as proof of cash collection.',
      href: '/work-queue?tab=payment',
      action: 'Review payment attention',
    };
  }
  if (priorityCount > 0) {
    return {
      headline: `${priorityCount.toLocaleString('en-IN')} ranked opportunities remain for normal review.`,
      detail: 'No reply, overdue, critical or payment queue currently outranks the regular decision queue. Work the highest-ranked explanation first.',
      href: '/work-queue?tab=priority',
      action: 'Review ranked queue',
    };
  }
  return {
    headline: 'The current sales queue is clear.',
    detail: 'No immediate reply, overdue, critical, payment or ranked-review pressure is visible in the current evidence. Avoid manufacturing urgency; continue monitoring Inbox and new opportunities.',
    href: '/opportunities',
    action: 'Review opportunities',
  };
}

function EmptyRow({ text }: { text: string }) {
  return <div className="flex items-center gap-2 px-5 py-8 text-[12px] text-copy-muted"><Check size={16} className="text-emerald-600" /> {text}</div>;
}

function parseTab(value: string): Tab {
  return value === 'reply' || value === 'followups' || value === 'payment' ? value : 'priority';
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function positiveInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function followupTiming(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Follow-up scheduled';
  return time < Date.now() ? `overdue ${formatAge(value)}` : `due ${formatDateTime(value)}`;
}

function formatAge(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '—';
  const elapsedMs = Math.max(0, Date.now() - time);
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function pretty(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatMoney(value: number | string | null, currency: string | null) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || !currency) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-IN')}`;
  }
}
