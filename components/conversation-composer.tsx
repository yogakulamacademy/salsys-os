"use client";

import { LockKeyhole, Send, Sparkles } from "lucide-react";

import { useEffect, useRef, useState, useTransition } from "react";

import { markCopilotAssistedMessageAction } from "@/app/conversations/copilot-audit-actions";

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

export function WhatsAppComposer({
  action,
  windowOpen,
  windowLabel,
  quickReplies = [],
}: {
  action: ServerAction;
  windowOpen: boolean;
  windowLabel: string;
  quickReplies?: QuickReply[];
}) {
  const [body, setBody] = useState("");
  const [copilotAssisted, setCopilotAssisted] = useState(false);
  const [availableQuickReplies, setAvailableQuickReplies] = useState<QuickReply[]>(quickReplies);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    setAvailableQuickReplies(quickReplies);
  }, [quickReplies]);

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

  useEffect(() => {
    const applyCopilotDraft = (event: Event) => {
      const detail = (event as CopilotDraftEvent).detail;

      if (detail?.channel !== "whatsapp" || !detail.body?.trim()) {
        return;
      }

      setBody(detail.body.slice(0, 4096));
      setCopilotAssisted(true);

      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLTextAreaElement>('textarea[name="body"]')?.focus();
      });
    };

    window.addEventListener("crm:copilot-draft", applyCopilotDraft);
    return () => window.removeEventListener("crm:copilot-draft", applyCopilotDraft);
  }, []);

  const applyQuickReply = (reply: QuickReply) => {
    setBody(reply.body.slice(0, 4096));
    setCopilotAssisted(false);
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLTextAreaElement>('textarea[name="body"]')?.focus();
    });
  };

  const sendMessage = () => {
    const text = body.trim();

    if (!text || isPending) {
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
          if (wasCopilotAssisted) setCopilotAssisted(true);
          return;
        }

        if (wasCopilotAssisted && result.message.id) {
          await markCopilotAssistedMessageAction({
            leadId: new URLSearchParams(window.location.search).get("lead") || "",
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
        if (wasCopilotAssisted) setCopilotAssisted(true);
      }
    });
  };

  if (!windowOpen) {
    return (
      <div className="conversation-composer conversation-composer-locked border-t border-slate-100 bg-white p-4">
        <div className="conversation-window-alert flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
            <LockKeyhole size={16} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-amber-800">
              24-hour WhatsApp window expired
            </div>

            <p className="mt-1 text-xs leading-5 text-amber-700">
              A free-form reply cannot be sent now. An approved WhatsApp
              template is required to restart the conversation.
            </p>

            <div className="mt-2 text-[10px] font-medium text-amber-600">
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
      className="conversation-composer border-t border-slate-100 bg-white p-4"
    >
      {availableQuickReplies.length ? (
        <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <Sparkles size={11} /> Quick replies
          </span>
          {availableQuickReplies.slice(0, 12).map((reply) => (
            <button
              key={reply.id}
              type="button"
              onClick={() => applyQuickReply(reply)}
              disabled={isPending}
              title={`${reply.shortcut}${reply.category ? ` · ${reply.category}` : ""}`}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50"
            >
              {reply.title}
            </button>
          ))}
        </div>
      ) : null}

      <div className="conversation-composer-shell rounded-xl border border-slate-200 bg-slate-50 p-2 transition focus-within:border-brand/30 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand/5">
        <textarea
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value.slice(0, 4096))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
            }
          }}
          disabled={isPending}
          required
          rows={2}
          maxLength={4096}
          autoComplete="off"
          placeholder={isPending ? "Sending..." : "Reply on WhatsApp..."}
          className="max-h-40 min-h-[58px] w-full resize-none bg-transparent px-2 py-2 text-sm leading-5 outline-none placeholder:text-slate-400 disabled:opacity-60"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1">
          <div className="flex items-center gap-3 text-[10px] font-medium text-slate-400">
            <span>Enter to send · Shift + Enter for new line</span>
            <span>{body.length}/4096</span>
            {copilotAssisted ? <span className="text-violet-600">AI-assisted draft</span> : null}
          </div>

          <button
            type="submit"
            disabled={!body.trim() || isPending}
            className="btn-primary !rounded-lg !px-4 !py-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={14} />
            {isPending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>

      <div className="conversation-composer-meta mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-medium">
        <span className="text-emerald-600">{windowLabel}</span>
        <span className="text-slate-400">
          {isPending
            ? "Sending through WhatsApp Cloud API..."
            : "Sent through WhatsApp Cloud API + logged in CRM"}
        </span>
      </div>
    </form>
  );
}
