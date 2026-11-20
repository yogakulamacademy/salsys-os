// Interest profile for one person (lead intelligence plan, 20 Nov 2026).
// Pure: no I/O. Turns website events, sessions and messages into
//   * what they looked at (courses, prices, enrol / contact pages),
//   * how deeply (reading time, scroll, video, gallery, brochure, FAQ),
//   * what they asked (topics in their own messages),
//   * an Interest score 0-100 with the reasons that make it up.
// Adaptive: any event type it doesn't know yet still counts as activity
// ("other"), so new tracking shows up without a code change.

export type ProfileEvent = { name: string; at: string; props?: Record<string, unknown> | null };
export type ProfileSession = { startedAt: string; landingPage?: string | null; source?: string | null; country?: string | null };
export type ProfileMessage = { direction: "inbound" | "outbound"; at: string; body?: string | null };
export type CoursePage = { courseId: string; courseName: string; path: string };

export type TopicKey =
  | "fees" | "dates" | "register" | "payment" | "discount" | "accommodation"
  | "online_offline" | "location" | "certification" | "experience" | "food" | "visa";

export const TOPIC_LABELS: Record<TopicKey, string> = {
  fees: "Fees", dates: "Dates & batches", register: "How to register", payment: "Payment",
  discount: "Discount or scholarship", accommodation: "Stay", online_offline: "Online or in person",
  location: "Location", certification: "Certificate", experience: "Experience needed",
  food: "Food", visa: "Visa & travel",
};

const TOPIC_RULES: [TopicKey, RegExp][] = [
  ["discount", /discount|scholarship|offer|cheaper|reduce|concession|early ?bird|coupon/i],
  ["payment", /\bpay(ment|ing)?\b|paid|instal+ment|emi|upi|transfer|invoice|receipt/i],
  ["fees", /\bfees?\b|price|cost|charges?|how much|amount|rate|₹|\$|usd|inr/i],
  ["dates", /\bdates?\b|batch|when (is|does|will)|start(s|ing)?|schedule|next (course|month)|january|february|march|april|may|june|july|august|september|october|november|december/i],
  ["register", /register|registration|enrol|enroll|admission|sign ?up|apply|book (a|my)|seat/i],
  ["accommodation", /accommodation|stay|room|hostel|lodging|sharing|private room/i],
  ["online_offline", /online|offline|in person|on ?site|live class|zoom|recorded/i],
  ["location", /location|where is|address|mysore|kerala|goa|rishikesh|how to reach|airport/i],
  ["certification", /certif|yoga alliance|\bryt\b|accredit|diploma/i],
  ["experience", /beginner|experience|never done|first time|can i join|eligib|age limit/i],
  ["food", /food|meal|diet|vegetarian|vegan/i],
  ["visa", /visa|travel|flight|airport pickup/i],
];

export function topicsInText(text: string | null | undefined): TopicKey[] {
  const t = (text ?? "").slice(0, 2000);
  if (!t.trim()) return [];
  return TOPIC_RULES.filter(([, re]) => re.test(t)).map(([key]) => key);
}

/** Test or draft pages on the website, never shown as a course: "/courses/kerala/test.php". */
const TEST_PAGE = /(^|[\/_-])(test|testing|demo|staging|draft|sample)(\d*)(\.\w+)?$/i;

const HIGH_INTENT_PAGE = /enrol|enroll|apply|register|booking|book-now|checkout|payment|pay\b|fees?\b|price|pricing/i;
const CONTACT_PAGE = /contact|enquir|inquir/i;

function pathOf(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try { return new URL(value, "https://x.invalid").pathname.toLowerCase(); } catch { return null; }
}

/** Readable name for a course page we have no course record for: "/courses/mysore/100-hour-…php" → "100 hour yoga teacher training in mysore". */
export function pageLabel(path: string): string {
  const last = path.split("/").filter(Boolean).pop() ?? "";
  const words = last.replace(/\.(php|html?|aspx?)$/i, "").replace(/[-_]+/g, " ").trim();
  return words || "Home page";
}

function courseForPath(path: string, pages: CoursePage[]): CoursePage | null {
  const p = path.replace(/\/+$/, "");
  return pages.find((c) => c.path.replace(/\/+$/, "") === p) ?? null;
}

