"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// Smart Re-engaged (25 Nov 2026): move people who wrote back "no" to Not now,
// so they leave the active lists but can come back. Each move goes through
// set_lead_stage, which checks permission; closed or already-parked leads are skipped.

const SKIP = new Set(["not_now", "lost", "closed_won", "enrolled", "unqualified", "duplicate"]);

export async function moveSaidNoToNotNowAction(fd: FormData): Promise<{ ok: boolean; message: string }> {
  const ids = [...new Set(fd.getAll("lead_id").map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v)))].slice(0, 200);
  if (!ids.length) return { ok: false, message: "Nobody selected." };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data: leads, error } = await supabase.from("leads").select("id, current_stage").in("id", ids);
  if (error) return { ok: false, message: error.message };
  let moved = 0;
  let failed = 0;
  for (const l of (leads ?? []) as Array<{ id: string; current_stage: string }>) {
    if (SKIP.has(l.current_stage)) continue;
    const { error: e } = await supabase.rpc("set_lead_stage", {
      p_lead_id: l.id, p_new_stage: "not_now", p_changed_by_type: "human",
      p_changed_by_id: claims?.claims?.sub ?? null, p_reason: "Wrote back no after a check-in (Re-engaged)",
    });
    if (e) failed += 1; else moved += 1;
  }
  for (const p of ["/re-engaged", "/leads", "/admissions", "/conversations", "/home"]) revalidatePath(p);
  if (!moved && failed) return { ok: false, message: "None could be moved. Please try again." };
  return { ok: true, message: `${moved} moved to Not now${failed ? ` · ${failed} could not be moved` : ""}` };
}
