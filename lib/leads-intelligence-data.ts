import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import type { LeadsIntelligence } from '@/lib/leads-intelligence';

/**
 * The Smart Leads briefing for the signed-in user's business. The database
 * function is service-role only, so the business id always comes from the
 * user's own workspace here. Returns null (the page falls back to the plain
 * overview) on any failure.
 */
export async function getLeadsIntelligence(): Promise<LeadsIntelligence | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const organizationId = await requireCurrentOrganizationId(supabase, user.id);
    const { data, error } = await createAdminClient().rpc('leads_intelligence_v1', { p_organization_id: organizationId });
    const d = data as Partial<LeadsIntelligence> | null;
    if (error || !d || !Array.isArray(d.daily) || !Array.isArray(d.weeks) || !Array.isArray(d.courses) || !d.replyEffect || !d.waiting || !d.pipeline) return null;
    return d as LeadsIntelligence;
  } catch {
    return null;
  }
}
