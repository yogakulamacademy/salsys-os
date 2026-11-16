/**
 * SalsysOS Organic Growth read-only skill evidence.
 *
 * Adapted from MIT-licensed workflows in Ryze-AI-Adgent/open-seo-mcp-skills
 * (Copyright (c) 2026 Ryze AI). No upstream MCP service is invoked.
 *
 * These functions are deterministic evidence processors, NOT AI generation.
 * Returned source rows are untrusted data, never tool or system instructions.
 */

export type OrganicQueryRow = {
  query: string;
  clicks: number | string | null;
  impressions: number | string | null;
  avg_position: number | string | null;
};

export type PaidSearchTermRow = {
  search_term: string;
  currency_code: string | null;
  spend: number | string | null;
  clicks: number | string | null;
  conversions: number | string | null;
  campaign_id: string | null;
};

export type GoogleAdsSyncHealthRow = {
  last_sync_status: string | null;
  latest_data_date: string | null;
  last_sync_error: string | null;
};

/**
 * Map provider health to a small allowlisted result. NEVER forward raw
 * Google Ads error bodies, account identifiers or tokens to an AI model.
 */
export function summarizeGoogleAdsSyncHealth(row: GoogleAdsSyncHealthRow | null) {
  const rawStatus = String(row?.last_sync_status ?? '').trim().toLowerCase();
  const syncStatus =
    rawStatus === 'success' || rawStatus === 'failed' || rawStatus === 'running'
      ? rawStatus : 'unknown';
  const rawDate = String(row?.latest_data_date ?? '').trim();
  const latestDataDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  const cloudAccessBlocked =
    syncStatus === 'failed' &&
    String(row?.last_sync_error ?? '').includes('CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION');

  const blockerCode = cloudAccessBlocked
    ? 'google_cloud_project_test_access'
    : syncStatus === 'failed'
      ? 'google_ads_sync_failure'
      : syncStatus === 'unknown'
        ? 'google_ads_sync_unverified'
        : null;

  return {
    status: cloudAccessBlocked ? 'configuration_blocked'
      : syncStatus === 'failed' ? 'sync_failed'
        : syncStatus === 'success' ? 'last_sync_succeeded'
          : 'unverified',
    blockerCode,
    syncStatus,
    latestDataDate,
    operatorNextStep: cloudAccessBlocked
      ? 'Apply for production Google Ads API access for the OAuth Cloud project (Explorer or higher), then verify a successful sync.'
      : syncStatus === 'failed'
        ? 'Investigate Google Ads sync health before using comparison findings.'
        : syncStatus === 'unknown'
          ? 'Verify connected Google Ads account, permissions and recent sync history.'
          : 'Confirm that paid search-term data is fresh and covers the intended comparison period.',
  };
}


export type OrganicCoverageInput = {
  organicExpected: number | null;
  organicRead: number;
  paidExpected: number | null;
  paidRead: number;
  gscLatestDate: string | null;
  adsLatestDate: string | null;
  adsSyncStatus: string;
  asOfDate: string;
};

