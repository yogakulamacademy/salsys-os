import { ArrowRight, Clock3, MessageSquareMore, Radar, Sparkles, Target } from 'lucide-react';

import type { DashboardSnapshot } from '@/lib/dashboard-data';
import type { SystemIntelligenceContext } from '@/lib/intelligence/system-intelligence-context';
import type { SystemIntelligenceBrief } from '@/lib/intelligence/system-intelligence';

function changeLabel(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 'new activity' : 'no change';
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta === 0) return 'flat vs prior 24h';
  return `${delta > 0 ? '+' : ''}${delta}% vs prior 24h`;
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

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-violet-300">
            <Sparkles size={12} /> Morning Brief v1
          </div>
          <h2 className="mt-1 text-lg font-black">Your operating picture for the last 24 hours</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">
            A deterministic summary of demand, response pressure and the highest-priority work currently visible to the {context.role} role.
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
            {snapshot.metrics.paymentPending} payment pending · {failures} system failure{failures === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black text-white">Recommended order of work</div>
            <div className="mt-0.5 text-[10px] text-slate-400">The current top three System Intelligence priorities.</div>
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
