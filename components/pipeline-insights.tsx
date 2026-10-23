"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Clock3, Percent } from "lucide-react";

export type PipelineInsightPoint = {
  stage: string;
  leads: number;
};

export type PipelineAgingPoint = {
  stage: string;
  healthy: number;
  warning: number;
  stuck: number;
  medianDays: number;
  oldestDays: number;
};

const CHART_PRIMARY = "#216551";
const CHART_SECONDARY = "#75A78E";
const CHART_AXIS = "#7B8D84";
const CHART_GRID = "rgba(102,120,111,.16)";

export function PipelineInsights({
  data,
  agingData,
}: {
  data: PipelineInsightPoint[];
  agingData: PipelineAgingPoint[];
}) {
  const [view, setView] = useState<"distribution" | "aging">("distribution");
  const [mode, setMode] = useState<"count" | "share">("count");

  const total = useMemo(
    () => data.reduce((sum, item) => sum + item.leads, 0),
    [data],
  );

  const chartData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        share: total > 0 ? Math.round((item.leads / total) * 1000) / 10 : 0,
      })),
    [data, total],
  );

  const totalStuck = agingData.reduce((sum, item) => sum + item.stuck, 0);
  const totalWarning = agingData.reduce((sum, item) => sum + item.warning, 0);

  return (
    <section className="pipeline-insights-polish card-pad overflow-hidden">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Pipeline intelligence</div>
          <div className="section-title mt-1">
            {view === "distribution" ? "Stage distribution" : "Stage aging"}
          </div>
          <p className="mt-1 text-[12px] leading-5 text-copy-muted">
            {view === "distribution"
              ? "Current lead distribution across the active funnel. Hover for exact values."
              : "Median and oldest time currently spent in each stage, backed by audited stage history."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl>
            <SegmentButton active={view === "distribution"} onClick={() => setView("distribution")} icon={<BarChart3 size={14} />}>
              Distribution
            </SegmentButton>
            <SegmentButton active={view === "aging"} onClick={() => setView("aging")} icon={<Clock3 size={14} />}>
              Stage aging
            </SegmentButton>
          </SegmentedControl>

          {view === "distribution" && (
            <SegmentedControl>
              <SegmentButton active={mode === "count"} onClick={() => setMode("count")} icon={<BarChart3 size={14} />}>
                Count
              </SegmentButton>
              <SegmentButton active={mode === "share"} onClick={() => setMode("share")} icon={<Percent size={14} />}>
                Share
              </SegmentButton>
            </SegmentedControl>
          )}
        </div>
      </div>

      {view === "distribution" ? (
        <>
          <div className="h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -14, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID} />
                <XAxis
                  dataKey="stage"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  height={48}
                  tick={{ fontSize: 10, fill: CHART_AXIS }}
                />
                <YAxis
                  allowDecimals={mode === "share"}
                  tickLine={false}
                  axisLine={false}
                  unit={mode === "share" ? "%" : undefined}
                  tick={{ fontSize: 11, fill: CHART_AXIS }}
                />
                <Tooltip cursor={{ fill: "rgba(33,101,81,.05)" }} content={<PipelineDistributionTooltip />} />
                <Bar
                  dataKey={mode === "count" ? "leads" : "share"}
                  name={mode === "count" ? "Leads" : "Share"}
                  fill={CHART_PRIMARY}
                  radius={[7, 7, 3, 3]}
                  animationDuration={650}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 border-t border-line pt-4 text-[11px] leading-5 text-copy-subtle">
            This chart shows where leads are <strong>currently</strong> sitting. It does not calculate true stage-to-stage conversion; use the Funnel page for audited conversion analysis.
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-panel border border-amber-200 bg-amber-50/70 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-amber-700">Warning</div>
              <div className="mt-1 text-xl font-semibold text-amber-800">{totalWarning}</div>
              <div className="mt-1 text-[11px] text-amber-700">Leads approaching their stuck threshold</div>
            </div>

            <div className="rounded-panel border border-red-200 bg-red-50/70 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-red-700">Stuck</div>
              <div className="mt-1 text-xl font-semibold text-red-800">{totalStuck}</div>
              <div className="mt-1 text-[11px] text-red-700">Leads beyond their configured stage limit</div>
            </div>
          </div>

          <div className="h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingData} margin={{ top: 8, right: 8, left: -10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID} />
                <XAxis
                  dataKey="stage"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  height={48}
                  tick={{ fontSize: 10, fill: CHART_AXIS }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  unit="d"
                  tick={{ fontSize: 11, fill: CHART_AXIS }}
                />
                <Tooltip cursor={{ fill: "rgba(33,101,81,.05)" }} content={<PipelineAgingTooltip />} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar
                  dataKey="medianDays"
                  name="Median days"
                  fill={CHART_PRIMARY}
                  radius={[6, 6, 2, 2]}
                  animationDuration={650}
                />
                <Bar
                  dataKey="oldestDays"
                  name="Oldest days"
                  fill={CHART_SECONDARY}
                  radius={[6, 6, 2, 2]}
                  animationDuration={750}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {agingData.map((stage) => (
              <div key={stage.stage} className="rounded-panel border border-line bg-surface-soft p-3">
                <div className="text-[11px] font-semibold text-copy-strong">{stage.stage}</div>
                <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-copy-subtle">
                  <span>Median</span>
                  <strong className="text-copy-strong">{formatAge(stage.medianDays)}</strong>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] font-semibold text-copy-subtle">
                  <span>Oldest</span>
                  <strong className="text-copy-strong">{formatAge(stage.oldestDays)}</strong>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {stage.warning > 0 && (
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      {stage.warning} warning
                    </span>
                  )}
                  {stage.stuck > 0 && (
                    <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                      {stage.stuck} stuck
                    </span>
                  )}
                  {stage.warning === 0 && stage.stuck === 0 && (
                    <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Healthy</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SegmentedControl({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex rounded-ui border border-line bg-surface-soft p-1">{children}</div>;
}

function SegmentButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-[12px] font-semibold transition ${
        active ? "bg-surface text-brand-700 shadow-sm" : "text-copy-muted hover:text-copy-strong"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function PipelineDistributionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { stage: string; leads: number; share: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="pipeline-tooltip min-w-[150px] rounded-ui border border-line bg-surface px-3 py-2.5 shadow-panel">
      <div className="text-[10px] font-bold uppercase tracking-[.12em] text-copy-subtle">{point.stage}</div>
      <div className="mt-1 text-[14px] font-semibold text-copy-strong">{point.leads.toLocaleString()} leads</div>
      <div className="mt-0.5 text-[12px] text-copy-muted">{point.share}% of active pipeline</div>
    </div>
  );
}

function PipelineAgingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: PipelineAgingPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="pipeline-tooltip min-w-[180px] rounded-ui border border-line bg-surface px-3 py-2.5 shadow-panel">
      <div className="text-[10px] font-bold uppercase tracking-[.12em] text-copy-subtle">{point.stage}</div>
      <div className="mt-2 space-y-1 text-[12px]">
        <TooltipRow label="Median" value={formatAge(point.medianDays)} />
        <TooltipRow label="Oldest" value={formatAge(point.oldestDays)} />
        <TooltipRow label="Healthy" value={String(point.healthy)} />
        <TooltipRow label="Warning" value={String(point.warning)} />
        <TooltipRow label="Stuck" value={String(point.stuck)} />
      </div>
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-copy-subtle">{label}</span>
      <strong className="text-copy-strong">{value}</strong>
    </div>
  );
}

function formatAge(days: number) {
  if (days < 1) return `${Math.max(0, Math.round(days * 24))}h`;
  if (days < 10) return `${days.toFixed(1)}d`;
  return `${Math.round(days)}d`;
}
