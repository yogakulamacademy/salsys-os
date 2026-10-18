'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ThumbsDown, ThumbsUp } from 'lucide-react';

type FeedbackState = 'idle' | 'accepted' | 'dismissed' | 'error';

export function IntelligenceRecommendationFeedback({ signalId }: { signalId: string }) {
  const [recommendationId, setRecommendationId] = useState<string | null>(null);
  const [state, setState] = useState<FeedbackState>('idle');
  const [busy, setBusy] = useState(false);
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

  if (state === 'accepted') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
        <Check size={11} /> Useful signal recorded
      </span>
    );
  }

  if (state === 'dismissed') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
        <Check size={11} /> Not relevant recorded
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
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
}
