"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  CirclePlay,
  Lightbulb,
  LoaderCircle,
  X,
} from "lucide-react";

import {
  getAvailableRecommendationFeedbackEvents,
  type RecommendationFeedbackEvent,
  type RecommendationLifecycle,
} from "@/lib/intelligence/recommendation-lifecycle";

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
  lifecycleState: RecommendationLifecycle;
  acceptedAt: string | null;
  dismissedAt: string | null;
  actedAt: string | null;
  completedAt: string | null;
};

type PresentationResponse = {
  ok: boolean;
  evidenceClass?: string;
  partial?: boolean;
  unavailableSignals?: string[];
  committedUnavailable?: boolean;
  recommendations?: Recommendation[];
  error?: string;
};

type FeedbackSnapshot = {
  id: string;
  lifecycleState: RecommendationLifecycle;
  acceptedAt: string | null;
  dismissedAt: string | null;
  actedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  availableActions: RecommendationFeedbackEvent[];
};

type FeedbackResponse = {
  ok: boolean;
  recommendation?: FeedbackSnapshot | null;
  error?: string;
};

type ReadyState = {
  status: "ready";
  recommendations: Recommendation[];
  partial: boolean;
};

type ConfirmationState = {
  eventType: "dismissed" | "action_completed";
  title: string;
  description: string;
  confirmLabel: string;
};

