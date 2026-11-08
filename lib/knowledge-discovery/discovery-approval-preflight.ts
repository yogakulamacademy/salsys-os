import 'server-only';

import type { createClient } from '@/lib/supabase/server';
import { discoveryPublicationHeld } from '@/lib/knowledge-discovery/discovery-publication-hold';

type SignedClient = Awaited<ReturnType<typeof createClient>>;
export type DiscoveryApprovalPreflightResult = 'allow' | 'held' | 'unreadable';

/**
 * Read-only, tenant-scoped UI/action preflight for the existing Knowledge
 * approval action. The legacy verifier keeps all writes in atomic RPCs.
 *
 * NOT AN AUTHORIZATION BOUNDARY: callers can invoke the existing generic
 * approval RPC directly, and consent might change after this SELECT.
 * The KB-14A uninstalled SQL publication trigger is independently required.
 */
export async function discoveryApprovalPreflight(
  supabase: SignedClient,
  organizationId: string,
  documentId: string,
): Promise<DiscoveryApprovalPreflightResult> {
  try {
    const { data, error } = await supabase
      .from('knowledge_documents')
      .select('metadata')
      .eq('organization_id', organizationId)
      .eq('id', documentId)
      .maybeSingle();
    if (error || !data) return 'unreadable';
    return discoveryPublicationHeld(data.metadata) ? 'held' : 'allow';
  } catch {
    return 'unreadable';
  }
}
