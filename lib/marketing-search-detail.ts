// Marketing › Google search › "Searches and pages", "Content ideas" and "Site
// health and AI answers" (owner-approved prototype "Google search inner pages",
// 26 Nov 2026). Pure helpers over marketing_search_detail_v1. The page-name
// helper is passed in so this file stays free of app imports.

import type { PageKpi, PageRank, PageSignal, Part } from "@/lib/marketing-pages";

export type SearchDetail = {
  brandToken: string | null; views: number; clicks: number; viewsBefore: number; clicksBefore: number;
  queryClicks: number; brandClicks: number; nonBrandViews: number; nonBrandPage1Views: number; dataTo: string | null;
  pageQueries: Array<{ path: string; query: string; views: number; clicks: number; position: number | null }>;
  courses: Array<{ name: string; next: string | null }>; places: string[];
  crawl: null | {
    at: string; fetched: number; discovered: number; host: string | null; known: number;
    pages: Array<{ path: string; status: number | null; ms: number | null; title: string | null; titleLength: number; descLength: number; descShared: number; h1: number; words: number | null; indexable: boolean | null; reason: string | null }>;
  };
  sites: Array<{ host: string; active: boolean }>; webHost: string | null;
  ai: Array<{ at: string; question: string; provider: string; host: string | null; mentioned: boolean | null; recommended: boolean | null; others: string[] }>;
  aiVisits: number; aiEnquiries: number; googleEnquiries: number;
};
export type TopicRow = {
  key: string; label: string; views: number; clicks: number; position: number; homeShare: number; topPage: string; topPageLabel: string;
  searches: Array<{ query: string; views: number; clicks: number; position: number; page: string }>;
};
export type NearRow = { query: string; page: string; pageLabel: string; views: number; clicks: number; position: number; wrongPage: boolean };
export type SearchesStory = { headline: Part[]; ranks: PageRank[]; kpis: PageKpi[]; topics: TopicRow[]; near: NearRow[]; signals: PageSignal[] };
export type Idea = { key: string; title: string; meta: string; why: string; outline: string; searches: string[] };
export type IdeasStory = { headline: Part[]; ideas: Idea[] };
export type FixRow = { path: string; label: string; problem: string; now: string; fix: string; severity: "high" | "medium" };
export type HealthStory = {
  headline: Part[]; ranks: PageRank[]; fixes: FixRow[]; signals: PageSignal[];
  crawl: { at: string | null; fetched: number; known: number; host: string | null; stale: boolean };
  ai: SearchDetail["ai"]; aiVisits: number; aiEnquiries: number; siteNote: string | null;
};

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const lc = (x: string) => x[0].toLowerCase() + x.slice(1);
const plural = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);
export const dayShort = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const isHome = (p: string) => p === "" || p === "/" || /^\/index\.(php|html?)$/.test(p);
const host = (h: string | null | undefined) => (h ?? "").toLowerCase().replace(/^www\./, "");

export function isSearchDetail(v: unknown): v is SearchDetail {
  const d = v as SearchDetail | null;
  return Boolean(d && Array.isArray(d.pageQueries) && typeof d.views !== "undefined" && Array.isArray(d.ai));
}

/* ---------------- Topics ---------------- */

const STOP = new Set(["yoga", "teacher", "training", "ttc", "ytt", "course", "courses", "and", "hour", "hours", "the", "online", "level", "master", "in", "of", "for", "certification", "postnatal", "meditation"]);
const NICE: Record<string, string> = { face: "Face yoga", prenatal: "Prenatal and pregnancy", sound: "Sound healing", healing: "Sound healing", kids: "Kids yoga", ayurveda: "Ayurveda", retreat: "Retreats", tantra: "Tantra and kundalini", kundalini: "Tantra and kundalini", nutrition: "Nutrition" };
const SYN: Record<string, string> = { prenatal: "prenatal|pregnan|postnatal", sound: "sound|healing", healing: "sound|healing", kids: "kids|children", bengaluru: "bengaluru|bangalore", kundalini: "kundalini|tantra", tantra: "kundalini|tantra" };
type Rule = { key: string; label: string; re: RegExp };

