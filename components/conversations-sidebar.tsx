"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { InboxPage } from "@/lib/conversations-page-data";
import { nextInboxQueueHref, resetInboxQueueHref } from "@/lib/inbox-query-navigation";
import { CHANNEL_CHIPS, INBOX_TOPICS, INBOX_TOPIC_LABELS } from "@/lib/inbox-topics";
import { Clock3, Search, SlidersHorizontal, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui";
import { personInitials } from "@/lib/ui-format";
import { WAIT_KIND_LABEL, groupWaiting, type WaitKind } from "@/lib/inbox-waiting";
import { compactMoney } from "@/lib/home-data-health";

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
  resolved?: boolean;
  priority: ConversationPriority;
  waitingSince: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  snoozedUntil: string | null;
  /** Their last message in plain words (Inbox rows, 20 Nov 2026). */
  lastText?: string | null;
  /** What they sent last: says they paid, a question, a message, or a share. */
  lastKind?: WaitKind;
  /** Estimated value of the course they want, in its own currency. */
  value?: number | null;
  currency?: string | null;
};

type InboxFilter = "all" | "reply" | "unread" | "snoozed" | "waiting" | "older";
type ScopeFilter = "mine" | "team" | "unassigned" | `owner:${string}`;
type PriorityFilter = "all" | ConversationPriority;
type ChannelFilter = "all" | "website" | "instagram" | "whatsapp";

