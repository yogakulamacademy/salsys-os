// Customer 360 "The record vs the conversation" and "Signals" (owner-approved
// mockup "Smart Customer 360", 25 Nov 2026). Pure rules over one lead's
// messages and CRM record. No AI: every flag points at what was said.

export type Msg = { direction: "inbound" | "outbound"; body: string; at: string };
export type CourseRef = { id: string; name: string };
export type Flag = { label: string; value: string; warn: boolean };

const STOP = new Set(["yoga", "ttc", "teacher", "teachers", "training", "course", "courses", "hour", "hours", "level", "and", "the", "&", "-", "of", "for", "with"]);
const FEE = /\b(fees?|cost|price|prices|charges?|how much|kitna|discount|installments?|emi)\b/i;
const DAY = 86_400_000;

/** Distinctive words of a course name: "85-Hour Prenatal & Postnatal Yoga TTC" -> ["85", "prenatal", "postnatal"]. */
export function courseKeywords(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((w) => w && !STOP.has(w));
}

/** The course their own messages point at most clearly, or null when unclear. */
export function mentionedCourse(messages: Msg[], courses: CourseRef[]): { course: CourseRef; hits: number } | null {
  const text = messages.filter((m) => m.direction === "inbound").map((m) => m.body.toLowerCase()).join(" \n ");
  if (!text.trim()) return null;
  const scored = courses.map((c) => {
    const words = courseKeywords(c.name);
    const hits = words.filter((w) => (/^\d+$/.test(w) ? new RegExp(`\\b${w}\\s*-?\\s*(h|hr|hour|hrs|hours)\\b`).test(text) : new RegExp(`\\b${w}`).test(text))).length;
    return { course: c, hits, share: words.length ? hits / words.length : 0 };
  }).filter((s) => s.hits > 0).sort((a, b) => b.share - a.share || b.hits - a.hits);
  if (!scored.length || scored[0].share < 0.5) return null;
  if (scored[1] && scored[1].share === scored[0].share && scored[1].hits === scored[0].hits) return null;
  return { course: scored[0].course, hits: scored[0].hits };
}

/** Phone numbers they typed in the chat (last 10 digits), with when. */
export function sharedNumbers(messages: Msg[]): Array<{ digits: string; at: string }> {
  const out = new Map<string, string>();
  for (const m of messages) {
    if (m.direction !== "inbound") continue;
    for (const raw of m.body.match(/(?:\+?\d[\s().-]*){10,14}/g) ?? []) {
      const digits = raw.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 13) continue;
      const last10 = digits.slice(-10);
      if (!out.has(last10)) out.set(last10, m.at);
    }
  }
  return [...out.entries()].map(([digits, at]) => ({ digits, at }));
}

export type Signals = {
  fromThem: number; fromUs: number; askedFee: number;
  daysSinceLast: number | null; lastWasThem: boolean | null;
  longestWaitDays: number; longestWaitFrom: string | null;
  /** The longest wait is still going on (they wrote last). */
  longestWaitOpen: boolean;
};

export function signals(messages: Msg[], now = new Date()): Signals {
  const sorted = [...messages].sort((a, b) => a.at.localeCompare(b.at));
  let longest = 0;
  let longestFrom: string | null = null;
  let longestOpen = false;
  let waitingSince: string | null = null;
  for (const m of sorted) {
    if (m.direction === "inbound") { if (!waitingSince) waitingSince = m.at; continue; }
    if (waitingSince) {
      const gap = (Date.parse(m.at) - Date.parse(waitingSince)) / DAY;
      if (gap > longest) { longest = gap; longestFrom = waitingSince; }
      waitingSince = null;
    }
  }
  if (waitingSince) {
    const gap = (now.getTime() - Date.parse(waitingSince)) / DAY;
    if (gap > longest) { longest = gap; longestFrom = waitingSince; longestOpen = true; }
  }
  const last = sorted.at(-1) ?? null;
  return {
    fromThem: sorted.filter((m) => m.direction === "inbound").length,
    fromUs: sorted.filter((m) => m.direction === "outbound").length,
    askedFee: sorted.filter((m) => m.direction === "inbound" && FEE.test(m.body)).length,
    daysSinceLast: last ? Math.floor((now.getTime() - Date.parse(last.at)) / DAY) : null,
    lastWasThem: last ? last.direction === "inbound" : null,
    longestWaitDays: Math.round(longest * 10) / 10,
    longestWaitFrom: longestFrom,
    longestWaitOpen: longestOpen,
  };
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const money = (n: number, c: string) => (c === "INR" ? `₹${Math.round(n).toLocaleString("en-IN")}` : `${c} ${Math.round(n).toLocaleString("en-IN")}`);

export type RecordCheck = {
  flags: Flag[];
  suggestCourse: CourseRef | null;
  unsavedNumber: { digits: string; at: string } | null;
  issues: number;
};

export function recordVsConversation(input: {
  messages: Msg[]; courses: CourseRef[]; crmCourse: CourseRef | null; otherInterests: string[];
  value: number | null; currency: string | null; priceRange: { min: number; max: number; currency: string } | null;
  savedNumbers: string[]; stageLabel: string; now?: Date;
}): RecordCheck {
  const flags: Flag[] = [];
  const said = mentionedCourse(input.messages, input.courses);
  const courseMismatch = Boolean(said && input.crmCourse && said.course.id !== input.crmCourse.id && !input.otherInterests.includes(said.course.name));
  flags.push({ label: "Course in CRM", value: input.crmCourse?.name ?? "Not set", warn: courseMismatch || (!input.crmCourse && Boolean(said)) });
  if (said) flags.push({ label: "What their messages point to", value: said.course.name, warn: false });

  if (input.value != null && input.value > 0) {
    const cur = (input.currency ?? "INR").toUpperCase();
    const p = input.priceRange;
    const off = p && p.currency === cur && (input.value < p.min * 0.75 || input.value > p.max * 1.25);
    flags.push({
      label: "Value in CRM",
      value: `${money(input.value, cur)}${off && p ? ` (course price ${p.min === p.max ? money(p.min, cur) : `${money(p.min, cur)}–${money(p.max, cur)}`})` : ""}`,
      warn: Boolean(off),
    });
  } else {
    flags.push({ label: "Value in CRM", value: "Not set", warn: false });
  }

  const saved = new Set(input.savedNumbers.map((n) => n.replace(/\D/g, "").slice(-10)));
  const unsaved = sharedNumbers(input.messages).find((n) => !saved.has(n.digits)) ?? null;
  if (unsaved) flags.push({ label: "Phone / WhatsApp", value: `Shared in chat on ${shortDate(unsaved.at)} · not saved`, warn: true });
  else if (saved.size) flags.push({ label: "Phone / WhatsApp", value: "Saved", warn: false });

  const s = signals(input.messages, input.now);
  if (s.daysSinceLast != null) {
    flags.push({ label: "Last message", value: `${s.lastWasThem ? "Theirs" : "Ours"} · ${s.daysSinceLast === 0 ? "today" : `${s.daysSinceLast} day${s.daysSinceLast === 1 ? "" : "s"} ago`}`, warn: Boolean(s.lastWasThem && s.daysSinceLast >= 1) });
  }
  flags.push({ label: "Stage", value: input.stageLabel, warn: false });

  return {
    flags,
    suggestCourse: courseMismatch || (!input.crmCourse && said) ? said!.course : null,
    unsavedNumber: unsaved,
    issues: flags.filter((f) => f.warn).length,
  };
}
