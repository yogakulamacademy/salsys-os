"use client";

import Link from "next/link";
import { useState } from "react";

import { PageHead, RankCards, card } from "@/components/marketing/smart-blocks";
import type { TrackStatus, TrackingStory } from "@/lib/marketing-web";

// "Tracking check" (owner-approved prototype "Marketing step 3", 25 Nov 2026).

const DOT: Record<TrackStatus, string> = { ok: "bg-emerald-600", warn: "bg-orange-600", bad: "bg-red-700", off: "bg-slate-400" };
const WORD: Record<TrackStatus, string> = { ok: "Working", warn: "Quiet", bad: "Not working", off: "Not set up" };
const PILL: Record<TrackStatus, string> = {
  ok: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  warn: "bg-amber-50 text-orange-800 dark:bg-amber-950/30 dark:text-amber-300",
  bad: "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300",
  off: "bg-surface-muted text-copy-muted",
};

export function SmartTrackingPage({ story }: { story: TrackingStory }) {
  const [pick, setPick] = useState(() => Math.max(0, story.items.findIndex((i) => i.status === "bad")));
  const it = story.items[pick];
  return (
    <div className="flex flex-col gap-3.5" aria-label="Tracking check">
      <PageHead eyebrow="Marketing" title="Tracking check" headline={story.headline}
        right={<span className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-3.5 text-[13px] font-bold text-copy-strong">Checked just now</span>} />
      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={card}>
          <div>
            <h2 className="text-[16px] font-extrabold text-copy-strong">Is every source still sending data?</h2>
            <p className="text-[12.5px] text-copy-muted">Click one for what it brings and what to do</p>
          </div>
          <div className="flex flex-col">
            {story.items.map((i, idx) => (
              <button key={i.key} type="button" aria-pressed={idx === pick} onClick={() => setPick(idx)}
                className={`grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border-t border-line px-2 py-3 text-left hover:bg-surface-muted ${idx === pick ? "bg-surface-muted" : ""}`}>
                <span className={`size-3 justify-self-center rounded-full ${DOT[i.status]}`} />
                <span className="min-w-0"><span className="block text-[14px] font-bold text-copy-strong">{i.name}</span><span className="block text-[12.5px] text-copy-muted">{i.sub}</span></span>
                <span className={`inline-flex h-[22px] items-center rounded-full px-2 text-[12px] font-extrabold ${PILL[i.status]}`}>{WORD[i.status]}</span>
              </button>
            ))}
          </div>
        </section>
        <section className={card} aria-live="polite">
          {it ? (
            <>
              <h2 className="text-[16px] font-extrabold text-copy-strong">{it.name}</h2>
              <p className={`text-[13px] font-bold ${it.status === "ok" ? "text-emerald-700 dark:text-emerald-300" : it.status === "warn" ? "text-orange-700 dark:text-orange-300" : "text-red-700 dark:text-red-300"}`}>{WORD[it.status]} · {it.sub}</p>
              <p className="text-[13px] leading-5 text-copy"><strong className="text-copy-strong">What it brings:</strong> {it.what}</p>
              <p className="text-[13px] leading-5 text-copy"><strong className="text-copy-strong">What to do:</strong> {it.todo}</p>
              {it.status !== "ok" && it.href ? <div className="mt-auto"><Link href={it.href} className="btn-primary">Open {it.href.includes("integrations") ? "Integrations" : it.href.includes("tracking-sources") ? "Tracking sources" : "details"}</Link></div> : null}
            </>
          ) : null}
        </section>
      </div>
      <RankCards ranks={story.cards} />
    </div>
  );
}
