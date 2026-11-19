import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { courseDestination, newLinkCode, trackedLinkUrl } from "@/lib/dm-links";
import { getOrgSalesAiSettings } from "@/lib/org-sales-ai-settings";

export type TrackedLinkStatus = {
  url: string;
  code: string;
  courseName: string | null;
  sentAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  visitCountry: string | null;
  visitRegion: string | null;
};

/**
 * The lead's live tracked link for a course, created if missing. Returns null
 * when the course has no website page saved. Uses the service-role client: only
 * the server creates links (staff cannot write the table directly).
 */
export async function getOrCreateTrackedLink(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    leadId: string;
    conversationId?: string | null;
    courseId: string;
    preferredLocation?: string | null;
    createdBy: "ai" | "staff";
  },
): Promise<{ url: string; code: string } | null> {
  const nowIso = new Date().toISOString();
  const settings = await getOrgSalesAiSettings(admin, input.organizationId);
  const { data: existing } = await admin
    .from("dm_tracked_links")
    .select("code, expires_at")
    .eq("organization_id", input.organizationId)
    .eq("lead_id", input.leadId)
    .eq("course_id", input.courseId)
    .is("revoked_at", null)
    .maybeSingle();
  if (existing?.code && String(existing.expires_at) > nowIso) {
    return { code: String(existing.code), url: trackedLinkUrl(String(existing.code), settings) };
  }
  if (existing?.code) {
    // Expired: retire it so a fresh one can be issued.
    await admin.from("dm_tracked_links").update({ revoked_at: nowIso })
      .eq("organization_id", input.organizationId).eq("code", String(existing.code));
  }

  const { data: course } = await admin
    .from("courses")
    .select("id, metadata")
    .eq("organization_id", input.organizationId)
    .eq("id", input.courseId)
    .maybeSingle();
  const destination = courseDestination((course?.metadata ?? null) as Record<string, unknown> | null, input.preferredLocation, settings.websiteHosts);
  if (!destination) return null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = newLinkCode();
    const { error } = await admin.from("dm_tracked_links").insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      conversation_id: input.conversationId ?? null,
      course_id: input.courseId,
      code,
      destination_url: destination,
      created_by: input.createdBy,
    });
    if (!error) return { code, url: trackedLinkUrl(code, settings) };
    // Another request made the lead's link at the same moment: use that one.
    if (/dm_tracked_links_one_live_per_course/.test(error.message)) {
      const { data: raced } = await admin.from("dm_tracked_links").select("code")
        .eq("organization_id", input.organizationId).eq("lead_id", input.leadId)
        .eq("course_id", input.courseId).is("revoked_at", null).maybeSingle();
      if (raced?.code) return { code: String(raced.code), url: trackedLinkUrl(String(raced.code), settings) };
      return null;
    }
    if (!/duplicate key/.test(error.message)) {
      console.error("Tracked link could not be created", { leadId: input.leadId, error: error.message });
      return null;
    }
  }
  return null;
}

/** Most recent tracked link for a lead, for the Inbox (read with the staff's own client, RLS applies). */
export async function getLeadTrackedLink(client: SupabaseClient, leadId: string): Promise<TrackedLinkStatus | null> {
  const { data } = await client
    .from("dm_tracked_links")
    .select("organization_id, code, sent_at, first_opened_at, last_opened_at, open_count, visit_country, visit_region, courses(name)")
    .eq("lead_id", leadId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.code) return null;
  const course = Array.isArray(data.courses) ? data.courses[0] : data.courses;
  const settings = await getOrgSalesAiSettings(client, String(data.organization_id));
  return {
    url: trackedLinkUrl(String(data.code), settings),
    code: String(data.code),
    courseName: (course as { name?: string } | null)?.name ?? null,
    sentAt: (data.sent_at as string | null) ?? null,
    firstOpenedAt: (data.first_opened_at as string | null) ?? null,
    lastOpenedAt: (data.last_opened_at as string | null) ?? null,
    openCount: Number(data.open_count ?? 0),
    visitCountry: (data.visit_country as string | null) ?? null,
    visitRegion: (data.visit_region as string | null) ?? null,
  };
}
