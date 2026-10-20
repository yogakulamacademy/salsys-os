"use client";

import {
  Bot,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useState, useTransition } from "react";

import {
  generateCopilotReplyAction,
  type CopilotReplyResult,
} from "@/app/conversations/copilot-actions";

type SupportedChannel = "instagram" | "whatsapp";
type SuccessfulCopilotReply = Extract<CopilotReplyResult, { ok: true }>;

export function ConversationCopilot({
  leadId,
  channel,
  enabled = true,
  disabledReason,
}: {
  leadId: string;
  channel: SupportedChannel;
  enabled?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SuccessfulCopilotReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const generate = () => {
    if (!enabled || isPending) return;
    setOpen(true);
    setError(null);

    startTransition(async () => {
      const response = await generateCopilotReplyAction(leadId);
      if (!response.ok) {
        setResult(null);
        setError(response.error);
        return;
      }
      setResult(response);
    });
  };

  const useDraft = () => {
    if (!result?.draft) return;
    window.dispatchEvent(
      new CustomEvent("crm:copilot-draft", {
        detail: {
          channel,
          body: result.draft,
          risk: result.risk,
          intent: result.intent,
          model: result.model,
        },
      }),
    );
  };

  const riskTone =
    result?.risk === "human_only"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
      : result?.risk === "review"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300";

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/50"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300">
          <Bot size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-slate-900 dark:text-white">Conversation assistant</span>
          <span className="mt-0.5 block text-[9px] leading-4 text-slate-400">Identify intent and draft a reply for your review.</span>
        </span>
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>

      {open ? (
        <div className="border-t border-slate-100 p-3 dark:border-slate-900">
          {!enabled && disabledReason ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
              {disabledReason}
            </div>
          ) : null}

          {enabled ? (
            <button
              type="button"
              onClick={generate}
              disabled={isPending}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 text-[10px] font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? <Sparkles size={13} className="animate-pulse" /> : <WandSparkles size={13} />}
              {isPending ? "Building draft…" : result ? "Regenerate reply" : "Draft reply"}
            </button>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[10px] leading-4 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-semibold">
                <span className={`rounded-full border px-2 py-1 ${riskTone}`}>
                  {result.risk === "human_only"
                    ? "Human review"
                    : result.risk === "review"
                      ? "Review carefully"
                      : "Low risk"}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  {result.intent || "General enquiry"}
                </span>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-[11px] leading-5 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
                {result.draft}
              </div>

              {result.risk !== "low" ? (
                <div className="flex items-start gap-2 text-[9px] leading-4 text-slate-500">
                  <ShieldAlert size={12} className="mt-0.5 shrink-0" />
                  <span>{result.reason}</span>
                </div>
              ) : null}

              <button
                type="button"
                onClick={useDraft}
                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Use draft in composer
              </button>

              <div className="text-center text-[8px] leading-4 text-slate-400">Nothing is sent until you review and press Send.</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
