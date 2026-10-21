"use client";

import { Activity, MessageCircle, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

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
  const [view, setView] = useState<ViewMode>("conversation");

  const activity = useMemo(() => {
    const rows = messages.map((message) => ({
      id: message.id,
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
    }));

    if (originTimestamp) {
      rows.unshift({
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

    return rows;
  }, [messages, originChannel, originCourse, originDetail, originTimestamp]);

  const courseSelected = Boolean(course && course !== "Not selected");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[#DCE4DF] bg-white px-5 dark:border-slate-900 dark:bg-slate-950">
        <div className="flex items-center gap-6" role="tablist" aria-label="Conversation view">
          <TabButton active={view === "conversation"} onClick={() => setView("conversation")} icon={<MessageCircle size={13} />}>
            Conversation
          </TabButton>
          <TabButton active={view === "activity"} onClick={() => setView("activity")} icon={<Activity size={13} />}>
            Activity
            <span className="ml-1 rounded bg-[#F0F3EF] px-1.5 py-0.5 text-[8px] font-medium text-[#596E64]">
              {activity.length}
            </span>
          </TabButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(#F9FBF8_0%,#FFFFFF_68%)] px-4 py-5 sm:px-6">
        {view === "conversation" ? (
          <ConversationThread
            messages={messages}
            originChannel={originChannel}
            originTimestamp={originTimestamp}
            originCourse={originCourse}
            originDetail={originDetail}
          />
        ) : activity.length ? (
          <ol className="mx-auto max-w-2xl space-y-0" aria-label="Conversation activity">
            {activity.map((item, index) => (
              <li key={item.id} className="relative flex gap-3 pb-6">
                {index < activity.length - 1 ? (
                  <span className="absolute bottom-0 left-[5px] top-3 w-px bg-[#DCE4DF]" aria-hidden="true" />
                ) : null}
                <span className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-[3px] border-[#F9FBF8] bg-[#719269]" aria-hidden="true" />
                <div className="min-w-0 flex-1 rounded-lg border border-[#E2E8E3] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(21,62,51,0.03)]">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="text-[11px] font-semibold text-[#18362D]">{item.title}</div>
                    <time className="text-[9px] text-[#71847A]" dateTime={item.timestamp}>
                      {formatDateTime(item.timestamp)}
                    </time>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-[10px] leading-5 text-[#596E64]">
                    {item.detail}
                  </p>
                  <div className="mt-2 text-[9px] text-[#829087]">{item.meta}</div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="grid min-h-[260px] place-items-center text-center">
            <div>
              <Activity size={22} className="mx-auto text-[#719269]" />
              <div className="mt-3 text-xs font-semibold text-[#18362D]">No activity recorded</div>
              <p className="mt-1 text-[10px] text-[#596E64]">CRM activity will appear here when authoritative events exist.</p>
            </div>
          </div>
        )}
      </div>

      <div className="mx-4 mb-3 shrink-0 rounded-lg border border-[#E1E8DC] bg-[#F5F7F2] px-3 py-2.5 sm:mx-5">
        <div className="flex items-start gap-2 text-[10px] leading-5 text-[#596E64]">
          <Sparkles size={13} className="mt-0.5 shrink-0 text-[#216551]" />
          <div className="min-w-0">
            <strong className="font-semibold text-[#18362D]">
              {courseSelected ? "Course interest recorded." : "No course selected."}
            </strong>{" "}
            {courseSelected
              ? `Review ${course} and the latest inquiry before choosing the next action.`
              : "Confirm the lead’s course interest before preparing a specific follow-up."}
            {country ? <span className="text-[#71847A]"> · {country}</span> : null}
            <span className="text-[#71847A]"> · {humanize(stage)}</span>
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
      className={`inline-flex h-11 items-center gap-1.5 border-b-2 text-[10px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#216551] focus-visible:ring-offset-2 ${
        active
          ? "border-[#216551] font-semibold text-[#216551]"
          : "border-transparent text-[#596E64] hover:text-[#18362D]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
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
