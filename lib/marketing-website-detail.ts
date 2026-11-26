// Marketing › Website › "Visits and sources" and "Clicks and forms" (owner-approved
// prototype "Website inner pages", 26 Nov 2026). Pure helpers over
// marketing_website_detail_v1. The page-name helper is passed in so this file
// stays free of app imports (tests run it directly).

import type { PageKpi, PageRank, PageSignal, Part } from "@/lib/marketing-pages";

export type WebsiteDetail = {
  visits: number; visitsBefore: number; engaged: number; dataTo: string | null;
  weeks: Array<{ week: string; visits: number; engaged: number }>;
  sources: Array<{ source: string; medium: string; visits: number; before: number }>;
  countries: Array<{ country: string; visits: number; before: number }>;
  pages: Array<{ path: string; visits: number; leads: number }>;
  pageSources?: Array<{ path: string; source: string; visits: number; leads: number }>;
  webLeads: Array<{ source: string; n: number }>;
  tracked: { sessions: number; formStarted: number; formSent: number };
  forms: Array<{ path: string; started: number; sent: number }>;
  bookings: {
    people: number; paymentStarted: number; bookedNoPayment: number;
    value: Array<{ currency: string; value: number }>; courses: Array<{ course: string; n: number }>; providers: Array<{ provider: string; n: number }>;
  };
  enrolled: number;
  clicks: { since: string | null; sessions: number; pricing: number; faq: number; brochure: number; phone: number; whatsapp: number; email: number };
};
export type SourceGroup = { key: string; label: string; visits: number; before: number; enquiries: number; note: string };
export type VisitsStory = {
  headline: Part[]; ranks: PageRank[]; kpis: PageKpi[]; signals: PageSignal[];
  weeks: Array<{ label: string; visits: number; engaged: number; partial: boolean }>;
  countries: WebsiteDetail["countries"]; sources: SourceGroup[];
  pages: Array<{ path: string; label: string; visits: number; leads: number }>; dataTo: string | null;
  matrix: { sources: Array<{ key: MatrixKey; label: string }>; rows: MatrixRow[] };
  matrixActions: Array<{ id: string; title: string; body: string; basis: string; href: string; cta: string }>;
};
export type MatrixKey = "search" | "typed" | "instagram" | "ai" | "facebook" | "other";
export type MatrixRow = { path: string; label: string; visits: number; leads: number; cells: Partial<Record<MatrixKey, { visits: number; leads: number }>> };
export type ClicksStory = {
  headline: Part[]; ranks: PageRank[]; signals: PageSignal[];
  journey: Array<{ label: string; sub: string; value: number; detail: string; leak?: boolean; done?: boolean }>;
  forms: Array<{ path: string; label: string; started: number; sent: number; finished: number; flag: "test" | "leak" | null }>;
  courses: Array<{ course: string; n: number }>; providers: Array<{ label: string; n: number }>;
  clicks: Array<{ label: string; n: number; sub: string }>; clicksSince: string | null; clickSessions: number;
};

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const pct1 = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);
const change = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
export const dayShort = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
export const money = (v: number, currency: string) => (currency === "INR" ? `₹${n(v)}` : currency === "USD" ? `$${Math.round(v).toLocaleString("en-US")}` : `${currency} ${n(v)}`);

export function isWebsiteDetail(v: unknown): v is WebsiteDetail {
  const d = v as WebsiteDetail | null;
  return Boolean(d && typeof d.visits !== "undefined" && Array.isArray(d.sources) && d.tracked && d.bookings && d.clicks);
}

