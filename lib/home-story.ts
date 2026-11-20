// The Home "story" (owner request, 19 Nov 2026). Pure: turns raw facts into
// plain sentences and short lists so the numbers explain themselves.

export type StoryLead = {
  id: string;
  name: string;
  stage: string;
  course: string | null;
  lastInboundAt: string;
  quote: string | null;
};

/**
 * The lead says they have paid or enrolled ("Payment made", "I've made the
 * payment", "I have enrolled"). A question about paying doesn't count.
 */
export function saysTheyPaid(text: string | null | undefined): boolean {
  const t = (text ?? "").toLowerCase().replace(/[’']/g, "'");
  if (!t.trim() || /\?\s*$/.test(t)) return false;
  if (/\b(how|where|can i|should i|when|will i|want to|going to|shall i)\b/.test(t)) return false;
  return /\b(payment (is )?(made|done|completed|successful|sent)|(i'?ve|i have|i|we'?ve|we have|just) (made|done|completed|sent) (the |my )?payment|(i'?ve|i have|i|just|already) paid|paid the (fee|fees|amount)|(i'?ve|i have|i) (enrolled|registered)|transferred the (fee|fees|amount|money))\b/.test(t);
}

export type HomeStory = {
  /** Waiting for a reply, last message within 3 days. */
  waitingNow: number;
  /** Waiting for a reply, last message within 7 days. */
  waitingThisWeek: number;
  /** Qualified, high intent or paying leads with no reply for 2+ days (up to 30 days). */
  goingColdCount: number;
  goingCold: StoryLead[];
  /** No reply for 7+ days. */
  winBack: { total: number; withCourse: number; withoutCourse: number };
  lostSuggestions: number;
  aiRepliesToday: number;
  /** Leads whose last message says they paid or enrolled, with nothing recorded yet. */
  saysPaid: StoryLead[];
  leadsThisWeek: number | null;
  leadsLastWeek: number | null;
  /** Percentage change, null without a meaningful baseline. */
  leadsChange: number | null;
  /** Inbound messages per hour of the day (business time), last 30 days. */
  hours: number[];
  busiest: string | null;
  headline: string;
};

const INTERESTED = new Set(["qualified", "high_intent", "payment_pending"]);
const HOUR = 3_600_000;

/** Hour of day in India time (the business's time zone). */
export function istHour(iso: string): number {
  return new Date(Date.parse(iso) + 5.5 * HOUR).getUTCHours();
}

function label(h: number): string {
  if (h === 0) return "12 am";
  if (h === 12) return "12 pm";
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

/** The longest run of hours at 75%+ of the peak, e.g. "2–5 pm". */
export function busiestWindow(hours: number[]): string | null {
  const peak = Math.max(0, ...hours);
  if (peak < 10) return null;
  const hot = hours.map((c) => c >= peak * 0.75);
  let best: [number, number] | null = null;
  for (let i = 0; i < 24; i += 1) {
    if (!hot[i]) continue;
    let j = i;
    while (j + 1 < 24 && hot[j + 1]) j += 1;
    if (!best || j - i > best[1] - best[0]) best = [i, j];
    i = j;
  }
  if (!best) return null;
  return best[0] === best[1] ? `around ${label(best[0])}` : `${label(best[0])}–${label(best[1] + 1)}`;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

export function buildHomeStory(input: {
  now: Date;
  waiting: StoryLead[];
  inboundTimes: string[];
  leadsThisWeek: number | null;
  leadsLastWeek: number | null;
  lostSuggestions: number;
  aiRepliesToday: number;
  saysPaid?: StoryLead[];
}): HomeStory {
  const now = input.now.getTime();
  const ageH = (l: StoryLead) => (now - Date.parse(l.lastInboundAt)) / HOUR;
  const waitingNow = input.waiting.filter((l) => ageH(l) <= 72).length;
  const waitingThisWeek = input.waiting.filter((l) => ageH(l) <= 168).length;
  const cold = input.waiting
    .filter((l) => INTERESTED.has(l.stage) && ageH(l) > 48 && ageH(l) <= 720)
    // Furthest along first, then the freshest (easiest to win back).
    .sort((a, b) => stageRank(b.stage) - stageRank(a.stage) || Date.parse(b.lastInboundAt) - Date.parse(a.lastInboundAt));
  const old = input.waiting.filter((l) => ageH(l) > 168);
  const withCourse = old.filter((l) => l.course).length;

  const hours = new Array<number>(24).fill(0);
  for (const t of input.inboundTimes) hours[istHour(t)] += 1;

  const { leadsThisWeek: tw, leadsLastWeek: lw } = input;
  const leadsChange = tw != null && lw != null && lw >= 20 ? Math.round(((tw - lw) / lw) * 100) : null;

  const saysPaid = input.saysPaid ?? [];
  const parts: string[] = [];
  if (saysPaid.length) parts.push(`${plural(saysPaid.length, "lead says they've", "leads say they've")} paid but nothing is recorded`);
  if (waitingNow) parts.push(`${plural(waitingNow, "person is", "people are")} waiting for a reply`);
  if (cold.length) parts.push(`${plural(cold.length, "interested lead hasn't", "interested leads haven't")} heard from you in over 2 days`);
  const headline = parts.length
    ? `${parts.length > 2 ? `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}` : parts.join(", and ")}.`.replace(/^./, (c) => c.toUpperCase())
    : "Everyone who wrote recently has a reply. Nice work.";

  return {
    waitingNow,
    waitingThisWeek,
    goingColdCount: cold.length,
    goingCold: cold.slice(0, 5),
    winBack: { total: old.length, withCourse, withoutCourse: old.length - withCourse },
    lostSuggestions: input.lostSuggestions,
    aiRepliesToday: input.aiRepliesToday,
    saysPaid,
    leadsThisWeek: tw,
    leadsLastWeek: lw,
    leadsChange,
    hours,
    busiest: busiestWindow(hours),
    headline,
  };
}

function stageRank(stage: string): number {
  return stage === "payment_pending" ? 3 : stage === "high_intent" ? 2 : stage === "qualified" ? 1 : 0;
}

/** "3 days", "5 hours". */
export function waitedFor(lastInboundAt: string, now: Date): string {
  const h = Math.max(0, Math.floor((now.getTime() - Date.parse(lastInboundAt)) / HOUR));
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"}`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "day" : "days"}`;
}

/** The biggest stall in the funnel, as one sentence. */
export function funnelInsight(groups: Array<{ id: string; label: string; value: number; parked?: boolean }>): string | null {
  const active = groups.filter((g) => !g.parked);
  const total = active.reduce((s, g) => s + g.value, 0);
  if (total < 20) return null;
  const top = [...active].sort((a, b) => b.value - a.value)[0];
  const share = Math.round((top.value / total) * 100);
  if (share < 40) return null;
  const ahead = active.filter((g) => ["qualified", "high_intent", "payment_pending", "enrolled"].includes(g.id)).reduce((s, g) => s + g.value, 0);
  const oneIn = ahead ? Math.max(1, Math.round(total / ahead)) : null;
  if (top.id === "engaged") {
    return `${share}% of leads asked something (usually the fee) and went quiet${oneIn ? `; only 1 in ${oneIn} has said which course and when` : ""}. Asking "Which course and month are you planning?" in the first reply moves more of them forward.`;
  }
  if (top.id === "new") return `${share}% of leads haven't had a first reply yet. Replying first is the quickest win.`;
  return `${share}% of leads are at ${top.label}. That's where the pipeline is stuck.`;
}
