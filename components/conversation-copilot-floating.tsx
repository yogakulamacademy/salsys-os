"use client";

import {
  Bot,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ShieldAlert,
  Sparkles,
  WandSparkles,
} from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SuccessfulCopilotReply | null>(null);
  const [draftText, setDraftText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
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

    setOpen(false);
    setResult(null);
    setDraftText("");
    setError(null);
    setCopied(false);
    setShowWhy(false);
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

    setOpen(true);
    setError(null);
    setCopied(false);
    setShowWhy(false);

    startTransition(async () => {
      const response = await generateCopilotReplyAction(leadId);

      if (!response.ok) {
        setResult(null);
        setDraftText("");
        setError(response.error);
        return;
      }

      setResult(response);
      setDraftText(response.draft);
    });
  };

  const useDraft = () => {
    const body = draftText.trim();
    if (!result || !body) return;

    window.dispatchEvent(
      new CustomEvent("crm:copilot-draft", {
        detail: {
          channel: result.channel,
          body,
          risk: result.risk,
          intent: result.intent,
          model: result.model,
        },
      }),
    );
  };

  const copyDraft = async () => {
    const body = draftText.trim();
    if (!body) return;

    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const riskTone =
    result?.risk === "human_only"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
      : result?.risk === "review"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300";

  return createPortal(
    <div className="mt-4 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm dark:border-violet-900/60 dark:bg-slate-950">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group w-full bg-gradient-to-br from-violet-50 via-white to-sky-50 p-3 text-left transition hover:from-violet-100/70 hover:to-sky-100/60 dark:from-violet-950/25 dark:via-slate-950 dark:to-sky-950/15"
        >
          <div className="flex items-center gap-3">
            <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200 dark:shadow-none">
              <Bot size={17} />
              <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-white text-violet-600 shadow-sm dark:bg-slate-900 dark:text-violet-300">
                <Sparkles size={9} />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-xs font-black text-slate-950 dark:text-white">
                  AI Reply Co-Pilot
                </div>
                <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em] text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                  Human controlled
                </span>
              </div>
              <div className="mt-1 text-[10px] font-medium leading-4 text-slate-500">
                Analyse the conversation, draft a reply, edit it, then choose whether to use it.
              </div>
            </div>
            <ChevronDown
              size={16}
              className="shrink-0 text-slate-300 transition group-hover:translate-y-0.5 group-hover:text-violet-500"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-[8px] font-bold text-slate-500">
            <span className="rounded-lg border border-white bg-white/80 px-2 py-1.5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              Conversation aware
            </span>
            <span className="rounded-lg border border-white bg-white/80 px-2 py-1.5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              Approved knowledge
            </span>
            <span className="rounded-lg border border-white bg-white/80 px-2 py-1.5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              Never auto-sends
            </span>
          </div>
        </button>
      ) : (
        <div>
          <div className="border-b border-violet-100 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-3 dark:border-violet-900/40 dark:from-violet-950/20 dark:via-slate-950 dark:to-sky-950/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-white shadow-sm">
                  <Bot size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-slate-950 dark:text-white">
                    AI Reply Co-Pilot
                  </div>
                  <div className="mt-0.5 text-[9px] font-medium leading-4 text-slate-500">
                    Draft only · you review · you decide whether to send
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-violet-100 bg-white text-slate-400 transition hover:bg-violet-50 hover:text-violet-600 dark:border-slate-800 dark:bg-slate-900"
                aria-label="Collapse AI Reply Co-Pilot"
              >
                <ChevronUp size={14} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <FlowStep number="1" label="Analyse" active={!result || isPending} complete={Boolean(result)} />
              <FlowStep number="2" label="Draft" active={isPending || Boolean(result)} complete={Boolean(result)} />
              <FlowStep number="3" label="Review" active={Boolean(result) && !isPending} complete={false} />
            </div>
          </div>

          <div className="p-3">
            {!result && !isPending ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="text-[10px] font-black text-slate-800 dark:text-slate-100">
                  Ready to build a reply
                </div>
                <div className="mt-1 text-[9px] leading-4 text-slate-500">
                  The co-pilot will read the latest customer message, recent conversation context and approved organization knowledge before drafting.
                </div>
                <button
                  type="button"
                  onClick={generate}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 text-[10px] font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-700"
                >
                  <WandSparkles size={14} /> Suggest a reply
                </button>
              </div>
            ) : null}

            {isPending ? (
              <div className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/50 p-3 dark:border-violet-900/40 dark:bg-violet-950/10">
                <div className="flex items-center gap-2 text-[10px] font-black text-violet-700 dark:text-violet-300">
                  <Sparkles size={14} className="animate-pulse" />
                  Building a context-aware draft…
                </div>
                <div className="space-y-2 pt-1">
                  <div className="h-2.5 w-full animate-pulse rounded-full bg-violet-100 dark:bg-violet-950/60" />
                  <div className="h-2.5 w-[88%] animate-pulse rounded-full bg-violet-100 dark:bg-violet-950/60" />
                  <div className="h-2.5 w-[72%] animate-pulse rounded-full bg-violet-100 dark:bg-violet-950/60" />
                </div>
                <div className="text-[8px] font-medium text-violet-500 dark:text-violet-400">
                  Conversation → intent → safety → approved knowledge → draft
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10px] leading-5 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
                {error}
              </div>
            ) : null}

            {result && !isPending ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[8px] font-bold">
                  <span className={`rounded-full border px-2 py-1 ${riskTone}`}>
                    {result.risk === "human_only"
                      ? "Human-only review"
                      : result.risk === "review"
                        ? "Review carefully"
                        : "Low risk"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    {result.channel === "instagram" ? "Instagram" : "WhatsApp"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    {result.intent || "general enquiry"}
                  </span>
                  {result.knowledgeUsed > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-violet-700 ring-1 ring-inset ring-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:ring-violet-900">
                      <BookOpenCheck size={10} />
                      {result.knowledgeUsed} knowledge source{result.knowledgeUsed === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                        Suggested reply
                      </div>
                      <div className="mt-0.5 text-[8px] text-slate-400">
                        Edit anything before using it
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={copyDraft}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[8px] font-black text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                    >
                      {copied ? <Check size={10} /> : <Copy size={10} />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>

                  <textarea
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    rows={7}
                    className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-medium leading-5 text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-950 dark:focus:ring-violet-950/20"
                  />

                  <div className="mt-2 flex items-center justify-between gap-2 text-[8px] text-slate-400">
                    <span>{draftText.trim().length.toLocaleString("en-IN")} characters</span>
                    <span>Human approval required</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowWhy((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-900"
                >
                  <span className="flex items-center gap-2 text-[9px] font-black text-slate-600 dark:text-slate-300">
                    <ShieldAlert size={12} /> Why this draft?
                  </span>
                  {showWhy ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {showWhy ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-[9px] leading-4 text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
                    <div className="font-black text-slate-700 dark:text-slate-200">Safety / routing reason</div>
                    <div className="mt-1">{result.reason}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[8px] text-slate-400">
                      <span>Intent: {result.intent || "general enquiry"}</span>
                      <span>·</span>
                      <span>Knowledge used: {result.knowledgeUsed}</span>
                      <span>·</span>
                      <span>Model: {result.model}</span>
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                  <button
                    type="button"
                    onClick={generate}
                    disabled={isPending}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[9px] font-black text-slate-600 transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                  >
                    <WandSparkles size={13} /> Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={useDraft}
                    disabled={!draftText.trim()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 text-[10px] font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Check size={13} />
                    {result.risk === "human_only" ? "Use acknowledgement" : "Use edited draft"}
                  </button>
                </div>

                <div className="text-center text-[8px] leading-4 text-slate-400">
                  Using a draft only places it in the composer. SalsysOS does not send it automatically.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>,
    target,
  );
}

function FlowStep({
  number,
  label,
  active,
  complete,
}: {
  number: string;
  label: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[8px] font-black transition ${
        active
          ? "border-violet-200 bg-white text-violet-700 shadow-sm dark:border-violet-900 dark:bg-slate-900 dark:text-violet-300"
          : complete
            ? "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300"
            : "border-white/80 bg-white/50 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40"
      }`}
    >
      <span
        className={`grid h-4 w-4 place-items-center rounded-full text-[7px] ${
          complete
            ? "bg-emerald-500 text-white"
            : active
              ? "bg-violet-600 text-white"
              : "bg-slate-100 text-slate-400 dark:bg-slate-800"
        }`}
      >
        {complete ? <Check size={8} /> : number}
      </span>
      {label}
    </div>
  );
}
