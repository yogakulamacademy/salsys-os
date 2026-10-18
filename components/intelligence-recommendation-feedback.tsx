'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, ThumbsDown, ThumbsUp } from 'lucide-react';

type FeedbackState = 'idle' | 'accepted' | 'dismissed' | 'error';

export function IntelligenceRecommendationFeedback({ signalId, href }: { signalId: string; href?: string }) {
  const router = useRouter();
  const [recommendationId, setRecommendationId] = useState<string | null>(null);
  const [state, setState] = useState<FeedbackState>('idle');
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    if (touched.current) return;
    touched.current = true;

    let cancelled = false;
    void fetch('/api/intelligence/v1/recommendations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ event: 'shown', signal_id: signalId }),
      cache: 'no-store',
    })
      .then(async (response) => {
        const data = await response.json() as { ok?: boolean; recommendation_id?: string };
        if (!cancelled && response.ok && data.ok && data.recommendation_id) {
          setRecommendationId(data.recommendation_id);
        }
      })
      .catch(() => {
        // Recommendation feedback is additive; the operating brief remains usable if logging is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [signalId]);

  async function sendFeedback(event: 'accepted' | 'dismissed') {
    if (!recommendationId || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/intelligence/v1/recommendations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ event, recommendation_id: recommendationId }),
        cache: 'no-store',
      });
      const data = await response.json() as { ok?: boolean };
      if (!response.ok || !data.ok) throw new Error('feedback_failed');
      setState(event);
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  }

  async function actOnRecommendation() {
    if (!href || actionBusy) return;
    setActionBusy(true);

    try {
      if (recommendationId) {
        await fetch('/api/intelligence/v1/recommendations', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ event: 'action_started', recommendation_id: recommendationId }),
          cache: 'no-store',
        });
      }
    } catch {
      // Action logging must never block the operator from reaching the recommended workspace.
    } finally {
      router.push(href);
    }
  }

  const feedbackControl = state === 'accepted' ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
      <Check size={11} /> Useful signal recorded
    </span>
  ) : state === 'dismissed' ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
      <Check size={11} /> Not relevant recorded
    </span>
  ) : (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-[9px] font-semibold text-slate-400">Was this useful?</span>
      <button
        type="button"
        disabled={!recommendationId || busy}
        onClick={() => void sendFeedback('accepted')}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-500 transition hover:border-emerald-200 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Mark recommendation useful"
      >
        <ThumbsUp size={10} /> Yes
      </button>
      <button
        type="button"
        disabled={!recommendationId || busy}
        onClick={() => void sendFeedback('dismissed')}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-500 transition hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Mark recommendation not relevant"
      >
        <ThumbsDown size={10} /> No
      </button>
      {state === 'error' ? <span className="text-[9px] font-semibold text-rose-500">Couldn&apos;t save</span> : null}
    </div>
  );

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
      {feedbackControl}
      {href ? (
        <button
          type="button"
          disabled={actionBusy}
          onClick={() => void actOnRecommendation()}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-black text-brand hover:underline disabled:cursor-wait disabled:opacity-60"
          aria-label="Act on this recommendation"
        >
          {actionBusy ? 'Opening…' : 'Act on this'}
          <ArrowRight size={12} />
        </button>
      ) : null}
    </div>
  );
}
