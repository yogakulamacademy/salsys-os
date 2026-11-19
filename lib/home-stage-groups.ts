/**
 * Pipeline stages for every Home card, one row per real CRM stage so the
 * numbers match the Leads filter and the pipeline board exactly. Stages now
 * move automatically from conversations (Engaged, Qualified, High intent,
 * Not now), so merging them would hide that progress.
 */
export type HomeStageCounts = {
  new: number;
  contacted: number;
  engaged: number;
  qualified: number;
  high_intent: number;
  payment_pending: number;
  enrolled?: number | null;
  not_now?: number | null;
  nurture?: number | null;
};

export type HomeStageGroupId =
  | "new"
  | "contacted"
  | "engaged"
  | "qualified"
  | "high_intent"
  | "payment_pending"
  | "enrolled"
  | "not_now";

export type HomeStageGroup = {
  id: HomeStageGroupId;
  label: string;
  value: number;
  /** Leads list filtered to exactly this stage (or stages). */
  href: string;
  /** Parked leads are shown apart from the active funnel. */
  parked?: boolean;
};

function safeCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0;
}

const leadsHref = (...stages: string[]) => `/leads?${stages.map((s) => `stage=${s}`).join("&")}`;

export function groupHomePipelineStages(counts: HomeStageCounts): HomeStageGroup[] {
  return [
    { id: "new", label: "New", value: safeCount(counts.new), href: leadsHref("new") },
    { id: "contacted", label: "Contacted", value: safeCount(counts.contacted), href: leadsHref("contacted") },
    { id: "engaged", label: "Engaged", value: safeCount(counts.engaged), href: leadsHref("engaged") },
    { id: "qualified", label: "Qualified", value: safeCount(counts.qualified), href: leadsHref("qualified") },
    { id: "high_intent", label: "High intent", value: safeCount(counts.high_intent), href: leadsHref("high_intent") },
    { id: "payment_pending", label: "Payment pending", value: safeCount(counts.payment_pending), href: leadsHref("payment_pending") },
    { id: "enrolled", label: "Enrolled", value: safeCount(counts.enrolled), href: leadsHref("enrolled") },
    {
      id: "not_now",
      label: "Not now",
      value: safeCount(counts.not_now) + safeCount(counts.nurture),
      href: leadsHref("not_now", "nurture"),
      parked: true,
    },
  ];
}

/** Share of active (not parked) leads that reached Qualified or beyond. */
export function progressedShare(groups: HomeStageGroup[]): number | null {
  const active = groups.filter((g) => !g.parked);
  const total = active.reduce((s, g) => s + g.value, 0);
  if (!total) return null;
  const ahead = active.filter((g) => ["qualified", "high_intent", "payment_pending", "enrolled"].includes(g.id)).reduce((s, g) => s + g.value, 0);
  return Math.round((ahead / total) * 1000) / 10;
}
