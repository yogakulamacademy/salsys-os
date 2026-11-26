import "server-only";

import { googleErrorText } from "@/lib/marketing-pages";
import { managedOrganization } from "@/lib/marketing-pages-data";
import { buildSearchStory, buildTrackingStory, buildWebStory, isSearchData, isTrackingData, isWebData, pageLabel, type SearchStory, type TrackingStory, type WebStory } from "@/lib/marketing-web";
import { buildClicksStory, buildVisitsStory, isWebsiteDetail, type ClicksStory, type VisitsStory } from "@/lib/marketing-website-detail";
import { normalizeBehaviorRequest } from "@/lib/native-behavior-contract";
import { getNativeBehaviorWorkspace } from "@/lib/native-behavior-data";
import { createAdminClient } from "@/lib/supabase/admin";

// Website, Google search and Tracking check stories for managers and admins (null otherwise or on failure).

export async function getWebStory(): Promise<WebStory | null> {
  try {
    const org = await managedOrganization();
    if (!org) return null;
    const [{ data, error }, behavior] = await Promise.all([
      createAdminClient().rpc("marketing_web_v1", { p_organization_id: org }),
      getNativeBehaviorWorkspace(normalizeBehaviorRequest(14, undefined)).catch(() => null),
    ]);
    if (error || !isWebData(data)) return null;
    const step = (name: string) => behavior?.funnel.find((s) => s.event_name === name)?.sessions ?? 0;
    const form = behavior?.available && step("web.form_started") > 0 ? { started: step("web.form_started"), submitted: step("web.form_submitted") } : null;
    return buildWebStory(data, form);
  } catch {
    return null;
  }
}

export async function getSearchStory(): Promise<SearchStory | null> {
  try {
    const org = await managedOrganization();
    if (!org) return null;
    const { data, error } = await createAdminClient().rpc("marketing_search_v1", { p_organization_id: org });
    if (error || !isSearchData(data)) return null;
    return buildSearchStory(data);
  } catch {
    return null;
  }
}

export async function getTrackingStory(): Promise<TrackingStory | null> {
  try {
    const org = await managedOrganization();
    if (!org) return null;
    const { data, error } = await createAdminClient().rpc("marketing_tracking_v1", { p_organization_id: org });
    if (error || !isTrackingData(data)) return null;
    return buildTrackingStory(data, googleErrorText);
  } catch {
    return null;
  }
}

/** "Visits and sources" and "Clicks and forms" share one read (owner-approved, 26 Nov 2026). */
export async function getWebsiteDetailStories(): Promise<{ visits: VisitsStory; clicks: ClicksStory } | null> {
  try {
    const org = await managedOrganization();
    if (!org) return null;
    const { data, error } = await createAdminClient().rpc("marketing_website_detail_v1", { p_organization_id: org });
    if (error || !isWebsiteDetail(data)) return null;
    return { visits: buildVisitsStory(data, pageLabel), clicks: buildClicksStory(data, pageLabel) };
  } catch {
    return null;
  }
}
