// AI offer suggestion v1 — explainable and deterministic.
// Decides whether an offer could convert a lead, with a confidence % and the
// factors behind it, and drafts the offer's structure. It never sends
// anything: every offer is approved (and can be edited) by a person first.

export type OfferMessage = { direction: 'inbound' | 'outbound'; body: string; timestamp?: string | null };

export type OfferFactor = { key: string; label: string; points: number };

export type OfferConfidence = {
  percent: number;
  verdict: 'likely' | 'maybe' | 'unlikely';
  verdictLabel: string;
  factors: OfferFactor[];
  evidenceLabel: string;
  capped: boolean;
};

export type OfferDraft = {
  kind: 'early_bird_and_deposit' | 'package_price' | 'limited_time_discount' | 'pay_to_book';
  kindLabel: string;
  discountPercent: number;
  depositText: string;
  validHours: number;
  reasons: string[];
};

export type OfferContext = {
  messages: OfferMessage[];
  channel: string | null;
  courseKnown: boolean;
  waitingMinutes: number | null;
  replyWindowOpen: boolean | null;
  /** Enrolments linked to conversations with team replies (from conversation learning). */
  learnedEnrolments: number;
  /** Approved learned tactic rates, e.g. { offer: { with: 0.2, without: 0.02 } }. */
  learnedTactics?: Partial<Record<'offer' | 'urgency' | 'part_payment' | 'social_proof', { with: number; without: number }>>;
};

export const CONFIDENCE_START = 35;
export const CONFIDENCE_CAP_LOW_EVIDENCE = 85;
export const ENROLMENTS_FOR_FULL_CONFIDENCE = 20;
/** Discounts above this need an organization manager's approval. */
export const MANAGER_DISCOUNT_THRESHOLD = 20;
export const MAX_DISCOUNT = 50;

const PRICE = /\b(fees?|cost|price|charges?|how much|package|early.?bird|discount\w*|offer)\b/i;
const BOOK = /\b(apply|application|enrol+|register|join|book|reserve|pay in (two|2) parts|installments?|instalments?)\b/i;
const TEACHER = /\b(certified|yoga teacher|500[- ]?hour|200[- ]?hour (done|completed))\b/i;
const GREETING_ONLY = /^(hi+|hello+|hlw|hey+|namaste|hai|hy|hlo)[\s!.🙏]*$/i;
const PACKAGE = /\b(package|both courses|two courses|back to back|combined)\b/i;
const EARLY = /\b(early.?bird|offer|discount)\b/i;
const PARTS = /\b(installments?|instalments?|in (two|2) parts|partial payment|emi)\b/i;

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function scoreOfferConfidence(context: OfferContext): OfferConfidence {
  const inbound = context.messages.filter((m) => m.direction === 'inbound' && m.body?.trim());
  const leadText = inbound.map((m) => m.body).join('\n');
  const twoWay = inbound.length >= 2 || (inbound.length >= 1 && context.messages.some((m) => m.direction === 'outbound'));
  const quietAfterFee = (context.waitingMinutes ?? 0) > 24 * 60 && PRICE.test(inbound[inbound.length - 1]?.body ?? '');
  const greetingOnly = inbound.length > 0 && inbound.every((m) => GREETING_ONLY.test(m.body.trim()));

  const factors: OfferFactor[] = [];
  const add = (cond: boolean, key: string, label: string, points: number) => { if (cond) factors.push({ key, label, points }); };
  const tactic = context.learnedTactics?.offer;
  add(PRICE.test(leadText), 'asked_price', tactic
    ? `Asked about price or a discount (leads given an offer enrolled ${pct(tactic.with)} vs ${pct(tactic.without)})`
    : 'Asked about price, a package or a discount', 20);
  add(BOOK.test(leadText), 'wants_to_book', 'Wants to apply, book or pay in parts', 15);
  add(twoWay, 'two_way', 'Two-way conversation', 10);
  add(quietAfterFee, 'quiet_after_fee', 'Went quiet after asking the fee', 10);
  add(TEACHER.test(leadText), 'experienced', 'Already practising or teaching yoga', 5);
  add(context.courseKnown, 'course_known', 'Course interest is known', 5);
  add(context.replyWindowOpen === false, 'window_closed', 'Reply window closed: harder to reach', -15);
  add(greetingOnly, 'greeting_only', 'Only a greeting so far', -20);

  const raw = CONFIDENCE_START + factors.reduce((sum, f) => sum + f.points, 0);
  const lowEvidence = context.learnedEnrolments < ENROLMENTS_FOR_FULL_CONFIDENCE;
  const ceiling = lowEvidence ? CONFIDENCE_CAP_LOW_EVIDENCE : 95;
  const percent = Math.max(5, Math.min(ceiling, raw));
  const verdict = percent >= 60 ? 'likely' : percent >= 35 ? 'maybe' : 'unlikely';
  return {
    percent,
    verdict,
    verdictLabel: verdict === 'likely' ? 'Likely to convert with an offer' : verdict === 'maybe' ? 'An offer may help' : 'An offer is unlikely to help yet',
    factors,
    evidenceLabel: lowEvidence
      ? `Low evidence (${context.learnedEnrolments} enrolment${context.learnedEnrolments === 1 ? '' : 's'} learned)`
      : `Based on ${context.learnedEnrolments} enrolments`,
    capped: raw > ceiling,
  };
}

