"use server";

import { revalidatePath } from "next/cache";

import { recomputeLead } from "@/lib/lead-interests-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** A team member makes a course the lead's main course, or removes an interest. */
export async function setLeadInterestAction(leadId: string, courseId: string, action: "make_main" | "remove") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Your session has expired. Sign in again." };
  const { data: canWork } = await supabase.rpc("can_work_lead", { p_lead_id: leadId });
  if (canWork !== true) return { ok: false as const, error: "You do not have access to this lead." };
  const { data: lead } = await supabase.from("leads").select("organization_id").eq("id", leadId).maybeSingle();
  if (!lead) return { ok: false as const, error: "Lead not found." };

  const admin = createAdminClient();
  const organizationId = String(lead.organization_id);
  const { data: course } = await admin.from("courses").select("id").eq("organization_id", organizationId).eq("id", courseId).maybeSingle();
  if (!course) return { ok: false as const, error: "Course not found." };
  const now = new Date().toISOString();
  if (action === "make_main") {
    // Only one course is the team's choice at a time.
    await admin.from("lead_course_interests").update({ set_by: "system" }).eq("lead_id", leadId).eq("set_by", "staff");
    const { data: existing } = await admin.from("lead_course_interests").select("sources").eq("lead_id", leadId).eq("course_id", courseId).maybeSingle();
    await admin.from("lead_course_interests").upsert({
      organization_id: organizationId, lead_id: leadId, course_id: courseId, strength: 100, status: "active", set_by: "staff",
      sources: [...new Set([...((existing?.sources as string[] | undefined) ?? []), "staff"])].sort(), last_seen_at: now, updated_at: now,
    }, { onConflict: "lead_id,course_id" });
  } else {
    await admin.from("lead_course_interests").update({ status: "dropped", is_primary: false, set_by: "staff", updated_at: now })
      .eq("lead_id", leadId).eq("course_id", courseId);
  }
  await recomputeLead(admin, organizationId, leadId, now.slice(0, 10));
  await admin.from("activities").insert({
    lead_id: leadId, activity_type: "course_interest_updated", actor_type: "user", actor_id: user.id,
    title: action === "make_main" ? "Main course set by the team" : "Course interest removed by the team", details: courseId, metadata: { course_id: courseId, action },
  });
  revalidatePath("/conversations");
  return { ok: true as const };
}
