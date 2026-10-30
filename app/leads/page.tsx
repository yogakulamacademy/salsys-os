import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";

import { LeadsCleanTable } from "@/components/leads-clean-table";
import { TeamAssignmentPanel } from "@/components/team-assignment-panel";
import { Notice, PageHeader } from "@/components/ui";
import {
  getLeadsWorkspacePage,
  parseLeadsWorkspaceParams,
} from "@/lib/leads-data";
import { isMockMode } from "@/lib/data";
import styles from "./leads.module.css";

type LeadsPageProps = {
  searchParams: Promise<{
    notice?: string | string[];
    error?: string | string[];
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
  const error = one(params.error);

  return (
    <div className={`leads-workspace-v2 ${styles.workspace} space-y-5`}>
      <PageHeader
        eyebrow="Sales · Opportunities"
        title="Leads"
        description="Work commercial opportunities from one queue: ownership, stage, intent, acquisition source, next action and sales attention stay connected."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/leads/new"
              className="inline-flex h-10 items-center gap-2 rounded-ui bg-brand-700 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-brand-800"
            >
              <Plus size={15} /> Add lead
            </Link>
            <Link
              href="/team"
              aria-label="Open team workspace"
              className="grid h-10 w-10 place-items-center rounded-ui border border-line bg-surface text-copy-muted transition hover:border-line-strong hover:bg-surface-soft hover:text-brand-700"
            >
              <MoreHorizontal size={17} />
            </Link>
          </div>
        }
      />

      {notice === "mock-create" ? (
        <Notice tone="warning">
          Demo mode is active, so the test lead was not saved.
        </Notice>
      ) : null}

      {notice === "owner-updated" || notice === "owner-unassigned" ? (
        <Notice tone="success">
          {notice === "owner-unassigned" ? "Lead ownership removed." : "Lead owner updated."}
        </Notice>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}

      {workspace.warning ? (
        <Notice tone="warning" title="Leads loaded with a fallback path">
          {workspace.warning}
        </Notice>
      ) : null}

      <TeamAssignmentPanel returnTo="/leads" />

      <LeadsCleanTable
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
