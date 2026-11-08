import { createAdminClient } from '@/lib/supabase/admin';
import { fetchPublicWeb, WebsiteFetchError } from '@/lib/knowledge-discovery/public-fetch';
import { withDiscoveryConsent } from '@/lib/knowledge-discovery/consent-fetch';
import { discoverySiteConsentActive } from '@/lib/knowledge-discovery/site-consent';
import {
  runDiscoveryPageCore,
  type DiscoveryClaim,
  type DiscoveryCommit,
} from '@/lib/knowledge-discovery/run-core';

/**
 * Production adapter: all reads and RPC writes stay within the claim's tenant.
 * The proof-checked RPC revalidates the current stored ownership, consent
 * and scoped lease in the same transaction before any mutation.
 * Never fall back to the legacy page-commit RPC when the checked RPC is absent.
 * No knowledge is created or published by discovery.
 */
export async function processOneDiscoveryPage(claim: DiscoveryClaim) {
  const admin = createAdminClient();
  // The worker's initial consent check is not sufficient: withdrawal may
  // occur between two network operations. Recheck before each request.
  const assertActiveConsent=async(hostname:string)=>{
    const {data,error}=await admin.from('knowledge_discovery_site_consents')
      .select('organization_id,hostname,purpose,status,policy_version,granted_by,granted_at,valid_until,withdrawn_at')
      .eq('organization_id',claim.organization_id)
      .eq('hostname',hostname).maybeSingle();
    if(error||!discoverySiteConsentActive(data,claim.organization_id,hostname)){
      throw new WebsiteFetchError('consent_not_active');
    }
  };
  return runDiscoveryPageCore(claim, {
    async pending(item) {
      const { data, error } = await admin
        .from('knowledge_discovery_pages')
        .select('id,url,depth,status')
        .eq('organization_id', item.organization_id)
        .eq('job_id', item.job_id)
        .eq('status', 'discovered')
        .order('depth', { ascending: true })
        .order('discovered_at', { ascending: true })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async commit(args: DiscoveryCommit) {
      const { data, error } = await admin.rpc('commit_knowledge_discovery_page_with_proof_v1', args);
      if (error) throw error;
      return data;
    },
  }, withDiscoveryConsent(
    (seed,page,kind,authorizeRedirect)=>fetchPublicWeb(
      seed,page,kind,undefined,undefined,authorizeRedirect,
    ),
    async hostname=>{
      try {
        await assertActiveConsent(hostname);
        return true;
      }catch {return false;}
    },
  ));
}
