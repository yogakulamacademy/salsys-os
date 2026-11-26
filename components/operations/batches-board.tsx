"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { saveBatchBoardChangesAction, type BatchBoardChange } from "@/app/course-management/actions";
import { KpiRow, PageHead, RankCards, SignalList, card } from "@/components/marketing/smart-blocks";
import { boardDay, boardView, type BatchBoard, type BoardBatch, type BoardEdit, type BoardFilters } from "@/lib/batches-board";
import { toast } from "@/lib/toast";

// Programs & Batches board (owner-approved prototype "Programs & Batches and
// Enrolments – prototype", 26 Nov 2026): every upcoming batch by course, typed
// edits saved together through the same audited batch RPCs.

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const RANGES: Array<[number | null, string]> = [[14, "14 days"], [30, "30 days"], [60, "60 days"], [null, "All"]];
const seg = (on: boolean) => `h-8 rounded-lg px-3 text-[12.5px] font-bold ${on ? "bg-brand-600 text-white" : "text-copy-muted hover:text-copy-strong"}`;
const chip = (on: boolean) => `h-8 rounded-full border px-3 text-[12.5px] font-bold ${on ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-200" : "border-line bg-surface text-copy-muted hover:text-copy-strong"}`;
const input = "h-8 w-full rounded-lg border bg-surface px-2 text-[13px] text-copy-strong tabular-nums outline-none focus:border-brand-500";
const COLS = "grid-cols-[24px_86px_minmax(0,1fr)_92px_170px_64px] xl:grid-cols-[24px_92px_minmax(0,130px)_minmax(0,1fr)_96px_190px_74px]";

