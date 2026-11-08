import 'server-only';

import type { createClient } from '@/lib/supabase/server';
import { discoveryDomainVerified, discoveryVerificationHost } from '@/lib/knowledge-discovery/domain-verification';
import { discoveryHostAllowed, discoveryPilotEnabled } from '@/lib/knowledge-discovery/pilot-gate';
import { safeDiscoveryPageLink } from '@/lib/knowledge-discovery/public-page-link';
import { discoverySiteConsentActive } from '@/lib/knowledge-discovery/site-consent';

type SignedClient = Awaited<ReturnType<typeof createClient>>;

export type EligiblePageDraft = {
  pageId: string;
  title: string;
  sourceName: string;
  sourceUri: string;
};

/**
 * KB-09Q: A discovery page is METADATA, never verified page text.
 * Only current, signed-admin tenant RLS and a current host-bound proof and
 * purpose-limited consent can offer a manual DRAFT handoff.
 *
 * Every failed/missing permission or schema lookup returns null. No service
 * client, network fetch, content extraction, model call or mutation.
 */
export async function eligibleDiscoveredPageForManualDraft(
  supabase: SignedClient,
  organizationId: string,
  pageId: string,
): Promise<EligiblePageDraft | null> {
  if (!discoveryPilotEnabled() ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pageId)) {
    return null;
  }

  try {
    const { data: config, error: configError } = await supabase
      .from('organization_onboarding')
      .select('website_url')
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (configError || typeof config?.website_url !== 'string') return null;

    const configured = new URL(config.website_url);
    if (configured.protocol !== 'https:' || configured.username ||
        configured.password || configured.port || !discoveryHostAllowed(configured.hostname)) {
      return null;
    }
    const hostname = discoveryVerificationHost(configured.hostname);
    const { data: page, error: pageError } = await supabase
      .from('knowledge_discovery_pages')
      .select('id,job_id,url,status,http_status,page_title')
      .eq('organization_id', organizationId)
      .eq('id', pageId)
      .maybeSingle();
    if (pageError || !page || page.id !== pageId ||
        page.status !== 'fetched' || page.http_status !== 200) return null;
    const link = safeDiscoveryPageLink(page.url, config.website_url);
    if (!link) return null;

    const { data: job, error: jobError } = await supabase
      .from('knowledge_discovery_jobs')
      .select('id,status,seed_url')
      .eq('organization_id', organizationId)
      .eq('id', page.job_id)
      .maybeSingle();
    if (jobError || !job || job.id !== page.job_id ||
        !['completed', 'partial'].includes(job.status) ||
        typeof job.seed_url !== 'string' ||
        new URL(job.seed_url).origin !== configured.origin) return null;

    const { data: proof, error: proofError } = await supabase
      .from('knowledge_discovery_domain_verifications')
      .select('verified_at,verified_until')
      .eq('organization_id', organizationId)
      .eq('hostname', hostname)
      .maybeSingle();
    if (proofError || !discoveryDomainVerified(proof)) return null;

    const { data: consent, error: consentError } = await supabase
      .from('knowledge_discovery_site_consents')
      .select('organization_id,hostname,purpose,status,policy_version,granted_by,granted_at,valid_until,withdrawn_at')
      .eq('organization_id', organizationId)
      .eq('hostname', hostname)
      .maybeSingle();
    if (consentError || !discoverySiteConsentActive(consent, organizationId, hostname)) {
      return null;
    }

    const displayTitle = typeof page.page_title === 'string' && page.page_title.trim()
      ? page.page_title.trim().slice(0, 180)
      : 'Website page: ' + link.pathname.slice(0, 120);
    return {
      pageId,
      title: displayTitle,
      sourceName: displayTitle.slice(0, 180),
      sourceUri: link.href,
    };
  } catch {
    return null;
  }
}