const GROUPS: Array<{ key: string; label: string; note: string; ga: (s: string, m: string) => boolean; lead: (s: string) => boolean }> = [
  { key: "google", label: "Google search", note: "Organic Google results.", ga: (s, m) => m === "organic" && /google/.test(s), lead: (s) => /(^|\.)google\.|googlequicksearchbox|^google$/.test(s) },
  { key: "typed", label: "Typed the address", note: "No link: bookmarks, typed address, or links that lost their tag. Often people who saw you somewhere else first.", ga: (s, m) => s === "(direct)" || (m === "(none)" && s !== "menu"), lead: (s) => s === "direct" || s === "unknown" || s === "(direct)" },
  { key: "instagram", label: "Instagram links", note: "Visits from the Instagram profile and story links. Instagram chats are counted separately.", ga: (s) => /^(ig|instagram|instagram\.com|l\.instagram\.com)$/.test(s), lead: (s) => /^(ig|instagram\.com|l\.instagram\.com)$/.test(s) },
  { key: "chatgpt", label: "ChatGPT", note: "People who asked ChatGPT about courses and clicked through.", ga: (s) => /chatgpt|openai/.test(s), lead: (s) => /chatgpt|openai/.test(s) },
  { key: "ai", label: "Other AI assistants", note: "Gemini, Claude, Perplexity and Copilot.", ga: (s, m) => m === "ai-assistant" || /gemini|claude\.ai|perplexity|copilot/.test(s), lead: (s) => /gemini|claude\.ai|perplexity|copilot/.test(s) },
  { key: "bing", label: "Bing and other search", note: "Search engines other than Google.", ga: (s, m) => m === "organic", lead: (s) => /bing|duckduckgo|yahoo|brave/.test(s) },
  { key: "facebook", label: "Facebook", note: "Facebook and Messenger links.", ga: (s) => /facebook|^fb$/.test(s), lead: (s) => /facebook|^fb$/.test(s) },
  { key: "newsletter", label: "Substack and email", note: "Newsletter readers and email links.", ga: (s, m) => /substack|sbstck|mail\./.test(s) || m === "email" || s === "email", lead: (s) => /substack|mail|^email$/.test(s) },
  { key: "ads", label: "Google Ads", note: "Paid Google clicks.", ga: (_s, m) => m === "cpc" || m === "paid", lead: () => false },
];

function groupOf<T>(list: T[], test: (g: (typeof GROUPS)[number], x: T) => boolean) {
  const out = new Map<string, T[]>();
  for (const x of list) {
    const g = GROUPS.find((gr) => test(gr, x));
    const key = g?.key ?? "other";
    out.set(key, [...(out.get(key) ?? []), x]);
  }
  return out;
}

