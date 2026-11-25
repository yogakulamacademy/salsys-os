import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';
import type { PipelineIntelligence } from '@/lib/pipeline-intelligence';

/** Smart Pipeline briefing for the signed-in user's business; null on any failure. */
export async function getPipelineIntelligence(): Promise<PipelineIntelligence | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const organizationId = await requireCurrentOrganizationId(supabase, user.id);
    const { data, error } = await createAdminClient().rpc('pipeline_intelligence_v1', { p_organization_id: organizationId });
    if (error || !data || typeof data !== 'object') return null;
    return data as PipelineIntelligence;
  } catch {
    return null;
  }
}
