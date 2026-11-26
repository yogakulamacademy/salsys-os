// Programs & Batches board (owner-approved prototype "Programs & Batches and
// Enrolments – prototype", 26 Nov 2026). Pure helpers: every upcoming batch
// grouped by course, with warm demand, seats, fee and booking state, plus the
// ranked actions and "noticed" items. Warm = Qualified, High intent or Payment
// pending for that course and place (from operations_story_v1).

import type { PageKpi, PageRank, PageSignal, Part } from "@/lib/marketing-pages";

export type BoardInputBatch = {
  id: string; courseId: string; course: string; location: string | null; mode: string | null;
  start: string; end: string | null; capacity: number | null; seatsRemaining: number | null; enrolled: number;
  fee: number | null; currency: string | null; quotePrice: number | null; open: boolean; note: string | null;
};
export type BoardBatch = BoardInputBatch & { days: number; online: boolean; place: string; label: string; warm: number | null };
export type BoardCourse = { courseId: string; course: string; warm: number | null; batches: BoardBatch[] };
export type BatchBoard = {
  today: string; headline: Part[]; ranks: PageRank[]; signals: PageSignal[]; batches: BoardBatch[];
  courseWarm: Record<string, number>; places: string[]; noBatch: number;
};
export type BoardEdit = { capacity?: number | null; fee?: number | null; currency?: string; open?: boolean };

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const DAY = 86_400_000;
export const boardDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const short = (name: string) => name.replace(/Yoga Teacher Training/i, "YTT").replace(/Yoga TTC/i, "TTC").replace(/\s+/g, " ").trim();
const where = (b: BoardBatch) => (b.online ? "online" : `in ${b.place}`);

