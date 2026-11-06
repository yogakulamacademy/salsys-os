import { createAdminClient } from '@/lib/supabase/admin';
import {
  runDiscoveryPageCore,
  type DiscoveryClaim,
  type DiscoveryCommit,
} from '@/lib/knowledge-discovery/run-core';

/**
 * Production adapter: all reads and RPC writes stay within the claim's tenant.
 * The RPC atomically revalidates the lease before mutating anything.
 * No knowledge is created or published by discovery.
 */
export async function processOneDiscoveryPage(claim: DiscoveryClaim) {
  const admin = createAdminClient();
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
      const { data, error } = await admin.rpc('commit_knowledge_discovery_page_v1', args);
      if (error) throw error;
      return data;
    },
  });
}
