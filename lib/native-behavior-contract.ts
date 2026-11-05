/** Approved, observational web events for the native analytics explorer. */
export const BEHAVIOR_EVENTS = [
  { name: "web.page_viewed", label: "Page viewed" },
  { name: "web.session_started", label: "Session started" },
  { name: "web.cta_clicked", label: "CTA clicked" },
  { name: "web.cta_viewed", label: "CTA viewed" },
  { name: "web.form_started", label: "Form started" },
  { name: "web.form_submitted", label: "Form submitted" },
  { name: "web.form_acknowledged", label: "Form acknowledged" },
  { name: "web.form_validation_failed", label: "Form error" },
  { name: "web.pricing_viewed", label: "Pricing viewed" },
  { name: "web.faq_expanded", label: "FAQ expanded" },
  { name: "web.brochure_clicked", label: "Brochure clicked" },
  { name: "web.scroll_depth_reached", label: "Scroll threshold" },
] as const;
export type BehaviorEvent = (typeof BEHAVIOR_EVENTS)[number]["name"];
export const DEFAULT_BEHAVIOR_STEPS: BehaviorEvent[] = [
  "web.page_viewed",
  "web.form_started",
  "web.form_submitted",
];
const allowed = new Set<string>(BEHAVIOR_EVENTS.map((item) => item.name));

export function normalizeBehaviorRequest(
  days: unknown,
  stepParam: unknown,
): { days: 7 | 14 | 30; steps: BehaviorEvent[] } {
  const numeric = Number(days);
  const window = numeric === 7 || numeric === 14 || numeric === 30 ? numeric : 14;
  const raw = typeof stepParam === "string" ? stepParam.split(",") : [];
  const steps = raw.map((item) => item.trim());
  const valid =
    steps.length >= 2 &&
    steps.length <= 5 &&
    new Set(steps).size === steps.length &&
    steps.every((step) => allowed.has(step));
  return {
    days: window,
    steps: valid ? (steps as BehaviorEvent[]) : [...DEFAULT_BEHAVIOR_STEPS],
  };
}
