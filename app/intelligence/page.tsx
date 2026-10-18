import Link from 'next/link';
import { ArrowRight, BrainCircuit, DatabaseZap, ShieldCheck, Sparkles } from 'lucide-react';

import { ClaudeOperatingBrief } from '@/components/claude-operating-brief';
import { IntelligenceLearningPanel } from '@/components/intelligence-learning-panel';
import { SystemIntelligenceBrief } from '@/components/system-intelligence-brief';
import { PageHeader } from '@/components/ui';
import { getDashboardSnapshot } from '@/lib/dashboard-data';
import { getSystemIntelligenceContext } from '@/lib/intelligence/system-intelligence-context';
import { buildSystemIntelligenceV2 } from '@/lib/intelligence/system-intelligence-v2';

export const dynamic = 'force-dynamic';

export default async function IntelligencePage() {
  const [snapshot, context] = await Promise.all([
    getDashboardSnapshot(),
    getSystemIntelligenceContext(),
  ]);
  const brief = buildSystemIntelligenceV2(snapshot, context);

  return (
    <div className="dashboard-polish">
      <PageHeader
        eyebrow="Operating intelligence"
        title="What should we do right now?"
        description="SalsysOS correlates live operating signals, detects fresh behavioural and velocity changes, re-ranks priorities for the current role, and now starts learning from what happens after recommended actions are completed."
        actions={
          <Link href="/dashboard" className="btn-secondary">
            Dashboard
            <ArrowRight size={14} />
          </Link>
        }
      />

      <SystemIntelligenceBrief brief={brief} />
      <ClaudeOperatingBrief />
      <IntelligenceLearningPanel />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
            <BrainCircuit size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Correlate → prioritize</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Related symptoms are merged into operating situations. Reply pressure, behavioural re-engagement, lead velocity, revenue and system health compete for priority instead of appearing as unrelated static cards.
          </p>
        </section>

        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <DatabaseZap size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Observe outcomes safely</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Selected recommendations now preserve a server-derived baseline. After an action is completed, SalsysOS can compare later tenant evidence and record positive, neutral or negative movement without claiming causation.
          </p>
        </section>

        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Evidence before AI</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Deterministic evidence remains the authority. Claude synthesizes the bounded signal contract, while learning observations stay explainable and customer, financial, automation and website actions continue through the existing control planes.
          </p>
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 px-5 py-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-violet-300">
              <Sparkles size={13} />
              Intelligence learning checkpoint
            </div>
            <div className="mt-1 text-lg font-black">The operating system can now start connecting recommendations to observed change.</div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">
              Current learning is intentionally conservative: only signals with safe comparable metrics are observable, the first outcome window starts after one hour, unchanged observations are deduplicated, and every result is labelled observational rather than causal. The next step is business-outcome linkage and bounded score calibration.
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-slate-200">
            Dynamic · tenant-scoped · explainable · human-controlled
          </div>
        </div>
      </section>
    </div>
  );
}
