"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, ArrowUpRight, Megaphone, Sparkles } from "lucide-react";

type PipelinePoint = {
  stage: string;
  leads: number;
};

type SourcePoint = {
  source: string;
  leads: number;
  qualified: number;
  share: number;
};

type DashboardVisualsProps = {
  pipeline: PipelinePoint[];
  sources: SourcePoint[];
  total: number;
  activePipeline: number;
  qualified: number;
  enrolled: number;
  priority: number;
};

const PIPELINE_COLORS = [
  "#B9D3C5",
  "#9BC1AE",
  "#79AA92",
  "#5E927B",
  "#3F7B65",
  "#216551",
  "#18362D",
];
const CHART_PRIMARY = "#216551";
const CHART_SECONDARY = "#75A78E";
const CHART_AXIS = "#7B8D84";
const CHART_GRID = "rgba(102,120,111,.16)";

export function DashboardVisuals({
  pipeline,
  sources,
  total,
  activePipeline,
  qualified,
  enrolled,
  priority,
}: DashboardVisualsProps) {
  const [view, setView] = useState<"pipeline" | "acquisition">("pipeline");

  const acquisition = useMemo(
    () => [...sources].sort((a, b) => b.leads - a.leads).slice(0, 7),
    [sources],
  );

  const qualificationRate = total ? Math.round((qualified / total) * 100) : 0;
  const enrollmentRate = total ? Math.round((enrolled / total) * 100) : 0;

  const enrollmentRing = [
    { name: "Enrolled", value: enrolled },
    { name: "Remaining", value: Math.max(0, total - enrolled) },
  ];

  return (
    <section className="dashboard-visuals overflow-hidden rounded-panel border border-line bg-surface shadow-card">
      <div className="flex flex-col gap-4 border-b border-line px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-brand-700">
            <Sparkles size={13} />
            Performance intelligence
          </div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-.02em] text-copy-strong">
            Admissions pulse
          </div>
          <p className="mt-1 max-w-2xl text-[12px] leading-5 text-copy-muted">
            A visual read on pipeline shape, acquisition quality and overall conversion.
          </p>
        </div>

        <div className="inline-flex self-start rounded-ui border border-line bg-surface-soft p-1">
          <button
            type="button"
            onClick={() => setView("pipeline")}
            className={`inline-flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-[12px] font-semibold transition ${
              view === "pipeline"
                ? "bg-surface text-brand-700 shadow-sm"
                : "text-copy-muted hover:text-copy-strong"
            }`}
          >
            <Activity size={14} />
            Pipeline
          </button>
          <button
            type="button"
            onClick={() => setView("acquisition")}
            className={`inline-flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-[12px] font-semibold transition ${
              view === "acquisition"
                ? "bg-surface text-brand-700 shadow-sm"
                : "text-copy-muted hover:text-copy-strong"
            }`}
          >
            <Megaphone size={14} />
            Acquisition
          </button>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_210px]">
        <div className="min-w-0 px-3 pb-3 pt-4 sm:px-5 sm:pb-5">
          <div className="h-[320px] w-full">
            {view === "pipeline" ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipeline} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID} />
                  <XAxis
                    dataKey="stage"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: CHART_AXIS, fontSize: 11, fontWeight: 500 }}
                    interval={0}
                    height={46}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={34}
                    tick={{ fill: CHART_AXIS, fontSize: 11 }}
                  />
                  <Tooltip content={<PipelineTooltip />} cursor={{ fill: "rgba(33,101,81,.05)" }} />
                  <Bar dataKey="leads" radius={[9, 9, 4, 4]} maxBarSize={58} animationDuration={700}>
                    {pipeline.map((entry, index) => (
                      <Cell key={`${entry.stage}-${index}`} fill={PIPELINE_COLORS[index % PIPELINE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={acquisition} layout="vertical" margin={{ top: 4, right: 16, left: 14, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART_GRID} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: CHART_AXIS, fontSize: 11 }}
                  />
                  <YAxis
                    dataKey="source"
                    type="category"
                    width={90}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#66786F", fontSize: 11, fontWeight: 500 }}
                  />
                  <Tooltip content={<AcquisitionTooltip />} cursor={{ fill: "rgba(33,101,81,.05)" }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#66786F", paddingTop: 8 }} />
                  <Bar
                    dataKey="leads"
                    name="Leads"
                    fill={CHART_SECONDARY}
                    radius={[0, 8, 8, 0]}
                    maxBarSize={20}
                    animationDuration={650}
                  />
                  <Bar
                    dataKey="qualified"
                    name="Qualified+"
                    fill={CHART_PRIMARY}
                    radius={[0, 8, 8, 0]}
                    maxBarSize={20}
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-1 grid grid-cols-3 gap-2 border-t border-line pt-4">
            <MiniMetric label="Active pipeline" value={activePipeline} />
            <MiniMetric label="Qualified+" value={qualified} />
            <MiniMetric label="Priority" value={priority} accent />
          </div>
        </div>

        <div className="dashboard-conversion-panel border-t border-line p-5 lg:border-l lg:border-t-0">
          <div className="text-[10px] font-bold uppercase tracking-[.12em] text-copy-subtle">
            Conversion snapshot
          </div>

          <div className="relative mx-auto mt-4 h-[170px] w-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={enrollmentRing}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={76}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={2}
                  stroke="none"
                  animationDuration={800}
                >
                  <Cell fill={CHART_PRIMARY} />
                  <Cell fill="#E5ECE8" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-3xl font-semibold tracking-[-.04em] text-copy-strong">
                  {total ? `${enrollmentRate}%` : "—"}
                </div>
                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-copy-subtle">
                  Enrolled
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-2.5">
            <RateRow label="Qualification" value={qualificationRate} />
            <RateRow label="Enrollment" value={enrollmentRate} strong />
          </div>

          <div className="dashboard-enrollment-card mt-4 rounded-ui border border-line bg-brand-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.1em] text-brand-700">
                  Enrolled leads
                </div>
                <div className="mt-1 text-xl font-semibold tracking-tight text-copy-strong">
                  {enrolled.toLocaleString()}
                </div>
              </div>
              <div className="dashboard-enrollment-icon grid h-9 w-9 place-items-center rounded-ui bg-surface text-brand-700 shadow-sm">
                <ArrowUpRight size={16} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="dashboard-mini-metric rounded-ui border border-line bg-surface-soft px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[.09em] text-copy-subtle">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tracking-tight ${accent ? "text-brand-700" : "text-copy-strong"}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function RateRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="font-semibold text-copy-muted">{label}</span>
        <span className={`font-semibold ${strong ? "text-brand-700" : "text-copy-strong"}`}>
          {value}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={`h-full rounded-full ${strong ? "bg-brand-700" : "bg-[#75A78E]"}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function PipelineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: PipelinePoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="dashboard-chart-tooltip min-w-[140px] rounded-ui border border-line bg-surface px-3 py-2.5 shadow-panel">
      <div className="text-[10px] font-bold uppercase tracking-[.1em] text-copy-subtle">
        {point.stage}
      </div>
      <div className="mt-1 text-[14px] font-semibold text-copy-strong">
        {point.leads.toLocaleString()} leads
      </div>
    </div>
  );
}

function AcquisitionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SourcePoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const rate = point.leads ? Math.round((point.qualified / point.leads) * 100) : 0;

  return (
    <div className="dashboard-chart-tooltip min-w-[170px] rounded-ui border border-line bg-surface px-3 py-2.5 shadow-panel">
      <div className="text-[10px] font-bold uppercase tracking-[.1em] text-copy-subtle">
        {point.source}
      </div>
      <div className="mt-1 text-[14px] font-semibold text-copy-strong">
        {point.leads.toLocaleString()} leads
      </div>
      <div className="mt-0.5 text-[12px] text-copy-muted">
        {point.qualified.toLocaleString()} qualified · {rate}% quality
      </div>
    </div>
  );
}
