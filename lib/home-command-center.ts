/**
 * Pure helpers for the Home Command Center (no server or React imports, so
 * they are unit tested directly).
 *
 * Rules that keep the page honest:
 * - A period change is only shown when the earlier period has a meaningful
 *   baseline; otherwise "no baseline" is shown instead of a huge percentage.
 * - Locations are normalised from free-text CRM fields; unrecognised values
 *   are counted, never guessed onto the map.
 */

export const MIN_COMPARABLE_BASELINE = 30;

export type ChipTone = "up" | "down" | "flat" | "warn";

export type Chip = { text: string; tone: ChipTone };

export function comparableChange(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (
    typeof current !== "number" ||
    typeof previous !== "number" ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    current < 0 ||
    previous < MIN_COMPARABLE_BASELINE
  ) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

export function changeChip(
  current: number | null | undefined,
  previous: number | null | undefined,
): Chip {
  const change = comparableChange(current, previous);
  if (change == null) return { text: "No baseline yet", tone: "flat" };
  if (change === 0) return { text: "No change", tone: "flat" };
  return {
    text: `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}% vs previous`,
    tone: change > 0 ? "up" : "down",
  };
}

export function sparklinePoints(
  values: readonly number[],
  width: number,
  height: number,
): { line: string; area: string } {
  const clean = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const series = clean.length > 1 ? clean : [clean[0] ?? 0, clean[0] ?? 0];
  const max = Math.max(1, ...series);
  const step = width / (series.length - 1);
  const points = series.map((value, index) => {
    const x = index * step;
    const y = height - 3 - (value / max) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return {
    line: points.join(" "),
    area: `0,${height} ${points.join(" ")} ${width},${height}`,
  };
}

/** Approximate country centroids as [longitude, latitude]. */
export const COUNTRY_CENTROIDS: Record<string, readonly [number, number]> = {
  India: [78.9, 21],
  "United States": [-98, 39],
  "United Kingdom": [-2, 54],
  Canada: [-106, 56],
  Australia: [134, -25],
  "United Arab Emirates": [54, 24],
  Qatar: [51.2, 25.3],
  "Saudi Arabia": [45, 24],
  Nepal: [84, 28.4],
  "Sri Lanka": [80.7, 7.9],
  Bangladesh: [90.3, 23.7],
  Singapore: [103.8, 1.35],
  Malaysia: [102, 4],
  Mauritius: [57.5, -20.3],
  Germany: [10.4, 51],
  France: [2.2, 46.2],
  Italy: [12.5, 42.8],
  Spain: [-3.7, 40.4],
  Netherlands: [5.3, 52.1],
  Croatia: [15.2, 45.1],
  Serbia: [21, 44],
  Greece: [21.8, 39],
  Russia: [90, 60],
  Japan: [138, 36],
  China: [104, 35],
  Brazil: [-51, -10],
  Mexico: [-102, 23],
  "South Africa": [24, -29],
  "New Zealand": [174, -41],
};

const COUNTRY_ALIASES: Record<string, string> = {
  in: "India", ind: "India", india: "India", bharat: "India", indian: "India", indis: "India", indai: "India",
  us: "United States", usa: "United States", "u.s.": "United States", "u.s.a.": "United States",
  "united states": "United States", "united states of america": "United States", america: "United States",
  uk: "United Kingdom", gb: "United Kingdom", gbr: "United Kingdom", "united kingdom": "United Kingdom",
  england: "United Kingdom", scotland: "United Kingdom", wales: "United Kingdom", britain: "United Kingdom",
  "great britain": "United Kingdom",
  ca: "Canada", can: "Canada", canada: "Canada",
  au: "Australia", aus: "Australia", australia: "Australia",
  ae: "United Arab Emirates", uae: "United Arab Emirates", "united arab emirates": "United Arab Emirates",
  dubai: "United Arab Emirates",
  qa: "Qatar", qatar: "Qatar",
  sa: "Saudi Arabia", "saudi arabia": "Saudi Arabia",
  np: "Nepal", nepal: "Nepal",
  lk: "Sri Lanka", "sri lanka": "Sri Lanka",
  bd: "Bangladesh", bangladesh: "Bangladesh",
  sg: "Singapore", singapore: "Singapore",
  my: "Malaysia", malaysia: "Malaysia",
  mu: "Mauritius", mauritius: "Mauritius",
  de: "Germany", germany: "Germany", deutschland: "Germany",
  fr: "France", france: "France",
  it: "Italy", italy: "Italy",
  es: "Spain", spain: "Spain",
  nl: "Netherlands", netherlands: "Netherlands",
  hr: "Croatia", croatia: "Croatia",
  rs: "Serbia", serbia: "Serbia",
  gr: "Greece", greece: "Greece",
  ru: "Russia", russia: "Russia",
  jp: "Japan", japan: "Japan",
  cn: "China", china: "China",
  br: "Brazil", brazil: "Brazil",
  mx: "Mexico", mexico: "Mexico",
  za: "South Africa", "south africa": "South Africa",
  nz: "New Zealand", "new zealand": "New Zealand",
};

/** Indian states and large cities people type into a "country" field. */
const INDIA_PLACES = [
  "kerala", "karnataka", "tamil nadu", "tamilnadu", "maharashtra", "odisha", "orissa", "goa", "gujarat", "rajasthan",
  "punjab", "haryana", "delhi", "uttar pradesh", "uttarakhand", "himachal", "bihar", "west bengal",
  "assam", "telangana", "andhra", "madhya pradesh", "jharkhand", "chhattisgarh", "pune", "mumbai",
  "bangalore", "bengaluru", "chennai", "hyderabad", "kolkata", "rishikesh", "mysore", "mysuru",
  "kochi", "cochin", "idukki", "trivandrum", "thiruvananthapuram", "kozhikode", "calicut",
];

export function normalizeCountry(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!value) return null;
  const direct = COUNTRY_ALIASES[value] ?? COUNTRY_ALIASES[value.replace(/[.,]+$/, "")];
  if (direct) return direct;
  if (INDIA_PLACES.some((place) => value.includes(place))) return "India";
  const lastPart = value.split(",").map((part) => part.trim()).filter(Boolean).pop();
  if (lastPart && COUNTRY_ALIASES[lastPart]) return COUNTRY_ALIASES[lastPart];
  return null;
}

export type LocationRow = {
  name: string;
  leads: number;
  lon: number | null;
  lat: number | null;
};

export type LocationBreakdown = {
  total: number;
  /** Leads with any location text. */
  filled: number;
  /** Leads whose location text was recognised as a country. */
  recognised: number;
  rows: LocationRow[];
};

export function buildLocationBreakdown(
  values: readonly (string | null | undefined)[],
): LocationBreakdown {
  const counts = new Map<string, number>();
  let filled = 0;
  for (const raw of values) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    filled += 1;
    const country = normalizeCountry(raw);
    if (country) counts.set(country, (counts.get(country) ?? 0) + 1);
  }
  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, leads]) => {
      const point = COUNTRY_CENTROIDS[name];
      return { name, leads, lon: point ? point[0] : null, lat: point ? point[1] : null };
    });
  const recognised = rows.reduce((sum, row) => sum + row.leads, 0);
  return { total: values.length, filled, recognised, rows };
}

