"use client";

import Link from "next/link";
import { HomeEmptyState } from "@/components/home/home-empty-state";
import { ArrowRight } from "lucide-react";
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

import type { DashboardLeadActivityPoint } from "@/lib/dashboard-period-data";

type LeadActivityChartProps = {
  points: DashboardLeadActivityPoint[];
  available: boolean;
  currentTotal: number | null;
  previousTotal: number | null;
  periodLabel: string;
};

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DashboardLeadActivityPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <div className="max-w-[215px] rounded-xl border border-line bg-surface px-3 py-2.5 text-xs shadow-panel">
      <p className="font-semibold text-copy-strong">{item.currentRange}</p>
      <p className="mt-1 text-copy-muted">
        This period <strong className="ml-2 tabular-nums text-copy-strong">{item.current.toLocaleString("en-IN")}</strong>
      </p>
      <p className="mt-1 text-copy-muted">
        Previous <strong className="ml-2 tabular-nums text-copy-strong">{item.previous.toLocaleString("en-IN")}</strong>
      </p>
      <p className="mt-1 text-[10px] text-copy-subtle">{item.previousRange}</p>
    </div>
  );
}

/** Read-only visualization. Uses pre-aggregated and already-authorized CRM lead data. */
export function LeadActivityChart({
  points, available, currentTotal, previousTotal, periodLabel,
}: LeadActivityChartProps) {
  if (!available) {
    return (
      <div data-testid="home-lead-activity">
        <HomeEmptyState
          variant="activity"
          unavailable
          title="Lead activity unavailable"
          description="Selected-period lead evidence is unavailable. The chart is withheld rather than substituting all-time leads."
        />
      </div>
    );
  }

  if (!points.length) {
    return (
      <div data-testid="home-lead-activity">
        <HomeEmptyState
          variant="activity"
          title="No lead activity yet"
          description="No comparable lead activity is available for this date range."
        />
      </div>
    );
  }

  const hasActivity = points.some((point) => point.current > 0 || point.previous > 0);

  return (
    <div data-testid="home-lead-activity" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] text-copy-muted">Lead activity · {periodLabel}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[23px] font-semibold tracking-[-0.035em] tabular-nums text-copy-strong">
              {currentTotal == null ? "—" : currentTotal.toLocaleString("en-IN")}
            </span>
            <span className="text-[11px] text-copy-subtle">new leads</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] font-medium text-copy-muted" aria-label="Chart series">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-brand-700" />This period</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-slate-400" />Previous period</span>
        </div>
      </div>
      {hasActivity ? (
        <div
          className="mt-4 h-[216px] min-w-0 text-brand-700"
          role="img"
          aria-label={"New lead volume compared with the previous equal-length period. Current " + (currentTotal ?? 0) + ", previous " + (previousTotal ?? 0) + "."}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 10, right: 7, left: -20, bottom: 2 }}>
              <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.1} strokeDasharray="3 4" />
              <XAxis
                dataKey="currentRange"
                tickLine={false}
                axisLine={false}
                minTickGap={29}
                tick={{ fontSize: 10, fill: "#8C94A4" }}
                tickFormatter={(value: string) => value.split(" – ")[0]}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fontSize: 10, fill: "#8C94A4" }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="current"
                name="This period"
                stroke="currentColor"
                strokeWidth={2.5}
                fill="currentColor"
                fillOpacity={0.09}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="previous"
                name="Previous period"
                stroke="#9BA3B1"
                strokeWidth={1.8}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-4">
          <HomeEmptyState
            variant="activity"
            compact
            title="No new leads yet"
            description="No new leads were recorded in either comparable period."
            action={{ href: "/leads", label: "Open leads" }}
          />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-[11px] leading-4 text-copy-subtle">
          {previousTotal == null ? "Comparison unavailable" : previousTotal.toLocaleString("en-IN") + " leads in the previous equal-length period"}
        </span>
        <Link href="/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300">
          View leads <ArrowRight size={13} />
        </Link>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-copy-subtle">
        Each point uses the same day-count interval in both periods; no predicted conversions.
      </p>
    </div>
  );
}
