import "server-only";

import { isRevenueStoryData, type RevenueStoryData } from "@/lib/revenue-story";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

/** Smart Revenue data for managers and admins of the signed-in business; null otherwise or on failure. */
export async function getRevenueStory(): Promise<RevenueStoryData | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const org = await requireCurrentOrganizationId(supabase, user.id);
    const [{ data: canManage }, { data: canAdminister }] = await Promise.all([
      supabase.rpc("can_manage_organization", { p_organization_id: org }),
      supabase.rpc("can_administer_organization_crm", { p_organization_id: org }),
    ]);
    if (canManage !== true && canAdminister !== true) return null;
    const { data, error } = await createAdminClient().rpc("revenue_story_v1", { p_organization_id: org, p_months: 3 });
    if (error || !isRevenueStoryData(data)) return null;
    return data;
  } catch {
    return null;
  }
}