export function topicRules(d: Pick<SearchDetail, "courses" | "places">): Rule[] {
  const rules: Rule[] = [];
  const seen = new Set<string>();
  for (const c of d.courses) {
    for (const w of c.name.toLowerCase().replace(/&/g, " ").split(/[^a-z]+/)) {
      if (!w || w.length < 3 || STOP.has(w)) continue;
      const label = NICE[w] ?? w[0].toUpperCase() + w.slice(1);
      if (seen.has(label)) continue;
      seen.add(label);
      rules.push({ key: `c-${w}`, label, re: new RegExp(`\\b(${SYN[w] ?? w})`) });
    }
  }
  for (const p of d.places) {
    const w = p.toLowerCase().split(/[^a-z]+/).find(Boolean);
    if (!w || w === "online" || seen.has(w)) continue;
    seen.add(w);
    rules.push({ key: `p-${w}`, label: w === "bengaluru" ? "Bengaluru" : w[0].toUpperCase() + w.slice(1), re: new RegExp(`\\b(${SYN[w] ?? w})`) });
  }
  rules.push({ key: "india", label: "Teacher training in India", re: /\bindia\b/ });
  rules.push({ key: "online", label: "Online courses", re: /\bonline\b/ });
  rules.push({ key: "near", label: "Classes near me", re: /near me|\bclasses?\b/ });
  rules.push({ key: "general", label: "Teacher training (general)", re: /teacher|ttc|instructor|certif|course|training/ });
  return rules;
}

