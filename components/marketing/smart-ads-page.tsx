"use client";

import Link from "next/link";

import { useEffect, useMemo, useRef, useState } from "react";

import { KpiRow, PageHead, RankCards, SignalList, SortButton, card } from "@/components/marketing/smart-blocks";
import type { AdsCampaign, AdsStory, AdsWeek, Platform } from "@/lib/marketing-pages";

// "Ads" (owner-approved prototype "Marketing step 2", 25 Nov 2026): spend,
// clicks and cost per click from the synced ad accounts, with the period the
// CRM can't see shaded. Switch platform, hover the weeks, sort the campaigns.

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const inr = (x: number) => `₹${n(x)}`;
const COLOR: Record<Platform, string> = { meta: "#5743C5", google: "#2563EB" };
const LABEL: Record<"all" | Platform, string> = { all: "All", meta: "Meta", google: "Google" };
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function SpendChart({ weeks, platforms }: { weeks: AdsWeek[]; platforms: Platform[] }) {
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
  const H = 280, PB = 28, PT = 24, L = 52;
  const total = (x: AdsWeek) => platforms.reduce((s, p) => s + (x[p] ?? 0), 0);
  const top = Math.max(...weeks.map(total), 1);
  const mx = top * 1.15;
  const step = top > 20000 ? 10000 : top > 8000 ? 5000 : top > 2000 ? 1000 : 500;
  const grid = [0, step, step * 2, step * 3].filter((v) => v <= top);
  const Y = (v: number) => PT + (H - PT - PB) * (1 - v / mx);
  const slot = (w - L) / Math.max(1, weeks.length), bw = Math.min(46, slot * 0.6), small = w < 560;
  const firstBlind = weeks.findIndex((x) => x.blind);
  const blindX = firstBlind >= 0 ? L + firstBlind * slot : null;

  return (
    <div ref={box} className="relative h-[280px]">
      <svg width={w} height={H} role="img" aria-label="Ad spend per week" className="absolute inset-0">
        {grid.map((g) => (
          <g key={g}>
            <line x1={L} x2={w} y1={Y(g)} y2={Y(g)} className="stroke-line" />
            {small ? null : <text x={L - 8} y={Y(g) + 4} textAnchor="end" className="fill-copy-muted text-[11px]">₹{g / 1000}k</text>}
          </g>
        ))}
        {blindX !== null ? (
          <g>
            <rect x={blindX} y={PT - 6} width={w - blindX} height={H - PT - PB + 6} rx={8} className="fill-surface-muted" />
            {w - blindX > 180 ? (
              <>
                <text x={blindX + (w - blindX) / 2} y={Y(top * 0.55)} textAnchor="middle" className="fill-copy-muted text-[13px] font-bold">The CRM can’t see the ad accounts</text>
                <text x={blindX + (w - blindX) / 2} y={Y(top * 0.55) + 18} textAnchor="middle" className="fill-copy-muted text-[12px]">so spend here is unknown</text>
              </>
            ) : null}
          </g>
        ) : null}
        {weeks.map((x, i) => {
          const cx = L + i * slot + slot / 2;
          const showLabel = !small || i % 2 === 0;
          if (x.blind) return showLabel ? <text key={x.week} x={cx} y={H - 8} textAnchor="middle" className="fill-copy-muted text-[11.5px]">{x.label}</text> : null;
          let base = 0;
          const t = total(x);
          return (
            <g key={x.week} onMouseLeave={() => setTip(null)}
              onMouseMove={(e) => { const r = box.current!.getBoundingClientRect(); setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text: `Week of ${x.label} · ${platforms.map((p) => `${LABEL[p]} ${inr(x[p] ?? 0)}`).join(" · ")}` }); }}>
              <rect x={cx - slot / 2} y={PT} width={slot} height={H - PT - PB} className="fill-transparent" />
              {platforms.map((p) => {
                const v = x[p] ?? 0;
                const y1 = Y(base + v), y0 = Y(base);
                base += v;
                return v ? <rect key={p} x={cx - bw / 2} y={y1} width={bw} height={Math.max(1, y0 - y1)} rx={3} fill={COLOR[p]} /> : null;
              })}
              {t > 0 && !small ? <text x={cx} y={Y(t) - 6} textAnchor="middle" className="fill-copy-strong text-[11.5px] font-bold">₹{(Math.round(t / 100) / 10).toLocaleString("en-IN")}k</text> : null}
              {showLabel ? <text x={cx} y={H - 8} textAnchor="middle" className="fill-copy-muted text-[11.5px]">{x.label}</text> : null}
            </g>
          );
        })}
      </svg>
      {tip ? <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[115%] whitespace-nowrap rounded-lg bg-copy-strong px-2.5 py-1.5 text-[12px] text-surface" style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null}
    </div>
  );
}

