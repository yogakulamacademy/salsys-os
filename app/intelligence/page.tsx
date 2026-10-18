import Link from 'next/link';
import { ArrowRight, BrainCircuit, DatabaseZap, ShieldCheck, Sparkles } from 'lucide-react';

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
        description="SalsysOS correlates live operating signals, detects fresh behavioural and velocity changes, and re-ranks priorities for the current role instead of showing a fixed dashboard checklist."
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
          <div className="mt-3 text-sm font-black text-slate-900">Correlate → prioritize</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Related symptoms are merged into operating situations. Reply pressure, behavioural re-engagement, lead velocity, revenue and system health compete for priority instead of appearing as unrelated static cards.
          </p>
        </section>

        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <DatabaseZap size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Fresh evidence + role context</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Current and previous 24-hour activity windows, journey re-engagement and operational health enrich the base snapshot. The same facts are weighted differently for owner, manager and admissions roles.
          </p>
        </section>

        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Evidence before AI</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Intelligence Core v2 is still deterministic and read-only. Claude can synthesize this bounded contract next, while customer, financial, automation and website actions continue through the existing control planes.
          </p>
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 px-5 py-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-violet-300">
              <Sparkles size={13} />
              Intelligence Core v2
            </div>
            <div className="mt-1 text-lg font-black">The operating brief now changes with the business and with the person using it.</div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">
              V2 adds signal correlation, behavioural re-engagement, 24-hour velocity comparison, system-health confidence and role-aware ranking. The next layer is Claude synthesis over this verified evidence contract, followed by outcome feedback and learned calibration.
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-slate-200">
            Dynamic · tenant-scoped · role-aware · human-controlled
          </div>
        </div>
      </section>
    </div>
  );
}
