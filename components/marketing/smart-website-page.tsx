"use client";

import { useMemo, useState } from "react";

import { Bars, KpiRow, PageHead, RankCards, SignalList, SortButton, card } from "@/components/marketing/smart-blocks";
import type { WebStory } from "@/lib/marketing-web";

// "Website" (owner-approved prototype "Marketing step 3", 25 Nov 2026).

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const rate = (a: number, b: number) => (b ? (a / b) * 100 : 0);
type PageSort = "label" | "visits" | "stayed" | "leads" | "rate";

export function SmartWebsitePage({ story }: { story: WebStory }) {
  const [srcSort, setSrcSort] = useState<"visits" | "rate">("visits");
  const [pick, setPick] = useState(() => Math.max(0, story.sources.findIndex((s) => s.label.startsWith("AI assistants"))));
  const [sort, setSort] = useState<{ k: PageSort; dir: 1 | -1 }>({ k: "visits", dir: -1 });
  const total = story.sources.reduce((s, x) => s + x.visits, 0);
  const avg = rate(story.leads, total);
  const max = Math.max(...story.sources.map((s) => s.visits), 1);
  const sources = useMemo(() => story.sources.map((s, i) => ({ ...s, i })).sort(srcSort === "visits" ? (a, b) => b.visits - a.visits : (a, b) => rate(b.leads, b.visits) - rate(a.leads, a.visits)), [story, srcSort]);
  const pages = useMemo(() => story.pages.map((p) => ({ ...p, stayed: p.visits ? p.engaged / p.visits : 0, rate: rate(p.leads, p.visits) })).sort((a, b) => {
    const x = a[sort.k], y = b[sort.k];
    return (typeof x === "string" ? String(x).localeCompare(String(y)) : Number(x) - Number(y)) * sort.dir;
  }), [story, sort]);
  const onSort = (k: PageSort) => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : k === "label" ? 1 : -1 }));
  const r = story.sources[pick];

  return (
    <div className="flex flex-col gap-3.5" aria-label="Website">
      <PageHead eyebrow="Marketing" title="Website" headline={story.headline}
        right={<span className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-3.5 text-[13px] font-bold text-copy-strong">Last 30 days</span>} />
      <RankCards ranks={story.ranks} />
      <KpiRow kpis={story.kpis} />

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-extrabold text-copy-strong">Where visitors come from, and how many enquire</h2>
              <p className="text-[12.5px] text-copy-muted">Click a source for details · enquiries from website forms only</p>
            </div>
            <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="Sort sources">
              {([["visits", "Most visits"], ["rate", "Best enquiry rate"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={srcSort === k} onClick={() => setSrcSort(k)} className={`h-8 rounded-lg px-3 text-[12.5px] font-bold ${srcSort === k ? "bg-brand-600 text-white" : "text-copy-muted hover:text-copy-strong"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            {sources.map((s) => (
              <button key={s.label} type="button" aria-pressed={s.i === pick} onClick={() => setPick(s.i)}
                className={`grid w-full grid-cols-[minmax(0,240px)_minmax(0,1fr)_120px] items-center gap-3 rounded-xl px-2 py-2 text-left text-[13px] hover:bg-surface-muted ${s.i === pick ? "bg-surface-muted" : ""}`}>
                <span className="truncate text-copy-strong">{s.label}</span>
                <span className="h-3.5 overflow-hidden rounded bg-surface-muted"><span className="block h-full rounded bg-brand-600" style={{ width: `${(s.visits / max) * 100}%` }} /></span>
                <strong className="whitespace-nowrap text-right tabular-nums text-copy-strong">{n(s.visits)} · {rate(s.leads, s.visits).toFixed(1)}%</strong>
              </button>
            ))}
          </div>
        </section>
        <section className={card} aria-live="polite">
          {r ? (
            <>
              <div>
                <h2 className="text-[16px] font-extrabold text-copy-strong">{r.label}</h2>
                <p className="text-[12.5px] text-copy-muted">{n(r.visits)} visits · {total ? Math.round((r.visits / total) * 100) : 0}% of all</p>
              </div>
              <Bars max={Math.max(r.visits, 1)} rows={[{ label: "Visits", value: r.visits, shown: n(r.visits), tone: "teal" }, { label: "Enquiries", value: r.leads, shown: n(r.leads), tone: "brand" }]} />
              <p className="text-[13px] text-copy"><strong className="text-copy-strong">{rate(r.leads, r.visits).toFixed(1)} enquiries per 100 visits</strong> (the website average is {avg.toFixed(1)}).</p>
              <p className="text-[13px] leading-5 text-copy">{r.note}</p>
            </>
          ) : null}
        </section>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={card}>
          <div>
            <h2 className="text-[16px] font-extrabold text-copy-strong">Pages people land on</h2>
            <p className="text-[12.5px] text-copy-muted">Visits, and enquiries whose tracked visit started on the page · click a column to sort</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-[11.5px] text-copy-muted">
                  {([["label", "Page"], ["visits", "Visits"], ["stayed", "Stayed"], ["leads", "Enquiries"], ["rate", "Per 100 visits"]] as const).map(([k, l]) => (
                    <th key={k} className={`pb-1.5 font-semibold ${k === "label" ? "text-left" : "text-right"}`}><SortButton k={k} label={l} sort={sort} onSort={onSort} /></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.path} className="border-t border-line">
                    <td className="py-2 pr-3 font-semibold text-copy-strong" title={p.path || "/"}>{p.label}</td>
                    <td className="py-2 text-right tabular-nums">{n(p.visits)}</td>
                    <td className="py-2 text-right tabular-nums text-copy-muted">{Math.round(p.stayed * 100)}%</td>
                    <td className="py-2 text-right font-bold tabular-nums">{n(p.leads)}</td>
                    <td className={`py-2 text-right font-bold tabular-nums ${p.visits >= 30 && p.rate < 2 ? "text-red-700 dark:text-red-300" : p.rate >= 8 ? "text-emerald-700 dark:text-emerald-300" : ""}`}>{p.rate.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className={card}>
          <div>
            <h2 className="text-[16px] font-extrabold text-copy-strong">What SalsysOS noticed</h2>
            <p className="text-[12.5px] text-copy-muted">Click one for the details</p>
          </div>
          <SignalList signals={story.signals} />
        </section>
      </div>
    </div>
  );
}
