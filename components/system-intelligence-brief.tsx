import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  DatabaseZap,
  Lightbulb,
  MessageSquareMore,
  Radar,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';

import type {
  SystemIntelligenceBrief as Brief,
  SystemIntelligenceCategory,
  SystemIntelligenceSignal,
  SystemIntelligenceTone,
} from '@/lib/intelligence/system-intelligence';

const toneClasses: Record<SystemIntelligenceTone, string> = {
  critical: 'border-rose-200 bg-rose-50/70 text-rose-800',
  warning: 'border-amber-200 bg-amber-50/70 text-amber-800',
  opportunity: 'border-emerald-200 bg-emerald-50/70 text-emerald-800',
  info: 'border-sky-200 bg-sky-50/70 text-sky-800',
  healthy: 'border-slate-200 bg-slate-50 text-slate-700',
};

const scoreClasses: Record<SystemIntelligenceTone, string> = {
  critical: 'bg-rose-600 text-white',
  warning: 'bg-amber-500 text-white',
  opportunity: 'bg-emerald-600 text-white',
  info: 'bg-sky-600 text-white',
  healthy: 'bg-slate-600 text-white',
};

function CategoryIcon({ category }: { category: SystemIntelligenceCategory }) {
  const props = { size: 16, strokeWidth: 2.1 };
  if (category === 'conversation') return <MessageSquareMore {...props} />;
  if (category === 'follow_up') return <Clock3 {...props} />;
  if (category === 'revenue') return <CircleDollarSign {...props} />;
  if (category === 'demand') return <TrendingUp {...props} />;
  if (category === 'acquisition') return <Radar {...props} />;
  if (category === 'data_quality') return <DatabaseZap {...props} />;
  return <Target {...props} />;
}

function stateLabel(state: Brief['state']) {
  if (state === 'urgent') return 'Immediate attention';
  if (state === 'attention') return 'Active priorities';
  if (state === 'opportunity') return 'Opportunity mode';
  return 'Operating normally';
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Current snapshot';
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function SignalCard({ signal, rank }: { signal: SystemIntelligenceSignal; rank: number }) {
  return (
    <article className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${toneClasses[signal.tone]}`}>
          <CategoryIcon category={signal.category} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[.11em] text-slate-400">Priority {rank}</span>
            <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] ${scoreClasses[signal.tone]}`}>
              {signal.score} signal
            </span>
          </div>
          <h3 className="mt-2 text-sm font-black leading-5 text-slate-900">{signal.title}</h3>
          <p className="mt-1.5 text-xs leading-5 text-slate-500">{signal.reason}</p>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[10px] font-bold uppercase tracking-[.08em] text-slate-400">{signal.metricLabel}</div>
          <div className="mt-0.5 text-lg font-black tracking-tight text-slate-900">{signal.metricValue}</div>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-500" />
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.08em] text-slate-400">Recommended next move</div>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-700">{signal.recommendedAction}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {signal.evidence.slice(0, 3).map((item) => (
            <span key={item} className="max-w-full truncate rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-semibold text-slate-500">
              {item}
            </span>
          ))}
        </div>
        <Link href={signal.href} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-black text-brand hover:underline">
          Act on this
          <ArrowRight size={12} />
        </Link>
      </div>
    </article>
  );
}

export function SystemIntelligenceBrief({ brief }: { brief: Brief }) {
  const topSignals = brief.signals.slice(0, 4);
  const stateTone = brief.state === 'urgent'
    ? 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-orange-50'
    : brief.state === 'attention'
      ? 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sky-50'
      : brief.state === 'opportunity'
        ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50'
        : 'border-slate-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50';

  return (
    <section className={`mb-4 overflow-hidden rounded-2xl border shadow-sm ${stateTone}`}>
      <div className="border-b border-black/5 px-5 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white shadow-sm">
              <BrainCircuit size={20} />
              <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full border-2 border-white bg-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">SalsysOS Intelligence Core</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-[9px] font-black uppercase tracking-[.06em] text-slate-500">
                  <Sparkles size={10} /> Live evidence
                </span>
              </div>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{brief.headline}</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">{brief.summary}</p>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-2 shadow-sm backdrop-blur">
              <div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-400">State</div>
              <div className="mt-1 text-xs font-black text-slate-800">{stateLabel(brief.state)}</div>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-2 shadow-sm backdrop-blur">
              <div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-400">Attention</div>
              <div className="mt-1 text-xs font-black text-slate-800">{brief.attentionScore}/100</div>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-2 shadow-sm backdrop-blur">
              <div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-400">Urgent</div>
              <div className="mt-1 text-xs font-black text-slate-800">{brief.counters.urgent}</div>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-2 shadow-sm backdrop-blur">
              <div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-400">Refreshed</div>
              <div className="mt-1 text-xs font-black text-slate-800">{formatGeneratedAt(brief.generatedAt)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-black text-slate-800">What deserves attention now</div>
            <div className="mt-0.5 text-[10px] font-medium text-slate-400">Ranked from the current CRM, conversation, revenue, demand and acquisition snapshot — not a static checklist.</div>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
            <span className="inline-flex items-center gap-1"><AlertTriangle size={11} className="text-rose-500" /> {brief.counters.urgent} urgent</span>
            <span className="inline-flex items-center gap-1"><TrendingUp size={11} className="text-emerald-500" /> {brief.counters.opportunities} opportunities</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2 size={11} className="text-sky-500" /> human-controlled</span>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          {topSignals.map((item, index) => (
            <SignalCard key={item.id} signal={item} rank={index + 1} />
          ))}
        </div>
      </div>
    </section>
  );
}
