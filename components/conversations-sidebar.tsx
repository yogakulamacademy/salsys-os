"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Clock3, MessageCircle, Search, X } from "lucide-react";

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

type InboxFilter = "all" | "attention" | "unread";

export function ConversationsSidebar({
  leads,
  selectedId,
}: {
  leads: ConversationLeadSummary[];
  selectedId?: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [now, setNow] = useState(0);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const unreadCount = leads.filter((lead) => lead.unread).length;
  const attentionCount = leads.filter(
    (lead) => lead.needsReply || lead.needsFirstContact,
  ).length;

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (filter === "attention" && !lead.needsReply && !lead.needsFirstContact) return false;
      if (filter === "unread" && !lead.unread) return false;
      if (!query) return true;

      return [lead.name, lead.course, lead.country, lead.stage, lead.currentContactChannel]
        .filter(Boolean)
        .join(" ")
        .replaceAll("_", " ")
        .toLowerCase()
        .includes(query);
    });
  }, [filter, leads, search]);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-slate-950">
      <div className="shrink-0 border-b border-slate-100 px-3 py-3 dark:border-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold text-slate-950 dark:text-white">Inbox</div>
            <div className="mt-0.5 text-[10px] text-slate-400">Find and prioritize conversations</div>
          </div>
          <div className="text-[10px] font-medium text-slate-400">{leads.length}</div>
        </div>

        <div className="relative mt-3">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-[11px] outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-950"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
              aria-label="Clear conversation search"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>All {leads.length}</FilterButton>
          <FilterButton active={filter === "attention"} onClick={() => setFilter("attention")}>Needs reply {attentionCount}</FilterButton>
          <FilterButton active={filter === "unread"} onClick={() => setFilter("unread")}>Unread {unreadCount}</FilterButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {filteredLeads.length === 0 ? (
          <div className="grid min-h-[240px] place-items-center px-5 text-center">
            <div>
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-900">
                <MessageCircle size={17} />
              </div>
              <div className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-200">No matching conversations</div>
              <div className="mt-1 text-[10px] text-slate-400">Try another search or filter.</div>
            </div>
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <ConversationRow key={lead.id} lead={lead} selected={lead.id === selectedId} now={now} />
          ))
        )}
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
  const action = lead.needsFirstContact ? "First contact" : lead.needsReply ? "Needs reply" : "Waiting";
  const actionTone = lead.needsFirstContact ? "text-sky-700" : lead.needsReply ? "text-amber-700" : "text-slate-400";

  return (
    <Link
      href={`/conversations?lead=${lead.id}`}
      className={`group relative block border-b border-slate-100 px-3 py-3 transition dark:border-slate-900 ${
        selected
          ? "bg-violet-50/60 dark:bg-violet-950/15"
          : "bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900/50"
      }`}
    >
      {selected ? <span className="absolute inset-y-3 left-0 w-[2px] rounded-r-full bg-violet-600" /> : null}

      <div className="flex gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[10px] font-bold ${selected ? "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>
          {initials(lead.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className={`truncate text-[12px] ${lead.unread ? "font-bold text-slate-950 dark:text-white" : "font-semibold text-slate-800 dark:text-slate-100"}`}>
              {lead.name}
            </div>
            <div className="shrink-0 text-[9px] text-slate-400">
              {lead.lastContactedAt ? formatListTime(lead.lastContactedAt, now) : "New"}
            </div>
          </div>

          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="capitalize">{lead.currentContactChannel.replaceAll("_", " ")}</span>
            <span>·</span>
            <span className="truncate">{lead.course && lead.course !== "Not selected" ? lead.course : "Course not selected"}</span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className={`inline-flex items-center gap-1 text-[9px] font-semibold ${actionTone}`}>
              {lead.unread ? <Bell size={9} /> : null}
              {action}
            </div>
            {lead.waitingSince && (lead.needsReply || lead.needsFirstContact) ? (
              <div className="inline-flex items-center gap-1 text-[9px] text-slate-400">
                <Clock3 size={9} /> {formatWaitingTime(lead.waitingSince, now)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-[9px] font-semibold transition ${
        active
          ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
          : "bg-slate-100 text-slate-500 hover:text-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => Array.from(part)[0] ?? "").slice(0, 2).join("").toLocaleUpperCase("en-IN") || "?";
}

function formatWaitingTime(value: string, now: number) {
  if (now <= 0) return "—";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
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
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(timestamp));
}
