import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCurrentOrganizationId } from '@/lib/workspace';

/** C4 hard-gate: both app flag and active tenant policy must authorize spending. */
export async function reserveLeadInsightGeneration(
  organizationId: string,
  leadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.env.AI_LEAD_INSIGHTS_QUOTAS_ENABLED !== 'true') {
    return { ok: false, error: 'AI generation limits have not been activated.' };
  }

  try {
    const session = await createClient();
    const { data: { user }, error: authError } = await session.auth.getUser();
    if (authError || !user?.id) {
      return { ok: false, error: 'Sign in to use AI Lead Intelligence.' };
    }
    const activeOrg = await requireCurrentOrganizationId(session, user.id);
    if (!activeOrg || activeOrg !== organizationId) {
      return { ok: false, error: 'This workspace is not authorized.' };
    }

    // In addition to the C1 lead checks, repeat authorization immediately
    // before charging a scarce generation quota to the active user.
    const { data: canWork, error: accessError } = await session.rpc('can_work_lead', {
      p_lead_id: leadId,
    });
    if (accessError || canWork !== true) {
      return { ok: false, error: 'This lead is unavailable or you do not have access.' };
    }

    const { data, error } = await createAdminClient().rpc(
      'reserve_ai_lead_insight_generation_v1',
      {
        p_organization_id: organizationId,
        p_user_id: user.id,
        p_lead_id: leadId,
      },
    );

    if (error) {
      return { ok: false, error: 'The AI request limit was reached or is unavailable.' };
    }
    if (data !== true) {
      return { ok: false, error: 'AI insights are not enabled for this workspace.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'AI generation authorization is temporarily unavailable.' };
  }
}
