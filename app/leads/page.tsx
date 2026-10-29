import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";

import { LeadsCleanTable } from "@/components/leads-clean-table";
import { TeamAssignmentPanel } from "@/components/team-assignment-panel";
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
    <div className={`${styles.workspace} space-y-5`}>
      <section className="ui-page-header !mb-0">
        <div className="min-w-0">
          <div className="ui-page-kicker">CRM · Operations</div>
          <h1 className="ui-page-title">Leads</h1>
          <p className="ui-page-description">
            Manage contacts, ownership, follow-ups and opportunity progress from one operational workspace.
          </p>
        </div>

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
      </section>

      {notice === "mock-create" ? (
        <div className="rounded-ui border border-amber-200 bg-[var(--app-warning-soft)] px-4 py-3 text-[12px] font-semibold text-[var(--app-warning)]">
          Demo mode is active, so the test lead was not saved.
        </div>
      ) : null}

      {notice === "owner-updated" || notice === "owner-unassigned" ? (
        <div className="rounded-ui border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] font-semibold text-emerald-800">
          {notice === "owner-unassigned" ? "Lead ownership removed." : "Lead owner updated."}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-ui border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      {workspace.warning ? (
        <div className="rounded-ui border border-amber-200 bg-[var(--app-warning-soft)] px-4 py-3 text-[12px] font-semibold text-[var(--app-warning)]">
          {workspace.warning}
        </div>
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
