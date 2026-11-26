// SalsysOS Answer Engine v1 (owner request, 26 Nov 2026): a rules-and-facts
// engine that answers the common enquiry questions (fees, dates, location,
// online or in person, stay, certificate, how to register) from the school's
// own data, with no AI model. It answers only when it is sure; everything else
// goes to Claude or a person. Pure: course facts and the price book are passed in.

export type Topic = "fee" | "dates" | "register" | "location" | "online_offline" | "accommodation" | "certification" | "interested";
export type Market = "india" | "international" | "unknown";
export type Place = "Mysore" | "Kerala" | "Bengaluru" | "Online";

export type CourseFact = {
  id: string; name: string; short: string; aliases: RegExp; online: boolean;
  /** Courses that exist both online and in person share a family ("prenatal", "200h"). */
  family?: string;
  batches: Array<{ place: Place; start: string }>;
  includes?: string; certificate?: string;
};
export type Price = { courseId: string; place: Place; variant?: string; currency: "INR" | "USD"; regular?: number; offer?: number; twin?: number; private?: number; note?: string };
export type EngineInput = {
  message: string; now: number;
  lead: { courseId: string | null; preferredPlace: string | null; market: Market };
  courses: CourseFact[]; prices: Price[];
  /** The school's main campus, used when a course runs in several places and the lead hasn't said (Yogakulam: Mysore, matching what staff do). */
  defaultPlace?: Place | null;
  link?: (courseId: string) => string | null;
};
export type Understanding = { topics: Topic[]; risk: string | null; courseId: string | null; courseFrom: "message" | "lead" | null; place: Place | null; tooLong: boolean; foreign: boolean };
export type Decision =
  | { answer: true; topic: Topic; text: string; facts: string[]; u: Understanding }
  | { answer: false; reason: string; u: Understanding };

const TOPIC_RULES: Array<[Topic, RegExp]> = [
  ["fee", /\b(fees?|cost|costs|price|prices|charges?|how much|kitna|amount|rate)\b/],
  ["register", /\b(register|registration|enrol+|enroll|apply|admission|join|book|booking)\b/],
  ["dates", /\b(dates?|batch|batches|schedule|timings?|when|start|starting|duration|next month|how long|days)\b/],
  ["accommodation", /\b(accommodation|accomodation|stay|room|rooms|twin|sharing|food|meals?)\b/],
  ["online_offline", /\b(online|offline|recorded|recordings?|zoom|live|in person|in-person)\b/],
  ["location", /\b(location|address|located|which (place|city)|where (is|are|will|do|does|exactly)|where\?)/],
  ["certification", /\b(certificate|certification|certified|alliance|rys|accredited)\b/],
];
// Anything here goes to a person or Claude: money disputes, negotiation, payments, health.
const RISK = /\b(refund|chargeback|cancel\w*|complain\w*|cheat\w*|fraud|scam|lawyer|legal|discount|scholarship|offer|offers|diwali|avail|coupon|deal|cheaper|reduce|less(er)?|negotiat\w*|too (high|much|expensive)|expensive|afford|concession|free|emi|instal+ments?|paid|payment (done|made|sent)|transferred|screenshot|receipt|extension|medical|injur\w*|surgery|pregnant|doctor|offer extend\w*|deadline|group|two courses|both courses)\b/;
const PLACE_RULES: Array<[Place, RegExp]> = [["Mysore", /\bmysor/], ["Kerala", /\b(kerala|varkala)\b/], ["Bengaluru", /\b(bangalore|bengaluru|rt nagar)\b/], ["Online", /\bonline\b/]];

const lower = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const money = (v: number, c: "INR" | "USD") => (c === "INR" ? `₹${v.toLocaleString("en-IN")}` : `$${v.toLocaleString("en-US")}`);

export function understand(input: EngineInput): Understanding {
  const m = lower(input.message);
  let topics = TOPIC_RULES.filter(([, re]) => re.test(m)).map(([t]) => t);
  // "the online course fee": "online" only names the course, it isn't a question about the format.
  if (topics.length > 1 && topics.includes("online_offline") && !/\b(offline|recorded|recordings?|zoom|live|in person|in-person|or online|online or)\b/.test(m)) topics = topics.filter((t) => t !== "online_offline");
  const risk = RISK.exec(m)?.[0] ?? null;
  const named = input.courses.filter((c) => c.aliases.test(m));
  // Two names match ("online 200 hour" → online and in-person 200-hour): "online" in the message decides.
  const sameMode = named.filter((c) => c.online === /\bonline\b/.test(m));
  const fromMessage = named.length === 1 ? named[0] : sameMode.length === 1 ? sameMode[0] : null;
  const leadCourse = input.lead.courseId ? input.courses.find((c) => c.id === input.lead.courseId) ?? null : null;
  const course = fromMessage ?? (named.length ? null : leadCourse);
  const place = PLACE_RULES.find(([, re]) => re.test(m))?.[0] ?? null;
  const letters = m.replace(/[^\p{L}]/gu, "");
  const latin = letters.replace(/[^a-z]/g, "").length;
  return {
    topics: topics.length ? topics : (/\b(interested|details|info|information|tell me more)\b/.test(m) ? ["interested"] : []),
    risk, courseId: course?.id ?? null, courseFrom: course ? (fromMessage ? "message" : "lead") : null, place,
    tooLong: m.length > 220, foreign: letters.length > 0 && latin / letters.length < 0.8,
  };
}

