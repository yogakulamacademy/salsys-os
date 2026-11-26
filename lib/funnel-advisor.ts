// Funnel advisor (owner-approved prototype "Funnel advisor", 26 Nov 2026).
// Pure helpers over marketing_funnel_measure_v1: measure any funnel the team
// defines (including SEO funnels: search terms + landing pages), find its
// weakest step, and turn the organisation's own numbers into suggestions with
// drafts. Nothing here sends or publishes anything.

export type StepKey =
  | "search_views" | "search_clicks" | "page_visits" | "form_fills" | "link_clicks"
  | "enq_any" | "enq_instagram" | "enq_whatsapp" | "enq_website" | "enq_google" | "enq_ai"
  | "replied" | "qualified" | "paid";
type Cls = "instagram" | "whatsapp" | "website_search" | "website_ai" | "website_other" | "other";

export type MeasureData = {
  from: string; to: string;
  people: Array<{ course: string | null; cls: Cls; replied: boolean; qualified: boolean; paid: boolean; n: number }>;
  pages: Array<{ path: string; visits: number; leads: number }>;
  searchPages: Array<{ path: string; views: number; clicks: number; position: number | null }>;
  searchTerms: Array<{ query: string; views: number; clicks: number; position: number | null }>;
  mediums: Array<{ source: string; medium: string; visits: number }>;
  courses: Array<{ id: string; name: string; next: string | null; places: string[] }>;
  switches: Array<{ asked: string; bought: string; n: number }>;
};
export type FunnelDef = {
  id?: string; kind: "general" | "seo"; name: string; courseId: string | null; goal: string | null;
  steps: StepKey[]; pages: string[]; terms: string[]; status: "draft" | "live" | "archived";
};
export type MeasuredStep = { key: StepKey; label: string; value: number | null; unit: "people" | "visits" | "views"; note: string; rate: number | null; adds: boolean };
export type MeasuredFunnel = { steps: MeasuredStep[]; weakest: number | null; fix: string | null; pages: string[]; days: number };

export const STEP_INFO: Record<StepKey, { label: string; unit: MeasuredStep["unit"]; hint: string }> = {
  search_views: { label: "Saw you on Google", unit: "views", hint: "Search Console views for the funnel’s search terms or pages" },
  search_clicks: { label: "Clicked through from Google", unit: "views", hint: "Search Console clicks" },
  page_visits: { label: "Visited the course pages", unit: "visits", hint: "Google Analytics visits that started on the funnel’s pages" },
  form_fills: { label: "Enquired from those pages", unit: "people", hint: "Enquiries whose website visit started on the funnel’s pages" },
  link_clicks: { label: "Clicked a tracked link", unit: "people", hint: "Not measured yet: use your go-links in replies and posts" },
  enq_any: { label: "Enquired (any channel)", unit: "people", hint: "Instagram, WhatsApp and website enquiries" },
  enq_instagram: { label: "Asked on Instagram", unit: "people", hint: "Enquiries that started in an Instagram chat" },
  enq_whatsapp: { label: "Asked on WhatsApp", unit: "people", hint: "Enquiries that started on WhatsApp" },
  enq_website: { label: "Enquired on the website", unit: "people", hint: "Website form enquiries from any source" },
  enq_google: { label: "Enquired after a Google search", unit: "people", hint: "Website enquiries that first came from Google or Bing" },
  enq_ai: { label: "Enquired after asking an AI", unit: "people", hint: "Website enquiries that first came from ChatGPT, Gemini or Perplexity" },
  replied: { label: "Got a reply from the team", unit: "people", hint: "Moved past New, or got a message from the team" },
  qualified: { label: "Reached Qualified", unit: "people", hint: "Qualified, High intent, Payment pending, or paid" },
  paid: { label: "Paid", unit: "people", hint: "Has an enrolment record" },
};
export const STEP_KEYS = Object.keys(STEP_INFO) as StepKey[];
const ENTRY: Partial<Record<StepKey, Cls[]>> = {
  enq_any: ["instagram", "whatsapp", "website_search", "website_ai", "website_other", "other"],
  enq_instagram: ["instagram"], enq_whatsapp: ["whatsapp"],
  enq_website: ["website_search", "website_ai", "website_other"], form_fills: ["website_search", "website_ai", "website_other"],
  enq_google: ["website_search"], enq_ai: ["website_ai"],
};

