'use client';

import { useMemo, useState } from "react";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Banknote,
  CircleDollarSign,
  MapPin,
  Target,
  TrendingUp,
} from "lucide-react";

export type RevenueCurrencySummary = {
  currency: string;

  pipeline: number;

  weighted: number;

  actual: number;

  gross: number;

  refunds: number;

  outstanding: number;

  balanceLeads: number;

  successfulPayments: number;

  opportunities: number;
};

export type RevenueStagePoint = {
  currency: string;

  stage: string;

  leads: number;

  pipeline: number;

  weighted: number;

  collected: number;
};

export type RevenueMonthlyPoint = {
  currency: string;

  month: string;

  monthLabel: string;

  leads: number;

  pipeline: number;

  weighted: number;

  collected: number;
};

export type RevenueBreakdownPoint = {
  currency: string;

  name: string;

  leads: number;

  pipeline: number;

  weighted: number;

  collected: number;
};

export type RevenueCashPoint = {
  currency: string;

  month: string;

  monthLabel: string;

  gross: number;

  refunds: number;

  net: number;

  payments: number;
};

type DisplayCurrency = "INR" | "USD";

type Props = {
  summaries: RevenueCurrencySummary[];

  stages: RevenueStagePoint[];

  monthly: RevenueMonthlyPoint[];

  sources: RevenueBreakdownPoint[];

  locations: RevenueBreakdownPoint[];

  cash: RevenueCashPoint[];

  usdInrRate: number | null;

  fxRateDate: string | null;

  fxRateSource: string | null;
};

