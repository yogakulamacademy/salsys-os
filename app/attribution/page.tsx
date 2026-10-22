import Link from "next/link";
import { GitBranch, Sparkles, Target } from "lucide-react";

import { AttributionIntelligenceExplorer } from "@/components/attribution-intelligence-explorer";
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
        eyebrow="Growth intelligence"
        title="Attribution"
        description="Explore where credit changes, how trustworthy the evidence is, and what decisions the data can support."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/campaigns" className="btn-secondary">
              <Target size={15} /> Campaigns
            </Link>
            <Link href="/commercial-intelligence" className="btn-secondary">
              <Sparkles size={15} /> Explain performance
            </Link>
            <Link href="/funnel" className="btn-primary">
              <GitBranch size={15} /> Funnel
            </Link>
          </div>
        }
      />

      <section className="rounded-2xl border border-violet-100 bg-violet-50/45 p-4 sm:p-5 dark:border-violet-900/40 dark:bg-violet-950/10">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">
          <Sparkles size={13} /> What this means and what to do next
        </div>
        <CommercialIntelligencePanel brief={intelligence} />
      </section>

      <AttributionIntelligenceExplorer workspace={workspace} filters={filters} warning={warning} />

      <div className="px-1 text-[10px] leading-4 text-slate-400">
        First Touch, Lead Creation, Last Marketing Touch and Current Channel remain separate models. Unknown attribution stays unknown rather than being guessed. Coverage states describe visible known-vs-unknown evidence; they are not statistical confidence intervals.
      </div>
    </div>
  );
}
