"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SignalList, card } from "@/components/marketing/smart-blocks";
import { Text } from "@/components/marketing/smart-blocks";
import type { BehaviorStory, PageRow } from "@/lib/marketing-behavior-detail";

// Website › Clicks and forms, lower half (owner-approved 26 Nov 2026): replaces the
// open behaviour explorer, which stays at ?classic=1.

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const th = "pb-1.5 text-right text-[11.5px] font-semibold text-copy-muted";
const thL = "pb-1.5 pl-1 text-left text-[11.5px] font-semibold text-copy-muted";
const td = "border-t border-line py-2 text-right tabular-nums";
const tdL = "border-t border-line py-2 pl-1 text-left";
const per100 = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const more = "font-semibold text-brand-700 hover:underline dark:text-brand-300";

type SortKey = "label" | "visits" | "fees" | "dates" | "started" | "sent" | "left";
const rate = (r: PageRow, k: SortKey) => (k === "label" ? 0 : k === "visits" ? r.visits : per100(r[k], r.visits));

export function SmartBehaviorSections({ story }: { story: BehaviorStory }) {
  const [sort, setSort] = useState<{ k: SortKey; d: 1 | -1 }>({ k: "visits", d: -1 });
  const [all, setAll] = useState(false);
  const rows = useMemo(() => [...story.pages].sort((a, b) => (sort.k === "label" ? a.label.localeCompare(b.label) : rate(a, sort.k) - rate(b, sort.k)) * sort.d), [story.pages, sort]);
  const shown = all ? rows : rows.slice(0, 15);
  const maxMove = Math.max(1, ...story.moves.map((m) => m.visits));
  const best = (k: SortKey) => Math.max(0, ...story.pages.filter((p) => p.visits >= 50).map((p) => rate(p, k)));
  const sortBtn = (k: SortKey, label: string) => (
    <button type="button" className="hover:text-copy-strong" onClick={() => setSort((s) => ({ k, d: s.k === k ? (s.d === 1 ? -1 : 1) : k === "label" ? 1 : -1 }))}>{label}{sort.k === k ? (sort.d === 1 ? " ↑" : " ↓") : ""}</button>
  );
  const cell = (r: PageRow, k: Exclude<SortKey, "label" | "visits">, warnHigh = false) => {
    const v = per100(r[k], r.visits);
    const hi = r.visits >= 50 && v > 0 && v === best(k);
    return <td className={`${td} ${hi ? (warnHigh ? "font-bold text-amber-700 dark:text-amber-300" : "font-bold text-emerald-700 dark:text-emerald-300") : ""}`} title={`${n(r[k])} of ${n(r.visits)} visits`}>{r[k] ? v : "—"}</td>;
  };

  return (
    <div className="flex flex-col gap-3.5" aria-label="How people move and click">
      <section className={card}>
        <div>
          <h2 className="text-[16px] font-extrabold text-copy-strong">How people move between pages</h2>
          <p className="mt-1 text-[13.5px] leading-6 text-copy"><Text parts={story.headline} /></p>
        </div>
        <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <table className="w-full text-[13px]">
            <thead><tr><th className={thL}>From</th><th className={thL}>To</th><th className={th}>Visits</th><th className={th} title="Visits that made the opposite move">Came back</th></tr></thead>
            <tbody>
              {story.moves.map((m) => (
                <tr key={m.key}>
                  <td className={`${tdL} text-copy`}>{m.from}</td>
                  <td className={`${tdL} font-semibold text-copy-strong`}>
                    {m.to}
                    <span className="mt-1 block h-1.5 rounded-full bg-surface-muted"><span className="block h-full rounded-full bg-brand-600" style={{ width: `${(m.visits / maxMove) * 100}%` }} /></span>
                  </td>
                  <td className={td}>{n(m.visits)}</td>
                  <td className={`${td} ${m.back >= m.visits * 0.4 && m.visits >= 15 ? "font-bold text-amber-700 dark:text-amber-300" : "text-copy-muted"}`}>{m.back ? n(m.back) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-col gap-3">
            {story.actions.map((a, i) => (
              <article key={a.id} className="rounded-xl border border-line p-3.5">
                <div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-lg bg-brand-50 text-[12.5px] font-extrabold text-brand-700">{i + 1}</span><h3 className="text-[14.5px] font-extrabold leading-snug text-copy-strong">{a.title}</h3></div>
                <p className="mt-1.5 text-[13px] leading-5 text-copy">{a.body}</p>
                <p className="mt-1 text-[11.5px] text-copy-subtle">{a.basis}</p>
              </article>
            ))}
            {story.actions.length ? null : <p className="text-[13px] text-copy-muted">Nothing stands out in how people move right now.</p>}
          </div>
        </div>
      </section>

      <section className={card}>
        <div><h2 className="text-[16px] font-extrabold text-copy-strong">What people do on each page</h2><p className="text-[12.5px] text-copy-muted">Out of every 100 visits to the page, last {story.days} days · green = best page for that action · hover a number for the count</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr>
              <th className={thL}>{sortBtn("label", "Page")}</th><th className={th}>{sortBtn("visits", "Visits")}</th>
              <th className={th}>{sortBtn("fees", "Saw fees")}</th><th className={th}>{sortBtn("dates", "Checked dates")}</th>
              <th className={th}>{sortBtn("started", "Started a form")}</th><th className={th}>{sortBtn("sent", "Sent a form")}</th>
              <th className={th}>{sortBtn("left", "Left the site here")}</th>
            </tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.path}>
                  <td className={`${tdL} font-semibold text-copy-strong`}>{r.label}</td>
                  <td className={td}>{n(r.visits)}</td>
                  {cell(r, "fees")}{cell(r, "dates")}{cell(r, "started")}{cell(r, "sent")}{cell(r, "left", true)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 15 ? <button type="button" onClick={() => setAll((v) => !v)} className={`self-start text-[12.5px] ${more}`}>{all ? "Show fewer" : `Show all ${rows.length} pages`}</button> : null}
        {story.signals.length ? <SignalList signals={story.signals} /> : null}
      </section>

      <p className="text-[12px] leading-5 text-copy-subtle">
        How these are counted: a visit is one browsing session; pages seen by fewer than 3 people and test pages are left out; “Left the site here” is the last page of the visit.
        {" "}Want to build a step-by-step funnel? <Link href="/marketing?view=advisor" className={more}>Funnel advisor →</Link> · <Link href="/marketing?view=behavior&classic=1" className={more}>Old click explorer →</Link>
      </p>
    </div>
  );
}
