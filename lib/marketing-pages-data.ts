import "server-only";

import { buildAdsStory, buildSourcesStory, isAdsData, isSourcesData, type AdsStory, type SourcesStory } from "@/lib/marketing-pages";
import { buildCreditStory, buildFunnelStory, isFunnelData, type CreditStory, type FunnelStory } from "@/lib/marketing-funnel";
import { sourceLabel } from "@/lib/marketing-story";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

/** The business of a signed-in manager or admin; null for anyone else. */
export async function managedOrganization(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const org = await requireCurrentOrganizationId(supabase, user.id);
  const [{ data: canManage }, { data: canAdminister }] = await Promise.all([
    supabase.rpc("can_manage_organization", { p_organization_id: org }),
    supabase.rpc("can_administer_organization_crm", { p_organization_id: org }),
  ]);
  return canManage === true || canAdminister === true ? org : null;
}

export async function getSourcesStory(): Promise<SourcesStory | null> {
  try {
    const org = await managedOrganization();
    if (!org) return null;
    const { data, error } = await createAdminClient().rpc("marketing_sources_v1", { p_organization_id: org, p_days: 30 });
    if (error || !isSourcesData(data)) return null;
    return buildSourcesStory(data, sourceLabel);
  } catch {
    return null;
  }
}

export async function getAdsStory(): Promise<AdsStory | null> {
  try {
    const org = await managedOrganization();
    if (!org) return null;
    const { data, error } = await createAdminClient().rpc("marketing_ads_v1", { p_organization_id: org });
    if (error || !isAdsData(data)) return null;
    return buildAdsStory(data);
  } catch {
    return null;
  }
}

/** "Stage by stage" and "Credit by source" share one read (owner-approved, 26 Nov 2026). */
export async function getFunnelStories(): Promise<{ funnel: FunnelStory; credit: CreditStory } | null> {
  try {
    const org = await managedOrganization();
    if (!org) return null;
    const { data, error } = await createAdminClient().rpc("marketing_funnel_credit_v1", { p_organization_id: org, p_days: 90 });
    if (error || !isFunnelData(data)) return null;
    return { funnel: buildFunnelStory(data), credit: buildCreditStory(data) };
  } catch {
    return null;
  }
}
