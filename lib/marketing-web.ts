// Marketing "Website", "Google search" and "Tracking check" pages (owner-approved
// prototype "Marketing step 3", 25 Nov 2026). Pure helpers over
// marketing_web_v1, marketing_search_v1 and marketing_tracking_v1. Every figure
// comes from Google Analytics, Search Console or the CRM's own records.

import type { PageKpi, PageRank, PageSignal, Part } from "@/lib/marketing-pages";

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const per100 = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const change = (now: number, before: number) => (before ? (now - before) / before : null);
const DAY = 86_400_000;
const day = (iso: string) => new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: iso.length <= 10 ? "UTC" : "Asia/Kolkata" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/* ---------------- shared ---------------- */

/** Plain name for a website traffic source (Google Analytics source/medium or a first-touch source). */
export function webSourceGroup(source: string, medium = ""): string {
  const s = source.toLowerCase(), m = medium.toLowerCase();
  if (/chatgpt|openai|perplexity|gemini|copilot|claude\.ai/.test(s) || m === "ai-assistant") return "AI assistants (ChatGPT and others)";
  if (/google/.test(s) && (m === "cpc" || m === "paid")) return "Google Ads";
  if (/google/.test(s)) return "Google search";
  if (/bing|duckduckgo|yahoo|brave/.test(s) && !/mail/.test(s)) return "Other search engines";
  if (s === "(direct)" || s === "direct" || s === "unknown" || s === "(not set)" && m === "(not set)") return "Typed the address / unknown";
  if (s === "ig" || /instagram/.test(s)) return "Instagram links";
  if (/facebook|^fb$|^m\.facebook/.test(s)) return "Facebook";
  if (/substack|sbstck/.test(s)) return "Substack newsletter";
  if (m === "email" || /mail\./.test(s) || s === "email") return "Email";
  return "Everything else";
}

/** "Online Face Yoga Teacher Training" from "/courses/online/online-face-yoga-teacher-training.php". */
export function pageLabel(path: string): string {
  const p = (path || "").replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/\/$/, "");
  if (!p) return "Home page";
  if (p === "(not set)") return "Unknown page";
  const slug = p.split("/").pop()!.replace(/\.(php|html?)$/, "");
  const words: Record<string, string> = { enroll: "Enrol page", courses: "All courses list", contact: "Contact", "about-us": "About us" };
  if (words[slug]) return words[slug];
  return slug.replace(/-/g, " ").replace(/\b(\d+) hour yoga teacher training\b/i, "$1-hour ytt").replace(/\bteacher training\b/i, "ttc")
    .replace(/(\d+) hour/i, "$1-hour").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bIn\b/g, "in").replace(/\bYtt\b/, "YTT").replace(/\bTtc\b/, "TTC");
}

/* ---------------- Website ---------------- */

export type WebData = {
  visits: number; visitsBefore: number; engaged: number; dataTo: string | null;
  sources: Array<{ source: string; medium: string; visits: number }>;
  countries: Array<{ country: string; visits: number }>;
  pages: Array<{ path: string; visits: number; engaged: number; leads: number }>;
  webLeads: Array<{ source: string; n: number }>;
};
export type FormSteps = { started: number; submitted: number } | null;
export type WebSourceRow = { label: string; visits: number; leads: number; note: string };
export type WebPageRow = { path: string; label: string; visits: number; engaged: number; leads: number };
export type WebStory = { headline: Part[]; ranks: PageRank[]; kpis: PageKpi[]; sources: WebSourceRow[]; pages: WebPageRow[]; signals: PageSignal[]; leads: number };

export function isWebData(v: unknown): v is WebData {
  const d = v as WebData | null;
  return Boolean(d && typeof d.visits === "number" && Array.isArray(d.sources) && Array.isArray(d.pages) && Array.isArray(d.webLeads));
}

