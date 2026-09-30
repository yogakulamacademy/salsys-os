'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type {
  TeamAssignmentFairnessEmployee,
} from '@/lib/team-performance-data';

function shortName(
  name: string
) {
  const parts =
    name
      .trim()
      .split(
        /\s+/
      )
      .filter(
        Boolean
      );

  if (
    parts.length <=
    2
  ) {
    return name;
  }

  return `${parts[0]} ${parts[1][0]}.`;
}

function AssignmentTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
  }>;
  label?: string;
}) {
  if (
    !active ||
    !payload?.length
  ) {
    return null;
  }

  return (
    <div className="min-w-[190px] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl">
      <div className="text-xs font-black text-slate-900">
        {label}
      </div>

      <div className="mt-2 space-y-1.5">
        {payload.map(
          (
            item
          ) => (
            <div
              key={
                item.name
              }
              className="flex items-center justify-between gap-6 text-xs"
            >
              <span className="text-slate-500">
                {item.name}
              </span>

              <span className="font-black text-slate-900">
                {Number(
                  item.value ??
                    0
                ).toLocaleString()}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export function TeamAssignmentInsights({
  employees,
  recordedAssignments,
}: {
  employees: TeamAssignmentFairnessEmployee[];
  recordedAssignments: number;
}) {
  if (
    !employees.length
  ) {
    return null;
  }

  const expectedCount =
    employees.length >
      0
      ? recordedAssignments /
        employees.length
      : 0;

  const data =
    employees.map(
      (
        employee
      ) => ({
        name:
          shortName(
            employee.employeeName
          ),

        received:
          employee.assignmentsReceived,

        current:
          employee.currentActiveOwned,

        transfersIn:
          employee.transfersIn,

        transfersOut:
          employee.transfersOut,
      })
    );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-black tracking-tight text-slate-950">
            Assignment distribution
          </div>

          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            Recorded assignments received during the selected period compared
            with current active ownership. The dashed reference is the simple
            equal-count baseline, not a performance target.
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
          Equal-count baseline:
          {' '}
          {expectedCount.toFixed(
            1
          )}
          {' '}
          assignments
        </div>
      </div>

      <div className="mt-5 h-[320px]">
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <BarChart
            data={
              data
            }
            margin={{
              top:
                8,
              right:
                8,
              left:
                -18,
              bottom:
                4,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={
                false
              }
              stroke="#e2e8f0"
            />

            <XAxis
              dataKey="name"
              tick={{
                fontSize:
                  11,
                fill:
                  '#64748b',
              }}
              axisLine={
                false
              }
              tickLine={
                false
              }
            />

            <YAxis
              allowDecimals={
                false
              }
              tick={{
                fontSize:
                  11,
                fill:
                  '#94a3b8',
              }}
              axisLine={
                false
              }
              tickLine={
                false
              }
            />

            <Tooltip
              content={
                <AssignmentTooltip />
              }
            />

            <Legend
              wrapperStyle={{
                fontSize:
                  11,
                paddingTop:
                  12,
              }}
            />

            <ReferenceLine
              y={
                expectedCount
              }
              stroke="#94a3b8"
              strokeDasharray="5 5"
            />

            <Bar
              dataKey="received"
              name="Assignments received"
              fill="#103859"
              radius={[
                6,
                6,
                0,
                0,
              ]}
            />

            <Bar
              dataKey="current"
              name="Active owned now"
              fill="#ec8316"
              radius={[
                6,
                6,
                0,
                0,
              ]}
            />

            <Bar
              dataKey="transfersIn"
              name="Transfers in"
              fill="#64748b"
              radius={[
                6,
                6,
                0,
                0,
              ]}
            />

            <Bar
              dataKey="transfersOut"
              name="Transfers out"
              fill="#cbd5e1"
              radius={[
                6,
                6,
                0,
                0,
              ]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
