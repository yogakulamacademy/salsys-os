"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// Data quality (owner-approved mockup, 25 Nov 2026). Each change goes through
// a database function that checks the user's permission itself.

const UUID = /^[0-9a-f-]{36}$/i;
type Result = { ok: boolean; message: string };

function refresh() {
  for (const p of ["/data-quality", "/leads", "/admissions", "/conversations", "/customer-360", "/personas", "/home"]) revalidatePath(p);
}

/** Set the course on one or many leads: pairs of lead_id and course_id. Only the course changes. */
export async function fillCourseAction(fd: FormData): Promise<Result> {
  const leads = fd.getAll("lead_id").map(String);
  const courses = fd.getAll("course_id").map(String);
  const pairs = leads.map((l, i) => [l, courses[i] ?? ""]).filter(([l, c]) => UUID.test(l) && UUID.test(c)).slice(0, 300);
  if (!pairs.length) return { ok: false, message: "Nothing to fill." };
  const supabase = await createClient();
  let done = 0;
  let failed = 0;
  for (const [leadId, courseId] of pairs) {
    const { error } = await supabase.rpc("update_crm_lead_fields", { p_lead_id: leadId, p_patch: { interested_course_id: courseId } });
    if (error) failed += 1; else done += 1;
  }
  refresh();
  if (!done) return { ok: false, message: "No course could be filled. Please try again." };
  return { ok: true, message: `${done} course${done === 1 ? "" : "s"} filled${failed ? ` · ${failed} could not be changed` : ""}` };
}

/** Mark same-person checks as different people (e.g. ones raised by your own test leads). */
export async function clearConflictsAction(fd: FormData): Promise<Result> {
  const ids = [...new Set(fd.getAll("conflict_id").map(String).filter((v) => UUID.test(v)))].slice(0, 50);
  if (!ids.length) return { ok: false, message: "Nothing to clear." };
  const supabase = await createClient();
  let done = 0;
  for (const id of ids) {
    const { error } = await supabase.rpc("dismiss_identity_resolution_conflict_v1", { p_conflict_id: id });
    if (!error) done += 1;
  }
  refresh();
  if (!done) return { ok: false, message: "None could be cleared. Only managers and admins can do this." };
  return { ok: true, message: `${done} same-person check${done === 1 ? "" : "s"} cleared` };
}
