import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  resolveInstagramExperiment,
  type InstagramExperimentResolution,
} from '@/lib/instagram/reply-experiments-v1';

/**
 * Server-only verified CRM resolution. Every query binds both lead and tenant.
 * Callers MUST separately authenticate and authorize access to the lead.
 * This helper never updates CRM and never sends anything to Instagram.
 */
export async function resolveVerifiedInstagramExperiment(input: {
  organizationId: string;
  leadId: string;
  experimentId: string;
}): Promise<InstagramExperimentResolution> {
  const admin = createAdminClient();
  const { data: lead, error: leadError } = await admin
    .from('leads')
    .select('id,first_name,display_name,lead_name,interested_course_id')
    .eq('id', input.leadId)
    .eq('organization_id', input.organizationId)
    .maybeSingle();
  if (leadError || !lead) {
    return { ok: false, reason: 'lead_name_missing' };
  }

  let courseName: string | null = null;
  if (lead.interested_course_id) {
    const { data: course, error: courseError } = await admin
      .from('courses')
      .select('id,name')
      .eq('id', lead.interested_course_id)
      .eq('organization_id', input.organizationId)
      .eq('active', true)
      .maybeSingle();

    if (courseError) return { ok: false, reason: 'course_name_missing' };
    courseName = typeof course?.name === 'string' ? course.name : null;
  }

  return resolveInstagramExperiment({
    organizationId: input.organizationId,
    leadId: input.leadId,
    experimentId: input.experimentId,
    context: {
      firstName: lead.first_name,
      displayName: lead.display_name,
      leadName: lead.lead_name,
      courseName,
    },
  });
}
