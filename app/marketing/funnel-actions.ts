"use server";

import { revalidatePath } from "next/cache";

import { STEP_KEYS, type FunnelDef, type StepKey } from "@/lib/funnel-advisor";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

// Funnel advisor writes (owner-approved write path, 26 Nov 2026): on the
// signed-in user's session through audited, permission-checked RPCs.

type Result = { ok: boolean; message: string; id?: string };

async function session() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, org: await requireCurrentOrganizationId(supabase, user.id) };
}

const plain = (message: string) => (/not authorized/i.test(message) ? "Only managers and admins can change funnels." : message);

export async function saveFunnelAction(def: FunnelDef): Promise<Result> {
  const steps = (Array.isArray(def?.steps) ? def.steps : []).filter((s): s is StepKey => STEP_KEYS.includes(s as StepKey));
  if (!def?.name?.trim()) return { ok: false, message: "Give the funnel a name." };
  if (steps.length < 2) return { ok: false, message: "A funnel needs at least two steps." };
  const clean = (xs: unknown) => (Array.isArray(xs) ? xs.map((x) => String(x).trim()).filter(Boolean).slice(0, 40) : []);
  try {
    const { supabase, org } = await session();
    const { data, error } = await supabase.rpc("save_marketing_funnel_v1", {
      p_organization_id: org, p_funnel_id: def.id ?? null, p_kind: def.kind === "seo" ? "seo" : "general",
      p_name: def.name.trim().slice(0, 120), p_course_id: def.courseId || null, p_goal: def.goal?.slice(0, 160) ?? null,
      p_steps: steps, p_pages: clean(def.pages), p_terms: clean(def.terms).map((t) => t.toLowerCase()), p_status: def.status ?? "live",
    });
    if (error) return { ok: false, message: plain(error.message) };
    revalidatePath("/marketing");
    return { ok: true, message: def.status === "archived" ? "Funnel archived." : "Funnel saved.", id: String(data) };
  } catch {
    return { ok: false, message: "That did not go through. Please try again." };
  }
}

export async function addFunnelChangeAction(funnelId: string, step: string, title: string, details: string): Promise<Result> {
  if (!funnelId || !STEP_KEYS.includes(step as StepKey) || !title?.trim()) return { ok: false, message: "Describe the change first." };
  try {
    const { supabase, org } = await session();
    const { error } = await supabase.rpc("add_marketing_funnel_change_v1", {
      p_organization_id: org, p_funnel_id: funnelId, p_step: step, p_title: title.trim().slice(0, 160), p_details: details?.slice(0, 2000) ?? null,
    });
    if (error) return { ok: false, message: plain(error.message) };
    revalidatePath("/marketing");
    return { ok: true, message: "Change recorded. The advisor compares this step before and after it." };
  } catch {
    return { ok: false, message: "That did not go through. Please try again." };
  }
}

export async function endFunnelChangeAction(changeId: string): Promise<Result> {
  try {
    const { supabase, org } = await session();
    const { error } = await supabase.rpc("end_marketing_funnel_change_v1", { p_organization_id: org, p_change_id: changeId });
    if (error) return { ok: false, message: plain(error.message) };
    revalidatePath("/marketing");
    return { ok: true, message: "Change ended." };
  } catch {
    return { ok: false, message: "That did not go through. Please try again." };
  }
}
