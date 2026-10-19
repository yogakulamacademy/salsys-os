"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Eye, Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";

type ProbeKind = "brand_visibility" | "answer_visibility" | "recommendation_visibility";

type ProbeObservation = {
  observed_at?: string | null;
  brand_mentioned?: boolean | null;
  brand_recommended?: boolean | null;
  mention_count?: number | string | null;
  recommendation_position?: number | string | null;
  response_excerpt?: string | null;
};

type ProbeRecord = {
  id?: string;
  provider?: string | null;
  model_name?: string | null;
  probe_kind?: string | null;
  prompt_text?: string | null;
  status?: string | null;
  requested_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  observation?: ProbeObservation | null;
};

type GetResponse = {
  ok: boolean;
  probe?: ProbeRecord | null;
  error?: string;
};

type RunResponse = {
  ok: boolean;
  result?: {
    runId?: string;
    provider?: string;
    modelName?: string;
    probeKind?: string;
    observation?: ProbeObservation | null;
  } | null;
  error?: string;
};

const PROBE_LABELS: Record<ProbeKind, string> = {
  brand_visibility: "Brand visibility",
  answer_visibility: "Answer visibility",
  recommendation_visibility: "Recommendation visibility",
};

const EXAMPLES: Record<ProbeKind, string> = {
  brand_visibility: "Which yoga teacher training schools in Mysore are worth considering?",
  answer_visibility: "Where can I study a Yoga Alliance certified 200-hour yoga teacher training in Mysore?",
  recommendation_visibility: "Recommend a few reputable residential yoga teacher training schools in Mysore, India.",
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function SeoAiVisibilityProbe() {
  const [probeKind, setProbeKind] = useState<ProbeKind>("recommendation_visibility");
  const [prompt, setPrompt] = useState(EXAMPLES.recommendation_visibility);
  const [locale, setLocale] = useState("en-IN");
  const [countryCode, setCountryCode] = useState("IN");
  const [latest, setLatest] = useState<ProbeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const observation = latest?.observation || null;
  const resultLabel = useMemo(() => {
    if (!observation) return "No measured observation yet";
    if (observation.brand_recommended) return "Brand recommended";
    if (observation.brand_mentioned) return "Brand mentioned";
    return "Brand not observed";
  }, [observation]);

  async function loadLatest() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/seo/ai-visibility/probe/v1", { cache: "no-store" });
      const body = (await response.json()) as GetResponse;
      if (!response.ok || !body.ok) throw new Error(body.error || "Unable to load AI visibility probe evidence.");
      setLatest(body.probe || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI visibility probe evidence.");
    } finally {
      setLoading(false);
    }
  }

  function changeProbeKind(value: ProbeKind) {
    setProbeKind(value);
    setPrompt(EXAMPLES[value]);
    setSuccessMessage("");
  }

  async function runProbe() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Enter a natural search or recommendation question before running the probe.");
      return;
    }

    setRunning(true);
    setError("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/seo/ai-visibility/probe/v1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          probeKind,
          prompt: trimmedPrompt,
          locale: locale.trim() || null,
          countryCode: countryCode.trim() || null,
        }),
      });
      const body = (await response.json()) as RunResponse;
      if (!response.ok || !body.ok || !body.result) {
        throw new Error(body.error || "AI visibility probe failed.");
      }

      setLatest({
        id: body.result.runId,
        provider: body.result.provider,
        model_name: body.result.modelName,
        probe_kind: body.result.probeKind,
        prompt_text: trimmedPrompt,
        status: "completed",
        completed_at: new Date().toISOString(),
        observation: body.result.observation || null,
      });
      setSuccessMessage("Probe completed and measured evidence was stored in the R9 visibility ledger.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI visibility probe failed.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    void loadLatest();
  }, []);

  return (
    <section className="rounded-2xl border border-cyan-100 bg-white shadow-sm">
      <div className="border-b border-cyan-100 bg-cyan-50/60 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-cyan-700 shadow-sm">
              <Bot size={18} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">AI Visibility Probe</h2>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-700 shadow-sm">
                  measured evidence
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
                Ask a natural, non-branded question and measure whether the configured AI model independently mentions or recommends your organization. The organization name is not injected into the model prompt.
              </p>
            </div>
          </div>
          <button type="button" onClick={loadLatest} disabled={loading || running} className="btn-secondary shrink-0 disabled:cursor-not-allowed disabled:opacity-60">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh evidence
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-3 text-xs text-sky-800">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Measurement guardrail</div>
            <div className="mt-0.5 leading-5">
              Use questions a real prospect might ask without naming your brand. AEO/GEO readiness and AI-referral traffic remain separate signals; only this stored probe evidence counts as a measured model mention or recommendation. Citation evidence is not claimed by this non-browsing probe.
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
          <label className="text-xs font-semibold text-slate-600">
            Probe type
            <select
              value={probeKind}
              onChange={(event) => changeProbeKind(event.target.value as ProbeKind)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none ring-cyan-500/20 focus:border-cyan-400 focus:ring-4"
            >
              {Object.entries(PROBE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-600">
            Natural prospect question
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={4000}
              rows={3}
              className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none ring-cyan-500/20 focus:border-cyan-400 focus:ring-4"
              placeholder="Ask the kind of question a prospect would naturally ask an AI assistant."
            />
            <span className="mt-1 block text-[10px] font-normal text-slate-400">{prompt.length.toLocaleString()} / 4,000 characters</span>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[180px_140px_auto] lg:items-end">
          <label className="text-xs font-semibold text-slate-600">
            Locale
            <input
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              maxLength={30}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-cyan-400"
              placeholder="en-IN"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Country
            <input
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm uppercase text-slate-800 outline-none focus:border-cyan-400"
              placeholder="IN"
            />
          </label>
          <button
            type="button"
            onClick={runProbe}
            disabled={running || !prompt.trim()}
            className="btn-primary h-[42px] justify-center disabled:cursor-not-allowed disabled:opacity-60"
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {running ? "Running visibility probe…" : "Run AI visibility probe"}
          </button>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {successMessage ? (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>{successMessage}</span>
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Eye size={14} />
              Latest measured probe
            </div>
            {latest?.completed_at || latest?.requested_at ? (
              <div className="text-[10px] text-slate-400">{formatDateTime(latest.completed_at || latest.requested_at)}</div>
            ) : null}
          </div>

          {loading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
              <Loader2 size={15} className="animate-spin" /> Loading latest probe…
            </div>
          ) : latest ? (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <ResultMetric label="Result" value={resultLabel} />
                <ResultMetric label="Mentions" value={String(asNumber(observation?.mention_count))} />
                <ResultMetric label="Recommended" value={observation?.brand_recommended ? "Yes" : "No"} />
                <ResultMetric
                  label="Recommendation position"
                  value={asNumber(observation?.recommendation_position) > 0 ? `#${asNumber(observation?.recommendation_position)}` : "—"}
                />
              </div>

              <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                <div><span className="font-semibold text-slate-700">Provider:</span> {latest.provider || "—"}</div>
                <div><span className="font-semibold text-slate-700">Model:</span> {latest.model_name || "—"}</div>
                <div><span className="font-semibold text-slate-700">Probe:</span> {latest.probe_kind ? PROBE_LABELS[latest.probe_kind as ProbeKind] || latest.probe_kind : "—"}</div>
              </div>

              {latest.prompt_text ? (
                <div className="rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                  <span className="font-semibold text-slate-700">Prompt:</span> {latest.prompt_text}
                </div>
              ) : null}

              {observation?.response_excerpt ? (
                <details className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">View model response excerpt</summary>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{observation.response_excerpt}</p>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 text-sm text-slate-400">No model visibility probe has been measured yet for this organization.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}
