"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { fillCourseAction } from "@/app/data-quality/actions";
import { ToastForm } from "@/components/toast-form";
import type { FillRow } from "@/lib/data-quality";

// Fill course worklist (owner-approved mockup, 25 Nov 2026): one suggestion
// per person with the evidence; Fill one, Skip, or fill everyone shown.
// Nothing changes until a button is pressed.

const STAGE: Record<string, string> = { new: "New", contacted: "Contacted", engaged: "Engaged", qualified: "Qualified", high_intent: "High intent", payment_pending: "Payment pending", nurture: "Nurture", not_now: "Not now" };
const DOT: Record<string, string> = { instagram: "bg-pink-500", whatsapp: "bg-emerald-500", website: "bg-blue-500" };
const initials = (s: string) => s.replace(/[_.]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "•";

export function FillCourseTable({ rows }: { rows: FillRow[] }) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [course, setCourse] = useState("");
  const courses = useMemo(() => [...new Set(rows.map((r) => r.courseName))].sort(), [rows]);
  const shown = rows.filter((r) => !skipped.has(r.leadId)
    && (!course || r.courseName === course)
    && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
  const page = shown.slice(0, 60);
  const sure = page.filter((r) => !r.caution);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name…" aria-label="Search name"
          className="h-9 w-60 rounded-[10px] border border-line bg-surface px-3 text-[13px]" />
        <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Suggested course"
          className="h-9 rounded-[10px] border border-line bg-surface px-2 text-[13px]">
          <option value="">All suggested courses</option>
          {courses.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-[12.5px] text-copy-muted">{shown.length.toLocaleString("en-IN")} to review{skipped.size ? ` · ${skipped.size} skipped` : ""}</span>
        {sure.length ? (
          <ToastForm action={fillCourseAction} className="ml-auto">
            {sure.map((r) => <span key={r.leadId}><input type="hidden" name="lead_id" value={r.leadId} /><input type="hidden" name="course_id" value={r.courseId} /></span>)}
            <button type="submit" className="btn-primary h-9">Fill the {sure.length} shown{page.length > sure.length ? " without a warning" : ""}</button>
          </ToastForm>
        ) : null}
      </div>
      <div className="grid grid-cols-[240px_110px_minmax(0,1fr)_250px_minmax(0,1.1fr)_130px] gap-4 bg-surface-soft px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-copy-muted max-xl:hidden">
        <span>Person</span><span>Stage</span><span>Their last message</span><span>Suggested course</span><span>Why</span><span />
      </div>
      {page.map((r) => (
        <div key={r.leadId} className="grid grid-cols-1 items-center gap-2 border-t border-line px-4 py-3 text-[13px] xl:grid-cols-[240px_110px_minmax(0,1fr)_250px_minmax(0,1.1fr)_130px] xl:gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-[11.5px] font-bold text-brand-700">{initials(r.name)}</span>
            <div className="min-w-0">
              <Link href={`/conversations?lead=${r.leadId}`} className="block truncate font-bold text-copy-strong hover:underline">{r.name}</Link>
              <span className="flex items-center gap-1.5 text-[12px] capitalize text-copy-muted"><span className={`size-1.5 rounded-full ${DOT[r.channel ?? ""] ?? "bg-slate-400"}`} />{r.channel ?? "other"}</span>
            </div>
          </div>
          <span><span className="rounded-full bg-brand-50 px-2 py-0.5 text-[12px] font-bold text-brand-700">{STAGE[r.stage] ?? r.stage}</span></span>
          <span className="truncate text-copy" title={r.lastIn ?? ""}>{r.lastIn ? `“${r.lastIn.replace(/\s+/g, " ")}”` : "—"}</span>
          <strong className="text-copy-strong">{r.courseName}</strong>
          <span className="min-w-0 text-[12.5px] text-copy-muted">
            <span className="block truncate" title={r.why}>{r.why}</span>
            {r.caution ? <span className="block font-semibold text-orange-700 dark:text-orange-300">Check: {r.caution}</span> : null}
          </span>
          <div className="flex gap-1.5">
            <ToastForm action={fillCourseAction} resetOnSuccess={false}>
              <input type="hidden" name="lead_id" value={r.leadId} />
              <input type="hidden" name="course_id" value={r.courseId} />
              <button type="submit" className="btn-primary h-8 px-3 text-[12.5px]">Fill</button>
            </ToastForm>
            <button type="button" className="btn-secondary h-8 px-3 text-[12.5px]" onClick={() => setSkipped((s) => new Set(s).add(r.leadId))}>Skip</button>
          </div>
        </div>
      ))}
      {!page.length ? <p className="px-4 py-8 text-center text-[13px] text-copy-muted">Nothing left to fill here.</p> : null}
      {shown.length > page.length ? <p className="border-t border-line px-4 py-3 text-[12.5px] text-copy-muted">Showing the newest {page.length} of {shown.length}. Fill these and the next ones appear.</p> : null}
    </div>
  );
}
