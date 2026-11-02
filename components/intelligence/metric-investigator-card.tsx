"use client";

import { ArrowRight, CheckCircle2, Info, PanelRightOpen, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useModalFocus } from "@/components/use-modal-focus";
import { createPortal } from "react-dom";

import { DecisionMetricLink } from "@/components/intelligence/decision-metric-link";
import {
  captureInvestigationScope,
  describeInvestigationScope,
  transferInvestigationScope,
} from "@/lib/investigation-scope";
import {
  resolveMetricNextCheck,
  resolveMetricRelatedLinks,
} from "@/lib/metric-investigation-guidance";
import type {
  MetricDeltaDirection,
  MetricEvidenceState,
} from "@/lib/metric-definitions";

type MetricTone = "neutral" | "positive" | "warning" | "critical";

const toneStyles: Record<MetricTone, string> = {
  neutral: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/60 dark:bg-brand-950/25 dark:text-brand-300",
  positive: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300",
  critical: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-300",
};

const evidenceStyles: Record<MetricEvidenceState, string> = {
  observed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300",
  derived: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/60 dark:bg-brand-950/25 dark:text-brand-300",
  partial: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-300",
  unknown: "border-line bg-surface-muted text-copy-muted",
};

const evidenceNames: Record<MetricEvidenceState, string> = {
  observed: "Observed evidence",
  derived: "Derived evidence",
  partial: "Partial evidence",
  unknown: "Unknown evidence",
};

