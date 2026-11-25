import "server-only";

import { buildMarketingStory, isMarketingStoryData, type FormFunnel, type MarketingStory } from "@/lib/marketing-story";
import { normalizeBehaviorRequest } from "@/lib/native-behavior-contract";
import { getNativeBehaviorWorkspace } from "@/lib/native-behavior-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

/** Smart Marketing Overview for managers and admins of the signed-in business; null otherwise or on failure. */
export async function getMarketingStory(): Promise<MarketingStory | null> {
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

    const [{ data, error }, behavior] = await Promise.all([
      createAdminClient().rpc("marketing_story_v1", { p_organization_id: org, p_days: 30 }),
      // The default behaviour funnel is page viewed → form started → form submitted, 14 days.
      getNativeBehaviorWorkspace(normalizeBehaviorRequest(14, undefined)).catch(() => null),
    ]);
    if (error || !isMarketingStoryData(data)) return null;

    const step = (name: string) => behavior?.funnel.find((s) => s.event_name === name)?.sessions ?? 0;
    const form: FormFunnel = behavior?.available && step("web.form_started") > 0
      ? { viewed: step("web.page_viewed"), started: step("web.form_started"), submitted: step("web.form_submitted") }
      : null;
    return buildMarketingStory(data, form);
  } catch {
    return null;
  }
}