export function buildVisitsStory(d: WebsiteDetail, pageLabel: (p: string) => string, now = Date.now()): VisitsStory {
  const visits = Number(d.visits), before = Number(d.visitsBefore), engaged = Number(d.engaged);
  const ga = groupOf(d.sources.map((s) => ({ ...s, visits: Number(s.visits), before: Number(s.before) })), (g, s) => g.ga(s.source, s.medium));
  const leads = groupOf(d.webLeads.map((l) => ({ ...l, n: Number(l.n) })), (g, l) => g.lead(l.source.toLowerCase()));
  const sources: SourceGroup[] = [...GROUPS, { key: "other", label: "Other sites", note: "Other websites that link to you.", ga: () => false, lead: () => false }]
    .map((g) => ({ key: g.key, label: g.label, note: g.note, visits: sum(ga.get(g.key) ?? [], (s) => s.visits), before: sum(ga.get(g.key) ?? [], (s) => s.before), enquiries: sum(leads.get(g.key) ?? [], (l) => l.n) }))
    .filter((s) => s.visits >= 5 || s.enquiries > 0).sort((a, b) => b.visits - a.visits);
  const totalLeads = sum(d.webLeads, (l) => Number(l.n));
  const google = sources.find((s) => s.key === "google");
  const typed = sources.find((s) => s.key === "typed");
  const chat = sources.find((s) => s.key === "chatgpt");
  const countries = d.countries.map((c) => ({ ...c, country: !c.country || c.country === "(not set)" ? "Unknown" : c.country, visits: Number(c.visits), before: Number(c.before) }));
  const home = countries[0];
  const abroad = home ? visits - home.visits : 0;
  const ch = change(visits, before);
  const missingDays = d.dataTo ? Math.max(0, Math.round((now - Date.parse(`${d.dataTo}T00:00:00Z`)) / 86_400_000) - 1) : 0;

  const headline: Part[] = [];
  if (google && google.visits >= 50) {
    const gch = change(google.visits, google.before);
    const best = [typed, chat].filter((x): x is SourceGroup => Boolean(x && x.visits >= 30)).sort((a, b) => pct1(b.enquiries, b.visits) - pct1(a.enquiries, a.visits))[0];
    headline.push({ text: `${n(visits)} visits in the last 30 days. Google search ${gch != null && gch > 0 ? `is growing (${n(google.visits)} visits, up ${gch}%)` : `brings ${n(google.visits)} visits`}, but only ${pct1(google.enquiries, google.visits)} in 100 of them become enquiries${best && pct1(best.enquiries, best.visits) > pct1(google.enquiries, google.visits) * 1.5 ? `, against ${pct1(best.enquiries, best.visits)} for ${best.key === "typed" ? "people who type your address" : "ChatGPT visitors"}` : ""}.`, strong: true });
  } else headline.push({ text: `${n(visits)} visits in the last 30 days.`, strong: true });
  if (ch != null && Math.abs(ch) >= 10) {
    const falls = sources.filter((s) => s.key !== "typed" && s.before >= 20 && s.visits < s.before * 0.7).sort((a, b) => (b.before - b.visits) - (a.before - a.visits)).slice(0, 2);
    // Only name sources when their drop explains at least half of the total drop.
    const explained = ch < 0 && sum(falls, (f) => f.before - f.visits) >= (before - visits) * 0.5;
    headline.push({ text: ` The total is ${ch > 0 ? "up" : "down"} ${Math.abs(ch)}% on the month before${explained ? `, mostly fewer visits from ${falls.map((f) => f.label).join(" and ")}` : ""}${missingDays >= 1 ? `, and the last ${missingDays === 1 ? "day hasn’t" : `${missingDays} days haven’t`} synced yet` : ""}.` });
  }

  const ranks: PageRank[] = [];
  if (google && google.visits >= 100 && pct1(google.enquiries, google.visits) < 4) {
    ranks.push({ id: "google", impact: `${n(google.enquiries)} enquiries from ${n(google.visits)} visits`, title: "Turn more Google visitors into enquiries",
      bars: [{ label: "Google visits", value: google.visits, shown: n(google.visits), tone: "soft" }, { label: "Enquiries", value: google.enquiries, shown: n(google.enquiries), tone: "brand" }],
      body: [{ text: `Google brings the most visits but only ${pct1(google.enquiries, google.visits)} in 100 enquire. ` }, { text: "Course pages with dates and the form near the top do much better.", strong: true }],
      actions: [{ label: "Open the Funnel advisor", href: "/marketing?view=advisor", primary: true }], basis: "Google Analytics visits · website enquiries by first source" });
  }
  const falling = sources.filter((s) => ["instagram", "newsletter", "facebook", "other"].includes(s.key) && s.before >= 30 && s.visits < s.before * 0.7).sort((a, b) => (b.before - b.visits) - (a.before - a.visits));
  if (falling.length) {
    ranks.push({ id: "links", impact: falling.slice(0, 2).map((f) => `${f.label} ${n(f.before)} → ${n(f.visits)}`).join(" · "), title: `Put course links back in ${falling.slice(0, 2).map((f) => f.label.replace(/ links$/, "")).join(" and ")}`,
      bars: falling.slice(0, 3).map((f) => ({ label: f.label, value: f.visits, shown: `${n(f.before)} → ${n(f.visits)}`, tone: "amber" as const })), max: Math.max(...falling.slice(0, 3).map((f) => f.before)),
      body: [{ text: "These send warm visitors who already know you, and they fell sharply. " }, { text: "A course link with the next date in each post or issue brings them back.", strong: true }],
      actions: [{ label: "See the sources", href: "#sources", primary: !ranks.length }], basis: "Last 30 days against the 30 before" });
  }
  const leakPages = d.pages.filter((p) => Number(p.visits) >= 50 && pct1(Number(p.leads), Number(p.visits)) < 2 && p.path !== "" && p.path !== "/" && !/\(not set\)/.test(p.path));
  if (leakPages.length) {
    const p = leakPages.sort((a, b) => Number(b.visits) - Number(a.visits))[0];
    ranks.push({ id: "leak", impact: `${n(Number(p.leads))} enquiries from ${n(Number(p.visits))} visits`, title: `Fix the ${pageLabel(p.path)} page`,
      bars: [{ label: "Visits", value: Number(p.visits), shown: n(Number(p.visits)), tone: "soft" }, { label: "Enquiries", value: Number(p.leads), shown: n(Number(p.leads)), tone: "red" }],
      body: [{ text: "Visitors land here and leave. " }, { text: "Put the next dates and the enquiry form near the top, and add a WhatsApp button.", strong: true }],
      actions: [{ label: "See the page changes", href: "/marketing?view=advisor", primary: !ranks.length }], basis: "Landing pages, last 30 days" });
  }

  const kpis: PageKpi[] = [
    { label: "Visits", value: n(visits), sub: `30 days · ${n(before)} the month before`, badge: ch != null ? { text: `${ch > 0 ? "+" : "−"}${Math.abs(ch)}%`, tone: ch >= 0 ? "good" : "bad" } : undefined },
    { label: "Engaged", value: `${pct(engaged, visits)}%`, sub: "stayed 10+ seconds or saw 2+ pages" },
    { label: "Website enquiries", value: n(totalLeads), sub: `${pct1(totalLeads, visits)} per 100 visits` },
    { label: home ? `From outside ${home.country}` : "Countries", value: home ? `${pct(abroad, visits)}%` : n(countries.length), sub: home ? `${n(abroad)} visits` : "" },
  ];

  const signals: PageSignal[] = [];
  const grow = countries.filter((c) => c.before >= 10 && c.visits >= c.before * 2).sort((a, b) => b.visits - a.visits)[0];
  if (grow) signals.push({ id: "grow", tag: "Noticed", tone: "teal", title: `${grow.country} ${grow.visits >= grow.before * 3 ? "tripled" : grow.visits >= grow.before * 2.5 ? "nearly tripled" : "doubled"}`, summary: `${n(grow.visits)} visits, up from ${n(grow.before)}.`, detail: "Worth checking which pages they land on and whether those pages show the right price and dates." });
  if (missingDays >= 1) signals.push({ id: "sync", tag: "Check", tone: "amber", title: "The last days haven’t synced yet", summary: `Google Analytics data runs to ${d.dataTo ? dayShort(d.dataTo) : "—"}.`, detail: "The 30-day total and the change against last month will rise a little once the missing days arrive." });
  if (chat && chat.visits >= 30) signals.push({ id: "ai", tag: "New", tone: "teal", title: "ChatGPT sends steady visitors", summary: `${n(chat.visits)} visits and ${n(chat.enquiries)} enquiries in 30 days (${pct1(chat.enquiries, chat.visits)} per 100).`, detail: "Google search › AI answers shows what these assistants say about you." });

  const weeks = d.weeks.map((w, i, all) => ({ label: dayShort(w.week), visits: Number(w.visits), engaged: Number(w.engaged), partial: i === all.length - 1 }));
  const pages = d.pages.map((p) => ({ path: p.path || "/", label: pageLabel(p.path || "/"), visits: Number(p.visits), leads: Number(p.leads) })).filter((p) => !/\(not set\)/.test(p.path));
  const { matrix, matrixActions } = buildMatrix(d.pageSources ?? [], pageLabel);
  return { headline, ranks, kpis, signals, weeks, countries, sources, pages, dataTo: d.dataTo, matrix, matrixActions };
}

