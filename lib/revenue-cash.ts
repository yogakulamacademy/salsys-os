// Money in and money due (owner request, 19 Nov 2026). Pure.
//
// Collected: verified payments (status paid) dated in the current month, minus refunds.
// Awaiting verification: payments the team logged that an admin hasn't checked yet.
// Due: what each active enrolment still owes (agreed total minus verified and
// logged payments), on its balance due date (instalments) or the date payment
// is expected (enrolled before paying). Overdue = due date before today.

export type CashPayment = {
  amount: number; currency: string | null; status: string; kind: string; paidAt: string | null; teamLogged: boolean;
};
export type CashEnrollment = {
  id: string; leadId: string; leadName: string; courseName: string | null; status: string;
  total: number | null; currency: string | null; dueDate: string | null;
  payments: Array<{ amount: number; status: string; kind: string }>;
};
export type DueItem = { enrollmentId: string; leadId: string; leadName: string; courseName: string | null; amount: number; currency: string; dueDate: string | null; daysLate: number };
export type CurrencyCash = {
  currency: string;
  collectedThisMonth: number;
  refundedThisMonth: number;
  awaitingVerification: number;
  overdue: number;
  due30: number;
  due60: number;
  due90: number;
  dueLater: number;
};
export type CashSummary = { month: string; today: string; byCurrency: CurrencyCash[]; overdueItems: DueItem[]; upcomingItems: DueItem[] };

const ACTIVE_ENROLMENT = new Set(["pending", "confirmed", "deferred"]);
const COUNTED_PAYMENT = new Set(["paid", "pending", "partially_refunded"]);

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** What an enrolment still owes: agreed total minus payments made (verified or logged), never below zero. */
export function outstanding(e: Pick<CashEnrollment, "total" | "payments">): number {
  if (e.total == null) return 0;
  const paid = e.payments
    .filter((p) => p.kind !== "refund" && COUNTED_PAYMENT.has(p.status))
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, Math.round((e.total - paid) * 100) / 100);
}

export function summarizeCash(payments: CashPayment[], enrollments: CashEnrollment[], today: string): CashSummary {
  const month = today.slice(0, 7);
  const rows = new Map<string, CurrencyCash>();
  const row = (currency: string | null) => {
    const c = (currency || "INR").toUpperCase();
    if (!rows.has(c)) rows.set(c, { currency: c, collectedThisMonth: 0, refundedThisMonth: 0, awaitingVerification: 0, overdue: 0, due30: 0, due60: 0, due90: 0, dueLater: 0 });
    return rows.get(c)!;
  };

  for (const p of payments) {
    const inMonth = (p.paidAt ?? "").slice(0, 7) === month;
    if (p.kind === "refund" || p.status === "refunded") {
      if (inMonth) row(p.currency).refundedThisMonth += Math.abs(p.amount);
      continue;
    }
    if (p.status === "paid" && inMonth) row(p.currency).collectedThisMonth += p.amount;
    if (p.status === "pending" && p.teamLogged) row(p.currency).awaitingVerification += p.amount;
  }

  const overdueItems: DueItem[] = [];
  const upcomingItems: DueItem[] = [];
  for (const e of enrollments) {
    if (!ACTIVE_ENROLMENT.has(e.status)) continue;
    const owed = outstanding(e);
    if (owed <= 0) continue;
    const r = row(e.currency);
    const item: DueItem = {
      enrollmentId: e.id, leadId: e.leadId, leadName: e.leadName, courseName: e.courseName,
      amount: owed, currency: r.currency, dueDate: e.dueDate, daysLate: e.dueDate ? Math.max(0, daysBetween(e.dueDate, today)) : 0,
    };
    if (!e.dueDate) { r.dueLater += owed; upcomingItems.push(item); continue; }
    const inDays = daysBetween(today, e.dueDate);
    if (inDays < 0) { r.overdue += owed; overdueItems.push(item); }
    else {
      if (inDays <= 30) r.due30 += owed;
      else if (inDays <= 60) r.due60 += owed;
      else if (inDays <= 90) r.due90 += owed;
      else r.dueLater += owed;
      upcomingItems.push(item);
    }
  }

  overdueItems.sort((a, b) => b.daysLate - a.daysLate || b.amount - a.amount);
  upcomingItems.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const byCurrency = [...rows.values()].sort((a, b) => (a.currency === "INR" ? -1 : b.currency === "INR" ? 1 : a.currency.localeCompare(b.currency)));
  return { month, today, byCurrency, overdueItems, upcomingItems };
}