const SOURCE_NOTE: Record<string, string> = {
  "Google search": "People who found you on Google. The Google search page shows which searches bring them.",
  "Typed the address / unknown": "Mostly people who already know you, often after seeing you on Instagram.",
  "Instagram links": "Visits from your bio link and stories. Most Instagram people message you instead, so the website is a second step for them.",
  "AI assistants (ChatGPT and others)": "People an AI assistant recommended you to. They arrive ready to ask.",
  "Facebook": "Visits from Facebook posts and links.",
  "Substack newsletter": "Visits from your Substack posts and emails.",
  "Email": "Visits from links in emails.",
  "Google Ads": "Paid clicks from Google Ads.",
  "Other search engines": "Bing, Brave and other search engines.",
  "Everything else": "Small referrers and visits Google Analytics couldn’t label.",
};

/** Course pages for the same course in different places ("…-in-mysore" vs "…-in-kerala"). */
function courseKey(path: string) {
  const slug = path.split("/").pop()?.replace(/\.(php|html?)$/, "") ?? "";
  const m = slug.match(/^(.*)-in-[a-z-]+$/);
  return m ? m[1] : null;
}

export function buildWebStory(d: WebData, form: FormSteps): WebStory {
  const groups = new Map<string, WebSourceRow>();
  for (const s of d.sources) {
    const label = webSourceGroup(s.source, s.medium);
    const row = groups.get(label) ?? { label, visits: 0, leads: 0, note: SOURCE_NOTE[label] ?? "" };
    row.visits += Number(s.visits);
    groups.set(label, row);
  }
  const otherVisits = d.visits - sum([...groups.values()].map((r) => r.visits));
  if (otherVisits > 0) {
    const row = groups.get("Everything else") ?? { label: "Everything else", visits: 0, leads: 0, note: SOURCE_NOTE["Everything else"] };
    row.visits += otherVisits;
    groups.set("Everything else", row);
  }
  for (const l of d.webLeads) {
    const label = webSourceGroup(l.source);
    const row = groups.get(label) ?? { label, visits: 0, leads: 0, note: SOURCE_NOTE[label] ?? "" };
    row.leads += Number(l.n);
    groups.set(label, row);
  }
  const sources = [...groups.values()].filter((r) => r.visits > 0 || r.leads > 0).sort((a, b) => b.visits - a.visits);
  const leads = sum(d.webLeads.map((l) => Number(l.n)));
  const avg = per100(leads, d.visits);
  const pages: WebPageRow[] = d.pages.filter((p) => p.path !== "(not set)").map((p) => ({ path: p.path, label: pageLabel(p.path), visits: Number(p.visits), engaged: Number(p.engaged), leads: Number(p.leads) }));
  const ch = change(d.visits, d.visitsBefore);

  const ranks: PageRank[] = [];
  // 1. A course page that gets visits but almost no enquiries, best compared with the same course elsewhere.
  const weak = pages.filter((p) => p.visits >= 40 && per100(p.leads, p.visits) < 2 && courseKey(p.path));
  let gap: { weak: WebPageRow; strong: WebPageRow | null } | null = null;
  for (const w of weak) {
    const strong = pages.filter((p) => p !== w && courseKey(p.path) === courseKey(w.path) && p.visits >= 20 && per100(p.leads, p.visits) >= Math.max(5, avg * 1.5))
      .sort((a, b) => per100(b.leads, b.visits) - per100(a.leads, a.visits))[0] ?? null;
    if (strong) { gap = { weak: w, strong }; break; }
  }
  if (!gap && weak[0]) gap = { weak: weak[0], strong: null };
  if (gap) {
    const w = gap.weak, s = gap.strong;
    ranks.push({
      id: "page", impact: `${n(w.visits)} visits · ${n(w.leads)} ${w.leads === 1 ? "enquiry" : "enquiries"}`,
      title: `Fix the ${w.label} page`,
      bars: [
        ...(s ? [{ label: `${s.label} · ${n(s.visits)} visits`, value: per100(s.leads, s.visits), shown: `${Math.round(per100(s.leads, s.visits))} per 100`, tone: "brand" as const }] : [{ label: `Website average`, value: avg, shown: `${avg.toFixed(1)} per 100`, tone: "brand" as const }]),
        { label: `${w.label} · ${n(w.visits)} visits`, value: per100(w.leads, w.visits), shown: `${Math.round(per100(w.leads, w.visits))} per 100`, tone: "red" },
      ],
      body: s
        ? [{ text: "The same course on " }, { text: `${s.label} turns ${Math.round(per100(s.leads, s.visits))} in 100 visits`, strong: true }, { text: ` into enquiries; this page turns ${Math.round(per100(w.leads, w.visits))}. Compare the two: price, dates, photos and where the enquiry button sits.` }]
        : [{ text: "People open this page but " }, { text: "almost nobody enquires from it", strong: true }, { text: ". Check the price, dates and that the enquiry button is easy to find." }],
      actions: [{ label: "See visits and sources", href: "/marketing?view=analytics", primary: true }],
      basis: "Visits from Google Analytics · enquiries whose tracked visit started on the page",
    });
  }
  if (form && form.started >= 10 && form.started - form.submitted >= 5) {
    ranks.push({
      id: "form", impact: `${n(form.started - form.submitted)} started the form and left`, title: "Shorten the website enquiry form",
      bars: [
        { label: "Started the form", value: form.started, shown: n(form.started), tone: "brand" },
        { label: "Sent it", value: form.submitted, shown: n(form.submitted), tone: "green" },
      ],
      max: form.started,
      body: [{ text: `Of ${n(form.started)} visitors who started the form in 14 days, ` }, { text: `${n(form.started - form.submitted)} left before sending it`, strong: true }, { text: ". A shorter form, or a WhatsApp button beside it, would keep some of them." }],
      actions: [{ label: "See form steps", href: "/marketing?view=behavior", primary: true }],
      basis: "Website form events, last 14 days",
    });
  }
  const ai = sources.find((s) => s.label.startsWith("AI assistants"));
  if (ai && ai.visits >= 30 && ai.leads >= 2 && per100(ai.leads, ai.visits) >= avg * 1.5) {
    ranks.push({
      id: "ai", impact: `${Math.round(per100(ai.leads, ai.visits))} in 100 enquire`, title: "Keep the pages AI assistants recommend accurate",
      bars: [
        { label: "Visits from AI assistants", value: ai.visits, shown: n(ai.visits), tone: "green" },
        { label: "Enquiries", value: ai.leads, shown: n(ai.leads), tone: "brand" },
      ],
      max: ai.visits,
      body: [{ text: "ChatGPT and similar assistants send visitors who are ready to ask: " }, { text: `${Math.round(per100(ai.leads, ai.visits))} in 100 enquire`, strong: true }, { text: `, against ${avg.toFixed(1)} for the website overall. Keep course prices and dates current on the pages they land on.` }],
      actions: [{ label: "See visits and sources", href: "/marketing?view=analytics", primary: true }],
      basis: "Visits with an AI assistant as the source",
    });
  }

  const best = sources.filter((s) => s.visits >= 30 && s.leads >= 2).sort((a, b) => per100(b.leads, b.visits) - per100(a.leads, a.visits)).slice(0, 2);
  const headline: Part[] = [
    { text: `${n(d.visits)} visits in the last 30 days${ch !== null && Math.abs(ch) >= 0.05 ? `, ${Math.round(Math.abs(ch) * 100)}% ${ch < 0 ? "fewer" : "more"} than the 30 days before` : ""}; about 1 in ${Math.max(1, Math.round(d.visits / Math.max(1, leads)))} visits becomes an enquiry.`, strong: true },
    ...(best.length ? [{ text: ` ${best.map((b) => b.label.replace(" (ChatGPT and others)", "")).join(" and ")} turn into enquiries most often (${best.map((b) => `${Math.round(per100(b.leads, b.visits))} in 100`).join(" and ")})` }] : []),
    ...(gap ? [{ text: `${best.length ? ";" : ""} the ${gap.weak.label} page gets visits but almost no enquiries.` }] : best.length ? [{ text: "." }] : []),
  ];

  const top = d.countries.find((c) => c.country !== "(not set)");
  const abroad = top ? d.visits - Number(top.visits) : 0;
  const kpis: PageKpi[] = [
    { label: "Visits · 30 days", value: n(d.visits), sub: `${n(d.visitsBefore)} the 30 days before`, badge: ch === null ? undefined : { text: `${ch < 0 ? "▼" : "▲"} ${Math.abs(Math.round(ch * 100))}%`, tone: ch <= -0.1 ? "bad" : "good" } },
    { label: "Website enquiries", value: n(leads), sub: `${avg.toFixed(1)} per 100 visits` },
    { label: "Stayed and looked around", value: `${pct(d.engaged, d.visits)}%`, sub: `${n(d.engaged)} of ${n(d.visits)} visits` },
    { label: top ? `From outside ${top.country}` : "Countries", value: top ? `${pct(abroad, d.visits)}%` : "—", sub: d.countries.filter((c) => c !== top && c.country !== "(not set)").slice(0, 3).map((c) => `${c.country} ${n(Number(c.visits))}`).join(" · ") },
  ];

  const signals: PageSignal[] = [];
  if (ch !== null && Math.abs(ch) >= 0.1) {
    signals.push({ id: "trend", tag: ch < 0 ? "Down" : "Up", tone: ch < 0 ? "red" : "teal", title: `Visits are ${Math.round(Math.abs(ch) * 100)}% ${ch < 0 ? "lower" : "higher"} than the month before`, summary: `${n(d.visits)} visits against ${n(d.visitsBefore)}.`, detail: "The Google search page shows whether search clicks moved the same way; if they didn’t, the change came from direct and social visits." });
  }
  const dead = pages.filter((p) => p.visits >= 40 && p.leads === 0 && p !== gap?.weak).slice(0, 2);
  for (const p of dead) {
    signals.push({ id: `dead-${p.path}`, tag: "Gap", tone: "amber", title: `${p.label} gets visits but no enquiries`, summary: `${n(p.visits)} visits in 30 days, none enquired from there.`, detail: "Add an enquiry or WhatsApp button near the top of the page, and check that prices and dates are shown." });
  }
  if (top && pct(abroad, d.visits) >= 25) {
    signals.push({ id: "abroad", tag: "Abroad", tone: "teal", title: `${pct(abroad, d.visits)}% of visits come from outside ${top.country}`, summary: d.countries.filter((c) => c !== top && c.country !== "(not set)").slice(0, 5).map((c) => `${c.country} ${n(Number(c.visits))}`).join(", ") + ".", detail: "Check that course pages show international prices and online options clearly for these visitors." });
  }
  for (const s of sources.filter((x) => (x.label === "Substack newsletter" || x.label === "Facebook" || x.label === "Email") && x.visits >= 30 && x.leads === 0).slice(0, 1)) {
    signals.push({ id: `ref-${s.label}`, tag: "Tag it", tone: "teal", title: `${s.label} sends visitors but no tracked enquiries`, summary: `${n(s.visits)} visits in 30 days.`, detail: "Add a course link with a campaign tag to each post so enquiries from it show up here." });
  }

  return { headline, ranks: ranks.slice(0, 3), kpis, sources, pages, signals, leads };
}

