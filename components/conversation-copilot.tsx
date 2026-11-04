"use client";

import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Paperclip,
  ShieldAlert,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { KnowledgeEvidenceList } from '@/components/knowledge-evidence-list';

import {
  discoverCopilotSalesAssetsAction,
  type CopilotAssetSuggestion,
} from "@/app/conversations/copilot-asset-actions";
import { prepareCopilotAssetSelectionAction } from "@/app/conversations/copilot-asset-selection-actions";
import {
  generateCopilotReplyAction,
  type CopilotReplyResult,
} from "@/app/conversations/copilot-actions";

type SupportedChannel = "instagram" | "whatsapp";
type SuccessfulCopilotReply = Extract<CopilotReplyResult, { ok: true }>;

function scopeLabel(values: string[]) {
  if (!values.length) return "All";
  return values.slice(0, 3).join(", ");
}

export function ConversationCopilot({
  leadId,
  channel,
  enabled = true,
  disabledReason,
  compactToolbar = false,
}: {
  leadId: string;
  channel: SupportedChannel;
  enabled?: boolean;
  disabledReason?: string;
  compactToolbar?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SuccessfulCopilotReply | null>(null);
  const [assetSuggestions, setAssetSuggestions] = useState<CopilotAssetSuggestion[]>([]);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [assetSelectionError, setAssetSelectionError] = useState<string | null>(null);
  const [assetSelectionNotice, setAssetSelectionNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isAssetPending, startAssetTransition] = useTransition();

  const generate = () => {
    if (!enabled || isPending) return;
    setOpen(true);
    setError(null);
    setAssetError(null);
    setAssetSelectionError(null);
    setAssetSelectionNotice(null);

    startTransition(async () => {
      const [response, assetResponse] = await Promise.all([
        generateCopilotReplyAction(leadId),
        discoverCopilotSalesAssetsAction(leadId),
      ]);

      if (!response.ok) {
        setResult(null);
        setAssetSuggestions([]);
        setError(response.error);
        return;
      }

      setResult(response);
      if (assetResponse.ok) {
        setAssetSuggestions(assetResponse.suggestions);
      } else {
        setAssetSuggestions([]);
        setAssetError(assetResponse.error);
      }
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

  const prepareAsset = (asset: CopilotAssetSuggestion) => {
    if (channel !== "whatsapp" || isAssetPending) return;

    setAssetSelectionError(null);
    setAssetSelectionNotice(null);

    startAssetTransition(async () => {
      const response = await prepareCopilotAssetSelectionAction(
        leadId,
        asset.assetId,
      );

      if (!response.ok) {
        setAssetSelectionError(response.error);
        return;
      }

      window.dispatchEvent(
        new CustomEvent("crm:copilot-asset-selected", {
          detail: response.selection,
        }),
      );
      setAssetSelectionNotice(
        `${response.selection.title} was revalidated and prepared in the WhatsApp composer.`,
      );
    });
  };

  const riskTone =
    result?.risk === "human_only"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
      : result?.risk === "review"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300";

  return (
    <section className="overflow-hidden rounded-xl border border-brand-100 bg-surface dark:border-slate-800 dark:bg-slate-950">
      {compactToolbar ? (
        <div className="ibx-v2-copilot-bar">
          <span className="ibx-v2-ai-label"><Sparkles size={17}/> AI suggestions for this conversation</span>
          <div className="ibx-v2-ai-actions">
            <button type="button" disabled={!enabled || isPending} onClick={generate} title={disabledReason || "Prepare a grounded reply for human review"}>
              <WandSparkles size={14}/> {isPending ? "Drafting…" : "Draft a reply"}
            </button>
            <button type="button" onClick={() => {
              const tabs=Array.from(document.querySelectorAll<HTMLButtonElement>('.ibx-v2-center-tabs [role="tab"]'));
              tabs.find(tab=>tab.textContent?.includes("Activity"))?.click();
            }} title="Review actual conversation and CRM activity">
              <Database size={14}/> Review activity
            </button>
            <button type="button" onClick={() => {
              const panel=document.getElementById("inbox-next-steps");
              if(panel){panel.scrollIntoView({block:"nearest",behavior:"smooth"});return;}
              document.querySelector<HTMLButtonElement>('button[aria-label="Show customer context"]')?.click();
            }} title="Review next steps in the customer panel">
              <Sparkles size={14}/> Next best action
            </button>
            <button type="button" onClick={() => setOpen(value=>!value)}
              aria-label={open?"Collapse AI suggestions":"Expand AI suggestions"}
              aria-expanded={open} title="AI suggestion details">
              {open?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
            </button>
          </div>
        </div>
      ) : (
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-brand-50/60 dark:hover:bg-slate-900/50"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-violet-950/30 dark:text-violet-300">
          <Bot size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-copy-strong">
            Ask Salsys · Reply Copilot
          </span>
          <span className="mt-0.5 block text-[9px] leading-4 text-copy-muted">
            Prepare a grounded reply draft and relevant approved assets for human review. Never auto-sends.
          </span>
        </span>
        {open ? (
          <ChevronUp size={14} className="text-copy-subtle" />
        ) : (
          <ChevronDown size={14} className="text-copy-subtle" />
        )}
      </button>

      )}
      {open ? (
        <div className="border-t border-line p-3 dark:border-slate-900">
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
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-3 text-[10px] font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? (
                <Sparkles size={13} className="animate-pulse" />
              ) : (
                <WandSparkles size={13} />
              )}
              {isPending
                ? "Building grounded draft…"
                : result
                  ? "Regenerate draft"
                  : "Draft next reply"}
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
                    ? "Human-only"
                    : result.risk === "review"
                      ? "Review carefully"
                      : "Low risk"}
                </span>
                <span className="rounded-full bg-surface-soft px-2 py-1 text-copy-muted dark:bg-slate-900 dark:text-slate-300">
                  {result.intent || "General enquiry"}
                </span>
                <span className="rounded-full bg-surface-soft px-2 py-1 text-copy-muted dark:bg-slate-900 dark:text-slate-300">
                  {result.nextAction === "handoff" ? "Escalate" : "Reply"}
                </span>
                {assetSuggestions.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300">
                    <Paperclip size={10} /> {assetSuggestions.length} approved asset{assetSuggestions.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>

              <div className="rounded-lg border border-line bg-surface-soft px-3 py-3 text-[11px] leading-5 text-copy-muted dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
                {result.draft}
              </div>

              {assetSuggestions.length > 0 || assetError ? (
                <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-3 dark:border-sky-900/40 dark:bg-sky-950/10">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-sky-700 dark:text-sky-300">
                        <Paperclip size={11} /> Relevant approved assets
                      </div>
                      <div className="mt-1 text-[8px] leading-4 text-copy-subtle">
                        Suggestions are metadata only. Selecting one triggers a fresh server-side eligibility preflight.
                      </div>
                    </div>
                    <Link
                      href="/settings/assets"
                      className="shrink-0 text-[8px] font-semibold text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                    >
                      Asset library
                    </Link>
                  </div>

                  {assetError ? (
                    <div className="mt-2 rounded-md border border-amber-100 bg-amber-50 px-2.5 py-2 text-[8px] leading-4 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                      {assetError} The reply draft is still available for human review.
                    </div>
                  ) : null}

                  {assetSelectionError ? (
                    <div className="mt-2 rounded-md border border-red-100 bg-red-50 px-2.5 py-2 text-[8px] leading-4 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                      {assetSelectionError}
                    </div>
                  ) : null}

                  {assetSelectionNotice ? (
                    <div className="mt-2 rounded-md border border-emerald-100 bg-emerald-50 px-2.5 py-2 text-[8px] leading-4 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                      {assetSelectionNotice}
                    </div>
                  ) : null}

                  {assetSuggestions.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {assetSuggestions.map((asset) => (
                        <div
                          key={asset.assetId}
                          className="rounded-lg border border-sky-100 bg-white px-2.5 py-2 dark:border-sky-900/40 dark:bg-slate-950"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-[9px] font-semibold text-copy-strong">
                                {asset.title}
                              </div>
                              <div className="mt-0.5 text-[8px] capitalize text-copy-muted">
                                {asset.assetKind} · v{asset.version}
                              </div>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-semibold ${
                                asset.autoSendAllowed
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"
                              }`}
                            >
                              {asset.autoSendAllowed ? "Dispatch permitted" : "Manual use"}
                            </span>
                          </div>
                          {asset.description ? (
                            <div className="mt-1.5 line-clamp-2 text-[8px] leading-4 text-copy-muted">
                              {asset.description}
                            </div>
                          ) : null}
                          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[7px] text-copy-subtle">
                            <span>Course: {scopeLabel(asset.courseScope)}</span>
                            <span>Location: {scopeLabel(asset.locationScope)}</span>
                            <span>Language: {scopeLabel(asset.languageScope)}</span>
                          </div>
                          {channel === "whatsapp" ? (
                            <button
                              type="button"
                              onClick={() => prepareAsset(asset)}
                              disabled={isAssetPending}
                              className="mt-2 inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2 text-[8px] font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-300"
                            >
                              <Paperclip size={10} />
                              {isAssetPending ? "Revalidating asset…" : "Prepare attachment in composer"}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-2 text-[7px] leading-4 text-copy-subtle">
                    Preflight does not send media. The selected asset must be re-resolved again by the future provider transport immediately before delivery.
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3 dark:border-violet-900/40 dark:bg-violet-950/15">
                <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-brand-700 dark:text-violet-300">
                  <Database size={11} /> Grounding & provenance
                </div>
                <div className="mt-2 space-y-1.5 text-[9px] leading-4 text-copy-muted dark:text-slate-300">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-success" />
                    <span>Live CRM course, batch and lead data is the factual source of truth; conversation history is conversational context only.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-success" />
                    <span>
                      {result.knowledgeUsed > 0
                        ? `${result.knowledgeUsed} approved organization knowledge match${result.knowledgeUsed === 1 ? "" : "es"} retrieved for this draft.`
                        : "No approved organization knowledge matched this request; organization-specific facts must still be supported by live CRM data rather than older conversation claims."}
                    </span>
                  </div>
                  <div className="text-[8px] text-copy-subtle">
                    Draft model: {result.model} · Router: {result.routerModel}
                  </div>
                </div>
              </div>

              <KnowledgeEvidenceList evidence={result.knowledgeEvidence} />
              {result.risk !== "low" ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[9px] leading-4 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                  <ShieldAlert size={12} className="mt-0.5 shrink-0" />
                  <span>{result.reason}</span>
                </div>
              ) : null}

              <button
                type="button"
                onClick={useDraft}
                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-brand-100 bg-surface px-3 text-[10px] font-semibold text-brand-700 transition hover:bg-brand-50 dark:border-slate-800 dark:bg-slate-950 dark:text-violet-200 dark:hover:bg-slate-900"
              >
                Use draft in composer
              </button>

              <div className="text-center text-[8px] leading-4 text-copy-subtle">
                AI never sends the message. Eligibility is checked separately, and a human must review and press Send.
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
