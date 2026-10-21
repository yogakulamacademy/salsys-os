"use client";

import Link from "next/link";
import { Flag, MessageCircle, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Channel, LeadStage } from "@/types/crm";

export type ConversationPriority = "urgent" | "high" | "normal" | "waiting";

export type ConversationLeadSummary = {
  id: string;
  name: string;
  course: string;
  country: string;
  stage: LeadStage;
  currentContactChannel: Channel;
  lastContactedAt: string | null;
  unread: boolean;
  needsReply: boolean;
  needsFirstContact: boolean;
  priority: ConversationPriority;
  waitingSince: string | null;
};

type InboxFilter = "all" | "reply" | "unread";

export function ConversationsSidebar({
  leads,
  selectedId,
}: {
  leads: ConversationLeadSummary[];
  selectedId?: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [now, setNow] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select") ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const unreadCount = leads.filter((lead) => lead.unread).length;
  const replyCount = leads.filter((lead) => lead.needsReply).length;
  const priorityCount = leads.filter(
    (lead) => lead.priority === "urgent" || lead.priority === "high",
  ).length;

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();

    return leads.filter((lead) => {
      if (filter === "reply" && !lead.needsReply) return false;
      if (filter === "unread" && !lead.unread) return false;
      if (
        priorityOnly &&
        lead.priority !== "urgent" &&
        lead.priority !== "high"
      ) {
        return false;
      }

      if (!query) return true;

      return [
        lead.name,
        lead.course,
        lead.country,
        lead.stage,
        lead.currentContactChannel,
        lead.priority,
      ]
        .filter(Boolean)
        .join(" ")
        .replaceAll("_", " ")
        .toLowerCase()
        .includes(query);
    });
  }, [filter, leads, priorityOnly, search]);

  function handleFilterKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

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
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-slate-950">
      <div className="shrink-0 px-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-semibold text-[#18362D] dark:text-white">
            Your inbox
          </div>
          <div className="text-[10px] font-medium text-[#596E64] dark:text-slate-400">
            {leads.length} conversations
          </div>
        </div>

        <label className="relative mt-3 block">
          <span className="sr-only">Search conversations</span>
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#71847A]"
          />
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations…"
            className="h-9 w-full rounded-lg border border-[#D7E0D9] bg-[#FCFDFB] pl-9 pr-14 text-[11px] text-[#18362D] outline-none transition placeholder:text-[#71847A] focus:border-[#216551] focus:ring-2 focus:ring-[#216551]/15 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
          {!search ? (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[#DCE4DF] bg-white px-1.5 py-0.5 text-[9px] font-medium text-[#71847A] dark:border-slate-700 dark:bg-slate-950">
              /
            </kbd>
          ) : (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-[#71847A] hover:bg-[#EDF3E6] hover:text-[#216551]"
              aria-label="Clear conversation search"
            >
              <X size={12} />
            </button>
          )}
        </label>

        <div
          className="mt-3 grid grid-cols-3 border-b border-[#DCE4DF]"
          role="tablist"
          aria-label="Conversation filters"
          onKeyDown={handleFilterKeyDown}
        >
          <InboxTab
            active={filter === "all"}
            onClick={() => setFilter("all")}
            count={leads.length}
          >
            All
          </InboxTab>
          <InboxTab
            active={filter === "reply"}
            onClick={() => setFilter("reply")}
            count={replyCount}
          >
            Needs reply
          </InboxTab>
          <InboxTab
            active={filter === "unread"}
            onClick={() => setFilter("unread")}
            count={unreadCount}
          >
            Unread
          </InboxTab>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#DCE4DF] px-4 py-2.5 text-[9px] text-[#596E64] dark:border-slate-900 dark:text-slate-400">
        <span aria-live="polite">
          {filteredLeads.length} conversation{filteredLeads.length === 1 ? "" : "s"}
        </span>
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Priority filter</span>
          <select
            value={priorityOnly ? "priority" : "all"}
            onChange={(event) => setPriorityOnly(event.target.value === "priority")}
            className="h-7 rounded-md border border-transparent bg-white px-1.5 text-[10px] text-[#596E64] outline-none focus:border-[#216551] focus:ring-2 focus:ring-[#216551]/15 dark:bg-slate-950 dark:text-slate-300"
          >
            <option value="all">All priorities</option>
            <option value="priority">Priority only ({priorityCount})</option>
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]">
        {filteredLeads.length === 0 ? (
          <div className="grid min-h-[260px] place-items-center px-5 text-center">
            <div>
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[#EDF3E6] text-[#216551] dark:bg-slate-900">
                <MessageCircle size={17} />
              </div>
              <div className="mt-3 text-xs font-semibold text-[#18362D] dark:text-slate-200">
                {filter === "unread" && !search && !priorityOnly
                  ? "You’re all caught up"
                  : "No matching conversations"}
              </div>
              <div className="mt-1 text-[10px] leading-5 text-[#596E64] dark:text-slate-400">
                {filter === "unread" && !search && !priorityOnly
                  ? "There are no unread conversations right now."
                  : "Try another search or remove a filter."}
              </div>
              {search || filter !== "all" || priorityOnly ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                    setPriorityOnly(false);
                  }}
                  className="mt-3 rounded-lg border border-[#D7E0D9] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#216551] hover:bg-[#EDF3E6] dark:border-slate-800 dark:bg-slate-950"
                >
                  View all conversations
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <ConversationRow
              key={lead.id}
              lead={lead}
              selected={lead.id === selectedId}
              now={now}
            />
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-[#DCE4DF] px-4 py-2.5 text-[9px] text-[#71847A] dark:border-slate-900 dark:text-slate-500">
        Search and filters do not change CRM records.
      </div>
    </aside>
  );
}

function ConversationRow({
  lead,
  selected,
  now,
}: {
  lead: ConversationLeadSummary;
  selected: boolean;
  now: number;
}) {
  const highPriority = lead.priority === "urgent" || lead.priority === "high";
  const stage = lead.stage.replaceAll("_", " ");
  const sourceLabel = lead.currentContactChannel.replaceAll("_", " ");
  const contextPreview =
    lead.course && lead.course !== "Not selected"
      ? lead.course
      : `${sourceLabel} inquiry · Course not selected`;

  return (
    <Link
      href={`/conversations?lead=${lead.id}`}
      aria-current={selected ? "page" : undefined}
      className={`group relative mb-1 block rounded-lg border px-3 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#216551] focus-visible:ring-offset-1 ${
        selected
          ? "border-[#DCE6D1] bg-[#EDF3E6] dark:border-emerald-900/40 dark:bg-emerald-950/15"
          : "border-transparent bg-white hover:bg-[#F6F8F7] dark:bg-slate-950 dark:hover:bg-slate-900/50"
      }`}
    >
      {selected ? (
        <span className="absolute bottom-4 left-0 top-4 w-[3px] rounded-r-full bg-[#216551]" />
      ) : null}

      <div className="flex gap-2.5">
        <div
          className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
            selected
              ? "bg-[#D7E3C9] text-[#216551]"
              : "bg-[#EDF1EB] text-[#596E64] dark:bg-slate-900 dark:text-slate-300"
          }`}
        >
          {initials(lead.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-[12px] font-semibold text-[#18362D] dark:text-slate-100">
              {lead.unread ? (
                <span
                  className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#216551] align-middle"
                  aria-label="Unread"
                />
              ) : null}
              {lead.name}
            </div>
            <div className="shrink-0 text-[9px] text-[#71847A] dark:text-slate-500">
              {lead.lastContactedAt
                ? formatListTime(lead.lastContactedAt, now)
                : "New"}
            </div>
          </div>

          <div className="mt-1 truncate text-[10px] capitalize text-[#596E64] dark:text-slate-400">
            {contextPreview}
          </div>

          <div className="mt-2.5 flex min-w-0 items-center gap-1.5">
            {lead.needsReply ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-[#825018]">
                <span className="h-1 w-1 rounded-full bg-[#9B6B25]" /> Needs reply
              </span>
            ) : lead.needsFirstContact ? (
              <span className="text-[9px] font-semibold text-sky-700">First contact</span>
            ) : (
              <span className="text-[9px] text-[#71847A]">Reviewed</span>
            )}

            <span className="max-w-[108px] truncate rounded border border-[#D6E1D0] bg-[#F1F5ED] px-1.5 py-0.5 text-[9px] font-medium capitalize leading-none text-[#365844] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              {stage}
            </span>

            {highPriority ? (
              <span
                className="ml-auto inline-flex shrink-0 items-center text-[#825018]"
                title={`${lead.priority} priority`}
                aria-label={`${lead.priority} priority`}
              >
                <Flag size={12} />
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

function InboxTab({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`border-b-2 px-1 pb-2.5 pt-1 text-[10px] transition ${
        active
          ? "border-[#216551] font-semibold text-[#153E33]"
          : "border-transparent text-[#596E64] hover:text-[#18362D]"
      }`}
    >
      {children}
      <span className="ml-1 rounded bg-[#F0F3EF] px-1 py-0.5 text-[9px] font-medium text-[#596E64]">
        {count}
      </span>
    </button>
  );
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((part) => Array.from(part)[0] ?? "")
      .slice(0, 2)
      .join("")
      .toLocaleUpperCase("en-IN") || "?"
  );
}

function formatListTime(value: string, now: number) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || now <= 0) return "—";

  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(new Date(timestamp));
}
