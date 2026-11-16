"use client";

import { CircleCheck } from "lucide-react";
import { useState } from "react";

import { Panel } from "@/components/home/command-center/panel";

export type SourceQualityRow = {
  source: string;
  leads: number;
  qualified: number;
};

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function rate(row: SourceQualityRow) {
  return row.leads > 0 ? row.qualified / row.leads : 0;
}

function formatRate(value: number) {
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}

/**
 * Period-cohort qualification by source. Rows come from the reconciled
 * qualification history; when that is unavailable the panel says so rather
 * than falling back to present-day stages.
 */
export function SourceQualityPanel({ rows, href }: { rows: SourceQualityRow[] | null; href: string }) {
  const visible = (rows ?? []).filter((row) => row.leads > 0).sort((a, b) => b.leads - a.leads).slice(0, 5);
  const [selected, setSelected] = useState(visible[0]?.source ?? "");
  const picked = visible.find((row) => row.source === selected) ?? visible[0];
  const maxRate = Math.max(0.05, ...visible.map(rate));

  return (
    <Panel
      id="home-source-quality"
      icon={<CircleCheck size={19} />}
      title="Lead quality by source"
      action={{ href, label: "Sources" }}
      className="flex-[1_1_320px]"
    >
      {picked ? (
        <>
          <div className="flex items-center gap-3.5">
            <div className="relative h-[104px] w-[104px] shrink-0">
              <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
                <circle cx="52" cy="52" r={RADIUS} fill="none" strokeWidth="10" className="stroke-brand-50" />
                <circle
                  cx="52"
                  cy="52"
                  r={RADIUS}
                  fill="none"
                  strokeWidth="10"
                  strokeLinecap="round"
                  className="stroke-brand-700"
                  strokeDasharray={`${(Math.max(rate(picked) ? 0.02 : 0, rate(picked)) * CIRCUMFERENCE).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`}
                  transform="rotate(-90 52 52)"
                />
              </svg>
              <div className="absolute inset-0 grid place-content-center text-center">
                <span className="text-xl font-extrabold text-copy-strong">{formatRate(rate(picked))}</span>
                <span className="text-[11px] text-copy-muted">qualified</span>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[15px] font-bold text-copy-strong">{picked.source}</span>
              <span className="text-[13px] text-copy-muted">
                {picked.qualified.toLocaleString("en-IN")} of {picked.leads.toLocaleString("en-IN")} leads
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            {visible.map((row) => {
              const active = row.source === picked.source;
              const width = rate(row) > 0 ? Math.max(3, (rate(row) / maxRate) * 100) : 0;
              return (
                <button
                  key={row.source}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelected(row.source)}
                  className={`grid min-h-[34px] grid-cols-[88px_minmax(0,1fr)_48px] items-center gap-2.5 rounded-[10px] px-2 text-left transition focus-visible:outline-2 focus-visible:outline-brand-700 ${active ? "bg-brand-50" : "hover:bg-surface-soft"}`}
                >
                  <span className="truncate text-[13px] font-semibold text-copy-strong">{row.source}</span>
                  <span className="block h-2 overflow-hidden rounded-full bg-brand-50">
                    <span className={`block h-full rounded-full ${active ? "bg-brand-700" : "bg-brand-100"}`} style={{ width: `${width}%` }} />
                  </span>
                  <span className="text-right text-[13px] font-bold tabular-nums text-copy-strong">{formatRate(rate(row))}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="rounded-xl bg-brand-50 px-3 py-6 text-center text-[13px] text-copy-muted">
          Qualification history by source is unavailable for this period.
        </p>
      )}
    </Panel>
  );
}
