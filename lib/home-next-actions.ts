/**
 * Evidence-backed, deterministic operational ordering for the Home Command
 * Center. This is NOT an ML recommendation engine, an SLA-compliance score,
 * or a prediction of conversion or revenue.
 *
 * Counts come from the current organization-scoped CRM snapshot. The optional
 * missing-valuation count is supplied only by the independently validated
 * open-pipeline RPC. Missing/invalid numbers are treated as unknown, not zero.
 */
export type HomeActionId =
  | "reply-queue"
  | "overdue-followups"
  | "first-touch"
  | "payment-stage"
  | "missing-valuation";

export type HomeNextAction = {
  id: HomeActionId;
  label: string;
  value: number;
  detail: string;
  reason: string;
  evidence: string;
  timing: string;
  actionLabel: string;
  href: string;
  tone: "info" | "warning" | "critical";
  priority: "Immediate" | "Due" | "Work queue" | "Review";
  /** Sorting rule only; never presented to customers as a score. */
  priorityRank: number;
};

export type HomeNextActionsInput = {
  needsReply: number | null | undefined;
  waitingOverHour: number | null | undefined;
  followupsDue: number | null | undefined;
  needsFirstTouch: number | null | undefined;
  paymentPending: number | null | undefined;
  missingOpportunityValue: number | null | undefined;
};

function validCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * Observed wait > 1h ranks ahead of overdue scheduled tasks; both rank ahead
 * of other current-state queues. If timing is missing or inconsistent, the
 * function does not invent an SLA breach.
 */
export function buildHomeNextActions(input: HomeNextActionsInput): HomeNextAction[] {
  const items: HomeNextAction[] = [];
  const needsReply = validCount(input.needsReply);
  const waitingOverHour = validCount(input.waitingOverHour);

  if (needsReply != null && needsReply > 0) {
    const late = waitingOverHour != null && waitingOverHour <= needsReply
      ? waitingOverHour
      : null;
    items.push({
      id: "reply-queue",
      label: "Needs reply",
      value: needsReply,
      detail: "Active customer conversations awaiting a team reply",
      reason: late == null
        ? "A reply is pending; the waiting-time breakdown is unavailable or inconsistent."
        : late > 0
          ? `${late} conversations have been waiting longer than one hour.`
          : "These active conversations have no recorded reply yet.",
      evidence: late == null ? "Current conversation count · duration unverified" : "Current conversation and waiting-time evidence",
      timing: late == null ? "Reply pending · timing unverified" : late > 0 ? `${late} waiting >1h` : "Reply pending",
      actionLabel: "Work conversation queue",
      href: "/conversations",
      tone: late != null && late > 0 ? "critical" : "info",
      priority: late != null && late > 0 ? "Immediate" : "Work queue",
      priorityRank: late != null && late > 0 ? 120 : 80,
    });
  }

  const followupsDue = validCount(input.followupsDue);
  if (followupsDue != null && followupsDue > 0) {
    items.push({
      id: "overdue-followups",
      label: "Overdue follow-ups",
      value: followupsDue,
      detail: "Scheduled follow-up tasks with a past-due timestamp",
      reason: "Recorded follow-up due times have passed while the tasks remain open.",
      evidence: "Scheduled follow-up records",
      timing: "Past due",
      actionLabel: "Work follow-ups",
      href: "/follow-ups",
      tone: "warning",
      priority: "Due",
      priorityRank: 110,
    });
  }

  const firstTouch = validCount(input.needsFirstTouch);
  if (firstTouch != null && firstTouch > 0) {
    items.push({
      id: "first-touch",
      label: "First touch needed",
      value: firstTouch,
      detail: "New leads without recorded first outbound contact",
      reason: "These leads have no recorded first outbound touch in CRM.",
      evidence: "CRM outbound contact history",
      timing: "First touch pending",
      actionLabel: "Review leads",
      // An unassigned-lead filter is not necessarily a first-touch filter.
      href: "/leads",
      tone: "warning",
      priority: "Work queue",
      priorityRank: 70,
    });
  }

  const paymentPending = validCount(input.paymentPending);
  if (paymentPending != null && paymentPending > 0) {
    items.push({
      id: "payment-stage",
      label: "Payment pending",
      value: paymentPending,
      detail: "Leads currently recorded in the payment-pending stage",
      reason: "Check payment questions and evidence before marking an enrollment complete.",
      evidence: "Current CRM pipeline stage · not settled payments",
      timing: "Payment stage",
      actionLabel: "Review payment-stage leads",
      href: "/admissions?view=payments",
      tone: "info",
      priority: "Review",
      priorityRank: 60,
    });
  }

  const missingValue = validCount(input.missingOpportunityValue);
  if (missingValue != null && missingValue > 0) {
    items.push({
      id: "missing-valuation",
      label: "Missing opportunity values",
      value: missingValue,
      detail: "Eligible open leads without an explicit amount or currency",
      reason: "Confirm the actual opportunity value and currency; missing values are not zero-value deals.",
      evidence: "Reconciled open-pipeline valuation snapshot",
      timing: "Data quality · current",
      actionLabel: "Review valuations",
      href: "/revenue/valuation",
      tone: "info",
      priority: "Review",
      priorityRank: 40,
    });
  }

  return items.sort((a, b) => b.priorityRank - a.priorityRank || a.id.localeCompare(b.id));
}