type SortKey = "label" | "platform" | "firstDay" | "spend" | "clicks" | "cpc" | "result";

export function SmartAdsPage({ story }: { story: AdsStory }) {
  const [f, setF] = useState<"all" | Platform>("all");
  const view = story.views[f] ?? story.views.all;
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "spend", dir: -1 });
  const platforms: Platform[] = f === "all" ? (["meta", "google"] as Platform[]).filter((p) => story.filters.includes(p)) : [f];
  const rows = useMemo(() => {
    const list = story.campaigns.filter((c) => f === "all" || c.platform === f).map((c) => ({ ...c, result: c.conversions ?? -1, cpcSort: c.cpc ?? Number.MAX_SAFE_INTEGER }));
    return list.sort((a, b) => {
      const k = sort.k === "cpc" ? "cpcSort" : sort.k;
      const x = a[k as keyof typeof a], y = b[k as keyof typeof b];
      return (typeof x === "string" ? String(x).localeCompare(String(y)) : Number(x) - Number(y)) * sort.dir;
    });
  }, [story, f, sort]);
  const onSort = (k: SortKey) => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : k === "label" || k === "platform" ? 1 : -1 }));
  const cpcTone = (c: AdsCampaign) => c.cpc === null ? "" : c.cpc > 100 ? "text-red-700 dark:text-red-300" : c.cpc < 25 ? "text-emerald-700 dark:text-emerald-300" : "";

  return (
    <div className="flex flex-col gap-3.5" aria-label="Ads">
      <PageHead eyebrow="Marketing" title="Ads" headline={view.headline}
        right={story.filters.length > 1 ? (
          <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="Platform">
            {story.filters.map((p) => (
              <button key={p} type="button" aria-pressed={f === p} onClick={() => setF(p)}
                className={`h-8 rounded-lg px-3 text-[12.5px] font-bold ${f === p ? "bg-brand-600 text-white" : "text-copy-muted hover:text-copy-strong"}`}>{LABEL[p]}</button>
            ))}
          </div>
        ) : null} />
      <RankCards ranks={view.ranks} />
      {story.campaigns.length ? <KpiRow kpis={view.kpis} /> : null}

      {story.weeks.length ? (
        <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <section className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-extrabold text-copy-strong">Ad spend per week</h2>
                <p className="text-[12.5px] text-copy-muted">Hover for the amount{story.blindFrom ? " · the shaded part is when the CRM can’t see the ad accounts" : ""}</p>
              </div>
              <div className="flex gap-3">
                {platforms.map((p) => <span key={p} className="inline-flex items-center gap-1.5 text-[12px] text-copy-muted"><span className="size-2.5 rounded-sm" style={{ background: COLOR[p] }} />{LABEL[p]}</span>)}
              </div>
            </div>
            <SpendChart weeks={story.weeks} platforms={platforms} />
          </section>
          <section className={card}>
            <div>
              <h2 className="text-[16px] font-extrabold text-copy-strong">What SalsysOS noticed</h2>
              <p className="text-[12.5px] text-copy-muted">Click one for the details</p>
            </div>
            <SignalList signals={view.signals} />
          </section>
        </div>
      ) : null}

      {rows.length ? (
        <section className={card}>
          <div>
            <h2 className="text-[16px] font-extrabold text-copy-strong">Campaigns</h2>
            <p className="text-[12.5px] text-copy-muted">Spend, clicks and what each click cost · click a column to sort</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-[11.5px] text-copy-muted">
                  {([["label", "Campaign"], ["platform", "Platform"], ["firstDay", "Ran"], ["spend", "Spend"], ["clicks", "Clicks to site"], ["cpc", "Cost per click"], ["result", "Results the platform recorded"]] as const).map(([k, l]) => (
                    <th key={k} className={`pb-1.5 font-semibold ${k === "label" ? "text-left" : "text-right"}`}><SortButton k={k} label={l} sort={sort} onSort={onSort} /></th>
                  ))}
                  <th className="pb-1.5 text-right font-semibold">Enquiries in the CRM</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={`${c.platform}|${c.name}`} className="border-t border-line">
                    <td className="py-2 pr-3 font-semibold text-copy-strong">{c.label}</td>
                    <td className="py-2 text-right">{LABEL[c.platform]}</td>
                    <td className="whitespace-nowrap py-2 text-right">{day(c.firstDay)}{c.lastDay !== c.firstDay ? ` – ${day(c.lastDay)}` : ""}</td>
                    <td className="py-2 text-right tabular-nums">{inr(c.spend)}</td>
                    <td className="py-2 text-right tabular-nums">{n(c.clicks)}</td>
                    <td className={`py-2 text-right font-bold tabular-nums ${cpcTone(c)}`}>{c.cpc === null ? "—" : inr(c.cpc)}</td>
                    <td className="py-2 text-right text-copy-muted">{c.conversions === null ? (/lead/i.test(c.name) && c.platform === "meta" ? "Lead forms (not in CRM)" : "—") : `${n(c.conversions)} ${c.conversions === 1 ? "conversion" : "conversions"}`}</td>
                    <td className="py-2 text-right text-copy-muted">{story.tagged ? <Link href="/paid-media-leads" className="font-semibold text-brand-700 hover:underline">See enquiries</Link> : "Can’t tell"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
                </section>
      ) : null}

      {/* "Enquiries from ads" lives here (owner-approved, 26 Nov 2026); the full list stays at /paid-media-leads. */}
      <section className={card} aria-label="Enquiries from ads">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-extrabold text-copy-strong">Enquiries from ads</h2>
            <p className="text-[12.5px] text-copy-muted">
              {story.enquiries ? `${n(story.enquiries.withCampaign)} of ${n(story.enquiries.n)} enquiries in the last 30 days carry an ad’s name.` : "Enquiries that carry an ad’s name."}
              {story.tagged ? "" : " Until ads carry tracked links, the CRM can’t tell which ad brought whom."}
            </p>
          </div>
          {story.tagged ? <Link href="/paid-media-leads" className="btn-primary">See enquiries from ads</Link> : null}
        </div>
        {story.tagged ? null : (
          <ol className="grid gap-2 md:grid-cols-2">
            {[
              ["Reconnect each ad account", "Spend must sync so cost per enquiry can be worked out.", "/settings/integrations"],
              ["Put a tracked link in every ad", "Use your go-links or add utm_campaign to the ad URL, so each enquiry carries the ad’s name.", null],
              ["Use “Send message” ads on Instagram", "Instagram then passes the ad along with the chat.", null],
              ["Connect lead forms", "If you use Instagram or Facebook lead forms, connect them so form enquiries arrive with their ad.", "/settings/integrations"],
            ].map(([t, d, href], i) => (
              <li key={t} className="flex gap-3 rounded-xl border border-line p-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-brand-50 text-[12px] font-extrabold text-brand-700 dark:bg-brand-950/40 dark:text-brand-200">{i + 1}</span>
                <span className="min-w-0 text-[13px]">
                  <span className="block font-bold text-copy-strong">{t}</span>
                  <span className="block text-copy-muted">{d}</span>
                  {href ? <Link href={href} className="mt-1 inline-block text-[12.5px] font-semibold text-brand-700 hover:underline">Open Settings</Link> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
