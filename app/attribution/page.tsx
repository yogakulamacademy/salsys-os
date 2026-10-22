import Link from "next/link";
import { GitBranch, Sparkles, Target } from "lucide-react";

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