export function RecommendedActions() {
  const [state, setState] = useState<
    | { status: "loading" }
    | ReadyState
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
          partial: payload.partial === true,
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
        <div>
          {state.partial ? (
            <div className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Some recommendation data is temporarily unavailable. The actions
                below were persisted or read successfully and remain grounded in
                observed CRM evidence.
              </span>
            </div>
          ) : null}
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {state.recommendations.map((recommendation) => (
              <RecommendationCard
                key={recommendation.id}
                recommendation={recommendation}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <div className="text-sm font-semibold text-copy-strong">
            No current deterministic recommendation work
          </div>
          <p className="mx-auto mt-1 max-w-2xl text-xs leading-5 text-copy-muted">
            New recommendations appear only from approved observed CRM signals.
            Accepted or in-progress recommendations stay here until dismissed or
            completed.
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
  const [current, setCurrent] = useState(recommendation);
  const [pendingAction, setPendingAction] =
    useState<RecommendationFeedbackEvent | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [confirmation, setConfirmation] =
    useState<ConfirmationState | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    setCurrent(recommendation);
  }, [recommendation]);

  const availableActions = useMemo(
    () => getAvailableRecommendationFeedbackEvents(current.lifecycleState),
    [current.lifecycleState],
  );

  async function submitFeedback(
    eventType: RecommendationFeedbackEvent,
    eventNote?: string,
  ) {
    if (pendingAction) return;

    setPendingAction(eventType);
    setFeedbackError(null);

    try {
      const response = await fetch("/api/intelligence/recommendations/feedback", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          recommendationId: current.id,
          eventType,
          note: eventNote?.trim() || null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | FeedbackResponse
        | null;

      if (payload?.recommendation) {
        setCurrent((value) => ({
          ...value,
          lifecycleState: payload.recommendation!.lifecycleState,
          acceptedAt: payload.recommendation!.acceptedAt,
          dismissedAt: payload.recommendation!.dismissedAt,
          actedAt: payload.recommendation!.actedAt,
          completedAt: payload.recommendation!.completedAt,
        }));
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error || "Recommendation action could not be applied.",
        );
      }

      setConfirmation(null);
      setNote("");
    } catch (error) {
      setFeedbackError(
        error instanceof Error
          ? error.message
          : "Recommendation action could not be applied.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  function requestConfirmation(eventType: "dismissed" | "action_completed") {
    setFeedbackError(null);
    setNote("");

    if (eventType === "dismissed") {
      setConfirmation({
        eventType,
        title: "Dismiss recommendation?",
        description:
          "This closes this recommendation episode. The lifecycle event remains in the audit history.",
        confirmLabel: "Dismiss recommendation",
      });
      return;
    }

    setConfirmation({
      eventType,
      title: "Mark recommendation complete?",
      description:
        "This closes the recommendation workflow. It does not claim that the customer or business outcome was successful.",
      confirmLabel: "Mark complete",
    });
  }

  const lifecycleTimestamp = getLifecycleTimestamp(current);
  const terminal =
    current.lifecycleState === "completed" ||
    current.lifecycleState === "dismissed" ||
    current.lifecycleState === "expired";

  return (
    <article className="relative rounded-xl border border-line bg-surface px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <LifecycleBadge lifecycle={current.lifecycleState} />
        <span className="rounded-full bg-ai-soft px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-ai-text">
          Priority {current.score}
        </span>
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-copy-muted">
          Episode {current.episodeSequence}
        </span>
      </div>

      <h3 className="mt-3 text-sm font-semibold text-copy-strong">
        {current.title}
      </h3>
      <p className="mt-1 text-xs leading-5 text-copy-muted">
        {current.actionText}
      </p>
      <p className="mt-2 text-[11px] leading-5 text-copy-subtle">
        {current.reasonText}
      </p>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
        <span className="rounded-full bg-surface-muted px-2 py-1 text-copy-muted">
          {current.evidenceLabel}
        </span>
        <span className="rounded-full bg-surface-muted px-2 py-1 text-copy-muted">
          Baseline {current.baselineValue.toLocaleString("en-IN")}
        </span>
        <span className="rounded-full bg-surface-muted px-2 py-1 text-copy-muted">
          Working set {current.targetLeadCount.toLocaleString("en-IN")}
        </span>
      </div>

      {lifecycleTimestamp ? (
        <div className="mt-3 text-[10px] text-copy-subtle">
          {lifecycleTimestamp.label} {formatDateTime(lifecycleTimestamp.value)}
        </div>
      ) : null}

      {feedbackError ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>{feedbackError}</span>
        </div>
      ) : null}

      {current.lifecycleState === "completed" ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
          Workflow marked complete. This is a human workflow status, not a claim
          about the customer or business outcome.
        </div>
      ) : null}

      {current.lifecycleState === "dismissed" ? (
        <div className="mt-3 rounded-lg border border-line bg-surface-muted px-3 py-2 text-[11px] leading-5 text-copy-muted">
          Recommendation dismissed. The lifecycle event remains in the audit
          history.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {availableActions.includes("accepted") ? (
          <FeedbackButton
            label="Accept"
            pending={pendingAction === "accepted"}
            disabled={Boolean(pendingAction)}
            icon={<Check size={12} />}
            onClick={() => void submitFeedback("accepted")}
          />
        ) : null}

        {availableActions.includes("action_started") ? (
          <FeedbackButton
            label="Start action"
            pending={pendingAction === "action_started"}
            disabled={Boolean(pendingAction)}
            icon={<CirclePlay size={12} />}
            onClick={() => void submitFeedback("action_started")}
          />
        ) : null}

        {availableActions.includes("action_completed") ? (
          <FeedbackButton
            label="Mark complete"
            pending={pendingAction === "action_completed"}
            disabled={Boolean(pendingAction)}
            icon={<CheckCircle2 size={12} />}
            onClick={() => requestConfirmation("action_completed")}
          />
        ) : null}

        {availableActions.includes("dismissed") ? (
          <button
            type="button"
            disabled={Boolean(pendingAction)}
            onClick={() => requestConfirmation("dismissed")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[11px] font-semibold text-copy-muted transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={12} /> Dismiss
          </button>
        ) : null}

        {!terminal ? (
          <Link
            href={current.href}
            className="inline-flex items-center gap-1 px-1 py-2 text-[11px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300"
          >
            Open work queue <ArrowRight size={12} />
          </Link>
        ) : null}
      </div>

      {current.lifecycleState === "accepted" ? (
        <p className="mt-2 text-[10px] leading-4 text-copy-subtle">
          Accepting records human intent only. Start action separately when work
          actually begins.
        </p>
      ) : null}

      {current.lifecycleState === "in_progress" ? (
        <p className="mt-2 text-[10px] leading-4 text-copy-subtle">
          Action start is the workflow intervention timestamp. Completing the
          card does not assert a successful downstream outcome.
        </p>
      ) : null}

      {confirmation ? (
        <FeedbackConfirmation
          confirmation={confirmation}
          note={note}
          pending={pendingAction === confirmation.eventType}
          onNoteChange={setNote}
          onCancel={() => {
            if (pendingAction) return;
            setConfirmation(null);
            setNote("");
          }}
          onConfirm={() =>
            void submitFeedback(confirmation.eventType, note)
          }
        />
      ) : null}
    </article>
  );
}

function FeedbackButton({
  label,
  icon,
  pending,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <LoaderCircle size={12} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

function FeedbackConfirmation({
  confirmation,
  note,
  pending,
  onNoteChange,
  onCancel,
  onConfirm,
}: {
  confirmation: ConfirmationState;
  note: string;
  pending: boolean;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[190] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-[1px]"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close recommendation confirmation"
        className="absolute inset-0"
        disabled={pending}
        onClick={onCancel}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recommendation-feedback-title"
      >
        <div
          id="recommendation-feedback-title"
          className="text-[15px] font-semibold text-copy-strong"
        >
          {confirmation.title}
        </div>
        <p className="mt-2 text-xs leading-5 text-copy-muted">
          {confirmation.description}
        </p>

        <label className="mt-4 block text-[11px] font-semibold text-copy-muted">
          Optional workflow note
          <textarea
            value={note}
            maxLength={500}
            disabled={pending}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={4}
            placeholder="Add context for the lifecycle audit trail…"
            className="mt-2 w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-xs text-copy-strong outline-none transition focus:border-brand-400 disabled:opacity-60"
          />
        </label>
        <div className="mt-1 text-right text-[10px] text-copy-subtle">
          {note.length}/500
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-lg border border-line px-3 py-2 text-[11px] font-semibold text-copy-muted hover:bg-surface-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {pending ? <LoaderCircle size={12} className="animate-spin" /> : null}
            {confirmation.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function LifecycleBadge({ lifecycle }: { lifecycle: RecommendationLifecycle }) {
  const label =
    lifecycle === "active"
      ? "Recommended"
      : lifecycle === "accepted"
        ? "Accepted"
        : lifecycle === "in_progress"
          ? "In progress"
          : lifecycle === "completed"
            ? "Completed"
            : lifecycle === "dismissed"
              ? "Dismissed"
              : "Expired";

  return (
    <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-copy-muted">
      {label}
    </span>
  );
}

function getLifecycleTimestamp(recommendation: Recommendation) {
  if (recommendation.lifecycleState === "completed" && recommendation.completedAt) {
    return { label: "Completed", value: recommendation.completedAt };
  }
  if (recommendation.lifecycleState === "dismissed" && recommendation.dismissedAt) {
    return { label: "Dismissed", value: recommendation.dismissedAt };
  }
  if (recommendation.lifecycleState === "in_progress" && recommendation.actedAt) {
    return { label: "Started", value: recommendation.actedAt };
  }
  if (recommendation.lifecycleState === "accepted" && recommendation.acceptedAt) {
    return { label: "Accepted", value: recommendation.acceptedAt };
  }
  return null;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
