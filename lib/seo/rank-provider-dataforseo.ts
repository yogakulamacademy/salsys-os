import 'server-only';

export type DataForSeoSurface = 'seo' | 'aeo' | 'geo';

export type DataForSeoRankInput = {
  query: string;
  surface: DataForSeoSurface;
  locale: string;
  countryCode: string;
  device: 'desktop' | 'mobile';
  engine: string;
  ownDomain: string;
  competitorDomains: string[];
};

export type NormalizedRankResult = {
  provider: 'dataforseo';
  own_position: number | null;
  own_url: string | null;
  own_title: string | null;
  answer_visibility: boolean | null;
  ai_cited: boolean | null;
  ai_citation_position: number | null;
  ai_provider: string | null;
  competitor_results: Array<Record<string, unknown>>;
  serp_features: string[];
};

type UnknownRecord = Record<string, unknown>;

type SerpCandidate = {
  type: string;
  rank: number | null;
  domain: string;
  url: string;
  title: string;
};

type CitationCandidate = {
  domain: string;
  url: string;
  title: string;
  index: number;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeDomain(value: string) {
  const input = value.trim().toLowerCase();
  if (!input) return '';
  try {
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return input.replace(/^www\./, '').split('/')[0];
  }
}

function sameDomain(left: string, right: string) {
  const a = normalizeDomain(left);
  const b = normalizeDomain(right);
  return Boolean(a && b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)));
}

function languageCode(locale: string) {
  const code = locale.trim().split(/[-_]/)[0]?.toLowerCase();
  return code && /^[a-z]{2,3}$/.test(code) ? code : 'en';
}

const COUNTRY_NAMES: Record<string, string> = {
  IN: 'India',
  US: 'United States',
  GB: 'United Kingdom',
  AU: 'Australia',
  CA: 'Canada',
  AE: 'United Arab Emirates',
  SG: 'Singapore',
  MY: 'Malaysia',
  DE: 'Germany',
  AT: 'Austria',
  IT: 'Italy',
  FR: 'France',
  ES: 'Spain',
  NL: 'Netherlands',
};

function locationName(countryCode: string) {
  const code = countryCode.trim().toUpperCase();
  return COUNTRY_NAMES[code] || code || 'India';
}

function collectRecords(value: unknown, output: UnknownRecord[] = []): UnknownRecord[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, output);
    return output;
  }
  const record = asRecord(value);
  if (!record) return output;
  output.push(record);
  for (const child of Object.values(record)) {
    if (child && (Array.isArray(child) || typeof child === 'object')) collectRecords(child, output);
  }
  return output;
}

function parseTaskPayload(payload: UnknownRecord) {
  const topStatus = asNumber(payload.status_code);
  if (topStatus !== 20000) {
    throw new Error(`SEO_RANK_PROVIDER_FAILED_DATAFORSEO_${topStatus ?? 'UNKNOWN'}`);
  }

  const task = asRecord(asArray(payload.tasks)[0]);
  if (!task) throw new Error('SEO_RANK_PROVIDER_FAILED_DATAFORSEO_TASK_MISSING');
  const taskStatus = asNumber(task.status_code);
  if (taskStatus !== 20000) {
    throw new Error(`SEO_RANK_PROVIDER_FAILED_DATAFORSEO_TASK_${taskStatus ?? 'UNKNOWN'}`);
  }

  const result = asRecord(asArray(task.result)[0]);
  if (!result) throw new Error('SEO_RANK_PROVIDER_FAILED_DATAFORSEO_RESULT_MISSING');
  return result;
}

function extractSerpCandidates(records: UnknownRecord[]) {
  const candidates: SerpCandidate[] = [];
  for (const record of records) {
    const type = asString(record.type);
    const domain = normalizeDomain(asString(record.domain));
    const url = asString(record.url);
    if (!domain && url) {
      try {
        candidates.push({
          type,
          rank: asNumber(record.rank_absolute) ?? asNumber(record.rank_group),
          domain: normalizeDomain(new URL(url).hostname),
          url,
          title: asString(record.title),
        });
      } catch {
        // Ignore malformed provider URLs.
      }
      continue;
    }
    if (!domain) continue;
    candidates.push({
      type,
      rank: asNumber(record.rank_absolute) ?? asNumber(record.rank_group),
      domain,
      url,
      title: asString(record.title),
    });
  }
  return candidates;
}

