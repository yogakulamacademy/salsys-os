"use client";

import Link from "next/link";
import { useState } from "react";

import type { BarTone, PageBar, PageKpi, PageRank, PageSignal, Part } from "@/lib/marketing-pages";

// Shared pieces of the smart Marketing pages (owner-approved prototypes, 25 Nov 2026).

export const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-xs";
export const TONE: Record<BarTone, string> = {
  brand: "#5743C5", soft: "#C9C1F2", red: "#B42318", amber: "#C2410C", green: "#15803D", teal: "#0EA5A4", slate: "#94A3B8", blue: "#2563EB",
};
const SIGNAL_TONE = {
  teal: "bg-teal-50 text-teal-800 dark:bg-teal-950/30 dark:text-teal-300",
  red: "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300",
  amber: "bg-amber-50 text-orange-800 dark:bg-amber-950/30 dark:text-amber-300",
  muted: "bg-surface-muted text-copy-muted",
};
const BADGE = {
  good: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  bad: "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300",
  warn: "bg-amber-50 text-orange-800 dark:bg-amber-950/30 dark:text-amber-300",
};

export function Text({ parts }: { parts: Part[] }) {
  return <>{parts.map((p, i) => (p.strong ? <strong key={i} className="font-semibold text-copy-strong">{p.text}</strong> : <span key={i}>{p.text}</span>))}</>;
}

export function Bars({ rows, max, labelWidth = 170 }: { rows: PageBar[]; max?: number; labelWidth?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 0);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid items-center gap-2.5 text-[12.5px]" style={{ gridTemplateColumns: `minmax(0,${labelWidth}px) minmax(0,1fr) 84px` }}>
          <span className="truncate text-copy-muted" title={r.label}>{r.label}</span>
          <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className="block h-full rounded" style={{ width: `${top ? (Math.max(0, r.value) / top) * 100 : 0}%`, background: TONE[r.tone] }} /></span>
          <strong className="whitespace-nowrap text-right tabular-nums text-copy-strong">{r.shown}</strong>
        </div>
      ))}
    </div>
  );
}

export function PageHead({ eyebrow, title, headline, right }: { eyebrow: string; title: string; headline: Part[]; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[12px] font-bold text-copy-muted">{eyebrow}</div>
        <h1 className="text-[28px] font-extrabold tracking-tight text-copy-strong">{title}</h1>
        <p className="mt-1 max-w-[1150px] text-[15.5px] leading-7 text-copy"><Text parts={headline} /></p>
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function RankCards({ ranks }: { ranks: PageRank[] }) {
  if (!ranks.length) return null;
  return (
    <div className={`grid gap-3.5 ${ranks.length >= 3 ? "xl:grid-cols-3" : ranks.length === 2 ? "xl:grid-cols-2" : ""}`}>
      {ranks.map((r, i) => (
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
  );
}

export function KpiRow({ kpis }: { kpis: PageKpi[] }) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k) => (
        <div key={k.label} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-semibold text-copy-muted">{k.label}</span>
            {k.badge ? <span className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[12px] font-extrabold ${BADGE[k.badge.tone]}`}>{k.badge.text}</span> : null}
          </div>
          <span className="text-[28px] font-extrabold tracking-tight text-copy-strong tabular-nums">{k.value}</span>
          <span className="truncate text-[12px] text-copy-muted" title={k.sub}>{k.sub}</span>
        </div>
      ))}
    </div>
  );
}

export function SignalList({ signals, empty = "Nothing unusual right now." }: { signals: PageSignal[]; empty?: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!signals.length) return <p className="text-[13px] text-copy-muted">{empty}</p>;
  return (
    <div>
      {signals.map((s) => (
        <button key={s.id} type="button" aria-expanded={Boolean(open[s.id])} onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}
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
  );
}

export function SortButton<K extends string>({ k, label, sort, onSort }: { k: K; label: string; sort: { k: string; dir: 1 | -1 }; onSort: (k: K) => void }) {
  return <button type="button" onClick={() => onSort(k)} className="hover:text-copy-strong">{label}{sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button>;
}
