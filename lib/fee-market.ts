// Which fee to quote (owner decision, 21 Nov 2026): Indian or international.
// Pure. Uses what we already know, most reliable first; never guesses.

export type FeeMarket = "india" | "international" | "unknown";

export type FeeMarketResult = { market: FeeMarket; country: string | null; source: string | null };

/**
 * stated: the country the lead gave us (form, CRM). linkCountry: where they
 * really opened their course link (scanner opens excluded). inferred: worked
 * out from clues such as the phone code. geoCountry: their website visit.
 */
export function feeMarketFor(
  input: {
    stated?: string | null;
    linkCountry?: string | null;
    inferred?: string | null;
    geoCountry?: string | null;
  },
  /** Turns "IN", "india", "Bharat"… into a country name, or null when it isn't one. */
  normalizeCountry: (raw: string | null) => string | null = simpleCountry,
): FeeMarketResult {
  const order: [string, string | null | undefined][] = [
    ["their details", input.stated],
    ["their course link visit", input.linkCountry],
    ["their phone number or messages", input.inferred],
    ["their website visit", input.geoCountry],
  ];
  for (const [source, raw] of order) {
    const country = normalizeCountry(raw ?? null);
    if (country) return { market: country === "India" ? "india" : "international", country, source };
  }
  return { market: "unknown", country: null, source: null };
}

/** The pricing rule given to the drafting AI. */
export function feeRule(market: FeeMarket): string {
  if (market === "india") return "PRICING: the lead is in India. If you give a fee, give only the Indian fee (INR). Never list the international fee too.";
  if (market === "international") return "PRICING: the lead is outside India. If you give a fee, give only the international fee. Never list the Indian (INR) fee too.";
  return "PRICING: we don't know where the lead is. Do not quote any fee amount and never list both the Indian and international fees. If they asked about the fee, say the fees and dates are on the course page (trackedCourseLink, if present) and ask for their WhatsApp number so the team can send the fee details and brochure there, in one short friendly line such as \"Could you share your WhatsApp number? I'll send you the fee details and brochure there.\" If they already declined to share a number or said they don't use WhatsApp, ask instead \"Where are you joining us from?\". Never ask \"India or abroad\" and never ask about nationality.";
}

/** Fallback normaliser: two-letter codes and names; "India"/"IN" are India. */
function simpleCountry(raw: string | null): string | null {
  const value = (raw ?? "").trim();
  if (!value || /^(—|-|unknown|none|n\/a)$/i.test(value)) return null;
  if (/^(in|ind|india|bharat)$/i.test(value)) return "India";
  return value.length === 2 ? value.toUpperCase() : value.replace(/\b\w/g, (c) => c.toUpperCase());
}
