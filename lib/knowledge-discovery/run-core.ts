import { parseWebsiteSeed, scopedDiscoveredUrl } from './url-policy';
import type { CrawlerEvidenceEnvelope } from './crawler-evidence-envelope';
import {
  WebsiteFetchError, fetchPublicWeb, evaluateRobots,
  discoverHtmlLinks, discoverSitemapLinks, readHtmlTitle,
} from './public-fetch';

export type DiscoveryClaim = {
  job_id: string;
  organization_id: string;
  seed_url: string;
  max_pages: number;
  lease_token: string;
};
export type DiscoveryPage = { id: string; url: string; depth: number; status: string };
export type DiscoveryResult = { ok: boolean; reason?: string; status?: string; [key: string]: unknown };
export type DiscoveryCommit = {
  p_organization_id: string;
  p_job_id: string;
  p_page_id: string | null;
  p_lease_token: string;
  p_page_status: 'fetched' | 'blocked' | 'failed' | 'skipped';
  p_http_status: number | null;
  p_content_type: string | null;
  p_page_title: string | null;
  p_failure_code: string | null;
  p_links: string[];
  p_delay_seconds: number;
};
export type DiscoveryStore = {
  pending(claim: DiscoveryClaim): Promise<DiscoveryPage | null>;
  // Optional second argument is for a future independently approved
  // atomic page+evidence RPC. The production adapter ignores it today.
  // Never invoke a second write after commit to simulate atomicity.
  commit(args: DiscoveryCommit, evidence?: CrawlerEvidenceEnvelope | null): Promise<DiscoveryResult>;
};
export type DiscoveryFetcher = (
  seed: URL, page: URL, kind: 'robots' | 'html' | 'sitemap',
  authorizeRedirect?: (next: URL) => Promise<void>,
) => ReturnType<typeof fetchPublicWeb>;

function shortError(error: unknown): string {
  if (error instanceof WebsiteFetchError) return error.code;
  if (error instanceof Error && error.name === 'WebsiteScopeError') return 'unsafe_website';
  return 'discovery_fetch_failed';
}

/**
 * One worker tick. Production injects its tenant-scoped store and pinned
 * public HTTP transport. Tests inject an isolated PostgreSQL store and
 * deterministic synthetic website without public outbound requests.
 *
 * The atomic commit stored procedure is the only writer for page outcomes.
 */
export async function runDiscoveryPageCore(
  claim: DiscoveryClaim,
  store: DiscoveryStore,
  fetchPage: DiscoveryFetcher = (seed, page, kind, authorizeRedirect) =>
    fetchPublicWeb(seed, page, kind, undefined, undefined, authorizeRedirect),
  evidencePreparer?: (
    seed: URL,
    response: Awaited<ReturnType<DiscoveryFetcher>>,
    fetchedAt: string,
  ) => {ok:true; evidence:CrawlerEvidenceEnvelope} | {ok:false;error:string},
) {
  const seed = parseWebsiteSeed(claim.seed_url);
  const item = await store.pending(claim);
  let pageStatus: DiscoveryCommit['p_page_status'] = 'failed';
  let statusCode: number | null = null;
  let pageTitle: string | null = null;
  let contentType: string | null = null;
  let errorCode: string | null = null;
  let links: string[] = [];
  let crawlDelay = 0;
  let preparedEvidence: CrawlerEvidenceEnvelope | null = null;

  if (item) {
    try {
      const page = new URL(item.url);
      if (!scopedDiscoveredUrl(seed, page, page.href)) {
        throw new WebsiteFetchError('offsite_or_unsafe_url');
      }
      const robots = await fetchPage(seed, new URL('/robots.txt', page.origin), 'robots');
      const rules = robots.status === 404
        ? { allowed: true, delaySeconds: 0 }
        : evaluateRobots(robots.body, page.pathname, 'salsysosknowledgebot');
      crawlDelay = rules.delaySeconds;
      if (!rules.allowed) {
        pageStatus = 'blocked';
        errorCode = 'robots_disallow';
      } else {
        const authorizeRedirect = async (next: URL) => {
          const destinationRobots = await fetchPage(
            seed, new URL('/robots.txt', next.origin), 'robots',
          );
          const destinationPolicy = destinationRobots.status === 404
            ? { allowed: true, delaySeconds: 0 }
            : evaluateRobots(destinationRobots.body, next.pathname, 'salsysosknowledgebot');
          crawlDelay = Math.max(crawlDelay, destinationPolicy.delaySeconds);
          if (!destinationPolicy.allowed) throw new WebsiteFetchError('robots_disallow');
        };
        const response = await fetchPage(seed, page, 'html', authorizeRedirect);
        statusCode = response.status;
        contentType = response.contentType;
        pageTitle = readHtmlTitle(response.body);
        pageStatus = 'fetched';
        // KB-09S: only a synthetic test adapter supplies evidencePreparer.
        // It receives already fetched, pinned and robots-/consent-checked
        // HTML bytes. A rejected envelope makes the opt-in path fail closed
        // rather than recording "fetched" without the expected evidence.
        if (evidencePreparer) {
          const result = evidencePreparer(seed, response, new Date().toISOString());
          if (!result.ok) throw new WebsiteFetchError('evidence_rehearsal_rejected');
          preparedEvidence = result.evidence;
        }
        links = item.depth < 4 ? discoverHtmlLinks(seed, new URL(response.url), response.body) : [];
        if (item.depth === 0 && (robots.status === 404 ||
          evaluateRobots(robots.body, '/sitemap.xml', 'salsysosknowledgebot').allowed)) {
          try {
            const sitemap = await fetchPage(seed, new URL('/sitemap.xml', page.origin), 'sitemap', authorizeRedirect);
            if (sitemap.status === 200) {
              links.push(...discoverSitemapLinks(seed, new URL(sitemap.url), sitemap.body));
            }
          } catch {
            // A missing or inaccessible sitemap never overrides a valid robots policy.
          }
        }
      }
    } catch (error) {
      errorCode = shortError(error);
      pageStatus = ['access_denied', 'unsafe_website', 'robots_disallow'].includes(errorCode)
        ? 'blocked' : 'failed';
    }
  }

  const result = await store.commit({
    p_organization_id: claim.organization_id,
    p_job_id: claim.job_id,
    p_page_id: item?.id ?? null,
    p_lease_token: claim.lease_token,
    p_page_status: item ? pageStatus : 'skipped',
    p_http_status: item ? statusCode : null,
    p_content_type: item ? contentType : null,
    p_page_title: item ? pageTitle : null,
    p_failure_code: item ? errorCode : null,
    p_links: item && pageStatus === 'fetched' ? [...new Set(links)].slice(0, 80) : [],
    p_delay_seconds: Math.max(2, Math.ceil(crawlDelay)),
  }, item && pageStatus === 'fetched' ? preparedEvidence : null);
  // A stale lease, withdrawn consent, or rejected page mutation is NOT a
  // processed job. Never turn a declined transaction into an HTTP success.
  // Keep the reason internal to the trusted worker; do not expose it in the
  // public route response or log the lease token / source content.
  if (!result || result.ok !== true) {
    return {
      ok: false,
      reason: typeof result?.reason === 'string' && result.reason
        ? result.reason : 'commit_not_acknowledged',
    };
  }
  return { ok: true, job: result };
}
