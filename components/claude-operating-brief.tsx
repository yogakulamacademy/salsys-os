'use client';

import { useState } from 'react';
import { BrainCircuit, Loader2, RefreshCw, Sparkles } from 'lucide-react';

type ClaudePriority = {
  signal_id: string;
  priority: number;
  action: string;
  why_now: string;
};

type ClaudeSynthesis = {
  executive_summary: string;
  top_priorities: ClaudePriority[];
  watch: string[];
  confidence_note: string;
  generated_at: string;
  model: string;
};

export function ClaudeOperatingBrief() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<ClaudeSynthesis | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/intelligence/v1/synthesis', {
        method: 'POST',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      const data = await response.json() as { ok?: boolean; error?: string; synthesis?: ClaudeSynthesis };
      if (!response.ok || !data.ok || !data.synthesis) {
        throw new Error(data.error || 'Unable to generate operating brief.');
      }
      setBrief(data.synthesis);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate operating brief.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-violet-100 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-700 text-white shadow-sm">
            <BrainCircuit size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-violet-700">
              <Sparkles size={12} /> Claude synthesis
            </div>
            <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">Turn the ranked evidence into an operating brief</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              Claude receives only the bounded Intelligence Core contract, not unrestricted CRM records. It can explain and sequence priorities, but it cannot invent facts or execute customer, financial, automation or website actions.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : brief ? <RefreshCw size={15} /> : <Sparkles size={15} />}
          {loading ? 'Analyzing…' : brief ? 'Refresh AI brief' : 'Generate AI brief'}
        </button>
      </div>

      {error ? (
        <div className="px-5 py-4 text-xs font-semibold text-rose-700">{error}</div>
      ) : null}

      {!brief && !error ? (
        <div className="px-5 py-5 text-xs leading-5 text-slate-500">
          This call is on-demand to control model usage. The deterministic priorities above remain available even when Claude is unavailable.
        </div>
      ) : null}

      {brief ? (
        <div className="px-5 py-5">
          <div className="rounded-2xl border border-white bg-white/80 p-4 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Executive synthesis</div>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">{brief.executive_summary}</p>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {brief.top_priorities.map((priority) => (
              <article key={`${priority.priority}-${priority.signal_id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-950 text-[10px] font-black text-white">{priority.priority}</span>
                  <span className="text-[10px] font-black uppercase tracking-[.08em] text-slate-400">{priority.signal_id.replaceAll('-', ' ')}</span>
                </div>
                <h3 className="mt-3 text-sm font-black leading-5 text-slate-900">{priority.action}</h3>
                <p className="mt-1.5 text-xs leading-5 text-slate-500">{priority.why_now}</p>
              </article>
            ))}
          </div>

          {brief.watch.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Watch next</div>
              <div className="mt-2 space-y-2">
                {brief.watch.map((item) => (
                  <div key={item} className="text-xs leading-5 text-slate-600">• {item}</div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-slate-400">
            <span>{brief.confidence_note}</span>
            <span>Human-controlled · generated on demand</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
