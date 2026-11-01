"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  LoaderCircle,
} from "lucide-react";

type Recommendation = {
  id: string;
  signalId: string;
  episodeSequence: number;
  title: string;
  score: number;
  actionText: string;
  reasonText: string;
  baselineValue: number;
  targetLeadCount: number;
  evidenceLabel: string;
  href: string;
};

type PresentationResponse = {
  ok: boolean;
  evidenceClass?: string;
  recommendations?: Recommendation[];
  error?: string;
};

export function RecommendedActions() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; recommendations: Recommendation[] }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/intelligence/recommendations/present", {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });

        const payload = (await response.json().catch(() => null)) as
          | PresentationResponse
          | null;

        if (!response.ok || !payload?.ok) {
          throw new Error(
            payload?.error || "Recommended actions are temporarily unavailable.",
          );
        }

        setState({
          status: "ready",
          recommendations: payload.recommendations ?? [],
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Recommended actions are temporarily unavailable.",
        });
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return (
    <section className="overflow-hidden rounded-card border border-ai-line bg-surface shadow-sm">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ai-soft text-ai-text">
            <Lightbulb size={17} />
          </span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-ai-text">
              Recommended actions
            </div>
            <div className="mt-1 text-base font-semibold text-copy-strong">
              Deterministic CRM guidance
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-copy-muted">
              Prioritized from observed CRM conversation, task and pipeline state.
              Priority scores order the work; they are not conversion probabilities.
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-ai-line bg-ai-soft px-2.5 py-1 text-[10px] font-semibold text-ai-text">
          <CheckCircle2 size={12} /> Observed evidence
        </span>
      </div>

      {state.status === "loading" ? (
        <div className="flex items-center gap-3 px-5 py-6 text-sm text-copy-muted">
          <LoaderCircle size={17} className="animate-spin" />
          Resolving current recommendation episodes…
        </div>
      ) : state.status === "error" ? (
        <div className="m-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Recommended actions unavailable</div>
            <p className="mt-1 text-xs leading-5">{state.message}</p>
            <p className="mt-1 text-[11px] leading-5 opacity-80">
              The factual Command Center panels remain available and are not
              replaced by inferred fallback recommendations.
            </p>
          </div>
        </div>
      ) : state.recommendations.length ? (
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {state.recommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
            />
          ))}
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <div className="text-sm font-semibold text-copy-strong">
            No new deterministic recommendations right now
          </div>
          <p className="mx-auto mt-1 max-w-2xl text-xs leading-5 text-copy-muted">
            A recommendation appears only when an approved CRM signal is active
            and the current signal episode is eligible for presentation.
          </p>
        </div>
      )}
    </section>
  );
}

function RecommendationCard({
  recommendation,
}: {
  recommendation: Recommendation;
}) {
  return (
    <article className="rounded-xl border border-line bg-surface px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-ai-soft px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-ai-text">
          Priority {recommendation.score}
        </span>
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-copy-muted">
          Episode {recommendation.episodeSequence}
        </span>
      </div>

      <h3 className="mt-3 text-sm font-semibold text-copy-strong">
        {recommendation.title}
      </h3>
      <p className="mt-1 text-xs leading-5 text-copy-muted">
        {recommendation.actionText}
      </p>
      <p className="mt-2 text-[11px] leading-5 text-copy-subtle">
        {recommendation.reasonText}
      </p>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
        <span className="rounded-full bg-surface-muted px-2 py-1 text-copy-muted">
          {recommendation.evidenceLabel}
        </span>
        <span className="rounded-full bg-surface-muted px-2 py-1 text-copy-muted">
          Baseline {recommendation.baselineValue.toLocaleString("en-IN")}
        </span>
        <span className="rounded-full bg-surface-muted px-2 py-1 text-copy-muted">
          Working set {recommendation.targetLeadCount.toLocaleString("en-IN")}
        </span>
      </div>

      <Link
        href={recommendation.href}
        className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300"
      >
        Open work queue <ArrowRight size={12} />
      </Link>
    </article>
  );
}
