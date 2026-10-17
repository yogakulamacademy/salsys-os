"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Brain,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Gauge,
  History,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

type Recommendation = {
  organization_id: string;
  site_id: string;
  page_id: string;
  hostname: string | null;
  normalized_url: string | null;
  url_path: string | null;
  page_type: string | null;
  title: string | null;
  is_indexable: boolean;
  decision_priority_score: number;
  base_decision_priority_score: number;
  learning_evidence_count: number;
  learning_adjustment: number;
  minimum_priority_score: number;
  recommended_action_kind: string;
  decision_title: string;
  decision_reason: string;
  risk_level: string;
  execution_gate: string;
  evidence: Record<string, unknown>;
  evaluated_at: string;
};

type LearningHealth = {
  enabled: boolean;
  auto_finalize: boolean;
  auto_capture_outcomes: boolean;
  outcome_lag_days: number;
  max_outcomes_per_sweep: number;
  running_experiments: number;
  running_with_baseline: number;
  running_with_final: number;
  outcomes_due: number;
  learning_events: number;
  learned_outcomes: number;
  failed_outcomes: number;
  latest_gsc_date: string | null;
  last_outcome_capture_at: string | null;
  last_learning_at: string | null;
};

type LearningEvent = {
  id: string;
  experiment_id: string;
  action_kind: string;
  page_type: string | null;
  primary_metric: string;
  baseline_value: number;
  outcome_value: number;
  normalized_effect_pct: number;
  result_classification: string;
  result_confidence: string;
  learning_summary: string;
  evaluated_at: string;
};

type Experiment = {
  id: string;
  title: string;
  status: string;
  primary_metric: string;
  minimum_observation_days: number;
  target_page_id: string | null;
  target_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  result_classification: string | null;
  result_confidence: string | null;
  learning_summary: string | null;
  created_at: string;
};

type Action = {
  id: string;
  experiment_id: string;
  target_page_id: string | null;
  target_url: string | null;
  action_kind: string;
  risk_level: string;
  approval_status: string;
  execution_status: string;
  execution_gate: string;
  automatic_publish_enabled: boolean;
  created_at: string;
};

type WorkspaceResponse = {
  ok: boolean;
  error?: string;
  decision_version?: string;
  generated_at?: string;
  role?: string;
  top_recommendation?: Recommendation | null;
  recommendations?: Recommendation[];
  learning_health?: LearningHealth;
  recent_learning?: LearningEvent[];
  experiments?: Experiment[];
  actions?: Action[];
};

function label(value: string | null | undefined) {
  return (value || "unknown").replace(/_/g, " ");
}

function formatNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}