function daysSinceDate(asOfDate: string, observedDate: string | null): number | null {
  if (!observedDate || !/^\d{4}-\d{2}-\d{2}$/.test(observedDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) return null;
  const today = Date.parse(asOfDate + 'T00:00:00Z');
  const observed = Date.parse(observedDate + 'T00:00:00Z');
  if (!Number.isFinite(today) || !Number.isFinite(observed)) return null;
  return Math.floor((today - observed) / 86400000);
}

/**
 * Integrity gate: a comparison is reviewable only with complete reads and
 * reasonably recent, healthy source data. This NEVER proves aligned periods,
 * incrementality, exhaustive Google search-term coverage or recoverable spend.
 */
export function assessOrganicComparisonCoverage(input: OrganicCoverageInput) {
  const organicComplete =
    Number.isSafeInteger(input.organicExpected) &&
    input.organicExpected !== null &&
    input.organicExpected >= 0 &&
    input.organicRead === input.organicExpected;
  const paidComplete =
    Number.isSafeInteger(input.paidExpected) &&
    input.paidExpected !== null &&
    input.paidExpected >= 0 &&
    input.paidRead === input.paidExpected;
  const gscAgeDays = daysSinceDate(input.asOfDate, input.gscLatestDate);
  const adsAgeDays = daysSinceDate(input.asOfDate, input.adsLatestDate);
  const gscFresh = gscAgeDays !== null && gscAgeDays >= 0 && gscAgeDays <= 7;
  const adsFresh = adsAgeDays !== null && adsAgeDays >= 0 && adsAgeDays <= 7;
  const syncHealthy = input.adsSyncStatus === 'last_sync_succeeded';
  const canCompareForInvestigation = organicComplete && paidComplete &&
    gscFresh && adsFresh && syncHealthy && input.organicRead > 0 && input.paidRead > 0;

  const reasons: string[] = [];
  if (!organicComplete || !paidComplete) reasons.push('incomplete_or_unverified_row_coverage');
  if (!gscFresh) reasons.push('gsc_data_stale_or_unverified');
  if (!adsFresh) reasons.push('ads_data_stale_or_unverified');
  if (!syncHealthy) reasons.push('google_ads_sync_not_healthy');
  if (input.organicRead === 0) reasons.push('no_observed_organic_queries');
  if (input.paidRead === 0) reasons.push('no_observed_paid_search_terms');

  return {
    comparisonReadiness: canCompareForInvestigation
      ? 'review_candidates_only' as const : 'blocked_incomplete_or_stale' as const,
    rows: {
      organicRead: input.organicRead,
      organicReported: input.organicExpected,
      paidRead: input.paidRead,
      paidReported: input.paidExpected,
      organicComplete,
      paidComplete,
    },
    asOfDate: input.asOfDate,
    gscLatestDate: input.gscLatestDate,
    adsLatestDate: input.adsLatestDate,
    gscAgeDays,
    adsAgeDays,
    periodAlignmentVerified: false as const,
    reasons,
    neverInferSavings: true as const,
  };
}

export type KeywordPageRow = {
  query: string;
  leader_page: string | null;
  impressions: number | string | null;
  clicks: number | string | null;
  avg_position: number | string | null;
  recommendation: string | null;
};

const sourceLimitations = [
  'Google Search Console reports observed query-level impressions and average positions, not live rank or guaranteed clicks.',
  'Google Ads search terms can be incomplete because of reporting thresholds, campaign types and source coverage.',
  'Search Console and Ads 30-day reporting views may use different cutoff dates; window alignment is not verified.',
  'Overlap does not establish incrementality, wasted spend, recoverable clicks or possible savings.',
  'Google Ads conversions are platform-reported; do not treat them as CRM payments, enrollments or revenue.',
  'No ad bids, keyword negatives, website content, CRM records or messages are changed by these tools.',
];

export const ORGANIC_GROWTH_READ_ONLY_TOOLS = [
  {
    name: 'salsys_content_brief_evidence_v1',
    description:
      'Fetch authenticated, tenant-scoped Search Console query and existing-page evidence for a HUMAN-REVIEWED content brief. No live SERP or DataForSEO evidence is implied.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        topic: { type: 'string', minLength: 3, maxLength: 120 },
      },
      required: ['topic'],
    },
  },
  {
    name: 'salsys_seo_vs_ads_evidence_v1',
    description:
      'Compare authenticated, tenant-scoped 30-day Google Ads search terms with observed Search Console queries. Find REVIEW CANDIDATES only; never claim wasted spend or savings.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
] as const;

export type OrganicGrowthToolName =
  (typeof ORGANIC_GROWTH_READ_ONLY_TOOLS)[number]['name'];

/**
 * Minimize sensitive raw search strings before any external AI exposure.
 * Source metrics remain on the server; PII-like / overly long queries are
 * omitted rather than copied verbatim into Claude context.
 */
