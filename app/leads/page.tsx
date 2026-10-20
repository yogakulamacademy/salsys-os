import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";

import { LeadsCleanTable } from "@/components/leads-clean-table";
import {
  getLeadsWorkspacePage,
  parseLeadsWorkspaceParams,
} from "@/lib/leads-data";
import { isMockMode } from "@/lib/data";
import styles from "./leads.module.css";

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
    <div className={`${styles.workspace} space-y-4`}>
      <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.035em] text-slate-950 dark:text-white">
            Leads
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Manage contacts and move opportunities forward.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/leads/new"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <Plus size={14} /> Add lead
          </Link>
          <button
            type="button"
            aria-label="More lead actions"
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </section>

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
