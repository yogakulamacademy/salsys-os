import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Sparkles } from "lucide-react";

import { ExecutiveDecisionBrief } from "@/components/marketing/executive-decision-brief";
import { RevenueInsights } from "@/components/revenue-insights";
import { PageHeader } from "@/components/ui";
import {
  getRevenueWorkspace,
  type RevenueCurrencySummary,
  type RevenueOpportunityRow,
} from "@/lib/revenue-data";

export default async function RevenuePage() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [workspace, fxRate] = await Promise.all([
    getRevenueWorkspace(currentMonth),
    getUsdInrRate(),
  ]);

  const { totalsByCurrency, stages, monthly, sources, locations, actualMonthly, unvaluedLeads, topOpportunities, closingThisMonth } = workspace;

  const stageChartData = stages
    .map((row) => ({
      currency: normalizeCurrency(row.currency),
      stage: pretty(row.current_stage),
      leads: toNumber(row.lead_count),
      pipeline: toNumber(row.pipeline_value),
      weighted: toNumber(row.weighted_forecast),
      collected: toNumber(row.net_collected),
    }))
    .filter((row) => row.pipeline !== 0 || row.weighted !== 0 || row.collected !== 0);

  const monthlyChartData = monthly
    .map((row) => ({
      currency: normalizeCurrency(row.currency),
      month: row.forecast_month,
      monthLabel: formatMonthShort(row.forecast_month),
      leads: toNumber(row.lead_count),
      pipeline: toNumber(row.pipeline_value),
      weighted: toNumber(row.weighted_forecast),
      collected: toNumber(row.net_collected),
    }))
    .filter((row) => row.pipeline !== 0 || row.weighted !== 0 || row.collected !== 0);

  const sourceChartData = sources
    .map((row) => ({
      currency: normalizeCurrency(row.currency),
      name: pretty(row.source || "Unknown"),
      leads: toNumber(row.lead_count),
      pipeline: toNumber(row.pipeline_value),
      weighted: toNumber(row.weighted_forecast),
      collected: toNumber(row.net_collected),
    }))
    .filter((row) => row.pipeline !== 0 || row.weighted !== 0 || row.collected !== 0);

  const locationChartData = locations
    .map((row) => ({
      currency: normalizeCurrency(row.currency),
      name: row.location || "Unknown",
      leads: toNumber(row.lead_count),
      pipeline: toNumber(row.pipeline_value),
      weighted: toNumber(row.weighted_forecast),
      collected: toNumber(row.net_collected),
    }))
    .filter((row) => row.pipeline !== 0 || row.weighted !== 0 || row.collected !== 0);

  const cashChartData = actualMonthly
    .map((row) => ({
      currency: normalizeCurrency(row.currency),
      month: row.revenue_month,
      monthLabel: formatMonthShort(row.revenue_month),
      gross: toNumber(row.gross_received),
      refunds: toNumber(row.refunds),
      net: toNumber(row.actual_revenue),
      payments: toNumber(row.successful_payments),
    }))
    .filter((row) => row.gross !== 0 || row.refunds !== 0 || row.net !== 0);

  const brief = buildRevenueDecisionBrief(
    totalsByCurrency,
    unvaluedLeads,
    topOpportunities,
    closingThisMonth,
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Decision intelligence"
        title="Revenue"
        description="Understand collected cash, open pipeline, outstanding balances and the opportunities most likely to need action now."
        actions={
          <Link href="/commercial-intelligence" className="btn-secondary">
            <Sparkles size={15} /> Explain performance
          </Link>
        }
      />

      <ExecutiveDecisionBrief
        eyebrow="Revenue decision brief"
        title={brief.title}
        summary={brief.summary}
        confidenceLabel={brief.confidenceLabel}
        confidenceDetail={brief.confidenceDetail}
        signals={brief.signals}
        actions={brief.actions}
      />

      {workspace.warning ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          {workspace.warning}
        </div>
      ) : null}

      {unvaluedLeads > 0 ? (
        <Link
          href="/pipeline"
          className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 transition hover:bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-amber-600 shadow-sm dark:bg-slate-900 dark:text-amber-300">
            <AlertTriangle size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-black text-amber-900 dark:text-amber-100">
              {unvaluedLeads} open {unvaluedLeads === 1 ? "lead is" : "leads are"} missing potential value
            </span>
            <span className="mt-0.5 block text-[10px] text-amber-700/80 dark:text-amber-300/70">Forecast readiness is incomplete.</span>
          </span>
          <ArrowRight size={14} className="text-amber-400" />
        </Link>
      ) : null}

      <RevenueInsights
        summaries={totalsByCurrency}
        stages={stageChartData}
        monthly={monthlyChartData}
        sources={sourceChartData}
        locations={locationChartData}
        cash={cashChartData}
        usdInrRate={fxRate.rate}
        fxRateDate={fxRate.date}
        fxRateSource={fxRate.source}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <OpportunityCard title="Highest-value opportunities" rows={topOpportunities.slice(0, 6)} empty="No valued opportunities yet." />
        <OpportunityCard title="Expected to close this month" rows={closingThisMonth.slice(0, 6)} empty="No opportunities have an expected close date this month." closing />
      </div>

      <div className="px-1 text-[10px] leading-4 text-slate-400">
        Weighted pipeline is a deterministic planning value based on configured stage weights, not a calibrated probability. Cross-currency totals are shown only through the explicit FX display layer above.
      </div>
    </div>
  );
}