export function safeOrganicQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!clean || clean.length > 180) return null;
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(clean)) return null;
  if (/(?:\+?\d[\s().-]*){10,}/.test(clean)) return null;
  return clean;
}

function safeObservedPageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    url.search = '';
    url.hash = '';
    const cleaned = url.toString();
    return cleaned.length <= 400 ? cleaned : null;
  } catch {
    return null;
  }
}

export function normalizeOrganicQuery(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function numeric(raw: unknown): number {
  if (typeof raw !== 'number' && typeof raw !== 'string') return 0;
  if (raw === '') return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function nonNegative(raw: unknown): number {
  return Math.max(0, numeric(raw));
}

function averagePosition(raw: unknown): number | null {
  const value = numeric(raw);
  return value > 0 ? Math.round(value * 100) / 100 : null;
}

function topicTerms(topic: string): string[] {
  const ignore = new Set([
    'with', 'from', 'that', 'this', 'your', 'into', 'about', 'online',
    'best', 'course', 'courses', 'training', 'teacher', 'hour', 'hours',
    'what', 'where', 'when', 'which', 'have', 'would', 'should', 'more',
  ]);
  return normalizeOrganicQuery(topic)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3 && !ignore.has(term))
    .slice(0, 12);
}

/** Trusted matching terms are derived on the server from a bounded user topic. */
export function primaryTopicTerm(topic: string): string {
  const terms = topicTerms(topic);
  return terms.sort((a, b) => b.length - a.length)[0] || '';
}

export function buildContentBriefEvidence(
  topic: string,
  queries: OrganicQueryRow[],
  pages: KeywordPageRow[],
) {
  const terms = topicTerms(topic);
  const isRelevant = (q: string) => terms.length > 0 &&
    terms.some((term) => normalizeOrganicQuery(q).includes(term));

  const matched = queries.filter((row) => Boolean(safeOrganicQuery(row.query)) && isRelevant(row.query))
    .sort((a, b) => nonNegative(b.impressions) - nonNegative(a.impressions))
    .slice(0, 50)
    .map((row) => ({
      query: safeOrganicQuery(row.query)!,
      clicks: nonNegative(row.clicks),
      impressions: nonNegative(row.impressions),
      averagePosition: averagePosition(row.avg_position),
      source: 'google_search_console_observed',
    }));

  const existingPages = pages.filter((row) =>
    Boolean(safeOrganicQuery(row.query)) &&
    Boolean(safeObservedPageUrl(row.leader_page)) && isRelevant(row.query))
    .sort((a, b) => nonNegative(b.impressions) - nonNegative(a.impressions))
    .slice(0, 25)
    .map((row) => ({
      query: safeOrganicQuery(row.query)!,
      page: safeObservedPageUrl(row.leader_page)!, 
      clicks: nonNegative(row.clicks),
      impressions: nonNegative(row.impressions),
      averagePosition: averagePosition(row.avg_position),
      source: 'salsys_keyword_intelligence_30d',
    }));

  return {
    tool: 'salsys_content_brief_evidence_v1' as const,
    status: matched.length ? 'evidence_available' as const : 'insufficient_search_evidence' as const,
    topic,
    evidence: { searchQueries: matched, existingPages },
    limitations: [
      'The result is an evidence pack for a proposed brief, not a written or approved article.',
      'Only the tenant Search Console data and recorded keyword-page mappings are used.',
      'This tool has not checked a live SERP, competitor pages, People Also Ask, search volume or keyword difficulty.',
      'Missing pages/queries are unknown, not proof that a site does not rank.',
      'Model-generated headings, entities and content claims require independent verification and human editorial review.',
    ],
    requiresHumanReview: true as const,
  };
}

type PaidOverlapCandidate = {
  query: string;
  currency: string;
  paidSpend: number;
  paidClicks: number;
  adsConversions: number;
  organicClicks: number;
  organicImpressions: number;
  organicAveragePosition: number | null;
  evidence: readonly ['google_ads_search_term_30d', 'google_search_console_query_30d'];
};

export function buildSeoVsAdsEvidence(
  organicRows: OrganicQueryRow[],
  paidRows: PaidSearchTermRow[],
) {
  const organicByTerm = new Map<string, {
    query: string; clicks: number; impressions: number; weightedPosition: number;
  }>();
  for (const row of organicRows) {
    const safeQuery = safeOrganicQuery(row.query);
    if (!safeQuery) continue;
    const key = normalizeOrganicQuery(safeQuery);
    if (!key) continue;
    const existing = organicByTerm.get(key) ?? {
      query: row.query, clicks: 0, impressions: 0, weightedPosition: 0,
    };
    const impressions = nonNegative(row.impressions);
    existing.clicks += nonNegative(row.clicks);
    existing.impressions += impressions;
    existing.weightedPosition += numeric(row.avg_position) * impressions;
    organicByTerm.set(key, existing);
  }

  // Aggregate terms by currency. Combining different currencies is forbidden.
  const paidByTermCurrency = new Map<string, {
    term: string; currency: string; spend: number; clicks: number; conversions: number;
  }>();
  for (const row of paidRows) {
    const safeTerm = safeOrganicQuery(row.search_term);
    if (!safeTerm) continue;
    const term = normalizeOrganicQuery(safeTerm);
    if (!term) continue;
    const currency = String(row.currency_code || 'UNKNOWN').trim().toUpperCase();
    const key = JSON.stringify([term, currency]);
    const existing = paidByTermCurrency.get(key) ?? {
      term, currency, spend: 0, clicks: 0, conversions: 0,
    };
    existing.spend += nonNegative(row.spend);
    existing.clicks += nonNegative(row.clicks);
    existing.conversions += nonNegative(row.conversions);
    paidByTermCurrency.set(key, existing);
  }

  const overlap: PaidOverlapCandidate[] = [];
  const paidWithoutObservedOrganic: Array<{
    query: string; currency: string; spend: number; clicks: number;
  }> = [];
  for (const paid of paidByTermCurrency.values()) {
    if (paid.spend <= 0) continue;
    const organic = organicByTerm.get(paid.term);
    if (!organic || organic.impressions <= 0) {
      paidWithoutObservedOrganic.push({
        query: paid.term, currency: paid.currency,
        spend: Math.round(paid.spend * 100) / 100,
        clicks: paid.clicks,
      });
      continue;
    }
    overlap.push({
      query: paid.term,
      currency: paid.currency,
      paidSpend: Math.round(paid.spend * 100) / 100,
      paidClicks: paid.clicks,
      adsConversions: paid.conversions,
      organicClicks: organic.clicks,
      organicImpressions: organic.impressions,
      organicAveragePosition: organic.impressions > 0
        ? Math.round((organic.weightedPosition / organic.impressions) * 100) / 100
        : null,
      evidence: ['google_ads_search_term_30d', 'google_search_console_query_30d'],
    });
  }

  const status = !organicRows.length
    ? 'insufficient_organic_evidence' as const
    : !paidRows.length
      ? 'insufficient_paid_evidence' as const
      : 'review_candidates_only' as const;

  return {
    tool: 'salsys_seo_vs_ads_evidence_v1' as const,
    status,
    counts: {
      organicRows: organicRows.length,
      paidSearchTermRows: paidRows.length,
      overlapCandidates: status === 'review_candidates_only' ? overlap.length : 0,
    },
    overlap: status === 'review_candidates_only'
      ? overlap.sort((a, b) => b.paidSpend - a.paidSpend).slice(0, 30)
      : [],
    paidWithoutObservedOrganic: status === 'review_candidates_only'
      ? paidWithoutObservedOrganic.sort((a, b) => b.spend - a.spend).slice(0, 30)
      : [],
    estimatedWaste: null,
    estimatedSavings: null,
    limitations: sourceLimitations,
    requiresHumanReview: true as const,
  };
}
