"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CircleDollarSign,
  Gauge,
  MousePointerClick,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

type Recommendation = {
  page_id: string;
  title: string | null;
  normalized_url: string | null;
  decision_title: string;
  decision_priority_score: number;
  base_decision_priority_score: number;
  learning_adjustment: number;
  learning_evidence_count: number;
  recommended_action_kind: string;
  risk_level: string;
};

type Scenario = {
  name: "low" | "base" | "high";
  uplift_pct: number;
  projected_clicks: number | null;
  incremental_clicks: number | null;
  projected_ctr: number | null;
  projected_leads: number | null;
  incremental_leads: number | null;
  projected_revenue_inr: number | null;
  incremental_revenue_inr: number | null;
  projected_revenue_usd: number | null;
  incremental_revenue_usd: number | null;
};

type Forecast = {
  page_id: string;
  action_kind: string;
  confidence: "low" | "medium" | "high";
  confidence_reason: string;
  model: string;
  current: {
    impressions: number;
    clicks: number;
    ctr: number;
    organic_leads: number;
    revenue_inr: number;
    revenue_usd: number;
  };
  assumptions: {
    uplift_source: "historical_action_learning" | "conservative_action_default";
    historical_evidence_count: number;
    historical_avg_effect_pct: number | null;
    observed_click_to_lead_rate: number | null;
    observed_revenue_per_lead_inr: number | null;
    observed_revenue_per_lead_usd: number | null;
  };
  drivers: Array<{ key: string; score: number; label: string }>;
  scenarios: Scenario[];
  caveats: string[];
};

type WorkspaceResponse = {
  ok: boolean;
  error?: string;
  top_recommendation?: Recommendation | null;
  top_forecast?: Forecast | null;
};

function number(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function percent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function currency(value: number | null | undefined, kind: "INR" | "USD") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: kind,
    maximumFractionDigits: 0,
  }).format(value);
}

function label(value: string) {
  return value.replace(/_/g, " ");
}

function confidenceTone(value: Forecast["confidence"]) {
  if (value === "high") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (value === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export function SeoDecisionForecastPanel() {
  const [data, setData] = useState<WorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/seo/decision/workspace/v1", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as WorkspaceResponse;
        if (!controller.signal.aborted) setData(body);
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          setData({ ok: false, error: "Forecasting is temporarily unavailable." });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const forecast = data?.top_forecast || null;
  const recommendation = data?.top_recommendation || null;
  const base = useMemo(
    () => forecast?.scenarios.find((scenario) => scenario.name === "base") || null,
    [forecast],
  );

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500 shadow-sm">
        Building explainability and forecast scenarios…
      </section>
    );
  }

  if (!data?.ok || !forecast || !recommendation) {
    return (
      <section className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 shadow-sm">
        <AlertTriangle size={17} className="mt-0.5 shrink-0 text-slate-400" />
        <div>
          <div className="font-semibold text-slate-800">Forecast waiting for an eligible recommendation</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">
            {data?.error || "Once a page exceeds the decision threshold, this panel will explain the ranking and model bounded upside scenarios."}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
      <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-cyan-50 px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                <BrainCircuit size={12} /> Explainability + Forecast
              </span>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${confidenceTone(forecast.confidence)}`}>
                {forecast.confidence} confidence
              </span>
            </div>
            <h2 className="mt-3 text-lg font-bold text-slate-950">Why this recommendation ranks first</h2>
            <p className="mt-1 max-w-4xl text-sm text-slate-600">{recommendation.decision_title}</p>
            <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-500">{forecast.confidence_reason}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Learned priority</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{Math.round(recommendation.decision_priority_score)}</div>
            <div className="mt-1 text-[11px] text-slate-500">
              base {Math.round(recommendation.base_decision_priority_score)} {recommendation.learning_adjustment >= 0 ? "+" : ""}{recommendation.learning_adjustment} learned
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-[1.05fr_1.4fr]">
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Gauge size={16} className="text-sky-600" /> Top decision drivers
            </div>
            <div className="mt-3 space-y-3">
              {forecast.drivers.map((driver) => (
                <div key={driver.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600">{driver.label}</span>
                    <b className="text-slate-800">{Math.round(driver.score)}/100</b>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.max(3, Math.min(100, driver.score))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Sparkles size={14} className="text-violet-500" /> Forecast basis
            </div>
            <div className="mt-3 space-y-2 text-xs text-slate-500">
              <div className="flex items-center justify-between gap-3">
                <span>Uplift source</span>
                <b className="text-right text-slate-700">{label(forecast.assumptions.uplift_source)}</b>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Historical samples</span>
                <b className="text-slate-700">{forecast.assumptions.historical_evidence_count}</b>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Observed CTR</span>
                <b className="text-slate-700">{percent(forecast.current.ctr)}</b>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Observed clicks</span>
                <b className="text-slate-700">{number(forecast.current.clicks)}</b>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Observed organic leads</span>
                <b className="text-slate-700">{number(forecast.current.organic_leads)}</b>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Target size={16} className="text-sky-600" /> Modeled upside scenarios
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Low, base and high scenarios use observed page performance plus historical action learning when enough experiments exist. They are directional estimates, not guaranteed outcomes.
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {forecast.scenarios.map((scenario) => (
              <div key={scenario.name} className={`rounded-xl border p-4 ${scenario.name === "base" ? "border-sky-300 bg-sky-50/60" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{scenario.name}</span>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">+{scenario.uplift_pct}%</span>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <MousePointerClick size={14} className="text-slate-400" />
                    <div>
                      <div className="text-[10px] text-slate-400">Extra clicks</div>
                      <div className="text-sm font-bold text-slate-800">{number(scenario.incremental_clicks, 1)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-slate-400" />
                    <div>
                      <div className="text-[10px] text-slate-400">Extra leads</div>
                      <div className="text-sm font-bold text-slate-800">{number(scenario.incremental_leads, 2)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CircleDollarSign size={14} className="text-slate-400" />
                    <div>
                      <div className="text-[10px] text-slate-400">Revenue upside</div>
                      <div className="text-sm font-bold text-slate-800">
                        {scenario.incremental_revenue_inr !== null
                          ? currency(scenario.incremental_revenue_inr, "INR")
                          : scenario.incremental_revenue_usd !== null
                            ? currency(scenario.incremental_revenue_usd, "USD")
                            : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {base ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <BarChart3 size={14} /> Base-case business case
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Current → projected clicks</div>
                  <div className="mt-1 flex items-center gap-1 text-sm font-bold text-slate-800">
                    {number(forecast.current.clicks)} <ArrowRight size={13} /> {number(base.projected_clicks, 1)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Current → projected CTR</div>
                  <div className="mt-1 flex items-center gap-1 text-sm font-bold text-slate-800">
                    {percent(forecast.current.ctr)} <ArrowRight size={13} /> {percent(base.projected_ctr)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Action type</div>
                  <div className="mt-1 text-sm font-bold capitalize text-slate-800">{label(forecast.action_kind)}</div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Forecast guardrails</div>
            <ul className="mt-2 space-y-1 text-[11px] leading-5 text-amber-800">
              {forecast.caveats.map((caveat) => <li key={caveat}>• {caveat}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
