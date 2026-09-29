import Link from "next/link";

import { ArrowRight, BarChart3 } from "lucide-react";

import {
  CampaignsWorkspace,
  type CampaignWorkspaceFilters,
} from "@/components/campaigns-workspace";

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

export default async function CampaignsPage({
  searchParams,
}: CampaignsPageProps) {
  const query = await searchParams;

  const filters = parseFilters(query);

  const workspace = await getCampaignsWorkspace(filters);

  const mock = isMockMode();

  return (
    <>
      <PageHeader
        eyebrow="Paid acquisition"
        title="Campaigns"
        description="Live campaign performance connected to CRM outcomes. Compare ad spend with attributed leads, qualification, enrollments and actual CRM revenue."
        actions={
          <>
            <Link href="/paid-media-leads" className="btn-secondary">
              Paid Media Leads
            </Link>

            <Link href="/funnel" className="btn-primary">
              Funnel analytics
              <ArrowRight size={15} />
            </Link>
          </>
        }
      />

      {(workspace.googleError || workspace.metaError) && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-bold">
            <BarChart3 size={15} />
            Some campaign data could not be loaded
          </div>

          {workspace.googleError && (
            <div className="mt-1 text-xs">
              Google Ads: {workspace.googleError}
            </div>
          )}

          {workspace.metaError && (
            <div className="mt-1 text-xs">Meta Ads: {workspace.metaError}</div>
          )}
        </div>
      )}

      {workspace.warning && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Campaigns loaded through the legacy fallback. {workspace.warning}
        </div>
      )}

      <CampaignsWorkspace
        campaigns={workspace.campaigns}
        summary={workspace.summary}
        platforms={workspace.platforms}
        pagination={workspace.pagination}
        filters={filters}
        mock={mock}
      />
    </>
  );
}

function parseFilters(query: {
  q?: string;
  platform?: string;
  outcome?: string;
  sort?: string;
  page?: string;
}): CampaignWorkspaceFilters {
  const allowedOutcomes = new Set([
    "all",
    "with_leads",
    "no_leads",
    "qualified",
    "enrolled",
    "revenue",
  ]);

  const allowedSorts = new Set([
    "spend_desc",
    "leads_desc",
    "qualified_desc",
    "enrolled_desc",
    "roas_desc",
    "cac_asc",
    "name",
  ]);

  const outcome = allowedOutcomes.has(query.outcome ?? "")
    ? query.outcome!
    : "all";

  const sortMode = allowedSorts.has(query.sort ?? "")
    ? query.sort!
    : "spend_desc";

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
