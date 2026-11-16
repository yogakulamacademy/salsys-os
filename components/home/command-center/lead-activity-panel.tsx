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

// The plot is drawn in a fixed 100×100 box stretched to the container, so the
// chart keeps a steady height at every width. Labels are HTML, so text never
// scales with the drawing.
function path(values: number[], top: number) {
  const step = values.length > 1 ? 100 / (values.length - 1) : 0;
  return values
    .map((value, index) => `${index ? "L" : "M"}${(index * step).toFixed(2)} ${(100 - (Math.max(0, value) / top) * 100).toFixed(2)}`)
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
  const area = points.length ? `${line} L100 100 L0 100 Z` : "";
  const tickEvery = Math.max(1, Math.ceil(points.length / 6));
  const step = points.length > 1 ? 100 / (points.length - 1) : 0;
  const peak = Math.max(0, ...current);

  return (
    <Panel
      id="home-lead-activity"
      icon={<BarChart3 size={19} />}
      title="Lead activity"
      badge={available && chip.tone !== "flat" ? chip : null}
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
                <span className="text-[13px] text-copy-subtle">previous period: {previousTotal.toLocaleString("en-IN")}</span>
              ) : null}
            </div>
            <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-2">
              <div className="relative h-[220px] text-right text-[11px] tabular-nums text-copy-subtle" aria-hidden="true">
                <span className="absolute right-0 top-0 -translate-y-1/2">{top}</span>
                <span className="absolute right-0 top-1/2 -translate-y-1/2">{top / 2}</span>
                <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
              </div>
              <div className="relative h-[220px]">
                <div className="absolute inset-x-0 top-0 border-t border-line" aria-hidden="true" />
                <div className="absolute inset-x-0 top-1/2 border-t border-line" aria-hidden="true" />
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`New leads per interval, ${periodLabel}, peak ${peak}`}
                  className="absolute inset-0 h-full w-full overflow-visible"
                >
                  <path d={area} className="fill-brand-50" />
                  {mode === "compare" ? (
                    <path d={path(previous, top)} fill="none" className="stroke-copy-subtle" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
                  ) : null}
                  <path d={line} fill="none" className="stroke-brand-700" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="absolute inset-x-0 bottom-0 border-t border-line-strong" aria-hidden="true" />
              </div>
              <div />
              <div className="relative h-5 text-[11px] text-copy-subtle" aria-hidden="true">
                {points.map((point, index) =>
                  (points.length - 1 - index) % tickEvery === 0 ? (
                    <span
                      key={point.label + index}
                      className={`absolute top-1 whitespace-nowrap ${index === points.length - 1 ? "-translate-x-full" : index === 0 ? "" : "-translate-x-1/2"}`}
                      style={{ left: `${index * step}%` }}
                    >
                      {point.label}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
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
