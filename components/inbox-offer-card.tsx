"use client";

import { useState, useTransition } from "react";

import { recordOfferDecisionAction, recordOfferOutcomeAction } from "@/app/conversations/offer-actions";
import type { LeadOfferSuggestion } from "@/lib/offer-suggestion-data";
import {
  CONFIDENCE_START,
  MANAGER_DISCOUNT_THRESHOLD,
  formatMoney,
  needsManagerApproval,
  offerAmount,
  validLabel,
} from "@/lib/offer-suggestion";

type Props = {
  leadId: string;
  firstName: string;
  channel: string | null;
  suggestion: LeadOfferSuggestion;
  canManage: boolean;
};

const VALID_OPTIONS = [24, 48, 72, 168];
const TONE = {
  likely: { ring: "#12703f", text: "text-emerald-700" },
  maybe: { ring: "#b45309", text: "text-amber-700" },
  unlikely: { ring: "#8a87a0", text: "text-copy-muted" },
} as const;

export function InboxOfferCard({ leadId, firstName, channel, suggestion, canManage }: Props) {
  const { confidence, draft, price, latest } = suggestion;
  const [forced, setForced] = useState(false);
  const [editing, setEditing] = useState(false);
  const [basePrice, setBasePrice] = useState(price ? String(price.amount) : "");
  const [currency, setCurrency] = useState(price?.currency ?? "INR");
  const [discount, setDiscount] = useState(draft?.discountPercent ?? 10);
  const [deposit, setDeposit] = useState(draft?.depositText ?? "10% to book");
  const [validHours, setValidHours] = useState(draft?.validHours ?? 72);
  const [courseLabel, setCourseLabel] = useState(suggestion.courseLabel ?? "");
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [approvedText, setApprovedText] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tone = TONE[confidence.verdict];
  const offer = draft ?? (forced ? { kind: "custom" as const, kindLabel: "Custom offer", discountPercent: 10, depositText: "10% to book", validHours: 72, reasons: ["Built on request"] } : null);
  const priceNumber = Number(basePrice);
  const hasPrice = Number.isFinite(priceNumber) && priceNumber > 0;
  const managerNeeded = needsManagerApproval(discount);
  const blockedForManager = managerNeeded && !canManage;

  function submit(decision: "approved" | "declined") {
    if (!offer) return;
    const form = new FormData();
    form.set("lead_id", leadId);
    form.set("decision", decision);
    form.set("offer_kind", offer.kind);
    form.set("course_label", courseLabel);
    form.set("currency", currency);
    form.set("base_price", basePrice);
    form.set("discount_percent", String(discount));
    form.set("deposit_text", deposit);
    form.set("valid_hours", String(validHours));
    form.set("first_name", firstName);
    form.set("ai_confidence", String(confidence.percent));
    form.set("ai_verdict", confidence.verdict);
    form.set("ai_factors", JSON.stringify(confidence.factors));
    form.set("ai_suggested", JSON.stringify(draft ? { kind: draft.kind, discountPercent: draft.discountPercent, depositText: draft.depositText, validHours: draft.validHours } : {}));
    startTransition(async () => {
      const result = await recordOfferDecisionAction(form);
      if (!result.ok) {
        setStatus({ tone: "error", text: result.error });
        return;
      }
      if (result.status === "declined") {
        setStatus({ tone: "ok", text: "Offer declined. Logged on this lead." });
        return;
      }
      setApprovedText(result.message ?? null);
      setEditing(false);
      if (result.message && channel === "whatsapp") {
        // Same event the Co-Pilot uses: the composer fills the reply; the person still presses Send.
        window.dispatchEvent(new CustomEvent("crm:copilot-draft", { detail: { channel: "whatsapp", body: result.message } }));
        setStatus({ tone: "ok", text: "Approved. The offer is in the reply box: review it and press Send." });
      } else {
        setStatus({ tone: "ok", text: "Approved. Copy the offer below into your reply." });
      }
    });
  }

  function outcome(value: "enrolled" | "not_enrolled") {
    if (!latest) return;
    const form = new FormData();
    form.set("offer_id", latest.id);
    form.set("outcome", value);
    startTransition(async () => {
      const result = await recordOfferOutcomeAction(form);
      setStatus(result.ok ? { tone: "ok", text: "Outcome saved. It will sharpen future confidence." } : { tone: "error", text: result.error });
    });
  }

  return (
    <section aria-label="AI offer" className="border-b border-line px-3.5 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-copy-muted">💡 AI offer</h3>
        {managerNeeded && offer ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Needs a manager</span> : null}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div role="img" aria-label={`AI confidence ${confidence.percent} percent`}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${tone.ring} ${confidence.percent * 3.6}deg, #ece8fb 0deg)` }}>
          <span className={`grid h-11 w-11 place-items-center rounded-full bg-surface text-[13px] font-extrabold ${tone.text}`}>{confidence.percent}%</span>
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-bold ${tone.text}`}>{confidence.verdictLabel}</p>
          <p className="text-[11px] text-copy-muted">AI confidence · <span className="font-semibold text-amber-700">{confidence.evidenceLabel}</span></p>
        </div>
      </div>

      <details className="mt-2 text-xs text-copy">
        <summary className="cursor-pointer text-[11px] font-semibold text-brand-700">What the {confidence.percent}% is based on</summary>
        <ul className="mt-1.5 space-y-1">
          <li className="flex justify-between gap-2"><span>Starting point</span><span className="font-semibold text-copy-muted">{CONFIDENCE_START}</span></li>
          {confidence.factors.map((f) => (
            <li key={f.key} className="flex justify-between gap-2">
              <span>{f.label}</span>
              <span className={`font-semibold ${f.points > 0 ? "text-emerald-700" : "text-rose-700"}`}>{f.points > 0 ? `+${f.points}` : f.points}</span>
            </li>
          ))}
        </ul>
        {confidence.capped ? <p className="mt-1 text-[11px] text-copy-muted">Capped until there are 20+ enrolments with team replies.</p> : null}
      </details>

      {latest ? (
        <div className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-xs">
          <p className="font-semibold text-copy">
            Last offer {latest.status === "approved" ? "approved" : "declined"} · {new Date(latest.decidedAt).toLocaleDateString("en-IN")}
            {latest.status === "approved" && latest.offerPrice && latest.currency ? ` · ${formatMoney(latest.offerPrice, latest.currency)}` : ""}
          </p>
          {latest.status === "approved" && !latest.outcome ? (
            <div className="mt-1.5 flex gap-1.5">
              <span className="text-copy-muted">Did they enrol?</span>
              <button type="button" disabled={pending} onClick={() => outcome("enrolled")} className="font-semibold text-emerald-700">Yes</button>
              <button type="button" disabled={pending} onClick={() => outcome("not_enrolled")} className="font-semibold text-copy-muted">No</button>
            </div>
          ) : latest.outcome ? <p className="mt-1 text-copy-muted">Outcome: {latest.outcome === "enrolled" ? "enrolled" : "did not enrol"}</p> : null}
        </div>
      ) : null}

      {!offer ? (
        <div className="mt-3 text-xs text-copy-muted">
          <p>{confidence.verdict === "unlikely" ? "Better next step: answer their question and ask which course and batch suits them." : "No offer drafted yet."}</p>
          <button type="button" onClick={() => setForced(true)} className="mt-2 rounded-lg border border-line px-2.5 py-1.5 font-semibold text-brand-700">✨ Build an offer anyway</button>
        </div>
      ) : approvedText ? (
        <div className="mt-3 space-y-2">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">{approvedText}</p>
          <button type="button" onClick={() => navigator.clipboard?.writeText(approvedText)} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-copy">Copy offer</button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-bold text-copy">Suggested: {offer.kindLabel}</p>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div className="rounded-lg border border-line bg-surface px-2 py-1.5"><span className="block text-[10px] text-copy-muted">Offer price</span><strong>{hasPrice ? formatMoney(offerAmount(priceNumber, discount), currency) : "Enter price"}</strong></div>
            <div className="rounded-lg border border-line bg-surface px-2 py-1.5"><span className="block text-[10px] text-copy-muted">Discount</span><strong>{discount ? `${discount}% off` : "None"}</strong></div>
            <div className="rounded-lg border border-line bg-surface px-2 py-1.5"><span className="block text-[10px] text-copy-muted">Pay to book</span><strong>{deposit}</strong></div>
            <div className="rounded-lg border border-line bg-surface px-2 py-1.5"><span className="block text-[10px] text-copy-muted">Valid for</span><strong>{validLabel(validHours)}</strong></div>
          </div>
          {offer.reasons.length ? (
            <div className="rounded-lg border border-dashed border-line px-2.5 py-2 text-xs">
              <p className="font-semibold text-brand-700">Why the AI suggests this</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-copy">{offer.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          ) : null}
          {!price ? <p className="text-[11px] text-amber-800">No price is set on this course's upcoming batches, so enter the price before approving.</p> : <p className="text-[11px] text-copy-muted">Price from batch: {price.batchLabel}</p>}

          {editing || !hasPrice || !courseLabel ? (
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <label className="col-span-2 flex flex-col gap-0.5 font-semibold text-copy-muted">Course / batch
                <input value={courseLabel} onChange={(e) => setCourseLabel(e.target.value.slice(0, 200))} className="rounded-md border border-line px-2 py-1 text-xs text-copy" placeholder="e.g. 200-Hour TTC, Mysore, 7 Dec"/></label>
              <label className="flex flex-col gap-0.5 font-semibold text-copy-muted">Course price
                <input value={basePrice} onChange={(e) => setBasePrice(e.target.value.replace(/[^0-9.]/g, "").slice(0, 10))} inputMode="decimal" className="rounded-md border border-line px-2 py-1 text-xs text-copy"/></label>
              <label className="flex flex-col gap-0.5 font-semibold text-copy-muted">Currency
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-md border border-line px-2 py-1 text-xs text-copy"><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></select></label>
              <label className="flex flex-col gap-0.5 font-semibold text-copy-muted">Discount %
                <input value={discount} onChange={(e) => setDiscount(Math.min(50, Number(e.target.value.replace(/[^0-9]/g, "")) || 0))} inputMode="numeric" className="rounded-md border border-line px-2 py-1 text-xs text-copy"/></label>
              <label className="flex flex-col gap-0.5 font-semibold text-copy-muted">Valid for
                <select value={validHours} onChange={(e) => setValidHours(Number(e.target.value))} className="rounded-md border border-line px-2 py-1 text-xs text-copy">{VALID_OPTIONS.map((h) => <option key={h} value={h}>{validLabel(h)}</option>)}</select></label>
              <label className="col-span-2 flex flex-col gap-0.5 font-semibold text-copy-muted">Pay to book
                <input value={deposit} onChange={(e) => setDeposit(e.target.value.slice(0, 80))} className="rounded-md border border-line px-2 py-1 text-xs text-copy"/></label>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={pending || !hasPrice || !courseLabel || blockedForManager} onClick={() => submit("approved")}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">✓ Approve &amp; put in reply</button>
            <button type="button" onClick={() => setEditing(!editing)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-copy">{editing ? "Done" : "✎ Edit"}</button>
            <button type="button" disabled={pending} onClick={() => submit("declined")} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">Not now</button>
          </div>
          {blockedForManager ? <p className="text-[11px] text-amber-800">Discounts above {MANAGER_DISCOUNT_THRESHOLD}% need a manager. Lower it or ask a manager to approve.</p> : null}
          <p className="text-[11px] text-copy-muted">Nothing is sent until you approve and press Send.</p>
        </div>
      )}
      {status ? <p role="status" className={`mt-2 text-xs font-semibold ${status.tone === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{status.text}</p> : null}
    </section>
  );
}
