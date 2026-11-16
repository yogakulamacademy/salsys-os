"use client";

import { BarChart3 } from "lucide-react";
import { useState } from "react";

import { Panel, Segmented } from "@/components/home/command-center/panel";
import { HomeEmptyState } from "@/components/home/home-empty-state";
import type { Chip } from "@/lib/home-command-center";

export type LeadActivityPoint = {
  label: string;
  current: number;
  previous: number;
};

const X0 = 40;
const X1 = 632;
const Y_TOP = 16;
const Y_BASE = 168;

function path(values: number[], top: number) {
  const step = values.length > 1 ? (X1 - X0) / (values.length - 1) : 0;
  return values
    .map((value, index) => {
      const y = Y_BASE - (Math.max(0, value) / top) * (Y_BASE - Y_TOP);
      return `${index ? "L" : "M"}${(X0 + index * step).toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function LeadActivityPanel({
  points,
  total,
  previousTotal,
  chip,
  periodLabel,
  available,
}: {
  points: LeadActivityPoint[];
  total: number | null;
  previousTotal: number | null;
  chip: Chip;
  periodLabel: string;
  available: boolean;
}) {
  const [mode, setMode] = useState<"current" | "compare">("current");
  const current = points.map((point) => point.current);
  const previous = points.map((point) => point.previous);
  const max = Math.max(4, ...current, ...(mode === "compare" ? previous : []));
  const top = Math.ceil(max / 10) * 10;
  const line = path(current, top);
  const area = points.length ? `${line} L${X1} ${Y_BASE} L${X0} ${Y_BASE} Z` : "";
  const tickEvery = Math.max(1, Math.ceil(points.length / 6));
  const step = points.length > 1 ? (X1 - X0) / (points.length - 1) : 0;

  return (
    <Panel
      id="home-lead-activity"
      icon={<BarChart3 size={19} />}
      title="Lead activity"
      badge={available ? chip : null}
      controls={
        <Segmented
          label="Chart comparison"
          value={mode}
          onChange={setMode}
          options={[
            { value: "current", label: "This period" },
            { value: "compare", label: "vs previous" },
          ]}
        />
      }
      className="flex-[999_1_600px]"
    >
      <div data-testid="home-lead-activity" className="flex min-w-0 flex-col gap-3">
      {available && points.length ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[26px] font-extrabold tabular-nums text-copy-strong">{(total ?? 0).toLocaleString("en-IN")}</span>
            <span className="text-[13px] text-copy-muted">new leads · {periodLabel}</span>
            {mode === "compare" && previousTotal != null ? (
              <span className="text-[13px] text-copy-subtle">previous: {previousTotal.toLocaleString("en-IN")}</span>
            ) : null}
          </div>
          <svg
            viewBox="0 0 640 196"
            role="img"
            aria-label={`New leads per interval, ${periodLabel}, peak ${Math.max(0, ...current)}`}
            className="block h-auto w-full"
          >
            {[Y_TOP, (Y_TOP + Y_BASE) / 2].map((y) => (
              <line key={y} x1={X0} x2={640} y1={y} y2={y} className="stroke-line" />
            ))}
            <line x1={X0} x2={640} y1={Y_BASE} y2={Y_BASE} className="stroke-line-strong" />
            <text x={32} y={Y_TOP + 4} textAnchor="end" fontSize="11" className="fill-copy-subtle">{top}</text>
            <text x={32} y={(Y_TOP + Y_BASE) / 2 + 4} textAnchor="end" fontSize="11" className="fill-copy-subtle">{top / 2}</text>
            <text x={32} y={Y_BASE + 4} textAnchor="end" fontSize="11" className="fill-copy-subtle">0</text>
            <path d={area} className="fill-brand-50" />
            {mode === "compare" ? (
              <path d={path(previous, top)} fill="none" className="stroke-copy-subtle" strokeWidth="2" strokeDasharray="5 5" />
            ) : null}
            <path d={line} fill="none" className="stroke-brand-700" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((point, index) =>
              (points.length - 1 - index) % tickEvery === 0 ? (
                <text key={point.label + index} x={X0 + index * step} y={190} textAnchor="middle" fontSize="11" className="fill-copy-subtle">
                  {point.label}
                </text>
              ) : null,
            )}
          </svg>
        </>
      ) : (
        <HomeEmptyState
          variant="activity"
          compact
          unavailable
          title="Selected-period lead evidence is unavailable"
          description="No trend is drawn without period evidence."
        />
      )}
      </div>
    </Panel>
  );
}
