"use client";

import { Bot, ChevronDown, ShieldAlert, Sparkles, WandSparkles, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import {
  generateCopilotReplyAction,
  type CopilotReplyResult,
} from "@/app/conversations/copilot-actions";

type SuccessfulCopilotReply = Extract<CopilotReplyResult, { ok: true }>;

export function ConversationCopilotFloating() {
  const searchParams = useSearchParams();
  const leadId = searchParams.get("lead")?.trim() || "";
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SuccessfulCopilotReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!leadId) {
    return null;
  }

  const generate = () => {
    if (isPending) return;

    setError(null);
    setOpen(true);

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
          channel: result.channel,
          body: result.draft,
          risk: result.risk,
          intent: result.intent,
          model: result.model,
        },
      }),
    );

    setOpen(false);
  };

  const riskTone =
    result?.risk === "human_only"
      ? "border-red-200 bg-red-50 text-red-700"
      : result?.risk === "review"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className="fixed bottom-5 right-5 z-[70] flex max-w-[calc(100vw-2.5rem)] flex-col items-end gap-2">
      {open ? (
        <div className="w-[410px] max-w-full overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-violet-100 text-violet-700">
                <Bot size={16} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">AI Reply Co-Pilot</div>
                <div className="text-[10px] font-medium text-slate-500">
                  Draft only · human approval required
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700"
              aria-label="Close AI Reply Co-Pilot"
            >
              <X size={15} />
            </button>
          </div>

          <div className="max-h-[58vh] overflow-y-auto p-4">
            {isPending ? (
              <div className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-4 text-sm font-medium text-violet-700">
                <Sparkles size={16} className="animate-pulse" />
                Reading the lead and recent conversation…
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs leading-5 text-red-700">
                {error}
              </div>
            ) : null}

            {result && !isPending ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                  <span className={`rounded-full border px-2 py-1 ${riskTone}`}>
                    {result.risk === "human_only"
                      ? "Human-only review"
                      : result.risk === "review"
                        ? "Review carefully"
                        : "Low risk"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                    {result.channel === "instagram" ? "Instagram" : "WhatsApp"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                    {result.intent || "general enquiry"}
                  </span>
                </div>

                <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800">
                  {result.draft}
                </div>

                {result.risk !== "low" ? (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
                    <ShieldAlert size={13} className="mt-0.5 shrink-0" />
                    <span>{result.reason}</span>
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={generate}
                    className="btn-secondary !rounded-lg !px-3 !py-2 text-xs"
                  >
                    <WandSparkles size={14} />
                    Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={useDraft}
                    className="btn-primary !rounded-lg !px-3 !py-2 text-xs"
                  >
                    Use draft
                  </button>
                </div>

                <div className="mt-3 text-[10px] font-medium leading-4 text-slate-400">
                  The draft is placed into the CRM composer only. You can edit it before pressing Send.
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (result || error) {
            setOpen((current) => !current);
          } else {
            generate();
          }
        }}
        className="flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-3 text-xs font-bold text-violet-700 shadow-xl transition hover:-translate-y-0.5 hover:bg-violet-50"
      >
        <Sparkles size={15} />
        AI Suggest Reply
        {result || error ? <ChevronDown size={13} /> : null}
      </button>
    </div>
  );
}
