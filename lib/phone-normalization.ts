/**
 * Lead phone normalisation to E.164 (+<country code><number>).
 *
 * Dependency-free on purpose: it runs in intake routes and is unit tested
 * directly. It never guesses silently:
 *  - a number typed with "+" or "00", or with a candidate country's code,
 *    keeps that code;
 *  - otherwise the country comes from (in order) the form's country field,
 *    the visitor's IP country, then the browser timezone;
 *  - the national number must have a valid length for that country, or the
 *    result is "needs_review" and nothing should be sent automatically.
 *
 * The raw value as typed is always preserved by the caller.
 */

export type PhoneCountrySource = "number" | "form_country" | "ip_country" | "timezone";
export type PhoneNormalizationStatus =
  | "already_international"
  | "code_present"
  | "country_added"
  | "needs_review"
  | "empty";
export type PhoneConfidence = "high" | "medium" | "low" | "none";

export type PhoneNormalization = {
  e164: string | null;
  country: string | null;
  countrySource: PhoneCountrySource | null;
  status: PhoneNormalizationStatus;
  confidence: PhoneConfidence;
  /** Safe to use for an automatic first WhatsApp message. */
  autoSendSafe: boolean;
  reason: string;
};

export type PhoneHints = {
  /** Country field from the form: ISO-2 code or a name ("India", "IN"). */
  formCountry?: string | null;
  /** Visitor IP country (e.g. Vercel x-vercel-ip-country), ISO-2. */
  ipCountry?: string | null;
  /** Browser IANA timezone, e.g. "Asia/Kolkata". */
  timezone?: string | null;
};

type CountryRule = {
  code: string;
  /** Valid national significant number lengths (after removing a trunk 0). */
  lengths: number[];
  /** Optional stricter first-digit rule for mobiles. */
  mobilePrefix?: RegExp;
  names: string[];
};

/** ISO-2 → calling code and national number lengths (mobile-focused). */
export const PHONE_COUNTRIES: Record<string, CountryRule> = {
  IN: { code: "91", lengths: [10], mobilePrefix: /^[6-9]/, names: ["india", "bharat", "ind"] },
  US: { code: "1", lengths: [10], names: ["united states", "usa", "us", "america", "united states of america"] },
  CA: { code: "1", lengths: [10], names: ["canada", "can"] },
  GB: { code: "44", lengths: [10], names: ["united kingdom", "uk", "gbr", "england", "scotland", "wales", "great britain", "britain"] },
  AE: { code: "971", lengths: [9], names: ["united arab emirates", "uae", "dubai"] },
  QA: { code: "974", lengths: [8], names: ["qatar"] },
  SA: { code: "966", lengths: [9], names: ["saudi arabia"] },
  NP: { code: "977", lengths: [10], names: ["nepal"] },
  LK: { code: "94", lengths: [9], names: ["sri lanka"] },
  BD: { code: "880", lengths: [10], names: ["bangladesh"] },
  MU: { code: "230", lengths: [8], names: ["mauritius"] },
  SG: { code: "65", lengths: [8], names: ["singapore"] },
  MY: { code: "60", lengths: [9, 10], names: ["malaysia"] },
  AU: { code: "61", lengths: [9], names: ["australia", "aus"] },
  NZ: { code: "64", lengths: [8, 9, 10], names: ["new zealand"] },
  ZA: { code: "27", lengths: [9], names: ["south africa"] },
  DE: { code: "49", lengths: [10, 11], names: ["germany", "deutschland"] },
  FR: { code: "33", lengths: [9], names: ["france"] },
  IT: { code: "39", lengths: [9, 10], names: ["italy", "italia"] },
  ES: { code: "34", lengths: [9], names: ["spain", "espana"] },
  PT: { code: "351", lengths: [9], names: ["portugal"] },
  NL: { code: "31", lengths: [9], names: ["netherlands", "holland"] },
  BE: { code: "32", lengths: [8, 9], names: ["belgium", "belgique", "belgie"] },
  CH: { code: "41", lengths: [9], names: ["switzerland"] },
  AT: { code: "43", lengths: [10, 11, 12, 13], names: ["austria"] },
  IE: { code: "353", lengths: [9], names: ["ireland"] },
  SE: { code: "46", lengths: [7, 8, 9], names: ["sweden"] },
  NO: { code: "47", lengths: [8], names: ["norway"] },
  DK: { code: "45", lengths: [8], names: ["denmark"] },
  FI: { code: "358", lengths: [6, 7, 8, 9, 10], names: ["finland"] },
  PL: { code: "48", lengths: [9], names: ["poland"] },
  HR: { code: "385", lengths: [8, 9], names: ["croatia"] },
  RS: { code: "381", lengths: [8, 9], names: ["serbia"] },
  GR: { code: "30", lengths: [10], names: ["greece"] },
  RU: { code: "7", lengths: [10], names: ["russia"] },
  IL: { code: "972", lengths: [9], names: ["israel"] },
  JP: { code: "81", lengths: [10], names: ["japan"] },
  CN: { code: "86", lengths: [11], names: ["china"] },
  BR: { code: "55", lengths: [10, 11], names: ["brazil", "brasil"] },
  MX: { code: "52", lengths: [10], names: ["mexico"] },
};

