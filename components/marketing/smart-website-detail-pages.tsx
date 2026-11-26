"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { KpiRow, PageHead, RankCards, SignalList, card } from "@/components/marketing/smart-blocks";
import type { ClicksStory, VisitsStory } from "@/lib/marketing-website-detail";

// Website › "Visits and sources" and "Clicks and forms" (owner-approved prototype
// "Website inner pages", 26 Nov 2026).

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const pct1 = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const chg = (a: number, b: number) => (b >= 10 ? Math.round(((a - b) / b) * 100) : null);
const Change = ({ a, b }: { a: number; b: number }) => {
  const c = chg(a, b);
  if (c == null) return <span className="text-copy-subtle">—</span>;
  return <span className={`font-bold ${c >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{c >= 0 ? "▲" : "▼"} {Math.abs(c)}%</span>;
};
const th = "pb-1.5 text-right text-[11.5px] font-semibold text-copy-muted";
const td = "border-t border-line py-2 text-right tabular-nums";

export function SmartVisitsPage({ story }: { story: VisitsStory }) {
  const [pick, setPick] = useState(story.sources[0]?.key ?? "");
  const [sort, setSort] = useState<{ k: "label" | "visits" | "leads" | "rate"; d: 1 | -1 }>({ k: "visits", d: -1 });
  const src = story.sources.find((s) => s.key === pick) ?? story.sources[0];
  const maxWeek = Math.max(1, ...story.weeks.map((w) => w.visits));
  const maxCountry = Math.max(1, ...story.countries.map((c) => c.visits));
  const pages = useMemo(() => [...story.pages].sort((a, b) => {
    const f = { label: (x: typeof a) => x.label, visits: (x: typeof a) => x.visits, leads: (x: typeof a) => x.leads, rate: (x: typeof a) => (x.visits ? x.leads / x.visits : 0) }[sort.k];
    const x = f(a), y = f(b);
    return (typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number)) * sort.d;
  }), [story.pages, sort]);
  const sortBtn = (k: typeof sort.k, label: string) => <button type="button" className="hover:text-copy-strong" onClick={() => setSort((s) => ({ k, d: s.k === k ? (s.d === 1 ? -1 : 1) : k === "label" ? 1 : -1 }))}>{label}{sort.k === k ? (sort.d === 1 ? " ↑" : " ↓") : ""}</button>;

  return (
    <div className="flex flex-col gap-3.5" aria-label="Visits and sources">
      <PageHead eyebrow="Marketing · Website" title="Visits and sources" headline={story.headline} />
      <RankCards ranks={story.ranks} />
      <KpiRow kpis={story.kpis} />
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">Visits each week</h2><p className="text-[12.5px] text-copy-muted">Dark = engaged visits (stayed 10+ seconds or saw 2+ pages){story.weeks.at(-1)?.partial ? " · the last week is partial" : ""}</p></div>
          <div className="flex h-[190px] items-end gap-2.5 pt-2">
            {story.weeks.map((w) => (
              <div key={w.label} className="flex flex-1 flex-col items-center gap-1 text-[11.5px] text-copy-muted" title={`${n(w.visits)} visits, ${n(w.engaged)} engaged`}>
                <strong className="text-[12px] text-copy-strong">{n(w.visits)}</strong>
                <span className="flex w-full flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${(w.visits / maxWeek) * 140}px` }}>
                  <span className="block bg-brand-600" style={{ height: `${w.visits ? (w.engaged / w.visits) * 100 : 0}%` }} />
                  <span className="block flex-1 bg-brand-200 dark:bg-brand-900" />
                </span>
                <span>{w.label}{w.partial ? "*" : ""}</span>
              </div>
            ))}
          </div>
        </section>
        <section className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">Where visitors are</h2><p className="text-[12.5px] text-copy-muted">Last 30 days, with the change on the 30 days before</p></div>
          <div className="flex flex-col gap-1.5">
            {story.countries.slice(0, 9).map((c) => (
              <div key={c.country} className="grid grid-cols-[130px_minmax(0,1fr)_110px] items-center gap-2.5 text-[12.5px]">
                <span className="truncate text-copy-muted">{c.country}</span>
                <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className="block h-full rounded bg-brand-600" style={{ width: `${(c.visits / maxCountry) * 100}%` }} /></span>
                <span className="text-right"><strong className="tabular-nums text-copy-strong">{n(c.visits)}</strong> <span className="text-[11.5px]"><Change a={c.visits} b={c.before} /></span></span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div id="sources" className="grid scroll-mt-20 gap-3.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">Where visits come from</h2><p className="text-[12.5px] text-copy-muted">Click a source to see what it brings</p></div>
          <table className="w-full border-collapse text-[13px]">
            <thead><tr><th className={`${th} text-left`}>Source</th><th className={th}>Visits</th><th className={th}>Change</th><th className={th}>Enquiries</th><th className={th}>Per 100 visits</th></tr></thead>
            <tbody>
              {story.sources.map((s) => (
                <tr key={s.key} onClick={() => setPick(s.key)} className={`cursor-pointer hover:bg-surface-muted ${s.key === src?.key ? "bg-surface-muted" : ""}`}>
                  <td className={`${td} pl-1 text-left font-semibold text-copy-strong`}>{s.label}</td>
                  <td className={td}>{n(s.visits)}</td>
                  <td className={td}><Change a={s.visits} b={s.before} /></td>
                  <td className={td}>{n(s.enquiries)}</td>
                  <td className={`${td} pr-1`}>{s.visits ? pct1(s.enquiries, s.visits) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {src ? (
          <section className={card}>
            <div className="text-[12px] font-bold text-copy-muted">Source</div>
            <h3 className="text-[15px] font-extrabold text-copy-strong">{src.label}</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-line px-3.5 py-3"><span className="block text-[12px] text-copy-muted">Visits</span><span className="block text-[22px] font-extrabold text-copy-strong">{n(src.visits)}</span><span className="block text-[12px] text-copy-muted">{n(src.before)} the month before</span></div>
              <div className="rounded-xl border border-line px-3.5 py-3"><span className="block text-[12px] text-copy-muted">Enquiries</span><span className="block text-[22px] font-extrabold text-copy-strong">{n(src.enquiries)}</span><span className="block text-[12px] text-copy-muted">{src.visits ? `${pct1(src.enquiries, src.visits)} per 100 visits` : ""}</span></div>
            </div>
            <p className="text-[13px] leading-6 text-copy">{src.note}</p>
          </section>
        ) : null}
      </div>
      <section className={card}>
        <div><h2 className="text-[16px] font-extrabold text-copy-strong">Pages people land on</h2><p className="text-[12.5px] text-copy-muted">Visits that started on each page, and enquiries from those visits · click a column to sort</p></div>
        <table className="w-full border-collapse text-[13px]">
          <thead><tr><th className={`${th} text-left`}>{sortBtn("label", "Page")}</th><th className={th}>{sortBtn("visits", "Visits")}</th><th className={th}>{sortBtn("leads", "Enquiries")}</th><th className={th}>{sortBtn("rate", "Per 100 visits")}</th></tr></thead>
          <tbody>
            {pages.map((p) => {
              const rate = pct1(p.leads, p.visits);
              const flag = p.visits >= 50 && rate < 2 && p.path !== "/" ? ["leaks", "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"] : p.visits >= 20 && rate >= 10 ? ["works", "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"] : null;
              return (
                <tr key={p.path} className="hover:bg-surface-muted">
                  <td className={`${td} pl-1 text-left`} title={p.path}><span className="font-semibold text-copy-strong">{p.label}</span>{flag ? <span className={`ml-2 inline-flex h-5 items-center rounded-full px-2 text-[11px] font-extrabold ${flag[1]}`}>{flag[0]}</span> : null}</td>
                  <td className={td}>{n(p.visits)}</td><td className={td}>{n(p.leads)}</td><td className={`${td} pr-1`}>{rate}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className={card}>
        <div><h2 className="text-[16px] font-extrabold text-copy-strong">What SalsysOS noticed</h2><p className="text-[12.5px] text-copy-muted">Click to open</p></div>
        <SignalList signals={story.signals} />
      </section>
    </div>
  );
}

export function SmartClicksPage({ story }: { story: ClicksStory }) {
  const [step, setStep] = useState(Math.max(0, story.journey.findIndex((j) => j.leak)));
  const j = story.journey[step] ?? story.journey[0];
  const top = Math.max(1, story.journey[0]?.value ?? 1);
  const maxCourse = Math.max(1, ...story.courses.map((c) => c.n));
  const maxClick = Math.max(1, ...story.clicks.map((c) => c.n));
  return (
    <div className="flex flex-col gap-3.5" aria-label="Clicks and forms">
      <PageHead eyebrow="Marketing · Website" title="Clicks and forms" headline={story.headline} />
      <RankCards ranks={story.ranks} />
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">From visit to payment</h2><p className="text-[12.5px] text-copy-muted">SalsysOS website tracking, last 30 days · click a step</p></div>
          <div className="flex flex-col gap-1">
            {story.journey.map((x, i) => (
              <button key={x.label} type="button" aria-pressed={i === step} onClick={() => setStep(i)}
                className={`grid w-full grid-cols-[190px_minmax(0,1fr)_90px] items-center gap-3.5 rounded-xl px-2 py-2 text-left hover:bg-surface-muted ${x.leak ? "bg-red-50/70 dark:bg-red-950/20" : i === step ? "bg-surface-muted" : ""}`}>
                <span><span className="block text-[14px] font-bold text-copy-strong">{x.label}</span><span className="block text-[12px] text-copy-muted">{x.sub}</span></span>
                <span className="h-[26px] overflow-hidden rounded-lg bg-surface-muted"><span className={`block h-full rounded-lg ${x.done ? "bg-emerald-600" : x.leak ? "bg-red-600" : "bg-brand-600"}`} style={{ width: `${Math.max(Math.sqrt(x.value / top) * 100, 2)}%` }} /></span>
                <strong className="text-right text-[17px] tabular-nums text-copy-strong">{n(x.value)}</strong>
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-copy-subtle">Bars use a square-root scale so the small steps stay visible.</p>
        </section>
        {j ? (
          <section className={card}>
            <div className="text-[12px] font-bold text-copy-muted">Step {step + 1}</div>
            <h3 className="text-[15px] font-extrabold text-copy-strong">{j.label}: {n(j.value)}</h3>
            <p className="text-[13px] leading-6 text-copy">{j.detail}</p>
            {j.leak ? <Link href="/leads?last_touch_source=website_backend" className="btn-primary self-start">See the website bookings</Link> : null}
          </section>
        ) : null}
      </div>
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section id="forms" className={`${card} scroll-mt-20`}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">Forms on each page</h2><p className="text-[12.5px] text-copy-muted">Visits that started a form, and how many sent it</p></div>
          <table className="w-full border-collapse text-[13px]">
            <thead><tr><th className={`${th} text-left`}>Page</th><th className={th}>Started</th><th className={th}>Sent</th><th className={th}>Finished</th></tr></thead>
            <tbody>
              {story.forms.map((f) => (
                <tr key={f.path}>
                  <td className={`${td} pl-1 text-left`} title={f.path}><span className="font-semibold text-copy-strong">{f.label}</span>
                    {f.flag === "leak" ? <span className="ml-2 inline-flex h-5 items-center rounded-full bg-red-50 px-2 text-[11px] font-extrabold text-red-800 dark:bg-red-950/30 dark:text-red-300">people give up</span> : null}
                    {f.flag === "test" ? <span className="ml-2 inline-flex h-5 items-center rounded-full bg-amber-50 px-2 text-[11px] font-extrabold text-orange-800 dark:bg-amber-950/30 dark:text-amber-300">test page</span> : null}</td>
                  <td className={td}>{n(f.started)}</td><td className={td}>{n(f.sent)}</td><td className={`${td} pr-1 font-bold`}>{f.finished}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">Which courses people book</h2><p className="text-[12.5px] text-copy-muted">Booking form, last 30 days (test bookings left out)</p></div>
          {story.courses.length ? (
            <div className="flex flex-col gap-1.5">
              {story.courses.slice(0, 8).map((c) => (
                <div key={c.course} className="grid grid-cols-[minmax(0,200px)_minmax(0,1fr)_32px] items-center gap-2.5 text-[12.5px]">
                  <span className="truncate text-copy-muted" title={c.course}>{c.course}</span>
                  <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className="block h-full rounded bg-brand-600" style={{ width: `${(c.n / maxCourse) * 100}%` }} /></span>
                  <strong className="text-right text-copy-strong">{n(c.n)}</strong>
                </div>
              ))}
            </div>
          ) : <p className="text-[13px] text-copy-muted">No bookings in the last 30 days.</p>}
          {story.providers.length ? (
            <div className="flex flex-wrap gap-2">
              {story.providers.map((p) => (
                <div key={p.label} className="min-w-[120px] rounded-xl border border-line px-3.5 py-2.5"><span className="block text-[12px] text-copy-muted">{p.label}</span><span className="block text-[20px] font-extrabold text-copy-strong">{n(p.n)}</span><span className="block text-[11.5px] text-copy-muted">payments started</span></div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {story.clicks.length ? (
          <section className={card}>
            <div><h2 className="text-[16px] font-extrabold text-copy-strong">What people click</h2><p className="text-[12.5px] text-copy-muted">Since {story.clicksSince ? new Date(story.clicksSince).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "click tracking began"} · {n(story.clickSessions)} visits</p></div>
            <div className="flex flex-col gap-1.5">
              {story.clicks.map((c) => (
                <div key={c.label} className="grid grid-cols-[180px_minmax(0,1fr)_120px] items-center gap-2.5 text-[12.5px]">
                  <span className="text-copy-muted">{c.label}</span>
                  <span className="h-3 overflow-hidden rounded bg-surface-muted"><span className="block h-full rounded bg-teal-600" style={{ width: `${(c.n / maxClick) * 100}%` }} /></span>
                  <span className="text-right"><strong className="text-copy-strong">{n(c.n)}</strong> <span className="text-[11.5px] text-copy-muted">{c.sub}</span></span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <section className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">What SalsysOS noticed</h2><p className="text-[12.5px] text-copy-muted">Click to open</p></div>
          <SignalList signals={story.signals} />
        </section>
      </div>
    </div>
  );
}
