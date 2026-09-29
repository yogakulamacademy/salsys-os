import Link from "next/link";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCcw,
} from "lucide-react";

import {
  completeFollowUpAction,
  snoozeFollowUpAction,
} from "@/app/actions/crm";

import { ChannelBadge, PageHeader, StageBadge } from "@/components/ui";

import { getFollowUpsWorkspace } from "@/lib/followups-data";

import { isMockMode } from "@/lib/data";

import { formatDateTime } from "@/lib/format";

type FollowUpsPageProps = {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 50;

export default async function FollowUpsPage({
  searchParams,
}: FollowUpsPageProps) {
  const query = await searchParams;

  const requestedPage = parsePage(query.page);

  const [workspace] = await Promise.all([
    getFollowUpsWorkspace({
      page: requestedPage,
      pageSize: PAGE_SIZE,
    }),
  ]);

  const { tasks, summary, pagination } = workspace;

  const mock = isMockMode();

  return (
    <>
      <PageHeader
        eyebrow="Task queue"
        title="Follow-ups"
        description="Track every promised response, payment check and scheduled lead touch so no enquiry disappears from the funnel."
        actions={
          <span
            className={`rounded-xl px-3 py-2 text-xs font-bold ${
              mock
                ? "bg-orange-50 text-orange-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {mock ? "Mock mode" : "Live task queue"}
          </span>
        }
      />

      {query.error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {query.error}
        </div>
      )}

      {query.notice && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            query.notice.startsWith("mock-")
              ? "border-orange-100 bg-orange-50 text-orange-700"
              : "border-emerald-100 bg-emerald-50 text-emerald-700"
          }`}
        >
          {noticeText(query.notice)}
        </div>
      )}

      {workspace.warning && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          Follow-ups loaded using the legacy fallback. {workspace.warning}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card-pad">
          <div className="text-sm text-slate-500">Due now</div>

          <div className="mt-2 text-3xl font-bold text-slate-950">
            {summary.dueNow.toLocaleString()}
          </div>

          <div className="mt-2 text-xs text-orange-600">
            Open or snoozed tasks at/after due time
          </div>
        </div>

        <div className="card-pad">
          <div className="text-sm text-slate-500">High-intent queue</div>

          <div className="mt-2 text-3xl font-bold text-slate-950">
            {summary.highIntentQueue.toLocaleString()}
          </div>

          <div className="mt-2 text-xs text-slate-400">
            Needs admissions attention
          </div>
        </div>

        <div className="card-pad">
          <div className="text-sm text-slate-500">System state</div>

          <div className="mt-2 text-lg font-bold text-slate-950">
            {mock ? "Testing" : "Persistent + live"}
          </div>

          <div className="mt-2 text-xs text-emerald-600">
            Follow-ups are{" "}
            {mock ? "fictional" : "stored in Supabase and live-refreshed"}
          </div>
        </div>
      </div>

      <div className="mt-4 card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="eyebrow">Priority queue</div>

            <div className="section-title mt-1">Scheduled actions</div>
          </div>

          <div className="text-xs font-semibold text-slate-400">
            {pagination.total === 0
              ? "No due follow-ups"
              : `Showing ${pagination.from.toLocaleString()}–${pagination.to.toLocaleString()} of ${pagination.total.toLocaleString()}`}
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {tasks.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-400">
              No due follow-ups.
            </div>
          )}

          {tasks.map((task) => (
            <div key={task.id} className="flex flex-col gap-4 p-4 sm:px-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <form action={completeFollowUpAction}>
                  <input type="hidden" name="task_id" value={task.id} />

                  <input type="hidden" name="lead_id" value={task.leadId} />

                  <button
                    type="submit"
                    title="Complete follow-up"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-600"
                  >
                    <Check size={16} />
                  </button>
                </form>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/leads/${task.leadId}`}
                      className="font-semibold text-slate-900 hover:text-brand"
                    >
                      {task.leadName}
                    </Link>

                    <span className="text-xs text-slate-400">
                      {task.leadCode}
                    </span>

                    <StageBadge stage={task.stage} />
                  </div>

                  <div className="mt-1 text-sm text-slate-600">
                    {task.title}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <ChannelBadge channel={task.channel} />

                  <div className="flex min-w-[170px] items-center gap-2 text-sm font-medium text-slate-600">
                    <Clock size={15} className="text-slate-400" />

                    {formatDateTime(task.dueAt)}
                  </div>
                </div>
              </div>

              <form
                action={snoozeFollowUpAction}
                className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center"
              >
                <input type="hidden" name="task_id" value={task.id} />

                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <RotateCcw size={14} />
                  Reschedule
                </div>

                <input
                  className="input sm:ml-auto sm:max-w-[250px]"
                  type="datetime-local"
                  name="due_at"
                  required
                />

                <button type="submit" className="btn-secondary">
                  Snooze
                </button>
              </form>
            </div>
          ))}
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-semibold text-slate-500">
              Page {pagination.page} of {pagination.totalPages}
            </div>

            <div className="flex items-center gap-2">
              {pagination.page > 1 ? (
                <Link
                  href={pageHref(pagination.page - 1)}
                  className="btn-secondary !px-3 !py-2"
                >
                  <ChevronLeft size={14} />
                  Previous
                </Link>
              ) : (
                <span className="btn-secondary pointer-events-none !px-3 !py-2 opacity-40">
                  <ChevronLeft size={14} />
                  Previous
                </span>
              )}

              {pagination.page < pagination.totalPages ? (
                <Link
                  href={pageHref(pagination.page + 1)}
                  className="btn-secondary !px-3 !py-2"
                >
                  Next
                  <ChevronRight size={14} />
                </Link>
              ) : (
                <span className="btn-secondary pointer-events-none !px-3 !py-2 opacity-40">
                  Next
                  <ChevronRight size={14} />
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function pageHref(page: number) {
  return `/follow-ups?page=${page}`;
}

function noticeText(notice: string) {
  const messages: Record<string, string> = {
    completed: "Follow-up completed.",
    snoozed: "Follow-up rescheduled.",
    "mock-complete": "Mock mode: task was not changed.",
    "mock-snooze": "Mock mode: task was not changed.",
  };

  return messages[notice] ?? notice;
}
