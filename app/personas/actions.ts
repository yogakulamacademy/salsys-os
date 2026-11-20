"use server";

import { revalidatePath } from "next/cache";

import { refreshCoursePersonas } from "@/lib/course-persona-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

type Result = { ok: true; message: string } | { ok: false; message: string };

async function managerContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Sign in again." } as const;
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage } = await supabase.rpc("can_manage_organization", { p_organization_id: organizationId });
  if (canManage !== true) return { error: "Only managers can change personas." } as const;
  return { supabase, user, organizationId } as const;
}

/** Re-learn draft personas from current leads. Approved personas are not touched. */
export async function refreshPersonasAction(): Promise<Result> {
  const ctx = await managerContext();
  if ("error" in ctx) return { ok: false, message: ctx.error ?? "Not allowed." };
  try {
    const r = await refreshCoursePersonas(createAdminClient(), ctx.organizationId);
    revalidatePath("/personas");
    return { ok: true, message: `Learned ${r.learned} persona${r.learned === 1 ? "" : "s"} from ${r.courses} course${r.courses === 1 ? "" : "s"}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not refresh personas." };
  }
}

/** Approve a course's current draft: Fit scores start using it. */
export async function approvePersonaAction(personaId: string): Promise<Result> {
  const ctx = await managerContext();
  if ("error" in ctx) return { ok: false, message: ctx.error ?? "Not allowed." };
  const { data: row, error } = await ctx.supabase.from("course_personas")
    .select("id, draft_traits, draft_sample_size").eq("organization_id", ctx.organizationId).eq("id", personaId).maybeSingle();
  if (error || !row) return { ok: false, message: "Persona not found." };
  if (!row.draft_sample_size) return { ok: false, message: "There is no draft to approve yet." };
  const { error: updateError } = await ctx.supabase.from("course_personas").update({
    approved_traits: row.draft_traits, approved_sample_size: row.draft_sample_size,
    approved_by: ctx.user.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("organization_id", ctx.organizationId).eq("id", personaId);
  if (updateError) return { ok: false, message: updateError.message };
  revalidatePath("/personas");
  return { ok: true, message: "Persona approved. Fit scores now use it." };
}