export function BatchesBoard({ board, focus = [] }: { board: BatchBoard; focus?: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<BoardFilters>({ days: 60, place: "all", missingSeats: false, missingFee: false, waiting: false });
  const [edits, setEdits] = useState<Record<string, BoardEdit>>({});
  const [sel, setSel] = useState<Set<string>>(() => new Set(focus));
  const [bulk, setBulk] = useState({ seats: "", fee: "" });
  const view = useMemo(() => boardView(board, f, edits), [board, f, edits]);
  const original = useMemo(() => new Map(board.batches.map((b) => [b.id, b])), [board]);
  const maxWarm = Math.max(1, ...board.batches.map((b) => b.warm ?? 0));
  const changed = Object.keys(edits).length;

  useEffect(() => {
    if (!focus.length) return;
    const far = focus.map((id) => original.get(id)).filter(Boolean).some((b) => (b as BoardBatch).days > 60);
    if (far) setF((x) => ({ ...x, days: null }));
    const t = setTimeout(() => document.getElementById(`batch-${focus[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
    return () => clearTimeout(t);
  }, [focus, original]);

  function edit(id: string, patch: BoardEdit) {
    setEdits((all) => {
      const base = original.get(id);
      if (!base) return all;
      const next: BoardEdit = { ...all[id], ...patch };
      if ("capacity" in next && (next.capacity ?? null) === (base.capacity ?? null)) delete next.capacity;
      if ("fee" in next && (next.fee ?? null) === (base.fee ?? null)) delete next.fee;
      if (next.currency && next.currency === (base.currency ?? "INR")) delete next.currency;
      if ("open" in next && next.open === base.open) delete next.open;
      const out = { ...all };
      if (Object.keys(next).length) out[id] = next; else delete out[id];
      return out;
    });
  }
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

  function applyBulk() {
    const seats = numOrNull(bulk.seats), fee = numOrNull(bulk.fee);
    if (seats == null && fee == null) { toast.error("Type seats or a fee first."); return; }
    if (seats != null && (!Number.isInteger(seats) || seats < 1)) { toast.error("Seats must be a whole number of 1 or more."); return; }
    sel.forEach((id) => edit(id, { ...(seats != null ? { capacity: seats } : {}), ...(fee != null ? { fee } : {}) }));
    toast.success(`Set for ${n(sel.size)} batches. Review, then Save changes.`);
    setSel(new Set());
    setBulk({ seats: "", fee: "" });
  }

  function save() {
    const changes: BatchBoardChange[] = Object.entries(edits).map(([batchId, e]) => ({ batchId, ...e }));
    for (const c of changes) {
      if (c.capacity != null && (!Number.isInteger(c.capacity) || c.capacity < 1)) { toast.error("Seats must be a whole number of 1 or more."); return; }
      if (c.fee != null && (!Number.isFinite(c.fee) || c.fee < 0)) { toast.error("The fee must be a number of 0 or more."); return; }
    }
    start(async () => {
      const res = await saveBatchBoardChangesAction(changes);
      if (res.ok) { toast.success(res.message); setEdits({}); router.refresh(); }
      else toast.error("Not everything was saved", { description: res.message });
    });
  }

  const toggleSel = (id: string) => setSel((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });

  return (
    <div className="flex flex-col gap-3.5" aria-label="Programs and batches">
      <PageHead eyebrow="Operations" title="Programs & Batches" headline={board.headline}
        right={<Link href="/course-management?view=classic" className="btn-secondary">New batch or course details</Link>} />
      <RankCards ranks={board.ranks} />
      <KpiRow kpis={view.kpis} />

      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-extrabold text-copy-strong">Every batch, by course</h2>
            <p className="text-[12.5px] text-copy-muted">Type seats and fees straight into the rows, then save once. Tick several batches to set the same seats or fee for all of them.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="Time range">
              {RANGES.map(([d, l]) => <button key={l} type="button" aria-pressed={f.days === d} onClick={() => setF((x) => ({ ...x, days: d }))} className={seg(f.days === d)}>{l}</button>)}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={f.missingSeats} onClick={() => setF((x) => ({ ...x, missingSeats: !x.missingSeats }))} className={chip(f.missingSeats)}>Missing seats</button>
          <button type="button" aria-pressed={f.missingFee} onClick={() => setF((x) => ({ ...x, missingFee: !x.missingFee }))} className={chip(f.missingFee)}>Missing fee</button>
          <button type="button" aria-pressed={f.waiting} onClick={() => setF((x) => ({ ...x, waiting: !x.waiting }))} className={chip(f.waiting)}>People waiting</button>
          <span className="w-2" />
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="Place">
            {["all", ...board.places].map((p) => <button key={p} type="button" aria-pressed={f.place === p} onClick={() => setF((x) => ({ ...x, place: p }))} className={seg(f.place === p)}>{p === "all" ? "All places" : p}</button>)}
          </div>
        </div>

        {sel.size ? (
          <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-[13px] dark:bg-brand-950/50">
            <strong className="text-copy-strong">{n(sel.size)} selected</strong>
            <label className="flex items-center gap-1.5">Seats <input aria-label="Seats for selected" type="number" min={1} value={bulk.seats} onChange={(e) => setBulk((b) => ({ ...b, seats: e.target.value }))} className={`${input} w-24 border-line`} /></label>
            <label className="flex items-center gap-1.5">Fee <input aria-label="Fee for selected" type="number" min={0} value={bulk.fee} onChange={(e) => setBulk((b) => ({ ...b, fee: e.target.value }))} className={`${input} w-28 border-line`} /></label>
            <button type="button" onClick={applyBulk} className="btn-primary">Apply to selected</button>
            <button type="button" onClick={() => setSel(new Set())} className="btn-secondary">Clear</button>
          </div>
        ) : null}

        {view.groups.length ? view.groups.map((g) => {
          const miss = g.batches.filter((b) => !(b.capacity ?? 0)).length;
          return (
            <details key={g.courseId} open className="border-t border-line pt-1.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-1.5 py-2 hover:bg-surface-muted">
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-bold text-copy-strong">{g.course}</span>
                  <span className="block text-[12px] text-copy-muted">{n(g.batches.length)} batch{g.batches.length === 1 ? "" : "es"}{g.warm != null ? ` · ${n(g.warm)} warm people for this course` : ""} · {miss ? `${n(miss)} without seats` : "seats set"}</span>
                </span>
                <Link href={`/course-management?view=classic&course=${g.courseId}`} className="btn-secondary h-8 text-[12.5px]">Edit course</Link>
              </summary>
              <div className={`grid ${COLS} items-center gap-2.5 px-1.5 pb-1 text-[11.5px] font-semibold text-copy-muted`}>
                <span /><span>Starts</span><span className="hidden xl:block">Place</span><span>Warm people for this place</span><span>Seats</span><span>Expected fee</span><span className="text-center">Bookings</span>
              </div>
              {g.batches.map((b) => {
                const e = edits[b.id] ?? {};
                const picked = sel.has(b.id);
                return (
                  <div key={b.id} id={`batch-${b.id}`} className={`grid ${COLS} items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-[13px] hover:bg-surface-muted ${picked ? "bg-brand-50/70 dark:bg-brand-950/30" : ""}`}>
                    <input type="checkbox" checked={picked} onChange={() => toggleSel(b.id)} aria-label={`Select ${b.course} ${boardDay(b.start)}`} className="size-4 accent-brand-600" />
                    <span>
                      <span className="block font-extrabold text-copy-strong">{boardDay(b.start)}</span>
                      <span className="block text-[11.5px] text-copy-muted">{b.days <= 0 ? "today" : `${n(b.days)} days`}{b.end ? ` · to ${boardDay(b.end)}` : ""}</span>
                    </span>
                    <span className="hidden truncate xl:block">{b.place}{b.enrolled ? <span className="block text-[11.5px] text-emerald-700 dark:text-emerald-300">{n(b.enrolled)} enrolled</span> : null}</span>
                    <span className="flex items-center gap-2">
                      {b.warm == null ? <span className="text-copy-subtle">—</span> : (
                        <>
                          <span className="h-2.5 flex-1 overflow-hidden rounded bg-surface-muted"><span className={`block h-full rounded ${(b.warm ?? 0) >= 20 ? "bg-brand-600" : "bg-brand-300"}`} style={{ width: `${((b.warm ?? 0) / maxWarm) * 100}%` }} /></span>
                          <strong className="w-8 text-right tabular-nums text-copy-strong">{n(b.warm)}</strong>
                        </>
                      )}
                    </span>
                    <input aria-label={`Seats for ${b.course} ${boardDay(b.start)}`} type="number" min={1} placeholder="Add seats" value={b.capacity ?? ""}
                      onChange={(ev) => edit(b.id, { capacity: numOrNull(ev.target.value) })}
                      className={`${input} ${"capacity" in e ? "border-brand-500 ring-2 ring-brand-100 dark:ring-brand-900" : !(b.capacity ?? 0) ? "border-orange-200 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/20" : "border-line"}`} />
                    <span className="flex gap-1">
                      <select aria-label="Currency" value={b.currency ?? "INR"} onChange={(ev) => edit(b.id, { currency: ev.target.value })} className="h-8 w-[66px] rounded-lg border border-line bg-surface px-1 text-[12px] text-copy-strong">
                        {["INR", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}
                      </select>
                      <input aria-label={`Expected fee for ${b.course} ${boardDay(b.start)}`} type="number" min={0} placeholder="Add fee" value={b.fee ?? ""}
                        onChange={(ev) => edit(b.id, { fee: numOrNull(ev.target.value) })}
                        className={`${input} ${"fee" in e ? "border-brand-500 ring-2 ring-brand-100 dark:ring-brand-900" : b.fee == null ? "border-orange-200 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/20" : "border-line"}`} />
                    </span>
                    <button type="button" role="switch" aria-checked={b.open} aria-label={`Taking bookings for ${b.course} ${boardDay(b.start)}`} onClick={() => edit(b.id, { open: !b.open })}
                      className={`relative h-[22px] w-[38px] justify-self-center rounded-full transition-colors ${b.open ? "bg-emerald-600" : "bg-line"}`}>
                      <span className={`absolute top-[3px] size-4 rounded-full bg-white transition-all ${b.open ? "left-[19px]" : "left-[3px]"}`} />
                    </button>
                  </div>
                );
              })}
            </details>
          );
        }) : <p className="px-1 py-3 text-[13px] text-copy-muted">No batches match these filters.</p>}

        {changed ? (
          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-copy-strong px-4 py-2.5 text-surface">
            <span className="text-[13px]">{n(changed)} batch{changed === 1 ? "" : "es"} changed · not saved yet</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setEdits({})} disabled={pending} className="h-8 rounded-lg border border-white/30 px-3 text-[13px] font-bold">Discard</button>
              <button type="button" onClick={save} disabled={pending} className="h-8 rounded-lg bg-brand-600 px-3 text-[13px] font-bold text-white disabled:opacity-60">{pending ? "Saving…" : "Save changes"}</button>
            </span>
          </div>
        ) : null}
      </section>

      <section className={card}>
        <div>
          <h2 className="text-[16px] font-extrabold text-copy-strong">What SalsysOS noticed</h2>
          <p className="text-[12.5px] text-copy-muted">Click to open</p>
        </div>
        <SignalList signals={board.signals} />
      </section>
    </div>
  );
}
