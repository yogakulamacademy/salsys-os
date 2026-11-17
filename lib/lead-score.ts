// Sales AI Job 3: lead score (0-100), conversion confidence % and one next
// step, with the reasons. Pure and explainable: every point comes from a named
// factor a person can check. Confidence is labelled an early estimate until
// the organization has enough won leads to learn from.

export type ScoreInput = {
  stage: string;
  signals: string[]; // labels from readSignals (lead-intelligence.ts)
  courseSelected: boolean;
  inbound: number;
  outbound: number;
  needsReply: boolean;
  waitingMinutes: number | null; // since the lead's last message when waiting on us, else since last message
  daysSinceLastInbound: number | null;
  hasOpenFollowup: boolean;
  engagementScore?: number | null; // website behaviour 0-100 from v_lead_sales_intelligence
  paymentStarts7d?: number | null;
  wonLeadsInOrg: number; // won/enrolled leads the organization has, for the confidence label
  offerAsked?: boolean;
  followupRequested?: "will_get_back" | "not_now" | "requested_time" | "call_request" | null;
};

export type ScoreFactor = { key: string; label: string; points: number };

export type LeadScore = {
  score: number;
  band: "hot" | "warm" | "cool" | "cold";
  bandLabel: string;
  confidence: number; // % chance of paying within 30 days
  confidenceLabel: string; // e.g. "Early estimate"
  confidenceNote: string;
  factors: ScoreFactor[]; // sorted by impact, biggest first
  nextStep: { title: string; detail: string; urgency: "now" | "today" | "soon" | "later" };
};

export const MIN_WON_FOR_LEARNED_CONFIDENCE = 20;

const STAGE_POINTS: Record<string, [number, string]> = {
  new: [0, "New lead"],
  contacted: [4, "We have made contact"],
  engaged: [8, "Lead is talking to us"],
  qualified: [16, "Qualified: course and timing fit"],
  high_intent: [24, "Marked high intent"],
  payment_pending: [32, "Payment pending"],
  enrolled: [40, "Enrolled"],
  closed_won: [40, "Won"],
  nurture: [-6, "In nurture"],
  not_now: [-10, "Said not now"],
  lost: [-30, "Marked lost"],
  unqualified: [-30, "Unqualified"],
  duplicate: [-30, "Duplicate"],
};

const SIGNAL_POINTS: Record<string, number> = {
  "Talking about payment": 14,
  "Wants to apply": 12,
  "Asked about price": 6,
  "Asked about dates": 5,
  "Asked about stay": 4,
  "Asked about certification": 3,
  "Interested in online": 2,
  "Asking for a deal": 3,
};

