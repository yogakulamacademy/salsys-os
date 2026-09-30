"use client";

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

import type { TeamPerformanceEmployee } from "@/lib/team-performance-data";

function shortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length <= 2) {
    return name;
  }

  return `${parts[0]} ${parts[1][0]}.`;
}

function TooltipCard({
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
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="min-w-[180px] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl">
      <div className="text-xs font-bold text-slate-900">{label}</div>

      <div className="mt-2 space-y-1.5">
        {payload.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-6 text-xs"
          >
            <span className="text-slate-500">{item.name}</span>

            <span className="font-bold text-slate-900">
              {Number(item.value ?? 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TeamPerformanceInsights({
  employees,
}: {
  employees: TeamPerformanceEmployee[];
}) {
  const workloadData = employees.map((employee) => ({
    name: shortName(employee.employeeName),
    assigned: employee.currentActiveLeads,
    worked: employee.leadsWorked,
    outbound: employee.outboundInteractions,
    followups: employee.followupsCompleted,
  }));

  const progressionData = employees.map((employee) => ({
    name: shortName(employee.employeeName),
    qualified: employee.movedQualified,
    highIntent: employee.movedHighIntent,
    paymentPending: employee.movedPaymentPending,
    enrolled: employee.enrolledByEmployee,
  }));

  if (!employees.length) {
    return null;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <div className="text-sm font-black tracking-tight text-slate-950">
            Workload vs work completed
          </div>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Current active portfolio compared with leads worked, outbound
            interactions and completed follow-ups in the selected period.
          </p>
        </div>

        <div className="mt-5 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={workloadData}
              margin={{
                top: 8,
                right: 8,
                left: -18,
                bottom: 4,
              }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />

              <XAxis
                dataKey="name"
                tick={{
                  fontSize: 11,
                  fill: "#64748b",
                }}
                axisLine={false}
                tickLine={false}
              />

              <YAxis
                allowDecimals={false}
                tick={{
                  fontSize: 11,
                  fill: "#94a3b8",
                }}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip content={<TooltipCard />} />

              <Legend
                wrapperStyle={{
                  fontSize: 11,
                  paddingTop: 12,
                }}
              />

              <Bar
                dataKey="assigned"
                name="Active portfolio"
                fill="#103859"
                radius={[6, 6, 0, 0]}
              />

              <Bar
                dataKey="worked"
                name="Leads worked"
                fill="#ec8316"
                radius={[6, 6, 0, 0]}
              />

              <Bar
                dataKey="outbound"
                name="Outbound"
                fill="#64748b"
                radius={[6, 6, 0, 0]}
              />

              <Bar
                dataKey="followups"
                name="Follow-ups"
                fill="#94a3b8"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <div className="text-sm font-black tracking-tight text-slate-950">
            Pipeline progression
          </div>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Stage transitions performed by each team member during the selected
            reporting period.
          </p>
        </div>

        <div className="mt-5 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={progressionData}
              margin={{
                top: 8,
                right: 8,
                left: -18,
                bottom: 4,
              }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />

              <XAxis
                dataKey="name"
                tick={{
                  fontSize: 11,
                  fill: "#64748b",
                }}
                axisLine={false}
                tickLine={false}
              />

              <YAxis
                allowDecimals={false}
                tick={{
                  fontSize: 11,
                  fill: "#94a3b8",
                }}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip content={<TooltipCard />} />

              <Legend
                wrapperStyle={{
                  fontSize: 11,
                  paddingTop: 12,
                }}
              />

              <Bar
                dataKey="qualified"
                name="Qualified"
                fill="#103859"
                radius={[6, 6, 0, 0]}
              />

              <Bar
                dataKey="highIntent"
                name="High intent"
                fill="#475569"
                radius={[6, 6, 0, 0]}
              />

              <Bar
                dataKey="paymentPending"
                name="Payment pending"
                fill="#ec8316"
                radius={[6, 6, 0, 0]}
              />

              <Bar
                dataKey="enrolled"
                name="Enrolled"
                fill="#16a34a"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
