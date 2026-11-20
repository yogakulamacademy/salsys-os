// Tasks & Follow-ups story (owner request, 20 Nov 2026). Pure: no imports, so
// it runs under `node --experimental-strip-types` in the behaviour tests.
//
// The open tasks are really five different jobs that used to sit in one
// oldest-first list: checking payments, getting back to people who told us
// when, first replies to website forms, chats the AI handed over, and AI
// "Lost?" suggestions to confirm. This sorts each task into its job, says why
// it exists in one line, and builds the headline for the page.

export type TaskKind = "payment" | "promised" | "first_reply" | "handover" | "lost" | "other";

export type StoryTask = {
  id: string;
  leadId: string;
  leadName: string;
  leadCode: string;
  stage: string;
  title: string;
  description: string | null;
  dueAt: string;
  createdById: string | null;
  taskType: string;
  channel: string;
  origin: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastInboundText: string | null;
  value: number | null;
  currency: string | null;
  course: string | null;
  /** Their last message says they paid or enrolled and nothing is recorded. */
  saysPaid?: boolean;
};

export type ShapedTask = StoryTask & {
  kind: TaskKind;
  why: string;
  due: { label: string; late: boolean; daysLate: number };
  /** The lead is already enrolled, lost or a duplicate: the task can just be closed. */
  settled: boolean;
  settledLabel: string | null;
  /** The lead wrote last and nobody has answered yet. */
  waiting: boolean;
};

export const KIND_ORDER: TaskKind[] = ["payment", "promised", "first_reply", "handover", "lost", "other"];

export const KIND_LABEL: Record<TaskKind, string> = {
  payment: "Check payments",
  promised: "They asked you to get back",
  first_reply: "Website forms to answer",
  handover: "Handed over by AI",
  lost: "Confirm Lost?",
  other: "Other tasks",
};

const DAY = 86_400_000;
const SETTLED: Record<string, string> = {
  enrolled: "Already enrolled",
  closed_won: "Already enrolled",
  lost: "Already marked Lost",
  unqualified: "Marked not a fit",
  duplicate: "Duplicate lead",
};
const STAGE_WEIGHT: Record<string, number> = {
  payment_pending: 6, high_intent: 5, qualified: 4, engaged: 3, contacted: 2, new: 1, not_now: 0, nurture: 0,
};

export function classifyTask(t: Pick<StoryTask, "createdById" | "taskType" | "title" | "stage">): TaskKind {
  if (t.createdById === "ai_stage_lost_v1") return "lost";
  if (t.createdById === "ai_autopilot_v1") return "handover";
  if (t.createdById === "ai_followup_detection_v1") return "promised";
  if (t.taskType === "payment_check" || /payment/i.test(t.title) || t.stage === "payment_pending") return "payment";
  if (/^first contact/i.test(t.title.trim())) return "first_reply";
  return "other";
}

