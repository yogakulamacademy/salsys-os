// Answer Engine facts (owner-approved shadow mode, 26 Nov 2026). Turns the
// school's own data into the engine's inputs, with no AI:
//  - the approved "Course fees" knowledge item → a price book,
//  - courses + upcoming batches (Course Management) → course facts.
// Pure: rows are passed in. Anything it cannot read clearly is left out, so the
// engine stays quiet and Claude answers instead.

import type { CourseFact, Place, Price } from "./answer-engine";

export type CourseRow = { id: string; name: string; category: string | null; hours: number | null; metadata?: Record<string, unknown> | null };
export type BatchRow = { course_id: string; location: string | null; mode: string | null; start_date: string };

const PLACES: Array<[Place, RegExp]> = [["Mysore", /mysor/i], ["Kerala", /kerala|varkala/i], ["Bengaluru", /bengaluru|bangalore|rt nagar/i], ["Online", /online/i]];
const KEYWORDS = ["prenatal", "face", "kids", "nutrition", "kundalini", "retreat", "ayurveda", "sound"] as const;
export const isOnlineCourse = (c: CourseRow) => /online/i.test(c.name) || /^online/.test(c.category ?? "") || /\/online\//.test(String(c.metadata?.website_url ?? ""));
const placeOf = (s: string | null | undefined): Place | null => PLACES.find(([, re]) => re.test(s ?? ""))?.[0] ?? null;
const num = (s: string) => Number(s.replace(/[^\d]/g, ""));
const hoursIn = (s: string) => Number(/(\d{2,3})[\s-]*(hour|hr|h)\b/i.exec(s)?.[1] ?? 0) || null;
const keyOf = (s: string) => {
  const l = s.toLowerCase();
  const kw = KEYWORDS.find((k) => l.includes(k)) ?? null;
  const level = kw === "sound" ? (/master/.test(l) ? "master" : /level[\s-]*2|\bl2\b/.test(l) ? "2" : /level[\s-]*1|\bl1\b/.test(l) ? "1" : null) : null;
  return { kw, level, hours: hoursIn(l), weekend: /weekend/.test(l), weekdays: /weekday/.test(l) };
};

/** Which course a line of the fee list is about, or null when it isn't clear. */
export function matchCourse(label: string, place: Place | null, courses: CourseRow[]): CourseRow | null {
  const k = keyOf(label);
  const online = place === "Online";
  const hits = courses.filter((c) => {
    const ck = keyOf(`${c.name} ${c.category ?? ""}`);
    if (isOnlineCourse(c) !== online) return false;
    if (k.kw || ck.kw) { if (k.kw !== ck.kw) return false; if (k.kw === "sound") return k.level === ck.level; return true; }
    return Boolean(k.hours) && k.hours === (c.hours ?? ck.hours);
  });
  return hits.length === 1 ? hits[0] : null;
}

/** Reads the approved fee list. Only plain prices are kept: "₹60,000, twin sharing", "₹30,000 twin / ₹40,000 private",
 *  "₹30,000 regular, ₹20,000 early-bird/offer" (online courses only), and the USD "a / b" lists. */
export function parsePriceBook(text: string, courses: CourseRow[]): Price[] {
  const out: Price[] = [];
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  let section: "INR" | "USD" | null = null;
  for (const line of lines) {
    if (/^INDIA\s*\(INR\)/i.test(line)) { section = "INR"; continue; }
    if (/^INTERNATIONAL\s*\(USD\)/i.test(line)) { section = "USD"; continue; }
    if (/^Q:/i.test(line)) section = null;
    if (!section || !line.startsWith("- ")) continue;
    if (section === "INR") {
      const m = /^- (.+?):\s*(.+)$/.exec(line);
      if (!m) continue;
      const [label, place] = [m[1], placeOf(m[1])];
      if (!place || /classes|session/i.test(label)) continue;
      const course = matchCourse(label.replace(/,.*$/, ""), place, courses);
      if (!course) continue;
      const body = m[2].replace(/\(.*?\)/g, "");
      const variant = /weekend/i.test(label) ? "weekend" : /weekday/i.test(label) ? "weekdays" : undefined;
      const amounts = [...body.matchAll(/₹\s?([\d,]+)/g)].map((x) => num(x[1]));
      if (/twin/i.test(body) && /private/i.test(body) && amounts.length >= 2) out.push({ courseId: course.id, place, variant, currency: "INR", twin: amounts[0], private: amounts[1] });
      else if (/regular/i.test(body) && amounts.length >= 2) { if (place === "Online") out.push({ courseId: course.id, place, variant, currency: "INR", regular: amounts[0], offer: amounts[1] }); }
      else if (/offer/i.test(body)) out.push({ courseId: course.id, place, variant, currency: "INR", ...(/twin/i.test(body) ? { twin: amounts[0] } : { regular: amounts[0] }), note: "limited offer not quoted" });
      else if (amounts.length === 1) out.push({ courseId: course.id, place, variant, currency: "INR", ...(/twin/i.test(body) ? { twin: amounts[0] } : { regular: amounts[0] }) });
    } else {
      const m = /^- (Mysore|Kerala|Online|Bengaluru):\s*(.+)$/i.exec(line);
      if (!m) continue;
      const place = placeOf(m[1]);
      for (const item of m[2].split("·").map((s) => s.trim())) {
        if (/\d+\s*days/i.test(item) || /classes|session/i.test(item)) continue;
        const a = /^(.+?)\s+\$([\d,]+)(?:\s*(?:regular)?\s*[,/]\s*\$([\d,]+))?/.exec(item);
        if (!a) continue;
        const variant = /weekend/i.test(a[1]) ? "weekend" : /weekday/i.test(a[1]) ? "weekdays" : undefined;
        const course = matchCourse(a[1], place, courses);
        if (!course || !a[3]) continue;
        if (place === "Online") out.push({ courseId: course.id, place: place!, variant, currency: "USD", regular: num(a[2]), offer: num(a[3]) });
        else if (place === "Bengaluru") continue; // "offer" prices without an end date: the team quotes these
        else out.push({ courseId: course.id, place: place!, variant, currency: "USD", private: num(a[2]), twin: num(a[3]) });
      }
    }
  }
  return out;
}

