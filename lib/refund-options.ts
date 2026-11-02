import type { LeadPayment } from '@/lib/data';

export type RefundOption = { id: string; currency: string; remaining: number; label: string };

/** Screen guidance only. The refund command rechecks every balance under a lock. */
export function getRefundOptions(payments: LeadPayment[]): RefundOption[] {
  const settledRefunds = payments.filter(p => p.paymentKind === 'refund' && ['paid', 'refunded'].includes(p.status));
  const ambiguousCurrencies = new Set(settledRefunds.filter(p => !p.originalPaymentId).map(p => p.currency));
  return payments.flatMap(payment => {
    if (payment.paymentKind === 'refund' || payment.status !== 'paid' || ambiguousCurrencies.has(payment.currency)) return [];
    const refunded = settledRefunds.filter(p => p.originalPaymentId === payment.id)
      .reduce((sum, p) => sum + Math.round(p.amount * 100), 0);
    const remaining = (Math.round(payment.amount * 100) - refunded) / 100;
    if (!Number.isFinite(remaining) || remaining <= 0) return [];
    return [{ id: payment.id, currency: payment.currency, remaining,
      label: `${payment.externalPaymentId || payment.id.slice(0, 8)} · ${payment.currency} ${remaining.toFixed(2)} available` }];
  });
}
