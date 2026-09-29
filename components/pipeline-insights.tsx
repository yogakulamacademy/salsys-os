'use client';

import {
  useMemo,
  useState,
} from 'react';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  BarChart3,
  Clock3,
  Percent,
} from 'lucide-react';


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


export function PipelineInsights({
  data,
  agingData,
}: {
  data: PipelineInsightPoint[];
  agingData: PipelineAgingPoint[];
}) {
  const [
    view,
    setView,
  ] = useState<
    'distribution' |
    'aging'
  >(
    'distribution'
  );

  const [
    mode,
    setMode,
  ] = useState<
    'count' |
    'share'
  >(
    'count'
  );

  const total =
    useMemo(
      () =>
        data.reduce(
          (
            sum,
            item
          ) =>
            sum +
            item.leads,
          0
        ),
      [
        data,
      ]
    );

  const chartData =
    useMemo(
      () =>
        data.map(
          (
            item
          ) => ({
            ...item,
            share:
              total >
              0
                ? Math.round(
                    (
                      item.leads /
                      total
                    ) *
                      1000
                  ) /
                  10
                : 0,
          })
        ),
      [
        data,
        total,
      ]
    );

  const totalStuck =
    agingData.reduce(
      (
        sum,
        item
      ) =>
        sum +
        item.stuck,
      0
    );

  const totalWarning =
    agingData.reduce(
      (
        sum,
        item
      ) =>
        sum +
        item.warning,
      0
    );

  return (
    <section className="card-pad overflow-hidden">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">
            Pipeline intelligence
          </div>

          <div className="section-title mt-1">
            {view ===
            'distribution'
              ? 'Stage distribution'
              : 'Stage aging'}
          </div>

          <p className="mt-1 text-xs leading-5 text-slate-400">
            {view ===
            'distribution'
              ? 'Current lead distribution across the active funnel. Hover for exact values.'
              : 'Median and oldest time currently spent in each stage, backed by audited stage history.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={
                () =>
                  setView(
                    'distribution'
                  )
              }
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                view ===
                'distribution'
                  ? 'bg-white text-brand shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <BarChart3
                size={14}
              />
              Distribution
            </button>

            <button
              type="button"
              onClick={
                () =>
                  setView(
                    'aging'
                  )
              }
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                view ===
                'aging'
                  ? 'bg-white text-brand shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Clock3
                size={14}
              />
              Stage aging
            </button>
          </div>

          {view ===
            'distribution' && (
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={
                  () =>
                    setMode(
                      'count'
                    )
                }
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  mode ===
                  'count'
                    ? 'bg-white text-brand shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <BarChart3
                  size={14}
                />
                Count
              </button>

              <button
                type="button"
                onClick={
                  () =>
                    setMode(
                      'share'
                    )
                }
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  mode ===
                  'share'
                    ? 'bg-white text-brand shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Percent
                  size={14}
                />
                Share
              </button>
            </div>
          )}
        </div>
      </div>

      {view ===
      'distribution' ? (
        <>
          <div className="h-[310px] w-full">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={
                  chartData
                }
                margin={{
                  top: 8,
                  right: 8,
                  left: -14,
                  bottom: 10,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={
                    false
                  }
                  stroke="rgba(148,163,184,.18)"
                />

                <XAxis
                  dataKey="stage"
                  tickLine={
                    false
                  }
                  axisLine={
                    false
                  }
                  interval={0}
                  height={48}
                  tick={{
                    fontSize: 10,
                    fill: '#7c8aa0',
                  }}
                />

                <YAxis
                  allowDecimals={
                    mode ===
                    'share'
                  }
                  tickLine={
                    false
                  }
                  axisLine={
                    false
                  }
                  unit={
                    mode ===
                    'share'
                      ? '%'
                      : undefined
                  }
                  tick={{
                    fontSize: 11,
                    fill: '#7c8aa0',
                  }}
                />

                <Tooltip
                  cursor={{
                    fill:
                      'rgba(148,163,184,.08)',
                  }}
                  content={
                    <PipelineDistributionTooltip />
                  }
                />

                <Bar
                  dataKey={
                    mode ===
                    'count'
                      ? 'leads'
                      : 'share'
                  }
                  name={
                    mode ===
                    'count'
                      ? 'Leads'
                      : 'Share'
                  }
                  fill="#103859"
                  radius={[
                    7,
                    7,
                    3,
                    3,
                  ]}
                  animationDuration={
                    650
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-400">
            This chart shows where leads are{' '}
            <strong>
              currently
            </strong>{' '}
            sitting. It does not calculate true stage-to-stage conversion; use the Funnel page for audited conversion analysis.
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-wide text-amber-600">
                Warning
              </div>

              <div className="mt-1 text-xl font-black text-amber-800">
                {
                  totalWarning
                }
              </div>

              <div className="mt-1 text-[10px] text-amber-600">
                Leads approaching their stuck threshold
              </div>
            </div>

            <div className="rounded-xl border border-red-100 bg-red-50/70 px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-wide text-red-600">
                Stuck
              </div>

              <div className="mt-1 text-xl font-black text-red-800">
                {
                  totalStuck
                }
              </div>

              <div className="mt-1 text-[10px] text-red-600">
                Leads beyond their configured stage limit
              </div>
            </div>
          </div>

          <div className="h-[310px] w-full">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={
                  agingData
                }
                margin={{
                  top: 8,
                  right: 8,
                  left: -10,
                  bottom: 10,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={
                    false
                  }
                  stroke="rgba(148,163,184,.18)"
                />

                <XAxis
                  dataKey="stage"
                  tickLine={
                    false
                  }
                  axisLine={
                    false
                  }
                  interval={0}
                  height={48}
                  tick={{
                    fontSize: 10,
                    fill: '#7c8aa0',
                  }}
                />

                <YAxis
                  tickLine={
                    false
                  }
                  axisLine={
                    false
                  }
                  unit="d"
                  tick={{
                    fontSize: 11,
                    fill: '#7c8aa0',
                  }}
                />

                <Tooltip
                  cursor={{
                    fill:
                      'rgba(148,163,184,.08)',
                  }}
                  content={
                    <PipelineAgingTooltip />
                  }
                />

                <Legend
                  wrapperStyle={{
                    fontSize:
                      '11px',
                  }}
                />

                <Bar
                  dataKey="medianDays"
                  name="Median days"
                  fill="#103859"
                  radius={[
                    6,
                    6,
                    2,
                    2,
                  ]}
                  animationDuration={
                    650
                  }
                />

                <Bar
                  dataKey="oldestDays"
                  name="Oldest days"
                  fill="#ec8316"
                  radius={[
                    6,
                    6,
                    2,
                    2,
                  ]}
                  animationDuration={
                    750
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {agingData.map(
              (
                stage
              ) => (
                <div
                  key={
                    stage.stage
                  }
                  className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"
                >
                  <div className="text-[10px] font-black text-slate-700">
                    {
                      stage.stage
                    }
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[9px] font-semibold text-slate-400">
                    <span>
                      Median
                    </span>
                    <strong className="text-slate-700">
                      {formatAge(
                        stage.medianDays
                      )}
                    </strong>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[9px] font-semibold text-slate-400">
                    <span>
                      Oldest
                    </span>
                    <strong className="text-slate-700">
                      {formatAge(
                        stage.oldestDays
                      )}
                    </strong>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {stage.warning >
                      0 && (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[8px] font-black text-amber-700">
                        {
                          stage.warning
                        }{' '}
                        warning
                      </span>
                    )}

                    {stage.stuck >
                      0 && (
                      <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[8px] font-black text-red-700">
                        {
                          stage.stuck
                        }{' '}
                        stuck
                      </span>
                    )}

                    {stage.warning ===
                      0 &&
                      stage.stuck ===
                        0 && (
                      <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[8px] font-black text-emerald-700">
                        Healthy
                      </span>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </>
      )}
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
  if (
    !active ||
    !payload?.length
  ) {
    return null;
  }

  const point =
    payload[
      0
    ]?.payload;

  if (!point) {
    return null;
  }

  return (
    <div className="min-w-[150px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
      <div className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
        {
          point.stage
        }
      </div>

      <div className="mt-1 text-sm font-bold text-slate-900">
        {point.leads.toLocaleString()}{' '}
        leads
      </div>

      <div className="mt-0.5 text-xs text-slate-500">
        {
          point.share
        }
        % of active pipeline
      </div>
    </div>
  );
}


function PipelineAgingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: PipelineAgingPoint;
  }>;
}) {
  if (
    !active ||
    !payload?.length
  ) {
    return null;
  }

  const point =
    payload[
      0
    ]?.payload;

  if (!point) {
    return null;
  }

  return (
    <div className="min-w-[180px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
      <div className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
        {
          point.stage
        }
      </div>

      <div className="mt-2 space-y-1 text-xs">
        <TooltipRow
          label="Median"
          value={
            formatAge(
              point.medianDays
            )
          }
        />

        <TooltipRow
          label="Oldest"
          value={
            formatAge(
              point.oldestDays
            )
          }
        />

        <TooltipRow
          label="Healthy"
          value={String(
            point.healthy
          )}
        />

        <TooltipRow
          label="Warning"
          value={String(
            point.warning
          )}
        />

        <TooltipRow
          label="Stuck"
          value={String(
            point.stuck
          )}
        />
      </div>
    </div>
  );
}


function TooltipRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-slate-400">
        {label}
      </span>

      <strong className="text-slate-800">
        {value}
      </strong>
    </div>
  );
}


function formatAge(
  days: number
) {
  if (
    days <
    1
  ) {
    return `${Math.max(
      0,
      Math.round(
        days * 24
      )
    )}h`;
  }

  if (
    days <
    10
  ) {
    return `${days.toFixed(
      1
    )}d`;
  }

  return `${Math.round(
    days
  )}d`;
}