/** "Website Reservation Form" → "Reservation form". */
export function formLabel(origin: string | null): string {
  const text = (origin ?? "").replace(/^website\s+/i, "").trim();
  if (!text) return "Website form";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/** Reservation, enrolment and contact forms ask for something; brochure forms mostly browse. */
export function formHeat(origin: string | null): number {
  const o = (origin ?? "").toLowerCase();
  if (/enrol|reserv/.test(o)) return 2;
  if (/contact/.test(o)) return 1;
  return 0;
}

function quote(text: string, max = 110): string {
  const clean = text.replace(/\s+/g, " ").replace(/^LEAD:\s*/i, "").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** One plain line saying why this task exists. */
export function whyLine(t: StoryTask, kind: TaskKind): string {
  const desc = (t.description ?? "").trim();
  if (kind === "promised") {
    const said = desc.match(/message:\s*"([\s\S]+)"\s*$/);
    if (said) return `They said: “${quote(said[1])}”`;
    return t.title.replace(/^(instagram|call|whatsapp)\s+(follow-up|check-in):\s*/i, "").replace(/^lead /i, "They ");
  }
  if (kind === "lost") {
    const said = desc.match(/From their messages:\s*([\s\S]+?)\.?\s*Move to Lost/i);
    return said ? `They said: “${quote(said[1])}”` : "AI thinks they are no longer interested";
  }
  if (kind === "handover") {
    const reason = t.title.replace(/^AI handed over:\s*/i, "").trim();
    return reason ? `AI stopped: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}` : "AI stopped and needs a person to reply";
  }
  if (kind === "first_reply") return `${formLabel(t.origin)} · no reply logged in the CRM yet`;
  if (t.saysPaid) return "They wrote that they paid: check the payment, then mark them enrolled";
  if (kind === "payment") return t.stage === "payment_pending" ? "At Payment pending: check whether they paid" : "Check their payment";
  return desc ? quote(desc) : t.title;
}

/** Calendar days between two instants, in India time. */
function istDayIndex(ms: number): number {
  return Math.floor((ms + 5.5 * 3_600_000) / DAY);
}

export function dueLabel(dueAt: string, now: Date): { label: string; late: boolean; daysLate: number } {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return { label: "No date", late: false, daysLate: 0 };
  const diff = istDayIndex(due) - istDayIndex(now.getTime());
  if (diff < 0) return { label: diff === -1 ? "1 day late" : `${-diff} days late`, late: true, daysLate: -diff };
  if (diff === 0) return { label: due <= now.getTime() ? "Due today" : "Later today", late: false, daysLate: 0 };
  if (diff === 1) return { label: "Tomorrow", late: false, daysLate: 0 };
  return { label: `In ${diff} days`, late: false, daysLate: 0 };
}

export function shapeTask(t: StoryTask, now: Date): ShapedTask {
  const kind = classifyTask(t);
  const settledLabel = SETTLED[t.stage] ?? null;
  const inAt = t.lastInboundAt ? Date.parse(t.lastInboundAt) : NaN;
  const outAt = t.lastOutboundAt ? Date.parse(t.lastOutboundAt) : NaN;
  return {
    ...t,
    kind,
    why: whyLine(t, kind),
    due: dueLabel(t.dueAt, now),
    settled: settledLabel != null,
    settledLabel,
    // "I'll get back to you" or "no thanks" is their last word, not a question to us.
    waiting: kind !== "promised" && kind !== "lost" && Number.isFinite(inAt) && (!Number.isFinite(outAt) || inAt > outAt),
  };
}

/** Most useful first: hotter stage, hotter form, then newest (fresh leads answer more). */
export function compareTasks(a: ShapedTask, b: ShapedTask): number {
  if (a.settled !== b.settled) return a.settled ? 1 : -1;
  if (Boolean(a.saysPaid) !== Boolean(b.saysPaid)) return a.saysPaid ? -1 : 1;
  const stage = (STAGE_WEIGHT[b.stage] ?? 0) - (STAGE_WEIGHT[a.stage] ?? 0);
  if (a.kind === "first_reply" && b.kind === "first_reply") {
    const heat = formHeat(b.origin) - formHeat(a.origin);
    if (heat) return heat;
    if (stage) return stage;
    return Date.parse(b.dueAt) - Date.parse(a.dueAt);
  }
  if (stage) return stage;
  if (a.kind === "promised" && b.kind === "promised") return Date.parse(a.dueAt) - Date.parse(b.dueAt);
  return Date.parse(b.dueAt) - Date.parse(a.dueAt);
}

export type FollowupsStory = {
  due: ShapedTask[];
  upcoming: ShapedTask[];
  counts: Record<TaskKind, number>;
  dueNow: number;
  lateOverWeek: number;
  upcomingWeek: number;
  settled: number;
  waiting: number;
  oldestFormDays: number | null;
  headline: string;
};

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
}

export function buildFollowupsStory(tasks: StoryTask[], now: Date): FollowupsStory {
  const shaped = tasks.map((t) => shapeTask(t, now));
  const nowMs = now.getTime();
  const due = shaped.filter((t) => Date.parse(t.dueAt) <= nowMs).sort(compareTasks);
  const upcoming = shaped
    .filter((t) => { const d = Date.parse(t.dueAt); return d > nowMs && d <= nowMs + 7 * DAY; })
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const counts = Object.fromEntries(KIND_ORDER.map((k) => [k, 0])) as Record<TaskKind, number>;
  for (const t of due) if (!t.settled) counts[t.kind] += 1;

  const forms = due.filter((t) => t.kind === "first_reply" && !t.settled);
  const oldestFormDays = forms.length ? Math.max(...forms.map((t) => t.due.daysLate)) : null;
  const settled = due.filter((t) => t.settled).length;

  const parts: string[] = [];
  const saysPaid = due.filter((t) => t.saysPaid && !t.settled).length;
  if (counts.payment) parts.push(`${plural(counts.payment, "payment needs", "payments need")} checking${saysPaid ? ` (${saysPaid.toLocaleString("en-IN")} say they've paid)` : ""}`);
  if (counts.promised) parts.push(`${plural(counts.promised, "person", "people")} asked you to get back to them and it's time`);
  if (counts.first_reply) parts.push(`${plural(counts.first_reply, "website form has", "website forms have")} no reply logged${oldestFormDays ? ` (oldest ${plural(oldestFormDays, "day", "days")})` : ""}`);
  if (counts.handover) parts.push(`AI handed ${plural(counts.handover, "chat", "chats")} to you`);
  const lead = parts.length ? `${joinParts(parts)}.` : "Nothing urgent is waiting.";
  const tail: string[] = [];
  if (counts.lost) tail.push(`${plural(counts.lost, "Lost suggestion", "Lost suggestions")} to confirm`);
  if (settled) tail.push(`${plural(settled, "task is", "tasks are")} for leads already settled and can be closed`);
  const headline = tail.length ? `${lead} Also ${joinParts(tail)}.` : lead;

  return {
    due,
    upcoming,
    counts,
    dueNow: due.length,
    lateOverWeek: due.filter((t) => t.due.daysLate > 7).length,
    upcomingWeek: upcoming.length,
    settled,
    waiting: due.filter((t) => t.waiting && !t.settled).length,
    oldestFormDays,
    headline,
  };
}

/** Next working moment N days ahead at 10:00 India time, as ISO. */
export function snoozeTarget(days: number, now: Date): string {
  const istMidnight = istDayIndex(now.getTime()) * DAY - 5.5 * 3_600_000;
  return new Date(istMidnight + days * DAY + 10 * 3_600_000).toISOString();
}
