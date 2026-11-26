"use client";

import Link from "next/link";
import { useState } from "react";

import { KpiRow, PageHead, RankCards, SignalList, card } from "@/components/marketing/smart-blocks";
import type { ConnStatus, ConnectionsStory, FormsStory } from "@/lib/marketing-tracking-detail";

// Tracking check › "Connections and data" and "Forms and links" (owner-approved
// prototype "Tracking check inner pages", 26 Nov 2026).

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const th = "pb-1.5 text-right text-[11.5px] font-semibold text-copy-muted";
const thL = "pb-1.5 pl-1 text-left text-[11.5px] font-semibold text-copy-muted";
const td = "border-t border-line py-2 text-right tabular-nums";
const tdL = "border-t border-line py-2 pl-1 text-left";
const STATUS: Record<ConnStatus, [string, string]> = {
  ok: ["Working", "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"],
  warn: ["Quiet", "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"],
  bad: ["Broken", "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"],
  off: ["Not used", "bg-surface-muted text-copy-muted"],
};
const Foot = ({ children }: { children: React.ReactNode }) => <p className="text-[12.5px] text-copy-muted">{children}</p>;
const more = "font-semibold text-brand-700 hover:underline dark:text-brand-300";

export function SmartConnectionsPage({ story }: { story: ConnectionsStory }) {
  const maxE = Math.max(1, ...story.days.map((d) => d.events));
  const maxF = Math.max(1, ...story.days.map((d) => d.forms));
  return (
    <div className="flex flex-col gap-3.5" aria-label="Connections and data">
      <PageHead eyebrow="Marketing · Tracking check" title="Connections and data" headline={story.headline} />
      <RankCards ranks={story.ranks} />
      <KpiRow kpis={story.kpis} />
      <section className={card}>
        <div><h2 className="text-[16px] font-extrabold text-copy-strong">Every connection</h2><p className="text-[12.5px] text-copy-muted">When each one last sent data, and which pages use it</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr><th className={thL}>Connection</th><th className={thL}>Status</th><th className={thL}>Last data</th><th className={thL}>Last 30 days</th><th className={thL}>What it feeds</th></tr></thead>
            <tbody>
              {story.rows.map((r) => (
                <tr key={r.key}>
                  <td className={`${tdL} font-semibold text-copy-strong`}>{r.name}</td>
                  <td className={tdL}><span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td>
                  <td className={tdL}>{r.last}</td>
                  <td className={tdL}>{r.volume}</td>
                  <td className={`${tdL} text-copy-muted`}>{r.feeds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">Website data each day</h2><p className="text-[12.5px] text-copy-muted">Events from the tracking code, last 15 days · dark = form sends (own scale)</p></div>
          <div className="flex h-[190px] items-end gap-1.5 pt-2">
            {story.days.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-1 text-[11px] text-copy-muted" title={`${n(d.events)} events, ${n(d.forms)} form sends`}>
                <strong className="text-[11px] text-copy-strong">{n(d.events)}</strong>
                <span className={`relative block w-full rounded-t-md ${d.events ? "bg-brand-100 dark:bg-brand-900" : "bg-red-200"}`} style={{ height: `${Math.max(3, (d.events / maxE) * 135)}px` }}>
                  <span className="absolute bottom-0 left-1/4 block w-1/2 rounded-t bg-brand-600" style={{ height: `${(d.forms / maxF) * 100}%` }} />
                </span>
                <span>{d.label}{d.partial ? "*" : ""}</span>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-copy-subtle">* today so far.{story.gaps ? ` ${story.gaps} ${story.gaps === 1 ? "day" : "days"} with no data (red).` : " Data arrived every day; no gaps."}</p>
        </section>
        <section className={card}>
          <h2 className="text-[16px] font-extrabold text-copy-strong">What SalsysOS noticed</h2>
          <SignalList signals={story.signals} />
        </section>
      </div>
      <Foot>Need the tracking code or the full technical view? <Link href="/marketing/tracking-sources" className={more}>Setup →</Link> · <Link href="/tracking?classic=1" className={more}>Technical details →</Link> · <Link href="/tracking/data-coverage" className={more}>Data coverage →</Link></Foot>
    </div>
  );
}

export function SmartFormsPage({ story }: { story: FormsStory }) {
  const [pick, setPick] = useState(() => [...story.forms].sort((a, b) => b.missed / Math.max(b.sends, 1) - a.missed / Math.max(a.sends, 1))[0]?.key ?? "");
  const form = story.forms.find((f) => f.key === pick) ?? story.forms[0];
  const maxS = Math.max(1, ...story.sources.map((s) => s.n));
  const l = story.links;
  return (
    <div className="flex flex-col gap-3.5" aria-label="Forms and links">
      <PageHead eyebrow="Marketing · Tracking check" title="Forms and links" headline={story.headline} />
      <RankCards ranks={story.ranks} />
      <KpiRow kpis={story.kpis} />
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section id="forms" className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">Form sends → enquiries</h2><p className="text-[12.5px] text-copy-muted">Last 30 days, test pages left out · click a form to see the pages</p></div>
          {story.forms.length ? (
            <table className="w-full text-[13px]">
              <thead><tr><th className={thL}>Form</th><th className={th}>Sends</th><th className={th}>No enquiry</th><th className={th}>Lost</th></tr></thead>
              <tbody>
                {story.forms.map((f) => {
                  const lost = Math.round((f.missed / Math.max(f.sends, 1)) * 100);
                  return (
                    <tr key={f.key} onClick={() => setPick(f.key)} className={`cursor-pointer hover:bg-surface-muted ${f.key === form?.key ? "bg-brand-50/70 dark:bg-brand-950/30" : ""}`}>
                      <td className={`${tdL} font-semibold text-copy-strong`}>{f.label}</td>
                      <td className={td}>{n(f.sends)}</td><td className={td}>{n(f.missed)}</td>
                      <td className={`${td} font-bold ${lost >= 20 ? "text-red-700 dark:text-red-300" : "text-copy-strong"}`}>{lost}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="text-[13px] text-copy-muted">No forms were sent in the last 30 days.</p>}
        </section>
        {form ? (
          <section className={card}>
            <div><h2 className="text-[16px] font-extrabold text-copy-strong">{form.label}</h2><p className="text-[12.5px] text-copy-muted">{n(form.sends)} sends · {n(form.missed)} with no enquiry · pages where it happened</p></div>
            {form.pages.length ? (
              <table className="w-full text-[13px]">
                <thead><tr><th className={thL}>Page</th><th className={th}>No enquiry</th></tr></thead>
                <tbody>{form.pages.map((p) => <tr key={p.label}><td className={tdL}>{p.label}</td><td className={td}>{n(p.n)}</td></tr>)}</tbody>
              </table>
            ) : <p className="text-[13px] text-copy-muted">Every send from this form became an enquiry.</p>}
            <p className="text-[12px] text-copy-subtle">Some may be people who sent twice or typed a wrong number. A test send from one of these pages shows if it’s still happening.</p>
          </section>
        ) : null}
      </div>
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section id="sources" className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">Where website enquiries say they came from</h2><p className="text-[12.5px] text-copy-muted">First visit of the {n(story.webLeads)} website enquiries, last 30 days</p></div>
          <div className="flex flex-col gap-2">
            {story.sources.map((s) => (
              <div key={s.label} className="grid grid-cols-[150px_1fr_44px] items-center gap-2.5 text-[13px]">
                <span>{s.label}</span>
                <span className="h-3.5 rounded-full bg-surface-muted"><span className={`block h-full rounded-full ${s.unknown ? "bg-amber-500" : "bg-brand-600"}`} style={{ width: `${(s.n / maxS) * 100}%` }} /></span>
                <strong className="text-right tabular-nums text-copy-strong">{n(s.n)}</strong>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-copy-subtle">“Typed / unknown” means the browser didn’t say where the person came from. Tagged links fix most of it.</p>
        </section>
        <section className={card}>
          <div><h2 className="text-[16px] font-extrabold text-copy-strong">Tracked links sent in chats</h2><p className="text-[12.5px] text-copy-muted">Course links with their own short code{l.since ? `, since ${new Date(l.since).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}` : ""}</p></div>
          <div className="grid grid-cols-3 gap-2.5">
            {[["Links made", l.made, "in total"], ["Sent to people", l.sent, l.made > l.sent ? "the rest were never sent" : "all sent"], ["Opened", l.opened, `${n(l.opens)} opens in total`]].map(([k, v, s]) => (
              <div key={String(k)} className="rounded-xl border border-line px-3 py-2.5"><div className="text-[11.5px] text-copy-muted">{k}</div><div className="text-[22px] font-extrabold text-copy-strong">{n(Number(v))}</div><div className="text-[11.5px] text-copy-subtle">{s}</div></div>
            ))}
          </div>
          <p className="text-[13px] text-copy">{l.sent ? `${n(l.opened)} of the ${n(l.sent)} people who got a link opened it.` : "No tracked links have been sent yet."}{l.made > l.sent * 3 ? " Most links were made for replies that were never sent, so they can be ignored." : ""}</p>
        </section>
      </div>
      <section className={card}>
        <h2 className="text-[16px] font-extrabold text-copy-strong">What SalsysOS noticed</h2>
        <SignalList signals={story.signals} />
      </section>
      <Foot>Need the raw numbers? <Link href="/tracking/conversion-health?classic=1" className={more}>Conversion details →</Link> · <Link href="/tracking/forms" className={more}>Detected forms →</Link></Foot>
    </div>
  );
}