export function MetricInvestigatorCard({
  className,
  label,
  value,
  detail,
  href,
  definition,
  evidenceLabel,
  evidenceState,
  delta,
  comparisonLabel,
  deltaDirection,
  tone,
  statusLabel,
  children,
}: {
  className: string;
  label: string;
  value: string;
  detail?: string;
  href?: string;
  definition?: string;
  evidenceLabel?: string;
  evidenceState?: MetricEvidenceState;
  delta?: number | null;
  comparisonLabel?: string;
  deltaDirection: MetricDeltaDirection;
  tone: MetricTone;
  statusLabel?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null);
  useModalFocus(mounted && open, dialogRef, () => setOpen(false));

  useEffect(() => {
    setMounted(true);
    setSourceSearch(window.location.search);
  }, []);

  const nextCheck = resolveMetricNextCheck(label);
  const scope = captureInvestigationScope(sourceSearch);
  const scopeChips = describeInvestigationScope(scope);
  const relatedLinks = resolveMetricRelatedLinks(label)
    .filter((item) => item.href !== href)
    .map((item) => ({
      ...item,
      transfer: transferInvestigationScope(item.href, scope),
    }));
  const primaryTransfer = href
    ? transferInvestigationScope(href, scope)
    : null;

  return (
    <>
      <button
        type="button"
        className={`${className} w-full cursor-pointer text-left`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Inspect ${label}`}
      >
        {children}
      </button>

      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-[120]" role="presentation">
              <button
                data-modal-backdrop tabIndex={-1} aria-hidden="true"
                type="button"
                className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
                aria-label="Close metric investigation"
                onClick={() => setOpen(false)}
              />

              <section
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="metric-investigator-title"
                className="absolute inset-y-0 right-0 flex w-full max-w-[470px] flex-col border-l border-line bg-surface shadow-2xl"
              >
                <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-6">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-brand-700 dark:text-brand-300">
                      <PanelRightOpen size={13} /> Metric investigation
                    </div>
                    <h2
                      id="metric-investigator-title"
                      className="mt-2 text-xl font-semibold tracking-[-0.025em] text-copy-strong"
                    >
                      {label}
                    </h2>
                    <div className="mt-1 text-[30px] font-semibold tracking-[-0.045em] text-copy-strong">
                      {value}
                    </div>
                    {detail ? (
                      <p className="mt-1 text-sm leading-6 text-copy-muted">{detail}</p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-surface text-copy-muted transition hover:bg-surface-muted hover:text-copy-strong"
                    onClick={() => setOpen(false)}
                    aria-label="Close metric investigation"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                  <div className="flex flex-wrap gap-2">
                    {statusLabel ? (
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${toneStyles[tone]}`}>
                        {statusLabel}
                      </span>
                    ) : null}
                    {evidenceState ? (
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${evidenceStyles[evidenceState]}`}>
                        {evidenceState === "observed" ? <CheckCircle2 size={11} /> : <Info size={11} />}
                        {evidenceNames[evidenceState]}
                      </span>
                    ) : null}
                  </div>

                  <section className="mt-5 rounded-2xl border border-line bg-surface-muted/45 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-copy-subtle">
                      What this metric means
                    </div>
                    <p className="mt-2 text-sm leading-6 text-copy-muted">
                      {definition || "No additional metric definition is registered yet. Treat the displayed value as the current workspace evidence only."}
                    </p>
                    {evidenceLabel ? (
                      <div className="mt-3 border-t border-line pt-3 text-[11px] font-semibold text-copy-subtle">
                        Evidence source · {evidenceLabel}
                      </div>
                    ) : null}
                  </section>

                  <section className="mt-4 grid gap-3 sm:grid-cols-2">
                    <InsightBlock
                      label="Change"
                      detail={formatDeltaSummary(delta, deltaDirection, comparisonLabel)}
                    />
                    <InsightBlock
                      label="Next check"
                      detail={nextCheck || "Open the supporting workspace and verify the underlying records before taking action."}
                    />
                  </section>

                  {scopeChips.length ? (
                    <section className="mt-5 rounded-2xl border border-brand-200 bg-brand-50/55 p-4 dark:border-brand-900/60 dark:bg-brand-950/15">
                      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-brand-700 dark:text-brand-300">
                        Investigation scope
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {scopeChips.slice(0, 6).map((chip) => (
                          <span
                            key={`${chip.key}:${chip.value}`}
                            className="rounded-full border border-brand-200 bg-surface px-2.5 py-1 text-[10px] font-semibold text-copy-muted dark:border-brand-900/60"
                          >
                            {chip.label}: {chip.value}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] leading-4 text-copy-subtle">
                        Compatible filters follow the investigation automatically. Unsupported dimensions remain context only and never silently change destination data.
                      </p>
                    </section>
                  ) : null}

                  {relatedLinks.length ? (
                    <section className="mt-5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-copy-subtle">
                        Continue the investigation
                      </div>
                      <div className="mt-2 grid gap-2">
                        {relatedLinks.slice(0, 3).map((item) => (
                          <DecisionMetricLink
                            key={item.href}
                            href={item.transfer.href}
                            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm font-semibold text-copy-strong transition hover:border-line-strong hover:bg-surface-muted"
                            metricLabel={label}
                            metricValue={value}
                            metricDetail={detail}
                            evidenceLabel={evidenceLabel}
                            evidenceState={evidenceState}
                          >
                            <span className="min-w-0">
                              <span className="block">{item.label}</span>
                              {item.transfer.applied.length ? (
                                <span className="mt-0.5 block text-[9px] font-semibold text-brand-700 dark:text-brand-300">
                                  {item.transfer.applied.length} compatible {item.transfer.applied.length === 1 ? "filter" : "filters"} carried
                                </span>
                              ) : null}
                            </span>
                            <ArrowRight size={14} className="shrink-0 text-brand-700 dark:text-brand-300" />
                          </DecisionMetricLink>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>

                <div className="border-t border-line bg-surface px-5 py-4 sm:px-6">
                  {primaryTransfer ? (
                    <DecisionMetricLink
                      href={primaryTransfer.href}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white transition hover:bg-brand-800"
                      metricLabel={label}
                      metricValue={value}
                      metricDetail={detail}
                      evidenceLabel={evidenceLabel}
                      evidenceState={evidenceState}
                    >
                      Open supporting workspace
                      {primaryTransfer.applied.length ? ` · ${primaryTransfer.applied.length} scoped` : ""}
                      <ArrowRight size={14} />
                    </DecisionMetricLink>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold text-copy-muted"
                      onClick={() => setOpen(false)}
                    >
                      Close investigation
                    </button>
                  )}
                  <p className="mt-2 text-center text-[10px] leading-4 text-copy-subtle">
                    Compatible filters are carried automatically; destination evidence remains authoritative.
                  </p>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function InsightBlock({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-copy-subtle">
        {label}
      </div>
      <p className="mt-1 text-xs leading-5 text-copy-muted">{detail}</p>
    </div>
  );
}

function formatDeltaSummary(
  delta: number | null | undefined,
  direction: MetricDeltaDirection,
  comparisonLabel?: string,
) {
  const comparison = (comparisonLabel || "the previous comparable period").replace(/^(?:vs\.?|versus)\s+/i, "");

  if (delta == null) return `No reliable baseline is available for ${comparison}.`;
  if (delta === 0) return `No material change versus ${comparison}.`;

  const magnitude = `${Math.abs(delta).toFixed(1).replace(/\.0$/, "")}%`;
  if (direction === "neutral") {
    return `${magnitude} ${delta > 0 ? "increase" : "decrease"} versus ${comparison}. Direction is descriptive and should be interpreted with quality and outcome evidence.`;
  }

  const improved = direction === "higher_is_better" ? delta > 0 : delta < 0;
  return `${magnitude} ${delta > 0 ? "increase" : "decrease"} versus ${comparison}. This movement is ${improved ? "favorable" : "a review signal"} for this metric definition.`;
}
