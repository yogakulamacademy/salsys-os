"use client";

import { ToastForm, type ToastActionResult } from "@/components/toast-form";
import { FileText, Mail, MessageSquareText, RefreshCw, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { markCopilotAssistedMessageAction } from "@/app/conversations/copilot-audit-actions";
import { sendInstagramMessageAction } from "@/app/conversations/instagram-actions";
import type { MessagingEligibility } from "@/lib/messaging-eligibility";
import type { Channel } from "@/types/crm";

type ServerAction = (formData: FormData) => Promise<ToastActionResult>;

type ComposeMode = "reply" | "note";
type DraftState = "idle" | "unsaved" | "saved" | "memory-only";

type NoteResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

type CopilotDraftEvent = CustomEvent<{
  channel?: string;
  body?: string;
  source?: string;
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
  eligibility,
  emailTo,
  notice,
  windowNoticeShown = false,
}: {
  leadId: string;
  channel: Channel;
  interactionAction?: ServerAction;
  eligibility?: MessagingEligibility | null;
  /** When set, the draft can be opened in the user's mail app (nothing is sent from the CRM). */
  emailTo?: string | null;
  /** One-line context shown above the composer, e.g. why WhatsApp is not available. */
  notice?: string | null;
  /** The page already shows the closed-window notice above the suggested reply. */
  windowNoticeShown?: boolean;
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
  const instagramSendAllowed = !isInstagram || eligibility?.canReply !== false;
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
    const applyCopilotDraft = (event: Event) => {
      const detail = (event as CopilotDraftEvent).detail;
      if (detail?.channel !== channel || !detail.body?.trim()) return;

      setMode("reply");
      updateReplyDraft(detail.body);
      // Quick-reply drafts are team templates, not AI output.
      setCopilotAssisted(detail.source !== "quick_reply");
      requestAnimationFrame(() => replyTextareaRef.current?.focus());
    };

    window.addEventListener("crm:copilot-draft", applyCopilotDraft);
    return () => window.removeEventListener("crm:copilot-draft", applyCopilotDraft);
  }, [channel, updateReplyDraft]);

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
    if (!isInstagram || !instagramSendAllowed || !text || isPending) return;

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

  const windowClosed = isInstagram && eligibility?.canReply === false;
  const replyPlaceholder = isInstagram
    ? windowClosed
      ? "Write an Instagram reply… (saved as draft while the window is closed)"
      : "Write an Instagram reply…"
    : "Write a reply… it stays here as a draft until you choose how to send it.";
  const replyHint = isInstagram
    ? windowClosed && !windowNoticeShown ? eligibility?.userMessage ?? null : null
    : null;

  // Owner-approved design (20 Nov 2026): a compact Reply / Internal note box.
  return (
    <section className="ibx-v5-composer" aria-label="Conversation composer">
      {notice ? <p className="ibx-v3-composer-notice">{notice}</p> : null}
      <div className="ibx-v5-composer-box">
        <div className="ibx-v5-composer-tabs" role="tablist" aria-label="Compose mode" onKeyDown={handleModeKeyDown}>
          <ModeTab active={mode === "reply"} onClick={() => setMode("reply")} icon={<MessageSquareText size={12} />}>
            {isInstagram ? "Reply" : "Reply draft"}
          </ModeTab>
          <ModeTab active={mode === "note"} onClick={() => setMode("note")} icon={<FileText size={12} />}>
            Internal note
          </ModeTab>
          <span className="ibx-v5-composer-status" aria-live="polite">
            {mode === "reply"
              ? `${draftStatus(draftState)} · ${replyDraft.length}/${replyLimit}${copilotAssisted && isInstagram ? " · AI-assisted, reviewed by you" : ""}`
              : noteError ? <span className="text-red-700">{noteError} Your note is still here.</span>
              : noteSuccess ? <span className="text-[#216551]">{noteSuccess}</span>
              : "Private · never sent to the lead"}
          </span>
        </div>

        {mode === "reply" ? (
          <div role="tabpanel" className="ibx-v5-composer-row">
            {replyHint ? <p className="composer-intro ibx-v5-composer-hint">{replyHint}</p> : null}
            <label className="sr-only" htmlFor={`reply-draft-${leadId}`}>
              {isInstagram ? "Write an Instagram reply" : "Write a reply draft"}
            </label>
            <div className="ibx-v5-composer-line">
              <textarea
                ref={replyTextareaRef}
                id={`reply-draft-${leadId}`}
                value={replyDraft}
                onChange={(event) => updateReplyDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    if (isInstagram && instagramSendAllowed) sendInstagramReply();
                    else persistDraft(replyDraft);
                  }
                }}
                rows={replyDraft.includes("\n") || replyDraft.length > 90 ? 3 : 1}
                maxLength={replyLimit}
                disabled={isInstagram && isPending}
                placeholder={replyPlaceholder}
                title={`Ctrl/⌘ + Enter ${isInstagram && instagramSendAllowed ? "sends" : "saves"}`}
              />
              <div className="ibx-v3-composer-actions">
                <button type="button" onClick={() => persistDraft(replyDraft)}
                  disabled={!replyDraft.trim()}
                  className="ibx-v3-save-draft ibx-v5-btn">
                  <Save size={13}/> Save draft
                </button>
                {emailTo && !isInstagram ? <a
                  href={`mailto:${emailTo}?subject=${encodeURIComponent("Re: your enquiry")}&body=${encodeURIComponent(replyDraft)}`}
                  onClick={() => persistDraft(replyDraft)}
                  aria-disabled={!replyDraft.trim()}
                  title={`Opens your email app with this draft to ${emailTo}. Nothing is sent from the CRM.`}
                  className={`ibx-v3-email-draft ibx-v5-btn is-primary ${replyDraft.trim() ? "" : "pointer-events-none opacity-50"}`}>
                  <Mail size={13}/> Open in email
                </a> : null}
                {isInstagram && instagramSendAllowed ? <button type="button" onClick={sendInstagramReply}
                  disabled={!replyDraft.trim() || isPending}
                  className="ibx-v3-send ibx-v5-btn is-primary">
                  {isPending?<RefreshCw size={12} className="animate-spin"/>:<Send size={13}/>}
                  {isPending?"Sending…":"Send"}
                </button>:null}
              </div>
            </div>
            {sendError ? <div className="ibx-v5-composer-error">{sendError}</div> : null}
          </div>
        ) : (
          <div role="tabpanel" className="ibx-v5-composer-row is-note">
            <label className="sr-only" htmlFor={`internal-note-${leadId}`}>Write an internal note</label>
            <div className="ibx-v5-composer-line">
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
                rows={note.includes("\n") || note.length > 90 ? 3 : 1}
                maxLength={4000}
                placeholder="Add a private note for your team…"
              />
              <button
                type="button"
                onClick={() => void saveInternalNote()}
                disabled={!note.trim() || noteSaving}
                className="ibx-v5-btn is-primary"
              >
                {noteSaving ? <RefreshCw size={12} className="animate-spin" /> : null}
                {noteSaving ? "Saving…" : "Add note"}
              </button>
            </div>
          </div>
        )}
      </div>

      {interactionAction && !isInstagram ? (
        <details className="mt-2 rounded-lg border border-[#E6ECE8] bg-[#F9FBF9] px-3 py-2">
          <summary className="cursor-pointer text-[9px] font-semibold text-[#596E64]">Record a completed contact</summary>
          <ToastForm action={interactionAction} className="mt-2 grid gap-2 border-t border-[#E6ECE8] pt-2 sm:grid-cols-[105px_120px_minmax(0,1fr)_auto]">
            <select className="input" name="direction" defaultValue="outbound" aria-label="Interaction direction">
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
            <select className="input" name="channel" defaultValue={channel} aria-label="Interaction channel">
              {CHANNELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input className="input" name="body" required placeholder="Record the completed interaction…" aria-label="Interaction note" />
            <button className="btn-primary" type="submit">Log</button>
          </ToastForm>
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
      className={`ibx-v5-mode-tab ${active ? "is-active" : ""}`}
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
