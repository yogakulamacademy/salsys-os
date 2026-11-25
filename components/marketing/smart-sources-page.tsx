"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Bars, KpiRow, PageHead, RankCards, SortButton, card } from "@/components/marketing/smart-blocks";
import type { PageBar, SourceRow, SourcesStory } from "@/lib/marketing-pages";

// "Where enquiries come from" (owner-approved prototype "Marketing step 2",
// 25 Nov 2026): where every enquiry from each source is now, with the
// untouched ones called out. Click a source for its details; sort the table.

const n = (x: number) => x.toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const STAGES = [
  { k: "new", label: "Still New", color: "#B42318" },
  { k: "engaged", label: "Engaged", color: "#D9D5E6" },
  { k: "warm", label: "Qualified or later", color: "#5743C5" },
  { k: "enrolled", label: "Enrolled", color: "#15803D" },
  { k: "closed", label: "Not now / lost", color: "#94A3B8" },
] as const;
type SortKey = "label" | "n" | "new" | "engaged" | "warmAll" | "rate" | "enrolled" | "closed";

export function SmartSourcesPage({ story }: { story: SourcesStory }) {
  const [pick, setPick] = useState(() => story.rows.findIndex((r) => r.untouched > 0) >= 0 ? story.rows.findIndex((r) => r.untouched > 0) : 0);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "n", dir: -1 });
  const rows = useMemo(() => {
    const list = story.rows.map((r) => ({ ...r, warmAll: r.warm + r.enrolled, rate: r.n ? (r.warm + r.enrolled) / r.n : 0 }));
    return list.sort((a, b) => {
      const x = a[sort.k], y = b[sort.k];
      return (typeof x === "string" ? String(x).localeCompare(String(y)) : Number(x) - Number(y)) * sort.dir;
    });
  }, [story, sort]);
  const onSort = (k: SortKey) => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : k === "label" ? 1 : -1 }));
  const r: SourceRow | undefined = story.rows[pick];

  return (
    <div className="flex flex-col gap-3.5" aria-label="Where enquiries come from">
      <PageHead eyebrow="Marketing" title="Where enquiries come from" headline={story.headline}
        right={<span className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-3.5 text-[13px] font-bold text-copy-strong">Last {story.days} days</span>} />
      <RankCards ranks={story.ranks} />
      <KpiRow kpis={story.kpis} />

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-extrabold text-copy-strong">How far each source gets</h2>
              <p className="text-[12.5px] text-copy-muted">Where every enquiry is now · click a source for details</p>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {STAGES.map((s) => <span key={s.k} className="inline-flex items-center gap-1.5 text-[12px] text-copy-muted"><span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
            </div>
          </div>
          <div className="flex flex-col">
            {story.rows.map((row, i) => (
              <button key={row.key} type="button" aria-pressed={i === pick} onClick={() => setPick(i)}
                className={`grid w-full grid-cols-[minmax(0,230px)_minmax(0,1fr)_76px] items-center gap-3 rounded-xl px-2 py-2 text-left text-[13px] hover:bg-surface-muted ${i === pick ? "bg-surface-muted" : ""}`}>
                <span className="truncate text-copy-strong">{row.label} <span className="text-copy-muted">· {n(row.n)}</span></span>
                <span className="flex h-[18px] overflow-hidden rounded-md bg-surface-muted">
                  {STAGES.map((s) => row[s.k] ? <span key={s.k} title={`${s.label}: ${row[s.k]}`} style={{ width: `${(row[s.k] / row.n) * 100}%`, background: s.color }} /> : null)}
                </span>
                <strong className="whitespace-nowrap text-right text-copy-strong">{pct(row.warm + row.enrolled, row.n)}% warm</strong>
              </button>
            ))}
          </div>
        </section>

        <section className={card} aria-live="polite">
          {r ? (
            <>
              <div>
                <h2 className="text-[16px] font-extrabold text-copy-strong">{r.label}</h2>
                <p className="text-[12.5px] text-copy-muted">{n(r.n)} enquiries in {story.days} days · {pct(r.n, story.total)}% of all</p>
              </div>
              <Bars max={r.n} rows={STAGES.map((s): PageBar => ({ label: s.label, value: r[s.k], shown: n(r[s.k]), tone: s.k === "new" ? "red" : s.k === "engaged" ? "soft" : s.k === "warm" ? "brand" : s.k === "enrolled" ? "green" : "slate" }))} />
              <p className="text-[13px] leading-5 text-copy">{r.note}</p>
              <div className="mt-auto"><Link href={r.href} className="btn-primary">See {r.channel === "website" ? "website" : r.label.toLowerCase()} enquiries in Leads</Link></div>
            </>
          ) : <p className="text-[13px] text-copy-muted">No enquiries in the last {story.days} days.</p>}
        </section>
      </div>

      <section className={card}>
        <div>
          <h2 className="text-[16px] font-extrabold text-copy-strong">All sources</h2>
          <p className="text-[12.5px] text-copy-muted">Click a column to sort</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-[11.5px] text-copy-muted">
                {([["label", "Source"], ["n", "Enquiries"], ["new", "Still New"], ["engaged", "Engaged"], ["warmAll", "Qualified or later"], ["rate", "Warm %"], ["enrolled", "Enrolled"], ["closed", "Not now / lost"]] as const).map(([k, l]) => (
                  <th key={k} className={`pb-1.5 font-semibold ${k === "label" ? "text-left" : "text-right"}`}><SortButton k={k} label={l} sort={sort} onSort={onSort} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.key} className="border-t border-line">
                  <td className="py-2 pr-3 font-semibold text-copy-strong">{x.label}</td>
                  <td className="py-2 text-right tabular-nums">{n(x.n)}</td>
                  <td className={`py-2 text-right tabular-nums ${x.untouched ? "font-bold text-red-700 dark:text-red-300" : ""}`}>{n(x.new)}</td>
                  <td className="py-2 text-right tabular-nums">{n(x.engaged)}</td>
                  <td className="py-2 text-right tabular-nums">{n(x.warmAll)}</td>
                  <td className="py-2 text-right tabular-nums text-copy-muted">{Math.round(x.rate * 100)}%</td>
                  <td className="py-2 text-right font-bold tabular-nums">{n(x.enrolled)}</td>
                  <td className="py-2 text-right tabular-nums">{n(x.closed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
