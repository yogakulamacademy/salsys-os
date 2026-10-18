'use client';

import { useEffect, useState } from 'react';
import { BrainCircuit, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';

type LearningSummary = {
  total: number;
  observable: number;
  observed: number;
  positive: number;
  neutral: number;
  negative: number;
  inconclusive: number;
};

const emptySummary: LearningSummary = {
  total: 0,
  observable: 0,
  observed: 0,
  positive: 0,
  neutral: 0,
  negative: 0,
  inconclusive: 0,
};

export function IntelligenceLearningPanel() {
  const [summary, setSummary] = useState<LearningSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const response = await fetch('/api/intelligence/v1/outcomes', { cache: 'no-store' });
      const body = await response.json() as { ok?: boolean; learning?: LearningSummary };
      if (response.ok && body.ok && body.learning) setSummary(body.learning);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function evaluate() {
    setEvaluating(true);
    setMessage('');
    try {
      const response = await fetch('/api/intelligence/v1/outcomes', { method: 'POST' });
      const body = await response.json() as {
        ok?: boolean;
        evaluated?: number;
        recorded?: number;
        skipped_immature?: number;
        error?: string;
      };
      if (!response.ok || !body.ok) {
        setMessage(body.error || 'Outcome evaluation failed.');
        return;
      }
      setMessage(
        `${body.recorded || 0} outcome observation${body.recorded === 1 ? '' : 's'} recorded from ${body.evaluated || 0} eligible recommendation${body.evaluated === 1 ? '' : 's'}.`,
      );
      await load();
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
            <BrainCircuit size={18} />
          </div>
          <div>
            <div className="text-sm font-black text-slate-900">Recommendation learning</div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              SalsysOS can now compare selected recommendation baselines with later operating evidence after an action is completed. These are observational outcomes, not causal claims.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={evaluate}
          disabled={evaluating}
          className="btn-secondary shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={14} className={evaluating ? 'animate-spin' : ''} />
          {evaluating ? 'Evaluating…' : 'Evaluate completed actions'}
        </button>
      </div>

      <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-5">
        <div className="bg-white px-5 py-4">
          <div className="text-[10px] font-black uppercase tracking-[.08em] text-slate-400">Tracked</div>
          <div className="mt-1 text-xl font-black text-slate-900">{loading ? '—' : summary.total}</div>
          <div className="mt-1 text-[10px] text-slate-500">Recommendations shown</div>
        </div>
        <div className="bg-white px-5 py-4">
          <div className="text-[10px] font-black uppercase tracking-[.08em] text-slate-400">Observable</div>
          <div className="mt-1 text-xl font-black text-slate-900">{loading ? '—' : summary.observable}</div>
          <div className="mt-1 text-[10px] text-slate-500">Safe comparable baselines</div>
        </div>
        <div className="bg-white px-5 py-4">
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[.08em] text-emerald-600"><TrendingUp size={11} /> Positive</div>
          <div className="mt-1 text-xl font-black text-slate-900">{loading ? '—' : summary.positive}</div>
          <div className="mt-1 text-[10px] text-slate-500">Moved as recommended</div>
        </div>
        <div className="bg-white px-5 py-4">
          <div className="text-[10px] font-black uppercase tracking-[.08em] text-slate-400">Neutral</div>
          <div className="mt-1 text-xl font-black text-slate-900">{loading ? '—' : summary.neutral}</div>
          <div className="mt-1 text-[10px] text-slate-500">No material change yet</div>
        </div>
        <div className="bg-white px-5 py-4">
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[.08em] text-rose-600"><TrendingDown size={11} /> Negative</div>
          <div className="mt-1 text-xl font-black text-slate-900">{loading ? '—' : summary.negative}</div>
          <div className="mt-1 text-[10px] text-slate-500">Moved against direction</div>
        </div>
      </div>

      {message ? (
        <div className="border-t border-slate-100 px-5 py-3 text-xs font-semibold text-slate-600">{message}</div>
      ) : null}
    </section>
  );
}
