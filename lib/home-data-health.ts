// Data health rows for Home (owner request, 19 Nov 2026: "make it smart").
// Each row says what is actually wrong and what fixes it, instead of a bare
// percentage, and nothing is flagged red when there is simply nothing to record yet.

export type HealthState = "ok" | "warn" | "bad";
export type HealthItem = { label: string; note: string; state: HealthState; hint?: string };

export type DataHealthInput = {
  now: Date;
  leadsLive: boolean;
  qualificationLive: boolean;
  payments: { paidCount: number; toVerify: number; activeEnrollments: number } | null;
  valuation: { valued: number; eligible: number; withoutCourse: number | null } | null;
  locations: { filled: number; total: number } | null;
  replies: { echoLive: boolean; historyReplyAt: string | null };
  ads: Array<{ provider: string; lastSuccessAt: string | null; latestStatus: string | null }>;
  adsStaleDays: number;
};

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const daysSince = (iso: string | null, now: Date) => (iso ? Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000) : null);

export function paymentsHealth(p: DataHealthInput["payments"]): HealthItem {
  if (!p) return { label: "Payments", note: "Unavailable", state: "bad" };
  if (p.toVerify > 0) return { label: "Payments", note: `${p.toVerify} to verify`, state: "warn", hint: "Logged by the team; an admin needs to check them on Enrolments." };
  if (p.paidCount > 0) return { label: "Payments", note: `${p.paidCount} verified`, state: "ok" };
  if (p.activeEnrollments === 0) return { label: "Payments", note: "No enrolments yet", state: "ok", hint: "Payments appear once the team marks a lead enrolled." };
  return { label: "Payments", note: "Up to date", state: "ok" };
}

export function valuationHealth(v: DataHealthInput["valuation"]): HealthItem {
  if (!v) return { label: "Opportunity values", note: "Unavailable", state: "bad" };
  const withCourse = v.withoutCourse == null ? v.eligible : Math.max(0, v.eligible - v.withoutCourse);
  if (withCourse === 0) return { label: "Opportunity values", note: "No courses known yet", state: "warn" };
  const share = pct(Math.min(v.valued, withCourse), withCourse);
  return {
    label: "Opportunity values",
    note: `${share}% of leads with a course`,
    state: share >= 80 ? "ok" : "warn",
    hint: v.withoutCourse ? `${v.withoutCourse.toLocaleString("en-IN")} open leads haven't named a course yet, so they can't be priced.` : undefined,
  };
}

export function locationHealth(l: DataHealthInput["locations"]): HealthItem {
  if (!l) return { label: "Location", note: "Unavailable", state: "bad" };
  const share = pct(l.filled, l.total);
  return share >= 50
    ? { label: "Location", note: `${share}% known`, state: "ok" }
    : { label: "Location", note: `${share}% known`, state: "warn", hint: "Instagram doesn't share location. Course links sent in DMs record the visitor's country." };
}

export function repliesHealth(r: DataHealthInput["replies"], now: Date): HealthItem {
  if (r.echoLive) return { label: "Instagram app replies", note: "Live", state: "ok" };
  const age = daysSince(r.historyReplyAt, now);
  if (age != null && age <= 7) {
    return { label: "Instagram app replies", note: age === 0 ? "Synced today" : `Synced ${age}d ago`, state: "warn", hint: "Replies typed in the Instagram app arrive with the history sync, not instantly." };
  }
  return { label: "Instagram app replies", note: "Not captured", state: "bad", hint: "Replies typed in the Instagram app are missing; reply-waiting counts may be too high." };
}

export function adsHealth(ads: DataHealthInput["ads"], now: Date, staleDays: number): HealthItem {
  if (!ads.length) return { label: "Google & Meta ads", note: "Never synced", state: "bad" };
  const problems = ads.map((a) => {
    const age = daysSince(a.lastSuccessAt, now);
    if (a.latestStatus === "failed") return `${a.provider} failing`;
    if (age == null) return `${a.provider} never synced`;
    if (age > staleDays) return `${a.provider} ${age}d old`;
    return null;
  }).filter((x): x is string => Boolean(x));
  if (!problems.length) return { label: "Google & Meta ads", note: "Fresh", state: "ok" };
  return { label: "Google & Meta ads", note: problems.join(" · "), state: "bad", hint: "Reconnect the ad accounts in Settings → Integrations; ad costs and sources stop updating until then." };
}

export function buildDataHealth(input: DataHealthInput): HealthItem[] {
  return [
    { label: "Leads & stages", note: input.leadsLive ? "Live" : "Unavailable", state: input.leadsLive ? "ok" : "bad" },
    { label: "Qualification history", note: input.qualificationLive ? "Live" : "Unavailable", state: input.qualificationLive ? "ok" : "warn" },
    { label: "Follow-ups", note: "Live", state: "ok" },
    paymentsHealth(input.payments),
    valuationHealth(input.valuation),
    locationHealth(input.locations),
    repliesHealth(input.replies, input.now),
    adsHealth(input.ads, input.now, input.adsStaleDays),
  ];
}

/** Compact money for headline cards: ₹4.5L, ₹1.2Cr, $9.8K. */
export function compactMoney(amount: number, currency: string): string {
  const c = (currency || "INR").toUpperCase();
  const sym = c === "INR" ? "₹" : c === "USD" ? "$" : c === "EUR" ? "€" : c === "GBP" ? "£" : `${c} `;
  const a = Math.abs(amount);
  const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ""));
  if (c === "INR") {
    if (a >= 1e7) return `${sym}${fmt(amount / 1e7)}Cr`;
    if (a >= 1e5) return `${sym}${fmt(amount / 1e5)}L`;
  } else {
    if (a >= 1e6) return `${sym}${fmt(amount / 1e6)}M`;
    if (a >= 1e4) return `${sym}${fmt(amount / 1e3)}K`;
  }
  return `${sym}${Math.round(amount).toLocaleString(c === "INR" ? "en-IN" : "en-US")}`;
}

/** Headline pipeline value: the main currency, with any others as a short add-on. */
export function pipelineHeadline(currencies: Array<{ currency: string; amount: number; opportunities: number }>): { value: string; extra: string | null } {
  if (!currencies.length) return { value: "—", extra: null };
  const sorted = [...currencies].sort((a, b) => (a.currency === "INR" ? -1 : b.currency === "INR" ? 1 : b.opportunities - a.opportunities));
  const [main, ...rest] = sorted;
  return { value: compactMoney(main.amount, main.currency), extra: rest.length ? rest.map((r) => `+ ${compactMoney(r.amount, r.currency)}`).join(" ") : null };
}
