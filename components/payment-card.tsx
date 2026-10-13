import {
  CircleDollarSign,
  CreditCard,
  ReceiptText,
  RotateCcw,
} from "lucide-react";

import type { LeadPayment } from "@/lib/data";
import { getCurrentWorkspaceContext } from "@/lib/workspace";

type Props = {
  potentialValue?: number;
  potentialCurrency?: string;
  payments: LeadPayment[];
  action: (formData: FormData) => void | Promise<void>;
};

export async function PaymentCard({
  potentialValue,
  potentialCurrency,
  payments,
  action,
}: Props) {
  const workspaceContext = await getCurrentWorkspaceContext();
  const organizationRole = workspaceContext.activeWorkspace?.role ?? null;
  const canRecordPayment =
    organizationRole === "owner" || organizationRole === "admin";

  const currency = potentialCurrency?.toUpperCase();

  const netPaid = currency
    ? payments.reduce((total, payment) => {
        if (payment.currency !== currency) {
          return total;
        }

        if (payment.paymentKind === "refund") {
          if (payment.status === "refunded" || payment.status === "paid") {
            return total - payment.amount;
          }

          return total;
        }

        if (payment.status === "paid") {
          return total + payment.amount;
        }

        return total;
      }, 0)
    : 0;

  const potential = Number(potentialValue ?? 0);
  const balance = potential > 0 ? Math.max(potential - netPaid, 0) : 0;

  let paymentStatus = "Unpaid";

  if (!potential) {
    paymentStatus = "No potential value";
  } else if (netPaid >= potential) {
    paymentStatus = "Paid in full";
  } else if (netPaid > 0) {
    paymentStatus = "Partially paid";
  }

  const formCurrency = currency || "USD";

  return (
    <section className="card-pad">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Finance</div>
          <div className="section-title mt-1">Payments & revenue</div>
        </div>

        <ReceiptText size={20} className="text-slate-400" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PaymentMetric
          label="Potential value"
          value={
            potential > 0 && currency ? money(potential, currency) : "—"
          }
        />
        <PaymentMetric
          label="Net paid"
          value={currency ? money(netPaid, currency) : "—"}
        />
        <PaymentMetric
          label="Balance"
          value={
            potential > 0 && currency ? money(balance, currency) : "—"
          }
        />
        <PaymentMetric label="Payment status" value={paymentStatus} />
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-800">
              Payment history
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {payments.length} transaction{payments.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {payments.length === 0 && (
            <div className="rounded-xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">
              No payments recorded yet.
            </div>
          )}

          {payments.map((payment) => (
            <div
              key={payment.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-slate-50 p-2 text-slate-500">
                  {payment.paymentKind === "refund" ? (
                    <RotateCcw size={16} />
                  ) : (
                    <CreditCard size={16} />
                  )}
                </div>

                <div>
                  <div className="text-sm font-bold capitalize text-slate-800">
                    {pretty(payment.paymentKind)}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {payment.provider ? pretty(payment.provider) : "Manual"}
                    {" · "}
                    {payment.paidAt
                      ? dateTime(payment.paidAt)
                      : dateTime(payment.createdAt)}
                  </div>

                  {payment.externalPaymentId && (
                    <div className="mt-1 text-xs text-slate-400">
                      Ref: {payment.externalPaymentId}
                    </div>
                  )}

                  {payment.notes && (
                    <div className="mt-1 text-xs text-slate-500">
                      {payment.notes}
                    </div>
                  )}
                </div>
              </div>

              <div className="sm:text-right">
                <div
                  className={`text-sm font-bold ${
                    payment.paymentKind === "refund"
                      ? "text-red-600"
                      : "text-slate-800"
                  }`}
                >
                  {payment.paymentKind === "refund" ? "−" : ""}
                  {money(payment.amount, payment.currency)}
                </div>
                <div className="mt-1 text-xs font-semibold capitalize text-slate-400">
                  {pretty(payment.status)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {canRecordPayment && (
        <details className="mt-6 rounded-xl border border-slate-200">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-brand">
            + Record payment
          </summary>

          <form action={action} className="border-t border-slate-100 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="field-label">Payment type</span>
                <select
                  className="input"
                  name="payment_kind"
                  defaultValue="deposit"
                >
                  <option value="deposit">Deposit</option>
                  <option value="balance">Balance</option>
                  <option value="full">Full payment</option>
                  <option value="refund">Refund</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label>
                <span className="field-label">Amount</span>
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
                <select
                  className="input"
                  name="payment_currency"
                  defaultValue={formCurrency}
                >
                  <option value="USD">USD</option>
                  <option value="INR">INR</option>
                </select>
              </label>

              <label>
                <span className="field-label">Payment method</span>
                <select
                  className="input"
                  name="payment_provider"
                  defaultValue="bank_transfer"
                >
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
                <span className="field-label">Payment reference</span>
                <input
                  className="input"
                  name="payment_reference"
                  placeholder="Transaction / receipt ID"
                />
              </label>

              <label>
                <span className="field-label">Payment date</span>
                <input className="input" name="paid_at" type="datetime-local" />
                <span className="mt-1 block text-xs text-slate-400">
                  Leave blank to use the current time.
                </span>
              </label>
            </div>

            <label className="mt-4 block">
              <span className="field-label">Notes</span>
              <textarea
                className="input min-h-20 resize-y"
                name="payment_notes"
                placeholder="Optional payment context…"
              />
            </label>

            <div className="mt-4 flex justify-end">
              <button className="btn-primary" type="submit">
                <CircleDollarSign size={15} />
                Record payment
              </button>
            </div>
          </form>
        </details>
      )}
    </section>
  );
}

function PaymentMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="text-xs font-semibold text-slate-400">{label}</div>
      <div className="mt-2 text-sm font-bold text-slate-800">{value}</div>
    </div>
  );
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) =>
    letter.toUpperCase(),
  );
}

function dateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
