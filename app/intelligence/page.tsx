import Link from 'next/link';
import { ArrowRight, BrainCircuit, DatabaseZap, ShieldCheck, Sparkles } from 'lucide-react';

import { ClaudeOperatingBrief } from '@/components/claude-operating-brief';
import { IntelligenceLearningPanel } from '@/components/intelligence-learning-panel';
import { SystemIntelligenceBrief } from '@/components/system-intelligence-brief';
import { PageHeader } from '@/components/ui';
import { getDashboardSnapshot } from '@/lib/dashboard-data';
import { getSystemIntelligenceContext } from '@/lib/intelligence/system-intelligence-context';
import { buildSystemIntelligenceV3 } from '@/lib/intelligence/system-intelligence-v3';

export const dynamic = 'force-dynamic';

export default async function IntelligencePage() {
  const [snapshot, context] = await Promise.all([
    getDashboardSnapshot(),
    getSystemIntelligenceContext(),
  ]);
  const brief = buildSystemIntelligenceV3(snapshot, context);

  return (
    <div className="dashboard-polish">
      <PageHeader
        eyebrow="Operating intelligence"
        title="What should we do right now?"
        description="SalsysOS correlates live operating pressure with real week-over-week evidence, team capacity, acquisition movement, SEO demand and system health, then re-ranks priorities for the current role without inventing causes."
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
          <div className="mt-3 text-sm font-black text-slate-900">Correlate across domains</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Reply pressure, team capacity, lead creation, organic search movement, paid-media attribution and system health can now be combined when independent evidence points to the same operating situation.
          </p>
        </section>

        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <DatabaseZap size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Compare real history</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            The intelligence layer now compares live 24-hour velocity with bounded seven-day history for lead creation and Search Console demand instead of treating every dashboard snapshot as an isolated moment.
          </p>
        </section>

        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Evidence before explanation</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Deterministic tenant evidence remains the authority. Correlation raises priority but never becomes a causal claim, and Claude still receives only the bounded signal contract for synthesis.
          </p>
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 px-5 py-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-violet-300">
              <Sparkles size={13} />
              Intelligence v3 checkpoint
            </div>
            <div className="mt-1 text-lg font-black">The operating brief now distinguishes symptoms from situations.</div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">
              Current reasoning can merge demand acceleration with response-capacity pressure, correlate acquisition softness across independent signals, surface paid-media attribution gaps, and preserve existing recommendation learning. No customer message, financial action, campaign change or website update is executed automatically.
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-slate-200">
            Dynamic · historical · cross-domain · human-controlled
          </div>
        </div>
      </section>
    </div>
  );
}