export function buildBatchBoard(input: {
  today: string; batches: BoardInputBatch[];
  warm: Record<string, { place: number; course: number }>; noBatch: number;
}): BatchBoard {
  const t0 = Date.parse(`${input.today}T00:00:00Z`);
  const courseWarm: Record<string, number> = {};
  const batches: BoardBatch[] = input.batches
    .filter((b) => b.start >= input.today)
    .map((b) => {
      const w = input.warm[b.id];
      if (w) courseWarm[b.courseId] = Math.max(courseWarm[b.courseId] ?? 0, w.course);
      const online = /online/i.test(`${b.mode ?? ""} ${b.location ?? ""}`);
      return { ...b, days: Math.round((Date.parse(`${b.start}T00:00:00Z`) - t0) / DAY), online, place: online ? "Online" : (b.location?.trim() || "No place set"), label: short(b.course), warm: w ? w.place : null };
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.course.localeCompare(b.course));
  const places = [...new Set(batches.map((b) => b.place))].sort((a, b) => (a === "Online" ? 1 : b === "Online" ? -1 : a.localeCompare(b)));

  const in60 = batches.filter((b) => b.days <= 60);
  const seats60 = in60.filter((b) => (b.capacity ?? 0) > 0).length;
  const fee60 = in60.filter((b) => b.fee != null).length;
  const ranks: PageRank[] = [];
  const signals: PageSignal[] = [];

  const first = batches.filter((b) => b.days <= 14 && (b.warm ?? 0) > 0 && (!(b.capacity ?? 0) || b.fee == null))
    .sort((a, b) => (b.warm ?? 0) - (a.warm ?? 0) || a.days - b.days)[0];
  const headline: Part[] = [
    { text: `${n(in60.length)} batches start in the next 60 days, and ${seats60 === 0 ? "none of them has" : seats60 === in60.length ? "all of them have" : `only ${n(seats60)} ${seats60 === 1 ? "has" : "have"}`} a seat count.`, strong: true },
    { text: ` ${fee60 === 0 ? "None has" : `${n(fee60)} ${fee60 === 1 ? "has" : "have"}`} an expected fee, so the CRM can’t show which batch is filling or what it’s worth.` },
  ];
  if (first) headline.push({ text: ` Start with ${first.label} ${where(first)} on ${boardDay(first.start)}: ${n(first.warm ?? 0)} warm ${first.warm === 1 ? "person is" : "people are"} asking about it.` });

  if (first) {
    ranks.push({
      id: "first", impact: `Starts in ${n(first.days)} days · ${n(first.warm ?? 0)} warm`,
      title: `Set seats and fee for the ${boardDay(first.start)} batch`,
      bars: [{ label: `Warm people ${where(first)}`, value: first.warm ?? 0, shown: n(first.warm ?? 0), tone: "brand" }, { label: "Enrolled", value: first.enrolled, shown: n(first.enrolled), tone: "green" }],
      max: Math.max(first.warm ?? 0, 1),
      body: [{ text: `${first.course} ${where(first)} starts in ${n(first.days)} days. ` }, { text: `${n(first.warm ?? 0)} warm people`, strong: true }, { text: ` want it, and it has ${!(first.capacity ?? 0) ? "no seat count" : "seats but no fee"}${!(first.capacity ?? 0) && first.fee == null ? " or fee" : ""}.` }],
      actions: [{ label: "Show this batch", href: `/course-management?focus=${first.id}`, primary: true }],
      basis: "Upcoming batches · warm people by course and place",
    });
  }
  const byDay = new Map<string, BoardBatch[]>();
  for (const b of batches.filter((x) => x.days <= 30 && !(x.capacity ?? 0) && x.id !== first?.id)) byDay.set(b.start, [...(byDay.get(b.start) ?? []), b]);
  const cluster = [...byDay.values()].filter((l) => l.length >= 2).sort((a, b) => b.length - a.length || a[0].start.localeCompare(b[0].start))[0];
  if (cluster) {
    const top = [...cluster].sort((a, b) => (b.warm ?? 0) - (a.warm ?? 0))[0];
    ranks.push({
      id: "cluster", impact: `${n(cluster.length)} batches · in ${n(cluster[0].days)} days`,
      title: `Set seats for the ${n(cluster.length)} batches starting ${boardDay(cluster[0].start)}`,
      bars: cluster.slice(0, 4).map((b) => ({ label: `${b.label} ${b.online ? "online" : b.place}`, value: b.warm ?? 0, shown: n(b.warm ?? 0), tone: "brand" as const })),
      max: Math.max(...cluster.map((b) => b.warm ?? 0), 1),
      body: [{ text: `They all start on ${boardDay(cluster[0].start)} and none has a seat count. ` }, { text: `${top.label} ${where(top)}`, strong: true }, { text: ` has the most people waiting (${n(top.warm ?? 0)}). Tick them together to set seats in one go.` }],
      actions: [{ label: `Show ${boardDay(cluster[0].start)} batches`, href: `/course-management?focus=${cluster.map((b) => b.id).join(",")}`, primary: !first }],
      basis: "Upcoming batches without seats",
    });
  }
  if (input.noBatch > 0) {
    ranks.push({
      id: "assign", impact: `${n(input.noBatch)} paid · no batch`, title: `Put the ${n(input.noBatch)} paid ${input.noBatch === 1 ? "student" : "students"} into a batch`,
      bars: [{ label: "Paid, no batch", value: input.noBatch, shown: n(input.noBatch), tone: "amber" }],
      body: [{ text: "Batches show 0 enrolled until students are assigned, so seat counts can’t go down. " }, { text: "Assign them in Enrolments.", strong: true }],
      actions: [{ label: "Open Enrolments", href: "/enrollments", primary: !first && !cluster }],
      basis: "Enrolments",
    });
  }

  const quiet = batches.filter((b) => b.days <= 30 && b.warm === 0);
  if (quiet.length) {
    signals.push({ id: "quiet", tag: "No demand", tone: "amber",
      title: `${n(quiet.length)} ${quiet.length === 1 ? "batch" : "batches"} in the next 30 days ${quiet.length === 1 ? "has" : "have"} nobody warm asking`,
      summary: quiet.slice(0, 4).map((b) => `${b.label} ${b.online ? "online" : b.place} (${boardDay(b.start)})`).join(", ") + (quiet.length > 4 ? ` and ${n(quiet.length - 4)} more` : "") + ".",
      detail: "Promote them this week, or switch off “Taking bookings” and move people to a later date." });
  }
  const twin = new Map<string, BoardBatch[]>();
  for (const b of batches.filter((x) => x.days <= 45 && !x.online && (x.warm ?? 0) >= 10)) twin.set(`${b.start}|${b.courseId}`, [...(twin.get(`${b.start}|${b.courseId}`) ?? []), b]);
  const pair = [...twin.values()].find((l) => l.length >= 2);
  if (pair) {
    signals.push({ id: "twin", tag: "Same day", tone: "teal", title: `${pair[0].label} starts on ${boardDay(pair[0].start)} in ${n(pair.length)} places`,
      summary: pair.map((b) => `${b.place} (${n(b.warm ?? 0)} warm)`).join(" and ") + ".",
      detail: "Seats for each place let the team steer people to the batch that still has room." });
  }
  const noQuote = in60.filter((b) => b.quotePrice == null).length;
  if (noQuote) {
    signals.push({ id: "quote", tag: "Note", tone: "muted", title: "The AI quotes fees from the website prices, not from this page",
      summary: `${n(noQuote)} of ${n(in60.length)} batches in the next 60 days have no website price on the batch.`,
      detail: "The fee you set here is used for revenue and enrolment values. The price the AI quotes comes from the website course sync." });
  }
  return { today: input.today, headline, ranks, signals, batches, courseWarm, places, noBatch: input.noBatch };
}

export type BoardFilters = { days: number | null; place: string; missingSeats: boolean; missingFee: boolean; waiting: boolean };

/** Apply unsaved edits on top of a batch. */
export function withEdit(b: BoardBatch, e?: BoardEdit): BoardBatch {
  if (!e) return b;
  return { ...b, ...("capacity" in e ? { capacity: e.capacity ?? null } : {}), ...("fee" in e ? { fee: e.fee ?? null } : {}), ...(e.currency ? { currency: e.currency } : {}), ...("open" in e ? { open: Boolean(e.open) } : {}) };
}

/** Batches grouped by course for the filters, plus KPIs for the same range. */
export function boardView(board: BatchBoard, f: BoardFilters, edits: Record<string, BoardEdit> = {}) {
  const inRange = board.batches.filter((b) => f.days == null || b.days <= f.days).map((b) => withEdit(b, edits[b.id]));
  const rows = inRange.filter((b) => (f.place === "all" || b.place === f.place)
    && (!f.missingSeats || !(b.capacity ?? 0)) && (!f.missingFee || b.fee == null) && (!f.waiting || (b.warm ?? 0) > 0));
  const map = new Map<string, BoardCourse>();
  for (const b of rows) {
    const c = map.get(b.courseId) ?? { courseId: b.courseId, course: b.course, warm: board.courseWarm[b.courseId] ?? null, batches: [] };
    c.batches.push(b);
    map.set(b.courseId, c);
  }
  const groups = [...map.values()].sort((a, b) => a.batches[0].start.localeCompare(b.batches[0].start) || a.course.localeCompare(b.course));
  const seats = inRange.filter((b) => (b.capacity ?? 0) > 0).length;
  const fees = inRange.filter((b) => b.fee != null).length;
  const waiting = inRange.filter((b) => (b.warm ?? 0) > 0).length;
  const soon = inRange.filter((b) => b.days <= 14 && (b.warm ?? 0) > 0).length;
  const range = f.days == null ? "scheduled in all" : `in the next ${f.days} days`;
  const kpis: PageKpi[] = [
    { label: "Batches starting", value: n(inRange.length), sub: range },
    { label: "With a seat count", value: `${n(seats)} of ${n(inRange.length)}`, sub: seats < inRange.length ? "the rest can’t show filling or full" : "every batch can show seats left", badge: seats < inRange.length ? { text: "Fix", tone: "bad" } : { text: "OK", tone: "good" } },
    { label: "With an expected fee", value: `${n(fees)} of ${n(inRange.length)}`, sub: "used for revenue and enrolment values", badge: fees < inRange.length ? { text: "Check", tone: "warn" } : { text: "OK", tone: "good" } },
    { label: "Batches with people waiting", value: n(waiting), sub: `${n(soon)} of them start within 14 days` },
  ];
  return { groups, kpis, count: rows.length };
}