/* ---------------- Google search ---------------- */

export type SearchData = {
  clicks: number; clicksBefore: number; views: number; viewsBefore: number; position: number | null; dataTo: string | null; brandClicks: number;
  top: Array<{ query: string; clicks: number; views: number; position: number; brand: boolean }>;
  near: Array<{ query: string; clicks: number; views: number; position: number }>;
  pages: Array<{ page: string; clicks: number; views: number; position: number }>;
};
export type SearchStory = { headline: Part[]; ranks: PageRank[]; kpis: PageKpi[]; near: SearchData["near"]; top: SearchData["top"]; pages: Array<SearchData["pages"][number] & { label: string }> };

export function isSearchData(v: unknown): v is SearchData {
  const d = v as SearchData | null;
  return Boolean(d && typeof d.clicks === "number" && Array.isArray(d.near) && Array.isArray(d.top) && Array.isArray(d.pages));
}

export function buildSearchStory(d: SearchData): SearchStory {
  const pages = d.pages.map((p) => ({ ...p, clicks: Number(p.clicks), views: Number(p.views), position: Number(p.position), label: pageLabel(p.page) }));
  const cc = change(d.clicks, d.clicksBefore), vc = change(d.views, d.viewsBefore);
  const ranks: PageRank[] = [];
  const onPage1 = d.near.filter((q) => Number(q.position) <= 10 && Number(q.views) >= 100 && Number(q.clicks) <= Number(q.views) * 0.02).slice(0, 3);
  if (onPage1.length) {
    const views = sum(onPage1.map((q) => Number(q.views))), clicks = sum(onPage1.map((q) => Number(q.clicks)));
    ranks.push({
      id: "titles", impact: `${n(views)} views · ${n(clicks)} ${clicks === 1 ? "click" : "clicks"}`,
      title: `Rewrite the titles for ${onPage1.length === 1 ? "a search" : `${onPage1.length} searches`} already on page 1`,
      bars: onPage1.map((q) => ({ label: `“${q.query}” · #${Math.round(Number(q.position))}`, value: Number(q.views), shown: `${n(Number(q.clicks))} clicks`, tone: "brand" as const })),
      max: Math.max(...onPage1.map((q) => Number(q.views))),
      body: [{ text: "You already show on the first page of Google for these, but almost nobody clicks. " }, { text: "A clearer page title and description", strong: true }, { text: " (course, price, certificate, online or in person) usually fixes that without new content." }],
      actions: [{ label: "See searches and pages", href: "/seo/search-performance", primary: true }],
      basis: "Search Console, last 30 days · position = average place on Google",
    });
  }
  const buried = pages.filter((p) => p.views >= 1000 && p.position > 30).sort((a, b) => b.views - a.views)[0];
  if (buried) {
    ranks.push({
      id: "buried", impact: `${n(buried.views)} views · page ${Math.ceil(buried.position / 10)}`, title: `Lift the ${buried.label} page`,
      bars: [{ label: "Seen in searches", value: buried.views, shown: n(buried.views), tone: "soft" }, { label: "Clicks", value: buried.clicks, shown: n(buried.clicks), tone: "brand" }],
      max: buried.views,
      body: [{ text: "Google shows this page often, but " }, { text: `on page ${Math.ceil(buried.position / 10)} on average`, strong: true }, { text: `, so only ${n(buried.clicks)} people clicked. Fuller course details and links to it from the home page help most.` }],
      actions: [{ label: "Open content ideas", href: "/seo/content-opportunities", primary: true }],
      basis: "Search Console, page view",
    });
  }
  const page2 = pages.filter((p) => p.views >= 1000 && p.position > 10 && p.position <= 20 && p !== buried && !/^Home page$/.test(p.label)).sort((a, b) => b.views - a.views)[0];
  if (page2) {
    ranks.push({
      id: "page2", impact: `${n(page2.views)} views · page 2`, title: `Push the ${page2.label} page onto page 1`,
      bars: [{ label: "Seen in searches", value: page2.views, shown: n(page2.views), tone: "soft" }, { label: "Clicks", value: page2.clicks, shown: n(page2.clicks), tone: "brand" }],
      max: page2.views,
      body: [{ text: "One of your most-seen course pages, but it sits " }, { text: `around position ${Math.round(page2.position)}`, strong: true }, { text: ". Reaching page 1 is one of the biggest search gains available." }],
      actions: [{ label: "Open technical checks", href: "/seo/technical", primary: true }],
      basis: "Search Console, page view",
    });
  }
  const headline: Part[] = [
    { text: `Google sent ${n(d.clicks)} clicks in the last 30 days${cc !== null && Math.abs(cc) >= 0.03 ? ` (${Math.round(Math.abs(cc) * 100)}% ${cc < 0 ? "fewer" : "more"})` : ""}${vc !== null && Math.abs(vc) >= 0.03 ? `, while you appeared in ${Math.round(Math.abs(vc) * 100)}% ${vc > 0 ? "more" : "fewer"} searches` : ""}${d.brandClicks ? `; ${pct(d.brandClicks, d.clicks)}% of clicks are people searching your name` : ""}.`, strong: true },
    ...(onPage1.length ? [{ text: " The quickest wins are searches where you already show on page 1 but few people click." }] : []),
  ];
  const kpis: PageKpi[] = [
    { label: "Clicks from Google", value: n(d.clicks), sub: `${n(d.clicksBefore)} the 30 days before`, badge: cc === null ? undefined : { text: `${cc < 0 ? "▼" : "▲"} ${Math.abs(Math.round(cc * 100))}%`, tone: cc < -0.03 ? "bad" : "good" } },
    { label: "Times you were seen", value: n(d.views), sub: `${n(d.viewsBefore)} before`, badge: vc === null ? undefined : { text: `${vc < 0 ? "▼" : "▲"} ${Math.abs(Math.round(vc * 100))}%`, tone: vc < -0.03 ? "bad" : "good" } },
    { label: "Average position", value: d.position === null ? "—" : String(d.position), sub: d.position === null ? "" : d.position <= 10 ? "Page 1 on average" : `Page ${Math.ceil(d.position / 10)} on average` },
    { label: "People searching your name", value: n(d.brandClicks), sub: `${pct(d.brandClicks, d.clicks)}% of clicks${d.dataTo ? ` · data to ${day(d.dataTo)}` : ""}` },
  ];
  return { headline, ranks, kpis, near: d.near, top: d.top, pages };
}

