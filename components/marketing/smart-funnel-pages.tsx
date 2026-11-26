"use client";

import Link from "next/link";
import { useState } from "react";

import { PageHead, RankCards, SignalList, card } from "@/components/marketing/smart-blocks";
import { rupees, type CreditStory, type FunnelKey, type FunnelStory } from "@/lib/marketing-funnel";

// "Stage by stage" and "Credit by source" (owner-approved prototype "Where
// enquiries come from – inner pages", 26 Nov 2026).

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const share = (a: number, b: number) => (!b ? "0" : a / b < 0.01 && a > 0 ? ((a / b) * 100).toFixed(1) : String(pct(a, b)));
const seg = (on: boolean) => `h-8 rounded-lg px-3 text-[12.5px] font-bold ${on ? "bg-brand-600 text-white" : "text-copy-muted hover:text-copy-strong"}`;
const STEPS = [
  ["Enquired", "messaged, filled a form or called"],
  ["Talking", "someone replied, or they’re in a chat"],
  ["Reached Qualified", "Qualified, High intent or further"],
  ["Paid", "has an enrolment record"],
] as const;
const WHO = [
  ["Everyone who got in touch in this period.", "Open all enquiries", "/leads"],
  ["Moved past “New”: someone replied, or they’re in a chat. The ones still at New are the gap between the first two bars.", "See the ones at New", "/leads?stage=new"],
  ["Marked Qualified, High intent or Payment pending, or already paid. Most Instagram people stop before this, at “Engaged”.", "See who’s at Engaged", "/leads?stage=engaged"],
  ["Has an enrolment record with a payment.", "Open Enrolments", "/enrollments"],
] as const;
const CHANNEL_PARAM: Record<FunnelKey, string> = { all: "", instagram: "channel=instagram", website: "channel=website", whatsapp: "channel=whatsapp" };

