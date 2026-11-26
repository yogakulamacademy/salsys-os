import "server-only";

import { managedOrganization } from "@/lib/marketing-pages-data";
import { buildOpsStory, isOpsData, type OpsStory } from "@/lib/operations-story";
import { createAdminClient } from "@/lib/supabase/admin";

/** Smart Operations Overview for managers and admins; null otherwise or on failure. */
export async function getOpsStory(days = 60): Promise<OpsStory | null> {
  try {
    const org = await managedOrganization();
    if (!org) return null;
    const { data, error } = await createAdminClient().rpc("operations_story_v1", { p_organization_id: org, p_days: days });
    if (error || !isOpsData(data)) return null;
    return buildOpsStory(data);
  } catch {
    return null;
  }
}
