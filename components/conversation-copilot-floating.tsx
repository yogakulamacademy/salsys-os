"use client";

import { Bot, BookOpenCheck, ShieldAlert, Sparkles, WandSparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import {
  generateCopilotReplyAction,
  type CopilotReplyResult,
} from "@/app/conversations/copilot-actions";

type SuccessfulCopilotReply = Extract<CopilotReplyResult, { ok: true }>;

function leadIdFromProfileLink() {
  const profileLink = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href^="/leads/"]'),
  ).find((link) => link.textContent?.trim() === "Lead profile");

  if (!profileLink) {
    return "";
  }

  try {
    const url = new URL(profileLink.href, window.location.origin);
    const parts = url.pathname.split("/").filter(Boolean);

    return parts[0] === "leads" && parts[1] ? parts[1] : "";
  } catch {
    return "";
  }
}

export function ConversationCopilotFloating() {
  const searchParams = useSearchParams();
  const queryLeadId = searchParams.get("lead")?.trim() || "";
  const [leadId, setLeadId] = useState(queryLeadId);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [result, setResult] = useState<SuccessfulCopilotReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const resolvedLeadId = queryLeadId || leadIdFromProfileLink();
    setLeadId(resolvedLeadId);

    const contextPane = document.querySelector<HTMLElement>(
      ".conversation-context-pane",
    );

    if (!contextPane || !resolvedLeadId) {
      setTarget(null);
      return;
    }

    const existingHost = contextPane.querySelector<HTMLElement>(
      '[data-copilot-host="true"]',
    );

    const host = existingHost ?? document.createElement("div");
    host.dataset.copilotHost = "true";

    if (!existingHost) {
      const firstSection = contextPane.firstElementChild;
      const insertionPoint = firstSection?.nextSibling ?? null;
      contextPane.insertBefore(host, insertionPoint);
    }

    const oldPlaceholder = contextPane.querySelector<HTMLElement>(
      ".conversation-ai-note",
    );

    if (oldPlaceholder) {
      oldPlaceholder.style.display = "none";
    }

    setResult(null);
    setError(null);
    setTarget(host);

    return () => {
      setTarget(null);

      if (!existingHost && host.isConnected) {
        host.remove();
      }

      if (oldPlaceholder) {
        oldPlaceholder.style.display = "";
      }
    };
  }, [queryLeadId]);

  if (!leadId || !target) {
    return null;
  }

  const generate = () => {
    if (isPending) return;

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
          channel: result.channel,
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

  return createPortal(
    <div className="mt-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700">
            <Bot size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900">AI Reply Co-Pilot</div>
            <div className="mt-0.5 text-[10px] font-medium leading-4 text-slate-500">
              Draft only · human approval required
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={isPending}
          className="btn-secondary !rounded-lg !px-3 !py-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <Sparkles size={14} className="animate-pulse" />
          ) : (
            <WandSparkles size={14} />
          )}
          {isPending ? "Drafting..." : result ? "Regenerate" : "Suggest reply"}
        </button>
      </div>

      {isPending ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/80 px-3 py-3 text-xs font-medium text-violet-700">
          <Sparkles size={14} className="animate-pulse" />
          Reading the lead, conversation and approved organization knowledge…
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
          {error}
        </div>
      ) : null}

      {result && !isPending ? (
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
              {result.channel === "instagram" ? "Instagram" : "WhatsApp"}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
              {result.intent || "general enquiry"}
            </span>
            {result.knowledgeUsed > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-violet-700 ring-1 ring-inset ring-violet-200">
                <BookOpenCheck size={11} />
                Knowledge {result.knowledgeUsed}
              </span>
            ) : null}
          </div>

          <div className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
            {result.draft}
          </div>

          {result.risk !== "low" ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
              <ShieldAlert size={13} className="mt-0.5 shrink-0" />
              <span>{result.reason}</span>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-medium leading-4 text-slate-400">
              {result.risk === "human_only"
                ? "Acknowledgement draft only. Staff action is required."
                : "Review or edit before sending."}
            </div>
            <button
              type="button"
              onClick={useDraft}
              className="btn-primary !rounded-lg !px-3 !py-2 text-xs"
            >
              {result.risk === "human_only" ? "Use acknowledgement" : "Use draft"}
            </button>
          </div>
        </div>
      ) : null}
    </div>,
    target,
  );
}
