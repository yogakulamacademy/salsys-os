// Smart Revenue briefing (owner-approved mockup "Revenue", 25 Nov 2026).
// Pure helpers over revenue_story_v1. Only confirmed payments count as
// collected; checkouts and warm people are shown as "closest to landing",
// never added to money in.

export type RevenueStoryData = {
  since: string;
  collected: Array<{ month: string; course: string; currency: string; amount: number; payments: number; people: number }>;
  checkouts: Array<{ currency: string; count: number; amount: number }>;
  paymentPending: number;
  warm: Array<{ stage: string; people: number; recent: number; recentInr: number; recentIntl: number }>;
  enquiries: number;
  adSpend: Array<{ month: string; currency: string; amount: number }>;
  adSpendLastDay: string | null;
};

export type RevenueStory = {
  months: Array<{ month: string; total: number; parts: Array<{ course: string; amount: number }> }>;
  courses: Array<{ course: string; amount: number; enrolments: number }>;
  collectedInr: number;
  thisMonthInr: number;
  thisMonthEnrolments: number;
  lastMonthInr: number | null;
  enrolments: number;
  otherCurrencies: Array<{ currency: string; amount: number }>;
  average: number | null;
  conversion: number | null;
  enquiries: number;
  checkouts: { count: number; inr: number; usd: number; inrTotal: number };
  warm: { recent: number; quiet: number; valueInr: number; intl: number; highIntentRecent: number; qualifiedRecent: number };
  engaged: number;
  spend: Array<{ month: string; amount: number | null }>;
  spendStale: boolean;
  spendLastDay: string | null;
  currentMonth: string;
};

