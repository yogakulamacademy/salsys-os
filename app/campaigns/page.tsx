import Link from "next/link";
import { BarChart3, CircleDollarSign, GitBranch, Target } from "lucide-react";

import { CampaignsIntelligenceWorkspace } from "@/components/campaigns-intelligence-workspace";
import type { CampaignWorkspaceFilters } from "@/components/campaigns-workspace";
import { PageHeader } from "@/components/ui";
import { getCampaignsWorkspace } from "@/lib/campaigns-data";
import { isMockMode } from "@/lib/data";

type CampaignsPageProps = {
  searchParams: Promise<{
    q?: string;
    platform?: string;
    outcome?: string;
    sort?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 50;

export default async function CampaignsPage({ searchParams }: CampaignsPageProps) {
  const query = await searchParams;
  const filters = parseFilters(query);
  const workspace = await getCampaignsWorkspace(filters);
  const mock = isMockMode();

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Marketing · Paid acquisition"
        title="Campaign Performance"
        description="See where spend creates qualified demand, where conversion breaks down, and which campaigns reach CRM revenue."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/funnel" className="btn-secondary">
              <GitBranch size={15} /> Funnel
            </Link>
            <Link href="/attribution" className="btn-secondary">
              <Target size={15} /> Attribution
            </Link>
            <Link href="/revenue" className="btn-primary">
              <CircleDollarSign size={15} /> Revenue
            </Link>
          </div>
        }
      />

      {(workspace.googleError || workspace.metaError) ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="flex items-center gap-2 font-semibold"><BarChart3 size={15} /> Some paid-media evidence is temporarily unavailable</div>
          {workspace.googleError ? <div className="mt-1">Google Ads: {workspace.googleError}</div> : null}
          {workspace.metaError ? <div className="mt-1">Meta Ads: {workspace.metaError}</div> : null}
        </div>
      ) : null}

      {workspace.warning ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          Campaign reporting is using a fallback path. Treat budget decisions as directional until the primary evidence path is healthy. {workspace.warning}
        </div>
      ) : null}

      <CampaignsIntelligenceWorkspace
        campaigns={workspace.campaigns}
        summary={workspace.summary}
        platforms={workspace.platforms}
        pagination={workspace.pagination}
        filters={filters}
        mock={mock}
      />
    </div>
  );
}

function parseFilters(query: {
  q?: string;
  platform?: string;
  outcome?: string;
  sort?: string;
  page?: string;
}): CampaignWorkspaceFilters {
  const allowedOutcomes = new Set(["all", "with_leads", "no_leads", "qualified", "enrolled", "revenue"]);
  const allowedSorts = new Set(["spend_desc", "leads_desc", "qualified_desc", "enrolled_desc", "roas_desc", "cac_asc", "name"]);
  const outcome = allowedOutcomes.has(query.outcome ?? "") ? query.outcome! : "all";
  const sortMode = allowedSorts.has(query.sort ?? "") ? query.sort! : "spend_desc";
  const page = Number.parseInt(query.page ?? "1", 10);

  return {
    query: query.q?.trim() ?? "",
    platform: query.platform?.trim() || "all",
    outcome: outcome as CampaignWorkspaceFilters["outcome"],
    sortMode: sortMode as CampaignWorkspaceFilters["sortMode"],
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: PAGE_SIZE,
  };
}