export const PRESETS: Array<{ key: string; title: string; summary: string; def: Omit<FunnelDef, "courseId" | "name"> & { name: string } }> = [
  { key: "seo", title: "SEO: Google search → page → enquiry → paid", summary: "Pick search terms and the pages they should land on.",
    def: { kind: "seo", name: "Google search → course page → paid", goal: null, steps: ["search_views", "search_clicks", "page_visits", "enq_google", "qualified", "paid"], pages: [], terms: [], status: "live" } },
  { key: "instagram", title: "Instagram chat → course page → paid", summary: "For courses that sell through Instagram messages.",
    def: { kind: "general", name: "Instagram → course page → paid", goal: null, steps: ["enq_instagram", "replied", "qualified", "paid"], pages: [], terms: [], status: "live" } },
  { key: "website", title: "Course page → enquiry → paid", summary: "How well a course page turns visits into payments.",
    def: { kind: "general", name: "Course page → enquiry → paid", goal: null, steps: ["page_visits", "form_fills", "replied", "qualified", "paid"], pages: [], terms: [], status: "live" } },
  { key: "followup", title: "Enquiry → Qualified → paid", summary: "Where the team’s follow-up loses people.",
    def: { kind: "general", name: "Enquiry → Qualified → paid", goal: null, steps: ["enq_any", "replied", "qualified", "paid"], pages: [], terms: [], status: "live" } },
];

const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);
const DAY = 86_400_000;
export const shortDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export function isMeasureData(v: unknown): v is MeasureData {
  const d = v as MeasureData | null;
  return Boolean(d && Array.isArray(d.people) && Array.isArray(d.pages) && Array.isArray(d.searchTerms) && Array.isArray(d.courses));
}

export function normalise(d: MeasureData): MeasureData {
  const num = (x: unknown) => Number(x ?? 0) || 0;
  return {
    ...d,
    people: d.people.map((p) => ({ ...p, n: num(p.n) })),
    pages: d.pages.map((p) => ({ path: p.path || "/", visits: num(p.visits), leads: num(p.leads) })),
    searchPages: d.searchPages.map((p) => ({ path: p.path || "/", views: num(p.views), clicks: num(p.clicks), position: p.position == null ? null : Number(p.position) })),
    searchTerms: d.searchTerms.map((q) => ({ query: q.query, views: num(q.views), clicks: num(q.clicks), position: q.position == null ? null : Number(q.position) })),
    mediums: (d.mediums ?? []).map((m) => ({ ...m, visits: num(m.visits) })),
    courses: d.courses.map((c) => ({ ...c, places: Array.isArray(c.places) ? c.places.filter(Boolean) : [] })),
    switches: (d.switches ?? []).map((s) => ({ ...s, n: num(s.n) })),
  };
}

export function days(d: MeasureData) {
  return Math.max(1, Math.round((Date.parse(d.to) - Date.parse(d.from)) / DAY));
}

