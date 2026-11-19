"use server";

import { revalidatePath } from "next/cache";

import { getOrCreateTrackedLink } from "@/lib/dm-links-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * The lead's tracked course link, for a team member to paste into Instagram.
 * Uses the course set on the lead. The link is created on first use.
 */
export async function getTrackedCourseLinkAction(leadId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Your session has expired. Sign in again." };
  const { data: canWork, error: accessError } = await supabase.rpc("can_work_lead", { p_lead_id: leadId });
  if (accessError || canWork !== true) return { ok: false as const, error: "You do not have access to this lead." };

  // Read the lead with the staff's own client (RLS), then create the link server-side.
  const { data: lead } = await supabase
    .from("leads")
    .select("id, organization_id, interested_course_id, preferred_location")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false as const, error: "Lead not found." };
  if (!lead.interested_course_id) return { ok: false as const, error: "Set the lead's course first, then copy the link." };

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("lead_id", leadId)
    .eq("channel", "instagram")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const link = await getOrCreateTrackedLink(createAdminClient(), {
    organizationId: String(lead.organization_id),
    leadId,
    conversationId: conversation?.id ? String(conversation.id) : null,
    courseId: String(lead.interested_course_id),
    preferredLocation: (lead.preferred_location as string | null) ?? null,
    createdBy: "staff",
  });
  if (!link) return { ok: false as const, error: "This course has no website page saved yet." };
  revalidatePath("/conversations");
  return { ok: true as const, url: link.url };
}