const MATRIX_SOURCES: Array<{ key: MatrixKey; label: string }> = [
  { key: "search", label: "Google & search" }, { key: "typed", label: "Typed / unknown" }, { key: "instagram", label: "Instagram" },
  { key: "ai", label: "ChatGPT & AI" }, { key: "facebook", label: "Facebook" }, { key: "other", label: "Other" },
];
const isHome = (p: string) => p === "/" || p === "" || /^\/index\.(php|html?)$/.test(p);
const isCourse = (p: string) => /\/course/.test(p) && !/courses\.php$/.test(p);

/** Which pages get traffic from where (SalsysOS website tracking), and what to do about it. */
export function buildMatrix(raw: NonNullable<WebsiteDetail["pageSources"]>, pageLabel: (p: string) => string) {
  const byPath = new Map<string, MatrixRow>();
  for (const r of raw) {
    const key = (MATRIX_SOURCES.some((m) => m.key === r.source) ? r.source : "other") as MatrixKey;
    const path = r.path || "/";
    const row = byPath.get(path) ?? { path, label: isHome(path) ? "Home page" : pageLabel(path), visits: 0, leads: 0, cells: {} };
    const c = row.cells[key] ?? { visits: 0, leads: 0 };
    c.visits += Number(r.visits); c.leads += Number(r.leads);
    row.cells[key] = c; row.visits += Number(r.visits); row.leads += Number(r.leads);
    byPath.set(path, row);
  }
  const rows = [...byPath.values()].filter((r) => !/\(not set\)/.test(r.path)).sort((a, b) => b.visits - a.visits).slice(0, 12);
  const used = MATRIX_SOURCES.filter((m) => rows.some((r) => (r.cells[m.key]?.visits ?? 0) > 0));
  const rate = (c?: { visits: number; leads: number }) => (c && c.visits ? (c.leads / c.visits) * 100 : 0);
  const actions: VisitsStory["matrixActions"] = [];

  const igTotal = sum(rows, (r) => r.cells.instagram?.visits ?? 0);
  const home = rows.find((r) => isHome(r.path));
  const homeIg = home?.cells.instagram;
  const courseRows = rows.filter((r) => isCourse(r.path) && r.visits >= 50);
  const courseRate = courseRows.length ? (sum(courseRows, (r) => r.leads) / sum(courseRows, (r) => r.visits)) * 100 : 0;
  if (homeIg && igTotal >= 30 && homeIg.visits >= igTotal * 0.6 && courseRate > rate(homeIg) * 1.3) {
    actions.push({ id: "ig-home", title: "Send Instagram links to course pages, not the Home page",
      body: `${n(homeIg.visits)} of ${n(igTotal)} Instagram visits land on the Home page, and ${Math.round(rate(homeIg))} in 100 enquire. Course pages turn about ${Math.round(courseRate)} in 100 visitors into enquiries.`,
      basis: `Instagram → Home page: ${n(homeIg.visits)} visits, ${n(homeIg.leads)} enquiries`, href: "/marketing?view=advisor", cta: "Open the Funnel advisor" });
  }
  const searchPages = rows.filter((r) => isCourse(r.path) && (r.cells.search?.visits ?? 0) >= 10);
  const best = [...searchPages].filter((r) => (r.cells.search?.visits ?? 0) >= 40).sort((a, b) => rate(b.cells.search) - rate(a.cells.search))[0];
  const weak = best ? [...searchPages].filter((r) => r !== best && rate(r.cells.search) < rate(best.cells.search) / 2).sort((a, b) => (b.cells.search?.visits ?? 0) - (a.cells.search?.visits ?? 0))[0] : undefined;
  if (best && weak && rate(best.cells.search) >= 4) {
    actions.push({ id: "search-copy", title: `Use the ${best.label} page as the model for ${weak.label}`,
      body: `Google sends ${best.label} ${n(best.cells.search!.visits)} visits and ${n(best.cells.search!.leads)} ${best.cells.search!.leads === 1 ? "enquires" : "enquire"}. ${weak.label} gets ${n(weak.cells.search!.visits)} from Google and ${weak.cells.search!.leads ? `${n(weak.cells.search!.leads)} enquire` : "none enquire"}.`,
      basis: `${best.label}: ${Math.round(rate(best.cells.search))} per 100 from Google`, href: "/marketing?view=advisor", cta: "Open the Funnel advisor" });
  }
  const leaky = rows.filter((r) => isCourse(r.path) && (r.cells.typed?.visits ?? 0) >= 40 && rate(r.cells.typed) < 3).sort((a, b) => (b.cells.typed?.visits ?? 0) - (a.cells.typed?.visits ?? 0))[0];
  if (leaky) {
    const sibling = rows.find((r) => r !== leaky && isCourse(r.path) && (r.cells.typed?.visits ?? 0) >= 20 && rate(r.cells.typed) >= 3 * Math.max(rate(leaky.cells.typed), 1) && r.label.split(" ")[0] === leaky.label.split(" ")[0]);
    actions.push({ id: "typed-leak", title: `Fix the ${leaky.label} page`,
      body: `${n(leaky.cells.typed!.visits)} people reach it directly and ${n(leaky.cells.typed!.leads)} ${leaky.cells.typed!.leads === 1 ? "enquires" : "enquire"}.${sibling ? ` ${sibling.label} gets ${n(sibling.cells.typed!.leads)} from ${n(sibling.cells.typed!.visits)}.` : ""} Put the next dates and the form near the top.`,
      basis: "Direct visits and enquiries, last 30 days", href: "/marketing?view=advisor", cta: "See the page changes" });
  }
  return { matrix: { sources: used, rows }, matrixActions: actions.slice(0, 3) };
}

