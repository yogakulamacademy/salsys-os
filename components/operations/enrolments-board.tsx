"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { assignEnrollmentBatchAction } from "@/app/course-management/actions";
import { KpiRow, PageHead, card } from "@/components/marketing/smart-blocks";
import { enrolDay, money, type EnrolBoard, type EnrolRow } from "@/lib/enrolments-board";
import { toast } from "@/lib/toast";

// Enrolments board (owner-approved prototype "Programs & Batches and Enrolments –
// prototype", 26 Nov 2026): paid students waiting for a batch, assigned through
// the audited assign_enrollment_batch_v1 action.

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const seg = (on: boolean) => `h-8 rounded-lg px-3 text-[12.5px] font-bold ${on ? "bg-brand-600 text-white" : "text-copy-muted hover:text-copy-strong"}`;
const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

export function EnrolmentsBoard({ board }: { board: EnrolBoard }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [show, setShow] = useState<"wait" | "all">(board.waiting ? "wait" : "all");
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const rows = useMemo(() => board.rows.filter((r) => show === "all" || r.waiting), [board.rows, show]);
  const chosen = (r: EnrolRow) => pick[r.id] ?? (r.batchId && r.options.some((o) => o.id === r.batchId) ? r.batchId : r.suggested) ?? "";

  function assign(list: EnrolRow[]) {
    const todo = list.map((r) => [r, chosen(r)] as const).filter(([, b]) => b);
    if (!todo.length) { toast.error("Pick a batch first."); return; }
    start(async () => {
      let ok = 0;
      let firstError = "";
      for (const [r, batchId] of todo) {
        setBusy(r.id);
        const res = await assignEnrollmentBatchAction(r.id, batchId);
        if (res.ok) ok += 1; else firstError ||= `${r.leadName}: ${res.message}`;
      }
      setBusy(null);
      setChanging(null);
      if (ok) toast.success(ok === 1 && todo.length === 1 ? "Student assigned to the batch." : `${n(ok)} students assigned.`);
      if (firstError) toast.error("Some students weren’t assigned", { description: firstError });
      router.refresh();
    });
  }

  const fill = board.batches.slice(0, 8);
  const waitingWithOption = board.rows.filter((r) => r.waiting && r.suggested);

  return (
    <div className="flex flex-col gap-3.5" aria-label="Enrolments">
      <PageHead eyebrow="Operations" title="Enrolments" headline={board.headline}
        right={waitingWithOption.length > 1 ? <button type="button" disabled={pending} onClick={() => assign(waitingWithOption)} className="btn-primary">Assign all to the suggested batch</button> : null} />
      <KpiRow kpis={board.kpis} />

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-extrabold text-copy-strong">{show === "wait" ? "Paid, waiting for a batch" : "All enrolments"}</h2>
              <p className="text-[12.5px] text-copy-muted">Suggested batch = the next batch of the same course with room; change it if the student asked for another date.</p>
            </div>
            <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="Show">
              <button type="button" aria-pressed={show === "wait"} onClick={() => setShow("wait")} className={seg(show === "wait")}>Waiting ({n(board.waiting)})</button>
              <button type="button" aria-pressed={show === "all"} onClick={() => setShow("all")} className={seg(show === "all")}>All ({n(board.rows.length)})</button>
            </div>
          </div>
          {rows.length ? (
            <div>
              {rows.map((r) => {
                const current = r.batchId ? r.options.find((o) => o.id === r.batchId) : null;
                const editing = r.waiting || changing === r.id;
                return (
                  <div key={r.id} className={`grid grid-cols-[40px_minmax(0,1fr)_100px] items-center gap-3 border-t border-line px-1.5 py-3 md:grid-cols-[40px_minmax(0,1.1fr)_104px_minmax(0,1.5fr)_112px] ${!r.waiting ? "bg-emerald-50/40 dark:bg-emerald-950/10" : ""}`}>
                    <span className="grid size-10 place-items-center rounded-xl bg-brand-50 font-extrabold text-brand-700 dark:bg-brand-950/40 dark:text-brand-200">{initial(r.leadName)}</span>
                    <span className="min-w-0">
                      <Link href={`/leads/${r.leadId}`} className="block truncate text-[14px] font-bold text-copy-strong hover:text-brand-700">{r.leadName}</Link>
                      <span className="block truncate text-[12px] text-copy-muted">{r.courseName}</span>
                    </span>
                    <span>
                      <span className="block text-[14px] font-bold tabular-nums text-copy-strong">{r.totalValue != null ? money(r.totalValue, r.currency) : "—"}</span>
                      <span className="block text-[12px] text-copy-muted">{r.status === "confirmed" ? "paid" : r.status} {enrolDay(r.createdAt)}</span>
                    </span>
                    <span className="col-span-3 min-w-0 md:col-span-1">
                      {editing ? (
                        r.options.length ? (
                          <select aria-label={`Batch for ${r.leadName}`} value={chosen(r)} onChange={(e) => setPick((p) => ({ ...p, [r.id]: e.target.value }))}
                            className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-copy-strong">
                            {r.options.map((o) => (
                              <option key={o.id} value={o.id}>
                                {enrolDay(o.start)}{o.end ? ` – ${enrolDay(o.end)}` : ""} · {o.place}{o.id === r.suggested ? " (suggested)" : ""}{o.capacity ? ` · ${n(Math.max(o.capacity - o.enrolled, 0))} seats left` : ""}{!o.open ? " · not taking bookings" : ""}
                              </option>
                            ))}
                          </select>
                        ) : <Link href="/course-management" className="text-[12.5px] font-semibold text-orange-700 hover:underline dark:text-orange-300">No upcoming batch for this course · add one</Link>
                      ) : (
                        <span className="text-[12.5px] font-extrabold text-emerald-700 dark:text-emerald-300">✓ {current ? `${enrolDay(current.start)} batch · ${current.place}` : "In a batch"}</span>
                      )}
                    </span>
                    <span className="col-span-3 md:col-span-1 md:justify-self-end">
                      {editing ? (
                        r.options.length ? <button type="button" disabled={pending} onClick={() => assign([r])} className="btn-primary h-9">{busy === r.id ? "Saving…" : r.waiting ? "Assign" : "Move"}</button> : null
                      ) : r.options.length ? <button type="button" onClick={() => setChanging(r.id)} className="btn-secondary h-9">Change</button> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : <p className="px-1 py-3 text-[13px] text-copy-muted">Everyone who enrolled is in a batch.</p>}
        </section>

        <section className={card}>
          <div>
            <h2 className="text-[16px] font-extrabold text-copy-strong">How the batches fill</h2>
            <p className="text-[12.5px] text-copy-muted">Upcoming batches of the courses people enrolled in</p>
          </div>
          {fill.length ? fill.map((b) => {
            const course = board.rows.find((r) => r.courseId === b.courseId)?.courseName ?? "Course";
            return (
              <div key={b.id} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-2.5 border-t border-line py-2 text-[13px]">
                <span className="min-w-0"><span className="block truncate font-bold text-copy-strong">{course}</span><span className="block text-[12px] text-copy-muted">{enrolDay(b.start)} · {b.place}</span></span>
                <span className="text-right"><strong className="text-copy-strong">{n(b.enrolled)}</strong> enrolled<span className="block text-[12px] text-copy-muted">{b.capacity ? `of ${n(b.capacity)} seats` : "no seat count"}</span></span>
              </div>
            );
          }) : <p className="text-[13px] text-copy-muted">No upcoming batches for these courses.</p>}
          <Link href="/course-management" className="btn-secondary self-start">Set seats in Programs & Batches</Link>
        </section>
      </div>
    </div>
  );
}