export function percentOf(part: number, whole: number, digits = 0): string {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return "—";
  return `${((part / whole) * 100).toFixed(digits)}%`;
}

export type HomeInsight = {
  id: string;
  title: string;
  detail: string;
  value: string;
  tone: ChipTone;
  href: string;
};

type InsightSource = { source: string; leads: number; qualified: number };

const MIN_SOURCE_LEADS = 5;
const MIN_BEST_QUALIFIED = 3;
const MIN_BEST_RATE = 0.05;

/**
 * Up to three deterministic, evidence-backed observations. They describe what
 * the CRM recorded; they do not claim a cause or predict an outcome.
 */
export function buildHomeInsights(input: {
  sources: readonly InsightSource[] | null;
  currentLeads: number | null;
  previousLeads: number | null;
}): HomeInsight[] {
  const insights: HomeInsight[] = [];
  const sources = (input.sources ?? []).filter(
    (row) => Number.isSafeInteger(row.leads) && row.leads >= MIN_SOURCE_LEADS && row.qualified >= 0 && row.qualified <= row.leads,
  );
  const rateOf = (row: InsightSource) => row.qualified / row.leads;
  const formatRate = (value: number) => `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
  const total = (input.sources ?? []).reduce((sum, row) => sum + (row.leads > 0 ? row.leads : 0), 0);

  const largest = [...sources].sort((a, b) => b.leads - a.leads)[0];
  const ranked = [...sources].filter((row) => row.qualified >= MIN_BEST_QUALIFIED && rateOf(row) >= MIN_BEST_RATE).sort((a, b) => rateOf(b) - rateOf(a) || b.leads - a.leads);
  const candidate = ranked[0];
  // "Qualifies best" only means something against another source of real size.
  const best = candidate && sources.some((row) => row.source !== candidate.source && rateOf(row) < rateOf(candidate))
    ? candidate
    : undefined;

  if (largest && total > 0 && largest.leads / total >= 0.5 && best && best.source !== largest.source && rateOf(largest) < rateOf(best)) {
    insights.push({
      id: "volume-vs-quality",
      title: `${largest.source} brings volume, not qualification`,
      detail: `${largest.leads.toLocaleString("en-IN")} leads · ${largest.qualified.toLocaleString("en-IN")} qualified`,
      value: formatRate(rateOf(largest)),
      tone: "down",
      href: "/home/sources",
    });
  }
  if (best) {
    insights.push({
      id: "best-source",
      title: `${best.source} leads qualify best`,
      detail: `${best.qualified.toLocaleString("en-IN")} of ${best.leads.toLocaleString("en-IN")} leads qualified`,
      value: formatRate(rateOf(best)),
      tone: "up",
      href: "/home/sources",
    });
  }
  const change = comparableChange(input.currentLeads, input.previousLeads);
  if (change != null && change !== 0 && input.currentLeads != null && input.previousLeads != null) {
    insights.push({
      id: "lead-trend",
      title: change > 0 ? "Enquiries growing" : "Enquiries slowing",
      detail: `${input.currentLeads.toLocaleString("en-IN")} this period vs ${input.previousLeads.toLocaleString("en-IN")} before`,
      value: `${change > 0 ? "+" : ""}${change}%`,
      tone: change > 0 ? "up" : "down",
      href: "/leads",
    });
  }
  return insights.slice(0, 3);
}
