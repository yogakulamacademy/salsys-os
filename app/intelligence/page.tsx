import Link from 'next/link';
import { ArrowRight, BrainCircuit, DatabaseZap, ShieldCheck, Sparkles } from 'lucide-react';

import { SystemIntelligenceBrief } from '@/components/system-intelligence-brief';
import { PageHeader } from '@/components/ui';
import { getDashboardSnapshot } from '@/lib/dashboard-data';
import { buildSystemIntelligence } from '@/lib/intelligence/system-intelligence';

export const dynamic = 'force-dynamic';

export default async function IntelligencePage() {
  const snapshot = await getDashboardSnapshot();
  const brief = buildSystemIntelligence(snapshot);

  return (
    <div className="dashboard-polish">
      <PageHeader
        eyebrow="Operating intelligence"
        title="What should we do right now?"
        description="SalsysOS continuously ranks live operating signals instead of presenting the same static dashboard every time. The current version is deterministic, explainable and read-only."
        actions={
          <Link href="/dashboard" className="btn-secondary">
            Dashboard
            <ArrowRight size={14} />
          </Link>
        }
      />

      <SystemIntelligenceBrief brief={brief} />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
            <BrainCircuit size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Observe → prioritize</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Current CRM, conversation, pipeline, revenue, demand, acquisition and data-quality evidence is converted into ranked operating signals. A change in the evidence changes the ranking.
          </p>
        </section>

        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <DatabaseZap size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Evidence before AI</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Facts and thresholds remain deterministic. Claude can later explain and synthesize these signals, but it does not get to invent the underlying counts, revenue, rankings or conversion evidence.
          </p>
        </section>

        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Recommend, don&apos;t silently act</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Intelligence remains advisory in v1. Sensitive customer, financial, automation and website actions still require the existing approval/control planes.
          </p>
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 px-5 py-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-violet-300">
              <Sparkles size={13} />
              Intelligence Core v1
            </div>
            <div className="mt-1 text-lg font-black">This is the first shared intelligence contract for SalsysOS.</div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">
              Next versions can add behavioral acceleration, reactivation, team capacity, SEO opportunities, system health, Claude synthesis and learned outcome calibration without replacing this evidence-first contract.
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-slate-200">
            Human-controlled · tenant-scoped · explainable
          </div>
        </div>
      </section>
    </div>
  );
}