function buildRevenueDecisionBrief(
  summaries: RevenueCurrencySummary[],
  unvaluedLeads: number,
  topOpportunities: RevenueOpportunityRow[],
  closingThisMonth: RevenueOpportunityRow[],
) {
  const active = summaries.filter((row) => row.actual || row.pipeline || row.weighted || row.outstanding);
  const actual = formatSummaryMetric(active, "actual");
  const pipeline = formatSummaryMetric(active, "pipeline");
  const weighted = formatSummaryMetric(active, "weighted");
  const outstanding = formatSummaryMetric(active, "outstanding");
  const paymentCount = active.reduce((sum, row) => sum + row.successfulPayments, 0);
  const opportunityCount = active.reduce((sum, row) => sum + row.opportunities, 0);

  const title = unvaluedLeads > 0
    ? `${unvaluedLeads} open ${unvaluedLeads === 1 ? "lead is" : "leads are"} limiting forecast readiness.`
    : closingThisMonth.length > 0
      ? `${closingThisMonth.length} ${closingThisMonth.length === 1 ? "opportunity is" : "opportunities are"} expected to close this month.`
      : "Revenue evidence is reconciled; focus on pipeline quality and collection timing.";

  const summary = unvaluedLeads > 0
    ? `Collected revenue and open commercial value are visible, but forecasts remain incomplete until those leads receive explicit potential values. Currency truth stays separate in the underlying ledger.`
    : `SalsysOS is separating collected revenue, outstanding balances, open pipeline and deterministic weighted planning value so the team can act without double-counting commercial value.`;

  return {
    title,
    summary,
    confidenceLabel: unvaluedLeads > 0 ? "Forecast readiness incomplete" : "Forecast inputs complete",
    confidenceDetail: `Revenue amounts remain in their original currencies. Weighted pipeline uses configured stage weights for planning and is not presented as a calibrated conversion probability. ${paymentCount.toLocaleString("en-IN")} successful payments are represented in the current summaries.`,
    signals: [
      {
        label: "Collected revenue",
        value: actual,
        detail: `${paymentCount.toLocaleString("en-IN")} successful payments across visible currencies.`,
        tone: paymentCount > 0 ? ("positive" as const) : ("neutral" as const),
      },
      {
        label: "Open pipeline",
        value: pipeline,
        detail: `${opportunityCount.toLocaleString("en-IN")} valued opportunities before stage weighting.`,
        tone: opportunityCount > 0 ? ("positive" as const) : ("neutral" as const),
      },
      {
        label: "Weighted planning value",
        value: weighted,
        detail: "Deterministic stage-weighted planning value; not probability.",
        tone: "neutral" as const,
      },
      {
        label: "Outstanding balances",
        value: outstanding,
        detail: closingThisMonth.length
          ? `${closingThisMonth.length} expected close ${closingThisMonth.length === 1 ? "record" : "records"} this month.`
          : "No expected-close cohort is visible this month.",
        tone: active.some((row) => row.outstanding > 0) ? ("watch" as const) : ("positive" as const),
      },
    ],
    actions: [
      { label: "Work pipeline", href: "/pipeline", detail: "Review value, stage, ownership and expected close date." },
      { label: "Inspect attribution", href: "/attribution", detail: "Compare commercial value with acquisition evidence." },
      ...(topOpportunities[0]
        ? [{ label: "Open top opportunity", href: `/leads/${topOpportunities[0].id}`, detail: "Review the highest-value visible opportunity." }]
        : []),
    ],
  };
}

