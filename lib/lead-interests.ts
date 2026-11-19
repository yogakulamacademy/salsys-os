// Lead course interests and estimated value. Pure rules, no I/O.
//
// Every sign that a lead wants a course becomes an interest with a strength.
// The strongest, most recent interest is the lead's main course; its price (the
// offer price if there is one, otherwise the regular price; shared room for
// residential courses) is the lead's estimated value. The value is for the
// team's pipeline only and is never quoted to the lead.

export type InterestSource =
  | "staff"        // set by the team
  | "crm"          // course already on the lead record
  | "form"         // course chosen on a website form
  | "form_page"    // website form filled on that course's page
  | "fee_question" // asked the fee or dates of the course in a message
  | "message"      // named the course in a message
  | "tracked_link" // opened the tracked course link
  | "ad"           // replied to an ad about the course
  | "shared_post"  // shared a post or reel about the course
  | "page_views";  // viewed the course page on the website

export const SOURCE_STRENGTH: Record<InterestSource, number> = {
  staff: 100,
  crm: 85,
  form: 90,
  form_page: 80,
  fee_question: 85,
  message: 75,
  tracked_link: 65,
  ad: 55,
  shared_post: 50,
  page_views: 40,
};

export type InterestRow = {
  courseId: string;
  strength: number;
  lastSeenAt: string;
  status: "active" | "dropped" | "enrolled";
  setBy: "system" | "ai" | "staff";
};

/** The lead's main course: anything the team set wins, then strongest, then most recent. */
export function choosePrimary(rows: InterestRow[]): InterestRow | null {
  const live = rows.filter((r) => r.status !== "dropped");
  if (!live.length) return null;
  return [...live].sort((a, b) =>
    Number(b.setBy === "staff") - Number(a.setBy === "staff") ||
    b.strength - a.strength ||
    Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt),
  )[0];
}

/** Does this message ask about fees, dates or joining (a stronger sign than just naming the course)? */
export function isFeeOrDateQuestion(text: string | null | undefined): boolean {
  return /\b(fee|fees|price|cost|charges?|how much|kitna|amount|dates?|batch|when (does|is|will)|start(s|ing)?|schedule|timings?|register|enrol+|join|seats?)\b/i.test(text ?? "");
}

/** Where the lead wants to study, from text or a website path. */
export function locationFromText(text: string | null | undefined): string | null {
  const t = (text ?? "").toLowerCase();
  if (/weekend/.test(t) && /bengaluru|bangalore/.test(t)) return "bengaluru-weekend";
  if (/weekday/.test(t) && /bengaluru|bangalore/.test(t)) return "bengaluru-weekdays";
  if (/bengaluru|bangalore/.test(t)) return "bengaluru";
  if (/mysore|mysuru/.test(t)) return "mysore";
  if (/kerala|varkala/.test(t)) return "kerala";
  if (/\/online\/|\bonline\b/.test(t)) return "online";
  if (/\bgoa\b/.test(t)) return "goa";
  if (/rishikesh/.test(t)) return "rishikesh";
  return null;
}

/**
 * India or international, for the estimated value only. Uses what the lead
 * said, then the visit country, then the phone number. Unknown leads are valued
 * at the India price and marked as such (owner decision, 19 Nov 2026).
 */
export function marketFor(input: { country?: string | null; visitCountry?: string | null; phone?: string | null }): "india" | "international" | "unknown" {
  const c = (input.country ?? "").trim().toLowerCase();
  if (c) return c === "india" || c === "in" || c === "bharat" ? "india" : "international";
  const v = (input.visitCountry ?? "").trim().toUpperCase();
  if (v) return v === "IN" ? "india" : "international";
  const p = (input.phone ?? "").replace(/[^\d+]/g, "");
  if (p.startsWith("+91") || /^91\d{10}$/.test(p) || /^[6-9]\d{9}$/.test(p)) return "india";
  if (p.startsWith("+")) return "international";
  return "unknown";
}

export type PriceRow = {
  courseId: string;
  location: string | null;
  market: "india" | "international";
  currency: string;
  roomType: "private" | "shared" | null;
  regularPrice: number | null;
  offerPrice: number | null;
  validUntil: string | null;
};

/**
 * Estimated value of one course for a lead: the price for their market (India
 * price when unknown), at their location when known, offer price if still valid,
 * shared room for residential courses. Null when there is no price.
 */
export function estimateValue(
  prices: PriceRow[],
  courseId: string,
  location: string | null,
  market: "india" | "international" | "unknown",
  today: string,
): { value: number; currency: string; marketUsed: "india" | "international"; assumed: boolean; fallback?: boolean } | null {
  const preferred = market === "unknown" ? "india" : market;
  let wantMarket: "india" | "international" = preferred;
  let forCourse = prices.filter((p) => p.courseId === courseId && p.market === wantMarket);
  // Some courses only have a USD price (no rupee fee was ever set). Value the
  // lead at that price, in its own currency, rather than leaving it unpriced.
  let fallback = false;
  if (!forCourse.length) {
    wantMarket = preferred === "india" ? "international" : "india";
    forCourse = prices.filter((p) => p.courseId === courseId && p.market === wantMarket);
    fallback = true;
  }
  if (!forCourse.length) return null;
  const atLocation = location ? forCourse.filter((p) => p.location === location || (p.location ?? "").startsWith(`${location}-`)) : [];
  const pool = atLocation.length ? atLocation : forCourse;
  const best = [...pool].sort((a, b) =>
    Number(b.roomType === "shared") - Number(a.roomType === "shared") ||
    Number(b.roomType === null) - Number(a.roomType === null),
  )[0];
  const offerValid = best.offerPrice != null && (!best.validUntil || best.validUntil >= today);
  const value = offerValid ? best.offerPrice : best.regularPrice ?? best.offerPrice;
  if (value == null) return null;
  return { value: Number(value), currency: best.currency, marketUsed: wantMarket, assumed: market === "unknown", ...(fallback ? { fallback: true } : {}) };
}

/** Merge a new sign into an existing interest: keep the stronger strength, all sources, latest time. */
export function mergeInterest(
  existing: { strength: number; sources: string[]; lastSeenAt: string; firstSeenAt: string; location: string | null } | null,
  sign: { source: InterestSource; at: string; location: string | null },
) {
  const strength = Math.max(existing?.strength ?? 0, SOURCE_STRENGTH[sign.source]);
  const sources = [...new Set([...(existing?.sources ?? []), sign.source])].sort();
  const lastSeenAt = !existing || Date.parse(sign.at) > Date.parse(existing.lastSeenAt) ? sign.at : existing.lastSeenAt;
  const firstSeenAt = !existing || Date.parse(sign.at) < Date.parse(existing.firstSeenAt) ? sign.at : existing.firstSeenAt;
  return { strength, sources, lastSeenAt, firstSeenAt, location: sign.location ?? existing?.location ?? null };
}
