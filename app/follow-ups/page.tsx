import type { ReactNode } from "react";

import Link from "next/link";

import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCcw,
  Sparkles,
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

  const workspace = await getFollowUpsWorkspace({
    page: requestedPage,
    pageSize: PAGE_SIZE,
  });

  const { tasks, summary, pagination } = workspace;
  const mock = isMockMode();

  return (
    <div className="followups-polish">
      <PageHeader
        eyebrow="Task queue"
        title="Follow-ups"
        description="Keep every promised response, payment check and scheduled lead touch visible until it is completed."
        actions={
          <span
            className={`followups-live-badge ${
              mock ? "followups-live-badge-mock" : "followups-live-badge-active"
            }`}
          >
            <span className="followups-live-dot" />
            {mock ? "Mock mode" : "Live queue"}
          </span>
        }
      />

      {query.error && (
        <div className="followups-notice followups-notice-error">
          {query.error}
        </div>
      )}

      {query.notice && (
        <div
          className={`followups-notice ${
            query.notice.startsWith("mock-")
              ? "followups-notice-warning"
              : "followups-notice-success"
          }`}
        >
          {noticeText(query.notice)}
        </div>
      )}

      {workspace.warning && (
        <div className="followups-notice followups-notice-warning">
          Follow-ups loaded using the legacy fallback. {workspace.warning}
        </div>
      )}

      <section className="followups-summary-grid">
        <FollowUpSummaryCard
          label="Due now"
          value={summary.dueNow.toLocaleString()}
          note="Open or snoozed tasks at or after their due time"
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
          label="Queue status"
          value={mock ? "Testing" : "Live"}
          note={
            mock
              ? "Changes are not persisted in mock mode"
              : "Tasks are stored in Supabase and refreshed live"
          }
          tone="healthy"
          icon={<CheckCircle2 size={17} />}
        />
      </section>

      <section className="followups-queue">
        <header className="followups-queue-header">
          <div>
            <div className="eyebrow">Priority queue</div>
            <div className="section-title mt-1">Scheduled actions</div>
            <p className="followups-queue-description">
              Work the most time-sensitive tasks first, then reschedule anything
              that genuinely needs a later touch.
            </p>
          </div>

          <div className="followups-count-pill">
            {pagination.total === 0
              ? "No due follow-ups"
              : `${pagination.from.toLocaleString()}–${pagination.to.toLocaleString()} of ${pagination.total.toLocaleString()}`}
          </div>
        </header>

        <div className="followups-task-list">
          {tasks.length === 0 ? (
            <div className="followups-empty-state">
              <div className="followups-empty-icon">
                <CheckCircle2 size={20} />
              </div>
              <div className="followups-empty-title">You’re caught up</div>
              <p>No due follow-ups are waiting in the queue.</p>
            </div>
          ) : (
            tasks.map((task) => (
              <article key={task.id} className="followup-task-row">
                <div className="followup-task-main">
                  <form action={completeFollowUpAction}>
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="lead_id" value={task.leadId} />

                    <button
                      type="submit"
                      title="Complete follow-up"
                      aria-label={`Complete follow-up for ${task.leadName}`}
                      className="followup-complete-button"
                    >
                      <Check size={16} />
                    </button>
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
                        </div>

                        <div className="followup-task-title">{task.title}</div>
                      </div>

                      <div className="followup-task-meta">
                        <ChannelBadge channel={task.channel} />
                        <span className="followup-due-time">
                          <Clock size={14} />
                          {formatDateTime(task.dueAt)}
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

                      <form
                        action={snoozeFollowUpAction}
                        className="followup-reschedule-form"
                      >
                        <input type="hidden" name="task_id" value={task.id} />

                        <span className="followup-reschedule-label">
                          <RotateCcw size={13} />
                          Reschedule
                        </span>

                        <input
                          className="followup-reschedule-input"
                          type="datetime-local"
                          name="due_at"
                          required
                          aria-label={`New follow-up time for ${task.leadName}`}
                        />

                        <button
                          type="submit"
                          className="followup-snooze-button"
                        >
                          Snooze
                        </button>
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
