// Customer 360 person view (owner-approved v2 mockup, 20 Nov 2026). Pure.
// Turns what we know about one person into a short summary and one timeline,
// using only their own messages, forms, visits and recorded stage changes.

export type TimelineKind = "web" | "form" | "message" | "reply" | "stage" | "ai" | "payment" | "warn";

export type TimelineItem = { at: string; kind: TimelineKind; title: string; detail?: string | null };

export type PersonFacts = {
  name: string;
  course: string | null;
  location: string | null;
  month: string | null;
  mode: string | null;
  country: string | null;
  countryLikely: boolean;
  stage: string;
};

const DAY = 86_400_000;

export const STAGE_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", engaged: "Engaged", qualified: "Qualified", high_intent: "High intent",
  payment_pending: "Payment pending", closed_won: "Won", enrolled: "Enrolled", not_now: "Not now", lost: "Lost",
};
const stageLabel = (s: string | null | undefined) => (s ? STAGE_LABEL[s] ?? s.replace(/_/g, " ") : "");

function dayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Short, plain quote of a message. Instagram system notes get a label. */
export function quote(text: string | null | undefined, max = 110): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/^\[Instagram ephemeral/i.test(t)) return "Sent a disappearing message";
  if (/^Shared an Instagram (reel|post|video|image|story)/i.test(t)) return "Shared a post or reel";
  if (/^\[Instagram /i.test(t)) return "Sent something only Instagram can show";
  return `“${t.length > max ? `${t.slice(0, max - 1)}…` : t}”`;
}

