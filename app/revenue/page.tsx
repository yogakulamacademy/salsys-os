import Link from "next/link";
import { ArrowRight, CalendarClock, GitBranch, Sparkles, Target } from "lucide-react";

import { ExecutiveDecisionBrief } from "@/components/marketing/executive-decision-brief";
import { RevenueInsights } from "@/components/revenue-insights";
import { Notice, PageHeader } from "@/components/ui";
import {
  getRevenueWorkspace,
  type RevenueCurrencySummary,
  type RevenueOpportunityRow,
} from "@/lib/revenue-data";

type RevenuePageProps = {
  searchParams: Promise<{
    investigation?: string;
    source?: string;
    from?: string;
  }>;
};

export default async function RevenuePage({ searchParams }: RevenuePageProps) {
  const query = await searchParams;
  const investigationSource = query.investigation === "1" ? query.source?.trim() || null : null;
  const investigationFrom = query.from?.trim() || "revenue";
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [workspace, fxRate] = await Promise.all([
    getRevenueWorkspace(currentMonth),
    getUsdInrRate(),
  ]);

  const { totalsByCurrency, stages, monthly, sources, locations, actualMonthly, unvaluedLeads, topOpportunities, closingThisMonth } = workspace;

  const focusedTopOpportunities = focusOpportunities(topOpportunities, investigationSource);
  const focusedClosingThisMonth = focusOpportunities(closingThisMonth, investigationSource);

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
        eyebrow="Intelligence · Revenue"
        title="Revenue"
        description="Understand collected cash, open pipeline, outstanding balances and the opportunities most likely to need action now."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/campaigns" className="btn-secondary">
              <Target size={15} /> Campaigns
            </Link>
            <Link href="/funnel" className="btn-secondary">
              <GitBranch size={15} /> Funnel
            </Link>
            <Link href="/attribution" className="btn-secondary">
              Attribution
            </Link>
            <Link href="/commercial-intelligence" className="btn-primary">
              <Sparkles size={15} /> Ask Salsys
            </Link>
          </div>
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

      {investigationSource ? (
        <section className="rounded-panel border border-line bg-surface px-4 py-4 shadow-card sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-700">
                Revenue evidence focus
              </div>
              <div className="mt-1 text-sm font-semibold text-copy-strong">
                Commercial records attributed to “{investigationSource}” are prioritized below.
              </div>
              <p className="mt-1 max-w-3xl text-[11px] leading-5 text-copy-muted">
                Opportunity focus uses the stored first-touch source only. If no matching first-touch opportunities are visible, the list falls back to the broader commercial cohort rather than inventing a match.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href={`/attribution?q=${encodeURIComponent(investigationSource)}`} className="btn-secondary">
                Review attribution <ArrowRight size={13} />
              </Link>
              <Link href={`/campaigns?q=${encodeURIComponent(investigationSource)}`} className="btn-secondary">
                Campaign evidence
              </Link>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[11px] font-semibold text-brand-700">
            <ArrowRight size={12} /> Suggested path: verify attribution → inspect the Opportunity → confirm payment evidence.
          </div>
        </section>
      ) : null}

      {workspace.warning ? <Notice tone="warning">{workspace.warning}</Notice> : null}

      {unvaluedLeads > 0 ? (
        <Notice
          tone="warning"
          title={`${unvaluedLeads} open ${unvaluedLeads === 1 ? "lead is" : "leads are"} missing potential value`}
          action={
            <Link href="/pipeline" className="btn-secondary">
              Review pipeline <ArrowRight size={13} />
            </Link>
          }
        >
          Forecast readiness is incomplete.
        </Notice>
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
        <OpportunityCard
          title={investigationSource ? `Highest-value opportunities · ${investigationSource}` : "Highest-value opportunities"}
          rows={focusedTopOpportunities.slice(0, 6)}
          empty="No valued opportunities yet."
          investigationSource={investigationSource}
          investigationFrom={investigationFrom}
        />
        <OpportunityCard
          title={investigationSource ? `Expected to close · ${investigationSource}` : "Expected to close this month"}
          rows={focusedClosingThisMonth.slice(0, 6)}
          empty="No opportunities have an expected close date this month."
          closing
          investigationSource={investigationSource}
          investigationFrom={investigationFrom}
        />
      </div>

      <div className="px-1 text-[10px] leading-4 text-copy-subtle">
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
  investigationSource,
  investigationFrom,
}: {
  title: string;
  rows: RevenueOpportunityRow[];
  empty: string;
  closing?: boolean;
  investigationSource: string | null;
  investigationFrom: string;
}) {
  return (
    <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-soft px-4 py-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-700">
            Action
          </div>
          <div className="mt-1 text-sm font-semibold text-copy-strong">{title}</div>
        </div>
        {closing ? (
          <CalendarClock size={16} className="text-brand-500" />
        ) : (
          <Sparkles size={16} className="text-brand-500" />
        )}
      </div>

      {rows.length ? (
        <div className="divide-y divide-line">
          {rows.map((row) => {
            const href = investigationSource
              ? `/leads/${row.id}?investigation=1&source=${encodeURIComponent(investigationSource)}&from=${encodeURIComponent(investigationFrom)}`
              : `/leads/${row.id}`;
            return (
              <Link
                key={row.id}
                href={href}
                className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-brand-50/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-copy-strong">
                    {row.lead_name || row.lead_code}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-copy-muted">
                    {pretty(row.current_stage)} · {row.preferred_location || "Unknown location"}
                    {row.first_touch_source ? ` · ${pretty(row.first_touch_source)}` : ""}
                    {closing && row.expected_close_date ? ` · ${formatDate(row.expected_close_date)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[12px] font-semibold text-copy-strong">
                    {formatMoney(row.weighted_value, row.currency)}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.06em] text-copy-subtle">
                    planning value
                  </span>
                </span>
                <ArrowRight size={13} className="shrink-0 text-copy-subtle transition group-hover:translate-x-0.5 group-hover:text-brand-700" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-10 text-center text-xs font-semibold text-copy-subtle">{empty}</div>
      )}
    </section>
  );
}

function focusOpportunities(rows: RevenueOpportunityRow[], source: string | null) {
  if (!source) return rows;
  const target = source.trim().toLowerCase();
  const matched = rows.filter((row) => (row.first_touch_source || "").trim().toLowerCase().includes(target));
  return matched.length ? matched : rows;
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
