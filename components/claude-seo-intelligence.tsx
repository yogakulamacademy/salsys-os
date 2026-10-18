"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Brain, CheckCircle2, FilePlus2, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";

type AnalysisRun = {
  id: string;
  status: string;
  model_name?: string | null;
  completed_at?: string | null;
  output?: {
    executive_summary?: string;
    findings?: unknown[];
    opportunities?: unknown[];
    actions?: unknown[];
    caveats?: unknown[];
    ranking_evidence_status?: string;
    human_approval_required?: boolean;
  } | null;
};

type ApiResponse = {
  ok: boolean;
  analysis?: AnalysisRun | null;
  error?: string;
};

type StageResponse = {
  ok: boolean;
  experiment?: { id: string; status: string; created: boolean };
  error?: string;
};

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function confidenceChip(value: unknown) {
  const label = text(value).toLowerCase();
  if (!label) return null;
  return (
    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
      {label} confidence
    </span>
  );
}

export function ClaudeSeoIntelligence() {
  const [analysis, setAnalysis] = useState<AnalysisRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [stagingIndex, setStagingIndex] = useState<number | null>(null);
  const [staged, setStaged] = useState<Record<number, { id: string; created: boolean }>>({});
  const [stageError, setStageError] = useState<Record<number, string>>({});

  async function loadLatest() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/seo/intelligence/claude/v1", { cache: "no-store" });
      const body = (await response.json()) as ApiResponse;
      if (!response.ok || !body.ok) throw new Error(body.error || "Unable to load Claude analysis.");
      setAnalysis(body.analysis || null);
      setStaged({});
      setStageError({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Claude analysis.");
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/seo/intelligence/claude/v1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = (await response.json()) as ApiResponse;
      if (!response.ok || !body.ok) throw new Error(body.error || "Claude analysis failed.");
      setAnalysis(body.analysis || null);
      setStaged({});
      setStageError({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claude analysis failed.");
    } finally {
      setRunning(false);
    }
  }

  async function stageAction(index: number) {
    if (!analysis?.id) return;
    setStagingIndex(index);
    setStageError((current) => ({ ...current, [index]: "" }));
    try {
      const response = await fetch("/api/seo/intelligence/claude/v1/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisRunId: analysis.id, recommendationIndex: index }),
      });
      const body = (await response.json()) as StageResponse;
      if (!response.ok || !body.ok || !body.experiment?.id) {
        throw new Error(body.error || "Unable to stage draft experiment.");
      }
      setStaged((current) => ({
        ...current,
        [index]: { id: body.experiment!.id, created: body.experiment!.created },
      }));
    } catch (err) {
      setStageError((current) => ({
        ...current,
        [index]: err instanceof Error ? err.message : "Unable to stage draft experiment.",
      }));
    } finally {
      setStagingIndex(null);
    }
  }

  useEffect(() => {
    void loadLatest();
  }, []);

  const output = analysis?.output || null;
  const findings = Array.isArray(output?.findings) ? output.findings : [];
  const opportunities = Array.isArray(output?.opportunities) ? output.opportunities : [];
  const actions = Array.isArray(output?.actions) ? output.actions : [];
  const caveats = Array.isArray(output?.caveats) ? output.caveats : [];

  return (
    <section className="rounded-2xl border border-indigo-100 bg-white shadow-sm">
      <div className="border-b border-indigo-100 bg-indigo-50/60 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm">
              <Brain size={18} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">Claude SEO Intelligence</h2>
                <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">first-party evidence only</span>
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
                Claude analyzes GSC, SEO opportunity, AEO/GEO readiness, CRM signals and OpenSearch evidence. Live competitor rankings and AI citation positions remain unavailable until a ranking provider is connected.
              </p>
            </div>
          </div>
          <button type="button" onClick={runAnalysis} disabled={running} className="btn-secondary shrink-0 disabled:cursor-not-allowed disabled:opacity-60">
            {running ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {running ? "Analyzing…" : analysis ? "Run fresh analysis" : "Run Claude analysis"}
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-3 text-xs text-emerald-800">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Grounded-analysis guardrail</div>
            <div className="mt-0.5 leading-5">Claude is instructed not to invent live rankings, traffic, conversions, revenue, competitor positions, SERP features, AI citations or URLs. Recommendations remain advisory. Staging creates a draft experiment only; approval and execution remain separate human-controlled steps.</div>
          </div>
        </div>

        {loading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> Loading latest analysis…</div> : null}
        {error ? <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div> : null}

        {!loading && !error && !analysis ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center">
            <Brain size={22} className="mx-auto text-slate-300" />
            <div className="mt-2 text-sm font-semibold text-slate-700">No Claude SEO analysis yet</div>
            <div className="mt-1 text-xs text-slate-400">Run the first grounded analysis using the real Yogakulam SEO evidence already inside SalsysOS.</div>
          </div>
        ) : null}

        {analysis && output ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-400">
              <span>{analysis.model_name || "Claude"}</span>
              {analysis.completed_at ? <span>• {new Date(analysis.completed_at).toLocaleString()}</span> : null}
              <button type="button" onClick={loadLatest} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"><RefreshCw size={11} /> Refresh</button>
            </div>

            {output.executive_summary ? (
              <div className="rounded-xl bg-slate-50 px-4 py-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Executive summary</div>
                <p className="mt-2 text-sm leading-6 text-slate-700">{output.executive_summary}</p>
              </div>
            ) : null}

            {opportunities.length > 0 ? (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Priority opportunities</h3>
                <div className="mt-2 grid gap-2">
                  {opportunities.slice(0, 8).map((raw, index) => {
                    const item = objectValue(raw) || {};
                    const priority = numberValue(item.priority);
                    return (
                      <article key={index} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {priority !== null ? <span className="rounded-full bg-slate-900 px-2 py-1 text-[10px] font-bold text-white">Priority {Math.round(priority)}</span> : null}
                          {text(item.surface) ? <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold uppercase text-sky-700">{text(item.surface)}</span> : null}
                          {confidenceChip(item.confidence)}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-800">{text(item.opportunity) || "SEO opportunity"}</div>
                        {text(item.target_url) ? <div className="mt-1 truncate text-[11px] text-slate-400">{text(item.target_url)}</div> : null}
                        {text(item.why) ? <p className="mt-2 text-xs leading-5 text-slate-600">{text(item.why)}</p> : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {actions.length > 0 ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Recommended actions</h3>
                  <Link href="/seo/experiments" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">View experiments</Link>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {actions.slice(0, 8).map((raw, index) => {
                    const item = objectValue(raw) || {};
                    const stagedItem = staged[index];
                    return (
                      <article key={index} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                        <div className="text-sm font-semibold text-slate-800">{text(item.action) || "Recommended action"}</div>
                        {text(item.target_url) ? <div className="mt-1 truncate text-[11px] text-slate-400">{text(item.target_url)}</div> : null}
                        {text(item.expected_signal) ? <p className="mt-2 text-xs leading-5 text-slate-600">Expected signal: {text(item.expected_signal)}</p> : null}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Human approval required</div>
                          {stagedItem ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                              <CheckCircle2 size={11} /> {stagedItem.created ? "Draft staged" : "Draft already exists"}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => stageAction(index)}
                              disabled={stagingIndex !== null}
                              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {stagingIndex === index ? <Loader2 size={12} className="animate-spin" /> : <FilePlus2 size={12} />}
                              {stagingIndex === index ? "Staging…" : "Stage as draft experiment"}
                            </button>
                          )}
                        </div>
                        {stageError[index] ? <div className="mt-2 text-[11px] text-rose-600">{stageError[index]}</div> : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {findings.length > 0 ? (
              <details className="rounded-xl border border-slate-200 px-4 py-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">Evidence-backed findings ({findings.length})</summary>
                <div className="mt-3 space-y-2">{findings.map((raw, index) => { const item = objectValue(raw) || {}; return <div key={index} className="text-xs leading-5 text-slate-600">• {text(item.finding) || JSON.stringify(raw)}</div>; })}</div>
              </details>
            ) : null}

            {caveats.length > 0 ? (
              <details className="rounded-xl border border-amber-100 bg-amber-50/40 px-4 py-3">
                <summary className="cursor-pointer text-xs font-semibold text-amber-800">Evidence limitations ({caveats.length})</summary>
                <div className="mt-3 space-y-1 text-xs leading-5 text-amber-700">{caveats.map((item, index) => <div key={index}>• {text(item) || JSON.stringify(item)}</div>)}</div>
              </details>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
