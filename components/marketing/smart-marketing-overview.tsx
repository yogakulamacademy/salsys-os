"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  CHANNEL_LABEL,
  type BarRow,
  type ChannelKey,
  type FilterKey,
  type MarketingStory,
  type MarketingView,
  type Part,
  type SourceRow,
  type WeekRow,
} from "@/lib/marketing-story";

// Smart Marketing Overview (owner-approved prototype "Marketing prototype",
// 25 Nov 2026): one switch re-tells the whole page for a channel; the weekly
// chart, the "noticed" items, the course rows and the sources table can all be
// explored in place. Every view was computed on the server.

const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs";
const n = (x: number) => x.toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const TONE: Record<BarRow["tone"], string> = {
  brand: "#5743C5", soft: "#C9C1F2", red: "#B42318", amber: "#C2410C", green: "#15803D", teal: "#0EA5A4",
};
const CH_COLOR: Record<ChannelKey, string> = { instagram: "#5743C5", website: "#0EA5A4", whatsapp: "#15803D", other: "#94A3B8" };
const SIGNAL_TONE = {
  teal: "bg-teal-50 text-teal-800 dark:bg-teal-950/30 dark:text-teal-300",
  red: "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300",
  amber: "bg-amber-50 text-orange-800 dark:bg-amber-950/30 dark:text-amber-300",
  muted: "bg-surface-muted text-copy-muted",
};

function Text({ parts }: { parts: Part[] }) {
  return <>{parts.map((p, i) => (p.strong ? <strong key={i} className="font-semibold text-copy-strong">{p.text}</strong> : <span key={i}>{p.text}</span>))}</>;
}

function Bars({ rows, max }: { rows: BarRow[]; max?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 0);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,170px)_minmax(0,1fr)_72px] items-center gap-2.5 text-[12.5px]">
          <span className="truncate text-copy-muted" title={r.label}>{r.label}</span>
          <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className="block h-full rounded" style={{ width: `${top ? (r.value / top) * 100 : 0}%`, background: TONE[r.tone] }} /></span>
          <strong className="whitespace-nowrap text-right tabular-nums text-copy-strong">{r.shown}</strong>
        </div>
      ))}
    </div>
  );
}

function WeeklyChart({ view, pick, onPick }: { view: MarketingView; pick: number; onPick: (i: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 800));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 280, PB = 28, PT = 26, L = 44;
  const shown = (row: WeekRow, c: ChannelKey) => row.byChannel[c] ?? 0;
  const totals = view.weeks.map((row) => view.channels.reduce((s, c) => s + shown(row, c), 0));
  const top = Math.max(...totals, 1);
  const mx = top * 1.12;
  const step = top > 300 ? 300 : top > 100 ? 100 : top > 40 ? 20 : 10;
  const grid = [0, step, step * 2, step * 3].filter((v) => v <= top).slice(0, 4);
  const Y = (v: number) => PT + (H - PT - PB) * (1 - v / mx);
  const slot = (w - L) / view.weeks.length, bw = Math.min(120, slot * 0.58), small = w < 520;

  return (
    <div ref={box} className="relative h-[280px]">
      <svg width={w} height={H} role="img" aria-label="New enquiries per week, by channel" className="absolute inset-0">
        {grid.map((g) => (
          <g key={g}>
            <line x1={L} x2={w} y1={Y(g)} y2={Y(g)} className="stroke-line" />
            {small ? null : <text x={L - 8} y={Y(g) + 4} textAnchor="end" className="fill-copy-muted text-[11px]">{g}</text>}
          </g>
        ))}
        {view.weeks.map((row, i) => {
          const x = L + i * slot + slot / 2;
          let base = 0;
          return (
            <g key={row.week} role="button" tabIndex={0} aria-label={`Week of ${row.label}: ${totals[i]} enquiries`} className="cursor-pointer outline-none"
              onClick={() => onPick(i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(i); } }}
              onMouseMove={(e) => { const r = box.current!.getBoundingClientRect(); setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text: `${row.label} · ${view.channels.map((c) => `${CHANNEL_LABEL[c]} ${shown(row, c)}`).join(" · ")}` }); }}
              onMouseLeave={() => setTip(null)}>
              <rect x={x - slot / 2} y={PT - 12} width={slot} height={H - PT - PB + 12} rx={8} className={i === pick ? "fill-surface-muted" : "fill-transparent"} />
              {view.channels.map((c) => {
                const v = shown(row, c);
                const y1 = Y(base + v), y0 = Y(base);
                base += v;
                return v ? <rect key={c} x={x - bw / 2} y={y1} width={bw} height={Math.max(1, y0 - y1)} rx={3} fill={row.imported === c ? "#C9C1F2" : CH_COLOR[c]} /> : null;
              })}
              <text x={x} y={Y(totals[i]) - 8} textAnchor="middle" className="fill-copy-strong text-[13px] font-extrabold">{n(totals[i])}</text>
              <text x={x} y={H - 8} textAnchor="middle" className="fill-copy-muted text-[12px]">{row.label}{row.imported ? "*" : ""}{row.partial && !small ? " (so far)" : ""}</text>
            </g>
          );
        })}
      </svg>
      {tip ? <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[115%] whitespace-nowrap rounded-lg bg-copy-strong px-2.5 py-1.5 text-[12px] text-surface" style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null}
    </div>
  );
}