function resolvePlace(course: CourseFact, u: Understanding, preferred: string | null, fallback: Place | null = null): Place | null {
  const places = [...new Set(course.batches.map((b) => b.place))];
  if (course.online) return "Online";
  const fromMsg = u.place && u.place !== "Online" ? u.place : null;
  const pref = PLACE_RULES.find(([, re]) => re.test(lower(preferred ?? "")))?.[0] ?? null;
  const pick = fromMsg ?? pref;
  if (pick && places.includes(pick)) return pick;
  if (places.length === 1) return places[0];
  return fallback && places.includes(fallback) ? fallback : null;
}

function nextBatches(course: CourseFact, place: Place | null, now: number, n = 2) {
  const today = new Date(now).toISOString().slice(0, 10);
  return course.batches.filter((b) => b.start >= today && (!place || b.place === place)).sort((a, b) => a.start.localeCompare(b.start)).slice(0, n);
}

/** Early-bird window (school policy): 3 days from today, never later than 24 hours before the batch. */
export function offerUntil(now: number, batchStart: string | null): string | null {
  if (!batchStart) return null;
  const startMs = Date.parse(`${batchStart}T00:00:00+05:30`);
  if (startMs - now < 36 * 3_600_000) return null;
  const until = Math.min(now + 3 * 86_400_000, startMs - 24 * 3_600_000);
  return new Date(until).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export function decide(input: EngineInput): Decision {
  const u = understand(input);
  const no = (reason: string): Decision => ({ answer: false, reason, u });
  if (!u.topics.length) return no("no clear question");
  if (u.risk) return no(`needs a person (${u.risk})`);
  if (u.tooLong) return no("long message");
  if (u.foreign) return no("not in English");
  const main = u.topics.filter((t) => t !== "interested");
  const topic: Topic = main.includes("fee") ? "fee" : (main[0] ?? "interested");
  if (main.length > 2 || (main.length === 2 && !(main.includes("fee") && main.includes("dates")))) return no("several questions at once");
  let course = u.courseId ? input.courses.find((c) => c.id === u.courseId)! : null;
  // "online" in the message picks the online version of the same course, "offline"/a place the in-person one.
  if (course?.family) {
    const msg = lower(input.message);
    const saysOnline = /\bonline\b/.test(msg);
    const saysInPerson = /\b(offline|in person|in-person|residential)\b/.test(msg) || (u.place !== null && u.place !== "Online");
    const want = saysOnline && !saysInPerson ? true : saysInPerson && !saysOnline ? false : null;
    const twin = want !== null && want !== course.online ? input.courses.find((c) => c.family === course!.family && c.online === want) : undefined;
    if (twin) { course = twin; u.courseId = twin.id; }
  }
  if (!course) return no("course not known");
  const decided = course;
  // The decided on the lead's record is a guess when the same decided also runs the other way (online / in person),
  // unless the message says which. Staff often answered such leads about the other version.
  if (u.courseFrom === "lead" && decided.family && input.courses.some((c) => c.family === decided.family && c.online !== decided.online)
    && !(/\bonline\b/.test(lower(input.message)) || (u.place && u.place !== "Online"))) return no("online or in person not clear");
  const place = resolvePlace(decided, u, input.lead.preferredPlace, input.defaultPlace ?? null);
  const otherPlaces = decided.online ? [] : [...new Set(decided.batches.map((b) => b.place))].filter((p) => p !== place);
  const alsoIn = otherPlaces.length && !u.place && !input.lead.preferredPlace ? ` We also run it in ${otherPlaces.join(" and ")}.` : "";
  const batches = nextBatches(decided, place, input.now);
  const link = input.link?.(decided.id) ?? null;
  const tail = link ? `\nFull decided details: ${link}` : "";
  const dateLine = batches.length ? `The next batch${place && !decided.online ? ` in ${place}` : ""} starts on ${day(batches[0].start)}${batches[1] ? `, then ${day(batches[1].start)}` : ""}.` : "";
  const facts: string[] = [];

  if (topic === "fee") {
    if (!place) return no("place not known (several locations)");
    if (input.lead.market === "unknown") {
      return { answer: true, topic, u, facts: ["fee rule: market unknown"],
        text: `Namaste 🙏 The fees and dates for the ${decided.short} are on the decided page.${tail}\nCould you share your WhatsApp number? I'll send you the fee details and brochure there.` };
    }
    const cur = input.lead.market === "india" ? "INR" : "USD";
    const price = input.prices.find((p) => p.courseId === decided.id && p.place === place && p.currency === cur && !p.variant);
    if (!price) return no(`no ${cur} price for ${decided.short} in ${place}`);
    let feeText: string;
    if (price.twin && price.private) feeText = `${money(price.twin, cur)} with twin sharing or ${money(price.private, cur)} for a private room`;
    else if (price.twin) feeText = `${money(price.twin, cur)} with twin sharing`;
    else if (price.offer && price.regular) {
      const until = offerUntil(input.now, batches[0]?.start ?? null);
      feeText = until ? `${money(price.offer, cur)} (early-bird fee, valid till ${until}; regular fee ${money(price.regular, cur)})` : `${money(price.regular, cur)}`;
    } else if (price.regular) feeText = money(price.regular, cur);
    else return no("price incomplete");
    facts.push(`price: ${decided.short}, ${place}, ${cur}`, ...(batches[0] ? [`batch: ${batches[0].start}`] : []));
    const inc = decided.includes ? ` It includes ${decided.includes}.` : "";
    return { answer: true, topic, u, facts,
      text: `Namaste 🙏 The ${decided.short}${decided.online ? "" : ` in ${place}`} is ${feeText}.${inc}${dateLine ? ` ${dateLine}` : ""} We also offer a 2-instalment option.${alsoIn}${tail}\nWould you like to reserve a seat?` };
  }
  if (topic === "dates") {
    if (!batches.length) return no("no upcoming batch saved");
    if (!place && !decided.online && new Set(decided.batches.map((b) => b.place)).size > 1) {
      const byPlace = [...new Set(decided.batches.map((b) => b.place))].map((p) => { const b = nextBatches(decided, p, input.now, 1)[0]; return b ? `${p}: ${day(b.start)}` : null; }).filter(Boolean);
      return { answer: true, topic, u, facts: ["batches by place"], text: `Namaste 🙏 The next ${decided.short} batches start on ${byPlace.join(" · ")}. Which place suits you best?${tail}` };
    }
    return { answer: true, topic, u, facts: [`batch: ${batches[0].start}`], text: `Namaste 🙏 ${dateLine}${tail}\nWould you like to reserve a seat?` };
  }
  if (topic === "location") {
    const places = [...new Set(decided.batches.map((b) => b.place))];
    if (!places.length) return no("no places saved");
    return { answer: true, topic, u, facts: ["places from batches"], text: decided.online
      ? `Namaste 🙏 The ${decided.short} is fully online with live classes, so you can join from anywhere.${tail}`
      : `Namaste 🙏 The ${decided.short} runs in ${places.join(" and ")}${places.includes("Bengaluru") ? " (RT Nagar)" : ""}. ${dateLine}${tail}` };
  }
  if (topic === "online_offline") {
    return { answer: true, topic, u, facts: ["decided mode"], text: decided.online
      ? `Namaste 🙏 The ${decided.short} is online, with live classes on Zoom. ${dateLine}${tail}`
      : `Namaste 🙏 The ${decided.short} is an in-person course${place ? ` in ${place}` : ""}. We also run online courses; let me know if you'd prefer that. ${dateLine}${tail}` };
  }
  if (topic === "accommodation") {
    if (decided.online || !decided.includes) return no("stay details not saved for this course");
    return { answer: true, topic, u, facts: ["includes"], text: `Namaste 🙏 Yes, the ${decided.short} includes ${decided.includes}. You can choose twin sharing or a private room. ${dateLine}${tail}` };
  }
  if (topic === "certification") {
    if (!decided.certificate) return no("certificate not saved for this course");
    return { answer: true, topic, u, facts: ["certificate"], text: `Namaste 🙏 Yes, you receive ${decided.certificate} when you complete the ${decided.short}.${tail}` };
  }
  if (topic === "register") {
    if (!batches.length) return no("no upcoming batch saved");
    return { answer: true, topic, u, facts: [`batch: ${batches[0].start}`], text: `Namaste 🙏 Happy to help you join the ${decided.short}! ${dateLine} Please share your full name, email and WhatsApp number, and our team will send you the registration details.` };
  }
  return no("general interest: Claude writes this");
}
