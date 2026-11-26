// Marketing "Stage by stage" and "Credit by source" (owner-approved prototype
// "Where enquiries come from – inner pages", 26 Nov 2026). Pure helpers over
// marketing_funnel_credit_v1. Reached Qualified = Qualified, High intent,
// Payment pending, won or enrolled, or has an enrolment. Paid = has an
// enrolment record (not a lead stage).

import type { PageRank, PageSignal, Part } from "@/lib/marketing-pages";

export type FunnelRow = {
  channel: string; ft: string; lt: string; stage: string; quiet: boolean; untouched: boolean;
  n: number; paid: number; value: number; currency: string | null; unowned: number; old: number;
};
export type FunnelData = { days: number; rows: FunnelRow[]; weeks: Array<{ week: string; n: number; qualified: number }> };
export type FunnelKey = "all" | "instagram" | "website" | "whatsapp";
export type FunnelGroup = {
  key: FunnelKey; name: string; steps: [number, number, number, number];
  closed: number; stuck: { label: string; n: number }; untouched: number;
};
export type CreditRow = { key: string; label: string; n: number; qualified: number; paid: number; value: number; note: string };
export type FunnelStory = {
  days: number; headline: Part[]; ranks: PageRank[]; signals: PageSignal[];
  groups: FunnelGroup[]; weeks: Array<{ label: string; n: number; qualified: number }>;
};
export type CreditStory = {
  days: number; headline: Part[]; signals: PageSignal[]; first: CreditRow[]; last: CreditRow[];
  paidTotal: number; paidCount: number; enquiries: number; currency: string;
};

const QUAL = new Set(["qualified", "high_intent", "payment_pending", "closed_won", "enrolled"]);
const CLOSED = new Set(["lost", "not_now", "unqualified"]);
const STAGE_LABEL: Record<string, string> = {
  new: "New (nobody replied)", contacted: "Contacted", engaged: "Engaged", nurture: "Nurture", qualified: "Qualified", high_intent: "High intent",
  payment_pending: "Payment pending", closed_won: "Won", enrolled: "Enrolled", lost: "Lost", not_now: "Not now", unqualified: "Unqualified",
};
const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);
export const rupees = (v: number, currency = "INR") => (currency === "INR" ? `₹${n(v)}` : `${currency} ${n(v)}`);
const reached = (r: FunnelRow) => QUAL.has(r.stage) || r.paid > 0;

export function isFunnelData(v: unknown): v is FunnelData {
  const d = v as FunnelData | null;
  return Boolean(d && Array.isArray(d.rows) && Array.isArray(d.weeks) && typeof d.days === "number");
}

/** Friendly name for a raw first/last-touch source. */
export function creditLabel(raw: string): string {
  const s = raw.toLowerCase();
  if (s === "instagram") return "Instagram";
  if (s === "ig" || s === "l.instagram.com" || /instagram\.com$/.test(s)) return "Instagram link in bio";
  if (s === "direct" || s === "(direct)" || s === "unknown") return "Website (typed the address)";
  if (s === "website_backend" || s === "website_form") return "Website form";
  if (s === "www.google.com" || s === "google.com" || s === "com.google.android.googlequicksearchbox") return "Google search";
  if (/chatgpt|openai/.test(s)) return "ChatGPT";
  if (/perplexity/.test(s)) return "Perplexity";
  if (/whatsapp|wa\.me/.test(s)) return "WhatsApp";
  if (s === "com.google.android.gm" || /mail/.test(s)) return "Email";
  if (/facebook|^fb$/.test(s)) return "Facebook";
  if (/bing/.test(s)) return "Bing search";
  if (/google/.test(s)) return "Google (other)";
  return raw;
}

