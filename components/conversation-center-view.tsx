"use client";

import { Activity, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConversationThread } from "@/components/conversation-thread";
import type { Channel, LeadStage } from "@/types/crm";

type ConversationMessage = {
  id: string;
  direction: "inbound" | "outbound";
  sender: string;
  body: string;
  timestamp: string;
  channel: Channel;
  status?: string;
  externalMessageId?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
};

type ActivityRow = {
  id: string;
  activity_type: string;
  channel: string | null;
  actor_type: string;
  actor_id: string | null;
  title: string | null;
  details: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
};

type ActivityResponse =
  | { ok: true; data: ActivityRow[] | ActivityRow }
  | { ok: false; error: string };

type ActivityChangedEvent = CustomEvent<{ leadId?: string }>;

type TimelineItem = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  meta: string;
};

type ViewMode = "conversation" | "activity";

export function ConversationCenterView({
  messages,
  originChannel,
  originTimestamp,
  originCourse,
  originDetail,
  course,
  country,
  stage,
}: {
  messages: ConversationMessage[];
  originChannel?: Channel | string;
  originTimestamp?: string;
  originCourse?: string;
  originDetail?: string;
  course?: string;
  country?: string;
  stage: LeadStage;
}) {
  const searchParams = useSearchParams();
  const queryLeadId = searchParams.get("lead");
  const [resolvedLeadId, setResolvedLeadId] = useState<string | null>(queryLeadId);
  const [view, setView] = useState<ViewMode>("conversation");
  const [crmActivity, setCrmActivity] = useState<ActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    if (queryLeadId) {
      setResolvedLeadId(queryLeadId);
      return;
    }

    const selectedLink = document.querySelector<HTMLAnchorElement>(
      'a[aria-current="page"][href*="/conversations?lead="]',
    );
    if (!selectedLink) {
      setResolvedLeadId(null);
      return;
    }

    try {
      setResolvedLeadId(
        new URL(selectedLink.href, window.location.origin).searchParams.get("lead"),
      );
    } catch {
      setResolvedLeadId(null);
    }
  }, [queryLeadId, messages]);

  const loadActivity = useCallback(async () => {
    if (!resolvedLeadId) {
      setActivityLoaded(true);
      return;
    }

    setActivityLoading(true);
    setActivityError(null);
    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(resolvedLeadId)}/activity`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as ActivityResponse;
      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? "Unable to load activity." : body.error);
      }
      setCrmActivity(
        Array.isArray(body.data) ? body.data : body.data ? [body.data] : [],
      );
      setActivityLoaded(true);
    } catch (reason) {
      setActivityError(
        reason instanceof Error ? reason.message : "Unable to load activity.",
      );
      setActivityLoaded(true);
    } finally {
      setActivityLoading(false);
    }
  }, [resolvedLeadId]);

  useEffect(() => {
    setCrmActivity([]);
    setActivityLoaded(false);
    setActivityError(null);
  }, [resolvedLeadId]);

  useEffect(() => {
    if (view !== "activity" || activityLoaded || activityLoading) return;
    void loadActivity();
  }, [activityLoaded, activityLoading, loadActivity, view]);

  useEffect(() => {
    const onActivityChanged = (event: Event) => {
      const detail = (event as ActivityChangedEvent).detail;
      if (detail?.leadId && detail.leadId !== resolvedLeadId) return;
      setActivityLoaded(false);
    };

    window.addEventListener("crm:activity-changed", onActivityChanged);
    return () => window.removeEventListener("crm:activity-changed", onActivityChanged);
  }, [resolvedLeadId]);

  const activity = useMemo(() => {
    const rows: TimelineItem[] = crmActivity.map((item) => ({
      id: `crm-${item.id}`,
      title: item.title || humanize(item.activity_type),
      detail: item.details || activityDetail(item),
      timestamp: item.occurred_at || item.created_at,
      meta: [humanize(item.activity_type), item.actor_type ? humanize(item.actor_type) : null]
        .filter(Boolean)
        .join(" · "),
    }));

    for (const message of messages) {
      rows.push({
        id: `message-${message.id}`,
        title:
          message.direction === "inbound"
            ? `Inbound ${humanize(message.channel)} message`
            : `Outbound ${humanize(message.channel)} message`,
        detail: message.body,
        timestamp: message.timestamp,
        meta:
          message.direction === "outbound" && message.status
            ? `Admissions · ${humanize(message.status)}`
            : message.sender,
      });
    }

    if (originTimestamp) {
      rows.push({
        id: `origin-${originTimestamp}`,
        title: `${humanize(originChannel || "other")} inquiry created`,
        detail:
          originDetail ||
          (originCourse && originCourse !== "Not selected"
            ? `Lead entered the CRM with course interest: ${originCourse}.`
            : "Lead entered the CRM. No additional origin detail is recorded here."),
        timestamp: originTimestamp,
        meta: "CRM origin evidence",
      });
    }

    return rows
      .filter((item) => Boolean(item.timestamp))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [crmActivity, messages, originChannel, originCourse, originDetail, originTimestamp]);

  const courseSelected = Boolean(course && course !== "Not selected");

  function handleViewKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const activeIndex = tabs.findIndex((tab) => tab === document.activeElement);
    if (activeIndex < 0 || tabs.length === 0) return;

    event.preventDefault();
    let nextIndex = activeIndex;
    if (event.key === "ArrowRight") nextIndex = (activeIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (activeIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;

    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-line bg-surface px-3 sm:px-5">
        <div
          className="grid h-11 grid-cols-2 items-center sm:flex sm:gap-6"
          role="tablist"
          aria-label="Conversation view"
          onKeyDown={handleViewKeyDown}
        >
          <TabButton
            active={view === "conversation"}
            onClick={() => setView("conversation")}
            icon={<MessageCircle size={14} />}
          >
            Conversation
          </TabButton>
          <TabButton
            active={view === "activity"}
            onClick={() => setView("activity")}
            icon={<Activity size={14} />}
          >
            CRM activity
            <span className="ml-1 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-copy-muted">
              {activityLoading ? "…" : activity.length}
            </span>
          </TabButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(#FBFCFB_0%,#FAFCFB_100%)] px-3 py-3.5 sm:px-6 sm:py-5">
        {view === "conversation" ? (
          <ConversationThread
            messages={messages}
            originChannel={originChannel}
            originTimestamp={originTimestamp}
            originCourse={originCourse}
            originDetail={originDetail}
          />
        ) : (
          <div className="mx-auto max-w-2xl">
            {activityLoading ? (
              <div className="mb-4 flex items-center gap-2 rounded-ui border border-line bg-surface px-3 py-2.5 text-[12px] text-copy-muted">
                <RefreshCw size={13} className="animate-spin text-brand-700" />
                Loading CRM activity…
              </div>
            ) : null}

            {activityError ? (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-ui border border-warning/25 bg-warning-soft px-3 py-2.5 text-[12px] text-warning">
                <span>{activityError} Message history is still shown below.</span>
                <button
                  type="button"
                  onClick={() => {
                    setActivityLoaded(false);
                    void loadActivity();
                  }}
                  className="min-h-10 shrink-0 rounded-md border border-warning/30 bg-surface px-3 text-[11px] font-semibold sm:min-h-0 sm:px-2 sm:py-1"
                >
                  Retry
                </button>
              </div>
            ) : null}

            {activity.length ? (
              <ol className="space-y-0" aria-label="Conversation activity">
                {activity.map((item, index) => (
                  <li key={item.id} className="relative flex gap-3 pb-6">
                    {index < activity.length - 1 ? (
                      <span
                        className="absolute bottom-0 left-[5px] top-3 w-px bg-line"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span
                      className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-[3px] border-[#FAFCFB] bg-brand-600"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1 rounded-ui border border-line bg-surface px-3.5 py-3 shadow-[0_1px_2px_rgba(21,62,51,0.03)] sm:px-4 sm:py-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-[13px] font-semibold text-copy-strong">{item.title}</div>
                        <time className="text-[11px] text-copy-subtle" dateTime={item.timestamp}>
                          {formatDateTime(item.timestamp)}
                        </time>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-[12.5px] leading-5 text-copy-muted">
                        {item.detail}
                      </p>
                      <div className="mt-2 text-[11px] text-copy-subtle">{item.meta}</div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : !activityLoading ? (
              <div className="grid min-h-[280px] place-items-center text-center">
                <div>
                  <Activity size={23} className="mx-auto text-brand-600" />
                  <div className="mt-3 text-[13px] font-semibold text-copy-strong">
                    No activity recorded
                  </div>
                  <p className="mt-1 text-[12px] text-copy-muted">
                    CRM activity will appear here when authoritative events exist.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="mx-3 mb-2 shrink-0 rounded-ui border border-line bg-brand-50/50 px-2.5 py-2 sm:mx-5 sm:mb-3 sm:px-3 sm:py-2.5">
        <div className="flex items-start gap-2 text-[11.5px] leading-[18px] text-copy-muted sm:text-[12px] sm:leading-5">
          <Sparkles size={13} className="mt-0.5 shrink-0 text-brand-700 sm:h-[14px] sm:w-[14px]" />
          <div className="min-w-0">
            <strong className="font-semibold text-copy-strong">
              {courseSelected ? "Course interest recorded." : "No course selected."}
            </strong>{" "}
            <span className="hidden sm:inline">
              {courseSelected
                ? `Review ${course} and the latest inquiry before choosing the next action.`
                : "Confirm the lead’s course interest before preparing a specific follow-up."}
            </span>
            {country ? <span className="text-copy-subtle"> · {country}</span> : null}
            <span className="text-copy-subtle"> · {humanize(stage)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`inline-flex h-11 min-w-0 items-center justify-center gap-1.5 border-b-2 px-1 text-[12px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700/30 focus-visible:ring-offset-2 sm:flex-none sm:justify-start sm:px-0 ${
        active
          ? "border-brand-700 font-semibold text-brand-700"
          : "border-transparent text-copy-muted hover:text-copy-strong"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function activityDetail(item: ActivityRow) {
  if (item.details?.trim()) return item.details;

  const dueAt = typeof item.metadata?.due_at === "string" ? item.metadata.due_at : null;
  if (dueAt) return `Due ${formatDateTime(dueAt)}.`;

  return "CRM activity recorded.";
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
