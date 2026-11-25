"use server";

import { revalidatePath } from "next/cache";

import {
  CALL_ANSWERS, contactOutcome, followUpDue, followUpTitle, isCallAnswer, stageAfterCall,
} from "@/lib/log-call";
import { createClient } from "@/lib/supabase/server";

// "Log a call in two taps" (owner-approved mockup, 25 Nov 2026). Every step
// goes through the existing database functions, which check permission.
// Nothing is sent to the person.

export type LogCallResult = { ok: boolean; message: string };

export async function logCallAction(leadId: string, fd: FormData): Promise<LogCallResult> {
  const answer = String(fd.get("answer") ?? "");
  if (!isCallAnswer(answer)) return { ok: false, message: "Choose how the call went." };
  const direction = fd.get("direction") === "inbound" ? "inbound" : "outbound";
  const days = Math.max(0, Math.min(60, Number(fd.get("next_days") ?? 0) || 0));
  const note = String(fd.get("note") ?? "").trim().slice(0, 500);
  const label = CALL_ANSWERS.find((a) => a.key === answer)!.label;

  const supabase = await createClient();
  const { data: lead, error: readError } = await supabase.from("leads").select("id, current_stage").eq("id", leadId).maybeSingle();
  if (readError || !lead) return { ok: false, message: readError?.message ?? "Lead not found." };

  const { error: logError } = await supabase.rpc("log_lead_contact", {
    p_lead_id: leadId, p_method: "phone", p_direction: direction, p_outcome: contactOutcome(answer),
    p_comment: note ? `${label}. ${note}` : label, p_contacted_at: new Date().toISOString(), p_call_duration_seconds: null,
  });
  if (logError) return { ok: false, message: logError.message };

  const done: string[] = ["Call saved"];
  const stage = stageAfterCall(answer, String(lead.current_stage));
  if (stage) {
    const { data: claims } = await supabase.auth.getClaims();
    const { error } = await supabase.rpc("set_lead_stage", {
      p_lead_id: leadId, p_new_stage: stage, p_changed_by_type: "human",
      p_changed_by_id: claims?.claims?.sub ?? null, p_reason: `After a call: ${label}`,
    });
    if (error) return { ok: false, message: `Call saved, but the stage did not change: ${error.message}` };
    done.push(`moved to ${stage === "payment_pending" ? "Payment pending" : stage === "not_now" ? "Not now" : "Engaged"}`);
  }

  if (days > 0) {
    const due = followUpDue(days);
    const { error } = await supabase.rpc("create_followup_task", {
      p_lead_id: leadId, p_title: followUpTitle(answer), p_due_at: due.toISOString(),
      p_description: note || `From a call: ${label}`,
    });
    if (error) return { ok: false, message: `Call saved, but the follow-up was not created: ${error.message}` };
    done.push(`follow-up ${due.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`);
  }

  for (const p of [`/leads/${leadId}`, "/leads", "/conversations", "/follow-ups", "/admissions", "/home", "/team-performance"]) revalidatePath(p);
  return { ok: true, message: done.join(" · ") };
}