function WeekDrill({ view, i, filter }: { view: MarketingView; i: number; filter: FilterKey }) {
  const row = view.weeks[i], prev = view.weeks[i - 1];
  if (!row) return null;
  const v = (r: WeekRow, c: ChannelKey) => r.byChannel[c] ?? 0;
  const total = view.channels.reduce((s, c) => s + v(row, c), 0);
  let text = `${n(total)} new enquiries`;
  if (view.channels.length > 1) text += ` (${view.channels.filter((c) => v(row, c)).map((c) => `${n(v(row, c))} ${CHANNEL_LABEL[c]}`).join(", ")})`;
  text += ".";
  if (row.imported) text += ` This week also includes older ${CHANNEL_LABEL[row.imported]} conversations brought in when ${CHANNEL_LABEL[row.imported]} was connected, so it isn’t a fair comparison.`;
  else if (prev) {
    const before = view.channels.reduce((s, c) => s + v(prev, c), 0), d = total - before;
    text += ` ${d < 0 ? "Down" : "Up"} ${n(Math.abs(d))} on the week before`;
    text += view.channels.length > 1 ? ` (${view.channels.map((c) => { const x = v(row, c) - v(prev, c); return `${CHANNEL_LABEL[c]} ${x >= 0 ? "+" : ""}${x}`; }).join(", ")}).` : ".";
  }
  if (row.partial) text += " This week isn’t over yet.";
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[13px]">
      <span><strong className="text-copy-strong">Week of {row.label}:</strong> {text}</span>
      <Link href={`/leads?sort=created_desc${filter === "all" ? "" : `&creation_channel=${filter}`}`} className="btn-secondary h-8 px-3 text-[12.5px]">See the newest enquiries</Link>
    </div>
  );
}

