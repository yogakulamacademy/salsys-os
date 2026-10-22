import Link from "next/link";
import { ArrowRight, GitBranch, Sparkles, Target } from "lucide-react";

import { AttributionIntelligenceExplorer } from "@/components/attribution-intelligence-explorer";
import type { AttributionWorkspaceFilters } from "@/components/attribution-workspace";
import { ExecutiveDecisionBrief } from "@/components/marketing/executive-decision-brief";
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
        eyebrow="Decision intelligence"
        title="Attribution"
        description="Understand who gets credit, how much evidence supports it, and where missing attribution could change the decision."
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

      {filters.query ? <InvestigationContext query={filters.query} /> : null}

      <ExecutiveDecisionBrief
        eyebrow="Attribution decision brief"
        title={intelligence.summary}
        summary={buildAttributionNarrative(intelligence.readinessScore, intelligence.readinessDetail)}
        confidenceLabel={`${Math.round(intelligence.readinessScore)}/100 evidence readiness`}
        confidenceDetail={intelligence.methodology}
        signals={intelligence.signals.slice(0, 4).map((signal) => ({
          label: signal.label,
          value: signal.value,
          detail: signal.detail,
          tone: mapTone(signal.tone),
        }))}
        actions={intelligence.actions
          .filter((action) => action.href)
          .slice(0, 3)
          .map((action) => ({
            label: action.title,
            href: action.href!,
            detail: action.detail,
          }))}
      />

      <AttributionIntelligenceExplorer workspace={workspace} filters={filters} warning={warning} />

      <div className="px-1 text-[10px] leading-4 text-slate-400">
        First Touch, Lead Creation, Last Marketing Touch and Current Channel remain separate models. Unknown attribution stays unknown rather than being guessed. Coverage states describe visible known-vs-unknown evidence; they are not statistical confidence intervals.
      </div>
    </div>
  );
}

function InvestigationContext({ query }: { query: string }) {
  const encoded = encodeURIComponent(query);
  return (
    <section className="rounded-2xl border border-[#d8e4da] bg-[#f4f8f3] px-4 py-4 shadow-[0_8px_24px_rgba(16,45,39,.035)] sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-[9px] font-black uppercase tracking-[.15em] text-[#75907f]">Investigation context preserved</div>
          <div className="mt-1 text-sm font-semibold text-[#102d27]">Following evidence for “{query}”</div>
          <p className="mt-1 max-w-2xl text-[10px] leading-5 text-[#758279]">
            Attribution is filtered to the source or channel carried in from the previous Marketing investigation. Compare models here, then continue into the actual leads, campaign evidence or revenue without losing the thread.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/campaigns?q=${encoded}`} className="btn-secondary">Campaigns</Link>
          <Link href="/paid-media-leads" className="btn-secondary">Generated leads</Link>
          <Link href={`/revenue?investigation=1&source=${encoded}&from=attribution`} className="btn-secondary">Revenue</Link>
          <Link href="/attribution" className="btn-secondary">Clear context</Link>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-[#e0e9e1] pt-3 text-[10px] font-semibold text-[#527263]">
        <ArrowRight size={12} /> Suggested path: compare credit model → inspect CRM records → confirm revenue evidence.
      </div>
    </section>
  );
}

function buildAttributionNarrative(score: number, readinessDetail: string) {
  if (score >= 85) {
    return `Attribution evidence is strong enough for directional source decisions. ${readinessDetail}`;
  }
  if (score >= 60) {
    return `The model is useful, but source comparisons should still be read with the visible coverage gaps in mind. ${readinessDetail}`;
  }
  return `Attribution is currently incomplete. Prioritize evidence repair before making aggressive channel or budget changes. ${readinessDetail}`;
}

function mapTone(tone: "positive" | "info" | "watch" | "risk") {
  if (tone === "positive") return "positive" as const;
  if (tone === "watch") return "watch" as const;
  if (tone === "risk") return "risk" as const;
  return "neutral" as const;
}
