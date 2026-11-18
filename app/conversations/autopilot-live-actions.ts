"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/** Take a lead back from Autopilot, give it to Autopilot, or acknowledge a handover. */
export async function setAutopilotStateAction(leadId: string, action: "take_over" | "hand_to_ai" | "acknowledge") {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_ai_autopilot_lead_state_v1", { p_lead_id: leadId, p_action: action });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/conversations");
  revalidatePath("/home");
  return { ok: true as const };
}

/** Mark an AI follow-up task done after the message was sent (from the CRM or the Instagram app). */
export async function completeFollowupTaskAction(taskId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_followup_task", { p_task_id: taskId });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/conversations");
  revalidatePath("/follow-ups");
  return { ok: true as const };
}
