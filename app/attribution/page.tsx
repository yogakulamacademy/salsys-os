import Link from "next/link";
import { ArrowRight, CircleDollarSign, GitBranch, Megaphone, Sparkles, Target } from "lucide-react";

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
        eyebrow="Intelligence · Attribution"
        title="Attribution"
        description="Understand who gets credit, how much evidence supports it, and where missing attribution could change the decision."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/campaigns" className="btn-secondary">
              <Target size={15} /> Campaigns
            </Link>
            <Link href="/paid-media-leads" className="btn-secondary">
              <Megaphone size={15} /> Acquisition
            </Link>
            <Link href="/funnel" className="btn-secondary">
              <GitBranch size={15} /> Funnel
            </Link>
            <Link href="/commercial-intelligence" className="btn-secondary">
              <Sparkles size={15} /> Ask Salsys
            </Link>
            <Link href="/revenue" className="btn-primary">
              <CircleDollarSign size={15} /> Revenue
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

      <div className="px-1 text-[10px] leading-4 text-copy-subtle">
        First Touch, Lead Creation, Last Marketing Touch and Current Channel remain separate models. Unknown attribution stays unknown rather than being guessed. Coverage states describe visible known-vs-unknown evidence; they are not statistical confidence intervals.
      </div>
    </div>
  );
}

function InvestigationContext({ query }: { query: string }) {
  const encoded = encodeURIComponent(query);
  return (
    <section className="rounded-panel border border-line bg-surface px-4 py-4 shadow-card sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-700">Investigation context preserved</div>
          <div className="mt-1 text-sm font-semibold text-copy-strong">Following evidence for “{query}”</div>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-copy-muted">
            Attribution is filtered to the source or channel carried in from the previous Marketing investigation. Compare models here, then continue into the actual leads, campaign evidence or revenue without losing the thread.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/campaigns?q=${encoded}`} className="btn-secondary">Campaigns</Link>
          <Link href={`/paid-media-leads?q=${encoded}`} className="btn-secondary">Acquisition leads</Link>
          <Link href={`/revenue?investigation=1&source=${encoded}&from=attribution`} className="btn-secondary">Revenue</Link>
          <Link href="/attribution" className="btn-secondary">Clear context</Link>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[11px] font-semibold text-brand-700">
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