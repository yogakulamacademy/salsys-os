// Smart Re-engaged briefing (owner-approved mockup "Smart Re-engaged", 25 Nov
// 2026). Pure helpers over reengaged_intelligence_v1.

export type ComebackPerson = {
  leadId: string; at: string; body: string; afterCheckin: boolean; silentDays: number;
  name: string; stage: string; channel: string | null; course: string | null;
  value: number | null; currency: string | null; waiting: boolean;
};
export type ReengagedData = { weeks: Array<{ week: string; people: number; afterCheckin: number }>; people: ComebackPerson[] };
export type ReplyKind = "yes" | "asked" | "other" | "shared" | "no";

export const REPLY_LABEL: Record<ReplyKind, string> = {
  yes: "Said yes", asked: "Asked a question", other: "Other reply", shared: "Shared a post", no: "Said no / not now",
};
export const REPLY_ORDER: ReplyKind[] = ["yes", "asked", "other", "shared", "no"];

export function isReengagedData(v: unknown): v is ReengagedData {
  const d = v as ReengagedData | null;
  return Boolean(d && Array.isArray(d.weeks) && Array.isArray(d.people));
}

/** What a reply says, from its text. Order matters: a clear yes wins over a later "but". */
export function replyKind(body: string): ReplyKind {
  const t = (body ?? "").trim();
  if (!t || /^shared an? /i.test(t) || /^\[instagram (ig_post|story|reel|share)/i.test(t) || /^https?:\/\/\S+$/i.test(t)) return "shared";
  const negInterest = /\bnot\s+(really\s+)?(interest|interested|intrested)\b/i.test(t);
  if (!negInterest && (/^\s*(yes|yeah|yep|yup|sure|ok|okay|haan|ha)\b/i.test(t) || /\b(i'?m|i am)\s+(very\s+|really\s+)?(interested|intrested)\b/i.test(t) || /\byes\b.*\b(interest|intrest)/i.test(t))) return "yes";
  if (/\?/.test(t) || /^(when|what|how|which|where|can|could|is|are|do|does|may|will|would)\b/i.test(t)
    || /\b(details|tell me more|share|schedule|charges|cost|fees?|price|discount|accommodation)\b/i.test(t)) return "asked";
  if (/\b(no|nope|not|sorry|sry|later|stop|cannot|can'?t|won'?t|already)\b/i.test(t)) return "no";
  return "other";
}

const ADVANCED = new Set(["high_intent", "payment_pending"]);
const CLOSED = new Set(["not_now", "lost", "closed_won", "enrolled", "unqualified", "duplicate"]);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function summarise(d: ReengagedData) {
  const people = d.people.map((p) => ({ ...p, kind: replyKind(p.body) }));
  const count = (k: ReplyKind) => people.filter((p) => p.kind === k).length;
  const kinds = Object.fromEntries(REPLY_ORDER.map((k) => [k, count(k)])) as Record<ReplyKind, number>;
  const thisWeek = d.weeks.at(-1)?.people ?? people.length;
  const previous = d.weeks.slice(0, -1).map((w) => w.people).filter((n) => n > 0);
  const usual = Math.round(median(previous));
  const rank = (p: { stage: string; kind: ReplyKind }) => (ADVANCED.has(p.stage) ? 0 : 1) * 10 + (p.kind === "yes" ? 0 : 1);
  const ready = people.filter((p) => (p.kind === "yes" || p.kind === "asked") && p.waiting && !CLOSED.has(p.stage)).sort((a, b) => rank(a) - rank(b));
  const readyAll = people.filter((p) => (p.kind === "yes" || p.kind === "asked") && !CLOSED.has(p.stage)).sort((a, b) => Number(b.waiting) - Number(a.waiting) || rank(a) - rank(b));
  const saidNo = people.filter((p) => p.kind === "no" && !CLOSED.has(p.stage));
  const inr = people.filter((p) => p.kind !== "no" && (p.currency ?? "INR").toUpperCase() === "INR" && p.value && p.value > 0);
  return {
    people,
    kinds,
    thisWeek,
    usual,
    change: usual ? (thisWeek - usual) / usual : null,
    waiting: people.filter((p) => p.waiting).length,
    advanced: people.filter((p) => ADVANCED.has(p.stage)).length,
    afterCheckin: people.filter((p) => p.afterCheckin).length,
    onOwn: people.filter((p) => !p.afterCheckin).length,
    medianSilence: Math.round(median(people.map((p) => p.silentDays))),
    ready,
    readyAll,
    readyAdvanced: ready.filter((p) => ADVANCED.has(p.stage)).length,
    saidNo,
    valueInr: inr.reduce((s, p) => s + (p.value ?? 0), 0),
  };
}

export type ReengagedSummary = ReturnType<typeof summarise>;

export function reengagedHeadline(s: ReengagedSummary): string {
  if (!s.thisWeek) return "Nobody has written back after a quiet spell this week yet.";
  const vs = s.usual && s.thisWeek >= s.usual * 1.5 ? `, about ${Math.round(s.thisWeek / s.usual)}× a usual week` : "";
  const why = s.afterCheckin >= s.thisWeek * 0.6 ? ", mostly answering your team's check-in messages" : "";
  const act = s.ready.length
    ? ` ${s.ready.length} said yes or asked something and are waiting: contact them first.`
    : s.readyAll.length ? ` All ${s.readyAll.length} who said yes or asked have had a reply.` : "";
  return `${s.thisWeek} past enquirers wrote back this week${vs}${why}.${act}`;
}
