"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { verifyPaymentAction } from "@/app/enrollments/payment-actions";
import type { PaymentToVerify } from "@/lib/enrollment-panel-data";

function money(value: number, currency: string | null) {
  const cur = currency || "INR";
  return new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(value);
}
const KIND: Record<string, string> = { full: "Full payment", deposit: "First instalment", balance: "Instalment", other: "Payment" };

/** Admins check team-logged payments against bank / payment records. */
export function PaymentsToVerify({ payments }: { payments: PaymentToVerify[] }) {
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const act = (id: string, decision: "verify" | "reject") => start(async () => {
    const r = await verifyPaymentAction(id, decision, decision === "reject" ? reason : null);
    setMsg({ id, ok: r.ok, text: r.ok ? (decision === "verify" ? "Verified" : "Rejected") : r.error });
    if (r.ok) { setRejecting(null); setReason(""); }
  });
  return (
    <section className="card-pad overflow-hidden p-0" aria-label="Payments to verify">
      <div className="border-b border-line px-5 py-4">
        <div className="eyebrow">Admin</div>
        <div className="section-title mt-1">Payments to verify ({payments.length})</div>
        <p className="mt-1 text-xs text-copy-muted">Logged by your team when marking a lead enrolled. Check each against your bank or payment records. Verifying marks it paid and moves the lead to Won.</p>
      </div>
      {payments.length === 0 ? (
        <p className="px-5 py-6 text-xs text-copy-muted">Nothing waiting. New payments logged by the team appear here.</p>
      ) : (
        <ul className="divide-y divide-line">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-xs">
              <div className="min-w-[220px] flex-1">
                <Link href={`/conversations?lead=${p.leadId}`} className="font-semibold text-copy-strong hover:text-brand-700">{p.leadName}</Link>
                <div className="text-copy-muted">{p.courseName ?? "Course"} · {KIND[p.kind] ?? p.kind}</div>
              </div>
              <div className="min-w-[200px]">
                <div className="font-semibold">{money(p.amount, p.currency)} · {p.method ?? "—"}</div>
                <div className="text-copy-muted">Paid {p.paidAt ? p.paidAt.slice(0, 10) : "—"}{p.reference ? ` · Ref ${p.reference}` : " · no reference"}</div>
              </div>
              {rejecting === p.id ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? (required)" className="rounded-md border border-line px-2 py-1 text-xs" />
                  <button type="button" disabled={pending || !reason.trim()} onClick={() => act(p.id, "reject")} className="rounded-md bg-rose-600 px-2.5 py-1 font-semibold text-white disabled:opacity-60">Reject</button>
                  <button type="button" onClick={() => setRejecting(null)} className="rounded-md border border-line px-2.5 py-1">Cancel</button>
                </div>
              ) : msg?.id === p.id && msg.ok ? (
                <span className="font-semibold text-emerald-700">{msg.text}</span>
              ) : (
                <div className="flex gap-1.5">
                  <button type="button" disabled={pending} onClick={() => act(p.id, "verify")} className="rounded-md bg-emerald-600 px-2.5 py-1 font-semibold text-white disabled:opacity-60">Verify</button>
                  <button type="button" disabled={pending} onClick={() => setRejecting(p.id)} className="rounded-md border border-line px-2.5 py-1">Reject…</button>
                </div>
              )}
              {msg?.id === p.id && !msg.ok ? <span className="w-full text-rose-700">{msg.text}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
