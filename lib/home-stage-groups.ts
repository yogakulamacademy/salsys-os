/**
 * One grouping of CRM stages for every Home card.
 *
 * "Contacted" always means contacted + engaged, and "High intent" always means
 * qualified + high_intent, so two cards on the same page can never show
 * different numbers under the same label.
 */
export type HomeStageCounts = {
  new: number;
  contacted: number;
  engaged: number;
  qualified: number;
  high_intent: number;
  payment_pending: number;
  enrolled?: number | null;
};

export type HomeStageGroupId =
  | "new"
  | "contacted"
  | "high_intent"
  | "payment_pending"
  | "enrolled";

export type HomeStageGroup = {
  id: HomeStageGroupId;
  label: string;
  value: number;
};

function safeCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0;
}

export function groupHomePipelineStages(counts: HomeStageCounts): HomeStageGroup[] {
  return [
    { id: "new", label: "New", value: safeCount(counts.new) },
    {
      id: "contacted",
      label: "Contacted",
      value: safeCount(counts.contacted) + safeCount(counts.engaged),
    },
    {
      id: "high_intent",
      label: "High intent",
      value: safeCount(counts.qualified) + safeCount(counts.high_intent),
    },
    {
      id: "payment_pending",
      label: "Payment pending",
      value: safeCount(counts.payment_pending),
    },
    { id: "enrolled", label: "Enrolled", value: safeCount(counts.enrolled) },
  ];
}