function group(key: FunnelKey, name: string, rows: FunnelRow[]): FunnelGroup {
  const total = sum(rows, (r) => r.n);
  const fresh = sum(rows.filter((r) => r.stage === "new"), (r) => r.n);
  const q = sum(rows.filter(reached), (r) => r.n);
  const paid = sum(rows, (r) => (r.paid > 0 ? r.n : 0));
  const byStage = new Map<string, number>();
  for (const r of rows) if (!reached(r) && !CLOSED.has(r.stage)) byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + r.n);
  const top = [...byStage.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    key, name, steps: [total, total - fresh, q, paid],
    closed: sum(rows.filter((r) => CLOSED.has(r.stage) && r.paid === 0), (r) => r.n),
    stuck: top ? { label: STAGE_LABEL[top[0]] ?? top[0], n: top[1] } : { label: "—", n: 0 },
    untouched: sum(rows.filter((r) => r.untouched), (r) => r.n),
  };
}

function weekLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function buildFunnelStory(d: FunnelData): FunnelStory {
  const rows = d.rows.map((r) => ({ ...r, n: Number(r.n), paid: Number(r.paid), value: Number(r.value), unowned: Number(r.unowned), old: Number(r.old) }));
  const all = group("all", "All sources", rows);
  const groups: FunnelGroup[] = [all];
  const names: Record<string, [FunnelKey, string]> = { instagram: ["instagram", "Instagram"], website: ["website", "Website"], whatsapp: ["whatsapp", "WhatsApp"] };
  for (const ch of ["instagram", "website", "whatsapp"]) {
    const g = rows.filter((r) => r.channel === ch);
    if (sum(g, (r) => r.n) >= 10) groups.push(group(names[ch][0], names[ch][1], g));
  }
  const ig = groups.find((g) => g.key === "instagram");
  const web = groups.find((g) => g.key === "website");
  const untouched = rows.filter((r) => r.untouched);
  const unN = sum(untouched, (r) => r.n);
  const igEngaged = rows.filter((r) => r.channel === "instagram" && r.stage === "engaged");
  const igEngagedN = sum(igEngaged, (r) => r.n);
  const igQuiet = sum(igEngaged.filter((r) => r.quiet), (r) => r.n);

  const headline: Part[] = [{ text: `Of ${n(all.steps[0])} enquiries in the last ${d.days} days, ${n(all.steps[2])} reached Qualified and ${n(all.steps[3])} paid.`, strong: true }];
  if (web && web.steps[1] > 0 && web.steps[3] > 0) headline.push({ text: ` Website enquiries that someone answered did best: ${n(web.steps[3])} of those ${n(web.steps[1])} paid.` });
  if (unN) headline.push({ text: ` But ${n(unN)} enquiries haven’t been answered at all` });
  if (ig && igEngagedN >= ig.steps[0] * 0.5) headline.push({ text: `${unN ? ", and" : " And"} almost everyone from Instagram is still sitting at “Engaged”.` });
  else if (unN) headline.push({ text: "." });

  const ranks: PageRank[] = [];
  if (unN) {
    const old = sum(untouched, (r) => r.old), unowned = sum(untouched, (r) => r.unowned);
    ranks.push({
      id: "untouched", impact: `${n(unN)} waiting${web && web.steps[1] ? ` · ${n(web.steps[3])} of ${n(web.steps[1])} answered paid` : ""}`,
      title: `Answer the ${n(unN)} enquiries nobody has replied to`,
      bars: [{ label: "No reply yet", value: unN, shown: n(unN), tone: "amber" }, { label: "Older than 3 days", value: old, shown: n(old), tone: "red" }],
      max: unN,
      body: web && web.steps[1] ? [{ text: `Website enquiries that got a reply paid at ` }, { text: `1 in ${Math.max(1, Math.round(web.steps[1] / Math.max(web.steps[3], 1)))}`, strong: true }, { text: ` (${n(web.steps[3])} of ${n(web.steps[1])}). These never got one; ${n(old)} are more than 3 days old and ${n(unowned)} have no owner.` }]
        : [{ text: `${n(old)} are more than 3 days old and ${n(unowned)} have no owner.` }],
      actions: [{ label: `See the ${n(unN)} enquiries`, href: "/leads?stage=new", primary: true }],
      basis: "Enquiries at New with no message, call or note from the team",
    });
  }
  if (igEngagedN >= 20) {
    ranks.push({
      id: "engaged", impact: `${n(igEngagedN)} at Engaged · ${n(igQuiet)} quiet for 7+ days`,
      title: `Sort the ${n(igEngagedN)} Instagram enquiries stuck at “Engaged”`,
      bars: [{ label: "At Engaged", value: igEngagedN, shown: n(igEngagedN), tone: "brand" }, { label: "Quiet 7+ days", value: igQuiet, shown: n(igQuiet), tone: "slate" }],
      max: igEngagedN,
      body: [{ text: "They replied and stayed there. " }, { text: `${n(igQuiet)} haven’t messaged in over a week.`, strong: true }, { text: " Mark the serious ones Qualified and close the rest as Not now, so the numbers mean something." }],
      actions: [{ label: "Open them in Leads", href: "/leads?stage=engaged&channel=instagram", primary: !unN }],
      basis: "Instagram enquiries at Engaged",
    });
  }
  const weeks = d.weeks.filter((w) => Number(w.n) >= 20).slice(-6).map((w) => ({ label: weekLabel(w.week), n: Number(w.n), qualified: Number(w.qualified) }));
  const early = weeks.slice(0, Math.max(1, weeks.length - 2));
  const late = weeks.slice(-2);
  const earlyRate = pct(sum(early, (w) => w.qualified), sum(early, (w) => w.n));
  const lateRate = pct(sum(late, (w) => w.qualified), sum(late, (w) => w.n));
  if (weeks.length >= 4 && earlyRate >= 5 && lateRate <= earlyRate / 3) {
    ranks.push({
      id: "weeks", impact: "By week of first enquiry", title: "Check why few new enquiries reach Qualified",
      bars: weeks.map((w) => ({ label: w.label, value: pct(w.qualified, w.n), shown: `${pct(w.qualified, w.n)}%`, tone: "brand" as const })),
      body: [{ text: `Earlier weeks reached Qualified at about ${earlyRate}%. The last two weeks are at ${lateRate}%. ` }, { text: "Some of that is time, but it’s a big drop.", strong: true }],
      actions: [{ label: "Open recent enquiries", href: "/leads", primary: false }],
      basis: "Enquiries by week they first got in touch",
    });
  }

  const signals: PageSignal[] = [];
  if (ig && web && ig.steps[0] > web.steps[0] * 3 && web.steps[3] > ig.steps[3]) {
    signals.push({ id: "volume", tag: "Noticed", tone: "teal", title: "Instagram brings the volume, the website brings the payments",
      summary: `Instagram: ${n(ig.steps[0])} enquiries, ${n(ig.steps[3])} paid. Website: ${n(web.steps[0])} enquiries, ${n(web.steps[3])} paid.`,
      detail: "People who move from an Instagram chat to the course page and its form are the most serious. Sending warm chats there with a tracked link helps." });
  }
  if (lateRate < earlyRate && weeks.length >= 4) {
    signals.push({ id: "recording", tag: "Check", tone: "amber", title: "The recent drop may be a recording gap",
      summary: "If the team qualifies people inside the Instagram app, the stage in the CRM doesn’t change.",
      detail: "Ask the team to update the stage in the CRM when someone becomes serious, or these numbers will keep falling." });
  }
  signals.push({ id: "paid", tag: "Note", tone: "muted", title: "“Paid” counts enrolment records",
    summary: `${n(all.steps[3])} enquiries from this period have an enrolment, the same count as Enrolments and Revenue.`,
    detail: "A lead marked Enrolled without an enrolment record is not counted as paid here." });

  return { days: d.days, headline, ranks, signals, groups, weeks };
}