export function RevenueInsights({
  summaries,

  stages,

  monthly,

  sources,

  locations,

  cash,

  usdInrRate,

  fxRateDate,

  fxRateSource,
}: Props) {
  const [currency, setCurrency] = useState<DisplayCurrency>("USD");

  const fxReady =
    typeof usdInrRate === "number" &&
    Number.isFinite(usdInrRate) &&
    usdInrRate > 0;

  const summary = useMemo(
    () =>
      aggregateSummaries(
        summaries,

        currency,

        usdInrRate,
      ),

    [summaries, currency, usdInrRate],
  );

  const monthlyRows = useMemo(
    () =>
      aggregateMonthly(
        monthly,

        currency,

        usdInrRate,
      ),

    [monthly, currency, usdInrRate],
  );

  const stageRows = useMemo(
    () =>
      aggregateStages(
        stages,

        currency,

        usdInrRate,
      ),

    [stages, currency, usdInrRate],
  );

  const sourceRows = useMemo(
    () =>
      aggregateBreakdowns(
        sources,

        currency,

        usdInrRate,
      ).slice(0, 8),

    [sources, currency, usdInrRate],
  );

  const locationRows = useMemo(
    () =>
      aggregateBreakdowns(
        locations,

        currency,

        usdInrRate,
      ).slice(0, 8),

    [locations, currency, usdInrRate],
  );

  const cashRows = useMemo(
    () =>
      aggregateCash(
        cash,

        currency,

        usdInrRate,
      ),

    [cash, currency, usdInrRate],
  );

  return (
    <div className="revenue-insights mt-4 space-y-4">
      <section className="revenue-insights-hero card-pad overflow-hidden animate-rise stagger-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Financial intelligence</div>

            <div className="section-title mt-1">Revenue performance</div>

            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
              INR and USD now act as display currencies. Values stored in either
              currency are converted and combined for reporting.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-400">
              {fxReady ? (
                <>
                  <span className="revenue-fx-badge rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                    1 USD = {formatRate(usdInrRate!)} INR
                  </span>

                  {fxRateDate && <span>Rate date {fxRateDate}</span>}

                  {fxRateSource && <span>· {fxRateSource}</span>}
                </>
              ) : (
                <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
                  FX rate unavailable — foreign-currency values cannot be
                  converted.
                </span>
              )}
            </div>
          </div>

          <div className="revenue-currency-toggle inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setCurrency("INR")}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                currency === "INR"
                  ? "bg-white text-brand shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              INR
            </button>

            <button
              type="button"
              onClick={() => setCurrency("USD")}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                currency === "USD"
                  ? "bg-white text-brand shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              USD
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FinanceMetric
            icon={<CircleDollarSign size={17} />}
            label="Open pipeline"
            value={formatMoney(summary.pipeline, currency)}
            note={`${summary.opportunities} valued open ${
              summary.opportunities === 1 ? "opportunity" : "opportunities"
            }`}
          />

          <FinanceMetric
            icon={<TrendingUp size={17} />}
            label="Weighted forecast"
            value={formatMoney(summary.weighted, currency)}
            note="stage-probability adjusted"
          />

          <FinanceMetric
            icon={<Banknote size={17} />}
            label="Net collected"
            value={formatMoney(summary.actual, currency)}
            note={`${summary.successfulPayments} successful ${
              summary.successfulPayments === 1 ? "payment" : "payments"
            }`}
          />

          <FinanceMetric
            icon={<Target size={17} />}
            label="Outstanding"
            value={formatMoney(summary.outstanding, currency)}
            note={`${summary.balanceLeads} ${
              summary.balanceLeads === 1 ? "lead" : "leads"
            } with balance`}
          />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <MiniMetric
            label="Gross received"
            value={formatMoney(summary.gross, currency)}
          />

          <MiniMetric
            label="Refunds"
            value={formatMoney(summary.refunds, currency)}
          />

          <MiniMetric
            label="Forecast coverage"
            value={
              summary.pipeline > 0
                ? `${Math.round((summary.weighted / summary.pipeline) * 100)}%`
                : "—"
            }
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <section className="revenue-chart-card revenue-monthly-chart card-pad overflow-hidden animate-rise stagger-2">
          <ChartHeading
            eyebrow="Forecast"
            title="Monthly revenue outlook"
            description={`Pipeline, weighted forecast and collected revenue shown in ${currency}.`}
          />

          {monthlyRows.length > 0 ? (
            <div className="mt-5 h-[330px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyRows}
                  margin={{ top: 10, right: 12, left: -6, bottom: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="rgba(148,163,184,.18)"
                  />

                  <XAxis
                    dataKey="monthLabel"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#7c8aa0" }}
                  />

                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickFormatter={(value) =>
                      compactMoney(Number(value), currency)
                    }
                    tick={{ fontSize: 10, fill: "#7c8aa0" }}
                  />

                  <Tooltip content={<RevenueTooltip currency={currency} />} />

                  <Bar
                    dataKey="pipeline"
                    name="Pipeline"
                    fill="#6D4CFF"
                    radius={[7, 7, 2, 2]}
                    animationDuration={650}
                  />

                  <Line
                    type="monotone"
                    dataKey="weighted"
                    name="Weighted"
                    stroke="#8B5CF6"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    animationDuration={750}
                  />

                  <Line
                    type="monotone"
                    dataKey="collected"
                    name="Collected"
                    stroke="#A78BFA"
                    strokeWidth={2.2}
                    dot={{ r: 3 }}
                    animationDuration={850}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart message="No valued monthly forecast data yet." />
          )}

          <ChartLegend
            items={[
              { label: "Pipeline", color: "#6D4CFF" },

              { label: "Weighted forecast", color: "#8B5CF6" },

              { label: "Collected", color: "#A78BFA" },
            ]}
          />
        </section>

        <section className="revenue-chart-card revenue-stage-chart card-pad overflow-hidden animate-rise stagger-3">
          <ChartHeading
            eyebrow="Pipeline"
            title="Value by stage"
            description={`Financially valued opportunities displayed in ${currency}.`}
          />

          {stageRows.length > 0 ? (
            <div className="mt-5 h-[330px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stageRows}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 10, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="rgba(148,163,184,.18)"
                  />

                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      compactMoney(Number(value), currency)
                    }
                    tick={{ fontSize: 10, fill: "#7c8aa0" }}
                  />

                  <YAxis
                    type="category"
                    dataKey="stage"
                    width={92}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "#7c8aa0" }}
                  />

                  <Tooltip content={<RevenueTooltip currency={currency} />} />

                  <Bar
                    dataKey="pipeline"
                    name="Pipeline"
                    fill="#6D4CFF"
                    radius={[0, 6, 6, 0]}
                    animationDuration={650}
                  />

                  <Bar
                    dataKey="weighted"
                    name="Weighted"
                    fill="#ec8316"
                    radius={[0, 6, 6, 0]}
                    animationDuration={750}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart message="No valued stage forecast data yet." />
          )}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownChart
          eyebrow="Attribution"
          title="Revenue by source"
          description="Top first-touch acquisition sources by weighted forecast."
          icon={<TrendingUp size={17} />}
          rows={sourceRows}
          currency={currency}
        />

        <BreakdownChart
          eyebrow="Markets"
          title="Revenue by location"
          description="Locations contributing the most weighted pipeline value."
          icon={<MapPin size={17} />}
          rows={locationRows}
          currency={currency}
        />
      </div>

      <section className="revenue-chart-card revenue-cash-chart card-pad overflow-hidden animate-rise stagger-4">
        <ChartHeading
          eyebrow="Cash"
          title="Actual cash revenue"
          description={`Gross receipts, refunds and net revenue displayed in ${currency}.`}
        />

        {cashRows.length > 0 ? (
          <div className="mt-5 h-[310px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={cashRows}
                margin={{ top: 8, right: 12, left: -6, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(148,163,184,.18)"
                />

                <XAxis
                  dataKey="monthLabel"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#7c8aa0" }}
                />

                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(value) =>
                    compactMoney(Number(value), currency)
                  }
                  tick={{ fontSize: 10, fill: "#7c8aa0" }}
                />

                <Tooltip content={<RevenueTooltip currency={currency} />} />

                <Bar
                  dataKey="gross"
                  name="Gross"
                  fill="#6D4CFF"
                  radius={[6, 6, 2, 2]}
                  animationDuration={650}
                />

                <Area
                  type="monotone"
                  dataKey="net"
                  name="Net revenue"
                  stroke="#A78BFA"
                  fill="rgba(139,92,246,.10)"
                  strokeWidth={2.4}
                  animationDuration={800}
                />

                <Line
                  type="monotone"
                  dataKey="refunds"
                  name="Refunds"
                  stroke="#C26A7A"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  animationDuration={900}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart message="No paid transactions have been recorded yet." />
        )}

        <ChartLegend
          items={[
            { label: "Gross received", color: "#6D4CFF" },

            { label: "Net revenue", color: "#8B5CF6" },

            { label: "Refunds", color: "#C26A7A" },
          ]}
        />
      </section>
    </div>
  );
}