const STOP = new Set(["yoga", "teacher", "training", "ttc", "ytt", "course", "courses", "and", "hour", "hours", "the", "online", "postnatal", "tantra", "meditation", "in", "of", "for", "certification"]);
/** Website pages that belong to a course, guessed from its name (the team can change them on a funnel). */
export function coursePages(courseName: string, paths: string[]): string[] {
  const name = courseName.toLowerCase();
  const online = /\bonline\b/.test(name);
  const words = name.replace(/&/g, " ").split(/[^a-z0-9]+/).filter(Boolean);
  const nums = words.filter((w) => /^\d+$/.test(w));
  const big = nums.filter((x) => Number(x) >= 100);
  const level = /level\s*(\d)/.exec(name)?.[1];
  const key = words.filter((w) => !/^\d+$/.test(w) && !STOP.has(w) && w !== "level");
  return paths.filter((raw) => {
    const p = raw.toLowerCase();
    if (!p.includes("/course")) return false;
    if (online !== /online/.test(p)) return false;
    if (big.some((x) => !p.includes(`${x}-hour`))) return false;
    if (level && !p.includes(`level-${level}`)) return false;
    if (!key.length && !big.length) return false;
    return key.every((w) => p.includes(w));
  });
}

function matchesPath(path: string, list: string[]) {
  const p = path.toLowerCase().replace(/\/$/, "");
  return list.some((x) => {
    const q = x.toLowerCase().replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "");
    return q.endsWith("*") ? p.startsWith(q.slice(0, -1)) : p === q;
  });
}

export function funnelPages(def: FunnelDef, d: MeasureData): string[] {
  if (def.pages.length) return def.pages;
  const course = d.courses.find((c) => c.id === def.courseId);
  return course ? coursePages(course.name, [...new Set([...d.pages.map((p) => p.path), ...d.searchPages.map((p) => p.path)])]) : [];
}

const FIX: Partial<Record<StepKey, string>> = {
  search_clicks: "Few people click when they see you on Google. Rewrite the page titles and descriptions for these searches so they say what the course is, where, and when.",
  page_visits: "Search clicks don’t all land on these pages. Link the right course page from the home page and from search titles.",
  form_fills: "Visitors don’t enquire. Put dates and the enquiry form near the top of the page, and add a WhatsApp button.",
  enq_google: "Google visitors don’t enquire. Put dates and the enquiry form near the top of the page.",
  replied: "Enquiries wait for a reply. Answer every new enquiry the same day; the untouched list on Stage by stage shows who is waiting.",
  qualified: "People reply once and stop. Send the course page with the next dates, and ask one question that shows how serious they are.",
  paid: "Qualified people don’t pay. Follow up personally before the batch with the start date and the early-bird cut-off.",
};

export function measureFunnel(def: FunnelDef, d: MeasureData): MeasuredFunnel {
  const pages = funnelPages(def, d);
  const people = d.people.filter((p) => (def.courseId ? p.course === def.courseId : p.course == null));
  const pageRows = d.pages.filter((p) => matchesPath(p.path, pages));
  const terms = def.terms.map((t) => t.toLowerCase().trim()).filter(Boolean);
  const search: Array<{ views: number; clicks: number }> = terms.length
    ? d.searchTerms.filter((q) => terms.some((t) => q.query.includes(t)))
    : d.searchPages.filter((p) => matchesPath(p.path, pages));
  let cohort: Cls[] = def.kind === "seo" ? ["website_search"] : (ENTRY.enq_any as Cls[]);
  const steps: MeasuredStep[] = [];
  def.steps.forEach((key, i) => {
    const info = STEP_INFO[key];
    if (ENTRY[key]) cohort = ENTRY[key] as Cls[];
    const inCohort = people.filter((p) => cohort.includes(p.cls));
    let value: number | null;
    switch (key) {
      case "search_views": value = sum(search, (s) => s.views); break;
      case "search_clicks": value = sum(search, (s) => s.clicks); break;
      case "page_visits": value = sum(pageRows, (p) => p.visits); break;
      case "form_fills": value = sum(pageRows, (p) => p.leads); break;
      case "link_clicks": value = null; break;
      case "replied": value = sum(inCohort.filter((p) => p.replied), (p) => p.n); break;
      case "qualified": value = sum(inCohort.filter((p) => p.qualified), (p) => p.n); break;
      case "paid": value = sum(inCohort.filter((p) => p.paid), (p) => p.n); break;
      default: value = sum(inCohort, (p) => p.n);
    }
    const prev = i ? steps[i - 1].value : null;
    const adds = prev != null && value != null && value > prev;
    const rate = prev != null && value != null && prev > 0 && !adds ? Math.round((value / prev) * 1000) / 10 : null;
    let note = info.hint;
    if ((key === "page_visits" || key === "form_fills" || (key.startsWith("search") && !terms.length)) && !pages.length) note = "Pick the funnel’s pages to measure this step";
    if (key.startsWith("search") && terms.length) note = `${n(search.length)} matching searches`;
    steps.push({ key, label: info.label, value, unit: info.unit, note, rate, adds });
  });
  let weakest: number | null = null;
  steps.forEach((s, i) => {
    if (!i || s.rate == null || (steps[i - 1].value ?? 0) < 10) return;
    if (weakest == null || s.rate < (steps[weakest].rate ?? Infinity)) weakest = i;
  });
  return { steps, weakest, fix: weakest != null ? FIX[steps[weakest].key] ?? null : null, pages, days: days(d) };
}

