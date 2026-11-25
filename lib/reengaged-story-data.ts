import "server-only";

import { isReengagedData, type ReengagedData } from "@/lib/reengaged-story";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

/** Smart Re-engaged data for managers and admins of the signed-in business; null otherwise or on failure. */
export async function getReengagedStory(): Promise<ReengagedData | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const org = await requireCurrentOrganizationId(supabase, user.id);
    const { data: canSee } = await supabase.rpc("can_administer_organization_crm", { p_organization_id: org });
    if (canSee !== true) return null;
    const { data, error } = await createAdminClient().rpc("reengaged_intelligence_v1", { p_organization_id: org, p_weeks: 6 });
    if (error || !isReengagedData(data)) return null;
    return data;
  } catch {
    return null;
  }
}