export type InterestReason = { text: string; points: number };

export type InterestProfile = {
  hasWebsiteData: boolean;
  hasMessages: boolean;
  visits: number;
  pagesViewed: number;
  readingMinutes: number;
  maxScrollPercent: number;
  priceViews: number;
  ctaClicks: Record<string, number>;
  brochure: number;
  faq: number;
  videoPlays: number;
  videoCompletes: number;
  galleryOpens: number;
  otherActivity: Record<string, number>;
  highIntentPages: number;
  contactPages: number;
  courses: { name: string; courseId: string | null; views: number; priceSeen: boolean; lastAt: string }[];
  topics: { key: TopicKey; label: string; count: number }[];
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  returnedAfterDays: number | null;
  countries: string[];
  sources: string[];
  inboundMessages: number;
  interestScore: number;
  interestBand: "hot" | "warm" | "cool" | "cold";
  reasons: InterestReason[];
};

const KNOWN = new Set([
  "web.page_viewed", "web.session_started", "web.scroll_depth_reached", "web.pricing_viewed",
  "web.cta_clicked", "web.cta_viewed", "web.brochure_clicked", "web.faq_expanded",
  "web.media_interacted", "web.engaged_time", "web.form_started", "web.form_submitted",
  "web.form_acknowledged", "web.form_validation_failed",
]);

const DAY = 86_400_000;

