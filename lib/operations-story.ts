// Smart Operations Overview (owner-approved prototype "Operations prototype",
// 26 Nov 2026). Pure helpers over operations_story_v1: upcoming batches with
// warm demand, enrolments with or without a batch, and setup gaps. Warm =
// Qualified, High intent or Payment pending, counted per course (one person can
// want two batches of the same course).

import type { PageKpi, PageRank, PageSignal, Part } from "@/lib/marketing-pages";

export type OpsData = {
  days: number;
  today: string;
  batches: Array<{
    id: string; courseId: string; course: string; location: string | null; mode: string | null; start: string; end: string | null;
    capacity: number | null; seatsRemaining: number | null; hasPrice: boolean; open: boolean; warmCourse: number; warmPlace: number; enrolled: number;
  }>;
  future: number; futureWithSeats: number; futureWithPrice: number;
  enrolments: Array<{ course: string; withBatch: number | null; noBatch: number | null }>;
};
export type OpsBatch = OpsData["batches"][number] & { days: number; online: boolean; label: string };
export type OpsStory = {
  today: string; days: number; headline: Part[]; ranks: PageRank[]; signals: PageSignal[];
  batches: OpsBatch[]; future: number; futureWithSeats: number; futureWithPrice: number;
  enrolments: Array<{ course: string; withBatch: number; noBatch: number }>; enrolled: number; noBatch: number;
};

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const DAY = 86_400_000;
export const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
export const inDays = (d: number) => (d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);

export function isOpsData(v: unknown): v is OpsData {
  const d = v as OpsData | null;
  return Boolean(d && Array.isArray(d.batches) && typeof d.future === "number" && Array.isArray(d.enrolments));
}

/** Shorter course names for tight rows: "85-Hour Prenatal & Postnatal TTC". */
export function courseLabel(name: string): string {
  return name.replace(/Yoga Teacher Training/i, "YTT").replace(/Yoga TTC/i, "TTC").replace(/\s+/g, " ").trim();
}

/** Batches in the window, KPIs for it (the page switches 14 / 30 / 60 days). */
export function opsWindow(s: OpsStory, days: number, mode: "all" | "online" | "in_person" = "all") {
  const rows = s.batches.filter((b) => b.days <= days && (mode === "all" || (mode === "online" ? b.online : !b.online)));
  const week = s.batches.filter((b) => b.days <= 7).length;
  const kpis: PageKpi[] = [
    { label: `Batches in the next ${days} days`, value: n(rows.length), sub: `${n(week)} start this week · ${n(s.future)} scheduled in all` },
    { label: "Warm people for them", value: n(rows.reduce((t, b) => t + b.warmPlace, 0)), sub: "Counted per batch, so one person can appear twice" },
    { label: "Enrolled students", value: n(s.enrolled), sub: s.noBatch ? `${n(s.noBatch)} not assigned to a batch yet` : "All assigned to a batch", badge: s.noBatch ? { text: `${n(s.noBatch)} without a batch`, tone: "bad" } : undefined },
    { label: "Batches with seats set", value: `${n(s.futureWithSeats)} of ${n(s.future)}`, sub: s.futureWithSeats < s.future ? "Seats left can’t be worked out for the rest" : "Every upcoming batch has seats", badge: s.futureWithSeats < s.future ? { text: "setup", tone: "warn" } : undefined },
  ];
  return { rows, kpis };
}

