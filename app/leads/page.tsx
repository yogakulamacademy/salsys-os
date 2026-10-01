import Link from "next/link";
import { Plus } from "lucide-react";

import { LeadsWorkspace } from "@/components/leads-workspace";
import { PageHeader } from "@/components/ui";
import {
  getLeadsWorkspacePage,
  parseLeadsWorkspaceParams,
} from "@/lib/leads-data";
import { isMockMode } from "@/lib/data";

type LeadsPageProps = {
  searchParams: Promise<{
    notice?: string | string[];
    q?: string | string[];
    stage?: string | string[];
    source?: string | string[];
    channel?: string | string[];
    owner?: string | string[];
    course?: string | string[];
    aging?: string | string[];
    view?: string | string[];
    sort?: string | string[];
    page?: string | string[];
  }>;
};

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams;
  const filters = parseLeadsWorkspaceParams(params);
  const workspace = await getLeadsWorkspacePage(filters);
  const mock = isMockMode();
  const notice = one(params.notice);

  return (
    <div className="leads-premium-page">
      <PageHeader
        eyebrow="Admissions workspace"
        title="Leads"
        description="Find, filter and triage prospects across every acquisition channel from one focused workspace."
        actions={
          <Link href="/leads/new" className="btn-primary">
            <Plus size={16} />
            Add lead
          </Link>
        }
      />

      {notice === "mock-create" && (
        <div className="mb-4 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-700">
          Mock mode is active, so the test lead was not saved. Switch to
          Supabase mode when you are ready for persistence.
        </div>
      )}

      {workspace.warning && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          {workspace.warning}
        </div>
      )}

      <LeadsWorkspace
        leads={workspace.leads}
        intelligence={workspace.intelligence}
        mock={mock}
        filters={filters}
        options={workspace.options}
        summary={workspace.summary}
        pagination={workspace.pagination}
      />
    </div>
  );
}

function one(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}
