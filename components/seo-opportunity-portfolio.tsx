"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Gauge,
  Layers3,
  RefreshCw,
  Target,
  TrendingUp,
} from "lucide-react";

type PortfolioItem = {
  rank: number;
  page_id: string;
  title: string | null;
  normalized_url: string | null;
  action_kind: string;
  decision_title: string;
  decision_priority_score: number;
  portfolio_score: number;
  upside_score: number;
  confidence_score: number;
  efficiency_score: number;
  risk_penalty: number;
  effort: { level: string; points: number; label: string };
  confidence: string;
  risk_level: string;
  base_uplift_pct: number | null;
  incremental_clicks: number | null;
  incremental_leads: number | null;
  incremental_revenue_inr: number | null;
  incremental_revenue_usd: number | null;
  reason: string;
};

type Portfolio = {
  capacity: number;
  generated_at: string;
  items: PortfolioItem[];
  selected: PortfolioItem[];
  summary: {
    selected_count: number;
    total_effort_points: number;
    projected_incremental_clicks: number | null;
    projected_incremental_leads: number | null;
    projected_incremental_revenue_inr: number | null;
    projected_incremental_revenue_usd: number | null;
    projection_coverage: { clicks: number; leads: number; revenue: number };
  };
};

type Calibration = {
  forecast_snapshots: number;
  evaluated_snapshots: number;
  direction_correct: number;
  direction_accuracy_pct: number | null;
  mean_absolute_error_pct: number | null;
  mean_signed_error_pct: number | null;
  mean_predicted_effect_pct: number | null;
  mean_actual_effect_pct: number | null;
  low_confidence_snapshots: number;
  medium_confidence_snapshots: number;
  high_confidence_snapshots: number;
  last_evaluated_at: string | null;
};

type Response = {
  ok: boolean;
  error?: string;
  portfolio?: Portfolio;
  calibration?: Calibration;
};