/* ---------------- Tracking check ---------------- */

export type TrackingData = {
  website: { lastEventAt: string | null; events: number; rejected: number; visits24h: number };
  unusedSources: string[];
  lastWebsiteLeadAt: string | null; webLeads30d: number;
  lastInstagramAt: string | null; lastWhatsAppAt: string | null;
  ga4: { status: string; at: string; dataTo: string | null } | null;
  gsc: { status: string; at: string; dataTo: string | null } | null;
  meta: { status: string; at: string; lastSuccessAt: string | null } | null;
  google: { status: string; at: string; error: string | null; lastSuccessAt: string | null } | null;
  visits30d: { all: number; tagged: number; metaClickIds: number; googleClickIds: number; withLead: number };
};
export type TrackStatus = "ok" | "warn" | "bad" | "off";
export type TrackItem = { key: string; name: string; status: TrackStatus; sub: string; what: string; todo: string; href?: string };
export type TrackingStory = { headline: Part[]; items: TrackItem[]; cards: PageRank[] };

export function isTrackingData(v: unknown): v is TrackingData {
  const d = v as TrackingData | null;
  return Boolean(d && d.website && d.visits30d && Array.isArray(d.unusedSources));
}

function ago(iso: string, now: Date) {
  const h = (now.getTime() - Date.parse(iso)) / 3_600_000;
  if (h < 1) return "less than an hour ago";
  if (h < 24) return `${Math.round(h)} ${Math.round(h) === 1 ? "hour" : "hours"} ago`;
  const dd = Math.round(h / 24);
  return `${dd} ${dd === 1 ? "day" : "days"} ago`;
}

