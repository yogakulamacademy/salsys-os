"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import {
  checkoutNotReceivedAction, confirmPaidAction, markTestLeadAction, mergePeopleAction, notJoiningAction, stillDecidingAction,
} from "@/app/admissions/payment-check-actions";
import {
  duplicateHints, largestAttempt, looksLikeOwnBusiness, moneyText, sortForChecking, suggestedAmount,
  type PaymentCheckPerson,
} from "@/lib/payment-check";

// "Check who paid" (owner-approved mockup, 25 Nov 2026): one row per person,
// most likely to have paid first. Paid → a short pre-filled form; admins
// confirm in one step, others log it for an admin. Nothing is sent to anyone.

type Course = { id: string; name: string; batches: Array<{ id: string; label: string }> };
type Props = { people: PaymentCheckPerson[]; checkoutOnly: PaymentCheckPerson[]; courses: Course[]; businessNames: string[]; isAdmin: boolean; canMerge: boolean };

const pill = (tone: "green" | "amber" | "blue" | "grey" | "red") => ({
  green: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  amber: "bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300",
  blue: "bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-300",
  grey: "bg-surface-muted text-copy-muted",
  red: "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300",
}[tone]);
const Pill = ({ tone, children }: { tone: Parameters<typeof pill>[0]; children: React.ReactNode }) => (
  <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[12px] font-bold ${pill(tone)}`}>{children}</span>
);
const initials = (n: string) => n.replace(/[_.]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "•";
const today = () => new Date().toISOString().slice(0, 10);
const METHODS = [["upi", "UPI"], ["bank_transfer", "Bank transfer"], ["gateway", "Card / payment gateway"], ["paypal", "PayPal"], ["cash", "Cash"]] as const;

function PaidForm({ p, courses, isAdmin, onDone, onCancel }: { p: PaymentCheckPerson; courses: Course[]; isAdmin: boolean; onDone: (msg: string) => void; onCancel: () => void }) {
  const guess = suggestedAmount(p);
  const [courseId, setCourseId] = useState(p.courseId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const batches = courses.find((c) => c.id === courseId)?.batches ?? [];
  const field = "h-9 w-full rounded-[9px] border border-line bg-surface px-2.5 text-[13px] text-copy-strong";
  const label = "mb-1 block text-[11.5px] font-bold text-copy-muted";
  return (
    <form
      className="ml-12 mt-1.5 grid grid-cols-2 gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/10 md:grid-cols-4 xl:grid-cols-7"
      action={(form) => start(async () => {
        setError(null);
        const res = await confirmPaidAction(p.leadId, form);
        if (res.ok) onDone(res.message); else setError(res.error);
      })}
    >
      <input type="hidden" name="as_admin" value={isAdmin ? "1" : "0"} />
      {guess.checkoutId ? <input type="hidden" name="checkout_id" value={guess.checkoutId} /> : null}
      <label className="col-span-2"><span className={label}>Course</span>
        <select name="course_id" value={courseId} onChange={(e) => setCourseId(e.target.value)} className={field} required>
          <option value="">Choose…</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label><span className={label}>Batch</span>
        <select name="batch_id" className={field} defaultValue=""><option value="">Not chosen yet</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
      </label>
      <label><span className={label}>Amount paid</span>
        <div className="flex gap-1">
          <select name="currency" defaultValue={guess.currency} className={`${field} w-[70px] px-1.5`}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></select>
          <input name="amount" inputMode="decimal" defaultValue={guess.amount ?? ""} className={field} required />
        </div>
      </label>
      <label><span className={label}>Paid on</span><input type="date" name="paid_on" defaultValue={today()} max={today()} className={field} required /></label>
      <label><span className={label}>How</span>
        <select name="method" defaultValue={guess.method} className={field}>{METHODS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
      </label>
      <label><span className={label}>Type</span>
        <select name="kind" defaultValue="full" className={field}><option value="full">Paid in full</option><option value="deposit">Deposit / first part</option></select>
      </label>
      <label className="col-span-2 md:col-span-3 xl:col-span-4"><span className={label}>Reference (optional)</span>
        <input name="reference" maxLength={120} placeholder="UPI or bank reference, receipt number…" className={field} />
      </label>
      <div className="col-span-2 flex items-end gap-2 md:col-span-1 xl:col-span-3">
        <button type="submit" disabled={pending} className="btn-primary">{pending ? "Saving…" : isAdmin ? "Confirm and enrol" : "Log for admin to verify"}</button>
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
      </div>
      <p className="col-span-full text-[12px] text-copy-muted">
        {guess.checkoutId ? "Filled from the checkout they started on your website. " : "Filled from the course price. "}
        Check it against your bank, UPI or PayPal before saving. Never enter card or bank account numbers.
        {isAdmin ? " Confirming marks the payment paid, enrols them and moves them to Closed won." : " An admin will verify it before it counts as paid."}
      </p>
      {error ? <p className="col-span-full text-[12.5px] font-semibold text-red-700">{error}</p> : null}
    </form>
  );
}

function Row({ p, courses, isAdmin, canMerge, dup, own, onDone }: {
  p: PaymentCheckPerson; courses: Course[]; isAdmin: boolean; canMerge: boolean;
  dup: { otherLeadId: string; otherName: string; samePerson: boolean } | null; own: boolean; onDone: (msg: string) => void;
}) {
  const [open, setOpen] = useState<null | "paid" | "deciding" | "not">(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    setError(null);
    const r = await fn();
    if (r.ok) onDone(r.message ?? "Done"); else setError(r.error ?? "Something went wrong");
  });
  const biggest = largestAttempt(p.attempts);
  return (
    <div className="border-t border-line py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-brand-50 text-[12px] font-bold text-brand-700">{initials(p.name)}</span>
        <div className="min-w-[260px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/leads/${p.leadId}`} className="text-[14px] font-bold text-copy-strong hover:underline">{p.name}</Link>
            {own ? <Pill tone="amber">Looks like your own number</Pill> : null}
            {p.saysPaid ? <Pill tone="green">Says they paid</Pill> : null}
            {biggest ? <Pill tone="blue">Started paying on the website · {moneyText(biggest.amount, biggest.currency)}{p.attempts.length > 1 ? ` · ${p.attempts.length} tries` : ""}</Pill> : null}
            {dup ? <Pill tone="amber">{dup.samePerson ? `Same person as ${dup.otherName}` : `May be the same person as ${dup.otherName}`}</Pill> : null}
            {!own && !p.saysPaid && !biggest ? <Pill tone="grey">No sign of payment yet</Pill> : null}
          </div>
          <div className="truncate text-[12px] text-copy-muted">
            {[p.courseName ?? "Course not set", p.value ? `≈ ${moneyText(p.value, p.currency)}` : null, p.channel ? p.channel[0].toUpperCase() + p.channel.slice(1) : null, p.daysWaiting != null ? `${p.daysWaiting} days at this stage` : null].filter(Boolean).join(" · ")}
          </div>
          {p.lastInbound ? <div className="mt-0.5 truncate text-[12.5px] text-copy">“{p.lastInbound}”</div> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {own ? (
            <button type="button" disabled={pending} className="btn-secondary" onClick={() => run(() => notJoiningAction(p.leadId, "lost", "Our own number, not a customer"))}>Remove from pipeline</button>
          ) : (
            <>
              <button type="button" disabled={pending} className="btn-primary" onClick={() => setOpen(open === "paid" ? null : "paid")}>✓ Paid</button>
              <button type="button" disabled={pending} className="btn-secondary" onClick={() => setOpen(open === "deciding" ? null : "deciding")}>Still deciding</button>
              <button type="button" disabled={pending} className="btn-secondary" onClick={() => setOpen(open === "not" ? null : "not")}>Not joining</button>
              {dup && !dup.samePerson && canMerge ? (
                <button type="button" disabled={pending} className="btn-secondary" title={`Merge ${dup.otherName} into ${p.name}; both enquiries are kept`} onClick={() => run(() => mergePeopleAction(p.leadId, dup.otherLeadId))}>Same person: merge</button>
              ) : null}
            </>
          )}
        </div>
      </div>
      {open === "paid" ? <PaidForm p={p} courses={courses} isAdmin={isAdmin} onDone={onDone} onCancel={() => setOpen(null)} /> : null}
      {open === "deciding" ? (
        <div className="ml-12 mt-1.5 flex flex-wrap items-center gap-2 rounded-xl bg-surface-muted px-3.5 py-2.5 text-[13px]">
          <span className="font-semibold text-copy-muted">Follow up</span>
          {[[1, "Tomorrow"], [3, "In 3 days"], [7, "Next week"], [14, "In 2 weeks"]].map(([d, t]) => (
            <button key={t} type="button" disabled={pending} className="btn-secondary" onClick={() => run(() => stillDecidingAction(p.leadId, Number(d), null))}>{t}</button>
          ))}
        </div>
      ) : null}
      {open === "not" ? (
        <div className="ml-12 mt-1.5 flex flex-wrap items-center gap-2 rounded-xl bg-surface-muted px-3.5 py-2.5 text-[13px]">
          <button type="button" disabled={pending} className="btn-secondary" onClick={() => run(() => notJoiningAction(p.leadId, "not_now", "Not joining for now (Check who paid)"))}>Not now · they can come back</button>
          <button type="button" disabled={pending} className="btn-secondary" onClick={() => run(() => notJoiningAction(p.leadId, "lost", "Not joining (Check who paid)"))}>Lost</button>
          {p.attempts.length && isAdmin ? (
            <button type="button" disabled={pending} className="btn-secondary" onClick={() => run(() => checkoutNotReceivedAction(p.leadId, p.attempts.map((a) => a.id)))}>Website payment never arrived</button>
          ) : null}
          {canMerge ? (
            <button type="button" disabled={pending} className="btn-secondary" title="Our own test: moves to Unqualified, cancels its checkouts and leaves it out of every number" onClick={() => run(() => markTestLeadAction(p.leadId))}>This is our test</button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="ml-12 mt-1 text-[12.5px] font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}

export function PaymentCheckQueue({ people, checkoutOnly, courses, businessNames, isAdmin, canMerge }: Props) {
  const [done, setDone] = useState<Record<string, string>>({});
  const all = useMemo(() => [...people, ...checkoutOnly], [people, checkoutOnly]);
  const hints = useMemo(() => duplicateHints(all), [all]);
  const sorted = useMemo(() => sortForChecking(people), [people]);
  const total = people.length;
  const checked = people.filter((p) => done[p.leadId]).length;
  const visible = (list: PaymentCheckPerson[]) => list.filter((p) => !done[p.leadId]);
  const recent = Object.entries(done).slice(-3);
  const row = (p: PaymentCheckPerson) => {
    const h = hints.find((x) => x.leadId === p.leadId && !done[x.otherLeadId]);
    return <Row key={p.leadId} p={p} courses={courses} isAdmin={isAdmin} canMerge={canMerge}
      dup={h ? { otherLeadId: h.otherLeadId, otherName: h.otherName, samePerson: h.samePerson } : null}
      own={looksLikeOwnBusiness(p.name, businessNames)}
      onDone={(msg) => setDone((d) => ({ ...d, [p.leadId]: `${p.name}: ${msg}` }))} />;
  };
  return (
    <div className="space-y-3.5">
      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 shadow-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Check who paid · {total} at Payment pending</h2>
          <span className="text-[13px] font-bold text-copy-strong">{checked} of {total} checked</span>
        </div>
        <p className="text-[13px] text-copy-muted">Sorted: says they paid first, then started paying on the website, then the longest waiting. Each answer becomes a real example of who enrols.{isAdmin ? "" : " Payments you log wait for an admin to verify."}</p>
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${total ? (checked / total) * 100 : 0}%` }} /></div>
        {recent.length ? <div className="space-y-0.5">{recent.map(([id, msg]) => <p key={id} className="text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-300">✓ {msg}</p>)}</div> : null}
        <div>{visible(sorted).map(row)}</div>
        {!visible(sorted).length ? <p className="py-3 text-[13px] text-copy-muted">Everyone at Payment pending has been checked.</p> : null}
      </section>

      {visible(checkoutOnly).length ? (
        <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-copy-muted">Started paying on the website · not at Payment pending</h2>
          <p className="text-[13px] text-copy-muted">These people opened a checkout on your website (PayPal, UPI or card) but the CRM never heard whether it went through. Check your PayPal or bank, then mark it.</p>
          <div>{visible(checkoutOnly).sort((a, b) => b.attempts.length - a.attempts.length).map(row)}</div>
        </section>
      ) : null}
    </div>
  );
}
