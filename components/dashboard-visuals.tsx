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
  "#C4B5FD",
  "#A78BFA",
  "#8B5CF6",
  "#7C3AED",
  "#6D4CFF",
  "#5B35E8",
  "#4C2BC7",
];

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
    <section className="dashboard-visuals overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,.03),0_10px_28px_rgba(15,23,42,.045)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.13em] text-[#6D4CFF]">
            <Sparkles size={13} />
            Performance intelligence
          </div>
          <div className="mt-1 text-lg font-semibold tracking-[-.02em] text-slate-900">
            Admissions pulse
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
            A visual read on pipeline shape, acquisition quality and overall
            conversion.
          </p>
        </div>

        <div className="inline-flex self-start rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setView("pipeline")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
              view === "pipeline"
                ? "bg-white text-[#6D4CFF] shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Activity size={14} />
            Pipeline
          </button>
          <button
            type="button"
            onClick={() => setView("acquisition")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
              view === "acquisition"
                ? "bg-white text-[#6D4CFF] shadow-sm"
                : "text-slate-500 hover:text-slate-800"
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
                <BarChart
                  data={pipeline}
                  margin={{ top: 10, right: 10, left: -12, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="rgba(148,163,184,.18)"
                  />
                  <XAxis
                    dataKey="stage"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#94A3B8", fontSize: 11, fontWeight: 500 }}
                    interval={0}
                    height={46}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={34}
                    tick={{ fill: "#94A3B8", fontSize: 11 }}
                  />
                  <Tooltip
                    content={<PipelineTooltip />}
                    cursor={{ fill: "rgba(109,76,255,.035)" }}
                  />
                  <Bar
                    dataKey="leads"
                    radius={[9, 9, 4, 4]}
                    maxBarSize={58}
                    animationDuration={700}
                  >
                    {pipeline.map((entry, index) => (
                      <Cell
                        key={`${entry.stage}-${index}`}
                        fill={PIPELINE_COLORS[index % PIPELINE_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={acquisition}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 14, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="rgba(148,163,184,.16)"
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#94A3B8", fontSize: 11 }}
                  />
                  <YAxis
                    dataKey="source"
                    type="category"
                    width={90}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748B", fontSize: 11, fontWeight: 500 }}
                  />
                  <Tooltip
                    content={<AcquisitionTooltip />}
                    cursor={{ fill: "rgba(109,76,255,.035)" }}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: 11,
                      color: "#64748B",
                      paddingTop: 8,
                    }}
                  />
                  <Bar
                    dataKey="leads"
                    name="Leads"
                    fill="#C4B5FD"
                    radius={[0, 8, 8, 0]}
                    maxBarSize={20}
                    animationDuration={650}
                  />
                  <Bar
                    dataKey="qualified"
                    name="Qualified+"
                    fill="#6D4CFF"
                    radius={[0, 8, 8, 0]}
                    maxBarSize={20}
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-1 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
            <MiniMetric label="Active pipeline" value={activePipeline} />
            <MiniMetric label="Qualified+" value={qualified} />
            <MiniMetric label="Priority" value={priority} accent />
          </div>
        </div>

        <div className="dashboard-conversion-panel border-t border-slate-100 p-5 lg:border-l lg:border-t-0">
          <div className="text-[10px] font-semibold uppercase tracking-[.13em] text-slate-400">
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
                  <Cell fill="var(--dashboard-chart-accent, #6D4CFF)" />
                  <Cell fill="var(--dashboard-ring-track, #E9E7F5)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-3xl font-semibold tracking-[-.04em] text-slate-900">
                  {total ? `${enrollmentRate}%` : "—"}
                </div>
                <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[.08em] text-slate-400">
                  Enrolled
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-2.5">
            <RateRow label="Qualification" value={qualificationRate} />
            <RateRow label="Enrollment" value={enrollmentRate} strong />
          </div>

          <div className="dashboard-enrollment-card mt-4 rounded-xl border border-violet-100 bg-violet-50/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-violet-600">
                  Enrolled leads
                </div>
                <div className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                  {enrolled.toLocaleString()}
                </div>
              </div>
              <div className="dashboard-enrollment-icon grid h-9 w-9 place-items-center rounded-xl bg-white text-[#6D4CFF] shadow-sm">
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
    <div className="dashboard-mini-metric rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[.09em] text-slate-400">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold tracking-tight ${accent ? "text-[#6D4CFF]" : "text-slate-900"}`}
      >
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
        <span className="font-semibold text-slate-500">{label}</span>
        <span
          className={`font-semibold ${strong ? "text-[#6D4CFF]" : "text-slate-800"}`}
        >
          {value}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
        <div
          className={
            strong
              ? "h-full rounded-full bg-[#6D4CFF]"
              : "h-full rounded-full bg-[#8B5CF6]"
          }
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
    <div className="dashboard-chart-tooltip min-w-[140px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
      <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-slate-400">
        {point.stage}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900">
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

  const rate = point.leads
    ? Math.round((point.qualified / point.leads) * 100)
    : 0;

  return (
    <div className="dashboard-chart-tooltip min-w-[170px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
      <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-slate-400">
        {point.source}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900">
        {point.leads.toLocaleString()} leads
      </div>
      <div className="mt-0.5 text-xs text-slate-500">
        {point.qualified.toLocaleString()} qualified · {rate}% quality
      </div>
    </div>
  );
}
