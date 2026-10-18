import Link from 'next/link';
import { ArrowRight, BrainCircuit, DatabaseZap, ShieldCheck, Sparkles } from 'lucide-react';

import { SystemIntelligenceBrief } from '@/components/system-intelligence-brief';
import { PageHeader } from '@/components/ui';
import { getDashboardSnapshot } from '@/lib/dashboard-data';
import { buildSystemIntelligence } from '@/lib/intelligence/system-intelligence';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default async function IntelligencePage() {
  const [snapshot, workspace] = await Promise.all([
    getDashboardSnapshot(),
    getCurrentWorkspaceContext(),
  ]);

  const brief = buildSystemIntelligence(snapshot, new Date(), {
    role: workspace.activeWorkspace?.role,
  });

  return (
    <div className="dashboard-polish">
      <PageHeader
        eyebrow="Operating intelligence"
        title="What should we do right now?"
        description="SalsysOS ranks current operating evidence for the active workspace, correlates overlapping signals, and adapts priority weighting to the signed-in role. Facts remain deterministic and human-controlled."
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
            Overlapping evidence is combined before ranking, so one underlying problem does not appear as several inflated priorities. The same evidence can rank differently for admissions, managers and owners.
          </p>
        </section>

        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <DatabaseZap size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Evidence before AI</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Facts and thresholds remain deterministic. Currency views stay separate unless an explicit FX source exists. Claude can later synthesize these verified signals, but it does not invent the underlying evidence.
          </p>
        </section>

        <section className="card-pad">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck size={18} />
          </div>
          <div className="mt-3 text-sm font-black text-slate-900">Recommend, don&apos;t silently act</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Intelligence remains advisory. Sensitive customer, financial, automation and website actions continue through existing approval and control planes.
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
            <div className="mt-1 text-lg font-black">The operating brief now adapts without weakening evidence quality.</div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">
              This checkpoint adds signal correlation, role-aware ranking, valid action routes and currency-safe revenue reasoning. Next: real freshness/decay from timestamped evidence, cross-domain SEO/system-health signals and bounded Claude synthesis.
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-slate-200">
            Human-controlled · tenant-scoped · role-aware
          </div>
        </div>
      </section>
    </div>
  );
}
