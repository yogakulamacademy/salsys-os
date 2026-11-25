// "Log a call in two taps" (owner-approved mockup, 25 Nov 2026). Pure rules,
// shared by the server action and the panel.

export const CALL_ANSWERS = [
  { key: "interested", label: "Talked · interested" },
  { key: "will_pay", label: "Talked · will pay" },
  { key: "paid", label: "Talked · paid" },
  { key: "not_now", label: "Talked · not now" },
  { key: "no_answer", label: "No answer" },
  { key: "wrong_number", label: "Wrong number" },
] as const;
export type CallAnswer = (typeof CALL_ANSWERS)[number]["key"];

export const NEXT_STEPS = [
  { days: 1, label: "Tomorrow" },
  { days: 3, label: "In 3 days" },
  { days: 7, label: "Next week" },
  { days: 0, label: "No follow-up" },
] as const;

const EARLY = new Set(["new", "contacted"]);
const BEFORE_PAYMENT = new Set(["new", "contacted", "engaged", "qualified", "high_intent", "nurture", "not_now"]);

export function isCallAnswer(v: unknown): v is CallAnswer {
  return CALL_ANSWERS.some((a) => a.key === v);
}

/** The follow-up preselected for each answer. */
export function defaultNextDays(answer: CallAnswer): number {
  return { interested: 3, will_pay: 3, paid: 1, not_now: 7, no_answer: 1, wrong_number: 0 }[answer];
}

/** Outcome stored on the contact log (log_lead_contact). */
export function contactOutcome(answer: CallAnswer): "connected" | "no_answer" | "other" {
  if (answer === "no_answer") return "no_answer";
  if (answer === "wrong_number") return "other";
  return "connected";
}

/** Stage to move to, or null to leave it. Never moves someone backwards from paid or enrolled. */
export type CallStage = "engaged" | "payment_pending" | "not_now";
export function stageAfterCall(answer: CallAnswer, current: string): CallStage | null {
  if (current === "closed_won" || current === "enrolled") return null;
  if (answer === "interested") return EARLY.has(current) ? "engaged" : null;
  if (answer === "will_pay" || answer === "paid") return BEFORE_PAYMENT.has(current) ? "payment_pending" : null;
  if (answer === "not_now") return current === "not_now" ? null : "not_now";
  return null;
}

export function followUpTitle(answer: CallAnswer): string {
  return {
    interested: "Call follow-up: interested",
    will_pay: "Payment check: said they will pay",
    paid: "Payment check: said they paid on the call",
    not_now: "Check back: not now",
    no_answer: "Call again: no answer",
    wrong_number: "Find the right number",
  }[answer];
}

/** 10:00 IST, `days` from now. */
export function followUpDue(days: number, now = new Date()): Date {
  const due = new Date(now.getTime() + days * 86_400_000);
  due.setUTCHours(4, 30, 0, 0);
  return due;
}
