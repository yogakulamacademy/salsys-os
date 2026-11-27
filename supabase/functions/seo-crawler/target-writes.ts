import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.119.2';

export type DiscoveredLink = { scope: string; normalized: string; url: string };
type Context = { organizationId: string; siteId: string; runId: string; sourcePageId: string; depth: number; httpStatus: number; seenAt: string };
export const TARGET_BATCH_SIZE = 200;

/** Keep link evidence separate from unique destination page/queue records. */
export async function persistDiscoveredTargets(client: Pick<SupabaseClient, 'from'>, links: DiscoveredLink[], ctx: Context, isAsset: (path: string) => boolean) {
  const targets = new Map<string, DiscoveredLink>();
  for (const link of links) if (link.scope === 'internal' && !targets.has(link.normalized)) targets.set(link.normalized, link);
  // Stable lock order also limits contention between overlapping crawls.
  const unique = [...targets.values()].sort((a, b) => a.normalized < b.normalized ? -1 : a.normalized > b.normalized ? 1 : 0);
  const ids = new Map<string, string>();
  for (let offset = 0; offset < unique.length; offset += TARGET_BATCH_SIZE) {
    const batch = unique.slice(offset, offset + TARGET_BATCH_SIZE);
    const pages = batch.map(link => {
      const url = new URL(link.normalized);
      return { organization_id: ctx.organizationId, site_id: ctx.siteId, normalized_url: link.normalized, url_path: url.pathname + url.search, last_seen_at: ctx.seenAt };
    });
    const { data, error } = await client.from('seo_pages').upsert(pages, {
      onConflict: 'organization_id,site_id,normalized_url',
    }).select('id,normalized_url');
    if (error) throw new Error(`Unable to record discovered pages: ${error.message}`);
    for (const row of data ?? []) if (typeof row.id === 'string' && typeof row.normalized_url === 'string') ids.set(row.normalized_url, row.id);
    if (batch.some(link => !ids.has(link.normalized))) throw new Error('Discovered page IDs were not fully returned.');
    if (ctx.depth + 1 > 10 || ctx.httpStatus >= 400) continue;
    const frontier = batch.filter(link => !isAsset(new URL(link.normalized).pathname)).map(link => ({
      organization_id: ctx.organizationId, site_id: ctx.siteId, crawl_run_id: ctx.runId,
      url: link.url, normalized_url: link.normalized, depth: ctx.depth + 1, source_page_id: ctx.sourcePageId,
    }));
    if (!frontier.length) continue;
    const { error: queueError } = await client.from('seo_crawl_frontier').upsert(frontier, {
      onConflict: 'crawl_run_id,normalized_url', ignoreDuplicates: true,
    });
    if (queueError) throw new Error(`Unable to queue discovered pages: ${queueError.message}`);
  }
  return ids;
}
