"use client";

import { LockKeyhole, Save, Send, Sparkles } from "lucide-react";

import { useEffect, useRef, useState, useTransition } from "react";

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

type DraftState = "idle" | "unsaved" | "saved" | "memory-only";

export function WhatsAppComposer({
  action,
  leadId,
  windowOpen,
  windowLabel,
  quickReplies = [],
}: {
  action: ServerAction;
  leadId: string;
  windowOpen: boolean;
  windowLabel: string;
  quickReplies?: QuickReply[];
}) {
  const [body, setBody] = useState("");
  const [copilotAssisted, setCopilotAssisted] = useState(false);
  const [availableQuickReplies, setAvailableQuickReplies] = useState<QuickReply[]>(quickReplies);
  const [draftState, setDraftState] = useState<DraftState>("idle");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const { state: connectionState } = useWhatsAppConnectionStatus();
  const connectionReady = connectionState === "connected";
  const draftKey = `salsysos:conversation-draft:v1:${leadId}:whatsapp`;

  useEffect(() => {
    setAvailableQuickReplies(quickReplies);
  }, [quickReplies]);

  useEffect(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setBody("");
    setCopilotAssisted(false);
    setDraftState("idle");

    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) {
        setBody(saved.slice(0, 4096));
        setDraftState("saved");
      }
    } catch {
      // Drafting still works in component memory even if browser storage is
      // unavailable. We never clear the textarea because a storage write failed.
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

  const persistDraft = (value = body) => {
    try {
      if (value.trim()) window.localStorage.setItem(draftKey, value);
      else window.localStorage.removeItem(draftKey);
      setDraftState(value.trim() ? "saved" : "idle");
      return true;
    } catch {
      setDraftState("memory-only");
      return false;
    }
  };

  const updateDraft = (value: string) => {
    const next = value.slice(0, 4096);
    setBody(next);
    setDraftState("unsaved");
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      persistDraft(next);
    }, 500);
  };

  useEffect(() => {
    const applyCopilotDraft = (event: Event) => {
      const detail = (event as CopilotDraftEvent).detail;

      if (detail?.channel !== "whatsapp" || !detail.body?.trim()) {
        return;
      }

      const next = detail.body.slice(0, 4096);
      updateDraft(next);
      setCopilotAssisted(true);

      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLTextAreaElement>('textarea[name="body"]')?.focus();
      });
    };

    window.addEventListener("crm:copilot-draft", applyCopilotDraft);
    return () => window.removeEventListener("crm:copilot-draft", applyCopilotDraft);
  });

  const applyQuickReply = (reply: QuickReply) => {
    updateDraft(reply.body);
    setCopilotAssisted(false);
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLTextAreaElement>('textarea[name="body"]')?.focus();
    });
  };

  const sendMessage = () => {
    const text = body.trim();

    if (!text || isPending || !connectionReady) {
      return;
    }

    const wasCopilotAssisted = copilotAssisted;
    const formData = new FormData();
    formData.set("body", text);
    if (wasCopilotAssisted) {
      formData.set("ai_generated", "true");
    }

    /*
     * Clear optimistically only after an explicit Send click. Any provider or
     * server failure restores the exact draft and saves it locally when possible.
     */
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

        if (wasCopilotAssisted && result.message.id) {
          await markCopilotAssistedMessageAction({
            leadId,
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
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div>
          <div className="text-[10px] font-semibold text-[#18362D]">Reply draft</div>
          <div className="mt-0.5 text-[9px] text-[#596E64]">
            Nothing is sent until you click Send.
          </div>
        </div>
        <span className="rounded-md border border-[#DCE4DF] bg-[#F6F8F7] px-2 py-1 text-[8px] font-semibold text-[#596E64]">
          WhatsApp
        </span>
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

      <div className="conversation-composer-shell rounded-lg border border-[#D4DFD2] bg-white p-2 shadow-[0_1px_3px_rgba(21,62,51,0.04)] transition focus-within:border-[#216551] focus-within:ring-2 focus-within:ring-[#216551]/10">
        <label className="sr-only" htmlFor={`whatsapp-reply-draft-${leadId}`}>
          Write a WhatsApp reply draft
        </label>
        <textarea
          id={`whatsapp-reply-draft-${leadId}`}
          name="body"
          value={body}
          onChange={(event) => updateDraft(event.target.value)}
          disabled={isPending}
          required
          rows={2}
          maxLength={4096}
          autoComplete="off"
          placeholder={isPending ? "Sending…" : "Prepare a reply…"}
          className="max-h-40 min-h-[62px] w-full resize-none bg-transparent px-2 py-2 text-[12px] leading-5 text-[#18362D] outline-none placeholder:text-[#71847A] disabled:opacity-60"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF2EF] px-1 pt-2">
          <div className="flex flex-wrap items-center gap-3 text-[9px] font-medium text-[#71847A]">
            <span>Enter adds a new line</span>
            <span>{body.length}/4096</span>
            {copilotAssisted ? <span className="text-[#216551]">AI-assisted draft</span> : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => persistDraft()}
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
      </div>

      <div className="conversation-composer-meta mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[9px] font-medium">
        <span className="text-[#216551]">{draftStatus(draftState)}</span>
        <span className="text-[#71847A]">
          {isPending
            ? "Sending through the verified WhatsApp action…"
            : connectionReady
              ? `${windowLabel} · Drafting never sends automatically.`
              : connectionDisabledReason(connectionState)}
        </span>
      </div>
    </form>
  );
}

function draftStatus(state: DraftState) {
  if (state === "saved") return "Draft saved in this browser";
  if (state === "unsaved") return "Unsaved draft changes";
  if (state === "memory-only") return "Browser storage unavailable · draft kept in memory";
  return "Draft only";
}

function connectionDisabledReason(state: ReturnType<typeof useWhatsAppConnectionStatus>["state"]) {
  if (state === "loading") return "Verifying WhatsApp connection…";
  if (state === "disconnected") return "Send disabled until WhatsApp is connected.";
  if (state === "unavailable") return "Send disabled until WhatsApp connection can be verified.";
  return "WhatsApp connection verified.";
}
