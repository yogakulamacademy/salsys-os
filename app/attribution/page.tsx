import Link from "next/link";

import { ArrowRight, GitBranch, Target } from "lucide-react";

import {
  AttributionWorkspace,
  type AttributionWorkspaceFilters,
} from "@/components/attribution-workspace";

import { PageHeader } from "@/components/ui";

import { getAttributionWorkspace } from "@/lib/attribution-data";

type AttributionPageProps = {
  searchParams: Promise<{
    q?: string;
    course?: string;
    location?: string;
    country?: string;
    stage?: string;
  }>;
};

export default async function AttributionPage({
  searchParams,
}: AttributionPageProps) {
  const query = await searchParams;

  const filters: AttributionWorkspaceFilters = {
    query: query.q?.trim() ?? "",
    course: query.course?.trim() || "all",
    location: query.location?.trim() || "all",
    country: query.country?.trim() || "all",
    stage: query.stage?.trim() || "all",
  };

  const { workspace, warning } = await getAttributionWorkspace(filters);

  return (
    <div className="attribution-polish">
      <PageHeader
        eyebrow="Customer journey"
        title="Attribution"
        description="Compare acquisition, lead creation, marketing influence and current conversation channels without overwriting the original source of a lead."
        actions={
          <>
            <Link href="/campaigns" className="btn-secondary">
              <Target size={15} />
              Campaigns
            </Link>

            <Link href="/funnel" className="btn-primary">
              <GitBranch size={15} />
              Funnel
              <ArrowRight size={14} />
            </Link>
          </>
        }
      />

      <AttributionWorkspace
        workspace={workspace}
        filters={filters}
        loadError={null}
        warning={warning}
      />
    </div>
  );
}
