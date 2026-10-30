import {
  CreditCard,
  ReceiptText,
  RotateCcw,
} from 'lucide-react';

import { PaymentActionsClient } from '@/components/payment-actions-client';
import { useMockData } from '@/lib/config';
import type { LeadPayment } from '@/lib/data';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type Props = {
  potentialValue?: number;
  potentialCurrency?: string;
  payments: LeadPayment[];
  // Kept temporarily for compatibility with the existing Lead detail callsite.
  // The legacy generic payment action is deliberately not exposed by this card.
  action: (formData: FormData) => void | Promise<void>;
};

export async function PaymentCard({
  potentialValue,
  potentialCurrency,
  payments,
  action: legacyPaymentAction,
}: Props) {
  // Intentionally consume without exposing the old generic server action to a
  // client boundary. New financial writes use dedicated claim/verify actions.
  void legacyPaymentAction;

  const currency = potentialCurrency?.toUpperCase();

  const netPaid = currency
    ? payments.reduce((total, payment) => {
        if (payment.currency !== currency) return total;

        if (payment.paymentKind === 'refund') {
          if (payment.status === 'refunded' || payment.status === 'paid') {
            return total - payment.amount;
          }
          return total;
        }

        if (payment.status === 'paid') return total + payment.amount;
        return total;
      }, 0)
    : 0;

  const potential = Number(potentialValue ?? 0);
  const balance = potential > 0 ? Math.max(potential - netPaid, 0) : 0;

  let paymentStatus = 'Unpaid';
  if (!potential) paymentStatus = 'No potential value';
  else if (netPaid >= potential) paymentStatus = 'Paid in full';
  else if (netPaid > 0) paymentStatus = 'Partially paid';

  const formCurrency = currency === 'INR' ? 'INR' : 'USD';

  let canVerifyPayment = useMockData;

  if (!useMockData) {
    try {
      const workspace = await getCurrentWorkspaceContext();
      const role = workspace.activeWorkspace?.role ?? '';
      canVerifyPayment = role === 'owner' || role === 'admin';
    } catch {
      canVerifyPayment = false;
    }
  }

  return (
    <section className="card-pad">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Finance</div>
          <div className="section-title mt-1">Payments & revenue</div>
          <p className="mt-1 text-xs leading-5 text-copy-muted">
            Customer-reported payments stay separate from verified financial truth.
          </p>
        </div>
        <ReceiptText size={20} className="text-copy-subtle" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PaymentMetric
          label="Potential value"
          value={potential > 0 && currency ? money(potential, currency) : '—'}
        />
        <PaymentMetric
          label="Verified net paid"
          value={currency ? money(netPaid, currency) : '—'}
        />
        <PaymentMetric
          label="Balance"
          value={potential > 0 && currency ? money(balance, currency) : '—'}
        />
        <PaymentMetric label="Payment status" value={paymentStatus} />
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-copy-strong">
              Verified payment history
            </div>
            <div className="mt-1 text-xs text-copy-subtle">
              {payments.length} transaction{payments.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {payments.length === 0 ? (
            <div className="rounded-xl bg-surface-soft px-4 py-5 text-center text-sm text-copy-subtle">
              No verified payments recorded yet.
            </div>
          ) : null}

          {payments.map((payment) => (
            <div
              key={payment.id}
              className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-surface-soft p-2 text-copy-muted">
                  {payment.paymentKind === 'refund' ? (
                    <RotateCcw size={16} />
                  ) : (
                    <CreditCard size={16} />
                  )}
                </div>

                <div>
                  <div className="text-sm font-semibold capitalize text-copy-strong">
                    {pretty(payment.paymentKind)}
                  </div>
                  <div className="mt-1 text-xs text-copy-subtle">
                    {payment.provider ? pretty(payment.provider) : 'Manual'}
                    {' · '}
                    {payment.paidAt
                      ? dateTime(payment.paidAt)
                      : dateTime(payment.createdAt)}
                  </div>

                  {payment.externalPaymentId ? (
                    <div className="mt-1 text-xs text-copy-subtle">
                      Ref: {payment.externalPaymentId}
                    </div>
                  ) : null}

                  {payment.notes ? (
                    <div className="mt-1 text-xs text-copy-muted">
                      {payment.notes}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="sm:text-right">
                <div
                  className={`text-sm font-semibold ${
                    payment.paymentKind === 'refund'
                      ? 'text-error'
                      : 'text-copy-strong'
                  }`}
                >
                  {payment.paymentKind === 'refund' ? '−' : ''}
                  {money(payment.amount, payment.currency)}
                </div>
                <div className="mt-1 text-xs font-semibold capitalize text-copy-subtle">
                  {pretty(payment.status)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <PaymentActionsClient
        currency={formCurrency}
        canVerifyPayment={canVerifyPayment}
      />
    </section>
  );
}

function PaymentMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-surface-soft p-4">
      <div className="text-xs font-semibold text-copy-subtle">{label}</div>
      <div className="mt-2 text-sm font-semibold text-copy-strong">{value}</div>
    </div>
  );
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

function pretty(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
