'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Megaphone } from 'lucide-react';

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

export function DashboardInsights({
  pipeline,
  sources,
}: {
  pipeline: PipelinePoint[];
  sources: SourcePoint[];
}) {
  const [view, setView] = useState<'pipeline' | 'acquisition'>('pipeline');

  const acquisition = useMemo(
    () =>
      [...sources]
        .sort((a, b) => b.leads - a.leads)
        .slice(0, 7),
    [sources]
  );

  return (
    <section className="card-pad overflow-hidden">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Performance</div>
          <div className="section-title mt-1">Growth overview</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Hover over the chart for exact values. Switch views to compare funnel
            volume and acquisition quality.
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setView('pipeline')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
              view === 'pipeline'
                ? 'bg-white text-brand shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity size={14} />
            Pipeline
          </button>

          <button
            type="button"
            onClick={() => setView('acquisition')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
              view === 'acquisition'
                ? 'bg-white text-brand shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Megaphone size={14} />
            Acquisition
          </button>
        </div>
      </div>

      <div className="h-[330px] w-full">
        {view === 'pipeline' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={pipeline}
              margin={{ top: 10, right: 8, left: -14, bottom: 4 }}
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
                tick={{ fontSize: 11, fill: '#7c8aa0' }}
                interval={0}
                height={46}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#7c8aa0' }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,.08)' }}
                content={<PipelineTooltip />}
              />
              <Bar
                dataKey="leads"
                name="Leads"
                fill="#103859"
                radius={[7, 7, 3, 3]}
                animationDuration={650}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : acquisition.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={acquisition}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke="rgba(148,163,184,.18)"
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#7c8aa0' }}
              />
              <YAxis
                type="category"
                dataKey="source"
                width={112}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#7c8aa0' }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,.08)' }}
                content={<SourceTooltip />}
              />
              <Bar
                dataKey="leads"
                name="Leads"
                fill="#103859"
                radius={[0, 6, 6, 0]}
                animationDuration={650}
              />
              <Bar
                dataKey="qualified"
                name="Qualified+"
                fill="#ec8316"
                radius={[0, 6, 6, 0]}
                animationDuration={750}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
            No attribution data yet.
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 text-[11px] font-semibold text-slate-500">
        {view === 'pipeline' ? (
          <>
            <LegendDot color="#103859" label="Leads by current funnel stage" />
            <span className="text-slate-400">
              Use Funnel for full stage-to-stage analysis.
            </span>
          </>
        ) : (
          <>
            <LegendDot color="#103859" label="Leads" />
            <LegendDot color="#ec8316" label="Qualified+" />
            <span className="text-slate-400">
              Top sources by loaded lead volume.
            </span>
          </>
        )}
      </div>
    </section>
  );
}

function LegendDot({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function PipelineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    value?: number;
    payload?: PipelinePoint;
  }>;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
      <div className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
        {point.stage}
      </div>
      <div className="mt-1 text-sm font-bold text-slate-900">
        {Number(point.leads ?? 0).toLocaleString()} leads
      </div>
    </div>
  );
}

function SourceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    value?: number;
    dataKey?: string;
    payload?: SourcePoint;
  }>;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  const rate =
    point.leads > 0
      ? Math.round((point.qualified / point.leads) * 100)
      : 0;

  return (
    <div className="min-w-[170px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
      <div className="text-sm font-bold text-slate-900">{point.source}</div>

      <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 text-xs">
        <span className="text-slate-400">Leads</span>
        <span className="text-right font-semibold text-slate-700">
          {point.leads.toLocaleString()}
        </span>

        <span className="text-slate-400">Qualified+</span>
        <span className="text-right font-semibold text-slate-700">
          {point.qualified.toLocaleString()}
        </span>

        <span className="text-slate-400">Qualification</span>
        <span className="text-right font-semibold text-slate-700">
          {rate}%
        </span>

        <span className="text-slate-400">Lead share</span>
        <span className="text-right font-semibold text-slate-700">
          {point.share}%
        </span>
      </div>
    </div>
  );
}
