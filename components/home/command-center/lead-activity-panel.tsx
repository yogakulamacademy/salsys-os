"use client";

import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { Panel, Segmented } from "@/components/home/command-center/panel";
import { HomeEmptyState } from "@/components/home/home-empty-state";
import type { Chip } from "@/lib/home-command-center";

export type LeadActivityPoint = {
  label: string;
  current: number;
  previous: number;
  /** Full span of this point, e.g. "28 Oct" or "1 Nov – 3 Nov". */
  range?: string;
  previousRange?: string;
  /** Lead sources for exactly this span. */
  href?: string;
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

function change(now: number, before: number): { text: string; tone: string } | null {
  if (before <= 0) return now > 0 ? { text: "new", tone: "text-emerald-700 dark:text-emerald-300" } : null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: "same as before", tone: "text-copy-muted" };
  return pct > 0
    ? { text: `▲ ${pct}%`, tone: "text-emerald-700 dark:text-emerald-300" }
    : { text: `▼ ${Math.abs(pct)}%`, tone: "text-rose-700 dark:text-rose-300" };
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
  const router = useRouter();
  const plotRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"current" | "compare">("current");
  const [active, setActive] = useState<number | null>(null);
  const pointerType = useRef<string>("mouse");
  const current = points.map((point) => point.current);
  const previous = points.map((point) => point.previous);
  const max = Math.max(4, ...current, ...(mode === "compare" ? previous : []));
  const top = Math.ceil(max / 10) * 10;
  const line = path(current, top);
  const area = points.length ? `${line} L100 100 L0 100 Z` : "";
  const tickEvery = Math.max(1, Math.ceil(points.length / 6));
  const step = points.length > 1 ? 100 / (points.length - 1) : 0;
  const peak = Math.max(0, ...current);
  const peakIndex = current.indexOf(peak);
  const average = points.length ? Math.round(current.reduce((s, v) => s + v, 0) / points.length) : 0;
  const unit = points[0]?.range?.includes("–") ? "interval" : "day";

  const indexAt = (clientX: number) => {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box || points.length < 2) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return Math.round(ratio * (points.length - 1));
  };
  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    pointerType.current = event.pointerType;
    if ((event.target as HTMLElement).closest("a")) return;
    setActive(indexAt(event.clientX));
  };
  // With a mouse a click opens that day's lead sources; on touch the first tap
  // only shows the card (its link opens them).
  const onClick = (event: { target: EventTarget }) => {
    if ((event.target as HTMLElement).closest("a")) return;
    if (pointerType.current === "mouse" && active != null && points[active]?.href) router.push(points[active].href!);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = active ?? points.length - 1;
    if (event.key === "ArrowLeft") { event.preventDefault(); setActive(Math.max(0, at - 1)); }
    else if (event.key === "ArrowRight") { event.preventDefault(); setActive(Math.min(points.length - 1, at + 1)); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(points.length - 1); }
    else if ((event.key === "Enter" || event.key === " ") && active != null && points[active]?.href) { event.preventDefault(); router.push(points[active].href!); }
    else if (event.key === "Escape") setActive(null);
  };

  const shown = active != null ? points[active] : null;
  const x = active != null ? active * step : 0;
  const delta = shown ? change(shown.current, shown.previous) : null;

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
            {peak > 0 ? (
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setActive(peakIndex)}
                  className="rounded-full bg-brand-50 px-2.5 py-1 font-semibold text-brand-800 hover:bg-brand-100"
                >
                  Best {unit}: {points[peakIndex]?.range ?? points[peakIndex]?.label} · {peak.toLocaleString("en-IN")}
                </button>
                <span className="rounded-full bg-surface-soft px-2.5 py-1 font-semibold text-copy-muted">Average {average.toLocaleString("en-IN")} a {unit}</span>
              </div>
            ) : null}
            <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-2">
              <div className="relative h-[220px] text-right text-[11px] tabular-nums text-copy-subtle" aria-hidden="true">
                <span className="absolute right-0 top-0 -translate-y-1/2">{top}</span>
                <span className="absolute right-0 top-1/2 -translate-y-1/2">{top / 2}</span>
                <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
              </div>
              <div
                ref={plotRef}
                tabIndex={0}
                role="group"
                aria-label={`New leads per ${unit}, ${periodLabel}. Use the left and right arrow keys to read each ${unit}; Enter opens its lead sources.`}
                onPointerMove={onPointer}
                onPointerDown={onPointer}
                onPointerLeave={(event) => { if (event.pointerType === "mouse") setActive(null); }}
                onKeyDown={onKey}
                onClick={onClick}
                onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActive(null); }}
                className="relative h-[220px] cursor-pointer touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-700/40"
              >
                <div className="absolute inset-x-0 top-0 border-t border-line" aria-hidden="true" />
                <div className="absolute inset-x-0 top-1/2 border-t border-line" aria-hidden="true" />
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                >
                  <path d={area} className="fill-brand-50" />
                  {mode === "compare" ? (
                    <path d={path(previous, top)} fill="none" className="stroke-copy-subtle" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
                  ) : null}
                  <path d={line} fill="none" className="stroke-brand-700" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="absolute inset-x-0 bottom-0 border-t border-line-strong" aria-hidden="true" />

                {shown ? (
                  <>
                    <div className="pointer-events-none absolute inset-y-0 w-px bg-brand-700/40" style={{ left: `${x}%` }} aria-hidden="true" />
                    {mode === "compare" ? (
                      <span
                        className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-copy-subtle"
                        style={{ left: `${x}%`, top: `${100 - (shown.previous / top) * 100}%` }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span
                      className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand-700 shadow"
                      style={{ left: `${x}%`, top: `${100 - (shown.current / top) * 100}%` }}
                      aria-hidden="true"
                    />
                    <div
                      role="status"
                      aria-live="polite"
                      className="pointer-events-none absolute top-2 z-10 w-[200px] rounded-xl border border-line bg-surface p-3 shadow-panel"
                      style={x > 60 ? { right: `${100 - x}%`, marginRight: 12 } : { left: `${x}%`, marginLeft: 12 }}
                    >
                      <div className="text-xs font-semibold text-copy-muted">{shown.range ?? shown.label}</div>
                      <div className="mt-0.5 flex items-baseline gap-2">
                        <span className="text-xl font-extrabold tabular-nums text-copy-strong">{shown.current.toLocaleString("en-IN")}</span>
                        <span className="text-xs text-copy-muted">new {shown.current === 1 ? "lead" : "leads"}</span>
                      </div>
                      <div className="mt-1 text-xs text-copy-muted">
                        Before ({shown.previousRange ?? "previous period"}): <strong className="text-copy-strong">{shown.previous.toLocaleString("en-IN")}</strong>
                        {delta ? <span className={`ml-1 font-semibold ${delta.tone}`}>{delta.text}</span> : null}
                      </div>
                      {shown.href ? (
                        <Link href={shown.href} className="pointer-events-auto mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline">
                          See where they came from →
                        </Link>
                      ) : null}
                    </div>
                  </>
                ) : null}
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
            <p className="text-[11px] text-copy-subtle">Hover, tap or use the arrow keys to read each {unit}; click to see where those leads came from.</p>
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
