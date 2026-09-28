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
import { BarChart3, Percent } from 'lucide-react';

export type PipelineInsightPoint = {
  stage: string;
  leads: number;
};

export function PipelineInsights({
  data,
}: {
  data: PipelineInsightPoint[];
}) {
  const [mode, setMode] = useState<'count' | 'share'>('count');

  const total = useMemo(
    () => data.reduce((sum, item) => sum + item.leads, 0),
    [data]
  );

  const chartData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        share: total > 0 ? Math.round((item.leads / total) * 1000) / 10 : 0,
      })),
    [data, total]
  );

  return (
    <section className="card-pad overflow-hidden">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Pipeline intelligence</div>
          <div className="section-title mt-1">Stage distribution</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Current lead distribution across the active funnel. Hover for exact values.
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setMode('count')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
              mode === 'count'
                ? 'bg-white text-brand shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart3 size={14} />
            Count
          </button>

          <button
            type="button"
            onClick={() => setMode('share')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
              mode === 'share'
                ? 'bg-white text-brand shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Percent size={14} />
            Share
          </button>
        </div>
      </div>

      <div className="h-[310px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, left: -14, bottom: 10 }}
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
              interval={0}
              height={48}
              tick={{ fontSize: 10, fill: '#7c8aa0' }}
            />

            <YAxis
              allowDecimals={mode === 'share'}
              tickLine={false}
              axisLine={false}
              unit={mode === 'share' ? '%' : undefined}
              tick={{ fontSize: 11, fill: '#7c8aa0' }}
            />

            <Tooltip
              cursor={{ fill: 'rgba(148,163,184,.08)' }}
              content={<PipelineDistributionTooltip />}
            />

            <Bar
              dataKey={mode === 'count' ? 'leads' : 'share'}
              name={mode === 'count' ? 'Leads' : 'Share'}
              fill="#103859"
              radius={[7, 7, 3, 3]}
              animationDuration={650}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-400">
        This chart shows where leads are <strong>currently</strong> sitting. It does not
        calculate true stage-to-stage conversion; use the Funnel page for audited
        conversion analysis.
      </div>
    </section>
  );
}

function PipelineDistributionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      stage: string;
      leads: number;
      share: number;
    };
  }>;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="min-w-[150px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
      <div className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
        {point.stage}
      </div>
      <div className="mt-1 text-sm font-bold text-slate-900">
        {point.leads.toLocaleString()} leads
      </div>
      <div className="mt-0.5 text-xs text-slate-500">
        {point.share}% of active pipeline
      </div>
    </div>
  );
}