function credit(rows: FunnelRow[], key: "ft" | "lt"): CreditRow[] {
  const map = new Map<string, CreditRow>();
  for (const r of rows) {
    const label = creditLabel(r[key]);
    const c = map.get(label) ?? { key: label, label, n: 0, qualified: 0, paid: 0, value: 0, note: "" };
    c.n += r.n; if (reached(r)) c.qualified += r.n; c.paid += r.paid; c.value += r.value;
    map.set(label, c);
  }
  const out = [...map.values()].sort((a, b) => b.value - a.value || b.n - a.n);
  for (const c of out) {
    if (c.label === "Website (typed the address)") c.note = "People who came to the website without a link: typed the address, a bookmark, or a link that lost its tag. Many first saw Yogakulam somewhere else.";
    else if (c.label === "Website form") c.note = "Filled the website form after coming in some other way.";
    else if (c.label === "Instagram") c.note = "Started in an Instagram chat.";
    else if (c.label === "ChatGPT") c.note = "People who asked ChatGPT about courses and clicked through.";
  }
  return out;
}

export function buildCreditStory(d: FunnelData): CreditStory {
  const rows = d.rows.map((r) => ({ ...r, n: Number(r.n), paid: Number(r.paid), value: Number(r.value) }));
  const currency = rows.find((r) => r.currency)?.currency ?? "INR";
  const first = credit(rows, "ft");
  const last = credit(rows, "lt");
  const paidTotal = sum(rows, (r) => r.value);
  const paidCount = sum(rows, (r) => r.paid);
  const enquiries = sum(rows, (r) => r.n);
  const paidSources = first.filter((c) => c.value > 0);
  const lab = (c: CreditRow) => (c.label === "Website (typed the address)" ? "website" : c.label);
  const [p0, p1] = paidSources;
  const headline: Part[] = p0
    ? [{ text: `The ${lab(p0)} gets the credit for ${rupees(p0.value, currency)} of the ${rupees(paidTotal, currency)} paid so far${p1 ? `, and ${lab(p1)} for ${rupees(p1.value, currency)}` : ""}.`, strong: true }]
    : [{ text: `No payments from enquiries in the last ${d.days} days yet.`, strong: true }];
  if (paidSources[0]?.label === "Website (typed the address)") headline.push({ text: " But “website” here means people who typed the address in, so many of them probably saw Yogakulam on Instagram first. Tracked links in Instagram messages would show this properly." });

  const signals: PageSignal[] = [];
  const hop = rows.filter((r) => creditLabel(r.ft) === "Instagram" && creditLabel(r.lt) === "Website form");
  const hopN = sum(hop, (r) => r.n), hopQ = sum(hop.filter(reached), (r) => r.n);
  const igRow = first.find((c) => c.label === "Instagram");
  if (hopN >= 3 && igRow && pct(hopQ, hopN) > pct(igRow.qualified, igRow.n) * 2) {
    signals.push({ id: "hop", tag: "Noticed", tone: "teal", title: `${hopQ === hopN ? "Everyone" : `${n(hopQ)} of ${n(hopN)}`} who went from Instagram to the website form reached Qualified`,
      summary: `${n(hopQ)} of ${n(hopN)}, against ${pct(igRow.qualified, igRow.n)}% for Instagram overall.`,
      detail: "Sending serious Instagram chats to the course page with the form works. Tracked go-links will show how often it happens." });
  }
  const typed = first.find((c) => c.label === "Website (typed the address)");
  if (typed && typed.paid) {
    signals.push({ id: "typed", tag: "Check", tone: "amber", title: "“Typed the address” is probably Instagram or word of mouth",
      summary: `${n(typed.n)} people came straight to the website without a link. ${n(typed.paid)} of them paid.`,
      detail: "Ask new students where they first heard of you, and use tracked links in messages, so the credit goes to the right place." });
  }
  const ai = first.filter((c) => c.label === "ChatGPT" || c.label === "Perplexity");
  if (ai.length) {
    const aiN = sum(ai, (c) => c.n), aiQ = sum(ai, (c) => c.qualified);
    signals.push({ id: "ai", tag: "New", tone: "teal", title: "AI assistants send enquiries",
      summary: `${n(aiN)} people came from ${ai.map((c) => c.label).join(" and ")} in ${d.days} days${aiQ ? `, and ${n(aiQ)} reached Qualified` : ""}.`,
      detail: "Worth checking what these assistants say about you; Google search › AI answers covers this." });
  }
  return { days: d.days, headline, signals, first, last, paidTotal, paidCount, enquiries, currency };
}