const TIMEZONE_COUNTRY: Record<string, string> = {
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN",
  "Asia/Dubai": "AE", "Asia/Qatar": "QA", "Asia/Riyadh": "SA",
  "Asia/Kathmandu": "NP", "Asia/Katmandu": "NP", "Asia/Colombo": "LK", "Asia/Dhaka": "BD",
  "Indian/Mauritius": "MU", "Asia/Singapore": "SG", "Asia/Kuala_Lumpur": "MY",
  "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Paris": "FR", "Europe/Berlin": "DE",
  "Europe/Rome": "IT", "Europe/Madrid": "ES", "Europe/Lisbon": "PT", "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE", "Europe/Zurich": "CH", "Europe/Vienna": "AT", "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI", "Europe/Warsaw": "PL",
  "Europe/Zagreb": "HR", "Europe/Belgrade": "RS", "Europe/Athens": "GR", "Europe/Moscow": "RU",
  "Asia/Jerusalem": "IL", "Asia/Tokyo": "JP", "Asia/Shanghai": "CN",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Perth": "AU", "Australia/Brisbane": "AU",
  "Pacific/Auckland": "NZ", "Africa/Johannesburg": "ZA",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US",
  "America/Phoenix": "US", "America/Toronto": "CA", "America/Vancouver": "CA",
  "America/Sao_Paulo": "BR", "America/Mexico_City": "MX",
};

export function countryToIso(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const upper = text.toUpperCase();
  if (upper.length === 2 && PHONE_COUNTRIES[upper]) return upper;
  if (upper === "UK") return "GB";
  const lower = text.toLowerCase().replace(/\s+/g, " ").replace(/[.,]+$/, "");
  for (const [iso, rule] of Object.entries(PHONE_COUNTRIES)) {
    if (rule.names.includes(lower)) return iso;
  }
  return null;
}

function validNational(national: string, iso: string): boolean {
  const rule = PHONE_COUNTRIES[iso];
  if (!rule || !rule.lengths.includes(national.length)) return false;
  return rule.mobilePrefix ? rule.mobilePrefix.test(national) : true;
}

function result(partial: Omit<PhoneNormalization, "autoSendSafe">): PhoneNormalization {
  return { ...partial, autoSendSafe: partial.e164 != null && (partial.confidence === "high" || partial.confidence === "medium") };
}

/** Match an international digit string against known calling codes. */
function matchInternational(digits: string): { iso: string; national: string } | null {
  const candidates = Object.entries(PHONE_COUNTRIES)
    .filter(([, rule]) => digits.startsWith(rule.code))
    .sort((a, b) => b[1].code.length - a[1].code.length);
  for (const [iso, rule] of candidates) {
    const national = digits.slice(rule.code.length).replace(/^0/, "");
    if (validNational(national, iso)) return { iso, national };
  }
  return null;
}

export function normalizeLeadPhone(raw: string | null | undefined, hints: PhoneHints = {}): PhoneNormalization {
  const text = String(raw ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (!digits) {
    return result({ e164: null, country: null, countrySource: null, status: "empty", confidence: "none", reason: "No phone number provided." });
  }

  // 1. Explicit international format: "+…" or "00…".
  const explicit = text.startsWith("+") ? digits : digits.startsWith("00") ? digits.slice(2) : null;
  if (explicit != null) {
    if (explicit.length < 8 || explicit.length > 15) {
      return result({ e164: null, country: null, countrySource: "number", status: "needs_review", confidence: "none", reason: "International number has an invalid length." });
    }
    const match = matchInternational(explicit);
    return result({
      e164: `+${explicit}`,
      country: match?.iso ?? null,
      countrySource: "number",
      status: "already_international",
      confidence: "high",
      reason: match ? `Typed with country code +${PHONE_COUNTRIES[match.iso].code}.` : "Typed with a country code.",
    });
  }

  // 2. Candidate countries, strongest first, without duplicates.
  const tzIso = hints.timezone ? TIMEZONE_COUNTRY[hints.timezone.trim()] ?? null : null;
  const candidates: { iso: string; source: PhoneCountrySource }[] = [];
  for (const [iso, source] of [
    [countryToIso(hints.formCountry), "form_country"],
    [countryToIso(hints.ipCountry), "ip_country"],
    [tzIso, "timezone"],
  ] as const) {
    if (iso && !candidates.some((candidate) => candidate.iso === iso)) candidates.push({ iso, source });
  }

  if (!candidates.length) {
    return result({ e164: null, country: null, countrySource: null, status: "needs_review", confidence: "none", reason: "No country code and no country information to add one." });
  }

  // 3. Code typed without "+" (e.g. "919876543210" from India).
  for (const candidate of candidates) {
    const rule = PHONE_COUNTRIES[candidate.iso];
    if (digits.startsWith(rule.code)) {
      const national = digits.slice(rule.code.length).replace(/^0/, "");
      if (validNational(national, candidate.iso) && !validNational(digits.replace(/^0/, ""), candidate.iso)) {
        return result({
          e164: `+${rule.code}${national}`,
          country: candidate.iso,
          countrySource: "number",
          status: "code_present",
          confidence: "high",
          reason: `Country code ${rule.code} was already typed; "+" added.`,
        });
      }
    }
  }

  // 4. Add the strongest candidate's code. Only the first candidate is used:
  //    falling through to a weaker hint would turn one person's mistake into
  //    a confident wrong number.
  const primary = candidates[0];
  const rule = PHONE_COUNTRIES[primary.iso];
  const national = digits.replace(/^0/, "");
  if (validNational(national, primary.iso)) {
    const confidence: PhoneConfidence = primary.source === "timezone"
      ? (rule.mobilePrefix ? "medium" : "low")
      : "medium";
    return result({
      e164: `+${rule.code}${national}`,
      country: primary.iso,
      countrySource: primary.source,
      status: "country_added",
      confidence,
      reason: `Added +${rule.code} from the ${primary.source.replace("_", " ")} (${primary.iso}).`,
    });
  }

  return result({
    e164: null,
    country: primary.iso,
    countrySource: primary.source,
    status: "needs_review",
    confidence: "none",
    reason: `Not a valid ${primary.iso} number without a country code; check it before messaging.`,
  });
}
