import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  CreditCard,
  HeartPulse,
  MessageSquareMore,
  Radar,
  Sparkles,
  Target,
  UserRoundX,
} from 'lucide-react';

import type { DashboardSnapshot } from '@/lib/dashboard-data';
import type { SystemIntelligenceContext } from '@/lib/intelligence/system-intelligence-context';
import type { SystemIntelligenceBrief } from '@/lib/intelligence/system-intelligence';

const ACTIVE_STAGES = new Set(['new', 'contacted', 'engaged', 'qualified', 'high_intent', 'payment_pending']);

function changeLabel(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 'new activity' : 'no change';
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta === 0) return 'flat vs prior 24h';
  return `${delta > 0 ? '+' : ''}${delta}% vs prior 24h`;
}

function moneyLabel(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      notation: value >= 100000 ? 'compact' : 'standard',
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString('en-IN')}`;
  }
}

function outstandingLabel(snapshot: DashboardSnapshot) {
  const items = snapshot.revenueSummary
    .filter((row) => Number(row.outstanding || 0) > 0)
    .map((row) => moneyLabel(Number(row.outstanding || 0), row.currency || 'INR'));

  return items.length > 0 ? items.join(' · ') : 'No valued outstanding balance';
}

export function SystemMorningBrief({
  snapshot,
  context,
  brief,
}: {
  snapshot: DashboardSnapshot;
  context: SystemIntelligenceContext;
  brief: SystemIntelligenceBrief;
}) {
  const topPriorities = brief.signals.slice(0, 3);
  const failures = context.systemActivity.reduce((sum, row) => {
    const value = Number(row.failure_count);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const pendingSystemWork = context.systemActivity.reduce((sum, row) => {
    const value = Number(row.pending_count);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const overdueLeadWork = context.ownerSignals.filter(
    (row) => row.has_overdue_followup === true && ACTIVE_STAGES.has(String(row.current_stage || '')),
  ).length;
  const unownedPriority = context.ownerSignals.filter((row) => {
    if (row.owner_user_id) return false;
    if (!ACTIVE_STAGES.has(String(row.current_stage || ''))) return false;
    const priority = Number(row.priority_score);
    return row.current_stage === 'high_intent'
      || row.current_stage === 'payment_pending'
      || row.needs_reply === true
      || row.has_overdue_followup === true
      || (Number.isFinite(priority) && priority >= 70);
  }).length;
  const highIntentNeedsReply = context.ownerSignals.filter(
    (row) => row.current_stage === 'high_intent' && row.needs_reply === true,
  ).length;
  const healthExceptions = failures + context.degradedSources.length;

  const commandQueue = [
    {
      id: 'payment-risk',
      title: 'Protect payment-pending revenue',
      value: String(snapshot.metrics.paymentPending),
      detail: `${outstandingLabel(snapshot)} outstanding across valued pipeline records.`,
      href: '/pipeline',
      icon: CreditCard,
      active: snapshot.metrics.paymentPending > 0,
    },
    {
      id: 'high-intent-replies',
      title: 'Reply to hot leads before lower-priority work',
      value: String(highIntentNeedsReply),
      detail: `${snapshot.metrics.highIntent} high-intent leads total; ${highIntentNeedsReply} currently need a reply.`,
      href: '/conversations',
      icon: MessageSquareMore,
      active: highIntentNeedsReply > 0,
    },
    {
      id: 'overdue-work',
      title: 'Clear overdue follow-up work',
      value: String(overdueLeadWork),
      detail: `${snapshot.metrics.followupsDue} follow-ups are due in the dashboard snapshot.`,
      href: '/follow-ups',
      icon: Clock3,
      active: overdueLeadWork > 0 || snapshot.metrics.followupsDue > 0,
    },
    {
      id: 'unowned-priority',
      title: 'Assign unowned priority leads',
      value: String(unownedPriority),
      detail: 'Active unowned leads qualify here when they are hot, payment-pending, overdue, need a reply or score 70+.',
      href: '/leads',
      icon: UserRoundX,
      active: unownedPriority > 0,
    },
  ].sort((left, right) => Number(right.active) - Number(left.active));

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-violet-300">
            <Sparkles size={12} /> Morning Brief · Owner Command Center v1
          </div>
          <h2 className="mt-1 text-lg font-black">Your operating picture for the last 24 hours</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">
            A deterministic summary of demand, response pressure, revenue exposure, ownership gaps and the highest-priority work currently visible to the {context.role} role.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300">
          Evidence-first · tenant-scoped · role-aware
        </div>
      </div>

      <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-slate-950 px-5 py-4">
          <Radar size={16} className="text-violet-300" />
          <div className="mt-2 text-2xl font-black">{context.velocity.newLeads24h}</div>
          <div className="text-xs font-bold text-slate-300">New leads</div>
          <div className="mt-1 text-[10px] text-slate-500">
            {changeLabel(context.velocity.newLeads24h, context.velocity.newLeadsPrevious24h)}
          </div>
        </div>
        <div className="bg-slate-950 px-5 py-4">
          <MessageSquareMore size={16} className="text-violet-300" />
          <div className="mt-2 text-2xl font-black">{context.velocity.inbound24h}</div>
          <div className="text-xs font-bold text-slate-300">Inbound messages</div>
          <div className="mt-1 text-[10px] text-slate-500">
            {changeLabel(context.velocity.inbound24h, context.velocity.inboundPrevious24h)}
          </div>
        </div>
        <div className="bg-slate-950 px-5 py-4">
          <Clock3 size={16} className="text-violet-300" />
          <div className="mt-2 text-2xl font-black">{snapshot.metrics.needsReply}</div>
          <div className="text-xs font-bold text-slate-300">Need a reply now</div>
          <div className="mt-1 text-[10px] text-slate-500">
            {snapshot.metrics.waitingOverHour} waiting over one hour · {snapshot.metrics.followupsDue} follow-ups due
          </div>
        </div>
        <div className="bg-slate-950 px-5 py-4">
          <Target size={16} className="text-violet-300" />
          <div className="mt-2 text-2xl font-black">{snapshot.metrics.highIntent}</div>
          <div className="text-xs font-bold text-slate-300">High-intent leads</div>
          <div className="mt-1 text-[10px] text-slate-500">
            {snapshot.metrics.paymentPending} payment pending · {unownedPriority} unowned priority
          </div>
        </div>
      </div>

      <div className="grid gap-px border-t border-white/10 bg-white/10 lg:grid-cols-3">
        <div className="bg-slate-950 px-5 py-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
            <CreditCard size={13} /> Revenue exposure
          </div>
          <div className="mt-2 text-sm font-black text-white">{outstandingLabel(snapshot)}</div>
          <div className="mt-1 text-[10px] leading-4 text-slate-400">
            {snapshot.metrics.paymentPending} payment-pending leads · {snapshot.unvaluedOpenLeads} open leads without a value
          </div>
        </div>
        <div className="bg-slate-950 px-5 py-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
            <AlertTriangle size={13} /> Work at risk
          </div>
          <div className="mt-2 text-sm font-black text-white">{overdueLeadWork} overdue lead follow-ups · {unownedPriority} unowned priority leads</div>
          <div className="mt-1 text-[10px] leading-4 text-slate-400">
            {highIntentNeedsReply} high-intent leads need a reply now.
          </div>
        </div>
        <div className="bg-slate-950 px-5 py-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
            <HeartPulse size={13} /> System health
          </div>
          <div className="mt-2 text-sm font-black text-white">{healthExceptions} current exception{healthExceptions === 1 ? '' : 's'}</div>
          <div className="mt-1 text-[10px] leading-4 text-slate-400">
            {failures} failures · {pendingSystemWork} pending processor items · {context.degradedSources.length} degraded intelligence sources
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black text-white">Do these first today</div>
            <div className="mt-0.5 text-[10px] text-slate-400">A deterministic operating queue built from current revenue, follow-up, conversation and ownership evidence.</div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {commandQueue.map((item, index) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`rounded-xl border px-4 py-3 transition hover:border-violet-400/50 ${
                  item.active ? 'border-violet-400/20 bg-violet-400/10' : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wide text-violet-300">#{index + 1}</span>
                  <Icon size={14} className={item.active ? 'text-violet-300' : 'text-slate-500'} />
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-2xl font-black text-white">{item.value}</span>
                  <span className="pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">current</span>
                </div>
                <div className="mt-1 text-xs font-black leading-5 text-white">{item.title}</div>
                <div className="mt-1 text-[10px] leading-4 text-slate-400">{item.detail}</div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="border-t border-white/10 px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black text-white">Recommended order of work</div>
            <div className="mt-0.5 text-[10px] text-slate-400">The current top three System Intelligence priorities after role weighting and bounded learned calibration.</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-300">
            Attention {brief.attentionScore}/100
          </div>
        </div>

        {topPriorities.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
            No elevated operating priority is currently available.
          </div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-3">
            {topPriorities.map((signal, index) => (
              <div key={signal.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wide text-violet-300">Priority {index + 1}</span>
                  <span className="text-[10px] font-black text-slate-400">{signal.score}/100</span>
                </div>
                <div className="mt-2 text-sm font-black leading-5 text-white">{signal.title}</div>
                <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-slate-300">
                  <ArrowRight size={12} className="mt-1 shrink-0 text-violet-300" />
                  <span>{signal.recommendedAction}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
