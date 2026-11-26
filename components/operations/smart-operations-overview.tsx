"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Bars, KpiRow, PageHead, RankCards, SignalList, card } from "@/components/marketing/smart-blocks";
import { dayLabel, inDays, opsWindow, type OpsStory } from "@/lib/operations-story";

// Smart Operations Overview (owner-approved prototype "Operations prototype",
// 26 Nov 2026): what starts next, who is waiting for it, what is missing.

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const RANGES = [14, 30, 60] as const;
const MODES = [["all", "All"], ["in_person", "In person"], ["online", "Online"]] as const;

export function SmartOperationsOverview({ story }: { story: OpsStory }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [mode, setMode] = useState<(typeof MODES)[number][0]>("all");
  const win = useMemo(() => opsWindow(story, days, mode), [story, days, mode]);
  const [pickId, setPickId] = useState<string | null>(story.batches[0]?.id ?? null);
  const pick = win.rows.find((b) => b.id === pickId) ?? win.rows[0];
  const max = Math.max(...win.rows.map((b) => b.warmPlace), 1);
  const seg = (on: boolean) => `h-8 rounded-lg px-3 text-[12.5px] font-bold ${on ? "bg-brand-600 text-white" : "text-copy-muted hover:text-copy-strong"}`;

  return (
    <div className="flex flex-col gap-3.5" aria-label="Operations overview">
      <PageHead eyebrow="Operations" title="Overview" headline={story.headline}
        right={
          <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="Time range">
            {RANGES.map((r) => <button key={r} type="button" aria-pressed={days === r} onClick={() => setDays(r)} className={seg(days === r)}>{r} days</button>)}
          </div>
        } />
      <RankCards ranks={story.ranks} />
      <KpiRow kpis={win.kpis} />

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-extrabold text-copy-strong">What starts next</h2>
              <p className="text-[12.5px] text-copy-muted">Bar = warm people (Qualified, High intent or Payment pending) for that course and place · click a batch</p>
            </div>
            <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="Show">
              {MODES.map(([k, l]) => <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={seg(mode === k)}>{l}</button>)}
            </div>
          </div>
          {win.rows.length ? (
            <div className="flex flex-col">
              {win.rows.map((b) => {
                const on = b.id === pick?.id;
                const chip = b.warmPlace === 0 ? ["no demand", "bg-amber-50 text-orange-800 dark:bg-amber-950/30 dark:text-amber-300"]
                  : b.days <= 7 ? ["this week", "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"]
                  : !b.capacity ? ["no seats set", "bg-surface-muted text-copy-muted"] : [`${n(b.seatsRemaining ?? 0)} seats left`, "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"];
                return (
                  <button key={b.id} type="button" aria-pressed={on} onClick={() => setPickId(b.id)}
                    className={`grid w-full grid-cols-[78px_minmax(0,1fr)_100px] items-center gap-3 border-t border-line px-2 py-2.5 text-left text-[13px] hover:bg-surface-muted md:grid-cols-[78px_minmax(0,260px)_96px_minmax(0,1fr)_86px] ${on ? "rounded-xl bg-surface-muted" : ""}`}>
                    <span><span className="block font-extrabold text-copy-strong">{dayLabel(b.start)}</span><span className="block text-[11.5px] text-copy-muted">{inDays(b.days)}</span></span>
                    <span className="min-w-0"><span className="block truncate text-copy-strong">{b.label}</span><span className="block text-[12px] text-copy-muted">{b.online ? "Online" : `${b.location ?? "—"} · in person`}</span></span>
                    <span className="hidden md:block"><span className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-bold ${chip[1]}`}>{chip[0]}</span></span>
                    <span className="hidden h-3.5 overflow-hidden rounded bg-surface-muted md:block"><span className={`block h-full rounded ${b.online ? "bg-teal-600" : "bg-brand-600"}`} style={{ width: `${(b.warmPlace / max) * 100}%` }} /></span>
                    <strong className="whitespace-nowrap text-right text-copy-strong">{n(b.warmPlace)} warm</strong>
                  </button>
                );
              })}
            </div>
          ) : <p className="text-[13px] text-copy-muted">No batches in this range.</p>}
        </section>

        <section className={card} aria-live="polite">
          {pick ? (
            <>
              <div>
                <h2 className="text-[16px] font-extrabold text-copy-strong">{pick.course}</h2>
                <p className="text-[12.5px] text-copy-muted">{pick.online ? "Online" : `${pick.location ?? "—"} · in person`} · starts {dayLabel(pick.start)} ({inDays(pick.days)}){pick.end ? ` · ends ${dayLabel(pick.end)}` : ""}</p>
              </div>
              <Bars max={Math.max(pick.warmCourse, 1)} rows={[
                { label: pick.online ? "Warm people" : "Warm people for this place", value: pick.warmPlace, shown: n(pick.warmPlace), tone: "brand" },
                { label: "Warm for the course anywhere", value: pick.warmCourse, shown: n(pick.warmCourse), tone: "soft" },
                { label: "Enrolled in this batch", value: pick.enrolled, shown: n(pick.enrolled), tone: "green" },
              ]} />
              <p className="text-[13px] text-copy"><strong className="text-copy-strong">Seats:</strong> {pick.capacity ? `${n(pick.seatsRemaining ?? pick.capacity)} of ${n(pick.capacity)} left` : "not set"} · <strong className="text-copy-strong">Price:</strong> {pick.hasPrice ? "set" : "not set on the batch"} · <strong className="text-copy-strong">Enrolment:</strong> {pick.open ? "open" : "closed"}</p>
              <p className="text-[13px] leading-5 text-copy">{pick.warmPlace === 0 ? "Nobody warm is asking for this course here right now. Promote it, or move it to a later date." : pick.days <= 10 ? "Starts soon: call the High-intent people first and confirm who’s coming." : "Set the seats and the price now so the team can quote it and see it fill."}</p>
              <div className="mt-auto flex flex-wrap gap-2">
                <Link href={`/leads?course=${encodeURIComponent(pick.course)}`} className="btn-primary">See the warm people</Link>
                <Link href="/course-management" className="btn-secondary">Edit batch</Link>
              </div>
            </>
          ) : <p className="text-[13px] text-copy-muted">Pick a batch on the left.</p>}
        </section>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className={card}>
          <div>
            <h2 className="text-[16px] font-extrabold text-copy-strong">Who has paid</h2>
            <p className="text-[12.5px] text-copy-muted">Enrolments by course{story.noBatch ? ` · ${n(story.noBatch)} not linked to a batch yet` : ""}</p>
          </div>
          {story.enrolments.length ? (
            <Bars labelWidth={240} max={Math.max(...story.enrolments.map((e) => e.withBatch + e.noBatch), 1)} rows={story.enrolments.map((e) => ({ label: e.course, value: e.withBatch + e.noBatch, shown: e.noBatch ? `${n(e.withBatch + e.noBatch)} · ${n(e.noBatch)} no batch` : n(e.withBatch), tone: e.noBatch ? "amber" : "green" }))} />
          ) : <p className="text-[13px] text-copy-muted">No enrolments yet.</p>}
          <div className="mt-auto"><Link href="/enrollments" className="btn-secondary">Open Enrolments</Link></div>
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
