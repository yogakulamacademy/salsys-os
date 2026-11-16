// Ready-to-edit reply drafts for Inbox quick actions, and follow-up times.
// Pure functions: built from real batch data when we have it, with clear
// [placeholders] when we do not, so nothing is invented.

export type QuickBatch = {
  startDate: string; // YYYY-MM-DD
  location: string | null;
  mode: string | null;
  currency: string | null;
  price: number | null;
};

export type QuickReplies = { fees: string; dates: string; whatsapp: string };

const IST_OFFSET_MS = 330 * 60_000;

function money(amount: number, currency: string | null) {
  const code = (currency || "INR").toUpperCase();
  try {
    return new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-US", {
      style: "currency", currency: code, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString("en-IN")}`;
  }
}

function prettyDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

function where(b: QuickBatch) {
  return b.location || (b.mode ? b.mode.replaceAll("_", " ") : null);
}

/** Only greet by name when it looks like a real first name (not an Instagram handle). */
export function cleanFirstName(value?: string | null): string | null {
  const v = (value ?? "").trim();
  if (!/^[\p{L}'-]{2,20}$/u.test(v)) return null;
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

export function buildQuickReplies(input: {
  firstName?: string | null;
  courseName?: string | null;
  batches?: QuickBatch[];
}): QuickReplies {
  const name = cleanFirstName(input.firstName);
  const hi = name ? `Namaste ${name}!` : "Namaste!";
  const course = input.courseName && input.courseName !== "Not selected" ? input.courseName : null;
  const courseText = course ?? "[course]";
  const batches = (input.batches ?? []).slice(0, 3);
  const priced = batches.find((b) => b.price != null && b.price > 0);

  const dateLines = batches.length
    ? batches.map((b) => `• ${prettyDate(b.startDate)}${where(b) ? ` · ${where(b)}` : ""}`).join("\n")
    : "• [batch dates]";

  const fees = priced
    ? `${hi} The ${courseText} fee is ${money(priced.price!, priced.currency)}${where(priced) ? ` for the ${where(priced)} batch` : ""} starting ${prettyDate(priced.startDate)}.\n\nUpcoming batches:\n${dateLines}\n\nWould you like me to reserve a seat or send the full brochure?`
    : `${hi} The ${courseText} fee is [fee].\n\nUpcoming batches:\n${dateLines}\n\nWould you like me to reserve a seat or send the full brochure?`;

  const dates = `${hi} Here are the next ${courseText} batches:\n${dateLines}\n\nWhich date works best for you?`;

  const whatsapp = `${hi} To share the brochure, fees and batch details faster, could you send us your WhatsApp number with the country code? We'll message you there.`;

  return { fees, dates, whatsapp };
}

export type FollowupWhen = "2h" | "tomorrow" | "3d" | "week";

export const FOLLOWUP_WHENS: Array<[FollowupWhen, string]> = [
  ["2h", "In 2 hours"],
  ["tomorrow", "Tomorrow 10:00"],
  ["3d", "In 3 days"],
  ["week", "Next week"],
];

export type FollowupMethod = "whatsapp" | "call" | "email";

export const FOLLOWUP_METHODS: Array<[FollowupMethod, string]> = [
  ["whatsapp", "WhatsApp"],
  ["call", "Call"],
  ["email", "Email"],
];

/** 10:00 India time, `days` days after today's India date. */
function istMorning(now: Date, days: number) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const utc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + days, 10, 0, 0) - IST_OFFSET_MS;
  return new Date(utc);
}

export function followupDueAt(when: FollowupWhen, now = new Date()): Date {
  if (when === "2h") return new Date(now.getTime() + 2 * 3_600_000);
  if (when === "tomorrow") return istMorning(now, 1);
  if (when === "3d") return istMorning(now, 3);
  // Next week: the coming Monday 10:00 IST (at least one day ahead).
  const istDay = new Date(now.getTime() + IST_OFFSET_MS).getUTCDay(); // 0 Sun … 6 Sat
  const toMonday = ((8 - istDay) % 7) || 7;
  return istMorning(now, toMonday);
}

export function followupTitle(method: FollowupMethod) {
  return method === "call" ? "Call follow-up" : method === "email" ? "Email follow-up" : "WhatsApp follow-up";
}