function aggregateSummaries(
  rows: RevenueCurrencySummary[],

  displayCurrency: DisplayCurrency,

  usdInrRate: number | null,
): RevenueCurrencySummary {
  return rows.reduce<RevenueCurrencySummary>(
    (total, row) => ({
      currency: displayCurrency,

      pipeline:
        total.pipeline +
        convertMoney(row.pipeline, row.currency, displayCurrency, usdInrRate),

      weighted:
        total.weighted +
        convertMoney(row.weighted, row.currency, displayCurrency, usdInrRate),

      actual:
        total.actual +
        convertMoney(row.actual, row.currency, displayCurrency, usdInrRate),

      gross:
        total.gross +
        convertMoney(row.gross, row.currency, displayCurrency, usdInrRate),

      refunds:
        total.refunds +
        convertMoney(row.refunds, row.currency, displayCurrency, usdInrRate),

      outstanding:
        total.outstanding +
        convertMoney(
          row.outstanding,
          row.currency,
          displayCurrency,
          usdInrRate,
        ),

      balanceLeads: total.balanceLeads + row.balanceLeads,

      successfulPayments: total.successfulPayments + row.successfulPayments,

      opportunities: total.opportunities + row.opportunities,
    }),

    {
      currency: displayCurrency,

      pipeline: 0,

      weighted: 0,

      actual: 0,

      gross: 0,

      refunds: 0,

      outstanding: 0,

      balanceLeads: 0,

      successfulPayments: 0,

      opportunities: 0,
    },
  );
}

function aggregateStages(
  rows: RevenueStagePoint[],

  displayCurrency: DisplayCurrency,

  usdInrRate: number | null,
) {
  const map = new Map<string, RevenueStagePoint>();

  for (const row of rows) {
    const current = map.get(row.stage) ?? {
      currency: displayCurrency,

      stage: row.stage,

      leads: 0,

      pipeline: 0,

      weighted: 0,

      collected: 0,
    };

    current.leads += row.leads;

    current.pipeline += convertMoney(
      row.pipeline,

      row.currency,

      displayCurrency,

      usdInrRate,
    );

    current.weighted += convertMoney(
      row.weighted,

      row.currency,

      displayCurrency,

      usdInrRate,
    );

    current.collected += convertMoney(
      row.collected,

      row.currency,

      displayCurrency,

      usdInrRate,
    );

    map.set(row.stage, current);
  }

  return Array.from(map.values())

    .filter(
      (row) => row.pipeline !== 0 || row.weighted !== 0 || row.collected !== 0,
    )

    .sort((a, b) => b.weighted - a.weighted);
}