/** "What the fee includes" lines → per course (residential only). */
export function parseIncludes(text: string, courses: CourseRow[]): Map<string, string> {
  const out = new Map<string, string>();
  const block = /Q: What does the fee include\?[\s\S]*?(?=\nQ:|$)/i.exec(text.replace(/\r/g, ""))?.[0] ?? "";
  for (const line of block.split("\n")) {
    const m = /^- (.+?):\s*(.+)$/.exec(line.trim());
    if (!m || /other courses/i.test(m[1])) continue;
    const place = placeOf(m[1]) ?? "Mysore";
    const course = matchCourse(m[1], place, courses);
    if (course) out.set(course.id, m[2].replace(/\.$/, ""));
  }
  return out;
}

function aliasFor(c: CourseRow): RegExp {
  const k = keyOf(`${c.name} ${c.category ?? ""}`);
  const online = isOnlineCourse(c);
  const parts: string[] = [];
  if (k.kw === "prenatal") parts.push(online ? "online (prenatal|pregnancy)" : "(prenatal|postnatal|pregnancy) (yoga )?(teacher|ttc|ytt|course|training)", ...(online ? ["garbha"] : []));
  else if (k.kw === "face") parts.push("face yoga", "facial yoga");
  else if (k.kw === "sound") parts.push(k.level === "master" ? "sound heal\\w* (meditation )?master" : `sound heal\\w*${k.level === "2" ? " (level|l)\\s*2" : ""}`);
  else if (k.kw === "kundalini") parts.push("kundalini", "tantra");
  else if (k.kw) parts.push(k.kw === "kids" ? "kids yoga" : k.kw);
  else if (c.hours) parts.push(online ? `online ${c.hours}` : `${c.hours}[\\s-]*(hours?|hrs?|h)\\b`);
  return new RegExp(`\\b(${parts.join("|")})`);
}

/** Courses + upcoming batches → engine course facts. */
export function buildCourseFacts(courses: CourseRow[], batches: BatchRow[], includes: Map<string, string>): CourseFact[] {
  const facts: CourseFact[] = courses.map((c) => {
    const online = isOnlineCourse(c);
    const inc = includes.get(c.id) ?? null;
    return {
      id: c.id, name: c.name, short: c.name.replace(/Yoga Teacher Training/i, "Yoga TTC").replace(/\bYTT\b/, "Yoga TTC"),
      aliases: aliasFor(c), online,
      batches: batches.filter((b) => b.course_id === c.id).map((b) => ({ place: (online ? "Online" : placeOf(b.location)) as Place, start: b.start_date })).filter((b) => b.place),
      includes: !online && inc ? inc.replace(/,?\s*(and\s+)?(a\s+)?Yoga Alliance[^,]*certificat\w*/i, "").replace(/\s*,\s*$/, "").trim() || undefined : undefined,
      certificate: inc && /yoga alliance/i.test(inc) ? "a Yoga Alliance certificate" : undefined,
      live: online && Boolean(inc && /\blive\b/i.test(inc)),
    };
  });
  // Courses that run both online and in person (same subject) form a family.
  for (const f of facts) {
    const k = keyOf(f.name);
    // Only subject courses (prenatal…): the backtest showed the 200-hour record is reliable (staff answered the in-person course 99% of the time).
    const twin = k.kw ? facts.find((o) => o !== f && o.online !== f.online && keyOf(o.name).kw === k.kw) : undefined;
    if (twin) f.family = k.kw!;
  }
  return facts;
}

/** The school's main campus: where most course pages on the website point (Yogakulam: Mysore). */
export function mainPlace(courses: CourseRow[]): Place | null {
  const counts = new Map<Place, number>();
  for (const c of courses) {
    const p = placeOf(String(c.metadata?.website_url ?? ""));
    if (p && p !== "Online") counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
