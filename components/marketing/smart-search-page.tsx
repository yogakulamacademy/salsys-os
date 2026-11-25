"use client";

import { useState } from "react";

import { KpiRow, PageHead, RankCards, card } from "@/components/marketing/smart-blocks";
import type { SearchStory } from "@/lib/marketing-web";

// "Google search" (owner-approved prototype "Marketing step 3", 25 Nov 2026).

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const TABS = [["near", "Close to the top"], ["top", "Bringing clicks now"], ["pages", "Pages"]] as const;

export function SmartSearchPage({ story }: { story: SearchStory }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>(story.near.length ? "near" : "top");
  const th = "pb-1.5 font-semibold text-right";
  return (
    <div className="flex flex-col gap-3.5" aria-label="Google search">
      <PageHead eyebrow="Marketing" title="Google search" headline={story.headline}
        right={<span className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-3.5 text-[13px] font-bold text-copy-strong">Last 30 days</span>} />
      <RankCards ranks={story.ranks} />
      <KpiRow kpis={story.kpis} />
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-extrabold text-copy-strong">Searches you could win</h2>
            <p className="text-[12.5px] text-copy-muted">Where you rank, how often you were seen and how many clicked</p>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
            {TABS.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`h-8 rounded-lg border px-3 text-[12.5px] font-bold ${tab === k ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-copy-muted hover:text-copy-strong"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            {tab === "near" ? (
              <>
                <thead><tr className="text-[11.5px] text-copy-muted"><th className="pb-1.5 text-left font-semibold">Search</th><th className={th}>Position</th><th className={th}>Seen</th><th className={th}>Clicks</th><th className="pb-1.5 pl-4 text-left font-semibold">What to do</th></tr></thead>
                <tbody>{story.near.map((q) => (
                  <tr key={q.query} className="border-t border-line"><td className="py-2 pr-3 font-semibold text-copy-strong">{q.query}</td><td className="py-2 text-right">{q.position}</td><td className="py-2 text-right tabular-nums">{n(q.views)}</td>
                    <td className={`py-2 text-right font-bold tabular-nums ${Number(q.clicks) === 0 ? "text-red-700 dark:text-red-300" : ""}`}>{n(q.clicks)}</td>
                    <td className="py-2 pl-4 text-copy-muted">{Number(q.position) <= 10 ? "On page 1: rewrite the title and description" : "Page 2: strengthen the page and link to it"}</td></tr>
                ))}</tbody>
              </>
            ) : tab === "top" ? (
              <>
                <thead><tr className="text-[11.5px] text-copy-muted"><th className="pb-1.5 text-left font-semibold">Search</th><th className={th}>Position</th><th className={th}>Seen</th><th className={th}>Clicks</th><th className={th}>Your name?</th></tr></thead>
                <tbody>{story.top.map((q) => (
                  <tr key={q.query} className="border-t border-line"><td className="py-2 pr-3 font-semibold text-copy-strong">{q.query}</td><td className="py-2 text-right">{q.position}</td><td className="py-2 text-right tabular-nums">{n(q.views)}</td><td className="py-2 text-right font-bold tabular-nums">{n(q.clicks)}</td><td className="py-2 text-right text-copy-muted">{q.brand ? "Yes" : "—"}</td></tr>
                ))}</tbody>
              </>
            ) : (
              <>
                <thead><tr className="text-[11.5px] text-copy-muted"><th className="pb-1.5 text-left font-semibold">Page</th><th className={th}>Position</th><th className={th}>Seen</th><th className={th}>Clicks</th><th className={th}>Clicks per 100 views</th></tr></thead>
                <tbody>{story.pages.map((p) => (
                  <tr key={p.page} className="border-t border-line"><td className="py-2 pr-3 font-semibold text-copy-strong" title={p.page}>{p.label}</td><td className={`py-2 text-right ${p.position > 20 ? "text-red-700 dark:text-red-300" : ""}`}>{p.position}</td><td className="py-2 text-right tabular-nums">{n(p.views)}</td><td className="py-2 text-right font-bold tabular-nums">{n(p.clicks)}</td><td className="py-2 text-right tabular-nums">{p.views ? ((p.clicks / p.views) * 100).toFixed(1) : "—"}</td></tr>
                ))}</tbody>
              </>
            )}
          </table>
        </div>
        <p className="text-[11.5px] text-copy-subtle">
          {tab === "near" ? "Searches seen 60+ times in 30 days where you rank between 4 and 20, your own name left out." : tab === "top" ? "The searches that brought the most clicks." : "Pages Google showed most. A position above 20 means page 3 or later."}
        </p>
      </section>
    </div>
  );
}