/** Before/after for a change on one step: the step’s rate in the same number of days before it started. */
export function compareChange(def: FunnelDef, step: StepKey, before: MeasureData, after: MeasureData) {
  const i = def.steps.indexOf(step);
  const b = measureFunnel(def, before).steps[i];
  const a = measureFunnel(def, after).steps[i];
  return { before: b?.rate ?? null, after: a?.rate ?? null, beforeValue: b?.value ?? null, afterValue: a?.value ?? null };
}

/* ---------------- Suggestions ---------------- */

export type Draft = { kind: string; text: string };
export type Suggestion = { id: string; type: "funnel" | "content" | "page" | "search"; title: string; body: string; why: string; draft: Draft };
export type CourseCard = {
  id: string; name: string; enquiries: number; instagram: number; website: number; qualified: number; paid: number;
  pageVisits: number; pageLeads: number; next: string | null; leak: string; suggestions: Suggestion[];
};
export type MediumRow = { label: string; visits: number; enquiries: number; paid: number; note: string };
export type Advisor = {
  days: number; headline: Array<{ text: string; strong?: boolean }>;
  top: Suggestion[]; courses: CourseCard[]; mediums: MediumRow[]; searches: Array<{ query: string; views: number; clicks: number; position: number }>;
};

const DRAFTS = {
  followup: (course: string, date: string) => ({ kind: "WhatsApp follow-up (the team sends it)", text: `Hi {first name}, it’s {your name} from {academy} 🙏\nThe next ${course} batch starts on ${date}. The early-bird price stays open until 24 hours before the start.\nShall I hold a place for you? Happy to answer anything first.` }),
  pageLink: (course: string, path: string) => ({ kind: "Reply in the chat", text: `Thank you for asking about ${course} 🌸\nEverything is on one page: the next dates, what you’ll learn and how to join:\n→ {your site}${path}\nTell me which date suits you and I’ll help with the next step.` }),
  page: () => ({ kind: "Page changes", text: "1. Next dates and the enquiry form near the top of the page\n2. A WhatsApp button that opens a chat with the course name filled in\n3. Two or three student reviews next to the form\n4. One clear next step at the end: “Ask about the next batch”" }),
  title: (query: string, course: string) => ({ kind: "Google title and description", text: `Title: ${query.replace(/\b\w/g, (c) => c.toUpperCase())} | {academy}\nDescription: ${course}. See the next dates, what you’ll learn and how to join. Ask a question on WhatsApp.` }),
  switch: (asked: string, bought: string) => ({ kind: "Reply and post idea", text: `In replies to people asking about ${asked}: “If travelling is hard right now, ${bought} covers the same teaching from home. The next batch starts soon.”\nPost: a short reel comparing the two, ending with “DM us which one suits you”.` }),
  noBatch: (place: string, places: string) => ({ kind: "Line for the page", text: `There’s no batch in ${place} right now. The next batches are in ${places}; see the dates and join from that page.` }),
};

