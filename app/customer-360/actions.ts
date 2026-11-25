"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// Customer 360 (25 Nov 2026): make the course their messages point to the
// lead's main course. Goes through update_crm_lead_fields, which checks the
// user can work on this lead; only the course is changed.

export async function setMainCourseAction(leadId: string, courseId: string, personId: string): Promise<{ ok: boolean; message: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(leadId) || !/^[0-9a-f-]{36}$/i.test(courseId)) return { ok: false, message: "Something is missing." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_crm_lead_fields", { p_lead_id: leadId, p_patch: { interested_course_id: courseId } });
  if (error) return { ok: false, message: error.message };
  for (const p of [`/customer-360/${personId}`, `/leads/${leadId}`, "/leads", "/conversations", "/admissions"]) revalidatePath(p);
  return { ok: true, message: "Course updated. Check the value matches the price you quoted." };
}
