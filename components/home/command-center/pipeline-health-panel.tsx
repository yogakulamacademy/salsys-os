import Link from "next/link";
import { Filter, Sparkles } from "lucide-react";

import { Panel } from "@/components/home/command-center/panel";
import { FunnelInsight } from "@/components/home/command-center/story-panels";
import { progressedShare, type HomeStageGroup } from "@/lib/home-stage-groups";

const PIPELINE_HREF = "/admissions?view=pipeline";

function Row({ group, max }: { group: HomeStageGroup; max: number }) {
  const width = group.value > 0 ? Math.max(2, (group.value / max) * 100) : 0;
  return (
    <Link
      href={group.href}
      className="grid min-h-8 grid-cols-[112px_minmax(0,1fr)_52px] items-center gap-2.5 rounded-[10px] px-2 text-left transition hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-brand-700"
      title={`Open the ${group.value.toLocaleString("en-IN")} ${group.label.toLowerCase()} leads`}
    >
      <span className={`text-[13px] font-semibold ${group.parked ? "text-copy-muted" : "text-copy-strong"}`}>{group.label}</span>
      <span className="block h-2 overflow-hidden rounded-full bg-brand-50">
        <span className={`block h-full rounded-full ${group.parked ? "bg-amber-300" : "bg-brand-600"}`} style={{ width: `${width}%` }} />
      </span>
      <span className="text-right text-[13px] font-bold tabular-nums text-copy-strong">{group.value.toLocaleString("en-IN")}</span>
    </Link>
  );
}

export function PipelineHealthPanel({ groups, aiMoves24h, insight }: { groups: HomeStageGroup[]; aiMoves24h?: number | null; insight?: string | null }) {
  const active = groups.filter((g) => !g.parked);
  const parked = groups.filter((g) => g.parked);
  const total = groups.reduce((sum, group) => sum + group.value, 0);
  const max = Math.max(1, ...groups.map((group) => group.value));
  const share = progressedShare(groups);

  return (
    <Panel
      id="home-pipeline-health"
      icon={<Filter size={19} />}
      title="Pipeline health"
      controls={<span className="text-lg font-extrabold tabular-nums text-copy-strong">{total.toLocaleString("en-IN")}</span>}
      className="flex-[1_1_320px]"
    >
      <div className="flex flex-col gap-0.5">
        {active.map((group) => <Row key={group.id} group={group} max={max} />)}
        {parked.length ? <div className="my-1 border-t border-dashed border-line" /> : null}
        {parked.map((group) => <Row key={group.id} group={group} max={max} />)}
      </div>
      <FunnelInsight text={insight ?? null} />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-[13px] text-copy-strong">
        <span>
          {share == null ? "No active leads" : <><strong>{share}%</strong> reached Qualified or beyond</>}
          {aiMoves24h ? (
            <span className="ml-1 inline-flex items-center gap-1 text-copy-muted">
              · <Sparkles size={12} aria-hidden="true" /> {aiMoves24h.toLocaleString("en-IN")} moved by AI today
            </span>
          ) : null}
        </span>
        <Link href={PIPELINE_HREF} className="font-semibold text-brand-700">Open pipeline →</Link>
      </div>
    </Panel>
  );
}
