"use client";
import { useFeedbackMessages } from '@/components/use-feedback-messages';

import { CheckCircle2, GraduationCap, Plus } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { logEnrollmentPaymentAction, recordEnrollmentAction } from "@/app/enrollments/payment-actions";
import type { EnrollmentCatalog, EnrollmentPanel } from "@/lib/enrollment-panel-data";

const METHODS = [
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "gateway", label: "Payment gateway" },
  { value: "paypal", label: "PayPal" },
  { value: "cash", label: "Cash" },
];

function money(value: number | null, currency: string | null) {
  if (value == null) return "—";
  const cur = currency || "INR";
  return new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(value);
}
const field = "w-full rounded-md border border-line bg-white px-2 py-1.5 text-[12px]";
const label = "grid gap-1 text-[11px] font-semibold text-copy-muted";

/** Enrolments and payments for a lead, with Mark enrolled and Log payment (Inbox side panel). */
export function InboxEnrollment({ leadId, panel }: { leadId: string; panel: EnrollmentPanel }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<"full" | "instalment" | "unpaid" | "">("");
  const [courseId, setCourseId] = useState(panel.defaults.courseId ?? "");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<EnrollmentCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const catalogRequest = useRef<AbortController | null>(null);
  useEffect(() => () => {
    const controller = catalogRequest.current;
    catalogRequest.current = null;
    controller?.abort();
  }, []);
  useFeedbackMessages(error);
  useFeedbackMessages(null, done);
  const [pending, start] = useTransition();

  const closeEnrollment = () => {
    const controller = catalogRequest.current;
    catalogRequest.current = null;
    controller?.abort();
    setCatalogLoading(false); setCatalog(null); setOpen(false);
  };

  const loadCatalog = async () => {
    if (catalogRequest.current) return;
    const controller = new AbortController();
    catalogRequest.current = controller;
    setCatalog(null); setCatalogLoading(true); setError(null);
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/enrollment-catalog`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.courses) || !Array.isArray(data.batches)) throw new Error(data.error || 'Enrollment choices could not be loaded. Please try again.');
      if (!controller.signal.aborted) setCatalog(data);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Enrollment choices could not be loaded. Please try again.');
    } finally {
      if (catalogRequest.current === controller) { catalogRequest.current = null; setCatalogLoading(false); }
    }
  };

  const submit = (form: FormData) => start(async () => {
    if (!catalog || catalogLoading) return;
    setError(null);
    const r = await recordEnrollmentAction(leadId, form);
    if (!r.ok) { setError(r.error); return; }
    setOpen(false); setDone("Marked enrolled. An admin will verify the payment.");
  });
  const submitPayment = (enrollmentId: string, form: FormData) => start(async () => {
    setError(null);
    const r = await logEnrollmentPaymentAction(enrollmentId, form);
    if (!r.ok) { setError(r.error); return; }
    setPayFor(null); setDone("Payment logged. An admin will verify it.");
  });

  return (
    <section className="ibx-enrollment" aria-label="Enrolment and payments">
      <div className="flex items-center gap-2">
        <GraduationCap size={14} aria-hidden className="text-brand-600" />
        <strong className="text-[12px]">Enrolment</strong>
        {panel.canRecord && !open ? (
          <button type="button" onClick={() => { setOpen(true); setDone(null); void loadCatalog(); }} className="ml-auto inline-flex items-center gap-1 rounded-md bg-brand-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-brand-700">
            <Plus size={12} aria-hidden /> Mark enrolled
          </button>
        ) : null}
      </div>

      {!panel.canRecord && panel.enrollments.length === 0 ? (
        <p className="mt-1 text-[11px] text-copy-muted">
          {panel.ownerAssigned ? "Only the lead's assigned team member or an admin can mark it enrolled." : "Assign this lead to a team member, or ask an admin, to mark it enrolled."}
        </p>
      ) : null}

      {panel.enrollments.map((e) => {
        const balance = e.total != null ? Math.max(0, e.total - e.paidVerified - e.paidPending) : null;
        return (
          <div key={e.id} className="mt-2 rounded-lg border border-line bg-white px-2 py-1.5 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 font-semibold">{e.courseName}{e.batchLabel ? ` · ${e.batchLabel}` : ""}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${e.status === "confirmed" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                {e.status === "pending" ? "Payment to verify" : e.status}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-copy-muted">
              <span>Total<br /><b className="text-copy">{money(e.total, e.currency)}</b></span>
              <span>Paid (verified)<br /><b className="text-copy">{money(e.paidVerified, e.currency)}</b>{e.paidPending ? <><br />+{money(e.paidPending, e.currency)} to verify</> : null}</span>
              <span>Balance<br /><b className="text-copy">{money(balance, e.currency)}</b>{e.balanceDueDate && balance ? <><br />due {e.balanceDueDate}</> : null}{!e.payments.length && e.expectedPaymentDate ? <><br />expected {e.expectedPaymentDate}</> : null}</span>
            </div>
            {e.payments.length ? (
              <ul className="mt-1 grid gap-0.5 text-[10px]">
                {e.payments.map((p) => (
                  <li key={p.id} className="flex gap-1">
                    {p.status === "paid" ? <CheckCircle2 size={11} className="text-emerald-600" aria-label="Verified" /> : <span className="w-[11px]" />}
                    <span>{money(p.amount, p.currency)} · {p.method ?? "—"}{p.paidAt ? ` · ${p.paidAt.slice(0, 10)}` : ""}</span>
                    <span className="ml-auto text-copy-muted">{p.status === "pending" ? "to verify" : p.status === "failed" ? `rejected${p.rejectReason ? `: ${p.rejectReason}` : ""}` : p.status}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {panel.canRecord && balance !== 0 ? (
              payFor === e.id ? (
                <form action={(fd) => submitPayment(e.id, fd)} className="mt-1.5 grid gap-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className={label}>Amount<input name="amount" inputMode="decimal" required className={field} /></label>
                    <label className={label}>Paid on<input name="paid_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={field} /></label>
                    <label className={label}>Method<select name="payment_method" required defaultValue="" className={field}><option value="" disabled>Choose…</option>{METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
                    <label className={label}>Reference<input name="payment_reference" className={field} placeholder="Optional" /></label>
                  </div>
                  <div className="flex gap-1.5">
                    <button type="submit" disabled={pending} className="rounded-md bg-brand-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60">Log payment</button>
                    <button type="button" onClick={() => setPayFor(null)} className="rounded-md border border-line px-2 py-1 text-[11px]">Cancel</button>
                  </div>
                </form>
              ) : (
                <button type="button" onClick={() => setPayFor(e.id)} className="mt-1 text-[10px] font-semibold text-brand-700 hover:underline">+ Log a payment</button>
              )
            ) : null}
          </div>
        );
      })}

      {open ? (
        <form action={submit} className="mt-2 grid gap-2 rounded-lg border border-brand-200 bg-brand-50/40 p-2">
          {catalogLoading ? <p role="status" className="text-[11px] text-copy-muted">Loading enrollment choices…</p> : !catalog ? <button type="button" onClick={() => void loadCatalog()} className="text-left text-[11px] font-semibold text-brand-700">Retry loading choices</button> : null}
          <fieldset className="grid gap-1.5">
            <legend className="text-[11px] font-semibold">Payment status <span className="text-rose-700">*</span></legend>
            {([["full", "Paid in full"], ["instalment", "First instalment paid"], ["unpaid", "Not paid yet"]] as const).map(([v, l]) => (
              <label key={v} className="flex items-center gap-1.5 text-[12px]">
                <input type="radio" name="payment_plan" value={v} required checked={plan === v} onChange={() => setPlan(v)} /> {l}
              </label>
            ))}
          </fieldset>
          {plan === "full" || plan === "instalment" ? (
            <div className="grid grid-cols-2 gap-1.5">
              <label className={label}>Amount paid *<input name="amount_paid" inputMode="decimal" required className={field} /></label>
              <label className={label}>Paid on<input name="paid_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={field} /></label>
              <label className={label}>Method *<select name="payment_method" required defaultValue="" className={field}><option value="" disabled>Choose…</option>{METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
              <label className={label}>Reference<input name="payment_reference" className={field} placeholder="UPI / transaction ID" /></label>
            </div>
          ) : null}
          {plan === "unpaid" ? (
            <label className={label}>Payment expected on *<input name="expected_payment_date" type="date" required className={field} /></label>
          ) : null}
          <details className="text-[11px]">
            <summary className="cursor-pointer font-semibold text-brand-700">Course, batch and total (optional)</summary>
            <div className="mt-1.5 grid gap-1.5">
              <label className={label}>Course
                <select name="course_id" value={courseId} onChange={(e) => setCourseId(e.target.value)} className={field}>
                  <option value="">Lead's main course</option>
                  {(catalog?.courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className={label}>Batch
                <select name="batch_id" defaultValue="" className={field}>
                  <option value="">Not chosen yet</option>
                  {(catalog?.batches ?? []).filter((b) => b.courseId === (courseId || panel.defaults.courseId)).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-[1fr_80px] gap-1.5">
                <label className={label}>Agreed total<input name="total_value" inputMode="decimal" placeholder={panel.defaults.total != null ? String(panel.defaults.total) : "Estimated value"} className={field} /></label>
                <label className={label}>Currency<select name="currency" defaultValue={panel.defaults.currency} className={field}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option></select></label>
              </div>
              <label className={label}>Note<input name="note" className={field} placeholder="Optional" /></label>
            </div>
          </details>
          <p className="text-[10px] text-copy-muted">An admin verifies the payment before the lead is marked Won.</p>
          <div className="flex gap-1.5">
            <button type="submit" disabled={pending || !plan || catalogLoading || !catalog} className="rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60">Save enrolment</button>
            <button type="button" onClick={closeEnrollment} className="rounded-md border border-line px-2.5 py-1 text-[11px]">Cancel</button>
          </div>
        </form>
      ) : null}
      {done ? <p className="mt-1 text-[11px] text-emerald-700">{done}</p> : null}
      {error ? <p className="mt-1 text-[11px] text-rose-700">{error}</p> : null}
    </section>
  );
}