function aggregateMonthly(
  rows: RevenueMonthlyPoint[],

  displayCurrency: DisplayCurrency,

  usdInrRate: number | null,
) {
  const map = new Map<string, RevenueMonthlyPoint>();

  for (const row of rows) {
    const current = map.get(row.month) ?? {
      currency: displayCurrency,

      month: row.month,

      monthLabel: row.monthLabel,

      leads: 0,

      pipeline: 0,

      weighted: 0,

      collected: 0,
    };

    current.leads += row.leads;

    current.pipeline += convertMoney(
      row.pipeline,

      row.currency,

      displayCurrency,

      usdInrRate,
    );

    current.weighted += convertMoney(
      row.weighted,

      row.currency,

      displayCurrency,

      usdInrRate,
    );

    current.collected += convertMoney(
      row.collected,

      row.currency,

      displayCurrency,

      usdInrRate,
    );

    map.set(row.month, current);
  }

  return Array.from(map.values())

    .filter(
      (row) => row.pipeline !== 0 || row.weighted !== 0 || row.collected !== 0,
    )

    .sort((a, b) => a.month.localeCompare(b.month));
}

function aggregateBreakdowns(
  rows: RevenueBreakdownPoint[],

  displayCurrency: DisplayCurrency,

  usdInrRate: number | null,
) {
  const map = new Map<string, RevenueBreakdownPoint>();

  for (const row of rows) {
    const current = map.get(row.name) ?? {
      currency: displayCurrency,

      name: row.name,

      leads: 0,

      pipeline: 0,

      weighted: 0,

      collected: 0,
    };

    current.leads += row.leads;

    current.pipeline += convertMoney(
      row.pipeline,

      row.currency,

      displayCurrency,

      usdInrRate,
    );

    current.weighted += convertMoney(
      row.weighted,

      row.currency,

      displayCurrency,

      usdInrRate,
    );

    current.collected += convertMoney(
      row.collected,

      row.currency,

      displayCurrency,

      usdInrRate,
    );

    map.set(row.name, current);
  }

  return Array.from(map.values())

    .filter(
      (row) => row.pipeline !== 0 || row.weighted !== 0 || row.collected !== 0,
    )

    .sort((a, b) => b.weighted - a.weighted);
}

function aggregateCash(
  rows: RevenueCashPoint[],

  displayCurrency: DisplayCurrency,

  usdInrRate: number | null,
) {
  const map = new Map<string, RevenueCashPoint>();

  for (const row of rows) {
    const current = map.get(row.month) ?? {
      currency: displayCurrency,

      month: row.month,

      monthLabel: row.monthLabel,

      gross: 0,

      refunds: 0,

      net: 0,

      payments: 0,
    };

    current.gross += convertMoney(
      row.gross,

      row.currency,

      displayCurrency,

      usdInrRate,
    );

    current.refunds += convertMoney(
      row.refunds,

      row.currency,

      displayCurrency,

      usdInrRate,
    );

    current.net += convertMoney(
      row.net,

      row.currency,

      displayCurrency,

      usdInrRate,
    );

    current.payments += row.payments;

    map.set(row.month, current);
  }

  return Array.from(map.values())

    .filter((row) => row.gross !== 0 || row.refunds !== 0 || row.net !== 0)

    .sort((a, b) => a.month.localeCompare(b.month));
}

function convertMoney(
  value: number,

  sourceCurrency: string,

  displayCurrency: DisplayCurrency,

  usdInrRate: number | null,
) {
  const amount = Number.isFinite(value) ? value : 0;

  const source = String(sourceCurrency || "").toUpperCase();

  if (source === displayCurrency) {
    return amount;
  }

  if (!usdInrRate || !Number.isFinite(usdInrRate) || usdInrRate <= 0) {
    return 0;
  }

  if (source === "USD" && displayCurrency === "INR") {
    return amount * usdInrRate;
  }

  if (source === "INR" && displayCurrency === "USD") {
    return amount / usdInrRate;
  }

  return 0;
}

