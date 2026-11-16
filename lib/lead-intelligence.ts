// Lead intelligence: where a lead stands and what has happened, read from
// the conversation and the CRM history. Pure functions, no I/O, so the card
// can be rendered on the server and tested without a database.

export type JourneyStage =
  | "new"
  | "contacted"
  | "engaged"
  | "qualified"
  | "high_intent"
  | "payment_pending"
  | "enrolled";

export const JOURNEY: Array<[JourneyStage, string]> = [
  ["new", "New"],
  ["contacted", "Contacted"],
  ["engaged", "Engaged"],
  ["qualified", "Qualified"],
  ["high_intent", "High intent"],
  ["payment_pending", "Payment pending"],
  ["enrolled", "Enrolled"],
];

const OFF_TRACK: Record<string, string> = {
  nurture: "Nurture",
  not_now: "Not now",
  lost: "Lost",
  unqualified: "Unqualified",
  duplicate: "Duplicate",
};

export type IntelMessage = {
  direction: "inbound" | "outbound";
  body: string;
  timestamp: string;
  sender?: string;
};

export type IntelTouchpoint = {
  label: string;
  timestamp: string;
  kind: string;
  source?: string;
  detail?: string;
};

export type IntentLevel = "high" | "warm" | "curious" | "hello";
export type Health = "on_time" | "reply_soon" | "going_cold" | "waiting_on_them" | "quiet";
export type TimelineTone = "lead" | "team" | "good" | "warn" | "muted";

export type LeadIntelligence = {
  intent: IntentLevel;
  intentLabel: string;
  summary: string;
  journey: { stages: Array<{ key: JourneyStage; label: string; state: "done" | "current" | "todo" }>; stepText: string; offTrack: string | null };
  stats: { waitText: string; waitLabel: string; health: Health; healthLabel: string; inbound: number; outbound: number };
  signals: string[];
  timeline: Array<{ text: string; when: string; tone: TimelineTone }>;
};

// Signals read from what the lead wrote. Weight feeds the intent level.
const SIGNALS: Array<[RegExp, string, number]> = [
  [/\b(fees?|cost|price|prices|charges?|how much|kitna|package|installments?|emi)\b/i, "Asked about price", 2],
  [/\b(dates?|batch|batches|schedule|timings?|when|next month|start)\b/i, "Asked about dates", 1],
  [/\b(apply|application|register|registration|enrol+|enroll|admission|book|booking|seat)\b/i, "Wants to apply", 3],
  [/\b(pay|payment|paid|upi|bank transfer|transfer|deposit|advance)\b/i, "Talking about payment", 3],
  [/\b(accommodation|accomodation|stay|room|twin|sharing|food|meals?)\b/i, "Asked about stay", 1],
  [/\b(online|recorded|zoom)\b/i, "Interested in online", 1],
  [/\b(certified|certificate|certification|teacher|rys|alliance|200[- ]?h(ou)?r|300[- ]?h(ou)?r|500[- ]?h(ou)?r)\b/i, "Asked about certification", 1],
  [/\b(discount|offer|deal|cheaper|scholarship|concession)\b/i, "Asking for a deal", 1],
];

