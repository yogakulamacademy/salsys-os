import { createAdminClient } from '@/lib/supabase/admin';
import { parseWebsiteSeed, scopedDiscoveredUrl } from '@/lib/knowledge-discovery/url-policy';
import {
  WebsiteFetchError, fetchPublicWeb, evaluateRobots,
  discoverHtmlLinks, discoverSitemapLinks, readHtmlTitle,
} from '@/lib/knowledge-discovery/public-fetch';

type Claim = {
  job_id: string;
  organization_id: string;
  seed_url: string;
  max_pages: number;
  lease_token: string;
};
type Page = { id: string; url: string; depth: number; status: string };

function shortError(error: unknown) {
  if (error instanceof WebsiteFetchError) return error.code;
  if (error instanceof Error && error.name === 'WebsiteScopeError') return 'unsafe_website';
  return 'discovery_fetch_failed';
}

/**
 * Runs one page per invocation. A separately configured scheduler invokes
 * this service-only function. It never saves HTML or publishes AI knowledge.
 */
export async function processOneDiscoveryPage(claim: Claim) {
  const admin = createAdminClient();
  const seed = parseWebsiteSeed(claim.seed_url);
  const { data: queue, error: queueError } = await admin
    .from('knowledge_discovery_pages')
    .select('id,url,depth,status')
    .eq('organization_id', claim.organization_id)
    .eq('job_id', claim.job_id)
    .eq('status', 'discovered')
    .order('depth', { ascending: true })
    .order('discovered_at', { ascending: true })
    .limit(1);
  if (queueError) throw queueError;

  const item = (queue?.[0] ?? null) as Page | null;
  let crawlDelay = 0;
  let pageStatus: 'fetched' | 'blocked' | 'failed' | 'skipped' = 'failed';
  let statusCode: number | null = null;
  let pageTitle: string | null = null;
  let contentType: string | null = null;
  let errorCode: string | null = null;
  let links: string[] = [];
  if (item) {
    try {
      const page = new URL(item.url);
      if (!scopedDiscoveredUrl(seed, page, page.href)) throw new WebsiteFetchError('offsite_or_unsafe_url');

      // Fail closed when robots cannot be fetched. HTTP 404 alone means no robots rules.
      const robotsUrl = new URL('/robots.txt', page.origin);
      const robots = await fetchPublicWeb(seed, robotsUrl, 'robots');
      const policy = robots.status === 404
        ? { allowed: true, delaySeconds: 0 }
        : evaluateRobots(robots.body, page.pathname, 'salsysosknowledgebot');
      crawlDelay = policy.delaySeconds;
      if (!policy.allowed) {
        pageStatus = 'blocked';
        errorCode = 'robots_disallow';
      } else {
        const response = await fetchPublicWeb(seed, page, 'html');
        pageStatus = 'fetched';
        statusCode = response.status;
        contentType = response.contentType;
        pageTitle = readHtmlTitle(response.body);
        links = item.depth < 4 ? discoverHtmlLinks(seed, new URL(response.url), response.body) : [];
        // A sitemap is optional. Missing or inaccessible sitemaps do not override robots.
        if (item.depth === 0 && (robots.status === 404 ||
          evaluateRobots(robots.body, '/sitemap.xml', 'salsysosknowledgebot').allowed)) {
          try {
            const sitemap = await fetchPublicWeb(seed, new URL('/sitemap.xml', page.origin), 'sitemap');
            if (sitemap.status === 200) {
              links.push(...discoverSitemapLinks(seed, new URL(sitemap.url), sitemap.body));
            }
          } catch {
            // Sitemap is supplemental; page-link discovery continues.
          }
        }
      }
    } catch (error) {
      errorCode = shortError(error);
      pageStatus = errorCode === 'access_denied' || errorCode === 'unsafe_website'
        ? 'blocked' : 'failed';
    }

  }

  // All writes happen inside one service-only transaction that first locks the
  // active job and revalidates its lease token. Cancellation or lease loss wins
  // cleanly without permitting late worker page mutations.
  const { data: result, error: commitError } = await admin.rpc(
    'commit_knowledge_discovery_page_v1',
    {
      p_organization_id: claim.organization_id,
      p_job_id: claim.job_id,
      p_page_id: item?.id ?? null,
      p_lease_token: claim.lease_token,
      p_page_status: item ? pageStatus : 'skipped',
      p_http_status: item ? statusCode : null,
      p_content_type: item ? contentType : null,
      p_page_title: item ? pageTitle : null,
      p_failure_code: item ? errorCode : null,
      p_links: item && pageStatus === 'fetched' ? [...new Set(links)].slice(0,80) : [],
      p_delay_seconds: Math.max(2, Math.ceil(crawlDelay)),
    },
  );
  if (commitError) throw commitError;
  if (result?.ok !== true) return { ok: true, status: result?.reason ?? 'inactive_or_stale_lease' };
  return { ok: true, job: result };
}