export function buildOpsStory(d: OpsData): OpsStory {
  const today = Date.parse(`${d.today}T00:00:00Z`);
  const batches: OpsBatch[] = d.batches.map((b) => ({
    ...b, warmCourse: Number(b.warmCourse), warmPlace: Number(b.warmPlace), enrolled: Number(b.enrolled),
    days: Math.round((Date.parse(`${b.start}T00:00:00Z`) - today) / DAY),
    online: /online/i.test(`${b.mode ?? ""} ${b.location ?? ""}`),
    label: courseLabel(b.course),
  }));
  const enrolments = d.enrolments.map((e) => ({ course: e.course, withBatch: Number(e.withBatch ?? 0), noBatch: Number(e.noBatch ?? 0) }));
  const enrolled = enrolments.reduce((t, e) => t + e.withBatch + e.noBatch, 0);
  const noBatch = enrolments.reduce((t, e) => t + e.noBatch, 0);
  const in30 = batches.filter((b) => b.days <= 30);
  const ranks: PageRank[] = [];
  const signals: PageSignal[] = [];

  const next = batches.filter((b) => b.days <= 14 && b.warmPlace >= 10 && b.enrolled < b.warmPlace).sort((a, b) => a.days - b.days || b.warmPlace - a.warmPlace)[0];
  if (next) {
    ranks.push({
      id: "fill", impact: `Starts ${inDays(next.days)} · ${n(next.warmPlace)} warm`, title: `Fill the ${next.label} batch${next.location && !next.online ? ` in ${next.location}` : ""}`,
      bars: [
        { label: `Warm people${next.location && !next.online ? ` for ${next.location}` : ""}`, value: next.warmPlace, shown: n(next.warmPlace), tone: "brand" },
        { label: "Enrolled in this batch", value: next.enrolled, shown: n(next.enrolled), tone: "green" },
      ],
      max: Math.max(next.warmCourse, 1),
      body: [{ text: "The batch starts on " }, { text: dayLabel(next.start), strong: true }, { text: `. ${n(next.warmPlace)} people at Qualified, High intent or Payment pending want this course${next.location && !next.online ? ` in ${next.location} (or didn’t say where)` : ""}. Call the High-intent ones first and confirm who’s coming.` }],
      actions: [{ label: `See the ${n(next.warmPlace)} in Leads`, href: `/leads?course=${encodeURIComponent(next.course)}`, primary: true }],
      basis: "Warm people by course interest · enrolments",
    });
  }
  if (noBatch > 0) {
    ranks.push({
      id: "assign", impact: `${n(enrolled)} enrolled · ${n(noBatch)} without a batch`, title: `Put the ${n(noBatch)} paid ${noBatch === 1 ? "student" : "students"} into a batch`,
      bars: [
        { label: "Enrolled, batch set", value: enrolled - noBatch, shown: n(enrolled - noBatch), tone: "green" },
        { label: "Enrolled, no batch", value: noBatch, shown: n(noBatch), tone: "amber" },
      ],
      max: Math.max(enrolled, 1),
      body: [{ text: "They’re enrolled on a course but " }, { text: "not on a batch", strong: true }, { text: ", so nobody knows who’s arriving when, and seat counts can’t go down. Pick the batch for each one." }],
      actions: [{ label: "Open Enrolments", href: "/enrollments", primary: true }],
      basis: "Enrolments",
    });
  }
  if (d.future > 0 && d.futureWithSeats < d.future) {
    ranks.push({
      id: "seats", impact: `${n(d.futureWithSeats)} of ${n(d.future)} batches`, title: "Set seats on the batches starting soon",
      bars: [
        { label: "Batches with seats set", value: d.futureWithSeats, shown: n(d.futureWithSeats), tone: "brand" },
        { label: "Batches with a price", value: d.futureWithPrice, shown: n(d.futureWithPrice), tone: "brand" },
      ],
      max: d.future,
      body: [{ text: `${d.futureWithSeats ? `Only ${n(d.futureWithSeats)}` : "No"} upcoming batch has a seat count and ${n(d.futureWithPrice)} have a price, so the CRM can’t warn when a batch is filling up or quote the right price. Start with the ` }, { text: `${n(in30.length)} batches in the next 30 days`, strong: true }, { text: "." }],
      actions: [{ label: "Open Programs & Batches", href: "/course-management", primary: true }],
      basis: "Upcoming active batches",
    });
  }

  const empty = in30.filter((b) => b.warmPlace === 0);
  if (empty.length) {
    signals.push({ id: "nodemand", tag: "No demand", tone: "amber",
      title: `${n(empty.length)} ${empty.length === 1 ? "batch" : "batches"} in the next 30 days ${empty.length === 1 ? "has" : "have"} nobody warm asking`,
      summary: empty.slice(0, 4).map((b) => `${b.label}${b.location && !b.online ? ` in ${b.location}` : ""} (${dayLabel(b.start)})`).join(", ") + (empty.length > 4 ? ` and ${n(empty.length - 4)} more` : "") + ".",
      detail: "Promote them this week, or move them to a later date so the teacher isn’t booked for nobody." });
  }
  const byDayCourse = new Map<string, OpsBatch[]>();
  for (const b of in30.filter((x) => !x.online && x.warmPlace >= 10)) {
    const k = `${b.start}|${b.courseId}`;
    byDayCourse.set(k, [...(byDayCourse.get(k) ?? []), b]);
  }
  const twin = [...byDayCourse.values()].find((l) => l.length >= 2);
  if (twin) {
    signals.push({ id: "twin", tag: "Same day", tone: "teal",
      title: `Two ${twin[0].label} batches start on ${dayLabel(twin[0].start)}`,
      summary: `${twin.map((b) => `${b.location} (${n(b.warmPlace)} warm)`).join(" and ")}.`,
      detail: "If many of these people don’t mind where they study, steering them to one place fills one batch properly instead of two halves." });
  }
  if (d.future >= 5 && d.futureWithPrice < d.future * 0.5) {
    signals.push({ id: "price", tag: "Missing", tone: "red",
      title: `${n(d.future - d.futureWithPrice)} of ${n(d.future)} batches have no price`,
      summary: `Only ${n(d.futureWithPrice)} ${d.futureWithPrice === 1 ? "batch carries" : "batches carry"} a price, so the team and the AI quote from the course page instead.`,
      detail: "Add the price to each batch in Programs & Batches; the Revenue page and payment links use it." });
  }
  const full = batches.filter((b) => b.capacity && b.capacity > 0 && b.seatsRemaining !== null && b.seatsRemaining <= Math.max(2, b.capacity * 0.1));
  if (full.length) {
    signals.push({ id: "full", tag: "Filling", tone: "red", title: `${n(full.length)} ${full.length === 1 ? "batch is" : "batches are"} nearly full`,
      summary: full.slice(0, 3).map((b) => `${b.label} ${dayLabel(b.start)} (${n(b.seatsRemaining ?? 0)} left)`).join(", ") + ".",
      detail: "Stop promoting these, and offer the next date to anyone still asking." });
  }

  const headline: Part[] = [
    { text: `${n(in30.length)} ${in30.length === 1 ? "batch starts" : "batches start"} in the next 30 days`, strong: true },
    ...(next ? [{ text: `, and the next big one, ${next.label}${next.location && !next.online ? ` in ${next.location}` : ""} on ${dayLabel(next.start)}, has ${n(next.warmPlace)} warm people interested${next.enrolled ? ` and ${n(next.enrolled)} enrolled` : " but nobody enrolled yet"}.`, strong: true }] : [{ text: ".", strong: true }]),
    { text: [noBatch ? ` ${n(noBatch)} ${noBatch === 1 ? "person has" : "people have"} paid but ${noBatch === enrolled ? "none is" : "aren’t"} assigned to a batch` : "", d.futureWithSeats === 0 && d.future ? `${noBatch ? ", and" : ""} no batch has a seat count, so the CRM can’t tell what’s filling up` : ""].join("") + (noBatch || (d.futureWithSeats === 0 && d.future) ? "." : "") },
  ];

  return { today: d.today, days: d.days, headline, ranks, signals, batches, future: d.future, futureWithSeats: d.futureWithSeats, futureWithPrice: d.futureWithPrice, enrolments, enrolled, noBatch };
}