const MINUTE = 60_000;

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function formatAgo(fromMs: number, nowMs: number): string {
  const mins = Math.max(0, Math.floor((nowMs - fromMs) / MINUTE));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d` : `${Math.floor(days / 30)}mo`;
}

function whenText(value: string, nowMs: number): string {
  const t = ms(value);
  return t == null ? "" : formatAgo(t, nowMs) === "just now" ? "Just now" : `${formatAgo(t, nowMs)} ago`;
}

function clip(text: string, max = 48): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function readSignals(messages: IntelMessage[]): { labels: string[]; score: number } {
  const said = messages.filter((m) => m.direction === "inbound").map((m) => m.body).join(" \n ");
  const hits = SIGNALS.filter(([re]) => re.test(said));
  return { labels: hits.map(([, label]) => label), score: hits.reduce((sum, [, , w]) => sum + w, 0) };
}

export function intentFor(score: number, stage: string): { level: IntentLevel; label: string } {
  // A stage the team already set wins over keyword reading.
  if (stage === "payment_pending" || stage === "high_intent" || stage === "enrolled") return { level: "high", label: "High intent" };
  if (score >= 4) return { level: "high", label: "High intent" };
  if (score >= 2) return { level: "warm", label: "Warm" };
  if (score >= 1) return { level: "curious", label: "Curious" };
  return { level: "hello", label: "Just said hi" };
}

export function buildLeadIntelligence(input: {
  stage: string;
  messages: IntelMessage[];
  touchpoints?: IntelTouchpoint[];
  course?: string | null;
  ownerName?: string | null;
  createdAt?: string | null;
  originLabel?: string | null;
  waitingSince?: string | null;
  needsReply?: boolean;
  needsFirstContact?: boolean;
  now?: number;
}): LeadIntelligence {
  const now = input.now ?? Date.now();
  const messages = [...input.messages].sort((a, b) => (ms(a.timestamp) ?? 0) - (ms(b.timestamp) ?? 0));
  const { labels, score } = readSignals(messages);
  const course = input.course && input.course !== "Not selected" ? input.course : null;
  const intent = intentFor(score + (course ? 1 : 0), input.stage);

  // Journey
  const offTrack = OFF_TRACK[input.stage] ?? null;
  const idx = JOURNEY.findIndex(([key]) => key === input.stage);
  const current = idx < 0 ? 0 : idx;
  const stages = JOURNEY.map(([key, label], i) => ({
    key,
    label,
    state: offTrack ? ("todo" as const) : i < current ? ("done" as const) : i === current ? ("current" as const) : ("todo" as const),
  }));
  const stageLabel = offTrack ?? JOURNEY[current][1];
  const stepText = offTrack ? `Off the journey · ${offTrack}` : `${stageLabel} · step ${current + 1} of ${JOURNEY.length}`;

  // Stats
  const inbound = messages.filter((m) => m.direction === "inbound").length;
  const outbound = messages.length - inbound;
  const last = messages[messages.length - 1];
  const waitingOnUs = Boolean(input.needsReply || input.needsFirstContact);
  const waitFrom = waitingOnUs ? ms(input.waitingSince) ?? ms(last?.timestamp) ?? ms(input.createdAt) : ms(last?.timestamp);
  const waitMins = waitFrom == null ? null : (now - waitFrom) / MINUTE;
  let health: Health;
  if (!waitingOnUs) health = waitMins != null && waitMins > 7 * 1440 ? "quiet" : "waiting_on_them";
  else if (waitMins != null && waitMins > 1440) health = "going_cold";
  else if (waitMins != null && waitMins > 60) health = "reply_soon";
  else health = "on_time";
  const healthLabel = { on_time: "On time", reply_soon: "Reply soon", going_cold: "Going cold", waiting_on_them: "Ball with them", quiet: "Gone quiet" }[health];

  // Story line: one sentence a person can read in two seconds.
  const ask = labels[0]?.toLowerCase() ?? (inbound ? "said hello" : null);
  const parts = [`${stageLabel} lead`];
  if (ask) parts.push(ask);
  if (course) parts.push(course);
  let summary = `${parts.join(" · ")}.`;
  if (waitingOnUs && waitFrom != null) summary += ` Waiting ${formatAgo(waitFrom, now)} for our ${outbound ? "reply" : "first reply"}.`;
  else if (outbound && !waitingOnUs) summary += " We replied; waiting on them.";
  if (!input.ownerName) summary += " No owner yet.";

  // What's happened: newest first, five items.
  type Ev = { t: number; text: string; when: string; tone: TimelineTone };
  const events: Ev[] = [];
  const created = ms(input.createdAt);
  if (created != null) events.push({ t: created, text: input.originLabel ? `Came in via ${input.originLabel}` : "Lead created", when: whenText(input.createdAt!, now), tone: "muted" });
  for (const m of messages) {
    const t = ms(m.timestamp);
    if (t == null) continue;
    events.push(m.direction === "inbound"
      ? { t, text: `Lead: ${clip(m.body)}`, when: whenText(m.timestamp, now), tone: "lead" }
      : { t, text: `${m.sender === "AI Agent" ? "AI" : "Team"} replied`, when: whenText(m.timestamp, now), tone: "team" });
  }
  for (const p of input.touchpoints ?? []) {
    const t = ms(p.timestamp);
    if (t == null || p.kind === "message") continue; // messages are already listed
    const tone: TimelineTone = p.kind === "payment" ? "good" : p.kind === "stage" ? "team" : "muted";
    const label = p.label.charAt(0).toUpperCase() + p.label.slice(1);
    events.push({ t, text: p.source === "AI" ? `${label} (by AI)` : label, when: whenText(p.timestamp, now), tone });
  }
  // Collapse runs of team replies so the timeline is not just "Team replied" x5.
  events.sort((a, b) => a.t - b.t);
  const collapsed: Ev[] = [];
  for (const e of events) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && /replied$/.test(e.text) && prev.text.replace(/ ×\d+$/, "") === e.text) {
      const n = Number(/×(\d+)$/.exec(prev.text)?.[1] ?? 1) + 1;
      collapsed[collapsed.length - 1] = { ...e, text: `${e.text} ×${n}` };
    } else collapsed.push(e);
  }
  const timeline = collapsed.slice(-5).reverse().map(({ text, when, tone }) => ({ text, when, tone }));
  if (waitingOnUs && health === "going_cold") timeline.unshift({ text: "No reply from us for over a day", when: "Now", tone: "warn" });

  return {
    intent: intent.level,
    intentLabel: intent.label,
    summary,
    journey: { stages, stepText, offTrack },
    stats: {
      waitText: waitFrom == null ? "—" : formatAgo(waitFrom, now),
      waitLabel: waitingOnUs ? "Waiting on us" : "Since last message",
      health,
      healthLabel,
      inbound,
      outbound,
    },
    signals: labels,
    timeline: timeline.slice(0, 5),
  };
}
