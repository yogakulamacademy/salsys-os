"use client";

import { Activity, FileText, MessageCircle, PhoneCall, RefreshCw, Sparkles } from "lucide-react";

import {
  ACTIVITY_FILTERS,
  KIND_LABEL,
  activityKind,
  activityTitle,
  isMessageEcho,
  matchesFilter,
  type ActivityFilter,
  type ActivityKind,
} from "@/lib/inbox-activity";
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
  actor_name?: string | null;
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
  kind: ActivityKind;
};

type ServerAction = (formData: FormData) => void | Promise<void>;

const KIND_STYLE: Record<ActivityKind, string> = {
  message: "bg-brand-50 text-brand-700",
  contact: "bg-emerald-50 text-emerald-700",
  note: "bg-amber-50 text-amber-800",
  followup: "bg-orange-50 text-orange-800",
  update: "bg-sky-50 text-sky-700",
  source: "bg-surface-muted text-copy-muted",
};

type ViewMode = "conversation" | "activity" | "notes";

export function ConversationCenterView({
  messages,
  originChannel,
  originTimestamp,
  originCourse,
  originDetail,
  course,
  country,
  stage,
  teamNames,
  logAction,
}: {
  teamNames?: Record<string, string>;
  logAction?: ServerAction;
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
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [logOpen, setLogOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMessage, setNoteMessage] = useState<{ ok: boolean; text: string } | null>(null);

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
    if ((view !== "activity" && view !== "notes") || activityLoaded || activityLoading) return;
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
    // Interactions on messaging channels repeat chat messages, which are listed below.
    const rows: TimelineItem[] = crmActivity.filter((item) => !isMessageEcho(item)).map((item) => ({
      id: `crm-${item.id}`,
      title: activityTitle(item),
      detail: item.details || activityDetail(item),
      timestamp: item.occurred_at || item.created_at,
      meta: actorName(item, teamNames),
      kind: activityKind(item),
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
        kind: "message",
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
        kind: "source",
      });
    }

    return rows
      .filter((item) => Boolean(item.timestamp))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [crmActivity, messages, originChannel, originCourse, originDetail, originTimestamp, teamNames]);

  const visibleActivity = useMemo(
    () => activity.filter((item) => matchesFilter(item.kind, activityFilter)),
    [activity, activityFilter],
  );

  const notes = useMemo(
    () => crmActivity
      .filter(item => item.activity_type === "internal_note" || item.activity_type === "note")
      .map(item => ({
        id: item.id,
        body: item.details || activityDetail(item),
        timestamp: item.occurred_at || item.created_at,
        author: actorName(item, teamNames),
      }))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [crmActivity, teamNames],
  );

  async function saveNote() {
    const value = noteDraft.trim();
    if (!value || noteSaving || !resolvedLeadId) return;
    setNoteSaving(true);
    setNoteMessage(null);
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(resolvedLeadId)}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "internal_note", body: value }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to save the note.");
      setNoteDraft("");
      setNoteMessage({ ok: true, text: "Note saved. Only your team can see it." });
      window.dispatchEvent(new CustomEvent("crm:activity-changed", { detail: { leadId: resolvedLeadId } }));
    } catch (reason) {
      setNoteMessage({ ok: false, text: reason instanceof Error ? reason.message : "Unable to save the note." });
    } finally {
      setNoteSaving(false);
    }
  }

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
          className="ibx-v2-center-tabs grid h-11 grid-cols-3 items-center sm:flex sm:gap-6"
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
            Activity
            <span className="ml-1 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-copy-muted">
              {activityLoading ? "…" : activity.filter((item) => item.kind !== "message").length}
            </span>
          </TabButton>
          <TabButton
            active={view === "notes"}
            onClick={() => setView("notes")}
            icon={<FileText size={14} />}
          >
            Notes
            {notes.length > 0 ? (
              <span className="ml-1 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-copy-muted">{notes.length}</span>
            ) : null}
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
        ) : view === "notes" ? (
          <div className="ibx-v2-notes mx-auto max-w-3xl">
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3">
              <FileText size={17} className="mt-0.5 shrink-0 text-brand-700"/>
              <div>
                <h3 className="text-[13px] font-semibold text-copy-strong">Private team notes</h3>
                <p className="mt-1 text-[11px] leading-5 text-copy-muted">Only your team sees these. They are never sent to the customer.</p>
              </div>
            </div>
            <div className="ibx-v3-note-box mb-4 rounded-lg border border-line bg-surface p-3">
              <label htmlFor="ibx-note-draft" className="sr-only">Add a team note</label>
              <textarea id="ibx-note-draft" value={noteDraft} maxLength={4000} rows={2}
                onChange={(event) => setNoteDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void saveNote(); }
                }}
                placeholder="Add a note for the team, e.g. Offers content creation in exchange for part of the fee; manager to decide."
                className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-[12px] leading-5 text-copy-strong outline-none focus:border-brand-600"/>
              <div className="mt-2 flex items-center justify-between gap-2">
                {noteMessage ? (
                  <span role={noteMessage.ok ? "status" : "alert"} className={`text-[11px] ${noteMessage.ok ? "text-emerald-700" : "text-rose-700"}`}>{noteMessage.text}</span>
                ) : <span className="text-[11px] text-copy-subtle">Ctrl/⌘ + Enter saves</span>}
                <button type="button" onClick={() => void saveNote()} disabled={!noteDraft.trim() || noteSaving || !resolvedLeadId}
                  className="btn-primary h-8 px-3 text-[12px] disabled:opacity-50">{noteSaving ? "Saving…" : "Save note"}</button>
              </div>
            </div>
            {activityLoading ? <p role="status" className="text-[12px] text-copy-muted">Loading internal notes…</p> : null}
            {activityError ? <div role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              Notes could not be loaded: {activityError}
              <button type="button" onClick={() => { setActivityLoaded(false); void loadActivity(); }} className="ml-3 font-semibold underline">Retry</button>
            </div> : null}
            {!activityLoading && !activityError && notes.length === 0 ? (
              <div className="grid min-h-[190px] place-items-center text-center">
                <div><FileText size={24} className="mx-auto text-brand-700"/>
                  <p className="mt-3 text-[13px] font-semibold text-copy-strong">No internal notes recorded</p>
                  <p className="mt-1 text-[11px] text-copy-muted">Team notes will appear here after they are saved.</p>
                </div>
              </div>
            ) : notes.map(item => (
              <article key={item.id} className="mb-3 rounded-lg border border-line bg-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-copy-muted">
                  <span className="font-semibold capitalize">{item.author.replaceAll("_"," ")}</span>
                  <time dateTime={item.timestamp}>{formatDateTime(item.timestamp)}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-5 text-copy-strong">{item.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label="Filter activity" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                {ACTIVITY_FILTERS.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={activityFilter === value}
                    onClick={() => setActivityFilter(value)}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${activityFilter === value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-surface text-copy-muted hover:text-copy-strong"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {logAction ? (
                <button type="button" aria-expanded={logOpen} onClick={() => setLogOpen((v) => !v)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-copy-strong hover:border-brand-600">
                  <PhoneCall size={13} /> Log a contact
                </button>
              ) : null}
            </div>

            {logOpen && logAction ? (
              <form action={logAction} className="ibx-v3-log-contact mb-4 grid gap-2 rounded-lg border border-line bg-surface p-3 sm:grid-cols-[120px_130px_minmax(0,1fr)]">
                <input type="hidden" name="return_to" value="conversations" />
                <label className="sr-only" htmlFor="ibx-log-channel">How</label>
                <select id="ibx-log-channel" name="channel" defaultValue="phone" className="input h-9 text-[12px]">
                  <option value="phone">Phone call</option>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp (outside CRM)</option>
                  <option value="instagram">Instagram (outside CRM)</option>
                  <option value="other">In person / other</option>
                </select>
                <label className="sr-only" htmlFor="ibx-log-direction">Who reached out</label>
                <select id="ibx-log-direction" name="direction" defaultValue="outbound" className="input h-9 text-[12px]">
                  <option value="outbound">We contacted them</option>
                  <option value="inbound">They contacted us</option>
                </select>
                <label className="sr-only" htmlFor="ibx-log-body">What happened</label>
                <input id="ibx-log-body" name="body" required maxLength={2000} className="input h-9 text-[12px]"
                  placeholder="What happened? e.g. Discussed March batch, sending brochure" />
                <div className="flex items-center justify-between gap-2 sm:col-span-3">
                  <span className="text-[11px] text-copy-subtle">Records it on the lead; nothing is sent.</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setLogOpen(false)} className="btn-secondary h-8 px-3 text-[12px]">Cancel</button>
                    <button type="submit" className="btn-primary h-8 px-3 text-[12px]">Save</button>
                  </div>
                </div>
              </form>
            ) : null}

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

            {visibleActivity.length ? (
              <ol className="space-y-0" aria-label="Conversation activity">
                {visibleActivity.map((item, index) => (
                  <li key={item.id} className="relative flex gap-3 pb-6">
                    {index < visibleActivity.length - 1 ? (
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
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_STYLE[item.kind]}`}>{KIND_LABEL[item.kind]}</span>
                          <span className="text-[13px] font-semibold text-copy-strong">{item.title}</span>
                        </div>
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
                    {activity.length ? "Nothing in this filter" : "No activity recorded"}
                  </div>
                  <p className="mt-1 text-[12px] text-copy-muted">
                    {activity.length ? "Try All to see everything for this lead." : "Calls, notes, follow-ups and changes will appear here."}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="ibx-v2-interest-note mx-3 mb-2 shrink-0 rounded-ui border border-line bg-brand-50/50 px-2.5 py-2 sm:mx-5 sm:mb-3 sm:px-3 sm:py-2.5">
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

function actorName(item: ActivityRow, teamNames?: Record<string, string>) {
  if (item.actor_name) return item.actor_name;
  if (item.actor_id && teamNames?.[item.actor_id]) return teamNames[item.actor_id];
  // Rows written by the system on a person's behalf (imports, scheduled jobs).
  if (!item.actor_id || item.actor_id === "service_role" || item.actor_id.startsWith("ai_")) {
    return item.actor_type === "lead" ? "Lead" : item.actor_type === "ai" ? "AI" : "Automatic";
  }
  if (item.actor_type === "lead") return "Lead";
  if (item.actor_type === "automation" || item.actor_type === "system") return "Automatic";
  if (item.actor_type === "ai") return "AI";
  return item.actor_type === "human" ? "Team member" : humanize(item.actor_type || "Team");
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
