import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// Point-in-time worker authorization, not a transaction fence.
export async function enrichmentTenantActive(admin: SupabaseClient, organizationId: unknown): Promise<boolean> {
  if (typeof organizationId !== 'string' || !organizationId.trim()) return false;
  const { data, error } = await admin.from('organizations').select('id,status').eq('id', organizationId).maybeSingle();
  if (error) throw Error('Enrichment tenant authorization unavailable.');
  return data?.id === organizationId && data.status === 'active';
}

export async function enrichmentLeadAllowed(admin: SupabaseClient, organizationId: string, leadId: string): Promise<boolean> {
  if (!await enrichmentTenantActive(admin, organizationId)) return false;
  const { data, error } = await admin.from('leads').select('id,organization_id').eq('id', leadId).eq('organization_id', organizationId).maybeSingle();
  if (error) throw Error('Enrichment lead authorization unavailable.');
  return data?.id === leadId && data.organization_id === organizationId;
}
