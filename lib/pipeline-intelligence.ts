// Smart Pipeline briefing (owner-approved mockup "Pipeline v2", 25 Nov 2026).
// Pure functions over pipeline_intelligence_v1. No server imports.

export type PipelineCell = { stage: string; bucket: string; n: number; waiting: number; inr: number; topCourse: string | null };
export type PipelineIntelligence = {
  generatedAt: string;
  stages: Record<string, number>;
  cells: PipelineCell[];
  highIntentWaiting: { n: number; inr: number; medianDays: number | null };
  payment: { n: number; monthPlus: number; inr: number };
  moves30: { highIntentToPayment: number; toPayment: number; won: number };
  open: { n: number; inr: number; priced: number };
  courses: Array<{ course: string; n: number; inr: number }>;
};

export const HEAT_STAGES = [
  { key: "qualified", label: "Qualified" },
  { key: "high_intent", label: "High intent" },
  { key: "payment_pending", label: "Payment pending" },
] as const;

export const HEAT_BUCKETS = [
  { key: "d0_2", label: "under 3 days" },
  { key: "d3_7", label: "3–7 days" },
  { key: "d8_14", label: "8–14 days" },
  { key: "d15_30", label: "15–30 days" },
  { key: "d30", label: "30+ days", alsoKeys: ["none"] },
] as const;

export type HeatCell = { stage: string; bucket: string; n: number; waiting: number; inr: number; topCourse: string | null };

/** Stage × days-since-last-message grid; "no messages" counts as 30+ days. */
export function heatGrid(i: PipelineIntelligence): HeatCell[][] {
  return HEAT_STAGES.map((s) => HEAT_BUCKETS.map((b) => {
    const keys: string[] = [b.key, ...("alsoKeys" in b ? b.alsoKeys : [])];
    const cells = i.cells.filter((c) => c.stage === s.key && keys.includes(c.bucket));
    const top = cells.filter((c) => c.topCourse).sort((a, z) => z.n - a.n)[0]?.topCourse ?? null;
    return {
      stage: s.key, bucket: b.key,
      n: cells.reduce((t, c) => t + c.n, 0),
      waiting: cells.reduce((t, c) => t + c.waiting, 0),
      inr: cells.reduce((t, c) => t + Number(c.inr || 0), 0),
      topCourse: top,
    };
  }));
}

/** The cell holding the most people who have gone quiet (8+ days) — what the note explains. */
export function coolingCell(grid: HeatCell[][]): HeatCell | null {
  const quiet = grid.flat().filter((c) => ["d8_14", "d15_30", "d30"].includes(c.bucket));
  return quiet.sort((a, b) => b.n - a.n)[0] ?? null;
}

export type PipelineSuggestion = {
  key: "high_intent_waiting" | "payment_stale" | "stuck_step";
  impact: string; title: string; body: string;
  evidence: Array<{ label: string; value: number; text: string; tone: "good" | "bad" | "warn" | "neutral" | "brand" }>;
  action: { label: string; href: string };
  basis: string;
};

export const inrText = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(1).replace(/\.0$/, "")} lakh` : `₹${Math.round(n).toLocaleString("en-IN")}`);

export function pipelineSuggestions(i: PipelineIntelligence): PipelineSuggestion[] {
  const out: PipelineSuggestion[] = [];
  const hi = i.stages.high_intent ?? 0;
  const w = i.highIntentWaiting;
  if (w.n > 0) {
    out.push({
      key: "high_intent_waiting",
      impact: w.inr > 0 ? `≈ ${inrText(w.inr).toUpperCase()} WAITING ON US` : `${w.n} WAITING ON US`,
      title: `Reply to the ${w.n} High-intent ${w.n === 1 ? "person" : "people"} waiting on us`,
      body: `They told us they’re keen and asked something.${w.medianDays != null ? ` Their last message has gone unanswered for a median of ${Math.round(w.medianDays)} days.` : ""}`,
      evidence: [
        { label: "Waiting on our reply", value: w.n, text: String(w.n), tone: "warn" },
        { label: "We spoke last", value: Math.max(0, hi - w.n), text: String(Math.max(0, hi - w.n)), tone: "neutral" },
      ],
      action: { label: `Open the ${w.n}`, href: "/conversations?filter=waiting" },
      basis: "High intent now · last message is theirs",
    });
  }
  const grid = heatGrid(i);
  const payRow = grid[2];
  if (i.payment.n > 0) {
    const under2w = payRow.filter((c) => ["d0_2", "d3_7", "d8_14"].includes(c.bucket)).reduce((t, c) => t + c.n, 0);
    const mid = payRow.find((c) => c.bucket === "d15_30")?.n ?? 0;
    const old = payRow.find((c) => c.bucket === "d30")?.n ?? 0;
    out.push({
      key: "payment_stale",
      impact: old ? `${old} AT PAYMENT FOR 30+ DAYS` : `${i.payment.n} AT PAYMENT PENDING`,
      title: "Find out where each Payment-pending person stands",
      body: "After a month at Payment pending, people rarely pay without a call. Mark each one Paid, Still deciding or Lost so the pipeline value is real.",
      evidence: [
        { label: "Under 2 weeks", value: under2w, text: String(under2w), tone: "good" },
        { label: "15–30 days", value: mid, text: String(mid), tone: "warn" },
        { label: "30+ days", value: old, text: String(old), tone: "bad" },
      ],
      action: { label: `Go through the ${i.payment.n}`, href: "/admissions?view=payments" },
      basis: "Days since the last message",
    });
  }
  if (hi >= 10 && i.moves30.highIntentToPayment <= Math.max(1, Math.round(hi * 0.05))) {
    out.push({
      key: "stuck_step",
      impact: "THE STUCK STEP: HIGH INTENT → PAYMENT",
      title: `${hi} at High intent, ${i.moves30.highIntentToPayment} moved to payment in 30 days`,
      body: "The step that needs a person is asking for the payment. Call the most engaged and take them through it; the AI never sends payment links itself.",
      evidence: [
        { label: "At High intent now", value: hi, text: String(hi), tone: "brand" },
        { label: "Moved to payment", value: i.moves30.highIntentToPayment, text: String(i.moves30.highIntentToPayment), tone: "bad" },
      ],
      action: { label: "Open High intent", href: "/leads?stage=high_intent" },
      basis: "Stage changes in the last 30 days",
    });
  }
  return out;
}