export function buildPersonTimeline(input: {
  stageChanges: { at: string; from: string | null; to: string; by: string | null; reason: string | null }[];
  messages: { at: string; direction: "inbound" | "outbound"; body: string | null; aiGenerated?: boolean }[];
  forms: { at: string; name: string | null; message: string | null }[];
  pageViews: { at: string; path: string | null }[];
  sessions: { at: string; source: string | null }[];
  payments: { at: string; status: string; amount: number; currency: string }[];
  now?: Date;
}, limit = 14): TimelineItem[] {
  const items: TimelineItem[] = [];

  // Website: one line per day with visits.
  const byDay = new Map<string, { at: string; pages: number; sources: Set<string>; courseish: number }>();
  for (const v of input.pageViews) {
    const k = dayKey(v.at);
    const d = byDay.get(k) ?? { at: v.at, pages: 0, sources: new Set<string>(), courseish: 0 };
    d.pages += 1;
    if (v.path && /\/courses?\//.test(v.path)) d.courseish += 1;
    if (Date.parse(v.at) < Date.parse(d.at)) d.at = v.at;
    byDay.set(k, d);
  }
  for (const s of input.sessions) {
    const k = dayKey(s.at);
    const d = byDay.get(k) ?? { at: s.at, pages: 0, sources: new Set<string>(), courseish: 0 };
    if (s.source) d.sources.add(s.source);
    byDay.set(k, d);
  }
  for (const d of byDay.values()) {
    const from = [...d.sources].filter((x) => !/^(direct|\(direct\)|none)$/i.test(x))[0];
    items.push({
      at: d.at, kind: "web",
      title: d.pages ? `Visited ${d.pages} page${d.pages === 1 ? "" : "s"}` : "Visited the website",
      detail: [from ? `Came from ${from.charAt(0).toUpperCase()}${from.slice(1)}` : null, d.courseish ? "course pages" : null].filter(Boolean).join(" · ") || null,
    });
  }

  for (const f of input.forms) {
    const name = f.name && !/^(form|website)$/i.test(f.name.trim()) ? f.name.trim().toLowerCase().replace(/[_-]+/g, " ") : "contact";
    items.push({ at: f.at, kind: "form", title: `Filled the ${/\bform$/.test(name) ? name : `${name} form`}`, detail: quote(f.message) });
  }

  // Messages: the first one, then their latest and our latest.
  const msgs = [...input.messages].filter((m) => Number.isFinite(Date.parse(m.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const firstIn = msgs.find((m) => m.direction === "inbound");
  const lastIn = [...msgs].reverse().find((m) => m.direction === "inbound");
  const lastOut = [...msgs].reverse().find((m) => m.direction === "outbound");
  if (firstIn) items.push({ at: firstIn.at, kind: "message", title: "First message", detail: quote(firstIn.body) });
  if (lastIn && lastIn !== firstIn) items.push({ at: lastIn.at, kind: "message", title: "Wrote to you", detail: quote(lastIn.body) });
  if (lastOut) items.push({ at: lastOut.at, kind: "reply", title: lastOut.aiGenerated ? "AI replied" : "You replied", detail: quote(lastOut.body) });

  for (const c of input.stageChanges) {
    const ai = /ai|auto|system/i.test(c.by ?? "");
    items.push({
      at: c.at, kind: ai ? "ai" : "stage",
      title: `${ai ? "AI moved them" : "Moved"} to ${stageLabel(c.to)}`,
      detail: c.reason && c.reason.length < 140 ? c.reason : c.from ? `From ${stageLabel(c.from)}` : null,
    });
  }

  for (const p of input.payments) {
    items.push({ at: p.at, kind: "payment", title: p.status === "paid" ? "Payment received" : `Payment ${p.status.replace(/_/g, " ")}`, detail: `${p.currency} ${Math.round(p.amount).toLocaleString("en-IN")}` });
  }

  // Waiting for a reply right now.
  const now = (input.now ?? new Date()).getTime();
  if (lastIn && (!lastOut || Date.parse(lastIn.at) > Date.parse(lastOut.at))) {
    const days = Math.floor((now - Date.parse(lastIn.at)) / DAY);
    items.push({ at: new Date(now).toISOString(), kind: "warn", title: "No reply yet", detail: days >= 1 ? `Waiting ${days} day${days === 1 ? "" : "s"}` : "Waiting since today" });
  }

  return items
    .filter((i) => Number.isFinite(Date.parse(i.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(-limit);
}

/** Two short sentences: what they want, what they did, and where things stand. */
export function personSummary(facts: PersonFacts, input: {
  pagesViewed: number;
  formAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  now?: Date;
}): string {
  const now = (input.now ?? new Date()).getTime();
  const want: string[] = [];
  if (facts.course) {
    let s = `Wants the ${facts.course}`;
    if (facts.location && !facts.course.toLowerCase().includes(facts.location.toLowerCase())) s += ` in ${facts.location}`;
    if (facts.month) s += ` around ${facts.month}`;
    want.push(`${s}.`);
  } else {
    want.push("Hasn't said which course yet.");
  }
  const did: string[] = [];
  if (input.pagesViewed) did.push(`looked at ${input.pagesViewed} page${input.pagesViewed === 1 ? "" : "s"} on your site`);
  if (input.formAt) did.push(`filled the contact form on ${new Date(input.formAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`);
  if (did.length) want.push(`${did.join(" and ").replace(/^./, (c) => c.toUpperCase())}.`);

  const inAt = input.lastInboundAt ? Date.parse(input.lastInboundAt) : NaN;
  const outAt = input.lastOutboundAt ? Date.parse(input.lastOutboundAt) : NaN;
  if (Number.isFinite(inAt) && (!Number.isFinite(outAt) || inAt > outAt)) {
    const days = Math.floor((now - inAt) / DAY);
    want.push(days >= 1 ? `Nobody has replied for ${days} day${days === 1 ? "" : "s"}.` : "They wrote today and are waiting for a reply.");
  } else if (Number.isFinite(outAt)) {
    const days = Math.floor((now - outAt) / DAY);
    want.push(days >= 1 ? `You last wrote ${days} day${days === 1 ? "" : "s"} ago.` : "You replied today.");
  }
  return want.join(" ");
}
