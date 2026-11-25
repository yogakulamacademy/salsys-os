import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { EnrolmentIntelligence } from '@/lib/enrolment-intelligence';
import { cleanAdTitle } from '@/lib/enrolment-intelligence';

/**
 * Read-only summary for the Personas page. The caller must already have
 * resolved organizationId from the signed-in user's workspace: the database
 * function is service-role only and trusts the id it is given.
 */
export async function getEnrolmentIntelligence(admin: SupabaseClient, organizationId: string, days = 60): Promise<EnrolmentIntelligence | null> {
  const { data, error } = await admin.rpc('enrolment_intelligence_v1', { p_organization_id: organizationId, p_days: days });
  if (error || !data || typeof data !== 'object') return null;
  return data as EnrolmentIntelligence;
}

export type LeadAd = { adId: string; title: string; firstSeenAt: string };

/** The ad(s) that started this person's Instagram chats, first one first. */
export async function getAdsForLeads(admin: SupabaseClient, organizationId: string, leadIds: string[]): Promise<Map<string, LeadAd[]>> {
  const out = new Map<string, LeadAd[]>();
  if (!leadIds.length) return out;
  const { data } = await admin.from('lead_ad_referrals')
    .select('lead_id, ad_id, ad_title, first_seen_at')
    .eq('organization_id', organizationId)
    .in('lead_id', leadIds.slice(0, 500))
    .order('first_seen_at', { ascending: true });
  for (const row of data ?? []) {
    const id = String(row.lead_id);
    const list = out.get(id) ?? [];
    list.push({ adId: String(row.ad_id), title: cleanAdTitle(row.ad_title as string | null), firstSeenAt: String(row.first_seen_at) });
    out.set(id, list);
  }
  return out;
}