/** Drafts the offer structure. Prices come from the batch or the approver, never invented. */
export function draftOffer(context: OfferContext, confidence: OfferConfidence): OfferDraft | null {
  if (confidence.verdict === 'unlikely') return null;
  const leadText = context.messages.filter((m) => m.direction === 'inbound').map((m) => m.body).join('\n');
  const parts = context.learnedTactics?.part_payment;
  const reasons = confidence.factors.filter((f) => f.points > 0).map((f) => f.label).slice(0, 3);
  if (parts) reasons.push(`"Pay part now, balance later" enrolled ${pct(parts.with)} vs ${pct(parts.without)}`);
  if (PACKAGE.test(leadText)) {
    return { kind: 'package_price', kindLabel: 'Package price', discountPercent: 10, depositText: '20% to book', validHours: 72, reasons };
  }
  if (PARTS.test(leadText) || BOOK.test(leadText)) {
    return { kind: 'pay_to_book', kindLabel: 'Pay to book, balance later', discountPercent: 0, depositText: '10% to book (balance on arrival)', validHours: 168, reasons };
  }
  if (EARLY.test(leadText)) {
    return { kind: 'early_bird_and_deposit', kindLabel: 'Early-bird + pay to book', discountPercent: 15, depositText: '10% to book', validHours: 48, reasons };
  }
  return { kind: 'limited_time_discount', kindLabel: 'Limited-time discount', discountPercent: 10, depositText: '10% to book', validHours: 72, reasons };
}

export function needsManagerApproval(discountPercent: number): boolean {
  return discountPercent > MANAGER_DISCOUNT_THRESHOLD;
}

export function offerAmount(basePrice: number, discountPercent: number): number {
  const d = Math.max(0, Math.min(MAX_DISCOUNT, Math.round(discountPercent)));
  return Math.round(basePrice * (100 - d)) / 100;
}

export function validLabel(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '24 hours' : `${days} days`;
  }
  return `${hours} hours`;
}

export function formatMoney(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${code} ${Math.round(amount)}`;
  }
}

/** Customer-facing message for an approved offer (the person can still edit it before sending). */
export function offerMessage(input: {
  firstName: string; courseLabel: string; basePrice: number; currency: string;
  discountPercent: number; depositText: string; validHours: number;
}): string {
  const price = offerAmount(input.basePrice, input.discountPercent);
  const priceText = input.discountPercent > 0
    ? `${formatMoney(price, input.currency)} (instead of ${formatMoney(input.basePrice, input.currency)})`
    : formatMoney(input.basePrice, input.currency);
  const name = input.firstName.trim() ? ` ${input.firstName.trim()}` : '';
  return `Namaste${name} 🙏 For ${input.courseLabel}, we can offer ${priceText}. Reserve your seat with ${input.depositText} and pay the balance later. This offer is valid for ${validLabel(input.validHours)}. Shall I reserve your seat?`;
}
