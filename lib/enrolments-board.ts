// Enrolments board (owner-approved prototype "Programs & Batches and Enrolments –
// prototype", 26 Nov 2026). Pure helpers: paid enrolments waiting for a batch,
// the suggested batch for each (the next batch of the same course), and how the
// batches fill as students are assigned.

import type { PageKpi, Part } from "@/lib/marketing-pages";

export type EnrolInput = {
  id: string; leadId: string; leadName: string; courseId: string | null; courseName: string;
  batchId: string | null; status: string; totalValue: number | null; currency: string | null; createdAt: string;
};
export type EnrolBatchOption = { id: string; courseId: string; start: string; end: string | null; place: string; capacity: number | null; enrolled: number; open: boolean };
export type EnrolRow = EnrolInput & { options: EnrolBatchOption[]; suggested: string | null; waiting: boolean };
export type EnrolBoard = { today: string; headline: Part[]; kpis: PageKpi[]; rows: EnrolRow[]; waiting: number; batches: EnrolBatchOption[] };

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
export const enrolDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export function money(v: number, currency: string | null): string {
  const c = (currency || "INR").toUpperCase();
  try {
    return new Intl.NumberFormat(c === "INR" ? "en-IN" : "en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${c} ${n(v)}`;
  }
}

/** Sum per currency: "₹1,75,000" or "₹40,000 + $1,500". */
export function moneyTotal(rows: Array<{ totalValue: number | null; currency: string | null }>): string {
  const by = new Map<string, number>();
  for (const r of rows) if (r.totalValue != null) by.set((r.currency || "INR").toUpperCase(), (by.get((r.currency || "INR").toUpperCase()) ?? 0) + r.totalValue);
  return [...by.entries()].sort((a, b) => (a[0] === "INR" ? -1 : b[0] === "INR" ? 1 : a[0].localeCompare(b[0]))).map(([c, v]) => money(v, c)).join(" + ") || "—";
}

/** Next batch of the same course that is taking bookings and has room; else the next one at all. */
export function suggestBatch(options: EnrolBatchOption[]): string | null {
  const room = options.find((o) => o.open && (o.capacity == null || o.capacity <= 0 || o.enrolled < o.capacity));
  return (room ?? options[0])?.id ?? null;
}

export function buildEnrolBoard(input: { today: string; enrolments: EnrolInput[]; batches: EnrolBatchOption[] }): EnrolBoard {
  const upcoming = input.batches.filter((b) => b.start >= input.today).sort((a, b) => a.start.localeCompare(b.start));
  const live = input.enrolments.filter((e) => e.status !== "cancelled");
  const rows: EnrolRow[] = live.map((e) => {
    const options = e.courseId ? upcoming.filter((b) => b.courseId === e.courseId) : [];
    const waiting = !e.batchId && (e.status === "confirmed" || e.status === "pending");
    return { ...e, options, suggested: waiting ? suggestBatch(options) : null, waiting };
  }).sort((a, b) => Number(b.waiting) - Number(a.waiting) || b.createdAt.localeCompare(a.createdAt));
  const waitingRows = rows.filter((r) => r.waiting);
  const paid = rows.filter((r) => r.status === "confirmed" || r.status === "completed");
  const inBatch = rows.filter((r) => r.batchId).length;
  const firstStart = waitingRows.map((r) => r.options.find((o) => o.id === r.suggested)?.start).filter((s): s is string => Boolean(s)).sort()[0];
  const noOption = waitingRows.filter((r) => !r.options.length).length;

  const headline: Part[] = waitingRows.length
    ? [
        { text: `${n(waitingRows.length)} ${waitingRows.length === 1 ? "person has" : "people have"} enrolled (${moneyTotal(waitingRows)}) and ${waitingRows.length === rows.length ? (waitingRows.length === 1 ? "isn’t" : "none of them is") : "aren’t"} in a batch yet,`, strong: true },
        { text: " so they have no start date and the batches still show them as missing. The CRM suggests the next batch of each course below; check it and assign." },
      ]
    : [{ text: rows.length ? `Everyone who enrolled is in a batch.` : "No enrolments yet.", strong: true }, { text: rows.length ? ` ${n(rows.length)} enrolments, ${moneyTotal(rows)} in total.` : " They appear here once a payment is recorded in Admissions." }];
  if (noOption) headline.push({ text: ` ${n(noOption)} ${noOption === 1 ? "has" : "have"} no upcoming batch to join; add a date in Programs & Batches.` });

  const kpis: PageKpi[] = [
    { label: "Enrolments", value: n(rows.length), sub: `${n(paid.length)} confirmed or completed` },
    { label: "Value", value: moneyTotal(rows), sub: "total of all enrolments" },
    { label: "In a batch", value: `${n(inBatch)} of ${n(rows.length)}`, sub: inBatch < rows.length ? "without a batch they get no start date" : "everyone has a start date", badge: inBatch < rows.length ? { text: "Fix", tone: "bad" } : { text: "OK", tone: "good" } },
    { label: "Next start date", value: firstStart ? enrolDay(firstStart) : "—", sub: firstStart ? "if assigned to the suggested batches" : "no waiting student has a batch to join" },
  ];
  const used = new Set(rows.map((r) => r.courseId));
  return { today: input.today, headline, kpis, rows, waiting: waitingRows.length, batches: upcoming.filter((b) => used.has(b.courseId)) };
}