export function buildTopics(d: SearchDetail, pageLabel: (p: string) => string): TopicRow[] {
  const rules = topicRules(d);
  const map = new Map<string, { rule: Rule; rows: SearchDetail["pageQueries"] }>();
  for (const r of d.pageQueries) {
    const rule = rules.find((x) => x.re.test(r.query)) ?? { key: "other", label: "Other searches", re: /./ };
    const t = map.get(rule.key) ?? { rule, rows: [] };
    t.rows.push(r);
    map.set(rule.key, t);
  }
  return [...map.values()].map(({ rule, rows }) => {
    const views = sum(rows, (r) => Number(r.views)), clicks = sum(rows, (r) => Number(r.clicks));
    const position = views ? Math.round((sum(rows, (r) => Number(r.views) * Number(r.position ?? 0)) / views) * 10) / 10 : 0;
    const homeViews = sum(rows.filter((r) => isHome(r.path)), (r) => Number(r.views));
    const byPage = new Map<string, number>();
    for (const r of rows) byPage.set(r.path, (byPage.get(r.path) ?? 0) + Number(r.views));
    const topPage = [...byPage.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "/";
    const byQuery = new Map<string, { query: string; views: number; clicks: number; wpos: number; page: string; pageViews: number }>();
    for (const r of rows) {
      const q = byQuery.get(r.query) ?? { query: r.query, views: 0, clicks: 0, wpos: 0, page: r.path, pageViews: 0 };
      q.views += Number(r.views); q.clicks += Number(r.clicks); q.wpos += Number(r.views) * Number(r.position ?? 0);
      if (Number(r.views) > q.pageViews) { q.page = r.path; q.pageViews = Number(r.views); }
      byQuery.set(r.query, q);
    }
    const searches = [...byQuery.values()].sort((a, b) => b.views - a.views).slice(0, 6)
      .map((q) => ({ query: q.query, views: q.views, clicks: q.clicks, position: q.views ? Math.round((q.wpos / q.views) * 10) / 10 : 0, page: q.page }));
    return { key: rule.key, label: rule.label, views, clicks, position, homeShare: pct(homeViews, views), topPage, topPageLabel: isHome(topPage) ? "Home page" : pageLabel(topPage), searches };
  }).filter((t) => t.views >= 50).sort((a, b) => b.views - a.views);
}

/* ---------------- Searches and pages ---------------- */

export function buildSearchesStory(d: SearchDetail, pageLabel: (p: string) => string): SearchesStory {
  const topics = buildTopics(d, pageLabel);
  const brandShare = pct(Number(d.brandClicks), Number(d.queryClicks));
  const page1 = pct(Number(d.nonBrandPage1Views), Number(d.nonBrandViews));
  const homeHeavy = topics.filter((t) => t.homeShare >= 50 && t.views >= 300);
  const headline: Part[] = [
    { text: `Google showed you ${n(d.views)} times in the last 30 days and ${n(d.clicks)} people clicked.${d.queryClicks >= 50 ? ` Where Google shares the search, ${brandShare >= 60 ? "2 in 3" : brandShare >= 45 ? "half the" : `${brandShare}% of`} clicks came from people searching your name.` : ""}`, strong: true },
    { text: ` For other searches only ${page1 >= 45 ? "half" : page1 >= 30 ? "a third" : `${page1}%`} of your views are on page one${homeHeavy.length ? ", and Google often shows your Home page instead of the course page" : ""}.` },
  ];

  // Searches where the Home page and a course page both show up.
  const byQuery = new Map<string, SearchDetail["pageQueries"]>();
  for (const r of d.pageQueries) byQuery.set(r.query, [...(byQuery.get(r.query) ?? []), r]);
  const rules = topicRules(d);
  const ruleOf = (q: string) => rules.find((x) => x.re.test(q));
  const pathText = (p: string) => p.toLowerCase().replace(/[-_/.]/g, " ");
  const clash = [...byQuery.entries()].map(([query, rows]) => {
    const home = rows.find((r) => isHome(r.path));
    const rule = ruleOf(query);
    const course = rows.filter((r) => !isHome(r.path) && /\/course/.test(r.path) && (!rule || !/^[cp]-/.test(rule.key) || rule.re.test(pathText(r.path)))).sort((a, b) => Number(b.views) - Number(a.views))[0];
    return home && course && Number(home.views) >= 80 && Number(home.position ?? 99) <= 12 ? { query, home, course } : null;
  }).filter((x): x is NonNullable<typeof x> => Boolean(x)).sort((a, b) => Number(b.home.views) - Number(a.home.views))[0];

  const near: NearRow[] = [...byQuery.entries()].map(([query, rows]) => {
    const views = sum(rows, (r) => Number(r.views)), clicks = sum(rows, (r) => Number(r.clicks));
    const top = [...rows].sort((a, b) => Number(b.views) - Number(a.views))[0];
    const position = views ? Math.round((sum(rows, (r) => Number(r.views) * Number(r.position ?? 0)) / views) * 10) / 10 : 0;
    const rule = ruleOf(query);
    const wrongPage = isHome(top.path) || Boolean(rule && /^[cp]-/.test(rule.key) && !rule.re.test(pathText(top.path)));
    return { query, page: top.path, pageLabel: isHome(top.path) ? "Home page" : pageLabel(top.path), views, clicks, position, wrongPage };
  }).filter((r) => r.views >= 50 && r.position >= 3 && r.position <= 12 && r.clicks / r.views < 0.03).sort((a, b) => b.views - a.views).slice(0, 10);

  const ranks: PageRank[] = [];
  if (clash) {
    ranks.push({ id: "home", impact: `${n(Number(clash.home.views))} views on the Home page · ${n(Number(clash.course.views))} on the course page`,
      title: "Make course pages the answer, not the Home page",
      bars: [{ label: "Home page", value: Number(clash.home.views), shown: `#${clash.home.position} · ${n(Number(clash.home.views))} views`, tone: "amber" }, { label: pageLabel(clash.course.path), value: Number(clash.course.views), shown: `#${clash.course.position} · ${n(Number(clash.course.views))} views`, tone: "brand" }],
      body: [{ text: `For “${clash.query}” Google shows your Home page at #${clash.home.position} (${n(Number(clash.home.views))} views, ${n(Number(clash.home.clicks))} clicks) and the course page at #${clash.course.position}. ` }, { text: "Link the course page clearly from the Home page and give each course page its own title.", strong: true }],
      actions: [{ label: "See the searches", href: "#topics", primary: true }], basis: "Search Console, last 30 days" });
  }
  const best = near.find((r) => r.views >= 150);
  if (best) {
    ranks.push({ id: "near", impact: `${n(best.views)} views · ${n(best.clicks)} clicks · position ${best.position}`, title: `Win clicks for “${best.query}”`,
      bars: [{ label: "Views", value: best.views, shown: n(best.views), tone: "soft" }, { label: "Clicks", value: best.clicks, shown: n(best.clicks), tone: "brand" }],
      body: [{ text: `You’re at #${best.position}, seen ${n(best.views)} times, clicked ${n(best.clicks)} times. ` }, { text: `The ${best.pageLabel === "Home page" ? "Home page" : "page"} title doesn’t match what people are searching for.`, strong: true }],
      actions: [{ label: "See searches you almost win", href: "#near", primary: !ranks.length }], basis: "Search Console, last 30 days" });
  }
  const star = [...topics].filter((t) => t.views >= 200 && t.key !== "other").sort((a, b) => b.clicks / b.views - a.clicks / a.views)[0];
  if (star && star.clicks / star.views >= 0.03) {
    ranks.push({ id: "star", impact: "Best topic on Google", title: `Copy what works for ${lc(star.label)}`,
      bars: [{ label: "Views", value: star.views, shown: n(star.views), tone: "soft" }, { label: "Clicks", value: star.clicks, shown: n(star.clicks), tone: "green" }],
      body: [{ text: `${star.label} searches: position ${Math.round(star.position)}, ${n(star.clicks)} clicks from ${n(star.views)} views (${pct(star.clicks, star.views)} in 100). ` }, { text: "Its page title and description say exactly what the search asks.", strong: true }],
      actions: [{ label: "See the topic", href: "#topics", primary: !ranks.length }], basis: "Search Console, last 30 days" });
  }

  const kpis: PageKpi[] = [
    { label: "Views on Google", value: n(d.views), sub: `last 30 days · ${n(d.viewsBefore)} the month before` },
    { label: "Clicks", value: n(d.clicks), sub: `${d.views ? (Math.round((d.clicks / d.views) * 1000) / 10).toLocaleString("en-IN") : 0} per 100 views` },
    { label: "Searching your name", value: `${brandShare}%`, sub: "of clicks where Google shares the search" },
    { label: "Other searches on page 1", value: `${page1}%`, sub: "of their views (position 10 or better)" },
  ];

  const signals: PageSignal[] = [];
  const places = new Set([...d.places.map((p) => p.toLowerCase().split(/[^a-z]+/)[0]), "india", "online", "bangalore"]);
  const elsewhere = [...byQuery.entries()].map(([query, rows]) => {
    const m = /\bin ([a-z]+)$/.exec(query);
    const views = sum(rows, (r) => Number(r.views));
    const position = views ? sum(rows, (r) => Number(r.views) * Number(r.position ?? 0)) / views : 99;
    return m && !places.has(m[1]) && views >= 30 && position <= 10 ? { query, place: m[1], views, position: Math.round(position * 10) / 10 } : null;
  }).filter((x): x is NonNullable<typeof x> => Boolean(x)).sort((a, b) => b.views - a.views)[0];
  const wrong = near.find((r) => r.wrongPage && !isHome(r.page));
  if (wrong) signals.push({ id: "wrong", tag: "Noticed", tone: "teal", title: `“${wrong.query}” lands on ${wrong.pageLabel}`, summary: `${n(wrong.views)} views at #${wrong.position}, ${n(wrong.clicks)} clicks. Google shows a page that isn’t about this search.`, detail: "Mention the search in the right page’s title and link to it from the page Google shows now." });
  if (elsewhere) signals.push({ id: "place", tag: "Check", tone: "amber", title: `You show up for “${elsewhere.query}” (#${elsewhere.position})`, summary: `There’s no course in ${elsewhere.place[0].toUpperCase()}${elsewhere.place.slice(1)}, so these ${n(elsewhere.views)} views can’t become students.`, detail: "Nothing to fix unless you plan online batches aimed there." });
  if (d.queryClicks < d.clicks) signals.push({ id: "hidden", tag: "Note", tone: "muted", title: `Google shares the search for ${pct(d.queryClicks, d.clicks) >= 45 && pct(d.queryClicks, d.clicks) <= 55 ? "about half" : `${pct(d.queryClicks, d.clicks)}%`} of clicks`, summary: `${n(d.clicks)} clicks in total; for ${n(d.queryClicks)} of them Google says what was searched.`, detail: "The rest are hidden by Google for privacy; they follow the same pattern." });
  return { headline, ranks, kpis, topics, near, signals };
}

/* ---------------- Content ideas ---------------- */

export function buildIdeasStory(d: SearchDetail, pageLabel: (p: string) => string, orgName: string): IdeasStory {
  const topics = buildTopics(d, pageLabel);
  const dates = (re: RegExp) => d.courses.filter((c) => re.test(c.name.toLowerCase()) && c.next).map((c) => `${c.name} (${dayShort(c.next!)})`).slice(0, 4);
  const ideas: Idea[] = [];
  for (const t of topics) {
    if (t.key === "other" || t.views < 300) continue;
    const ctr = t.clicks / Math.max(t.views, 1);
    const weak = t.homeShare >= 50 || t.position > 20;
    if (!weak || ctr >= 0.02) continue;
    const meta = `${n(t.views)} views · ${n(t.clicks)} clicks · position ~${Math.round(t.position)} · ${n(t.searches.length)}+ searches`;
    const top = t.searches.slice(0, 5).map((s) => s.query);
    if (t.key === "india" || t.key === "general") {
      const placeNames = d.places.filter((p) => !/online/i.test(p)).map((p) => p.split(/\s*-\s*/)[0]);
      ideas.push({ key: t.key, title: t.key === "india" ? "A guide page: yoga teacher training in India" : "A page that answers “yoga teacher training course”", meta,
        why: `Google shows ${t.homeShare >= 50 ? `your Home page for ${t.homeShare}% of these` : "no single page for these"}. A guide comparing ${placeNames.join(", ")}${d.places.some((p) => /online/i.test(p)) ? " and online" : ""}, with dates, fees and how to choose, would answer them directly.`,
        outline: `Title: ${t.key === "india" ? "Yoga Teacher Training in India" : "Yoga Teacher Training Courses"}: ${placeNames.slice(0, 3).join(", ")}${d.places.some((p) => /online/i.test(p)) ? " or Online" : ""} | ${orgName}\nSections: How to choose · 200, 300 and 500-hour courses · ${placeNames.slice(0, 2).join(" vs ")} · Online option · Next dates · Fees · FAQ (certification, food, stay)`,
        searches: top });
    } else if (t.key === "online") {
      const list = dates(/online/);
      ideas.push({ key: t.key, title: "A page for all online courses", meta,
        why: `Google shows ${t.homeShare >= 50 ? `your Home page for ${t.homeShare}% of these` : "several pages for these"}. One page listing every online course with its next date would match them.`,
        outline: `Title: Online Yoga Courses with Certification | ${orgName}\nSections: ${list.length ? list.join(" · ") : "Every online course"} · How live classes work · Next dates · FAQ`, searches: top });
    } else if (t.key.startsWith("p-")) {
      ideas.push({ key: t.key, title: `A ${t.label} page that answers “yoga in ${t.label}”`, meta,
        why: `${t.label} searches bring ${n(t.clicks)} clicks${t.homeShare >= 50 ? ` and Google shows the Home page for ${t.homeShare}% of them` : ""}. One ${t.label} page with all its courses, the place and the stay would give Google one clear answer.`,
        outline: `Title: Yoga Teacher Training in ${t.label} | ${orgName}\nSections: Courses in ${t.label} · The place and stay · A day here · Next dates · How to reach · FAQ`, searches: top });
    } else if (t.key === "near") {
      ideas.push({ key: t.key, title: "Point “classes near me” searches at your classes pages", meta,
        why: "People searching for classes land on teacher-training or Home pages. Clear titles on your classes pages would catch them.", outline: `Title: Yoga Classes in ${d.places.find((p) => !/online/i.test(p))?.split(/\s*-\s*/)[0] ?? "Your City"} and Online | ${orgName}\nAdd: timetable, trial class, location map, price per month`, searches: top });
    } else {
      ideas.push({ key: t.key, title: `Make the ${lc(t.label)} page the answer`, meta,
        why: `${t.label} searches are on page ${t.position <= 20 ? 2 : 3} or later. A clearer title and a FAQ on the course page would lift them.`, outline: `Title: ${t.label} Teacher Training | ${orgName}\nAdd: next dates near the top, what you learn, who it’s for, FAQ`, searches: top });
    }
  }
  const first = ideas[0];
  const ft = first ? topics.find((t) => t.key === first.key) : undefined;
  const headline: Part[] = first && ft
    ? [{ text: `The biggest gap is “${lc(ft.label)}”: ${n(ft.views)} views in 30 days, ${plural(ft.clicks, "click")}${ft.homeShare >= 50 ? `, and Google shows your Home page at around position ${Math.round(ft.position)}` : `, at around position ${Math.round(ft.position)}`}.`, strong: true },
       { text: ideas.length > 1 ? ` ${ideas.length - 1} more ${ideas.length === 2 ? "idea" : "ideas"} below, each with an outline and the searches it would target.` : "" }]
    : [{ text: "No big gaps right now: the topics people search for already have a page that ranks.", strong: true }];
  return { headline, ideas: ideas.slice(0, 6) };
}

/* ---------------- Site health and AI answers ---------------- */

export function buildHealthStory(d: SearchDetail, pageLabel: (p: string) => string, orgName: string, now = Date.now()): HealthStory {
  const c = d.crawl;
  const label = (p: string) => (isHome(p) ? "Home page" : pageLabel(p));
  const fixes: FixRow[] = [];
  for (const p of c?.pages ?? []) {
    const l = label(p.path);
    if (p.status != null && p.status >= 400) fixes.push({ path: p.path, label: l, problem: "Page doesn’t open", now: `error ${p.status}`, fix: "Fix the link or redirect it to the right page", severity: "high" });
    else if (p.indexable === false && p.status != null && p.status < 300) fixes.push({ path: p.path, label: l, problem: "Hidden from Google", now: p.reason === "noindex" ? "noindex" : p.reason ?? "not indexable", fix: "Remove the noindex tag", severity: "high" });
    if (p.titleLength > 0 && p.titleLength < 25) fixes.push({ path: p.path, label: l, problem: "Title too short", now: `${p.titleLength} characters`, fix: `Say what and where, e.g. “${(p.title ?? l).replace(/\s+/g, " ").trim()} | ${orgName}”`, severity: "medium" });
    else if (p.titleLength > 65) fixes.push({ path: p.path, label: l, problem: "Title too long", now: `${p.titleLength} characters`, fix: "Keep it under 60 characters so Google shows it in full", severity: "medium" });
    if (p.descLength === 0) fixes.push({ path: p.path, label: l, problem: "No description", now: "missing", fix: "Add a one-line description of the page", severity: "medium" });
    else if (p.descShared >= 2) fixes.push({ path: p.path, label: l, problem: "Same description as other pages", now: `shared with ${p.descShared}`, fix: "Write a description for this page", severity: "medium" });
    if (p.h1 === 0) fixes.push({ path: p.path, label: l, problem: "No main heading", now: "no H1", fix: "Add one main heading", severity: "medium" });
    if ((p.ms ?? 0) > 2000) fixes.push({ path: p.path, label: l, problem: "Slow to load", now: `${((p.ms ?? 0) / 1000).toFixed(1)} s`, fix: "Compress images on this page", severity: "medium" });
  }
  fixes.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));

  const stale = !c || now - Date.parse(c.at) > 21 * 86_400_000;
  const known = c ? Math.max(Number(c.known), Number(c.discovered)) : 0;
  const shortTitles = fixes.filter((f) => f.problem === "Title too short");
  const hidden = fixes.find((f) => f.problem === "Hidden from Google");
  const ai = d.ai ?? [];
  const lastAi = ai[0];
  const web = host(d.webHost);
  const aiWrongHost = lastAi && web && host(lastAi.host) && host(lastAi.host) !== web ? lastAi.host : null;
  const activeHosts = d.sites.filter((s) => s.active).map((s) => s.host.toLowerCase());
  const siteNote = d.webHost && !activeHosts.includes(d.webHost.toLowerCase())
    ? `Your website runs at ${d.webHost}, but the site saved for checks is ${activeHosts.join(" and ") || "not set"}. A new check needs ${d.webHost} saved as the website.`
    : null;

  const headline: Part[] = [];
  if (c) {
    headline.push({ text: `The last site check ran on ${dayShort(c.at)} and looked at ${n(c.fetched)} of ${n(known)} pages.`, strong: true });
    const found = [hidden ? `${hidden.label === "Home page" ? "the Home page" : `the ${hidden.label} page`} hidden from Google` : "", shortTitles.length ? `${n(shortTitles.length)} ${shortTitles.length === 1 ? "page" : "pages"} with titles too short to say what they are` : ""].filter(Boolean);
    if (found.length) headline.push({ text: ` It found ${found.join(", and ")}.`, strong: true });
  } else headline.push({ text: "The site hasn’t been checked yet.", strong: true });
  if (lastAi) headline.push({ text: ` AI answers were checked ${ai.length === 1 ? "once" : `${n(ai.length)} times`}, last on ${dayShort(lastAi.at)}, and ${orgName} was ${lastAi.mentioned ? "mentioned" : "not mentioned"}${aiWrongHost ? `; that check also used ${aiWrongHost} instead of ${d.webHost}` : ""}.` });
  else headline.push({ text: " AI answers haven’t been checked yet." });

  const ranks: PageRank[] = [];
  if (hidden) ranks.push({ id: "hidden", impact: `Found in the ${c ? dayShort(c.at) : ""} check`, title: `Let Google see ${hidden.label === "Home page" ? "the Home page" : `the ${hidden.label} page`}`,
    bars: [{ label: "Pages hidden from Google", value: fixes.filter((f) => f.problem === "Hidden from Google").length, shown: n(fixes.filter((f) => f.problem === "Hidden from Google").length), tone: "red" }],
    body: [{ text: `${hidden.path} is marked as hidden from Google (“${hidden.now}”), so it can’t appear in search. ` }, { text: "Ask the web developer to remove the tag.", strong: true }],
    actions: [{ label: "See the pages to fix", href: "#fixes", primary: true }], basis: "Site check" });
  if (shortTitles.length) ranks.push({ id: "titles", impact: `${n(shortTitles.length)} of ${n(c?.pages.length ?? 0)} pages checked`, title: `Give ${n(shortTitles.length)} ${shortTitles.length === 1 ? "page a proper title" : "pages proper titles"}`,
    bars: shortTitles.slice(0, 4).map((f) => ({ label: f.label, value: Number(f.now.split(" ")[0]), shown: f.now, tone: "amber" as const })), max: 60,
    body: [{ text: `${shortTitles.slice(0, 5).map((f) => `${f.label} (${f.now.split(" ")[0]})`).join(", ")}. ` }, { text: "Titles of 50–60 characters say what the page is and where.", strong: true }],
    actions: [{ label: "See the titles", href: "#fixes", primary: !ranks.length }], basis: "Site check" });
  if (lastAi && (aiWrongHost || !lastAi.mentioned)) ranks.push({ id: "ai", impact: `${n(ai.length)} ${ai.length === 1 ? "check" : "checks"} · last ${dayShort(lastAi.at)}`, title: aiWrongHost ? "Fix the AI answers check" : `Get ${orgName} into AI answers`,
    bars: [{ label: "Visits from AI assistants", value: Number(d.aiVisits), shown: n(Number(d.aiVisits)), tone: "teal" }, { label: "Enquiries from them", value: Number(d.aiEnquiries), shown: n(Number(d.aiEnquiries)), tone: "brand" }],
    body: [{ text: aiWrongHost ? `It asked about ${aiWrongHost} instead of ${d.webHost}. ` : `${orgName} wasn’t in the answer to “${lastAi.question}”. ` }, { text: "Check 5 course questions every week and keep the course pages’ facts clear.", strong: true }],
    actions: [{ label: "See what AI said", href: "#ai", primary: !ranks.length }], basis: "AI answer checks" });

  const signals: PageSignal[] = [];
  if (siteNote) signals.push({ id: "site", tag: "Fix", tone: "red", title: stale ? "The site check is out of date and can’t run yet" : "The saved website address doesn’t match your site", summary: siteNote, detail: `Once ${d.webHost} is saved as the website, a full check of every page can run.` });
  else if (stale && c) signals.push({ id: "stale", tag: "Check", tone: "amber", title: "The site check is out of date", summary: `Last run ${dayShort(c.at)}, ${n(c.fetched)} of ${n(known)} pages.`, detail: "Run a full check so every page is covered." });
  return { headline, ranks, fixes, signals, crawl: { at: c?.at ?? null, fetched: Number(c?.fetched ?? 0), known, host: c?.host ?? null, stale }, ai, aiVisits: Number(d.aiVisits), aiEnquiries: Number(d.aiEnquiries), siteNote };
}