export function buildInterestProfile(input: {
  events: ProfileEvent[];
  sessions: ProfileSession[];
  messages: ProfileMessage[];
  coursePages: CoursePage[];
  now?: Date;
}): InterestProfile {
  const now = (input.now ?? new Date()).getTime();
  const events = [...input.events].filter((e) => Number.isFinite(Date.parse(e.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const ctaClicks: Record<string, number> = {};
  const otherActivity: Record<string, number> = {};
  const courseMap = new Map<string, { name: string; courseId: string | null; views: number; priceSeen: boolean; lastAt: string }>();
  let pagesViewed = 0, engagedSeconds = 0, maxScroll = 0, priceViews = 0, brochure = 0, faq = 0;
  let videoPlays = 0, videoCompletes = 0, galleryOpens = 0, highIntentPages = 0, contactPages = 0;
  const pricePaths = new Set<string>();

  const touchCourse = (path: string | null, at: string, price = false) => {
    if (!path || !path.includes("/courses/") || TEST_PAGE.test(path.replace(/\/+$/, ""))) return;
    const course = courseForPath(path, input.coursePages);
    const key = course?.courseId ?? path;
    const entry = courseMap.get(key) ?? { name: course?.courseName ?? pageLabel(path), courseId: course?.courseId ?? null, views: 0, priceSeen: false, lastAt: at };
    if (!price) entry.views += 1;
    if (price) entry.priceSeen = true;
    if (Date.parse(at) > Date.parse(entry.lastAt)) entry.lastAt = at;
    courseMap.set(key, entry);
  };

  for (const e of events) {
    const p = e.props ?? {};
    const path = pathOf(p.pagePath ?? p.pageUrl ?? (typeof p.page_slug === "string" ? p.page_slug : null));
    switch (e.name) {
      case "web.page_viewed":
        pagesViewed += 1;
        touchCourse(path, e.at);
        if (path && HIGH_INTENT_PAGE.test(path)) highIntentPages += 1;
        if (path && CONTACT_PAGE.test(path)) contactPages += 1;
        break;
      case "web.engaged_time":
        engagedSeconds += Math.max(0, Math.min(3600, Number(p.engaged_seconds) || 0));
        maxScroll = Math.max(maxScroll, Number(p.max_scroll_percent) || 0);
        break;
      case "web.scroll_depth_reached":
        maxScroll = Math.max(maxScroll, Number(p.threshold_percent) || 0);
        break;
      case "web.pricing_viewed":
        priceViews += 1;
        if (path) pricePaths.add(path);
        touchCourse(path, e.at, true);
        break;
      case "web.cta_clicked": {
        const kind = typeof p.cta_kind === "string" ? p.cta_kind : typeof p.action === "string" ? String(p.action).replace(/_click$/, "") : "other";
        ctaClicks[kind] = (ctaClicks[kind] ?? 0) + 1;
        break;
      }
      case "web.brochure_clicked": brochure += 1; break;
      case "web.faq_expanded": faq += 1; break;
      case "web.media_interacted":
        if (p.media === "video" && p.action === "play") videoPlays += 1;
        else if (p.media === "video" && p.action === "complete") videoCompletes += 1;
        else if (p.media === "gallery" || p.media === "photo") galleryOpens += 1;
        break;
      default:
        if (!KNOWN.has(e.name)) otherActivity[e.name] = (otherActivity[e.name] ?? 0) + 1;
    }
  }

  // Visits and returns.
  const sessions = [...input.sessions].filter((s) => Number.isFinite(Date.parse(s.startedAt))).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  let returnedAfterDays: number | null = null;
  for (let i = 1; i < sessions.length; i++) {
    const gap = (Date.parse(sessions[i].startedAt) - Date.parse(sessions[i - 1].startedAt)) / DAY;
    if (gap >= 3) returnedAfterDays = Math.round(gap);
  }
  const times = [...events.map((e) => Date.parse(e.at)), ...sessions.map((s) => Date.parse(s.startedAt))].filter(Number.isFinite);
  const firstSeen = times.length ? new Date(Math.min(...times)).toISOString() : null;
  const lastSeen = times.length ? new Date(Math.max(...times)).toISOString() : null;

  // What they asked, from their own messages.
  const topicCount = new Map<TopicKey, number>();
  const inbound = input.messages.filter((m) => m.direction === "inbound");
  for (const m of inbound) for (const t of topicsInText(m.body)) topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
  const topics = [...topicCount.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, label: TOPIC_LABELS[key], count }));

  // Interest score: recent intent counts most. Each reason is shown to the team.
  const reasons: InterestReason[] = [];
  const add = (cond: boolean, points: number, text: string) => { if (cond && points) reasons.push({ text, points }); };
  const daysSinceLast = lastSeen ? (now - Date.parse(lastSeen)) / DAY : Infinity;
  const lastInbound = inbound.length ? Math.max(...inbound.map((m) => Date.parse(m.at)).filter(Number.isFinite)) : NaN;
  const daysSinceMessage = Number.isFinite(lastInbound) ? (now - lastInbound) / DAY : Infinity;

  add(daysSinceLast <= 2, 15, "On the website in the last 2 days");
  add(daysSinceLast > 2 && daysSinceLast <= 7, 8, "On the website this week");
  add(priceViews > 0, Math.min(16, 8 + 4 * (priceViews - 1)), priceViews === 1 ? "Looked at a price" : `Looked at prices ${priceViews} times`);
  add(highIntentPages > 0, 14, "Opened an enrol, fees or payment page");
  add((ctaClicks.enrol ?? 0) + (ctaClicks.pay ?? 0) > 0, 14, "Clicked enrol or pay");
  add((ctaClicks.whatsapp ?? 0) + (ctaClicks.call ?? 0) + (ctaClicks.contact ?? 0) + contactPages > 0, 8, "Tried to contact you");
  add(brochure > 0, 6, "Downloaded the brochure");
  add(videoCompletes > 0, 6, "Watched a video to the end");
  add(videoPlays > 0 && videoCompletes === 0, 3, "Played a video");
  add(galleryOpens > 0, 2, "Looked through photos");
  add(engagedSeconds >= 180, 8, `Read for ${Math.round(engagedSeconds / 60)} minutes`);
  add(engagedSeconds >= 60 && engagedSeconds < 180, 4, "Read for over a minute");
  add(maxScroll >= 75, 4, "Read most of a course page");
  add(courseMap.size === 1 && pagesViewed >= 3, 4, "Focused on one course");
  add(returnedAfterDays != null, 8, `Came back after ${returnedAfterDays} days`);
  const askedBuying = topics.some((t) => ["fees", "dates", "register", "payment"].includes(t.key));
  add(askedBuying && daysSinceMessage <= 7, 14, "Asked about fees, dates or joining this week");
  add(askedBuying && daysSinceMessage > 7, 6, "Asked about fees, dates or joining");
  add(topics.some((t) => t.key === "discount"), 4, "Asked about a discount or scholarship");
  const otherCount = Object.values(otherActivity).reduce((s, n) => s + n, 0);
  add(otherCount > 0, Math.min(4, otherCount), "Other website activity");
  add(daysSinceLast > 30 && daysSinceMessage > 30, -10, "Quiet for over a month");

  reasons.sort((a, b) => b.points - a.points);
  const interestScore = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0)));
  const interestBand = interestScore >= 60 ? "hot" : interestScore >= 35 ? "warm" : interestScore >= 15 ? "cool" : "cold";

  return {
    hasWebsiteData: events.length > 0 || sessions.length > 0,
    hasMessages: input.messages.length > 0,
    visits: sessions.length,
    pagesViewed,
    readingMinutes: Math.round(engagedSeconds / 6) / 10,
    maxScrollPercent: maxScroll,
    priceViews,
    ctaClicks,
    brochure,
    faq,
    videoPlays,
    videoCompletes,
    galleryOpens,
    otherActivity,
    highIntentPages,
    contactPages,
    courses: [...courseMap.values()].sort((a, b) => b.views - a.views || Date.parse(b.lastAt) - Date.parse(a.lastAt)).slice(0, 5),
    topics,
    firstSeenAt: firstSeen,
    lastSeenAt: lastSeen,
    returnedAfterDays,
    countries: [...new Set(sessions.map((s) => s.country).filter((c): c is string => Boolean(c)))],
    sources: [...new Set(sessions.map((s) => s.source).filter((c): c is string => Boolean(c)))],
    inboundMessages: inbound.length,
    interestScore,
    interestBand,
    reasons: reasons.slice(0, 6),
  };
}