export function SmartStagesPage({ story }: { story: FunnelStory }) {
  const [key, setKey] = useState<FunnelKey>("all");
  const [step, setStep] = useState(2);
  const g = story.groups.find((x) => x.key === key) ?? story.groups[0];
  const max = Math.max(g.steps[0], 1);
  const who = WHO[step];
  const href = (base: string) => (CHANNEL_PARAM[key] && base.startsWith("/leads") ? `${base}${base.includes("?") ? "&" : "?"}${CHANNEL_PARAM[key]}` : base);
  const maxWeek = Math.max(1, ...story.weeks.map((w) => pct(w.qualified, w.n)));

  return (
    <div className="flex flex-col gap-3.5" aria-label="Stage by stage">
      <PageHead eyebrow="Marketing · Where enquiries come from" title="Stage by stage" headline={story.headline}
        right={story.groups.length > 1 ? (
          <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="Source">
            {story.groups.map((x) => <button key={x.key} type="button" aria-pressed={key === x.key} onClick={() => setKey(x.key)} className={seg(key === x.key)}>{x.key === "all" ? "All" : x.name}</button>)}
          </div>
        ) : null} />
      <RankCards ranks={story.ranks} />

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={card}>
          <div>
            <h2 className="text-[16px] font-extrabold text-copy-strong">How far enquiries get</h2>
            <p className="text-[12.5px] text-copy-muted">Each step counts people who reached it or went further · click a step to see who’s there</p>
          </div>
          <div className="flex flex-col gap-1">
            {g.steps.map((v, i) => {
              const prev = i ? g.steps[i - 1] : null;
              const lost = prev != null ? prev - v : 0;
              return (
                <div key={STEPS[i][0]}>
                  {i && lost > 0 ? <div className="ml-[184px] py-1 text-[12px] font-bold text-red-700 dark:text-red-300">− {n(lost)} stopped here ({100 - pct(v, prev ?? 0)}%)</div> : null}
                  <button type="button" aria-pressed={i === step} onClick={() => setStep(i)}
                    className={`grid w-full grid-cols-[170px_minmax(0,1fr)_140px] items-center gap-3.5 rounded-xl px-2 py-2 text-left hover:bg-surface-muted ${i === step ? "bg-surface-muted" : ""}`}>
                    <span><span className="block text-[14px] font-bold text-copy-strong">{STEPS[i][0]}</span><span className="block text-[12px] text-copy-muted">{STEPS[i][1]}</span></span>
                    <span className="h-[30px] overflow-hidden rounded-lg bg-surface-muted"><span className={`block h-full rounded-lg ${i === 3 ? "bg-emerald-600" : i === 2 ? "bg-brand-600" : "bg-brand-300"}`} style={{ width: `${Math.max((v / max) * 100, 0.6)}%` }} /></span>
                    <span className="text-right"><span className="block text-[18px] font-extrabold tabular-nums text-copy-strong">{n(v)}</span><span className="block text-[11.5px] font-semibold text-copy-muted">{i ? `${share(v, g.steps[0])}% of enquiries` : `in ${story.days} days`}</span></span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
        <section className={card}>
          <div className="text-[12px] font-bold text-copy-muted">{g.name}</div>
          <h3 className="text-[15px] font-extrabold text-copy-strong">{STEPS[step][0]}: {n(g.steps[step])} people</h3>
          <p className="text-[13px] leading-6 text-copy">{who[0]}</p>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-copy">
            <li>Most common place to stop: <strong className="text-copy-strong">{g.stuck.label}</strong> ({n(g.stuck.n)})</li>
            <li>Closed as Lost, Not now or Unqualified: <strong className="text-copy-strong">{n(g.closed)}</strong></li>
            <li>From Talking to Qualified: <strong className="text-copy-strong">{pct(g.steps[2], g.steps[1])}%</strong> · from Qualified to Paid: <strong className="text-copy-strong">{pct(g.steps[3], g.steps[2])}%</strong></li>
          </ul>
          <div><Link href={href(who[2])} className="btn-primary">{who[1]}</Link></div>
        </section>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {story.weeks.length ? (
          <section className={card}>
            <div>
              <h2 className="text-[16px] font-extrabold text-copy-strong">How many each week reached Qualified</h2>
              <p className="text-[12.5px] text-copy-muted">By the week they first enquired · newer weeks have had less time</p>
            </div>
            <div className="flex h-[170px] items-end gap-2.5 pt-2">
              {story.weeks.map((w) => (
                <div key={w.label} className="flex flex-1 flex-col items-center gap-1 text-[11.5px] text-copy-muted" title={`${n(w.qualified)} of ${n(w.n)} enquiries`}>
                  <strong className="text-[12.5px] text-copy-strong">{pct(w.qualified, w.n)}%</strong>
                  <span className="block w-full rounded-t-md bg-brand-600" style={{ height: `${Math.max((pct(w.qualified, w.n) / maxWeek) * 100, 3)}px` }} />
                  <span>{w.label}</span><span>{n(w.qualified)} of {n(w.n)}</span>
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

export function SmartCreditPage({ story }: { story: CreditStory }) {
  const [model, setModel] = useState<"first" | "last">("first");
  const rows = model === "first" ? story.first : story.last;
  const [pick, setPick] = useState<string | null>(null);
  const sel = rows.find((r) => r.key === pick) ?? rows[0];
  const web = rows.filter((r) => r.label.startsWith("Website")).reduce((t, r) => ({ v: t.v + r.value, p: t.p + r.paid }), { v: 0, p: 0 });
  const ig = rows.filter((r) => r.label === "Instagram").reduce((t, r) => ({ v: t.v + r.value, p: t.p + r.paid }), { v: 0, p: 0 });
  const kpis = [
    ["Paid so far", rupees(story.paidTotal, story.currency), `${n(story.paidCount)} enrolments`],
    ["Credited to the website", rupees(web.v, story.currency), `${n(web.p)} of ${n(story.paidCount)} payments`],
    ["Credited to Instagram", rupees(ig.v, story.currency), `${n(ig.p)} of ${n(story.paidCount)} payments`],
    ["Enquiries", n(story.enquiries), `in the last ${story.days} days`],
  ];

  return (
    <div className="flex flex-col gap-3.5" aria-label="Credit by source">
      <PageHead eyebrow="Marketing · Where enquiries come from" title="Credit by source" headline={story.headline}
        right={
          <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="Credit to">
            <button type="button" aria-pressed={model === "first"} onClick={() => { setModel("first"); setPick(null); }} className={seg(model === "first")}>Where they first came from</button>
            <button type="button" aria-pressed={model === "last"} onClick={() => { setModel("last"); setPick(null); }} className={seg(model === "last")}>Where they came from last</button>
          </div>
        } />
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(([l, v, s]) => (
          <div key={l} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-xs">
            <span className="text-[12.5px] font-semibold text-copy-muted">{l}</span>
            <span className="text-[28px] font-extrabold tracking-tight text-copy-strong tabular-nums">{v}</span>
            <span className="truncate text-[12px] text-copy-muted">{s}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">Credit per source</h2><p className="text-[12.5px] text-copy-muted">Click a source to see its people and payments</p></div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead><tr className="text-[11.5px] text-copy-muted">
                <th className="pb-1.5 text-left font-semibold">Source</th><th className="pb-1.5 text-right font-semibold">Enquiries</th>
                <th className="pb-1.5 text-right font-semibold">Reached Qualified</th><th className="pb-1.5 text-right font-semibold">Paid</th><th className="pb-1.5 text-right font-semibold">Paid amount</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} onClick={() => setPick(r.key)} className={`cursor-pointer border-t border-line hover:bg-surface-muted ${r.key === sel?.key ? "bg-surface-muted" : ""}`}>
                    <td className="py-2 pl-1 font-semibold text-copy-strong">{r.label}</td>
                    <td className="py-2 text-right tabular-nums">{n(r.n)}</td>
                    <td className="py-2 text-right tabular-nums">{n(r.qualified)} <span className="text-copy-muted">({pct(r.qualified, r.n)}%)</span></td>
                    <td className="py-2 text-right tabular-nums">{n(r.paid)}</td>
                    <td className="py-2 pr-1 text-right tabular-nums">{r.value ? rupees(r.value, story.currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {sel ? (
          <section className={card}>
            <div className="text-[12px] font-bold text-copy-muted">{model === "first" ? "First came from" : "Came from last"}</div>
            <h3 className="text-[15px] font-extrabold text-copy-strong">{sel.label}</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-line px-3.5 py-3"><span className="block text-[12px] text-copy-muted">Enquiries</span><span className="block text-[22px] font-extrabold text-copy-strong">{n(sel.n)}</span><span className="block text-[12px] text-copy-muted">{pct(sel.n, story.enquiries)}% of all</span></div>
              <div className="rounded-xl border border-line px-3.5 py-3"><span className="block text-[12px] text-copy-muted">Paid</span><span className="block text-[22px] font-extrabold text-copy-strong">{sel.value ? rupees(sel.value, story.currency) : "—"}</span><span className="block text-[12px] text-copy-muted">{n(sel.paid)} enrolments</span></div>
            </div>
            <p className="text-[13px] leading-6 text-copy">{sel.note || (sel.paid ? "" : "No payments from this source yet.")}</p>
          </section>
        ) : null}
      </div>
      <section className={card}>
        <div><h2 className="text-[16px] font-extrabold text-copy-strong">What SalsysOS noticed</h2><p className="text-[12.5px] text-copy-muted">Click to open</p></div>
        <SignalList signals={story.signals} />
      </section>
    </div>
  );
}
