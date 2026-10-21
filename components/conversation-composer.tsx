"use client";

import { FileText, LockKeyhole, MessageSquareText, RefreshCw, Save, Send, Sparkles } from "lucide-react";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { markCopilotAssistedMessageAction } from "@/app/conversations/copilot-audit-actions";
import { useWhatsAppConnectionStatus } from "@/components/use-whatsapp-connection-status";

type WhatsAppSendResult = {
  ok: true;
  message: {
    id: string | null;
    body: string;
    direction: "outbound";
    senderType: "human";
    channel: "whatsapp";
    status: "sent";
    externalMessageId: string | null;
    createdAt: string;
  };
};

type ServerAction = (formData: FormData) => Promise<WhatsAppSendResult | void>;

type CopilotDraftEvent = CustomEvent<{
  channel?: string;
  body?: string;
}>;

type QuickReply = {
  id: string;
  title: string;
  shortcut: string;
  body: string;
  category: string | null;
};

type QuickReplyResponse = {
  ok?: boolean;
  quickReplies?: QuickReply[];
};

type NoteResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

type DraftState = "idle" | "unsaved" | "saved" | "memory-only";
type ComposeMode = "reply" | "note";

export function WhatsAppComposer({
  action,
  leadId,
  windowOpen,
  windowLabel,
  quickReplies = [],
}: {
  action: ServerAction;
  leadId?: string;
  windowOpen: boolean;
  windowLabel: string;
  quickReplies?: QuickReply[];
}) {
  const [resolvedLeadId, setResolvedLeadId] = useState(leadId || "");
  const [mode, setMode] = useState<ComposeMode>("reply");
  const [body, setBody] = useState("");
  const [copilotAssisted, setCopilotAssisted] = useState(false);
  const [availableQuickReplies, setAvailableQuickReplies] = useState<QuickReply[]>(quickReplies);
  const [draftState, setDraftState] = useState<DraftState>("idle");
  const [noteBody, setNoteBody] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSuccess, setNoteSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const { state: connectionState } = useWhatsAppConnectionStatus();
  const connectionReady = connectionState === "connected";
  const draftKey = resolvedLeadId
    ? `salsysos:conversation-draft:v1:${resolvedLeadId}:whatsapp`
    : "";

  useEffect(() => {
    if (leadId) {
      setResolvedLeadId(leadId);
      return;
    }

    const fromQuery = new URLSearchParams(window.location.search).get("lead");
    if (fromQuery) {
      setResolvedLeadId(fromQuery);
      return;
    }

    const selectedLink = document.querySelector<HTMLAnchorElement>(
      'a[aria-current="page"][href*="/conversations?lead="]',
    );
    if (!selectedLink) return;

    try {
      setResolvedLeadId(
        new URL(selectedLink.href, window.location.origin).searchParams.get("lead") || "",
      );
    } catch {
      setResolvedLeadId("");
    }
  }, [leadId]);

  useEffect(() => {
    setAvailableQuickReplies(quickReplies);
  }, [quickReplies]);

  useEffect(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setBody("");
    setCopilotAssisted(false);
    setDraftState("idle");
    setNoteBody("");
    setNoteError(null);
    setNoteSuccess(null);
    setMode("reply");
    if (!draftKey) return;

    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) {
        setBody(saved.slice(0, 4096));
        setDraftState("saved");
      }
    } catch {
      setDraftState("memory-only");
    }

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [draftKey]);

  useEffect(() => {
    if (!windowOpen || quickReplies.length > 0) return;

    let cancelled = false;
    const controller = new AbortController();

    fetch("/api/whatsapp/quick-replies", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as QuickReplyResponse;
      })
      .then((payload) => {
        if (cancelled || !payload?.ok || !Array.isArray(payload.quickReplies)) return;
        setAvailableQuickReplies(payload.quickReplies.slice(0, 100));
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("WhatsApp quick replies could not be loaded.", error);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [quickReplies, windowOpen]);

  const persistDraft = useCallback(
    (value: string) => {
      if (!draftKey) {
        setDraftState("memory-only");
        return false;
      }

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

  const updateDraft = useCallback(
    (value: string) => {
      const next = value.slice(0, 4096);
      setBody(next);
      setDraftState("unsaved");
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        persistDraft(next);
      }, 500);
    },
    [persistDraft],
  );

  useEffect(() => {
    const applyCopilotDraft = (event: Event) => {
      const detail = (event as CopilotDraftEvent).detail;

      if (detail?.channel !== "whatsapp" || !detail.body?.trim()) {
        return;
      }

      setMode("reply");
      updateDraft(detail.body);
      setCopilotAssisted(true);

      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLTextAreaElement>('textarea[name="body"]')?.focus();
      });
    };

    window.addEventListener("crm:copilot-draft", applyCopilotDraft);
    return () => window.removeEventListener("crm:copilot-draft", applyCopilotDraft);
  }, [updateDraft]);

  const applyQuickReply = (reply: QuickReply) => {
    updateDraft(reply.body);
    setCopilotAssisted(false);
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLTextAreaElement>('textarea[name="body"]')?.focus();
    });
  };

  async function saveInternalNote() {
    const value = noteBody.trim();
    if (!value || noteSaving || !resolvedLeadId) return;

    setNoteSaving(true);
    setNoteError(null);
    setNoteSuccess(null);

    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(resolvedLeadId)}/activity`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "internal_note", body: value }),
        },
      );
      const result = (await response.json()) as NoteResponse;
      if (!response.ok || !result.ok) {
        throw new Error(result.ok ? "Unable to save internal note." : result.error);
      }

      setNoteBody("");
      setNoteSuccess("Internal note saved. Nothing was sent to the lead.");
    } catch (reason) {
      // Preserve the note on failure so a private team note is never lost
      // because storage or the network is temporarily unavailable.
      setNoteError(reason instanceof Error ? reason.message : "Unable to save internal note.");
    } finally {
      setNoteSaving(false);
    }
  }

  const sendMessage = () => {
    const text = body.trim();

    if (!text || isPending || !connectionReady || mode !== "reply") {
      return;
    }

    const wasCopilotAssisted = copilotAssisted;
    const formData = new FormData();
    formData.set("body", text);
    if (wasCopilotAssisted) {
      formData.set("ai_generated", "true");
    }

    setBody("");
    setCopilotAssisted(false);

    startTransition(async () => {
      try {
        const result = await action(formData);

        if (!result?.ok) {
          setBody((current) => current || text);
          persistDraft(text);
          if (wasCopilotAssisted) setCopilotAssisted(true);
          return;
        }

        persistDraft("");

        if (wasCopilotAssisted && result.message.id && resolvedLeadId) {
          await markCopilotAssistedMessageAction({
            leadId: resolvedLeadId,
            messageId: result.message.id,
            channel: "whatsapp",
          });
        }

        window.dispatchEvent(
          new CustomEvent("crm:whatsapp-sent", {
            detail: result.message,
          }),
        );
      } catch (error) {
        console.error("WhatsApp send failed:", error);
        setBody((current) => current || text);
        persistDraft(text);
        if (wasCopilotAssisted) setCopilotAssisted(true);
      }
    });
  };

  if (!windowOpen) {
    return (
      <div className="conversation-composer conversation-composer-locked bg-white p-3.5">
        <div className="conversation-window-alert flex items-start gap-3 rounded-lg border border-[#E7D8BD] bg-[#FCF6EA] p-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/70 text-[#825018]">
            <LockKeyhole size={15} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-[#6B501F]">
              WhatsApp reply window closed
            </div>

            <p className="mt-1 text-[10px] leading-5 text-[#715B31]">
              Free-form sending is disabled. Use an approved template only after the channel and template state are verified.
            </p>

            <div className="mt-1.5 text-[9px] font-medium text-[#825018]">
              {windowLabel}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        sendMessage();
      }}
      className="conversation-composer bg-white p-3"
    >
      <div className="overflow-hidden rounded-lg border border-[#D4DFD2] bg-white shadow-[0_1px_3px_rgba(21,62,51,0.04)]">
        <div className="flex items-center gap-5 border-b border-[#EEF2EF] px-3 pt-2" role="tablist" aria-label="Compose mode">
          <ComposerTab active={mode === "reply"} onClick={() => setMode("reply")} icon={<MessageSquareText size={11} />}>
            Reply draft
          </ComposerTab>
          <ComposerTab active={mode === "note"} onClick={() => setMode("note")} icon={<FileText size={11} />}>
            Internal note
          </ComposerTab>
          <span className="ml-auto mb-2 rounded-md border border-[#DCE4DF] bg-[#F6F8F7] px-2 py-1 text-[8px] font-semibold text-[#596E64]">
            WhatsApp
          </span>
        </div>

        {mode === "reply" ? (
          <div role="tabpanel" className="p-3">
            <div className="mb-2">
              <div className="text-[10px] font-semibold text-[#18362D]">Prepare a WhatsApp response</div>
              <div className="mt-0.5 text-[9px] text-[#596E64]">
                Draft only. Nothing is sent until you explicitly click Send.
              </div>
            </div>

            {availableQuickReplies.length ? (
              <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
                <span className="inline-flex shrink-0 items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-[#71847A]">
                  <Sparkles size={10} /> Quick replies
                </span>
                {availableQuickReplies.slice(0, 12).map((reply) => (
                  <button
                    key={reply.id}
                    type="button"
                    onClick={() => applyQuickReply(reply)}
                    disabled={isPending}
                    title={`${reply.shortcut}${reply.category ? ` · ${reply.category}` : ""}`}
                    className="shrink-0 rounded-full border border-[#DCE4DF] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#596E64] transition hover:bg-[#EDF3E6] hover:text-[#216551] disabled:opacity-50"
                  >
                    {reply.title}
                  </button>
                ))}
              </div>
            ) : null}

            <label className="sr-only" htmlFor={`whatsapp-reply-draft-${resolvedLeadId || "selected"}`}>
              Write a WhatsApp reply draft
            </label>
            <textarea
              id={`whatsapp-reply-draft-${resolvedLeadId || "selected"}`}
              name="body"
              value={body}
              onChange={(event) => updateDraft(event.target.value)}
              disabled={isPending}
              required={mode === "reply"}
              rows={2}
              maxLength={4096}
              autoComplete="off"
              placeholder={isPending ? "Sending…" : "Prepare a reply…"}
              className="max-h-40 min-h-[62px] w-full resize-none rounded-lg border border-[#DCE4DF] bg-white px-3 py-2 text-[12px] leading-5 text-[#18362D] outline-none placeholder:text-[#71847A] focus:border-[#216551] focus:ring-2 focus:ring-[#216551]/10 disabled:opacity-60"
            />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-[9px] font-medium text-[#71847A]">
                <span>Enter adds a new line</span>
                <span>{body.length}/4096</span>
                {copilotAssisted ? <span className="text-[#216551]">AI-assisted draft</span> : null}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => persistDraft(body)}
                  disabled={!body.trim() || isPending}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#DCE4DF] bg-white px-3 text-[9px] font-semibold text-[#596E64] transition hover:bg-[#EDF3E6] hover:text-[#216551] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={11} /> Save draft
                </button>
                <button
                  type="submit"
                  disabled={!body.trim() || isPending || !connectionReady}
                  title={connectionReady ? "Send WhatsApp message" : connectionDisabledReason(connectionState)}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#153E33] px-3.5 text-[10px] font-semibold text-white transition hover:bg-[#216551] disabled:cursor-not-allowed disabled:bg-[#EDF0EC] disabled:text-[#59685F]"
                >
                  <Send size={13} />
                  {isPending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[9px] font-medium">
              <span className="text-[#216551]">{draftStatus(draftState)}</span>
              <span className="text-[#71847A]">
                {isPending
                  ? "Sending through the verified WhatsApp action…"
                  : connectionReady
                    ? `${windowLabel} · Drafting never sends automatically.`
                    : connectionDisabledReason(connectionState)}
              </span>
            </div>
          </div>
        ) : (
          <div role="tabpanel" className="bg-[#FFFCF2] p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold text-[#18362D]">Private team note</div>
                <p className="mt-0.5 text-[9px] leading-4 text-[#70581F]">
                  Stored as internal CRM activity. Never sent through WhatsApp or any other channel.
                </p>
              </div>
              <span className="rounded border border-[#E6DDBE] bg-white px-2 py-1 text-[8px] font-semibold text-[#70581F]">Private</span>
            </div>
            <label className="sr-only" htmlFor={`whatsapp-internal-note-${resolvedLeadId || "selected"}`}>
              Write an internal note
            </label>
            <textarea
              id={`whatsapp-internal-note-${resolvedLeadId || "selected"}`}
              value={noteBody}
              onChange={(event) => {
                setNoteBody(event.target.value.slice(0, 4000));
                setNoteError(null);
                setNoteSuccess(null);
              }}
              rows={3}
              maxLength={4000}
              placeholder="Add context for your team…"
              className="min-h-[76px] w-full resize-y rounded-lg border border-[#D8D3BD] bg-white px-3 py-2 text-[11px] leading-5 text-[#18362D] outline-none placeholder:text-[#7A806E] focus:border-[#216551] focus:ring-2 focus:ring-[#216551]/10"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 text-[9px]">
                {noteError ? (
                  <span className="text-red-700">{noteError} Your note is still here.</span>
                ) : noteSuccess ? (
                  <span className="text-[#216551]">{noteSuccess}</span>
                ) : (
                  <span className="text-[#70581F]">{noteBody.length}/4000 · Saving does not send.</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void saveInternalNote()}
                disabled={!noteBody.trim() || noteSaving || !resolvedLeadId}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#153E33] px-3 text-[9px] font-semibold text-white transition hover:bg-[#216551] disabled:cursor-not-allowed disabled:bg-[#EDF0EC] disabled:text-[#59685F]"
              >
                {noteSaving ? <RefreshCw size={10} className="animate-spin" /> : null}
                {noteSaving ? "Saving…" : "Add note"}
              </button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

function ComposerTab({
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
      className={`inline-flex h-9 items-center gap-1.5 border-b-2 text-[9px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#216551] ${
        active
          ? "border-[#216551] text-[#216551]"
          : "border-transparent text-[#596E64] hover:text-[#18362D]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function draftStatus(state: DraftState) {
  if (state === "saved") return "Draft saved in this browser";
  if (state === "unsaved") return "Unsaved draft changes";
  if (state === "memory-only") return "Browser storage unavailable · draft kept in memory";
  return "Draft only";
}

function connectionDisabledReason(
  state: "loading" | "connected" | "disconnected" | "unavailable",
) {
  if (state === "loading") return "Verifying WhatsApp connection…";
  if (state === "disconnected") return "Send disabled until WhatsApp is connected.";
  if (state === "unavailable") return "Send disabled until WhatsApp connection can be verified.";
  return "WhatsApp connection verified.";
}