export type NextStep = { action: string; why: string; needsPerson: boolean };

/**
 * One suggested next step for the sales team, from the profile. Within policy:
 * discounts and scholarships are never offered automatically; they go to a person.
 */
export function suggestNextStep(p: InterestProfile, courseName?: string | null): NextStep | null {
  const course = courseName || p.courses[0]?.name || "the course";
  const asked = new Set(p.topics.map((t) => t.key));
  const enrolClicks = (p.ctaClicks.enrol ?? 0) + (p.ctaClicks.pay ?? 0);
  if (asked.has("discount")) {
    return { action: "Pass to a person: they asked about a discount or scholarship", why: "Discounts and scholarships are decided by the team, not sent automatically.", needsPerson: true };
  }
  if (enrolClicks > 0 || asked.has("payment") || asked.has("register")) {
    return { action: "Help them finish enrolling — ask if anything stopped them", why: enrolClicks ? "They clicked enrol or pay." : "They asked how to join or pay.", needsPerson: false };
  }
  if (p.priceViews > 0 || p.highIntentPages > 0 || asked.has("fees") || asked.has("dates")) {
    return { action: `Send the next dates and fees for ${course}, and offer a quick call`, why: "They looked at prices or asked about fees and dates.", needsPerson: false };
  }
  if (p.returnedAfterDays != null) {
    return { action: `They came back after ${p.returnedAfterDays} days — send a short check-in about ${course}`, why: "A return visit after a gap often means they are deciding.", needsPerson: false };
  }
  if (p.readingMinutes >= 2 || p.videoCompletes > 0 || p.brochure > 0) {
    return { action: `Share what students say about ${course} and ask what they'd like to know`, why: "They spent real time reading or watching.", needsPerson: false };
  }
  if (p.hasWebsiteData) {
    return { action: `Send a course link for ${course}`, why: "Light activity so far; a link shows what they open next.", needsPerson: false };
  }
  return null;
}

/** Short, non-identifying summary of interest for the drafting AI: courses and topics only. */
export function interestNoteFor(p: InterestProfile): string {
  const parts: string[] = [];
  if (p.courses.length) parts.push(`Courses of interest: ${p.courses.slice(0, 3).map((c) => c.name).join("; ")}.`);
  if (p.topics.length) parts.push(`They have asked about: ${p.topics.slice(0, 4).map((t) => t.label.toLowerCase()).join(", ")}.`);
  if (p.priceViews > 0 || p.highIntentPages > 0) parts.push("Fees and joining details are likely useful.");
  if (p.returnedAfterDays != null) parts.push("They are considering it again after a gap.");
  return parts.join(" ");
}