function FinanceMetric({
  icon,

  label,

  value,

  note,
}: {
  icon: React.ReactNode;

  label: string;

  value: string;

  note: string;
}) {
  return (
    <div className="revenue-finance-metric rounded-2xl border border-slate-100 bg-slate-50 p-4 transition">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span className="text-brand">{icon}</span>

        {label}
      </div>

      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        {value}
      </div>

      <div className="mt-1 text-[11px] text-slate-400">{note}</div>
    </div>
  );
}

function MiniMetric({
  label,

  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="revenue-summary-mini rounded-xl border border-slate-100 bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">
        {label}
      </div>

      <div className="mt-1.5 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function ChartHeading({
  eyebrow,

  title,

  description,
}: {
  eyebrow: string;

  title: string;

  description: string;
}) {
  return (
    <div>
      <div className="eyebrow">{eyebrow}</div>

      <div className="section-title mt-1">{title}</div>

      <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
    </div>
  );
}

function BreakdownChart({
  eyebrow,

  title,

  description,

  icon,

  rows,

  currency,
}: {
  eyebrow: string;

  title: string;

  description: string;

  icon: React.ReactNode;

  rows: RevenueBreakdownPoint[];

  currency: DisplayCurrency;
}) {
  return (
    <section className="revenue-chart-card revenue-breakdown-chart card-pad overflow-hidden animate-rise stagger-3">
      <div className="flex items-start justify-between gap-4">
        <ChartHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <div className="text-slate-400">{icon}</div>
      </div>

      {rows.length > 0 ? (
        <div className="mt-5 h-[310px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 14, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke="rgba(148,163,184,.18)"
              />

              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => compactMoney(Number(value), currency)}
                tick={{ fontSize: 10, fill: "#7c8aa0" }}
              />

              <YAxis
                type="category"
                dataKey="name"
                width={116}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "#7c8aa0" }}
              />

              <Tooltip content={<RevenueTooltip currency={currency} />} />

              <Bar
                dataKey="weighted"
                name="Weighted"
                fill="#6D4CFF"
                radius={[0, 6, 6, 0]}
                animationDuration={700}
              />

              <Bar
                dataKey="collected"
                name="Collected"
                fill="#ec8316"
                radius={[0, 6, 6, 0]}
                animationDuration={800}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyChart message="No valued forecast data yet." />
      )}
    </section>
  );
}

function RevenueTooltip({
  active,

  payload,

  label,

  currency,
}: {
  active?: boolean;

  payload?: Array<{
    name?: string;

    value?: number | string;
  }>;

  label?: string;

  currency: DisplayCurrency;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="revenue-tooltip min-w-[185px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-xl">
      {label && (
        <div className="mb-2 text-xs font-semibold text-slate-800">{label}</div>
      )}

      <div className="space-y-1.5">
        {payload.map((item, index) => (
          <div
            key={`${item.name ?? "value"}-${index}`}
            className="flex items-center justify-between gap-5 text-xs"
          >
            <span className="text-slate-400">{item.name ?? "Value"}</span>

            <span className="font-semibold text-slate-700">
              {formatMoney(
                Number(item.value ?? 0),

                currency,
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartLegend({
  items,
}: {
  items: Array<{ label: string; color: string }>;
}) {
  return (
    <div className="revenue-chart-legend mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-[11px] font-semibold text-slate-500">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: item.color }}
          />

          {item.label}
        </span>
      ))}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="revenue-empty-chart mt-5 grid min-h-[250px] place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center text-sm text-slate-400">
      {message}
    </div>
  );
}

function formatMoney(
  value: number,

  currency: DisplayCurrency,
) {
  try {
    return new Intl.NumberFormat(
      currency === "INR" ? "en-IN" : "en-US",

      {
        style: "currency",

        currency,

        maximumFractionDigits: 0,
      },
    ).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `${currency} ${
      Number.isFinite(value) ? value.toLocaleString() : "0"
    }`;
  }
}

function compactMoney(
  value: number,

  currency: DisplayCurrency,
) {
  const symbol = currency === "INR" ? "₹" : "$";

  return `${symbol}${new Intl.NumberFormat("en", {
    notation: "compact",

    maximumFractionDigits: 1,
  }).format(Number.isFinite(value) ? value : 0)}`;
}

function formatRate(value: number) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,

    maximumFractionDigits: 4,
  }).format(value);
}
