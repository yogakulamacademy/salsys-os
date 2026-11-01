import type { ReactNode } from "react";

import Link from "next/link";

import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { completeFollowUpAction } from "@/app/actions/crm";
import { snoozeFollowUpFromQueueAction } from "@/app/follow-ups/actions";

import { SubmitButton } from "@/components/submit-button";
import {
  ChannelBadge,
  EmptyState,
  Notice,
  PageHeader,
  StageBadge,
} from "@/components/ui";
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

  const workspace = await getFollowUpsWorkspace({
    page: requestedPage,
    pageSize: PAGE_SIZE,
  });

  const { tasks, summary, pagination } = workspace;
  const mock = isMockMode();
  const queueStatus = mock ? "Testing" : workspace.fallback ? "Fallback" : "Live";
  const queueStatusNote = mock
    ? "Changes are not persisted in mock mode"
    : workspace.fallback
      ? "Canonical queue unavailable; compatibility data is shown with reduced task-type detail"
      : "Canonical tenant-scoped due-task queue from Supabase";

  return (
    <div className="followups-polish">
      <PageHeader
        eyebrow="Sales · Tasks & Follow-ups"
        title="Tasks & Follow-ups"
        description="Keep every promised response, payment verification and scheduled customer touch visible until it is completed."
        actions={
          <span
            className={`followups-live-badge ${
              mock || workspace.fallback
                ? "followups-live-badge-mock"
                : "followups-live-badge-active"
            }`}
          >
            <span className="followups-live-dot" />
            {mock ? "Mock mode" : workspace.fallback ? "Fallback queue" : "Live queue"}
          </span>
        }
      />

      {query.error ? <Notice tone="error">{query.error}</Notice> : null}

      {query.notice ? (
        <Notice tone={query.notice.startsWith("mock-") ? "warning" : "success"}>
          {noticeText(query.notice)}
        </Notice>
      ) : null}

      {workspace.warning ? (
        <Notice tone="warning" title="Fallback data source">
          Tasks loaded using the legacy fallback. {workspace.warning}
        </Notice>
      ) : null}

      {requestedPage !== pagination.page && pagination.total > 0 ? (
        <Notice tone="warning" title="Page adjusted">
          Page {requestedPage.toLocaleString()} is outside the current queue. Showing page {pagination.page.toLocaleString()} of {pagination.totalPages.toLocaleString()} instead.
        </Notice>
      ) : null}

      <section className="followups-summary-grid">
        <FollowUpSummaryCard
          label="Due now"
          value={summary.dueNow.toLocaleString()}
          note="Open or rescheduled tasks whose due time has arrived or passed"
          tone="urgent"
          icon={<Clock size={17} />}
        />

        <FollowUpSummaryCard
          label="High-intent queue"
          value={summary.highIntentQueue.toLocaleString()}
          note="Priority opportunities that need admissions attention"
          tone="priority"
          icon={<Sparkles size={17} />}
        />

        <FollowUpSummaryCard
          label="Payment checks"
          value={summary.paymentChecks.toLocaleString()}
          note={
            workspace.fallback
              ? "Not classified separately by the compatibility queue"
              : "Customer-reported payments waiting for verification"
          }
          tone={summary.paymentChecks > 0 ? "priority" : "healthy"}
          icon={<CircleDollarSign size={17} />}
        />

        <FollowUpSummaryCard
          label="Queue status"
          value={queueStatus}
          note={queueStatusNote}
          tone={workspace.fallback ? "priority" : "healthy"}
          icon={<CheckCircle2 size={17} />}
        />
      </section>

      <section className="followups-queue">
        <header className="followups-queue-header">
          <div>
            <div className="eyebrow">Priority queue</div>
            <div className="section-title mt-1">Scheduled actions</div>
            <p className="followups-queue-description">
              Work the most time-sensitive tasks first, verify reported payments,
              then reschedule anything that genuinely needs a later touch.
            </p>
          </div>

          <div className="followups-count-pill">
            {pagination.total === 0
              ? "No due tasks"
              : `${pagination.from.toLocaleString()}–${pagination.to.toLocaleString()} of ${pagination.total.toLocaleString()}`}
          </div>
        </header>

        <div className="followups-task-list">
          {tasks.length === 0 ? (
            <div className="px-5 py-8">
              <EmptyState
                title="You’re caught up"
                description="No due tasks are waiting in the queue."
                icon={<CheckCircle2 size={20} />}
                compact
              />
            </div>
          ) : (
            tasks.map((task) => (
              <article key={task.id} className="followup-task-row">
                <div className="followup-task-main">
                  <form action={completeFollowUpAction}>
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="lead_id" value={task.leadId} />

                    <SubmitButton
                      pendingLabel=""
                      title="Complete task"
                      aria-label={`Complete task for ${task.leadName}`}
                      className="followup-complete-button"
                    >
                      <Check size={16} aria-hidden="true" />
                    </SubmitButton>
                  </form>

                  <div className="followup-task-content">
                    <div className="followup-task-title-row">
                      <div className="min-w-0">
                        <div className="followup-task-lead-row">
                          <Link
                            href={`/leads/${task.leadId}`}
                            className="followup-task-lead"
                          >
                            {task.leadName}
                          </Link>

                          {task.leadCode ? (
                            <span className="followup-lead-code">
                              {task.leadCode}
                            </span>
                          ) : null}

                          <StageBadge stage={task.stage} />
                          <TaskTypeBadge taskType={task.taskType} />
                        </div>

                        <div className="followup-task-title">{task.title}</div>
                      </div>

                      <div className="followup-task-meta">
                        <ChannelBadge channel={task.channel} />
                        <span className="followup-due-time">
                          <Clock size={14} />
                          {formatDateTime(task.dueAt)} IST
                        </span>
                      </div>
                    </div>

                    <div className="followup-task-actions">
                      <Link
                        href={`/conversations?lead=${task.leadId}`}
                        className="followup-conversation-link"
                      >
                        Open conversation
                      </Link>

                      {task.taskType === "payment_check" ? (
                        <Link
                          href={`/leads/${task.leadId}`}
                          className="followup-conversation-link"
                        >
                          Review payment
                        </Link>
                      ) : null}

                      <form
                        action={snoozeFollowUpFromQueueAction}
                        className="followup-reschedule-form"
                      >
                        <input type="hidden" name="task_id" value={task.id} />

                        <span className="followup-reschedule-label">
                          <RotateCcw size={13} />
                          Reschedule (IST)
                        </span>

                        <input
                          className="followup-reschedule-input"
                          type="datetime-local"
                          name="due_at"
                          required
                          aria-label={`New task time in IST for ${task.leadName}`}
                        />

                        <SubmitButton
                          pendingLabel="Saving..."
                          className="followup-snooze-button"
                        >
                          Reschedule
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        {pagination.totalPages > 1 && (
          <footer className="followups-pagination">
            <div className="followups-pagination-copy">
              Page {pagination.page} of {pagination.totalPages}
            </div>

            <div className="followups-pagination-actions">
              {pagination.page > 1 ? (
                <Link
                  href={pageHref(pagination.page - 1)}
                  className="followups-page-button"
                >
                  <ChevronLeft size={14} />
                  Previous
                </Link>
              ) : (
                <span className="followups-page-button followups-page-button-disabled">
                  <ChevronLeft size={14} />
                  Previous
                </span>
              )}

              {pagination.page < pagination.totalPages ? (
                <Link
                  href={pageHref(pagination.page + 1)}
                  className="followups-page-button"
                >
                  Next
                  <ChevronRight size={14} />
                </Link>
              ) : (
                <span className="followups-page-button followups-page-button-disabled">
                  Next
                  <ChevronRight size={14} />
                </span>
              )}
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}

function FollowUpSummaryCard({
  label,
  value,
  note,
  tone,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  tone: "urgent" | "priority" | "healthy";
  icon: ReactNode;
}) {
  return (
    <div className={`followups-summary-card followups-summary-card-${tone}`}>
      <div className="followups-summary-topline">
        <span className="followups-summary-icon">{icon}</span>
        <span className="followups-summary-label">{label}</span>
      </div>
      <div className="followups-summary-value">{value}</div>
      <div className="followups-summary-note">{note}</div>
    </div>
  );
}

function TaskTypeBadge({ taskType }: { taskType: string }) {
  if (taskType === "payment_check") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-700">
        <CircleDollarSign size={10} /> Payment verification
      </span>
    );
  }

  if (taskType === "human_review") {
    return (
      <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[9px] font-semibold text-violet-700">
        Human review
      </span>
    );
  }

  if (taskType === "call") {
    return (
      <span className="rounded-md border border-line bg-surface-soft px-2 py-1 text-[9px] font-semibold text-copy-muted">
        Call
      </span>
    );
  }

  return null;
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
    completed: "Task completed.",
    snoozed: "Task rescheduled.",
    "mock-complete": "Mock mode: task was not changed.",
    "mock-snooze": "Mock mode: task was not changed.",
  };

  return messages[notice] ?? notice;
}