function compact(value: number | null, digits = 0) {
  if (value === null) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function money(value: number | null, currency: "INR" | "USD") {
  if (value === null) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function label(value: string) {
  return value.replace(/_/g, " ");
}

export function SeoOpportunityPortfolio() {
  const [capacity, setCapacity] = useState(5);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/seo/portfolio/v1?capacity=${capacity}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        setData((await response.json()) as Response);
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          setData({ ok: false, error: "SEO opportunity portfolio is temporarily unavailable." });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [capacity]);

  if (loading && !data) {
    return <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-sm text-slate-500">Building the SEO opportunity portfolio…</div>;
  }

  if (!data?.ok || !data.portfolio) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">Opportunity portfolio is unavailable</div>
          <p className="mt-1 text-xs leading-5">{data?.error || "Please try again shortly."}</p>
        </div>
      </div>
    );
  }

  const portfolio = data.portfolio;
  const calibration = data.calibration;
  const summary = portfolio.summary;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
            <Layers3 size={14} /> Opportunity portfolio
          </div>
          <h2 className="mt-2 text-lg font-bold text-slate-950">What should we work on this month?</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Ranked by decision priority, modeled upside, forecast confidence, estimated effort and risk. Forecasts remain scenario estimates until real experiments calibrate them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Capacity</span>
          {[3, 5, 8].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCapacity(value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${capacity === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
            >
              {value}
            </button>
          ))}
          {loading ? <RefreshCw size={14} className="animate-spin text-slate-400" /> : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Selected</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{summary.selected_count}</div>
          <div className="text-[11px] text-slate-500">{summary.total_effort_points} effort points</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Base extra clicks</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{compact(summary.projected_incremental_clicks, 1)}</div>
          <div className="text-[11px] text-slate-500">coverage {summary.projection_coverage.clicks}/{summary.selected_count}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Base extra leads</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{compact(summary.projected_incremental_leads, 1)}</div>
          <div className="text-[11px] text-slate-500">coverage {summary.projection_coverage.leads}/{summary.selected_count}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Revenue upside</div>
          <div className="mt-1 text-sm font-bold text-slate-900">{money(summary.projected_incremental_revenue_inr, "INR")}</div>
          <div className="text-[11px] text-slate-500">{money(summary.projected_incremental_revenue_usd, "USD")} · evidence only</div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.45fr_.55fr]">
        <div className="space-y-2">
          {portfolio.selected.map((item) => (
            <article key={item.page_id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-950 text-xs font-bold text-white">{item.rank}</span>
                    <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold uppercase text-violet-700">{label(item.action_kind)}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase text-slate-500">{item.effort.level} effort</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-700">{item.confidence} confidence</span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-slate-900">{item.decision_title}</h3>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.title || item.normalized_url || "SEO page"}</p>
                  <p className="mt-2 text-[11px] leading-5 text-slate-400">{item.reason}</p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-56">
                  <div className="rounded-lg bg-slate-50 p-2 text-center">
                    <div className="text-[9px] font-semibold uppercase text-slate-400">Portfolio</div>
                    <div className="text-base font-bold text-slate-900">{item.portfolio_score.toFixed(1)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 text-center">
                    <div className="text-[9px] font-semibold uppercase text-slate-400">Decision</div>
                    <div className="text-base font-bold text-slate-900">{item.decision_priority_score.toFixed(0)}</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold text-slate-500">
                <span className="rounded-full border border-slate-200 px-2.5 py-1">Effort {item.effort.label}</span>
                <span className="rounded-full border border-slate-200 px-2.5 py-1">Base uplift {item.base_uplift_pct === null ? "—" : `+${item.base_uplift_pct}%`}</span>
                <span className="rounded-full border border-slate-200 px-2.5 py-1">Extra clicks {compact(item.incremental_clicks, 1)}</span>
                <span className="rounded-full border border-slate-200 px-2.5 py-1">Extra leads {compact(item.incremental_leads, 1)}</span>
              </div>
            </article>
          ))}
        </div>

        <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Gauge size={16} /> Forecast calibration</div>
          {calibration && calibration.evaluated_snapshots > 0 ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Evaluated forecasts</span><b>{calibration.evaluated_snapshots}</b></div>
              <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Direction accuracy</span><b>{compact(calibration.direction_accuracy_pct, 1)}%</b></div>
              <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Mean absolute error</span><b>{compact(calibration.mean_absolute_error_pct, 1)} pts</b></div>
              <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Predicted effect</span><b>{compact(calibration.mean_predicted_effect_pct, 1)}%</b></div>
              <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Actual effect</span><b>{compact(calibration.mean_actual_effect_pct, 1)}%</b></div>
              <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-700"><CheckCircle2 size={14} className="mt-0.5 shrink-0" /> Forecast assumptions are now being compared with real experiment outcomes.</div>
            </div>
          ) : (
            <div className="mt-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><BarChart3 size={15} /> Awaiting real outcomes</div>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">
                Forecast snapshots are captured when recommendations are staged. Accuracy, directional hit rate and error will appear after those experiments complete.
              </p>
              <div className="mt-3 rounded-lg bg-white p-3 text-[11px] text-slate-500">
                <div className="flex items-center justify-between"><span>Snapshots</span><b>{calibration?.forecast_snapshots ?? 0}</b></div>
                <div className="mt-2 flex items-center justify-between"><span>Evaluated</span><b>{calibration?.evaluated_snapshots ?? 0}</b></div>
              </div>
            </div>
          )}
          <div className="mt-4 flex items-start gap-2 border-t border-slate-200 pt-3 text-[10px] leading-4 text-slate-400">
            <TrendingUp size={13} className="mt-0.5 shrink-0" /> Portfolio scores prioritize work; they are not guaranteed traffic or revenue outcomes.
          </div>
        </aside>
      </div>
    </section>
  );
}
