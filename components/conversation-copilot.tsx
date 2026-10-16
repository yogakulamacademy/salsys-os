"use client";

import { Bot, ShieldAlert, Sparkles, WandSparkles } from "lucide-react";
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
  const [result, setResult] = useState<SuccessfulCopilotReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const generate = () => {
    if (!enabled || isPending) return;

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
      ? "border-red-200 bg-red-50 text-red-700"
      : result?.risk === "review"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className="border-t border-slate-100 bg-gradient-to-r from-violet-50/80 via-white to-indigo-50/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100 text-violet-700">
            <Bot size={16} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800">AI Reply Co-Pilot</div>
            <div className="text-[10px] font-medium text-slate-500">
              Draft only · human approval required · {channel === "instagram" ? "Instagram" : "WhatsApp"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={!enabled || isPending}
          className="btn-secondary !rounded-lg !px-3 !py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? <Sparkles size={14} className="animate-pulse" /> : <WandSparkles size={14} />}
          {isPending ? "Drafting..." : result ? "Regenerate" : "Suggest reply"}
        </button>
      </div>

      {!enabled && disabledReason ? (
        <div className="mt-2 text-[10px] font-medium text-amber-700">
          {disabledReason}
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-xl border border-violet-100 bg-white p-3 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
            <span className={`rounded-full border px-2 py-1 ${riskTone}`}>
              {result.risk === "human_only"
                ? "Human-only review"
                : result.risk === "review"
                  ? "Review carefully"
                  : "Low risk"}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
              {result.intent || "general enquiry"}
            </span>
            <span className="text-slate-400">{result.complexity}</span>
          </div>

          <div className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
            {result.draft}
          </div>

          {result.risk !== "low" ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-600">
              <ShieldAlert size={13} className="mt-0.5 shrink-0" />
              <span>{result.reason}</span>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[10px] font-medium text-slate-400">
              Nothing is sent until you place this draft in the composer and press Send.
            </div>
            <button
              type="button"
              onClick={useDraft}
              className="btn-primary !rounded-lg !px-3 !py-2 text-xs"
            >
              Use draft
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
