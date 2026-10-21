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
    <div className={`${styles.workspace} space-y-5`}>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#87998E]">CRM · Operations</div>
          <h1 className="mt-1.5 text-[29px] font-semibold tracking-[-0.04em] text-[#192E29] dark:text-white">
            Leads
          </h1>
          <p className="mt-1 text-[13px] leading-5 text-[#6D7C76]">
            Manage contacts and move opportunities forward.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/leads/new"
            className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-[#216551] px-3.5 text-xs font-semibold text-white shadow-[0_2px_5px_rgba(21,62,51,.12)] transition hover:bg-[#174D3B]"
          >
            <Plus size={14} /> Add lead
          </Link>
          <button
            type="button"
            aria-label="More lead actions"
            className="grid h-9 w-9 place-items-center rounded-[7px] border border-[#E4EAE6] bg-white text-[#6D7C76] transition hover:bg-[#F0F7F3] hover:text-[#216551] dark:border-slate-800 dark:bg-slate-950"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </section>

      {notice === "mock-create" ? (
        <div className="rounded-lg border border-amber-200 bg-[#FCF4E5] px-4 py-3 text-xs font-semibold text-[#9B6720]">
          Demo mode is active, so the test lead was not saved.
        </div>
      ) : null}

      {workspace.warning ? (
        <div className="rounded-lg border border-amber-200 bg-[#FCF4E5] px-4 py-3 text-xs font-semibold text-[#9B6720]">
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
