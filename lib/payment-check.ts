// "Check who paid" (owner-approved mockup, 25 Nov 2026). Pure helpers.

export type CheckoutAttempt = { id: string; amount: number; currency: string; provider: string; kind: string; createdAt: string };
export type PaymentCheckPerson = {
  leadId: string;
  personId: string | null;
  name: string;
  stage: string;
  courseId: string | null;
  courseName: string | null;
  /** Every course they are asking about, main one first (lead_course_interests). */
  interests?: string[];
  value: number | null;
  currency: string | null;
  channel: string | null;
  daysWaiting: number | null;
  lastInbound: string | null;
  saysPaid: boolean;
  attempts: CheckoutAttempt[];
};
export type DuplicateHint = { leadId: string; otherLeadId: string; otherName: string; samePerson: boolean };

const letters = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");

/** Likely the same person: already merged, or one name's first word starts the other's handle ("Younita Pandey" / "younita005"). */
export function duplicateHints(people: PaymentCheckPerson[]): DuplicateHint[] {
  const out: DuplicateHint[] = [];
  for (const a of people) {
    for (const b of people) {
      if (a.leadId === b.leadId) continue;
      const same = Boolean(a.personId && a.personId === b.personId);
      const first = letters(a.name.split(/\s+/)[0] ?? "");
      const handle = letters(b.name);
      const similar = first.length >= 5 && handle.startsWith(first) && letters(a.name) !== handle;
      if (same || similar) out.push({ leadId: a.leadId, otherLeadId: b.leadId, otherName: b.name, samePerson: same });
    }
  }
  return out;
}

/** "Yogakulam Academy International" at Payment pending is the business's own number. */
export function looksLikeOwnBusiness(name: string, businessNames: string | null | Array<string | null | undefined>): boolean {
  const names = Array.isArray(businessNames) ? businessNames : [businessNames];
  return names.some((n) => {
    const word = letters((n ?? "").split(/\s+/)[0] ?? "");
    return word.length >= 5 && letters(name).includes(word);
  });
}

/** Rough rupee value, only to compare checkouts in different currencies. */
const ROUGH_INR: Record<string, number> = { INR: 1, USD: 85, EUR: 92, GBP: 108, AUD: 56, CAD: 62, AED: 23 };
export const roughInr = (amount: number, currency: string) => amount * (ROUGH_INR[(currency || "INR").toUpperCase()] ?? 85);
/** The checkout worth the most (in rupee terms), whatever its currency. */
export const largestAttempt = (attempts: CheckoutAttempt[]) => [...attempts].sort((a, b) => roughInr(b.amount, b.currency) - roughInr(a.amount, a.currency))[0];

/** Most likely to have paid first: says they paid, then started a checkout, then longest waiting. */
export function sortForChecking(people: PaymentCheckPerson[]): PaymentCheckPerson[] {
  const score = (p: PaymentCheckPerson) => (p.saysPaid ? 2 : 0) + (p.attempts.length ? 1 : 0);
  return [...people].sort((a, b) => score(b) - score(a) || (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0));
}

/** The largest checkout they started is the best guess for the amount; otherwise the course price. */
export function suggestedAmount(p: PaymentCheckPerson): { amount: number | null; currency: string; checkoutId: string | null; method: string } {
  const best = largestAttempt(p.attempts);
  if (best) {
    const provider = best.provider.toLowerCase();
    const method = provider.includes("paypal") ? "paypal" : provider.includes("upi") ? "upi" : provider.includes("icici") || provider.includes("razorpay") || provider.includes("stripe") ? "gateway" : "bank_transfer";
    return { amount: best.amount, currency: best.currency || "INR", checkoutId: best.id, method };
  }
  return { amount: p.value, currency: p.currency || "INR", checkoutId: null, method: "upi" };
}

export function moneyText(amount: number | null, currency: string | null): string {
  if (amount == null) return "";
  const cur = (currency || "INR").toUpperCase();
  return cur === "INR" ? `₹${Math.round(amount).toLocaleString("en-IN")}` : `${cur === "USD" ? "$" : cur + " "}${amount.toLocaleString("en-US")}`;
}

// ---- Batches (owner request, 25 Nov 2026: past batches must be choosable) ----

type BatchRow = { id: unknown; course_id: unknown; start_date: unknown; location?: unknown };

/** Upcoming and current batches first (soonest first), then past batches (most recent first). */
export function orderBatches<T extends BatchRow>(rows: T[], todayIso: string): T[] {
  const date = (r: T) => String(r.start_date ?? "");
  const upcoming = rows.filter((r) => date(r) >= todayIso).sort((a, b) => date(a).localeCompare(date(b)));
  const past = rows.filter((r) => date(r) < todayIso).sort((a, b) => date(b).localeCompare(date(a)));
  return [...upcoming, ...past];
}

/** "12 Jan 2026 · Mysore", with "(started)" for a batch that has already begun. */
export function batchLabel(row: BatchRow, todayIso: string = new Date().toISOString().slice(0, 10)): string {
  const iso = String(row.start_date ?? "");
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "Date not set";
  const place = typeof row.location === "string" && row.location.trim() ? row.location.trim() : null;
  return [d, place].filter(Boolean).join(" · ") + (iso && iso < todayIso ? " (started)" : "");
}

/** The "Interested in" pill (owner request, 25 Nov 2026): main course first, at most two names then "+N more". */
export function interestText(p: Pick<PaymentCheckPerson, "interests" | "courseName">): string | null {
  const names = [...new Set([...(p.interests ?? []), ...(p.courseName ? [p.courseName] : [])].filter(Boolean))];
  if (!names.length) return null;
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2} more` : names.join(", ");
}
