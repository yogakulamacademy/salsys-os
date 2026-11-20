// Inbox "Waiting" view (owner-approved design, 20 Nov 2026). Pure: no imports,
// so it runs under `node --experimental-strip-types` in the behaviour tests.
//
// "Needs reply" mixed people who wrote this morning with people who wrote a
// month ago. Waiting = wrote in the last 7 days and has no reply yet; Older =
// the rest. Waiting chats are grouped by what the person actually sent, so
// real questions are not buried under shared reels and story reactions.

export const WAITING_DAYS = 7;
const DAY = 86_400_000;

export type WaitKind = "paid" | "question" | "message" | "share";

export const WAIT_KIND_ORDER: WaitKind[] = ["paid", "question", "message", "share"];

export const WAIT_KIND_LABEL: Record<WaitKind, string> = {
  paid: "Says they paid",
  question: "Asked a question",
  message: "Sent a message",
  share: "Shared a reel, post or story",
};

/** True when the wait started within the last 7 days. */
export function isRecentWait(waitingSince: string | null | undefined, now: number): boolean {
  if (!waitingSince) return false;
  const at = Date.parse(waitingSince);
  return Number.isFinite(at) && now - at <= WAITING_DAYS * DAY;
}

const SHARE = /^shared an instagram (reel|post|story)\b/i;
const IG_EVENT = /^\[instagram ([a-z_]+) message\]$/i;
const QUESTION_WORDS = /\b(fees?|price|cost|how much|dates?|batch(es)?|when|where|how|which|what|accommodation|stay|food|certificat\w*|online|offline|regist\w*|enrol\w*|apply|admission|discount|instal+ments?|emi|available|duration|timings?|schedule|syllabus|refund|interested|details|brochure)\b/i;

/** Plain words for the last message, as a person would say it. */
export function describeLastMessage(text: string | null | undefined): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const share = t.match(SHARE);
  if (share) return `Shared a ${share[1].toLowerCase()}`;
  const ig = t.match(IG_EVENT);
  if (ig) {
    const kind = ig[1].toLowerCase();
    if (kind === "story_reply") return "Replied to your story";
    if (kind === "ig_story" || kind === "story_mention") return "Mentioned you in a story";
    if (kind === "ephemeral") return "Sent a disappearing photo or video";
    if (kind === "reaction" || kind === "like_heart") return "Reacted to a message";
    return "Sent an attachment";
  }
  return t.length > 140 ? `${t.slice(0, 139).trimEnd()}…` : t;
}

/** What the person sent last: a question, a message, or just a share or story reaction. */
export function waitKind(text: string | null | undefined, saysPaid = false): WaitKind {
  if (saysPaid) return "paid";
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t || SHARE.test(t) || IG_EVENT.test(t)) return "share";
  if (t.includes("?") || QUESTION_WORDS.test(t)) return "question";
  return "message";
}

export type WaitingRow = { id: string; waitingSince: string | null; kind: WaitKind };

/** Groups in order paid → question → message → share; longest wait first inside each. */
export function groupWaiting<T extends WaitingRow>(rows: T[]): Array<{ kind: WaitKind; rows: T[] }> {
  return WAIT_KIND_ORDER.map((kind) => ({
    kind,
    rows: rows
      .filter((r) => r.kind === kind)
      .sort((a, b) => (Date.parse(a.waitingSince ?? "") || 0) - (Date.parse(b.waitingSince ?? "") || 0)),
  })).filter((g) => g.rows.length > 0);
}

export type WaitingSummary = {
  total: number;
  counts: Record<WaitKind, number>;
  last24h: number;
  oldestQuestionDays: number | null;
  headline: string;
};

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
}

/** The one-sentence summary for the Inbox overview. */
export function summarizeWaiting(rows: WaitingRow[], now: number): WaitingSummary {
  const counts: Record<WaitKind, number> = { paid: 0, question: 0, message: 0, share: 0 };
  for (const r of rows) counts[r.kind] += 1;
  const last24h = rows.filter((r) => { const at = Date.parse(r.waitingSince ?? ""); return Number.isFinite(at) && now - at <= DAY; }).length;
  const qAges = rows.filter((r) => r.kind === "question").map((r) => now - (Date.parse(r.waitingSince ?? "") || now));
  const oldestQuestionDays = qAges.length ? Math.floor(Math.max(...qAges) / DAY) : null;
  const total = rows.length;
  let headline: string;
  if (!total) {
    headline = "Nobody is waiting for a reply right now.";
  } else {
    const parts: string[] = [];
    if (counts.question) parts.push(`${counts.question.toLocaleString("en-IN")} asked a question`);
    if (counts.message) parts.push(`${counts.message.toLocaleString("en-IN")} sent a message`);
    if (counts.share) parts.push(`${counts.share.toLocaleString("en-IN")} only shared a reel or reacted to a story`);
    const joined = parts.length <= 1 ? parts.join("") : parts.length === 2 ? `${parts[0]} and ${parts[1]}` : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
    headline = `${plural(total, "person wrote this week and is", "people wrote this week and are")} waiting.${joined ? ` ${joined.charAt(0).toUpperCase()}${joined.slice(1)}.` : ""}`;
  }
  return { total, counts, last24h, oldestQuestionDays, headline };
}
