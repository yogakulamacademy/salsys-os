"use client";

import { FileText, MessageSquareText, RefreshCw, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { markCopilotAssistedMessageAction } from "@/app/conversations/copilot-audit-actions";
import { sendInstagramMessageAction } from "@/app/conversations/instagram-actions";
import type { Channel } from "@/types/crm";

type ServerAction =
  | ((formData: FormData) => void)
  | ((formData: FormData) => Promise<void>);

type ComposeMode = "reply" | "note";
type DraftState = "idle" | "unsaved" | "saved" | "memory-only";

type NoteResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

type CopilotDraftEvent = CustomEvent<{
  channel?: string;
  body?: string;
}>;

const CHANNELS: Array<[Channel, string]> = [
  ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"],
  ["website", "Website"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["meta_lead_form", "Meta Lead Form"],
  ["other", "Other"],
];

export function ConversationSafeComposer({
  leadId,
  channel,
  interactionAction,
}: {
  leadId: string;
  channel: Channel;
  interactionAction?: ServerAction;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ComposeMode>("reply");
  const [replyDraft, setReplyDraft] = useState("");
  const [draftState, setDraftState] = useState<DraftState>("idle");
  const [copilotAssisted, setCopilotAssisted] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSuccess, setNoteSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const saveTimer = useRef<number | null>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftKey = `salsysos:conversation-draft:v1:${leadId}:${channel}`;
  const isInstagram = channel === "instagram";
  const replyLimit = isInstagram ? 1000 : 5000;

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setReplyDraft("");
    setDraftState("idle");
    setCopilotAssisted(false);
    setSendError(null);
    setNote("");
    setNoteError(null);
    setNoteSuccess(null);

    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) {
        setReplyDraft(saved.slice(0, replyLimit));
        setDraftState("saved");
      }
    } catch {
      setDraftState("memory-only");
    }

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [draftKey, replyLimit]);

  const persistDraft = useCallback(
    (value: string) => {
      try {
        if (value.trim()) window.localStorage.setItem(draftKey, value);
        else window.localStorage.removeItem(draftKey);
        setDraftState(value.trim() ? "saved" : "idle");
        return true;
      } catch {
        setDraftState("memory-only");
        return false;
      }
    },
    [draftKey],
  );

  const updateReplyDraft = useCallback(
    (value: string) => {
      const next = value.slice(0, replyLimit);
      setReplyDraft(next);
      setDraftState("unsaved");
      setSendError(null);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => persistDraft(next), 500);
    },
    [persistDraft, replyLimit],
  );

  useEffect(() => {
    if (!isInstagram) return;

    const applyCopilotDraft = (event: Event) => {
      const detail = (event as CopilotDraftEvent).detail;
      if (detail?.channel !== "instagram" || !detail.body?.trim()) return;

      setMode("reply");
      updateReplyDraft(detail.body);
      setCopilotAssisted(true);
      requestAnimationFrame(() => replyTextareaRef.current?.focus());
    };

    window.addEventListener("crm:copilot-draft", applyCopilotDraft);
    return () => window.removeEventListener("crm:copilot-draft", applyCopilotDraft);
  }, [isInstagram, updateReplyDraft]);

  async function saveInternalNote() {
    const value = note.trim();
    if (!value || noteSaving) return;

    setNoteSaving(true);
    setNoteError(null);
    setNoteSuccess(null);

    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "internal_note", body: value }),
      });
      const result = (await response.json()) as NoteResponse;
      if (!response.ok || !result.ok) {
        throw new Error(result.ok ? "Unable to save internal note." : result.error);
      }

      setNote("");
      setNoteSuccess("Internal note saved. Nothing was sent to the lead.");
      window.dispatchEvent(
        new CustomEvent("crm:activity-changed", {
          detail: { leadId },
        }),
      );
    } catch (reason) {
      setNoteError(reason instanceof Error ? reason.message : "Unable to save internal note.");
    } finally {
      setNoteSaving(false);
    }
  }

  function sendInstagramReply() {
    const text = replyDraft.trim();
    if (!isInstagram || !text || isPending) return;

    const wasCopilotAssisted = copilotAssisted;
    setSendError(null);

    const formData = new FormData();
    formData.set("body", text);
    if (wasCopilotAssisted) formData.set("ai_generated", "true");

    startTransition(async () => {
      try {
        const result = await sendInstagramMessageAction(leadId, formData);
        if (!result?.ok) {
          setSendError("Instagram reply was not sent. Your draft has been kept.");
          persistDraft(text);
          return;
        }

        if (wasCopilotAssisted && result.message.id) {
          await markCopilotAssistedMessageAction({
            leadId,
            messageId: result.message.id,
            channel: "instagram",
          });
        }

        setReplyDraft("");
        setCopilotAssisted(false);
        setDraftState("idle");
        persistDraft("");
        window.dispatchEvent(
          new CustomEvent("crm:instagram-sent", {
            detail: result.message,
          }),
        );
        router.refresh();
      } catch (reason) {
        console.error("Instagram send failed:", reason);
        setSendError("Instagram reply could not be sent. Your draft has been kept.");
        persistDraft(text);
      }
    });
  }

  function handleModeKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
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
    <section className="bg-white p-3" aria-label="Conversation composer">
      <div className="overflow-hidden rounded-lg border border-[#D4DFD2] bg-white shadow-[0_1px_3px_rgba(21,62,51,0.04)]">
        <div
          className="flex items-center gap-5 border-b border-[#EEF2EF] px-3 pt-2"
          role="tablist"
          aria-label="Compose mode"
          onKeyDown={handleModeKeyDown}
        >
          <ModeTab active={mode === "reply"} onClick={() => setMode("reply")} icon={<MessageSquareText size={11} />}>
            {isInstagram ? "Reply" : "Reply draft"}
          </ModeTab>
          <ModeTab active={mode === "note"} onClick={() => setMode("note")} icon={<FileText size={11} />}>
            Internal note
          </ModeTab>
        </div>

        {mode === "reply" ? (
          <div role="tabpanel" className="p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold text-[#18362D]">
                  {isInstagram ? "Reply on Instagram" : "Prepare a response"}
                </div>
                <p className="mt-0.5 text-[9px] leading-4 text-[#596E64]">
                  {isInstagram
                    ? "Salsys checks the customer-initiated Instagram reply window before the provider call. Nothing is sent until you click Send."
                    : "Draft only. Saving here never sends a message or changes the lead stage."}
                </p>
              </div>
              <span className="rounded border border-[#DCE4DF] bg-[#F6F8F7] px-2 py-1 text-[8px] font-semibold capitalize text-[#596E64]">
                {channel.replaceAll("_", " ")}
              </span>
            </div>
            <label className="sr-only" htmlFor={`reply-draft-${leadId}`}>
              {isInstagram ? "Write an Instagram reply" : "Write a reply draft"}
            </label>
            <textarea
              ref={replyTextareaRef}
              id={`reply-draft-${leadId}`}
              value={replyDraft}
              onChange={(event) => updateReplyDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  if (isInstagram) sendInstagramReply();
                  else persistDraft(replyDraft);
                }
              }}
              rows={3}
              maxLength={replyLimit}
              disabled={isInstagram && isPending}
              placeholder={
                isInstagram
                  ? "Reply to this Instagram conversation…"
                  : "Prepare a reply… it stays here until you choose an eligible sending channel."
              }
              className="min-h-[76px] w-full resize-y rounded-lg border border-[#DCE4DF] bg-white px-3 py-2 text-[11px] leading-5 text-[#18362D] outline-none placeholder:text-[#71847A] focus:border-[#216551] focus:ring-2 focus:ring-[#216551]/10 disabled:bg-[#F6F8F7] disabled:text-[#71847A]"
            />

            {sendError ? (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[9px] leading-4 text-red-700">
                {sendError}
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[9px] text-[#71847A]">
                {draftStatus(draftState)} · {replyDraft.length}/{replyLimit} · Ctrl/⌘ + Enter {isInstagram ? "sends" : "saves"}
                {copilotAssisted && isInstagram ? " · AI-assisted draft reviewed by human" : ""}
              </div>
              {isInstagram ? (
                <button
                  type="button"
                  onClick={sendInstagramReply}
                  disabled={!replyDraft.trim() || isPending}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#153E33] px-3 text-[9px] font-semibold text-white transition hover:bg-[#216551] disabled:cursor-not-allowed disabled:bg-[#EDF0EC] disabled:text-[#59685F]"
                >
                  {isPending ? <RefreshCw size={10} className="animate-spin" /> : <Send size={11} />}
                  {isPending ? "Sending…" : "Send"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => persistDraft(replyDraft)}
                  disabled={!replyDraft.trim()}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#DCE4DF] bg-white px-3 text-[9px] font-semibold text-[#596E64] transition hover:bg-[#EDF3E6] hover:text-[#216551] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={11} /> Save draft
                </button>
              )}
            </div>
          </div>
        ) : (
          <div role="tabpanel" className="bg-[#FFFCF2] p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold text-[#18362D]">Private team note</div>
                <p className="mt-0.5 text-[9px] leading-4 text-[#70581F]">Stored as internal CRM activity. Never sent to the lead.</p>
              </div>
              <span className="rounded border border-[#E6DDBE] bg-white px-2 py-1 text-[8px] font-semibold text-[#70581F]">Private</span>
            </div>
            <label className="sr-only" htmlFor={`internal-note-${leadId}`}>Write an internal note</label>
            <textarea
              id={`internal-note-${leadId}`}
              value={note}
              onChange={(event) => {
                setNote(event.target.value.slice(0, 4000));
                setNoteError(null);
                setNoteSuccess(null);
              }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void saveInternalNote();
                }
              }}
              rows={3}
              maxLength={4000}
              placeholder="Add context for your team…"
              className="min-h-[76px] w-full resize-y rounded-lg border border-[#D8D3BD] bg-white px-3 py-2 text-[11px] leading-5 text-[#18362D] outline-none placeholder:text-[#7A806E] focus:border-[#216551] focus:ring-2 focus:ring-[#216551]/10"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 text-[9px]">
                {noteError ? <span className="text-red-700">{noteError} Your note is still here.</span> : noteSuccess ? <span className="text-[#216551]">{noteSuccess}</span> : <span className="text-[#70581F]">{note.length}/4000 · Ctrl/⌘ + Enter adds note · Saving does not send.</span>}
              </div>
              <button
                type="button"
                onClick={() => void saveInternalNote()}
                disabled={!note.trim() || noteSaving}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#153E33] px-3 text-[9px] font-semibold text-white transition hover:bg-[#216551] disabled:cursor-not-allowed disabled:bg-[#EDF0EC] disabled:text-[#59685F]"
              >
                {noteSaving ? <RefreshCw size={10} className="animate-spin" /> : null}
                {noteSaving ? "Saving…" : "Add note"}
              </button>
            </div>
          </div>
        )}
      </div>

      {interactionAction && !isInstagram ? (
        <details className="mt-2 rounded-lg border border-[#E6ECE8] bg-[#F9FBF9] px-3 py-2">
          <summary className="cursor-pointer text-[9px] font-semibold text-[#596E64]">Record a completed contact</summary>
          <form action={interactionAction} className="mt-2 grid gap-2 border-t border-[#E6ECE8] pt-2 sm:grid-cols-[105px_120px_minmax(0,1fr)_auto]">
            <select className="input" name="direction" defaultValue="outbound" aria-label="Interaction direction">
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
            <select className="input" name="channel" defaultValue={channel} aria-label="Interaction channel">
              {CHANNELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input className="input" name="body" required placeholder="Record the completed interaction…" aria-label="Interaction note" />
            <button className="btn-primary" type="submit">Log</button>
          </form>
          <p className="mt-2 text-[8px] text-[#71847A]">Logging records an interaction; it does not transmit one.</p>
        </details>
      ) : null}
    </section>
  );
}

function ModeTab({
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
      className={`inline-flex h-9 items-center gap-1.5 border-b-2 text-[9px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#216551] ${active ? "border-[#216551] text-[#216551]" : "border-transparent text-[#596E64] hover:text-[#18362D]"}`}
    >
      {icon}{children}
    </button>
  );
}

function draftStatus(state: DraftState) {
  if (state === "saved") return "Draft saved in this browser";
  if (state === "unsaved") return "Unsaved draft changes";
  if (state === "memory-only") return "Browser storage unavailable · draft kept in memory";
  return "Draft only";
}
