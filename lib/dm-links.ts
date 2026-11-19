// Tracked course links for DMs (DM-LINK). Pure helpers, no I/O.
//
// A lead gets go.yogakulamacademy.com/<code>. Opening it records the approximate
// country of the network it was opened from ("visit country") and forwards to the
// course page. Owner decision (19 Nov 2026): the visit country is shown to the
// team only; the team decides pricing. It is never nationality or residence.

export const TRACKED_LINK_HOST = "go.yogakulamacademy.com";
export const TRACKED_LINK_FALLBACK = "https://www.yogakulamacademy.com/";
/** A sent link that is not opened within this time (and no reply) becomes a team task. */
export const NO_OPEN_AFTER_MS = 12 * 3_600_000;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // no 0/O, 1/l/I

/** Random, unguessable code (10 chars, ~57 bits). Uses Web Crypto, available in Node and the edge. */
export function newLinkCode(length = 10): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

export function trackedLinkUrl(code: string): string {
  return `https://${TRACKED_LINK_HOST}/${code}`;
}

export function isLinkCode(code: string | null | undefined): code is string {
  return typeof code === "string" && /^[A-Za-z0-9]{8,16}$/.test(code);
}

/** Only our own course pages may be link destinations. */
export function isAllowedDestination(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https:\/\/(www\.)?yogakulamacademy\.com\//.test(url);
}

/**
 * Course page for the lead: the Kerala page when the lead prefers Kerala and one
 * exists, otherwise the main page saved on the course.
 */
export function courseDestination(
  courseMetadata: Record<string, unknown> | null | undefined,
  preferredLocation?: string | null,
): string | null {
  const md = courseMetadata ?? {};
  const main = typeof md.website_url === "string" ? md.website_url : null;
  const kerala = typeof md.website_url_kerala === "string" ? md.website_url_kerala : null;
  const pick = /kerala/i.test(preferredLocation ?? "") && isAllowedDestination(kerala) ? kerala : main;
  return isAllowedDestination(pick) ? pick : null;
}

const PREVIEW_AGENTS =
  /(facebookexternalhit|facebookcatalog|meta-externalagent|meta-externalfetcher|whatsapp|instagram.*preview|twitterbot|slackbot|discordbot|telegrambot|linkedinbot|skypeuripreview|googlebot|google-inspectiontool|adsbot|bingbot|bingpreview|yandex|baiduspider|duckduckbot|applebot|embedly|iframely|preview|bot\b|crawler|spider|scanner|curl\/|wget\/|python-requests|python-urllib|go-http-client|okhttp|java\/|headless|lighthouse|vercel-screenshot)/i;

/**
 * Is this request a person opening the link, or a link preview / bot / scanner?
 * Instagram fetches every link sent in a DM to build its preview; that must never
 * count as an open. Only a real browser GET counts.
 */
export function classifyLinkRequest(input: {
  method: string;
  userAgent: string | null | undefined;
  purpose?: string | null; // Sec-Purpose / Purpose header (prefetch)
}): { kind: "open" | "preview_or_bot"; agent: string } {
  const ua = (input.userAgent ?? "").trim();
  const agent = agentFamily(ua);
  if (input.method.toUpperCase() !== "GET") return { kind: "preview_or_bot", agent };
  if (/prefetch|prerender|preview/i.test(input.purpose ?? "")) return { kind: "preview_or_bot", agent };
  if (!ua || PREVIEW_AGENTS.test(ua)) return { kind: "preview_or_bot", agent };
  if (!/mozilla\/5\.0/i.test(ua)) return { kind: "preview_or_bot", agent };
  return { kind: "open", agent };
}

/** Short browser family for the visit log (never the full user agent). */
export function agentFamily(ua: string): string {
  if (!ua) return "unknown";
  if (/facebookexternalhit|meta-external/i.test(ua)) return "meta_preview";
  if (/Instagram/i.test(ua)) return "instagram_inapp";
  if (/FBAN|FBAV/i.test(ua)) return "facebook_inapp";
  if (/WhatsApp/i.test(ua)) return "whatsapp";
  if (/bot|crawler|spider|preview/i.test(ua)) return "bot";
  if (/Android/i.test(ua)) return "android_browser";
  if (/iPhone|iPad|iOS/i.test(ua)) return "ios_browser";
  if (/Windows|Macintosh|Linux/i.test(ua)) return "desktop_browser";
  return "other";
}

/** Country names for the few codes the team sees most; anything else shows the code. */
const COUNTRY_NAMES: Record<string, string> = {
  IN: "India", AE: "UAE", US: "USA", GB: "UK", AU: "Australia", CA: "Canada", DE: "Germany", FR: "France",
  SG: "Singapore", MY: "Malaysia", SA: "Saudi Arabia", QA: "Qatar", OM: "Oman", KW: "Kuwait", BH: "Bahrain",
  NP: "Nepal", LK: "Sri Lanka", NL: "Netherlands", IT: "Italy", ES: "Spain", CH: "Switzerland", IE: "Ireland",
  NZ: "New Zealand", ZA: "South Africa", RU: "Russia", JP: "Japan", IL: "Israel", BR: "Brazil", MX: "Mexico",
};
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/**
 * Should a sent link become a "hasn't opened the link" task for the team?
 * Only when it was sent 12h+ ago, never opened, the lead hasn't written since,
 * the lead is still open, and no such task exists yet.
 */
export function noOpenTaskDue(input: {
  sentAt: string | null;
  firstOpenedAt: string | null;
  attentionTaskId: string | null;
  revokedAt: string | null;
  lastInboundAt: string | null;
  leadClosed: boolean;
  now: Date;
}): boolean {
  if (!input.sentAt || input.firstOpenedAt || input.attentionTaskId || input.revokedAt || input.leadClosed) return false;
  const sent = Date.parse(input.sentAt);
  if (!Number.isFinite(sent) || input.now.getTime() - sent < NO_OPEN_AFTER_MS) return false;
  const inbound = Date.parse(input.lastInboundAt ?? "");
  if (Number.isFinite(inbound) && inbound > sent) return false; // they replied: the conversation is alive
  return true;
}