export function buildTrackingStory(d: TrackingData, googleError: (e: string | null) => string | null, now = new Date()): TrackingStory {
  const since = (iso: string | null) => (iso ? now.getTime() - Date.parse(iso) : Infinity);
  const today = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const when = (iso: string) => (today(iso) ? `today at ${time(iso)}` : `on ${day(iso)}`);
  const items: TrackItem[] = [];

  const w = d.website;
  items.push(!w.lastEventAt
    ? { key: "web", name: "Website visits", status: "off", sub: "Not set up", what: "Visits, pages and form steps from your website.", todo: "Add the tracking script to your website in Tracking sources.", href: "/marketing/tracking-sources" }
    : { key: "web", name: "Website visits", status: since(w.lastEventAt) < DAY ? "ok" : "bad", sub: `Last visit ${ago(w.lastEventAt, now)} · ${n(w.visits24h)} in the last 24 hours`, what: `The tracking script has sent ${n(w.events)} events${w.rejected ? `, ${n(w.rejected)} rejected` : " with none rejected"}.`, todo: since(w.lastEventAt) < DAY ? "Nothing to do." : "No visit for over a day: check the tracking script is still on the website.", href: "/marketing/tracking-sources" });
  if (d.lastWebsiteLeadAt) {
    const fresh = since(d.lastWebsiteLeadAt) < 3 * DAY;
    items.push({ key: "forms", name: "Website enquiries", status: fresh ? "ok" : "warn", sub: `Last enquiry ${when(d.lastWebsiteLeadAt)}`, what: `Website forms are reaching the CRM: ${n(d.webLeads30d)} in the last 30 days.`, todo: fresh ? "Nothing to do." : "No website enquiry for 3 days. Send a test from the website form to check it still arrives.", href: "/tracking/conversion-health" });
  }
  if (d.lastInstagramAt) {
    const fresh = since(d.lastInstagramAt) < 2 * DAY;
    items.push({ key: "ig", name: "Instagram messages", status: fresh ? "ok" : "warn", sub: `Last message ${when(d.lastInstagramAt)}`, what: "Instagram chats arrive in the Inbox as they happen.", todo: fresh ? "Nothing to do." : "No Instagram message for 2 days. If people say they messaged you, reconnect Instagram in Integrations.", href: "/settings/integrations" });
  }
  if (d.ga4) {
    const fresh = d.ga4.status !== "failed" && since(d.ga4.at) < 2 * DAY;
    items.push({ key: "ga4", name: "Google Analytics", status: fresh ? "ok" : "bad", sub: `${d.ga4.status === "failed" ? "Failed" : "Synced"} ${today(d.ga4.at) ? "today" : ago(d.ga4.at, now)}${d.ga4.dataTo ? ` · data to ${day(d.ga4.dataTo)}` : ""}`, what: "Visits, sources, pages and countries for the Website page.", todo: fresh ? "Nothing to do." : "Reconnect Google Analytics in Integrations.", href: "/settings/integrations" });
  }
  if (d.gsc) {
    const fresh = d.gsc.status !== "failed" && since(d.gsc.at) < 2 * DAY;
    items.push({ key: "gsc", name: "Search Console", status: fresh ? "ok" : "bad", sub: `${d.gsc.status === "failed" ? "Failed" : "Synced"} ${today(d.gsc.at) ? "today" : ago(d.gsc.at, now)}${d.gsc.dataTo ? ` · data to ${day(d.gsc.dataTo)}` : ""}`, what: "Google reports search data with a 2–3 day delay, so data a few days old is normal.", todo: fresh ? "Nothing to do." : "Reconnect Search Console in Integrations.", href: "/settings/integrations" });
  }
  if (d.lastWhatsAppAt) {
    const age = since(d.lastWhatsAppAt);
    items.push({ key: "wa", name: "WhatsApp", status: age < 3 * DAY ? "ok" : "warn", sub: `Last incoming message ${when(d.lastWhatsAppAt)}${age >= DAY ? ` · ${ago(d.lastWhatsAppAt, now)}` : ""}`, what: age < 3 * DAY ? "WhatsApp messages are arriving." : `WhatsApp is connected, but nobody has written in for ${ago(d.lastWhatsAppAt, now).replace(" ago", "")}.`, todo: age < 3 * DAY ? "Nothing to do." : "Probably just quiet, as most people start on Instagram. If customers say they messaged you on WhatsApp, reconnect it in Integrations.", href: "/settings/integrations" });
  }
  if (d.meta) {
    const failing = d.meta.status === "failed", stopped = !failing && since(d.meta.at) > 3 * DAY;
    items.push({ key: "meta", name: "Meta Ads", status: failing || stopped ? "bad" : "ok", sub: failing ? `Failing · last good sync ${d.meta.lastSuccessAt ? day(d.meta.lastSuccessAt) : "never"}` : stopped ? `No sync since ${day(d.meta.at)}` : `Synced ${ago(d.meta.at, now)}`, what: "Spend and clicks for Facebook and Instagram ads.", todo: failing || stopped ? "Reconnect Meta Ads in Integrations to restart the daily sync." : "Nothing to do.", href: "/settings/integrations" });
  }
  if (d.google) {
    const failing = d.google.status === "failed", stopped = !failing && since(d.google.at) > 3 * DAY;
    const why = googleError(d.google.error);
    items.push({ key: "gads", name: "Google Ads", status: failing || stopped ? "bad" : "ok", sub: failing ? `Refused every day · last good sync ${d.google.lastSuccessAt ? day(d.google.lastSuccessAt) : "never"}` : stopped ? `No sync since ${day(d.google.at)}` : `Synced ${ago(d.google.at, now)}`, what: why ?? "Spend and clicks for Google Ads.", todo: failing && why && /approved/.test(why) ? "Wait for, or chase, the Google Ads API approval. Nothing to change in the CRM." : failing || stopped ? "Reconnect Google Ads in Integrations." : "Nothing to do.", href: "/settings/integrations" });
  }

  const working = items.filter((i) => i.status === "ok");
  const broken = items.filter((i) => i.status === "bad" || i.status === "off");
  const quiet = items.filter((i) => i.status === "warn");
  const v = d.visits30d;
  const headline: Part[] = [
    { text: `${working.length} of ${items.length} connections are working${working.length ? `: ${working.map((i) => i.name).join(", ").replace(/, ([^,]*)$/, " and $1")} all sent data recently` : ""}.`, strong: true },
    { text: [broken.length ? ` ${broken.map((i) => i.name).join(" and ")} ${broken.length === 1 ? "is" : "are"} not working` : "", quiet.length ? `${broken.length ? "," : ""} ${quiet.map((i) => i.name).join(" and ")} ${quiet.length === 1 ? "has" : "have"} been quiet` : "", v.all >= 100 && v.tagged <= v.all * 0.05 ? `${broken.length || quiet.length ? ", and" : ""} almost no visit carries a campaign tag` : ""].join("") + (broken.length || quiet.length || v.all >= 100 ? "." : "") },
  ];

  const cards: PageRank[] = [];
  if (v.all >= 100) {
    cards.push({
      id: "tags", impact: `${n(v.tagged)} of ${n(v.all)} visits tagged`, title: "Tag links so visits show their campaign",
      bars: [
        { label: "Visits with a campaign tag", value: v.tagged, shown: n(v.tagged), tone: "brand" },
        { label: "Facebook/Instagram click IDs", value: v.metaClickIds, shown: n(v.metaClickIds), tone: "soft" },
        { label: "Google click IDs", value: v.googleClickIds, shown: n(v.googleClickIds), tone: "blue" },
      ],
      max: v.all,
      body: [{ text: `Only ${n(v.tagged)} visits carried a campaign tag in 30 days. ` }, { text: "Add UTM tags to your bio link, stories, newsletters and ads", strong: true }, { text: " so the Website and Ads pages can say which post or ad brought each visitor." }],
      actions: [{ label: "Open tracking details", href: "/tracking", primary: true }],
      basis: "Website visits, last 30 days",
    });
    cards.push({
      id: "matched", impact: `${n(v.withLead)} visits matched`, title: "Visits linked to an enquiry",
      bars: [{ label: "Visits matched to a person", value: v.withLead, shown: n(v.withLead), tone: "green" }],
      max: v.all,
      body: [{ text: "When someone fills in a form, their earlier visits are linked to their enquiry. That’s how the Website page knows which page each enquiry started on." }],
      actions: [{ label: "Data coverage", href: "/tracking/data-coverage" }],
      basis: "Website visits, last 30 days",
    });
  }
  if (d.unusedSources.length) {
    cards.push({
      id: "unused", impact: "Tidy-up", title: `${d.unusedSources.length === 1 ? "One website source has" : `${d.unusedSources.length} website sources have`} never sent anything`,
      bars: d.unusedSources.slice(0, 3).map((s) => ({ label: s.replace(/^Website:\s*/i, ""), value: 0, shown: "never used", tone: "amber" as const })),
      max: 1,
      body: [{ text: `${d.unusedSources.map((s) => s.replace(/^Website:\s*/i, "")).join(", ")} ${d.unusedSources.length === 1 ? "is" : "are"} set up but ${d.unusedSources.length === 1 ? "has" : "have"} never received a visit. If that site no longer exists, switch it off in Tracking sources.` }],
      actions: [{ label: "Open Tracking sources", href: "/marketing/tracking-sources", primary: true }],
      basis: "Tracking sources",
    });
  }
  return { headline, items, cards };
}