function extractCitations(records: UnknownRecord[]) {
  const citations: CitationCandidate[] = [];
  let index = 0;
  for (const record of records) {
    const type = asString(record.type);
    if (type !== 'ai_overview_reference') continue;
    index += 1;
    const domain = normalizeDomain(asString(record.domain));
    const url = asString(record.url);
    let resolvedDomain = domain;
    if (!resolvedDomain && url) {
      try { resolvedDomain = normalizeDomain(new URL(url).hostname); } catch { /* ignore */ }
    }
    if (!resolvedDomain) continue;
    citations.push({ domain: resolvedDomain, url, title: asString(record.title), index });
  }
  return citations;
}

function itemTypes(result: UnknownRecord, records: UnknownRecord[]) {
  const direct = asArray(result.item_types).map(asString).filter(Boolean);
  const discovered = records.map((record) => asString(record.type)).filter(Boolean);
  return [...new Set([...direct, ...discovered])].slice(0, 100);
}

function competitorEvidence(
  serp: SerpCandidate[],
  citations: CitationCandidate[],
  competitorDomains: string[],
) {
  const output: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const competitor of competitorDomains.map(normalizeDomain).filter(Boolean)) {
    const organic = serp.find((item) => sameDomain(item.domain, competitor));
    const citation = citations.find((item) => sameDomain(item.domain, competitor));
    if (!organic && !citation) continue;
    if (seen.has(competitor)) continue;
    seen.add(competitor);
    output.push({
      domain: competitor,
      position: organic?.rank ?? null,
      url: organic?.url || citation?.url || null,
      title: organic?.title || citation?.title || null,
      ai_cited: Boolean(citation),
      ai_citation_position: citation?.index ?? null,
    });
  }
  return output;
}

export function isDataForSeoConfigured() {
  return Boolean(process.env.DATAFORSEO_LOGIN?.trim() && process.env.DATAFORSEO_PASSWORD?.trim());
}

export async function runDataForSeoRankCheck(input: DataForSeoRankInput): Promise<NormalizedRankResult> {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) throw new Error('SEO_RANK_PROVIDER_NOT_CONFIGURED');

  const useAiMode = input.surface === 'geo' || input.engine.toLowerCase().includes('ai_mode');
  const endpoint = useAiMode
    ? 'https://api.dataforseo.com/v3/serp/google/ai_mode/live/advanced'
    : 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';

  const task: Record<string, unknown> = {
    keyword: input.query,
    language_code: languageCode(input.locale),
    location_name: locationName(input.countryCode),
  };

  if (!useAiMode) {
    task.device = input.device;
    task.os = input.device === 'mobile' ? 'android' : 'windows';
    task.depth = 10;
    if (input.surface === 'aeo') task.load_async_ai_overview = true;
  }

  const authorization = Buffer.from(`${login}:${password}`, 'utf8').toString('base64');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Basic ${authorization}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify([task]),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) throw new Error(`SEO_RANK_PROVIDER_FAILED_${response.status}`);
  const payload = await response.json() as UnknownRecord;
  const result = parseTaskPayload(payload);
  const records = collectRecords(result);
  const serp = extractSerpCandidates(records);
  const citations = extractCitations(records);
  const features = itemTypes(result, records);

  const ownOrganic = serp
    .filter((item) => ['organic', 'featured_snippet'].includes(item.type) && sameDomain(item.domain, input.ownDomain))
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))[0];
  const ownCitation = citations.find((item) => sameDomain(item.domain, input.ownDomain));

  const answerVisible = useAiMode
    ? citations.length > 0 || features.some((type) => type.startsWith('ai_overview'))
    : features.some((type) => ['featured_snippet', 'answer_box', 'ai_overview'].includes(type));

  return {
    provider: 'dataforseo',
    own_position: ownOrganic?.rank ?? null,
    own_url: ownOrganic?.url || ownCitation?.url || null,
    own_title: ownOrganic?.title || ownCitation?.title || null,
    answer_visibility: input.surface === 'seo' ? null : answerVisible,
    ai_cited: input.surface === 'seo' ? null : Boolean(ownCitation),
    ai_citation_position: input.surface === 'seo' ? null : ownCitation?.index ?? null,
    ai_provider: input.surface === 'seo' ? null : (useAiMode ? 'google_ai_mode' : 'google_ai_overview'),
    competitor_results: competitorEvidence(serp, citations, input.competitorDomains),
    serp_features: features,
  };
}
