import Link from "next/link";
import { Plus } from "lucide-react";

import { LeadsWorkspaceV2 } from "@/components/leads-workspace-v2";
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
    <div className="space-y-4">
      <PageHeader
        eyebrow="CRM"
        title="Leads"
        description="Find the next lead that needs action."
        actions={
          <Link href="/leads/new" className="btn-primary">
            <Plus size={15} /> Add lead
          </Link>
        }
      />

      {notice === "mock-create" ? (
        <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-xs font-semibold text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-200">
          Demo mode is active, so the test lead was not saved.
        </div>
      ) : null}

      {workspace.warning ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          {workspace.warning}
        </div>
      ) : null}

      <LeadsWorkspaceV2
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
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
