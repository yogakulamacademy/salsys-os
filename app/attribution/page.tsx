import Link from "next/link";
import { GitBranch, Sparkles, Target } from "lucide-react";

import { AttributionExplorer } from "@/components/attribution-explorer";
import type { AttributionWorkspaceFilters } from "@/components/attribution-workspace";
import { CommercialIntelligencePanel } from "@/components/commercial-intelligence-panel";
import { PageHeader } from "@/components/ui";
import { getAttributionWorkspace } from "@/lib/attribution-data";
import { buildAttributionIntelligence } from "@/lib/commercial-intelligence";

type AttributionPageProps = {
  searchParams: Promise<{
    q?: string;
    course?: string;
    location?: string;
    country?: string;
    stage?: string;
  }>;
};

export default async function AttributionPage({ searchParams }: AttributionPageProps) {
  const query = await searchParams;
  const filters: AttributionWorkspaceFilters = {
    query: query.q?.trim() ?? "",
    course: query.course?.trim() || "all",
    location: query.location?.trim() || "all",
    country: query.country?.trim() || "all",
    stage: query.stage?.trim() || "all",
  };

  const { workspace, warning } = await getAttributionWorkspace(filters);
  const intelligence = buildAttributionIntelligence(workspace);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Intelligence"
        title="Attribution"
        description="Switch models, compare sources and inspect revenue lineage."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/commercial-intelligence" className="btn-secondary">
              <Sparkles size={15} /> Explain performance
            </Link>
            <Link href="/campaigns" className="btn-secondary">
              <Target size={15} /> Campaigns
            </Link>
            <Link href="/funnel" className="btn-primary">
              <GitBranch size={15} /> Funnel
            </Link>
          </div>
        }
      />

      <AttributionExplorer workspace={workspace} filters={filters} warning={warning} />

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Salsys intelligence</div>
            <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">Diagnosis and next actions</div>
          </div>
          <span className="text-[10px] font-bold text-slate-400 group-open:hidden">Show</span>
          <span className="hidden text-[10px] font-bold text-slate-400 group-open:inline">Hide</span>
        </summary>
        <div className="border-t border-slate-100 p-4 dark:border-slate-900">
          <CommercialIntelligencePanel brief={intelligence} />
        </div>
      </details>

      <div className="px-1 text-[10px] leading-4 text-slate-400">
        First Touch, Lead Creation, Last Marketing Touch and Current Channel remain separate models. Unknown attribution stays unknown rather than being guessed.
      </div>
    </div>
  );
}