function formatSummaryMetric(
  rows: RevenueCurrencySummary[],
  key: "actual" | "pipeline" | "weighted" | "outstanding",
) {
  const values = rows
    .filter((row) => toNumber(row[key]) !== 0)
    .map((row) => formatMoney(row[key], row.currency));
  return values.length ? values.join(" · ") : "—";
}

function OpportunityCard({
  title,
  rows,
  empty,
  closing = false,
}: {
  title: string;
  rows: RevenueOpportunityRow[];
  empty: string;
  closing?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-900">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Action</div>
          <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{title}</div>
        </div>
        {closing ? <CalendarClock size={16} className="text-slate-300" /> : <Sparkles size={16} className="text-slate-300" />}
      </div>

      {rows.length ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-900">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/leads/${row.id}`}
              className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-900/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-black text-slate-800 dark:text-slate-100">{row.lead_name || row.lead_code}</span>
                <span className="mt-0.5 block truncate text-[9px] text-slate-400">
                  {pretty(row.current_stage)} · {row.preferred_location || "Unknown location"}
                  {closing && row.expected_close_date ? ` · ${formatDate(row.expected_close_date)}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[11px] font-black text-slate-800 dark:text-slate-100">{formatMoney(row.weighted_value, row.currency)}</span>
                <span className="mt-0.5 block text-[8px] font-semibold uppercase tracking-[0.06em] text-slate-400">weighted</span>
              </span>
              <ArrowRight size={13} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="px-4 py-10 text-center text-xs font-semibold text-slate-400">{empty}</div>
      )}
    </section>
  );
}

type FxRateResult = {
  rate: number | null;
  date: string | null;
  source: string | null;
};

async function getUsdInrRate(): Promise<FxRateResult> {
  try {
    const response = await fetch("https://api.frankfurter.dev/v2/rate/usd/inr", {
      next: { revalidate: 3600 },
    });

    if (!response.ok) throw new Error(`FX request failed with ${response.status}`);

    const data = (await response.json()) as {
      date?: string;
      base?: string;
      quote?: string;
      rate?: number;
    };
    const rate = Number(data.rate);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid USD/INR FX rate.");

    return { rate, date: data.date ?? null, source: "Frankfurter" };
  } catch {
    const fallback = Number(process.env.USD_INR_FALLBACK_RATE ?? 0);
    if (Number.isFinite(fallback) && fallback > 0) {
      return { rate: fallback, date: null, source: "Fallback rate" };
    }
    return { rate: null, date: null, source: null };
  }
}

function normalizeCurrency(value: string | null | undefined) {
  return String(value || "").toUpperCase();
}

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value: number | string | null | undefined, currency: string | null | undefined) {
  const amount = toNumber(value);
  const code = normalizeCurrency(currency) || "INR";
  try {
    return new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString()}`;
  }
}

function pretty(value: string | null | undefined) {
  if (!value) return "—";
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMonthShort(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No date";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
