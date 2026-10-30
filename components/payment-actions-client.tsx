"use client";

import { AlertTriangle, CheckCircle2, CircleDollarSign, RotateCcw } from "lucide-react";
import { useParams } from "next/navigation";

import {
  recordRefundAction,
  reportPaymentClaimAction,
  verifyPaymentAction,
} from "@/app/actions/payments";

export function PaymentActionsClient({
  currency,
  canVerifyPayment,
}: {
  currency: string;
  canVerifyPayment: boolean;
}) {
  const params = useParams<{ id?: string }>();
  const leadId = typeof params?.id === "string" ? params.id : "";

  if (!leadId) return null;

  const reportAction = reportPaymentClaimAction.bind(null, leadId);
  const verifyAction = verifyPaymentAction.bind(null, leadId);
  const refundAction = recordRefundAction.bind(null, leadId);

  return (
    <div className="mt-6 space-y-3 border-t border-line pt-5">
      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-brand-700">
          Report customer payment
        </summary>
        <form action={reportAction} className="border-t border-line p-4">
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Use this when a customer says they paid. This creates a verification task only — it does not mark the payment as paid or change the Opportunity stage.
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="field-label">Claimed amount</span>
              <input
                className="input"
                name="claimed_amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Optional amount"
              />
            </label>

            <label>
              <span className="field-label">Currency</span>
              <select className="input" name="claimed_currency" defaultValue={currency}>
                <option value="USD">USD</option>
                <option value="INR">INR</option>
              </select>
            </label>

            <label className="md:col-span-2">
              <span className="field-label">Reference shared by customer</span>
              <input
                className="input"
                name="payment_reference"
                placeholder="Transaction / receipt ID, if provided"
              />
            </label>
          </div>

          <label className="mt-4 block">
            <span className="field-label">Claim context</span>
            <textarea
              className="input min-h-20 resize-y"
              name="payment_notes"
              placeholder="For example: Customer sent screenshot in WhatsApp and says deposit was paid."
            />
          </label>

          <div className="mt-4 flex justify-end">
            <button className="btn-secondary" type="submit">
              <AlertTriangle size={15} />
              Create verification task
            </button>
          </div>
        </form>
      </details>

      {canVerifyPayment ? (
        <details className="rounded-xl border border-brand-100 bg-brand-50/30">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-brand-700">
            Verify received payment
          </summary>
          <form
            action={verifyAction}
            onSubmit={(event) => {
              const confirmed = window.confirm(
                "Verify this payment as financial truth? This will record it as PAID and may move the Opportunity to Closed Won. Continue?",
              );
              if (!confirmed) event.preventDefault();
            }}
            className="border-t border-brand-100 bg-surface p-4"
          >
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2.5 text-[11px] leading-5 text-copy-muted">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-brand-700" />
              <span>
                Owner/Admin only. Verify against bank, gateway, UPI, Wise, PayPal or other trustworthy evidence before submitting.
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="field-label">Payment type</span>
                <select className="input" name="payment_kind" defaultValue="deposit">
                  <option value="deposit">Deposit</option>
                  <option value="balance">Balance</option>
                  <option value="full">Full payment</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label>
                <span className="field-label">Verified amount</span>
                <input
                  className="input"
                  name="payment_amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="Amount"
                />
              </label>

              <label>
                <span className="field-label">Currency</span>
                <select className="input" name="payment_currency" defaultValue={currency}>
                  <option value="USD">USD</option>
                  <option value="INR">INR</option>
                </select>
              </label>

              <label>
                <span className="field-label">Payment method</span>
                <select className="input" name="payment_provider" defaultValue="bank_transfer">
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="upi">UPI</option>
                  <option value="wise">Wise</option>
                  <option value="paypal">PayPal</option>
                  <option value="razorpay">Razorpay</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label>
                <span className="field-label">Transaction reference</span>
                <input
                  className="input"
                  name="payment_reference"
                  placeholder="Bank / gateway / receipt ID"
                />
              </label>

              <label>
                <span className="field-label">Payment date</span>
                <input className="input" name="paid_at" type="datetime-local" />
              </label>
            </div>

            <label className="mt-4 block">
              <span className="field-label">Verification evidence</span>
              <textarea
                className="input min-h-20 resize-y"
                name="evidence_note"
                placeholder="Required when no transaction reference is available. Describe what was verified and where."
              />
            </label>

            <div className="mt-4 flex justify-end">
              <button className="btn-primary" type="submit">
                <CircleDollarSign size={15} />
                Verify & record paid
              </button>
            </div>
          </form>
        </details>
      ) : (
        <div className="rounded-xl border border-line bg-surface-soft px-4 py-3 text-[11px] leading-5 text-copy-muted">
          Only an Owner or Admin can convert a reported payment into verified financial truth. You can still report the customer claim above.
        </div>
      )}

      {canVerifyPayment ? (
        <details className="rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-copy-muted">
            Record refund
          </summary>
          <form
            action={refundAction}
            onSubmit={(event) => {
              if (!window.confirm("Record this refund as a financial transaction?")) {
                event.preventDefault();
              }
            }}
            className="border-t border-line p-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="field-label">Refund amount</span>
                <input className="input" name="refund_amount" type="number" min="0.01" step="0.01" required />
              </label>
              <label>
                <span className="field-label">Currency</span>
                <select className="input" name="refund_currency" defaultValue={currency}>
                  <option value="USD">USD</option>
                  <option value="INR">INR</option>
                </select>
              </label>
              <label>
                <span className="field-label">Method</span>
                <select className="input" name="refund_provider" defaultValue="bank_transfer">
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="upi">UPI</option>
                  <option value="wise">Wise</option>
                  <option value="paypal">PayPal</option>
                  <option value="razorpay">Razorpay</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                <span className="field-label">Refund reference</span>
                <input className="input" name="refund_reference" placeholder="Transaction / receipt ID" />
              </label>
            </div>
            <label className="mt-4 block">
              <span className="field-label">Notes</span>
              <textarea className="input min-h-20 resize-y" name="refund_notes" placeholder="Refund context…" />
            </label>
            <div className="mt-4 flex justify-end">
              <button className="btn-secondary" type="submit">
                <RotateCcw size={15} /> Record refund
              </button>
            </div>
          </form>
        </details>
      ) : null}
    </div>
  );
}