function cls(d: MeasureData, course: string | null, f: (p: MeasureData["people"][number]) => boolean) {
  return sum(d.people.filter((p) => p.course === course && f(p)), (p) => p.n);
}

export function buildAdvisor(raw: MeasureData, today: string): Advisor {
  const d = normalise(raw);
  const span = days(d);
  const allPaths = [...new Set(d.pages.map((p) => p.path))];
  const top: Suggestion[] = [];
  const cards: CourseCard[] = [];
  const t0 = Date.parse(`${today}T00:00:00Z`);

  for (const c of d.courses) {
    const enquiries = cls(d, c.id, () => true);
    if (enquiries < 5) continue;
    const instagram = cls(d, c.id, (p) => p.cls === "instagram");
    const website = cls(d, c.id, (p) => p.cls.startsWith("website"));
    const qualified = cls(d, c.id, (p) => p.qualified);
    const paid = cls(d, c.id, (p) => p.paid);
    const replied = cls(d, c.id, (p) => p.replied);
    const pages = coursePages(c.name, allPaths);
    const rows = d.pages.filter((p) => pages.includes(p.path));
    const pageVisits = sum(rows, (r) => r.visits), pageLeads = sum(rows, (r) => r.leads);
    const sugs: Suggestion[] = [];
    const inDays = c.next ? Math.round((Date.parse(`${c.next}T00:00:00Z`) - t0) / DAY) : null;
    const waiting = qualified - paid;

    if (waiting >= 5 && inDays != null && inDays <= 30) {
      sugs.push({ id: `${c.id}-follow`, type: "funnel", title: `Follow up the ${n(waiting)} Qualified people before ${shortDay(c.next!)}`,
        body: "A short personal message with the start date and the early-bird cut-off. Fee or discount questions go to a person.",
        why: `${n(qualified)} reached Qualified · ${n(paid)} paid · next batch in ${n(inDays)} days.`, draft: DRAFTS.followup(c.name, shortDay(c.next!)) });
    }
    const best = [...rows].filter((r) => r.visits >= 15).sort((a, b) => b.leads / b.visits - a.leads / a.visits)[0];
    const worst = [...rows].filter((r) => r.visits >= 30 && r !== best).sort((a, b) => a.leads / a.visits - b.leads / b.visits)[0];
    if (best && best.leads >= 3 && instagram >= 20) {
      sugs.push({ id: `${c.id}-link`, type: "funnel", title: "Send chats to the course page that works best",
        body: "Reply with the course page link early in the chat instead of answering everything there.",
        why: `${best.path}: ${n(best.leads)} enquiries from ${n(best.visits)} visits (${pct(best.leads, best.visits)}%). Instagram: ${n(instagram)} enquiries.`, draft: DRAFTS.pageLink(c.name, best.path) });
    }
    if (best && worst && pct(best.leads, best.visits) >= 2 * Math.max(pct(worst.leads, worst.visits), 1)) {
      sugs.push({ id: `${c.id}-page`, type: "page", title: `Fix ${worst.path.split("/").pop()?.replace(/\.php$/, "").replace(/-/g, " ")}`,
        body: "It gets visits but few enquiries. Copy what the better page does: dates and the form near the top.",
        why: `${n(worst.leads)} enquiries from ${n(worst.visits)} visits, against ${pct(best.leads, best.visits)}% on ${best.path}.`, draft: DRAFTS.page() });
    }
    const places = c.places.filter((p) => !/online/i.test(p));
    if (places.length) {
      for (const r of rows) {
        const m = /\/courses\/([a-z]+)\//.exec(r.path.toLowerCase());
        const place = m?.[1];
        if (place && place !== "online" && r.visits >= 20 && !places.some((p) => p.toLowerCase().includes(place))) {
          sugs.push({ id: `${c.id}-nobatch-${place}`, type: "page", title: `The ${place[0].toUpperCase()}${place.slice(1)} page has no ${place[0].toUpperCase()}${place.slice(1)} batch`,
            body: `Point visitors to the upcoming dates in ${places.join(" and ")}.`,
            why: `${r.path}: ${n(r.visits)} visits, ${n(r.leads)} enquiries · upcoming batches: ${places.join(", ")}.`, draft: DRAFTS.noBatch(place, places.join(" and ")) });
          break;
        }
      }
    }
    const sw = d.switches.find((s) => s.asked === c.name && s.n >= 2);
    if (sw) {
      sugs.push({ id: `${c.id}-switch`, type: "content", title: `Offer ${sw.bought} to people asking about this course`,
        body: "Some people who ask about this course end up buying the other one. Mention it in replies and in a post.",
        why: `${n(sw.n)} people who asked about ${c.name} paid for ${sw.bought}.`, draft: DRAFTS.switch(c.name, sw.bought) });
    }
    const near = d.searchTerms.filter((q) => q.views >= 40 && (q.position ?? 0) >= 4 && (q.position ?? 99) <= 20 && pct(q.clicks, q.views) < 3
      && coursePages(c.name, [`/courses/${online(c.name)}/${q.query.replace(/\s+/g, "-")}`]).length > 0).sort((a, b) => b.views - a.views)[0];
    if (near) {
      sugs.push({ id: `${c.id}-search`, type: "search", title: `Win more clicks for “${near.query}”`,
        body: "You show up but few people click. A clearer title and description with dates and place usually wins more of them.",
        why: `${n(near.views)} views at position ${near.position} · ${n(near.clicks)} clicks in ${span} days.`, draft: DRAFTS.title(near.query, c.name) });
    }
    const leak = paid === 0 && qualified >= 5 ? `Biggest gap: Qualified → paid. ${n(qualified)} reached Qualified and nobody has paid yet.`
      : replied && pct(qualified, replied) < 20 ? `Biggest gap: chat → Qualified. Only ${pct(qualified, replied)}% of people who talked reached Qualified.`
      : pageVisits >= 30 && pct(pageLeads, pageVisits) < 3 ? `Biggest gap: page → enquiry. ${n(pageLeads)} enquiries from ${n(pageVisits)} page visits.`
      : `${n(paid)} paid from ${n(enquiries)} enquiries.`;
    cards.push({ id: c.id, name: c.name, enquiries, instagram, website, qualified, paid, pageVisits, pageLeads, next: c.next, leak, suggestions: sugs.slice(0, 4) });
  }
  cards.sort((a, b) => b.paid - a.paid || b.enquiries - a.enquiries);

  const follow = cards.flatMap((c) => c.suggestions.filter((s) => s.id.endsWith("-follow")).map((s) => ({ c, s })));
  if (follow.length) {
    const waiting = sum(follow, (f) => f.c.qualified - f.c.paid);
    top.push({ id: "follow", type: "funnel", title: `Follow up ${n(waiting)} Qualified people before their batches start`,
      body: follow.slice(0, 3).map((f) => `${f.c.name} (${n(f.c.qualified - f.c.paid)})`).join(", ") + " have people at Qualified and batches within 30 days.",
      why: follow.map((f) => `${f.c.name}: next batch ${shortDay(f.c.next!)}`).slice(0, 3).join(" · "), draft: follow[0].s.draft });
  }
  const sw = [...d.switches].sort((a, b) => b.n - a.n)[0];
  if (sw && sw.n >= 2) top.push({ id: "switch", type: "content", title: `Offer ${sw.bought} to people asking about ${sw.asked}`, body: `${n(sw.n)} people who asked about ${sw.asked} paid for ${sw.bought}.`, why: "Enrolments compared with what people first asked about.", draft: DRAFTS.switch(sw.asked, sw.bought) });
  const pageFix = cards.flatMap((c) => c.suggestions.filter((s) => s.type === "page"));
  if (pageFix.length) top.push({ ...pageFix[0], id: "pagefix", title: pageFix.length > 1 ? `Fix the ${n(pageFix.length)} pages that leak` : pageFix[0].title, body: pageFix.map((p) => p.title).slice(0, 3).join(" · ") });
  const searchFix = cards.flatMap((c) => c.suggestions.filter((s) => s.type === "search"));
  if (top.length < 3 && searchFix.length) top.push({ ...searchFix[0], id: "searchfix" });

  // Which medium works: website visits by medium (GA) and enquiries / payments by how people came.
  const vis = (f: (m: MeasureData["mediums"][number]) => boolean) => sum(d.mediums.filter(f), (m) => m.visits);
  const ppl = (k: Cls[], f: (p: MeasureData["people"][number]) => boolean = () => true) => sum(d.people.filter((p) => p.course == null && k.includes(p.cls) && f(p)), (p) => p.n);
  const mediums: MediumRow[] = [
    { label: "Google and Bing search", visits: vis((m) => m.medium === "organic"), enquiries: ppl(["website_search"]), paid: ppl(["website_search"], (p) => p.paid), note: "SEO: people who searched and clicked" },
    { label: "Typed the address / other links", visits: vis((m) => m.medium === "(none)" || m.medium === "referral" || m.medium === "(not set)"), enquiries: ppl(["website_other"]), paid: ppl(["website_other"], (p) => p.paid), note: "Often people who saw you somewhere else first" },
    { label: "Instagram", visits: vis((m) => /^(ig|instagram|l\.instagram\.com)$/.test(m.source)), enquiries: ppl(["instagram"]), paid: ppl(["instagram"], (p) => p.paid), note: "Visits from links; enquiries are Instagram chats" },
    { label: "ChatGPT and other AI", visits: vis((m) => m.medium === "ai-assistant" || /chatgpt|gemini|perplexity|claude/.test(m.source)), enquiries: ppl(["website_ai"]), paid: ppl(["website_ai"], (p) => p.paid), note: "People who asked an AI about courses" },
    { label: "WhatsApp", visits: 0, enquiries: ppl(["whatsapp"]), paid: ppl(["whatsapp"], (p) => p.paid), note: "Enquiries that started on WhatsApp" },
  ].filter((r) => r.visits || r.enquiries);

  const totalPaid = ppl(["instagram", "whatsapp", "website_search", "website_ai", "website_other", "other"], (p) => p.paid);
  const totalEnq = ppl(["instagram", "whatsapp", "website_search", "website_ai", "website_other", "other"]);
  const ig = ppl(["instagram"]);
  const bestCourse = cards[0];
  const headline = [
    bestCourse && bestCourse.paid ? { text: `${bestCourse.name} brings the most payments: ${n(bestCourse.paid)} of ${n(totalPaid)} in the last ${span} days.`, strong: true }
      : { text: `${n(totalEnq)} enquiries and ${n(totalPaid)} payments in the last ${span} days.`, strong: true },
    ...(totalEnq && ig / totalEnq > 0.6 ? [{ text: ` Instagram brings ${pct(ig, totalEnq)}% of enquiries, but most stop after the first chat; a course page with dates and a form turns visitors into enquiries far better.` }] : []),
    { text: " Below are the changes most likely to bring more payments, each with a draft." },
  ];
  const searches = d.searchTerms.filter((q) => q.views >= 40 && (q.position ?? 0) >= 4 && (q.position ?? 99) <= 20 && pct(q.clicks, q.views) < 3)
    .sort((a, b) => b.views - a.views).slice(0, 8).map((q) => ({ query: q.query, views: q.views, clicks: q.clicks, position: q.position ?? 0 }));
  return { days: span, headline, top: top.slice(0, 3), courses: cards.slice(0, 8), mediums, searches };
}

function online(name: string) {
  return /\bonline\b/i.test(name) ? "online" : "x";
}