export function SmartMarketingOverview({ story }: { story: MarketingStory }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const view = story.views[filter] ?? story.views.all;
  const [pick, setPick] = useState(() => Math.max(0, view.weeks.length - 2));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [courseSort, setCourseSort] = useState<"n" | "rate">("n");
  const [srcSort, setSrcSort] = useState<{ k: keyof SourceRow | "rate"; dir: 1 | -1 }>({ k: "n", dir: -1 });
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const courses = useMemo(() => [...view.courses].sort(courseSort === "n" ? (a, b) => b.n - a.n : (a, b) => b.warm / b.n - a.warm / a.n || b.n - a.n), [view, courseSort]);
  const courseMax = Math.max(...view.courses.map((c) => c.n), 1);
  const sources = useMemo(() => {
    const rows = view.sources.map((r) => ({ ...r, rate: r.n ? r.warm / r.n : 0 }));
    return rows.sort((a, b) => {
      const k = srcSort.k as keyof typeof a;
      const x = a[k], y = b[k];
      return (typeof x === "string" ? String(x).localeCompare(String(y)) : Number(x) - Number(y)) * srcSort.dir;
    });
  }, [view, srcSort]);
  const sortBy = (k: keyof SourceRow | "rate") => setSrcSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : k === "label" ? 1 : -1 }));

  return (
    <div className="flex flex-col gap-3.5" aria-label="Marketing overview">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold tracking-tight text-copy-strong">Marketing</h1>
          <p className="mt-1 max-w-[1150px] text-[15.5px] leading-7 text-copy"><Text parts={view.headline} /></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {story.filters.length > 1 ? (
            <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="Show enquiries from">
              {story.filters.map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                  className={`h-8 rounded-lg px-3 text-[12.5px] font-bold transition ${filter === f ? "bg-brand-600 text-white" : "text-copy-muted hover:text-copy-strong"}`}>
                  {CHANNEL_LABEL[f]}
                </button>
              ))}
            </div>
          ) : null}
          <span className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-3.5 text-[13px] font-bold text-copy-strong">Last {story.days} days</span>
        </div>
      </div>

      {view.ranks.length ? (
        <div className={`grid gap-3.5 ${view.ranks.length >= 3 ? "xl:grid-cols-3" : view.ranks.length === 2 ? "xl:grid-cols-2" : ""}`}>
          {view.ranks.map((r, i) => (
            <article key={r.id} className={`${card} ${i === 0 ? "border-brand-100 shadow-[0_8px_24px_rgba(87,67,197,0.10)]" : ""}`}>
              <div className="flex items-center gap-2">
                <span className={`grid size-6 place-items-center rounded-lg text-[12.5px] font-extrabold ${i === 0 ? "bg-copy-strong text-surface" : "bg-brand-50 text-brand-700"}`}>{i + 1}</span>
                <span className="text-[12px] font-extrabold uppercase tracking-wide text-brand-700 dark:text-brand-300">{r.impact}</span>
              </div>
              <h3 className="text-[16px] font-extrabold leading-snug text-copy-strong">{r.title}</h3>
              <Bars rows={r.bars} max={r.max} />
              <p className="text-[13px] leading-5 text-copy"><Text parts={r.body} /></p>
              <div className="mt-auto flex flex-wrap gap-2">
                {r.actions.map((a) => <Link key={a.label} href={a.href} className={a.primary ? "btn-primary" : "btn-secondary"}>{a.label}</Link>)}
              </div>
              <p className="text-[11.5px] text-copy-subtle">{r.basis}</p>
            </article>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {view.kpis.map((k) => (
          <div key={k.label} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-semibold text-copy-muted">{k.label}</span>
              {k.badge ? <span className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[12px] font-extrabold ${k.badge.tone === "bad" ? "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>{k.badge.text}</span> : null}
            </div>
            <span className="text-[28px] font-extrabold tracking-tight text-copy-strong tabular-nums">{k.value}</span>
            <span className="truncate text-[12px] text-copy-muted">{k.sub}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-extrabold text-copy-strong">New enquiries per week</h2>
              <p className="text-[12.5px] text-copy-muted">Hover for numbers · click a week to see what changed{view.weeks.some((w) => w.imported) ? " · * includes older conversations brought in when a channel was connected" : ""}</p>
            </div>
            <div className="flex flex-wrap gap-3.5">
              {view.channels.map((c) => <span key={c} className="inline-flex items-center gap-1.5 text-[12px] text-copy-muted"><span className="size-2.5 rounded-sm" style={{ background: CH_COLOR[c] }} />{CHANNEL_LABEL[c]}</span>)}
            </div>
          </div>
          <WeeklyChart view={view} pick={pick} onPick={setPick} />
          <WeekDrill view={view} i={pick} filter={filter} />
        </section>

        <section className={card}>
          <div>
            <h2 className="text-[16px] font-extrabold text-copy-strong">What SalsysOS noticed</h2>
            <p className="text-[12.5px] text-copy-muted">Worked out from your data each time the page opens · click one for the details</p>
          </div>
          {view.signals.length ? (
            <div>
              {view.signals.map((s) => (
                <button key={s.id} type="button" aria-expanded={Boolean(open[s.id])} onClick={() => toggle(s.id)}
                  className="grid w-full grid-cols-[96px_minmax(0,1fr)_16px] gap-3 border-t border-line py-3 text-left">
                  <span className={`inline-flex h-[22px] items-center justify-self-start rounded-full px-2 text-[11px] font-extrabold uppercase ${SIGNAL_TONE[s.tone]}`}>{s.tag}</span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-bold text-copy-strong">{s.title}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-5 text-copy-muted">{s.summary}</span>
                    {open[s.id] ? <span className="mt-2 block rounded-xl bg-surface-muted px-3 py-2.5 text-[12.5px] leading-5 text-copy">{s.detail}</span> : null}
                  </span>
                  <span className={`text-copy-muted transition-transform ${open[s.id] ? "rotate-90" : ""}`}>›</span>
                </button>
              ))}
            </div>
          ) : <p className="text-[13px] text-copy-muted">Nothing unusual right now.</p>}
        </section>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section id="marketing-courses" className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-extrabold text-copy-strong">Which courses bring warm enquiries</h2>
              <p className="text-[12.5px] text-copy-muted">Dark = reached Qualified or later · click a course to compare channels</p>
            </div>
            <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="Sort courses">
              {([["n", "Most enquiries"], ["rate", "Warmest"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={courseSort === k} onClick={() => setCourseSort(k)}
                  className={`h-8 rounded-lg px-3 text-[12.5px] font-bold ${courseSort === k ? "bg-brand-600 text-white" : "text-copy-muted hover:text-copy-strong"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            {courses.map((c) => (
              <button key={c.course} type="button" aria-expanded={Boolean(open[`c:${c.course}`])} onClick={() => toggle(`c:${c.course}`)}
                className={`grid w-full grid-cols-[minmax(0,240px)_minmax(0,1fr)_130px] items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-[13px] hover:bg-surface-muted ${open[`c:${c.course}`] ? "bg-surface-muted" : ""}`}>
                <span className="truncate text-copy">{c.course}</span>
                <span className="flex h-3.5 overflow-hidden rounded bg-surface-muted">
                  <span style={{ width: `${(c.warm / courseMax) * 100}%` }} className="bg-brand-600" />
                  <span style={{ width: `${((c.n - c.warm) / courseMax) * 100}%` }} className="bg-[#D9D5E6] dark:bg-[#3A3550]" />
                </span>
                <span className="whitespace-nowrap text-right"><strong className="text-copy-strong">{n(c.warm)}</strong> of {n(c.n)} · {pct(c.warm, c.n)}%</span>
                {open[`c:${c.course}`] ? (
                  <span className="col-span-3 pb-1 text-[12.5px] text-copy-muted">
                    {c.byChannel.sort((a, b) => b.n - a.n).map((x) => `${CHANNEL_LABEL[x.channel]}: ${n(x.warm)} warm of ${n(x.n)} (${pct(x.warm, x.n)}%)`).join(" · ")}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>

        <section className={card}>
          <div>
            <h2 className="text-[16px] font-extrabold text-copy-strong">How fast we replied, and what happened</h2>
            <p className="text-[12.5px] text-copy-muted">Chat enquiries whose first message came in the last {story.days} days</p>
          </div>
          {view.speed ? (
            <Bars rows={view.speed.map((r) => ({ label: `${r.label} · ${n(r.n)}`, value: r.n ? r.warm / r.n : 0, shown: `${pct(r.warm, r.n)}% warm`, tone: r.bucket === "never" ? "red" : "brand" }))} max={0.3} />
          ) : null}
          <p className="text-[13px] text-copy">{view.speedNote}</p>

          <div className="mt-2">
            <h2 className="text-[16px] font-extrabold text-copy-strong">Where enquiries came from</h2>
            <p className="text-[12.5px] text-copy-muted">Click a column to sort</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-[11.5px] text-copy-muted">
                  {([["label", "Source"], ["n", "Enquiries"], ["warm", "Warm"], ["rate", "Warm %"], ["paid", "Paid"]] as const).map(([k, l]) => (
                    <th key={k} className={`pb-1.5 font-semibold ${k === "label" ? "text-left" : "text-right"}`}>
                      <button type="button" onClick={() => sortBy(k)} className="hover:text-copy-strong">{l}{srcSort.k === k ? (srcSort.dir === 1 ? " ↑" : " ↓") : ""}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map((r) => (
                  <tr key={`${r.channel}|${r.label}`} className={`border-t border-line ${filter !== "all" && r.channel !== filter ? "opacity-35" : ""}`}>
                    <td className="py-2 pr-3 font-semibold text-copy-strong">{r.label}</td>
                    <td className="py-2 text-right tabular-nums">{n(r.n)}</td>
                    <td className="py-2 text-right tabular-nums">{n(r.warm)}</td>
                    <td className="py-2 text-right tabular-nums text-copy-muted">{pct(r.warm, r.n)}%</td>
                    <td className="py-2 text-right font-bold tabular-nums">{n(r.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