function scoreFromEvidence(rec: Recommendation, key: string) {
  const scores = rec.evidence?.scores;
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) return 0;
  const value = Number((scores as Record<string, unknown>)[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function businessFromEvidence(rec: Recommendation, key: string) {
  const business = rec.evidence?.business;
  if (!business || typeof business !== "object" || Array.isArray(business)) return 0;
  const value = Number((business as Record<string, unknown>)[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function dateText(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function StatusPill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "amber" | "red" | "violet" }) {
  const styles = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-rose-50 text-rose-700",
    violet: "bg-violet-50 text-violet-700",
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${styles}`}>{children}</span>;
}

export function SeoDecisionWorkspace() {
  const [data, setData] = useState<WorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [stagingPageId, setStagingPageId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/seo/decision/workspace/v1", { cache: "no-store" });
      const body = (await response.json()) as WorkspaceResponse;
      setData(body);
    } catch {
      setData({ ok: false, error: "Decision workspace is temporarily unavailable." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const canStage = useMemo(() => new Set(["owner", "admin", "manager"]).has(data?.role || ""), [data?.role]);
  const top = data?.top_recommendation || null;
  const health = data?.learning_health;
  const recommendations = data?.recommendations || [];
  const learnings = data?.recent_learning || [];
  const experiments = data?.experiments || [];
  const actions = data?.actions || [];

  async function stage(rec: Recommendation) {
    if (!canStage || stagingPageId) return;
    setStagingPageId(rec.page_id);
    setMessage(null);
    try {
      const response = await fetch("/api/seo/decision/v1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: rec.page_id }),
      });
      const body = await response.json() as Record<string, unknown>;
      if (!response.ok || body.ok !== true) {
        setMessage(typeof body.error === "string" ? body.error : typeof body.reason === "string" ? body.reason : "Unable to stage this recommendation.");
      } else {
        setMessage(body.created === true ? "Recommendation staged as a human-approved experiment." : "An open action already exists for this page.");
        await load();
      }
    } catch {
      setMessage("Unable to stage this recommendation right now.");
    } finally {
      setStagingPageId(null);
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-sm text-slate-500">Loading SEO decision intelligence…</div>;
  }

  if (!data?.ok) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">SEO Decision Intelligence is unavailable</div>
          <p className="mt-1 text-xs leading-5">{data?.error || "Please try again shortly."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400"><span>Decision candidates</span><Target size={15} /></div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{recommendations.length}</div>
          <div className="mt-1 text-xs text-slate-500">Learning-aware next-best actions</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400"><span>Running experiments</span><FlaskConical size={15} /></div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{health?.running_experiments ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">{health?.outcomes_due ?? 0} outcomes due</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400"><span>Learned outcomes</span><Brain size={15} /></div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{health?.learned_outcomes ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">{health?.learning_events ?? 0} learning events</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400"><span>Automation health</span><Activity size={15} /></div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{health?.failed_outcomes ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">failed outcome captures</div>
        </div>
      </div>

      <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="violet">Top recommendation</StatusPill>
              {top ? <StatusPill tone={top.risk_level === "high" ? "red" : top.risk_level === "medium" ? "amber" : "green"}>{top.risk_level} risk</StatusPill> : null}
              <StatusPill tone="green">Human approved</StatusPill>
            </div>

            {top ? (
              <>
                <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-950">{top.decision_title}</h2>
                <p className="mt-1 text-sm font-medium text-slate-700">{top.title || top.normalized_url || "SEO opportunity"}</p>
                {top.normalized_url ? <p className="mt-1 truncate text-xs text-slate-400">{top.normalized_url}</p> : null}
                <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">{top.decision_reason}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-white/80 p-3 ring-1 ring-violet-100">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Priority</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">{Math.round(top.decision_priority_score)}</div>
                    <div className="text-[11px] text-slate-500">base {Math.round(top.base_decision_priority_score)}</div>
                  </div>
                  <div className="rounded-xl bg-white/80 p-3 ring-1 ring-violet-100">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Learning adjustment</div>
                    <div className={`mt-1 flex items-center gap-1 text-2xl font-bold ${top.learning_adjustment > 0 ? "text-emerald-600" : top.learning_adjustment < 0 ? "text-rose-600" : "text-slate-900"}`}>
                      {top.learning_adjustment > 0 ? <TrendingUp size={18} /> : top.learning_adjustment < 0 ? <TrendingDown size={18} /> : null}
                      {top.learning_adjustment > 0 ? "+" : ""}{top.learning_adjustment}
                    </div>
                    <div className="text-[11px] text-slate-500">{top.learning_evidence_count} historical samples</div>
                  </div>
                  <div className="rounded-xl bg-white/80 p-3 ring-1 ring-violet-100">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Demand</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">{Math.round(scoreFromEvidence(top, "demand"))}</div>
                    <div className="text-[11px] text-slate-500">search opportunity signal</div>
                  </div>
                  <div className="rounded-xl bg-white/80 p-3 ring-1 ring-violet-100">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Organic leads</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">{formatNumber(businessFromEvidence(top, "organic_leads"))}</div>
                    <div className="text-[11px] text-slate-500">observed business value</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-violet-200 bg-white/70 px-4 py-6 text-sm text-slate-500">No page currently exceeds the decision threshold.</div>
            )}
          </div>

          {top ? (
            <div className="w-full rounded-2xl border border-violet-100 bg-white p-4 lg:w-72">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ShieldCheck size={16} className="text-violet-600" /> Controlled execution</div>
              <div className="mt-3 space-y-2 text-xs text-slate-500">
                <div className="flex items-center justify-between"><span>Action</span><b className="text-slate-700">{label(top.recommended_action_kind)}</b></div>
                <div className="flex items-center justify-between"><span>Gate</span><b className="text-slate-700">human approval</b></div>
                <div className="flex items-center justify-between"><span>Auto publish</span><b className="text-slate-700">off</b></div>
              </div>
              <button
                type="button"
                disabled={!canStage || stagingPageId === top.page_id}
                onClick={() => void stage(top)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FlaskConical size={14} />
                {stagingPageId === top.page_id ? "Staging…" : "Stage experiment"}
              </button>
              {!canStage ? <p className="mt-2 text-[11px] leading-4 text-slate-400">Owner, admin or manager access is required to stage a recommendation.</p> : null}
            </div>
          ) : null}
        </div>
        {message ? <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">{message}</div> : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Gauge size={16} /> Ranked decisions</div>
              <p className="mt-1 text-xs text-slate-400">Base opportunity plus historical learning, bounded by execution guardrails.</p>
            </div>
            <StatusPill tone="violet">{data.decision_version || "learning v2"}</StatusPill>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {recommendations.map((rec, index) => (
              <div key={rec.page_id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">{index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-semibold text-slate-900">{rec.decision_title}</div>
                      <StatusPill tone={rec.learning_adjustment > 0 ? "green" : rec.learning_adjustment < 0 ? "red" : "slate"}>
                        learning {rec.learning_adjustment > 0 ? "+" : ""}{rec.learning_adjustment}
                      </StatusPill>
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">{rec.title || rec.normalized_url}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold text-slate-500">
                      <span className="rounded-full border border-slate-200 px-2 py-1">Priority {Math.round(rec.decision_priority_score)}</span>
                      <span className="rounded-full border border-slate-200 px-2 py-1">Demand {Math.round(scoreFromEvidence(rec, "demand"))}</span>
                      <span className="rounded-full border border-slate-200 px-2 py-1">Revenue {Math.round(scoreFromEvidence(rec, "revenue"))}</span>
                      <span className="rounded-full border border-slate-200 px-2 py-1">{label(rec.recommended_action_kind)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canStage || Boolean(stagingPageId)}
                    onClick={() => void stage(rec)}
                    className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-40"
                    aria-label="Stage recommendation"
                  ><ArrowUpRight size={15} /></button>
                </div>
              </div>
            ))}
            {recommendations.length === 0 ? <div className="py-8 text-center text-xs text-slate-400">No recommendations currently meet the configured threshold.</div> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><BadgeCheck size={16} /> Autonomous learning</div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="text-slate-500">Outcome capture</span><StatusPill tone={health?.auto_capture_outcomes ? "green" : "amber"}>{health?.auto_capture_outcomes ? "on" : "off"}</StatusPill></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="text-slate-500">Auto finalize</span><StatusPill tone={health?.auto_finalize ? "green" : "amber"}>{health?.auto_finalize ? "on" : "off"}</StatusPill></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="text-slate-500">GSC lag allowance</span><b className="text-slate-700">{health?.outcome_lag_days ?? 0} days</b></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="text-slate-500">Latest finalized GSC</span><b className="text-slate-700">{health?.latest_gsc_date || "—"}</b></div>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><History size={16} /> Recent learning</div>
          <p className="mt-1 text-xs text-slate-400">Observed outcomes that can influence future decision ranking.</p>
          <div className="mt-4 space-y-3">
            {learnings.map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={event.result_classification === "positive" ? "green" : event.result_classification === "negative" ? "red" : event.result_classification === "mixed" ? "amber" : "slate"}>{event.result_classification}</StatusPill>
                  <StatusPill tone="slate">{event.result_confidence} confidence</StatusPill>
                  <span className="ml-auto text-[10px] text-slate-400">{dateText(event.evaluated_at)}</span>
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-700">{label(event.action_kind)} · {label(event.primary_metric)}</div>
                <div className={`mt-1 text-lg font-bold ${event.normalized_effect_pct > 0 ? "text-emerald-600" : event.normalized_effect_pct < 0 ? "text-rose-600" : "text-slate-700"}`}>
                  {event.normalized_effect_pct > 0 ? "+" : ""}{event.normalized_effect_pct.toFixed(1)}%
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{event.learning_summary}</p>
              </div>
            ))}
            {learnings.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">No real experiment learning has accumulated yet. The model remains neutral until evidence exists.</div> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Clock3 size={16} /> Decision lifecycle</div>
          <p className="mt-1 text-xs text-slate-400">Recent staged experiments and execution state.</p>
          <div className="mt-4 space-y-3">
            {experiments.map((experiment) => {
              const action = actions.find((item) => item.experiment_id === experiment.id);
              return (
                <div key={experiment.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={experiment.status === "completed" ? "green" : experiment.status === "running" ? "violet" : "slate"}>{experiment.status}</StatusPill>
                    {action ? <StatusPill tone={action.approval_status === "approved" ? "green" : "amber"}>{action.approval_status}</StatusPill> : null}
                    {experiment.result_classification ? <StatusPill tone="slate">{experiment.result_classification}</StatusPill> : null}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-800">{experiment.title}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    <span>Metric: {label(experiment.primary_metric)}</span>
                    <span>Observe: {experiment.minimum_observation_days}d</span>
                    {action ? <span>Execution: {label(action.execution_status)}</span> : null}
                  </div>
                  {experiment.learning_summary ? <p className="mt-2 text-xs leading-5 text-slate-500">{experiment.learning_summary}</p> : null}
                </div>
              );
            })}
            {experiments.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">No Decision Intelligence experiments have been staged yet.</div> : null}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-slate-950 px-5 py-4 text-white shadow-sm">
        <div className="flex items-start gap-3">
          <Sparkles size={18} className="mt-0.5 shrink-0 text-violet-300" />
          <div>
            <div className="text-sm font-semibold">Closed-loop SEO operating model</div>
            <p className="mt-1 max-w-5xl text-xs leading-5 text-slate-300">SalsysOS can discover, rank, stage, observe, measure and learn automatically. Publishing remains human-approved, while outcome capture and future ranking adjustments are autonomous and evidence-bound.</p>
          </div>
          <BarChart3 size={18} className="ml-auto hidden text-slate-500 sm:block" />
        </div>
      </section>
    </div>
  );
}