export function isRevenueStoryData(v: unknown): v is RevenueStoryData {
  const d = v as RevenueStoryData | null;
  return Boolean(d && typeof d.since === "string" && Array.isArray(d.collected) && Array.isArray(d.checkouts) && Array.isArray(d.warm) && Array.isArray(d.adSpend));
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Month keys from `since` through the current IST month. */
export function monthsFrom(since: string, now: Date): string[] {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const end = monthKey(ist);
  const out: string[] = [];
  const d = new Date(`${since.slice(0, 7)}-01T00:00:00Z`);
  for (let i = 0; i < 24; i++) {
    const k = monthKey(d);
    out.push(k);
    if (k >= end) break;
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

export function buildRevenueStory(data: RevenueStoryData, usdInr: number, now = new Date()): RevenueStory {
  const months = monthsFrom(data.since, now);
  const currentMonth = months[months.length - 1];
  const inrRows = data.collected.filter((r) => r.currency === "INR");
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const monthRows = months.map((m) => {
    const rows = inrRows.filter((r) => r.month === m);
    return { month: m, total: sum(rows.map((r) => Number(r.amount))), parts: rows.map((r) => ({ course: r.course, amount: Number(r.amount) })) };
  });
  const byCourse = new Map<string, { amount: number; enrolments: number }>();
  for (const r of inrRows) {
    const c = byCourse.get(r.course) ?? { amount: 0, enrolments: 0 };
    c.amount += Number(r.amount); c.enrolments += Number(r.people);
    byCourse.set(r.course, c);
  }
  const courses = [...byCourse].map(([course, v]) => ({ course, ...v })).sort((a, b) => b.amount - a.amount);
  const others = new Map<string, number>();
  for (const r of data.collected) if (r.currency !== "INR") others.set(r.currency, (others.get(r.currency) ?? 0) + Number(r.amount));

  const collectedInr = sum(inrRows.map((r) => Number(r.amount)));
  const enrolments = sum(data.collected.map((r) => Number(r.people)));
  const inrEnrolments = sum(inrRows.map((r) => Number(r.people)));
  const thisMonth = monthRows[monthRows.length - 1];
  const lastMonth = monthRows.length > 1 ? monthRows[monthRows.length - 2] : null;

  const ck = (c: string) => data.checkouts.find((x) => x.currency === c);
  const ckInr = Number(ck("INR")?.amount ?? 0);
  const ckUsd = Number(ck("USD")?.amount ?? 0);
  const ckCount = sum(data.checkouts.map((x) => Number(x.count)));

  const stage = (s: string) => data.warm.find((w) => w.stage === s);
  const hi = stage("high_intent"), q = stage("qualified");
  const recent = Number(hi?.recent ?? 0) + Number(q?.recent ?? 0);
  const all = Number(hi?.people ?? 0) + Number(q?.people ?? 0);

  const spendMonths = months.map((m) => {
    const rows = data.adSpend.filter((r) => r.month === m && r.currency === "INR");
    return { month: m, amount: rows.length ? sum(rows.map((r) => Number(r.amount))) : null };
  });
  const prev = new Date(`${months[0]}-01T00:00:00Z`); prev.setUTCMonth(prev.getUTCMonth() - 1);
  const before = data.adSpend.filter((r) => r.month === monthKey(prev) && r.currency === "INR");
  const spend = before.length ? [{ month: monthKey(prev), amount: sum(before.map((r) => Number(r.amount))) }, ...spendMonths] : spendMonths;
  const lastDay = data.adSpendLastDay;
  const spendStale = Boolean(lastDay) && now.getTime() - Date.parse(`${lastDay}T00:00:00Z`) > 3 * 86_400_000;

  return {
    months: monthRows,
    courses,
    collectedInr,
    thisMonthInr: thisMonth?.total ?? 0,
    thisMonthEnrolments: sum(inrRows.filter((r) => r.month === currentMonth).map((r) => Number(r.people))),
    lastMonthInr: lastMonth ? lastMonth.total : null,
    enrolments,
    otherCurrencies: [...others].map(([currency, amount]) => ({ currency, amount })),
    average: inrEnrolments ? collectedInr / inrEnrolments : null,
    enquiries: Number(data.enquiries ?? 0),
    conversion: data.enquiries ? enrolments / data.enquiries : null,
    checkouts: { count: ckCount, inr: ckInr, usd: ckUsd, inrTotal: ckInr + ckUsd * usdInr },
    warm: {
      recent, quiet: all - recent,
      valueInr: Number(hi?.recentInr ?? 0) + Number(q?.recentInr ?? 0),
      intl: Number(hi?.recentIntl ?? 0) + Number(q?.recentIntl ?? 0),
      highIntentRecent: Number(hi?.recent ?? 0), qualifiedRecent: Number(q?.recent ?? 0),
    },
    engaged: Number(stage("engaged")?.people ?? 0),
    spend,
    spendStale,
    spendLastDay: lastDay,
    currentMonth,
  };
}

/** ₹ in lakh above 1 L, rupees below. */
export function rupees(x: number): string {
  if (x >= 100000) return `₹${(x / 100000).toFixed(x >= 1000000 ? 1 : 2).replace(/\.?0+$/, "")} L`;
  return `₹${Math.round(x).toLocaleString("en-IN")}`;
}

export function monthName(m: string, style: "long" | "short" = "long"): string {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: style, timeZone: "UTC" });
}

/** The page's opening sentence, as plain-text parts (strong first). */
export function revenueHeadline(s: RevenueStory, since: string): Array<{ text: string; strong?: boolean }> {
  const from = monthName(since.slice(0, 7));
  const head = s.enrolments
    ? `${rupees(s.collectedInr)} collected from ${s.enrolments} ${s.enrolments === 1 ? "enrolment" : "enrolments"} since ${from}, ${rupees(s.thisMonthInr)} of it this month.`
    : `No confirmed payments since ${from} yet.`;
  const near: string[] = [];
  if (s.checkouts.count) near.push(`${s.checkouts.count} website ${s.checkouts.count === 1 ? "checkout" : "checkouts"} (≈ ${rupees(s.checkouts.inrTotal)}) nobody has confirmed`);
  if (s.warm.recent) near.push(`${s.warm.recent} warm people at High intent or Qualified who wrote in the last two weeks`);
  return [{ text: head, strong: true }, ...(near.length ? [{ text: ` The money closest to landing: ${near.join(", and ")}.` }] : [])];
}
