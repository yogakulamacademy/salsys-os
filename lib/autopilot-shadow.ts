// Sales AI Job 2, phase 1: Autopilot in shadow mode (Instagram first).
// The AI drafts a reply to each new inbound message; a person reviews and
// sends. We record how much the person changed, which decides when Autopilot
// may send by itself. Pure functions only.

export type ShadowStopReason =
  | "window_closed"
  | "closed_stage"
  | "health_safety"
  | "money_or_commitment"
  | "offer_request"
  | "complaint_or_refund"
  | "router_review"
  | "router_human_only"
  | "no_knowledge"
  | "topic_not_allowed"
  | "non_text";

export const STOP_LABELS: Record<ShadowStopReason, string> = {
  window_closed: "Instagram reply window has closed",
  closed_stage: "Lead is closed",
  health_safety: "Health or pregnancy question",
  money_or_commitment: "Payment or commitment",
  offer_request: "Asked for a discount or offer",
  complaint_or_refund: "Complaint, refund or legal",
  router_review: "AI was unsure; needs a person",
  router_human_only: "Needs a person",
  no_knowledge: "No approved knowledge for this",
  topic_not_allowed: "Topic not switched on for Autopilot yet",
  non_text: "Not a text message",
};

// Topics Autopilot may answer by itself in phase 1 (decided: Instagram, 3 topics).
export const PHASE1_TOPICS = ["dates", "course_content", "register"] as const;

const INSTAGRAM_WINDOW_MS = 24 * 3_600_000;

export function topicOf(text: string): "fee" | "dates" | "register" | "accommodation" | "online_offline" | "location" | "certification" | "course_content" | "other" {
  const t = text.toLowerCase();
  if (/\b(fees?|cost|price|how much|kitna|discount|emi|installment)\b/.test(t)) return "fee";
  if (/\b(register|registration|enrol+|enroll|apply|admission|book|seat)\b/.test(t)) return "register";
  if (/\b(dates?|batch|batches|schedule|timings?|when|next month|starting)\b/.test(t)) return "dates";
  if (/\b(accommodation|accomodation|stay|room|food|meals?)\b/.test(t)) return "accommodation";
  if (/\b(online|offline|recorded|zoom|live)\b/.test(t)) return "online_offline";
  if (/\b(location|where|address|located)\b/.test(t)) return "location";
  if (/\b(certificate|certification|certified|alliance|rys)\b/.test(t)) return "certification";
  if (/\b(syllabus|curriculum|course|training|ttc|hours?|duration|teach|learn|style|level)\b/.test(t)) return "course_content";
  return "other";
}

/** Hard stops checked in code before and after Claude; the model cannot override these. */
export function hardStop(text: string): ShadowStopReason | null {
  const t = text.toLowerCase();
  if (/\b(pregnan\w*|trimester|injur\w*|surgery|c[- ]?section|medical|disease|depress\w*|anxiety|blood pressure|diabet\w*|heart|back pain|slip disc)\b/.test(t)) return "health_safety";
  if (/\b(refund|money back|complain\w*|cheat\w*|fraud|lawyer|legal|consumer court|sue)\b/.test(t)) return "complaint_or_refund";
  if (/\b(discount|offer|concession|scholarship|cheaper|reduce|less price|best price|exchange for)\b/.test(t)) return "offer_request";
  if (/\b(pay|paid|payment|upi|bank|transfer|paypal|installment|emi|advance|deposit|receipt|invoice)\b/.test(t)) return "money_or_commitment";
  return null;
}

export type ShadowDecision = {
  wouldSend: boolean;
  stopReason: ShadowStopReason | null;
  topic: ReturnType<typeof topicOf>;
};

/** Would real Autopilot send this reply by itself? Shadow mode drafts either way. */
export function shadowDecision(input: {
  latestInbound: string;
  latestInboundAt: string;
  now: Date;
  stage: string;
  routerRisk: "low" | "review" | "human_only" | null;
  knowledgeUsed: number;
  draft?: string | null;
}): ShadowDecision {
  const topic = topicOf(input.latestInbound);
  const stop = (reason: ShadowStopReason): ShadowDecision => ({ wouldSend: false, stopReason: reason, topic });
  if (!input.latestInbound.trim() || input.latestInbound === "[non-text message]") return stop("non_text");
  const at = Date.parse(input.latestInboundAt);
  if (!Number.isFinite(at) || input.now.getTime() - at > INSTAGRAM_WINDOW_MS) return stop("window_closed");
  if (["enrolled", "closed_won", "lost", "unqualified", "duplicate"].includes(input.stage)) return stop("closed_stage");
  const hard = hardStop(input.latestInbound);
  if (hard) return stop(hard);
  if (input.routerRisk === "human_only") return stop("router_human_only");
  if (input.routerRisk === "review") return stop("router_review");
  if (input.knowledgeUsed < 1) return stop("no_knowledge");
  if (!(PHASE1_TOPICS as readonly string[]).includes(topic)) return stop("topic_not_allowed");
  // The draft itself must not make money claims (checked again after Claude writes).
  if (input.draft && /(₹|rs\.?\s?\d|inr|usd|\$\s?\d|€\s?\d|\bdiscount\b|payment link)/i.test(input.draft)) return stop("money_or_commitment");
  return { wouldSend: true, stopReason: null, topic };
}

/** How much a person changed the AI draft before sending: 0 = unchanged, 1 = fully rewritten. */
export function editRatio(draft: string, sent: string): number {
  const a = normalize(draft);
  const b = normalize(sent);
  if (!a && !b) return 0;
  if (!a || !b) return 1;
  if (a === b) return 0;
  const wa = a.split(" ");
  const wb = b.split(" ");
  // Word-level edit distance (bounded so long messages stay cheap).
  const n = Math.min(wa.length, 400);
  const m = Math.min(wb.length, 400);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i += 1) {
    const cur = [i];
    for (let j = 1; j <= m; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (wa[i - 1] === wb[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.min(1, prev[m] / Math.max(n, m));
}

export type ShadowOutcome = "sent_as_is" | "sent_small_edit" | "sent_rewritten";

export function outcomeFor(ratio: number): ShadowOutcome {
  if (ratio <= 0.02) return "sent_as_is";
  if (ratio <= 0.25) return "sent_small_edit";
  return "sent_rewritten";
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
