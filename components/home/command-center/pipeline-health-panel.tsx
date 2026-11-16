"use client";

import Link from "next/link";
import { Filter } from "lucide-react";
import { useState } from "react";

import { Panel } from "@/components/home/command-center/panel";
import type { HomeStageGroup, HomeStageGroupId } from "@/lib/home-stage-groups";

// Stage groups combine CRM stages (e.g. contacted + engaged) and the leads
// filter takes a single stage, so the drilldown opens the pipeline board.
const PIPELINE_HREF = "/admissions?view=pipeline";

export function PipelineHealthPanel({ groups }: { groups: HomeStageGroup[] }) {
  const total = groups.reduce((sum, group) => sum + group.value, 0);
  const largest = groups.reduce((best, group) => (group.value > best.value ? group : best), groups[0]);
  const [selected, setSelected] = useState<HomeStageGroupId>(largest?.id ?? "new");
  const max = Math.max(1, ...groups.map((group) => group.value));
  const picked = groups.find((group) => group.id === selected) ?? groups[0];

  return (
    <Panel
      id="home-pipeline-health"
      icon={<Filter size={19} />}
      title="Pipeline health"
      controls={<span className="text-lg font-extrabold tabular-nums text-copy-strong">{total.toLocaleString("en-IN")}</span>}
      className="flex-[1_1_320px]"
    >
      <div className="flex flex-col gap-1">
        {groups.map((group) => {
          const active = group.id === selected;
          const width = group.value > 0 ? Math.max(2, (group.value / max) * 100) : 0;
          return (
            <button
              key={group.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(group.id)}
              className={`grid min-h-9 grid-cols-[112px_minmax(0,1fr)_52px] items-center gap-2.5 rounded-[10px] px-2 text-left transition focus-visible:outline-2 focus-visible:outline-brand-700 ${active ? "bg-brand-50" : "hover:bg-surface-soft"}`}
            >
              <span className="text-[13px] font-semibold text-copy-strong">{group.label}</span>
              <span className="block h-2 overflow-hidden rounded-full bg-brand-50">
                <span className={`block h-full rounded-full ${active ? "bg-brand-700" : "bg-brand-100"}`} style={{ width: `${width}%` }} />
              </span>
              <span className="text-right text-[13px] font-bold tabular-nums text-copy-strong">{group.value.toLocaleString("en-IN")}</span>
            </button>
          );
        })}
      </div>
      {picked ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-[13px] text-copy-strong">
          <span>
            <strong>{picked.value.toLocaleString("en-IN")}</strong> {picked.label.toLowerCase()} ·{" "}
            {total ? ((picked.value / total) * 100).toFixed(1) : "0.0"}%
          </span>
          <Link href={PIPELINE_HREF} className="font-semibold text-brand-700">Open pipeline →</Link>
        </div>
      ) : null}
    </Panel>
  );
}
