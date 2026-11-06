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
type PageStatus = { status: string };

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
  const now = new Date();
  let crawlDelay = 0;
  if (item) {
    let pageStatus: 'fetched' | 'blocked' | 'failed' | 'skipped' = 'failed';
    let statusCode: number | null = null;
    let pageTitle: string | null = null;
    let contentType: string | null = null;
    let errorCode: string | null = null;
    let links: string[] = [];
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

    // A cancelled or superseded lease must not write late results.
    const { data: stillOwner, error: ownerError } = await admin
      .from('knowledge_discovery_jobs').select('status,lease_token')
      .eq('organization_id', claim.organization_id).eq('id', claim.job_id).maybeSingle();
    if (ownerError) throw ownerError;
    if (stillOwner?.status !== 'running' || stillOwner.lease_token !== claim.lease_token) {
      return { ok: true, status: 'no_longer_owned' };
    }

    const { error: pageError } = await admin.from('knowledge_discovery_pages')
      .update({
        status: pageStatus, http_status: statusCode, content_type: contentType,
        page_title: pageTitle, failure_code: errorCode, processed_at: now.toISOString(),
      })
      .eq('job_id', claim.job_id).eq('organization_id', claim.organization_id)
      .eq('id', item.id).eq('status', 'discovered');
    if (pageError) throw pageError;

    if (pageStatus === 'fetched' && links.length) {
      const { count, error: countError } = await admin
        .from('knowledge_discovery_pages')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', claim.job_id).eq('organization_id', claim.organization_id);
      if (countError) throw countError;
      const remaining = Math.max(0, claim.max_pages - (count ?? 0));
      // Do not let cross-site content cause uncontrolled discovery or a large DB insert.
      const candidates = [...new Set(links)].filter(url => url !== item.url).slice(0, remaining);
      if (candidates.length) {
        const { error: insertError } = await admin.from('knowledge_discovery_pages')
          .upsert(candidates.map(url => ({
            organization_id: claim.organization_id, job_id: claim.job_id,
            url, discovered_from: item.url, depth: Math.min(6, item.depth + 1),
            status: 'discovered',
          })), { onConflict: 'job_id,url', ignoreDuplicates: true });
        if (insertError) throw insertError;
      }
    }
  }

  const { data: rows, error: rowsError } = await admin
    .from('knowledge_discovery_pages').select('status')
    .eq('job_id', claim.job_id).eq('organization_id', claim.organization_id)
    .limit(60);
  if (rowsError) throw rowsError;
  const statuses = (rows ?? []) as PageStatus[];
  const summary = {
    pages_discovered: statuses.length,
    pages_fetched: statuses.filter(p => p.status === 'fetched').length,
    pages_blocked: statuses.filter(p => p.status === 'blocked').length,
    pages_failed: statuses.filter(p => p.status === 'failed').length,
    pages_skipped: statuses.filter(p => p.status === 'skipped').length,
  };
  const hasQueue = statuses.some(p => p.status === 'discovered');
  const outcome = hasQueue ? 'queued' : (summary.pages_blocked || summary.pages_failed ? 'partial' : 'completed');
  const { data: updated, error: updateError } = await admin.from('knowledge_discovery_jobs')
    .update({
      ...summary, status: outcome, attempts: 0, lease_until: null, lease_token: null,
      next_allowed_at: new Date(Date.now() + Math.max(2000, crawlDelay * 1000)).toISOString(),
      finished_at: hasQueue ? null : new Date().toISOString(),
    })
    .eq('id', claim.job_id).eq('organization_id', claim.organization_id)
    .eq('lease_token', claim.lease_token).eq('status', 'running')
    .select('id,status,pages_discovered,pages_fetched,pages_blocked,pages_failed')
    .maybeSingle();
  if (updateError) throw updateError;
  return { ok: true, job: updated ?? null };
}
