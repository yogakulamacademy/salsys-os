"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Clock3, Flag, MessageCircle, Search, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Channel, LeadStage } from "@/types/crm";

export type ConversationPriority = "urgent" | "high" | "normal" | "waiting";

export type ConversationLeadSummary = {
  id: string;
  personId?: string | null;
  opportunityCount?: number;
  relatedLeadIds?: string[];
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
  ownerUserId: string | null;
  ownerName: string | null;
  snoozedUntil: string | null;
};

type InboxFilter = "all" | "reply" | "unread" | "snoozed";
type ScopeFilter = "mine" | "team" | "unassigned";
type PriorityFilter = "all" | ConversationPriority;
type ChannelFilter = "all" | "website" | "instagram" | "whatsapp";

export function ConversationsSidebar({
  leads,
  selectedId,
  currentUserId,
  canManageAssignments,
}: {
  leads: ConversationLeadSummary[];
  selectedId?: string;
  currentUserId: string | null;
  canManageAssignments: boolean;
}) {
  const searchParams = useSearchParams();
  const explicitLeadId = searchParams.get("lead");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<ScopeFilter>(
    currentUserId && !canManageAssignments ? "mine" : "team",
  );
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [now, setNow] = useState(0);
  const [mobileViewport, setMobileViewport] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 620px)");
    const update = () => setMobileViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
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
      if (target?.matches("input, textarea, select") || target?.isContentEditable) {
        return;
      }

      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const scopedLeads = useMemo(
    () => leads.filter((lead) => matchesScope(lead, scope, currentUserId)),
    [currentUserId, leads, scope],
  );

  const activeScopedLeads = scopedLeads.filter((lead) => !isSnoozed(lead, now));
  const unreadCount = activeScopedLeads.filter((lead) => lead.unread).length;
  const replyCount = activeScopedLeads.filter(
    (lead) => lead.needsReply || lead.needsFirstContact,
  ).length;
  const snoozedCount = scopedLeads.filter((lead) => isSnoozed(lead, now)).length;

  const mineCount = leads.filter(
    (lead) => !isSnoozed(lead, now) && Boolean(currentUserId) && lead.ownerUserId === currentUserId,
  ).length;
  const teamCount = leads.filter((lead) => !isSnoozed(lead, now)).length;
  const unassignedCount = leads.filter(
    (lead) => !isSnoozed(lead, now) && !lead.ownerUserId,
  ).length;

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();

    return leads.filter((lead) => {
      const selectedOutsideScope =
        lead.id === selectedId || Boolean(selectedId && lead.relatedLeadIds?.includes(selectedId));
      if (!matchesScope(lead, scope, currentUserId) && !selectedOutsideScope) return false;

      const snoozed = isSnoozed(lead, now);
      if (filter === "snoozed" && !snoozed) return false;
      if (filter !== "snoozed" && snoozed) return false;
      if (filter === "reply" && !lead.needsReply && !lead.needsFirstContact) return false;
      if (filter === "unread" && !lead.unread) return false;
      if (priorityFilter !== "all" && lead.priority !== priorityFilter) return false;
      if (channelFilter !== "all" && lead.currentContactChannel !== channelFilter) return false;

      if (!query) return true;

      return [
        lead.name,
        lead.course,
        lead.country,
        lead.stage,
        lead.currentContactChannel,
        lead.priority,
        lead.ownerName,
      ]
        .filter(Boolean)
        .join(" ")
        .replaceAll("_", " ")
        .toLowerCase()
        .includes(query);
    });
  }, [channelFilter, currentUserId, filter, leads, now, priorityFilter, scope, search, selectedId]);

  function handleFilterKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
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

  const hasFilters = Boolean(
    search ||
      scope !== (currentUserId && !canManageAssignments ? "mine" : "team") ||
      filter !== "all" ||
      priorityFilter !== "all" ||
      channelFilter !== "all",
  );

  return (
    <aside className="conversation-sidebar flex h-full min-h-0 flex-col overflow-hidden bg-surface">
      <div className="shrink-0 border-b border-line px-4 pb-0 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold tracking-[-0.02em] text-copy-strong">
              Inbox queue
            </div>
            <div className="mt-1 text-[11.5px] leading-5 text-copy-muted">
              One Contact per row · Opportunity context stays selectable
            </div>
          </div>
          <span className="rounded-md bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700">
            {activeScopedLeads.length}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 rounded-ui bg-surface-soft p-1" aria-label="Inbox ownership scope">
          <ScopeButton
            active={scope === "mine"}
            onClick={() => setScope("mine")}
            count={mineCount}
            disabled={!currentUserId}
          >
            My inbox
          </ScopeButton>
          <ScopeButton active={scope === "team"} onClick={() => setScope("team")} count={teamCount}>
            Team
          </ScopeButton>
          <ScopeButton
            active={scope === "unassigned"}
            onClick={() => setScope("unassigned")}
            count={unassignedCount}
          >
            Unassigned
          </ScopeButton>
        </div>

        <label className="relative mt-3 block">
          <span className="sr-only">Search conversations</span>
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-copy-subtle"
          />
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search contacts, course, owner…"
            className="h-10 w-full rounded-ui border border-line bg-surface-soft pl-9 pr-14 text-[13px] text-copy-strong outline-none transition placeholder:text-copy-subtle focus:border-brand-600 focus:bg-surface focus:ring-2 focus:ring-brand-700/10"
          />
          {!search ? (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-copy-subtle">
              /
            </kbd>
          ) : (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-copy-subtle transition hover:bg-brand-50 hover:text-brand-700"
              aria-label="Clear conversation search"
            >
              <X size={13} />
            </button>
          )}
        </label>

        <div
          className="mt-3 grid grid-cols-4"
          role="tablist"
          aria-label="Conversation filters"
          onKeyDown={handleFilterKeyDown}
        >
          <InboxTab active={filter === "all"} onClick={() => setFilter("all")} count={activeScopedLeads.length}>
            All
          </InboxTab>
          <InboxTab active={filter === "reply"} onClick={() => setFilter("reply")} count={replyCount}>
            Reply
          </InboxTab>
          <InboxTab active={filter === "unread"} onClick={() => setFilter("unread")} count={unreadCount}>
            Unread
          </InboxTab>
          <InboxTab active={filter === "snoozed"} onClick={() => setFilter("snoozed")} count={snoozedCount}>
            Snoozed
          </InboxTab>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-line bg-surface px-4 py-2.5">
        <label className="min-w-0">
          <span className="sr-only">Channel filter</span>
          <select
            value={channelFilter}
            onChange={(event) => setChannelFilter(event.target.value as ChannelFilter)}
            className="h-8 w-full rounded-md border border-line bg-surface-soft px-2 text-[11px] font-medium text-copy-muted outline-none focus:border-brand-600 focus:text-brand-700"
          >
            <option value="all">All channels</option>
            <option value="website">Website</option>
            <option value="instagram">Instagram</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">Priority filter</span>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
            className="h-8 w-full rounded-md border border-line bg-surface-soft px-2 text-[11px] font-medium text-copy-muted outline-none focus:border-brand-600 focus:text-brand-700"
          >
            <option value="all">All priorities</option>
            <option value="urgent">Urgent only</option>
            <option value="high">High priority</option>
            <option value="normal">Normal priority</option>
            <option value="waiting">Waiting</option>
          </select>
        </label>
        <span className="col-span-2 text-right text-[10.5px] text-copy-subtle" aria-live="polite">
          {filteredLeads.length} contacts shown
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        {filteredLeads.length === 0 ? (
          <div className="grid min-h-[280px] place-items-center px-6 text-center">
            <div>
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
                {filter === "snoozed" ? <Clock3 size={18} /> : <MessageCircle size={18} />}
              </div>
              <div className="mt-3 text-[13px] font-semibold text-copy-strong">
                {filter === "snoozed"
                  ? "Nothing snoozed"
                  : filter === "unread" && !search && priorityFilter === "all" && channelFilter === "all"
                    ? "You’re all caught up"
                    : "No matching conversations"}
              </div>
              <div className="mt-1 text-[12px] leading-5 text-copy-muted">
                {filter === "snoozed"
                  ? "Snoozed conversations return automatically when their timer expires."
                  : "Try another ownership scope, search or filter."}
              </div>
              {hasFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setScope(currentUserId && !canManageAssignments ? "mine" : "team");
                    setFilter("all");
                    setPriorityFilter("all");
                    setChannelFilter("all");
                  }}
                  className="mt-3 rounded-ui border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-brand-700 transition hover:bg-brand-50"
                >
                  Reset inbox filters
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          filteredLeads.map((lead) => {
            const selected =
              (lead.id === selectedId || Boolean(selectedId && lead.relatedLeadIds?.includes(selectedId))) &&
              (!mobileViewport || explicitLeadId === lead.id || Boolean(explicitLeadId && lead.relatedLeadIds?.includes(explicitLeadId)));

            return <ConversationRow key={lead.personId || lead.id} lead={lead} selected={selected} now={now} />;
          })
        )}
      </div>

      <div className="shrink-0 border-t border-line px-4 py-2.5 text-[11px] text-copy-subtle">
        <span className="inline-flex items-center gap-1.5">
          <UsersRound size={12} /> Contact identity is shared · opportunity context remains lead-scoped
        </span>
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
  const snoozed = isSnoozed(lead, now);
  const waiting = lead.waitingSince && (lead.needsReply || lead.needsFirstContact)
    ? formatWaitingTime(lead.waitingSince, now)
    : null;
  const otherOpportunities = Math.max(0, (lead.opportunityCount ?? 1) - 1);

  return (
    <Link
      href={`/conversations?lead=${lead.id}`}
      aria-current={selected ? "page" : undefined}
      className={`group relative block border-b border-line/70 px-4 py-3.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-700/40 ${
        selected ? "bg-brand-50" : "bg-surface hover:bg-surface-soft"
      }`}
    >
      {selected ? (
        <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-brand-700" />
      ) : null}

      <div className="flex gap-2.5">
        <div
          className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
            selected ? "bg-brand-100 text-brand-700" : "bg-surface-muted text-copy-muted"
          }`}
        >
          {initials(lead.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-copy-strong">
              {lead.unread ? (
                <span
                  className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-brand-600 align-middle"
                  aria-label="Unread"
                />
              ) : null}
              {lead.name}
            </div>
            {otherOpportunities > 0 ? (
              <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-brand-700">
                +{otherOpportunities} opp
              </span>
            ) : null}
            {highPriority ? (
              <Flag
                size={12}
                className={lead.priority === "urgent" ? "shrink-0 text-danger" : "shrink-0 text-warning"}
                aria-label={`${lead.priority} priority`}
              />
            ) : null}
            <div className="shrink-0 text-[10.5px] text-copy-subtle">
              {lead.lastContactedAt ? formatListTime(lead.lastContactedAt, now) : "New"}
            </div>
          </div>

          <div className="mt-1 truncate text-[12px] text-copy-muted">{contextPreview}</div>

          <div className="mt-2 flex min-w-0 items-center gap-1.5">
            {snoozed ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-copy-muted">
                <Clock3 size={10} /> {formatSnooze(lead.snoozedUntil)}
              </span>
            ) : lead.needsReply ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-warning/20 bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-warning">
                Needs reply
              </span>
            ) : lead.needsFirstContact ? (
              <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-sky-700">
                First contact
              </span>
            ) : (
              <span className="text-[10.5px] text-copy-subtle">Reviewed</span>
            )}

            {waiting && !snoozed ? (
              <span className={`text-[10px] font-medium ${lead.priority === "urgent" ? "text-danger" : lead.priority === "high" ? "text-warning" : "text-copy-subtle"}`}>
                Waiting {waiting}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex min-w-0 items-center gap-1.5">
            <span className="max-w-[118px] truncate rounded-md border border-line bg-surface-soft px-1.5 py-0.5 text-[10.5px] font-medium capitalize text-copy-muted">
              {stage}
            </span>
            <span className={`truncate text-[10.5px] font-medium ${lead.ownerUserId ? "text-copy-muted" : "text-warning"}`}>
              {lead.ownerName || "Unassigned"}
            </span>
            <span className="ml-auto truncate text-[10px] capitalize text-copy-subtle">
              {sourceLabel}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ScopeButton({
  active,
  onClick,
  count,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-surface text-brand-700 shadow-sm"
          : "text-copy-muted hover:text-copy-strong"
      }`}
    >
      {children} <span className="ml-0.5 text-[10px] opacity-70">{count}</span>
    </button>
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
      className={`border-b-2 px-1 pb-2.5 pt-1 text-[11px] transition ${
        active
          ? "border-brand-700 font-semibold text-brand-700"
          : "border-transparent text-copy-muted hover:text-copy-strong"
      }`}
    >
      {children}
      <span
        className={`ml-1 rounded px-1 py-0.5 text-[9.5px] font-medium ${
          active ? "bg-brand-50 text-brand-700" : "bg-surface-muted text-copy-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function matchesScope(
  lead: ConversationLeadSummary,
  scope: ScopeFilter,
  currentUserId: string | null,
) {
  if (scope === "unassigned") return !lead.ownerUserId;
  if (scope === "mine") return Boolean(currentUserId) && lead.ownerUserId === currentUserId;
  return true;
}

function isSnoozed(lead: ConversationLeadSummary, now: number) {
  if (!lead.snoozedUntil) return false;
  const until = new Date(lead.snoozedUntil).getTime();
  return Number.isFinite(until) && until > (now || Date.now());
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

function formatWaitingTime(value: string, now: number) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const minutes = Math.max(0, Math.floor(((now || Date.now()) - timestamp) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatListTime(value: string, now: number) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const diff = Math.max(0, (now || Date.now()) - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(timestamp));
}

function formatSnooze(value: string | null) {
  if (!value) return "Snoozed";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Snoozed";
  return `until ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(timestamp)}`;
}