export function ConversationsSidebar({
  leads,
  selectedId,
  currentUserId,
  canManageAssignments,
  pagination,
}: {
  leads: ConversationLeadSummary[];
  selectedId?: string;
  currentUserId: string | null;
  canManageAssignments: boolean;
  pagination?: Omit<InboxPage, "rows">;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serverMode = Boolean(pagination);
  const explicitLeadId = searchParams.get("lead");
  const [search, setSearch] = useState(pagination?.search ?? "");
  const [scope, setScope] = useState<ScopeFilter>(
    pagination?.scope ?? (currentUserId && !canManageAssignments ? "mine" : "team"),
  );
  const [filter, setFilter] = useState<InboxFilter>(pagination?.filter ?? "waiting");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>(pagination?.priority ?? "all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>(pagination?.channel ?? "all");
  const [now, setNow] = useState(0);
  const [mobileViewport, setMobileViewport] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);

  function setInboxParam(
    key: "q" | "page" | "sort" | "scope" | "filter" | "priority" | "channel" | "topic",
    value: string,
    preservePage = false,
  ) {
    router.replace(
      nextInboxQueueHref(searchParams.toString(), key, value, preservePage),
      { scroll: false },
    );
  }
  function updateScope(value: ScopeFilter) {
    setScope(value);
    if (serverMode) setInboxParam("scope", value);
  }
  function updateFilter(value: InboxFilter) {
    setFilter(value);
    if (serverMode) setInboxParam("filter", value);
  }
  function updateChannel(value: ChannelFilter) {
    setChannelFilter(value);
    if (serverMode) setInboxParam("channel", value);
  }
  function updatePriority(value: PriorityFilter) {
    setPriorityFilter(value);
    if (serverMode) setInboxParam("priority", value);
  }
  function resetFilters() {
    setSearch("");
    setScope(currentUserId && !canManageAssignments ? "mine" : "team");
    setFilter("waiting");
    setPriorityFilter("all");
    setChannelFilter("all");
    if (serverMode) {
      router.replace(resetInboxQueueHref(searchParams.toString()), { scroll: false });
    }
  }
  function leadHref(id: string) {
    if (!serverMode) return `/conversations?lead=${id}`;
    const params = new URLSearchParams(searchParams.toString());
    params.set("lead", id);
    return `/conversations?${params.toString()}`;
  }
  useEffect(() => {
    if (pagination) setSearch(pagination.search);
  }, [pagination?.search]);
  useEffect(() => {
    if (!pagination) return;
    setScope(pagination.scope);
    setFilter(pagination.filter);
    setPriorityFilter(pagination.priority);
    setChannelFilter(pagination.channel);
  }, [pagination?.scope,pagination?.filter,pagination?.priority,pagination?.channel]);
  useEffect(() => {
    if (!pagination || search.trim() === pagination.search) return;
    const timeout = window.setTimeout(() => setInboxParam("q", search.trim()), 350);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, pagination?.search]);
  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.totalMatching / pagination.pageSize)) : 1;
  const pageStart = pagination && pagination.totalMatching > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const pageEnd = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.totalMatching) : 0;
  const allScopeCount = pagination?.counts.scope;


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
    () => serverMode ? leads : leads.filter((lead) => matchesScope(lead, scope, currentUserId)),
    [currentUserId, leads, scope, serverMode],
  );

  const activeScopedLeads = scopedLeads.filter((lead) => !isSnoozed(lead, now));
  const unreadCount = pagination?.counts.unread ?? activeScopedLeads.filter((lead) => lead.unread).length;
  const replyCount = pagination?.counts.reply ?? activeScopedLeads.filter(
    (lead) => lead.needsReply || lead.needsFirstContact,
  ).length;
  const snoozedCount = pagination?.counts.snoozed ?? scopedLeads.filter((lead) => isSnoozed(lead, now)).length;

  const mineCount = leads.filter(
    (lead) => !isSnoozed(lead, now) && Boolean(currentUserId) && lead.ownerUserId === currentUserId,
  ).length;
  const teamCount = leads.filter((lead) => !isSnoozed(lead, now)).length;
  const unassignedCount = leads.filter(
    (lead) => !isSnoozed(lead, now) && !lead.ownerUserId,
  ).length;

  const filteredLeads = useMemo(() => {
    if (serverMode) return leads;
    const query = search.trim().toLowerCase();

    return leads.filter((lead) => {
      const selectedOutsideScope =
        lead.id === selectedId || Boolean(selectedId && lead.relatedLeadIds?.includes(selectedId));
      if (!matchesScope(lead, scope, currentUserId) && !selectedOutsideScope) return false;

      const snoozed = isSnoozed(lead, now);
      if (filter === "snoozed" && !snoozed) return false;
      if (filter !== "snoozed" && snoozed) return false;
      if ((filter === "reply" || filter === "waiting" || filter === "older") && !lead.needsReply && !lead.needsFirstContact) return false;
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
  }, [channelFilter, currentUserId, filter, leads, now, priorityFilter, scope, search, selectedId, serverMode]);

  useEffect(() => { setVisibleCount(50); }, [search, scope, filter, priorityFilter, channelFilter]);

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
      filter !== "waiting" ||
      priorityFilter !== "all" ||
      channelFilter !== "all" ||
      Boolean(pagination && (pagination.page > 1 || pagination.sort !== "activity_desc")),
  );

  return (
    <aside className="conversation-sidebar flex h-full min-h-0 flex-col overflow-hidden bg-surface">
      <div className="ibx-v2-sidebar-header shrink-0 border-b border-line px-4 pt-3">
        <h2 className="sr-only">Conversations</h2>
        <div
          className="ibx-v2-tabs ibx-v3-pills flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:shrink-0 [&>button]:whitespace-nowrap"
          role="tablist"
          aria-label="Conversation filters"
          onKeyDown={handleFilterKeyDown}
        >
          <InboxTab active={filter === "waiting"} onClick={() => updateFilter("waiting")} count={pagination?.counts.waiting ?? replyCount}>
            Waiting
          </InboxTab>
          <InboxTab active={filter === "unread"} onClick={() => updateFilter("unread")} count={unreadCount}>
            Unread
          </InboxTab>
          <InboxTab active={filter === "snoozed"} onClick={() => updateFilter("snoozed")} count={snoozedCount}>
            Snoozed
          </InboxTab>
          <InboxTab active={filter === "older" || filter === "reply"} onClick={() => updateFilter("older")} count={pagination?.counts.older ?? 0}>
            Older
          </InboxTab>
          <InboxTab active={filter === "all"} onClick={() => updateFilter("all")} count={allScopeCount ?? activeScopedLeads.length}>
            All
          </InboxTab>
        </div>
        <div className="ibx-v2-search-line">
        <label className="ibx-v2-search relative block">
          <span className="sr-only">Search conversations</span>
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-copy-subtle"
          />
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, message or course…"
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
          <details className="ibx-v2-advanced-filter">
            <summary aria-label="More inbox filters" title="More filters">
              <SlidersHorizontal size={16}/>
            </summary>
            <div className="ibx-v2-advanced-popover">
              <label>
                <span>Priority</span>
                <select aria-label="Priority" value={priorityFilter}
                  onChange={(event) => updatePriority(event.target.value as PriorityFilter)}>
                  <option value="all">All priorities</option>
                  <option value="urgent">Urgent only</option>
                  <option value="high">High priority</option>
                  <option value="normal">Normal priority</option>
                  <option value="waiting">Waiting</option>
                </select>
              </label>
              {pagination ? (
                <label>
                  <span>Sort</span>
                  <select aria-label="Inbox sort" value={pagination.sort}
                    onChange={(event) => setInboxParam("sort", event.target.value)}>
                    <option value="created_desc">Newest created first</option>
                    <option value="activity_desc">Latest conversation activity</option>
                  </select>
                </label>
              ) : null}
            </div>
          </details>
        </div>
      </div>

      {pagination?.channelCounts ? (
        <div role="group" aria-label="Filter by channel" className="ibx-v3-channel-chips flex shrink-0 gap-1.5 overflow-x-auto border-b border-line bg-surface px-4 py-2 [scrollbar-width:none]">
          {CHANNEL_CHIPS.map((chip) => {
            const active = channelFilter === chip.value;
            const count = pagination.channelCounts?.[chip.value] ?? 0;
            return (
              <button key={chip.value} type="button" aria-pressed={active} onClick={() => updateChannel(chip.value)}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-surface text-copy-muted hover:border-brand-300"}`}>
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: chip.color }} />
                {chip.label}
                <span className="tabular-nums opacity-70">{count.toLocaleString("en-IN")}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {pagination?.topicCounts && Object.keys(pagination.topicCounts).length ? (
        <div className="ibx-v3-topic-chips shrink-0 border-b border-line bg-surface px-4 py-2">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-copy-subtle">What people are asking</p>
          <div role="group" aria-label="Filter by question topic" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {INBOX_TOPICS.filter((key) => (pagination.topicCounts?.[key] ?? 0) > 0)
              .sort((a, b) => (pagination.topicCounts?.[b] ?? 0) - (pagination.topicCounts?.[a] ?? 0))
              .map((key) => {
                const active = pagination.topic === key;
                return (
                  <button key={key} type="button" aria-pressed={active}
                    onClick={() => setInboxParam("topic", active ? "all" : key)}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-surface text-copy hover:border-brand-300"}`}>
                    {INBOX_TOPIC_LABELS[key]} · {(pagination.topicCounts?.[key] ?? 0).toLocaleString("en-IN")}
                  </button>
                );
              })}
          </div>
        </div>
      ) : null}

      <div className={`ibx-v2-secondary-filters grid shrink-0 ${pagination?.channelCounts ? "grid-cols-1" : "grid-cols-2"} gap-2 border-b border-line bg-surface px-4 py-2.5`}>
        {pagination?.channelCounts ? null : (
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-medium text-copy-muted">Channel</span>
          <select
            value={channelFilter}
            onChange={(event) => updateChannel(event.target.value as ChannelFilter)}
            className="h-8 w-full rounded-md border border-line bg-surface-soft px-2 text-[11px] font-medium text-copy-muted outline-none focus:border-brand-600 focus:text-brand-700"
          >
            <option value="all">All channels</option>
            <option value="website">Website</option>
            <option value="instagram">Instagram</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
        )}
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-medium text-copy-muted">Owner</span>
          <select aria-label="Owner" value={scope} onChange={(event) => updateScope(event.target.value as ScopeFilter)}
            className="h-8 w-full rounded-md border border-line bg-surface-soft px-2 text-[11px] font-medium text-copy-muted outline-none focus:border-brand-600 focus:text-brand-700">
            <option value="team">All owners</option>
            {currentUserId ? <option value="mine">My conversations</option> : null}
            <option value="unassigned">Unassigned</option>
            {Array.from(new Map((pagination?.owners ?? leads.filter(lead => lead.ownerUserId && lead.ownerName)
              .map(lead => ({id:lead.ownerUserId!,name:lead.ownerName!}))).map(owner => [owner.id,owner.name])).entries()).map(([id,name]) => (
              <option key={id} value={`owner:${id}`}>{name}</option>
            ))}
          </select>
        </label>
        <span className="col-span-2 text-right text-[10.5px] text-copy-subtle" aria-live="polite">
          {pagination?.totalMatching ?? filteredLeads.length} {(pagination?.totalMatching ?? filteredLeads.length) === 1 ? "lead" : "leads"} match
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        {filteredLeads.length === 0 ? (
          <EmptyState compact variant="conversation"
            title={leads.length === 0 ? "No conversations yet" : filter === "snoozed" ? "Nothing snoozed" : filter === "unread" && !search && channelFilter === "all" && priorityFilter === "all" ? "You’re all caught up" : "No matching conversations"}
            description={leads.length === 0 ? "New conversations will appear here when customers get in touch." : filter === "snoozed" ? "Snoozed conversations return when their timer expires." : "Try another owner, search or filter."}
            action={hasFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-3 rounded-ui border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-brand-700 transition hover:bg-brand-50"
                >
                  Reset inbox filters
                </button>
              ) : undefined}
          />
        ) : (
          (() => {
            const isSelected = (lead: ConversationLeadSummary) =>
              (lead.id === selectedId || Boolean(selectedId && lead.relatedLeadIds?.includes(selectedId))) &&
              (!mobileViewport || explicitLeadId === lead.id || Boolean(explicitLeadId && lead.relatedLeadIds?.includes(explicitLeadId)));
            const renderRow = (lead: ConversationLeadSummary) => (
              <ConversationRow key={lead.personId || lead.id} lead={lead} selected={isSelected(lead)} now={now} href={leadHref(lead.id)} />
            );
            const visible = serverMode ? filteredLeads : filteredLeads.slice(0, visibleCount);
            // This week's waiting chats, grouped by what the person actually sent.
            if (filter === "waiting") {
              return groupWaiting(visible.map((lead) => ({ ...lead, kind: (lead.lastKind ?? "message") as WaitKind }))).map((group) => (
                <section key={group.kind} aria-label={WAIT_KIND_LABEL[group.kind]}>
                  <h3 className={`ibx-wait-group sticky top-0 z-[1] border-b border-line/70 bg-surface/95 px-4 py-2 text-[11px] font-bold uppercase tracking-wide backdrop-blur ${group.kind === "paid" ? "text-emerald-700" : "text-copy-muted"}`}>
                    {WAIT_KIND_LABEL[group.kind]} · {group.rows.length.toLocaleString("en-IN")}
                  </h3>
                  {group.rows.map(renderRow)}
                </section>
              ));
            }
            return visible.map(renderRow);
          })()
        )}
        {!serverMode && filteredLeads.length > visibleCount ? <div className="p-3 text-center"><button type="button" className="btn-secondary w-full" onClick={() => setVisibleCount(count => count + 50)}>Show more conversations</button></div> : null}
      </div>

      <div className="shrink-0 border-t border-line px-4 py-2.5 text-[11px] text-copy-subtle">
        {pagination ? (
          <div className="flex items-center justify-between gap-2">
            <span><UsersRound size={12} className="inline" /> {pageStart}–{pageEnd} of {pagination.totalMatching} matching leads</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Previous inbox page" disabled={pagination.page <= 1}
                className="rounded border border-line px-2 py-1 disabled:opacity-40"
                onClick={() => setInboxParam("page", String(pagination.page - 1), true)}>Prev</button>
              <span>{pagination.page} / {pageCount}</span>
              <button type="button" aria-label="Next inbox page" disabled={pagination.page >= pageCount}
                className="rounded border border-line px-2 py-1 disabled:opacity-40"
                onClick={() => setInboxParam("page", String(pagination.page + 1), true)}>Next</button>
            </div>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <UsersRound size={12} /> {Math.min(visibleCount, filteredLeads.length)} of {filteredLeads.length} conversations loaded
          </span>
        )}
      </div>
    </aside>
  );
}

function ConversationRow({
  lead,
  selected,
  now,
  href,
}: {
  lead: ConversationLeadSummary;
  selected: boolean;
  now: number;
  href: string;
}) {
  // Owner-approved design (20 Nov 2026): the person's own last words, the
  // course and its value, and how long they've waited. No "Urgent" or
  // "Needs reply" chips: the tab and the group already say that.
  const sourceLabel = lead.currentContactChannel.replaceAll("_", " ");
  const course = lead.course && lead.course !== "Not selected" ? lead.course : null;
  const snoozed = isSnoozed(lead, now);
  const waitingMs = lead.waitingSince && (lead.needsReply || lead.needsFirstContact)
    ? (now || Date.now()) - new Date(lead.waitingSince).getTime()
    : null;
  const waiting = waitingMs != null && lead.waitingSince ? formatWaitingTime(lead.waitingSince, now) : null;
  const otherOpportunities = Math.max(0, (lead.opportunityCount ?? 1) - 1);
  const paid = lead.lastKind === "paid";
  const share = lead.lastKind === "share";
  const notableStage = ["qualified", "high_intent", "payment_pending", "enrolled", "closed_won", "lost", "not_now"].includes(String(lead.stage))
    ? STAGE_WORDS[String(lead.stage)] ?? null
    : null;
  const meta = [
    course ?? (lead.lastText ? "Course not known yet" : null),
    lead.value ? compactMoney(lead.value, lead.currency ?? "INR") : null,
    notableStage,
  ].filter(Boolean).join(" · ");
  const channelColor = CHANNEL_CHIPS.find((chip) => chip.value === lead.currentContactChannel)?.color ?? "#6b6880";

  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      data-channel={lead.currentContactChannel}
      className={`ibx-v2-row group relative block border-b border-line/70 px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-700/40 ${
        selected ? "bg-brand-50" : paid ? "bg-emerald-50/50 hover:bg-emerald-50" : "bg-surface hover:bg-surface-soft"
      }`}
    >
      {selected ? (
        <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-brand-700" />
      ) : null}

      <div className="flex gap-2.5">
        <div
          className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
            paid ? "bg-emerald-100 text-emerald-800" : selected ? "bg-brand-100 text-brand-700" : "bg-surface-muted text-copy-muted"
          }`}
        >
          {initials(lead.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-copy-strong">
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
            <div
              className={`shrink-0 text-[11px] font-semibold ${waitingMs != null && waitingMs > 86_400_000 ? "text-warning" : "text-copy-subtle"}`}
              title={waiting ? `Waiting ${waiting} for a reply` : undefined}
            >
              {waiting ?? (lead.lastContactedAt ? formatListTime(lead.lastContactedAt, now) : "New")}
            </div>
          </div>

          <div className={`mt-0.5 truncate text-[12.5px] ${share || !lead.lastText ? "text-copy-muted" : "text-copy-strong"}`}>
            {paid ? <span className="font-semibold text-emerald-700">Says they paid: </span> : null}
            {lead.lastText
              ? share ? lead.lastText : `“${lead.lastText}”`
              : course ? `Interested in ${course}` : `${sourceLabel} inquiry`}
          </div>

          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-copy-muted">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: channelColor }} />
            <span className="sr-only">{sourceLabel}</span>
            <span className="min-w-0 truncate">{meta || sourceLabel}</span>
            {snoozed ? (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-copy-muted">
                <Clock3 size={10} /> {formatSnooze(lead.snoozedUntil)}
              </span>
            ) : lead.resolved ? (
              <span className="ibx-v2-completed-label ml-auto shrink-0">Done</span>
            ) : lead.ownerUserId && lead.ownerName ? (
              <span className="ml-auto shrink-0 truncate text-[10.5px] text-copy-subtle">{lead.ownerName}</span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

const STAGE_WORDS: Record<string, string> = {
  qualified: "Qualified",
  high_intent: "Ready to buy",
  payment_pending: "Payment pending",
  enrolled: "Enrolled",
  closed_won: "Enrolled",
  lost: "Lost",
  not_now: "Not now",
};

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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
        active
          ? "border-brand-600 bg-brand-50 text-brand-700"
          : "border-line bg-surface text-copy-muted hover:text-copy-strong"
      }`}
    >
      {children}
      <span className="tabular-nums opacity-70">
        {count.toLocaleString("en-IN")}
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
  if (scope.startsWith("owner:")) return lead.ownerUserId === scope.slice(6);
  if (scope === "mine") return Boolean(currentUserId) && lead.ownerUserId === currentUserId;
  return true;
}

function isSnoozed(lead: ConversationLeadSummary, now: number) {
  if (!lead.snoozedUntil) return false;
  const until = new Date(lead.snoozedUntil).getTime();
  return Number.isFinite(until) && until > (now || Date.now());
}

function initials(name: string) {
  return personInitials(name);
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