// Rough share of leads at each stage that go on to pay, used only while there is
// too little won data to learn from. Deliberately conservative.
const STAGE_BASE_CONFIDENCE: Record<string, number> = {
  new: 4, contacted: 6, engaged: 8, qualified: 18, high_intent: 32, payment_pending: 55,
  enrolled: 97, closed_won: 97, nurture: 3, not_now: 2, lost: 1, unqualified: 1, duplicate: 1,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function scoreLead(input: ScoreInput): LeadScore {
  const factors: ScoreFactor[] = [];
  const add = (key: string, label: string, points: number) => { if (points !== 0) factors.push({ key, label, points }); };

  const [stagePts, stageLabel] = STAGE_POINTS[input.stage] ?? [0, "Stage unknown"];
  add("stage", stageLabel, stagePts);

  for (const s of input.signals) add(`signal:${s}`, s, SIGNAL_POINTS[s] ?? 2);
  if (input.courseSelected) add("course", "Course of interest known", 5);
  else add("no_course", "Course not known yet", -3);

  // Two-way conversation beats one-way.
  if (input.inbound >= 3 && input.outbound >= 2) add("conversation", "Back-and-forth conversation", 6);
  else if (input.inbound >= 1 && input.outbound === 0) add("unanswered", "We have not replied yet", -4);

  if (input.needsReply && input.waitingMinutes != null) {
    if (input.waitingMinutes > 1440) add("waiting", "Waiting on us for over a day", -10);
    else if (input.waitingMinutes > 240) add("waiting", "Waiting on us for over 4 hours", -5);
  }
  if (!input.needsReply && input.daysSinceLastInbound != null) {
    if (input.daysSinceLastInbound > 14) add("quiet", "No reply from the lead for 2+ weeks", -12);
    else if (input.daysSinceLastInbound > 5) add("quiet", "No reply from the lead for 5+ days", -6);
  }

  const web = input.engagementScore ?? null;
  if (web != null && web >= 60) add("web", "Active on the website this week", 6);
  else if (web != null && web >= 30) add("web", "Visited the website this week", 3);
  if ((input.paymentStarts7d ?? 0) > 0) add("payment_start", "Started a payment on the website", 12);

  if (input.followupRequested === "not_now") add("not_now", "Said not now / later", -10);
  else if (input.followupRequested === "will_get_back") add("deciding", "Said they will decide and get back", -2);
  else if (input.followupRequested === "requested_time" || input.followupRequested === "call_request") add("time_set", "Asked us to contact them at a set time", 4);
  if (input.hasOpenFollowup) add("followup", "Follow-up scheduled", 2);

  const raw = 30 + factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.round(clamp(raw, 0, 100));
  const band = score >= 75 ? "hot" : score >= 55 ? "warm" : score >= 35 ? "cool" : "cold";
  const bandLabel = { hot: "Hot", warm: "Warm", cool: "Cool", cold: "Cold" }[band];

  // Confidence: stage base rate moved by the same evidence, capped while unlearned.
  const learned = input.wonLeadsInOrg >= MIN_WON_FOR_LEARNED_CONFIDENCE;
  const base = STAGE_BASE_CONFIDENCE[input.stage] ?? 6;
  const evidence = factors.filter((f) => f.key !== "stage").reduce((sum, f) => sum + f.points, 0);
  const cap = learned ? 95 : 70;
  const confidence = Math.round(clamp(base + evidence * 0.8, 1, ["enrolled", "closed_won"].includes(input.stage) ? 99 : cap));
  const confidenceLabel = learned ? "Based on your won leads" : "Early estimate";
  const confidenceNote = learned
    ? `Learned from ${input.wonLeadsInOrg} won leads in your CRM.`
    : `Only ${input.wonLeadsInOrg} won lead${input.wonLeadsInOrg === 1 ? "" : "s"} in the CRM so far; this uses stage and conversation signals, and becomes learned after ${MIN_WON_FOR_LEARNED_CONFIDENCE} wins (importing past WhatsApp chats helps).`;

  factors.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  return { score, band, bandLabel, confidence, confidenceLabel, confidenceNote, factors, nextStep: nextStepFor(input) };
}

export function nextStepFor(input: ScoreInput): LeadScore["nextStep"] {
  const has = (s: string) => input.signals.includes(s);
  if (["enrolled", "closed_won"].includes(input.stage)) return { title: "Welcome and onboard", detail: "Send joining details and what to bring.", urgency: "soon" };
  if (["lost", "unqualified", "duplicate"].includes(input.stage)) return { title: "No action needed", detail: "This lead is closed.", urgency: "later" };
  if (input.needsReply) {
    if (has("Talking about payment") || has("Wants to apply")) return { title: "Reply now and send the registration step", detail: "They are ready to join; share how to register and the payment link (needs your approval).", urgency: "now" };
    if (has("Asking for a deal")) return { title: "Reply, then consider an offer", detail: "They asked for a discount; the AI offer card can prepare one for approval.", urgency: "now" };
    if (has("Asked about price")) return { title: "Reply with fees and the next batches", detail: "Use Send fees in Quick actions.", urgency: "now" };
    if (has("Asked about dates")) return { title: "Reply with batch dates", detail: "Use Batch dates in Quick actions.", urgency: "now" };
    if (!input.courseSelected) return { title: "Reply and ask which course and month", detail: "Knowing the course unlocks fees, dates and templates.", urgency: "now" };
    return { title: "Reply to their message", detail: "They are waiting on us.", urgency: input.waitingMinutes != null && input.waitingMinutes > 240 ? "now" : "today" };
  }
  if (input.stage === "payment_pending") return { title: "Check the payment", detail: "Confirm whether they paid; if not, send a gentle reminder.", urgency: "today" };
  if (input.followupRequested === "not_now") return { title: "Let it rest; check in later", detail: "A check-in is scheduled; move to Nurture if they stay quiet.", urgency: "later" };
  if (input.hasOpenFollowup) return { title: "Follow-up is scheduled", detail: "Nothing to do until it is due.", urgency: "later" };
  if (input.daysSinceLastInbound != null && input.daysSinceLastInbound > 14) return { title: "Re-engage or move to Nurture", detail: "Send one check-in with the next batch dates.", urgency: "soon" };
  if (input.daysSinceLastInbound != null && input.daysSinceLastInbound > 2) return { title: "Schedule a follow-up", detail: "They have not replied for a few days; a nudge with dates works best.", urgency: "soon" };
  if (!input.courseSelected) return { title: "Find out which course and month", detail: "Ask one qualifying question.", urgency: "soon" };
  return { title: "Wait for their reply", detail: "We replied last; a follow-up will be suggested if they go quiet.", urgency: "later" };
}