const PROVIDER: Record<string, string> = { paypal: "PayPal", icici: "Card (ICICI)", direct_upi: "UPI", upi: "UPI", razorpay: "Razorpay", stripe: "Card (Stripe)" };

export function buildClicksStory(d: WebsiteDetail, pageLabel: (p: string) => string): ClicksStory {
  const b = d.bookings;
  const booked = Number(b.people), noPay = Number(b.bookedNoPayment), startedOfBooked = booked - noPay;
  const value = b.value.map((v) => money(Number(v.value), v.currency)).join(" and ");
  const t = d.tracked;
  const forms = d.forms.map((f) => {
    const started = Number(f.started), sent = Number(f.sent);
    const finished = Math.min(100, pct(sent, started));
    const flag: "test" | "leak" | null = /(^|\/)test(\.php|\.html?)?$/i.test(f.path) ? "test" : started >= 6 && finished < 50 ? "leak" : null;
    return { path: f.path, label: f.path === "/" ? "Home page" : pageLabel(f.path), started, sent, finished, flag };
  });
  const leaks = forms.filter((f) => f.flag === "leak");
  const test = forms.find((f) => f.flag === "test");

  const headline: Part[] = booked
    ? [{ text: `${n(booked)} ${booked === 1 ? "person" : "people"} filled in the booking form in the last 30 days${value ? `, for courses worth ${value}` : ""}. ${n(startedOfBooked)} of them started a payment, and ${n(noPay)} never did.`, strong: true },
       { text: noPay ? ` Those ${n(noPay)} are the quickest money on the website.` : "" },
       { text: leaks.length ? ` Forms work well on most pages, but ${leaks.length === 1 ? "one loses" : `${n(leaks.length)} lose`} most of the people who start ${leaks.length === 1 ? "it" : "them"}.` : "" }]
    : [{ text: `${n(t.formSent)} forms were sent in the last 30 days from ${n(t.sessions)} tracked visits.`, strong: true }];

  const ranks: PageRank[] = [];
  if (noPay >= 3) ranks.push({ id: "nopay", impact: `${n(noPay)} of ${n(booked)} bookings · last 30 days`, title: `Call the ${n(noPay)} people who booked but never started a payment`,
    bars: [{ label: "Booked", value: booked, shown: n(booked), tone: "brand" }, { label: "Started a payment", value: startedOfBooked, shown: n(startedOfBooked), tone: "green" }, { label: "Never started", value: noPay, shown: n(noPay), tone: "red" }], max: booked,
    body: [{ text: "They picked a course, a date and a room, then stopped. " }, { text: "Some may have paid another way; the rest are one call away.", strong: true }],
    actions: [{ label: "See the website bookings", href: "/leads?last_touch_source=website_backend", primary: true }], basis: "Website booking form and payment starts" });
  if (leaks.length) ranks.push({ id: "forms", impact: leaks.map((f) => `${f.label}: ${n(f.sent)} of ${n(f.started)}`).slice(0, 2).join(" · "), title: `Fix the ${leaks.length === 1 ? "form" : `${n(leaks.length)} forms`} people give up on`,
    bars: leaks.slice(0, 3).map((f) => ({ label: f.label, value: f.finished, shown: `${f.finished}%`, tone: "red" as const })), max: 100,
    body: [{ text: "Most pages finish 70–100% of the forms people start. " }, { text: "Shorten these forms or check they work on a phone.", strong: true }],
    actions: [{ label: "See the forms", href: "#forms", primary: !ranks.length }], basis: "Form starts against sends, last 30 days" });
  if (test) ranks.push({ id: "test", impact: `${n(test.started)} form starts`, title: "Take the test page down",
    bars: [{ label: "Form starts on the test page", value: test.started, shown: n(test.started), tone: "amber" }],
    body: [{ text: `${test.path} is live and real visitors use its form. ` }, { text: "Ask the web developer to remove it or hide it from Google.", strong: true }],
    actions: [{ label: "See the forms", href: "#forms", primary: !ranks.length }], basis: "SalsysOS website tracking" });

  const journey: ClicksStory["journey"] = [
    { label: "Visits", sub: "tracked by SalsysOS", value: Number(t.sessions), detail: "Visits the SalsysOS website tracker saw. A little lower than Google Analytics because of cookie choices." },
    { label: "Started a form", sub: `${pct1(t.formStarted, t.sessions)} per 100 visits`, value: Number(t.formStarted), detail: "Clicked into any form: enquiry pop-up, contact or booking." },
    { label: "Sent a form", sub: `${pct(t.formSent, t.formStarted)}% of starters`, value: Number(t.formSent), detail: `Pressed send. ${n(Math.max(0, t.formStarted - t.formSent))} started and gave up.` },
  ];
  if (booked) {
    journey.push({ label: "Booked a course", sub: "people, on the booking form", value: booked, detail: `Picked a course, date and room on the booking form${value ? `. Worth ${value}` : ""}.` });
    journey.push({ label: "Started a payment", sub: `${pct(startedOfBooked, booked)}% of bookings`, value: startedOfBooked, detail: `Opened PayPal, card or UPI. ${n(noPay)} who booked never got here.`, leak: noPay >= 3 });
  }
  journey.push({ label: "Enrolled", sub: "in the CRM, last 30 days", value: Number(d.enrolled), detail: "Enrolment records. The website doesn’t confirm successful payments back to the CRM yet, so some paid bookings may still need entering.", done: true });

  const c = d.clicks;
  const clicks = [
    { label: "Looked at prices", n: Number(c.pricing), sub: c.sessions ? `${pct(c.pricing, c.sessions)}% of visits` : "" },
    { label: "Opened an FAQ", n: Number(c.faq), sub: "" },
    { label: "Clicked the phone number", n: Number(c.phone), sub: "" },
    { label: "Opened the brochure", n: Number(c.brochure), sub: "" },
    { label: "Clicked WhatsApp", n: Number(c.whatsapp), sub: "" },
    { label: "Clicked the email address", n: Number(c.email), sub: "" },
  ].filter((x) => x.n > 0);

  const signals: PageSignal[] = [];
  if (c.sessions >= 50 && c.pricing >= c.sessions * 0.3) signals.push({ id: "price", tag: "Noticed", tone: "teal", title: `${pct(c.pricing, c.sessions) >= 45 ? "Half" : "Many"} of visitors look at prices`, summary: `${n(c.pricing)} of ${n(c.sessions)} visits since ${c.since ? dayShort(c.since) : "tracking began"} opened the price section.`, detail: "Price is a big part of the decision; the early-bird line next to the price helps." });
  if (booked && Number(b.paymentStarted) > 0) signals.push({ id: "confirm", tag: "Check", tone: "amber", title: "Payments aren’t confirmed back to the CRM", summary: "The website tells the CRM when a payment starts, but not when it succeeds.", detail: "Until it does, enter completed payments in Enrolments so Revenue and these numbers stay right." });
  if (test) signals.push({ id: "test", tag: "Fix", tone: "red", title: "A test page is live", summary: `${test.path} had ${n(test.started)} form starts in 30 days.`, detail: "Ask the web developer to remove it or hide it from Google." });

  return {
    headline, ranks: ranks.slice(0, 3), signals, journey, forms,
    courses: b.courses.map((x) => ({ course: x.course, n: Number(x.n) })),
    providers: b.providers.map((p) => ({ label: PROVIDER[p.provider] ?? p.provider, n: Number(p.n) })),
    clicks, clicksSince: c.since, clickSessions: Number(c.sessions),
  };
}
