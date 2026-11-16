// Website price extraction v1 — reads course prices from pages the SEO crawler
// already stored (seo_page_snapshots.readable_text). No crawling happens here.
// Output is a SUGGESTION: a manager approves before any batch price changes.
//
// Price policy (organization decision, 16 Nov 2026):
//   * the website's OFFER price is the selling price (stored as the batch price);
//   * the crossed-out REGULAR price is kept for reference only;
//   * Indian (INR) prices are converted from USD and always need approval.

export type ExtractedBatchPrice = {
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  privatePrice: number | null;
  sharedPrice: number | null;
};

export type ExtractedPagePrices = {
  currency: 'USD';
  summary: { privateOffer: number | null; privateRegular: number | null; sharedOffer: number | null; sharedRegular: number | null } | null;
  batches: ExtractedBatchPrice[];
  offerExpired: boolean;
  flags: string[];
};

export type PageCourseMatch = { courseCode: string; location: string } | null;

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function money(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "7th December 2026" → "2026-12-07" */
export function parseLongDate(raw: string): string | null {
  const m = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(20\d\d)/.exec(raw);
  if (!m) return null;
  const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
  const day = Number(m[1]);
  if (!month || day < 1 || day > 31) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function extractPagePrices(text: string): ExtractedPagePrices {
  const flags: string[] = [];
  const clean = text.replace(/\s+/g, ' ');

  // "Course Highlights: Private Room $1500 $2050 Shared Room $1250 $1750" (offer, then regular)
  const sum = /Private Room\s*\$\s?([\d,]+)\s*(?:\$\s?([\d,]+))?\s*(?:Shared|Twin)(?: Room| Share)?\s*\$\s?([\d,]+)\s*(?:\$\s?([\d,]+))?/i.exec(clean);
  const summary = sum
    ? { privateOffer: money(sum[1]), privateRegular: money(sum[2]), sharedOffer: money(sum[3]), sharedRegular: money(sum[4]) }
    : null;
  if (summary && summary.sharedRegular !== null && summary.sharedOffer !== null && summary.sharedRegular < summary.sharedOffer) {
    flags.push('Regular shared price is lower than the offer price on the page');
  }

  // "Start Date 7th December 2026 End Date 30th December 2026 Room Type Private Room : $1500 Twin Share : $1250"
  const batches: ExtractedBatchPrice[] = [];
  const re = /Start Date\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+20\d\d)\s+End Date\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+20\d\d)?[^$]{0,80}?Private Room\s*:?\s*\$\s?([\d,]+)(?:[^$]{0,40}?(?:Twin|Shared)(?: Share| Room)?\s*:?\s*\$\s?([\d,]+))?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(clean)) !== null) {
    const startDate = parseLongDate(match[1]);
    if (!startDate) continue;
    const row = { startDate, endDate: match[2] ? parseLongDate(match[2]) : null, privatePrice: money(match[3]), sharedPrice: money(match[4]) };
    if (row.privatePrice === null && row.sharedPrice === null) continue;
    if (!batches.some((b) => b.startDate === row.startDate)) batches.push(row);
  }

  const offerExpired = /offer has expired/i.test(clean);
  if (offerExpired) flags.push('Page says the offer has expired');
  if (!batches.length && !summary) flags.push('No prices found on the page');
  if (summary && batches.length && summary.privateOffer !== null && batches.some((b) => b.privatePrice !== null && b.privatePrice !== summary.privateOffer)) {
    flags.push('Batch prices differ from the course summary price');
  }
  return { currency: 'USD', summary, batches, offerExpired, flags };
}

const LOCATIONS: Array<[RegExp, string]> = [[/\/mysore\//, 'Mysore'], [/\/kerala\//, 'Kerala'], [/\/bengaluru\//, 'Bengaluru'], [/\/online\//, 'Online']];
const COURSES: Array<[RegExp, string]> = [
  [/sound-healing-meditation-master/, 'SOUND-MASTER'],
  [/sound-healing-meditation-course-level-2/, 'SOUND-L2'],
  [/sound-healing-meditation-course-level-1/, 'SOUND-L1'],
  [/kundalini/, '100H-KUNDALINI'],
  [/online-prenatal|online-pregnancy/, 'ONLINE-PRENATAL'],
  [/prenatal/, '85H-PRENATAL'],
  [/online-200-hour/, 'ONLINE-200H'],
  [/online-kids/, 'KIDS-YOGA'],
  [/online-face/, 'FACE-YOGA'],
  [/nutrition/, 'NUTRITION'],
  [/ayurveda-retreat/, 'AYURVEDA-RETREAT'],
  [/yoga-retreat/, 'YOGA-RETREAT'],
  [/500-hour/, '500H-YTT'],
  [/300-hour/, '300H-YTT'],
  [/200-hour/, '200H-YTT'],
  [/100-hour/, '100H-YTT'],
];

/** Maps a yogakulam.com course page URL to a course code and location. */
export function matchCoursePage(url: string): PageCourseMatch {
  const path = url.toLowerCase();
  if (!/\/courses\//.test(path)) return null;
  const location = LOCATIONS.find(([re]) => re.test(path))?.[1];
  const courseCode = COURSES.find(([re]) => re.test(path))?.[1];
  return location && courseCode ? { courseCode, location } : null;
}

/** True when a CRM batch location belongs to the page location (e.g. "Varkala, Kerala" → Kerala). */
export function locationMatches(batchLocation: string | null, pageLocation: string): boolean {
  const value = (batchLocation ?? '').toLowerCase();
  if (pageLocation === 'Kerala') return /kerala|varkala|paravur/.test(value);
  if (pageLocation === 'Bengaluru') return /bengaluru|bangalore/.test(value);
  return value.includes(pageLocation.toLowerCase());
}

/** USD → INR suggestion, rounded to the nearest ₹500. Always needs approval. */
export function suggestInr(usd: number | null, rate: number): number | null {
  if (usd === null || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round((usd * rate) / 500) * 500;
}

/** Snapshot freshness: older than this is flagged. */
export const MAX_SNAPSHOT_AGE_DAYS = 7;

export function snapshotAgeDays(fetchedAt: string, now = new Date()): number {
  return Math.floor((now.getTime() - new Date(fetchedAt).getTime()) / 86_400_000);
}
