"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function personalQueueUrl(key: "notice" | "error", value: string) {
  const params = new URLSearchParams();
  params.set(key, value);
  return `/work-queue/mine?${params.toString()}`;
}

function revalidateEmployeeWorkspace(leadId?: string | null) {
  revalidatePath("/work-queue");
  revalidatePath("/work-queue/mine");
  revalidatePath("/opportunities");
  revalidatePath("/dashboard");
  revalidatePath("/follow-ups");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/conversations");

  if (leadId) {
    revalidatePath(`/leads/${leadId}`);
  }
}

export async function completeDashboardFollowUpAction(formData: FormData) {
  const taskId = textValue(formData, "task_id");
  const leadId = textValue(formData, "lead_id");

  if (!taskId) {
    redirect(personalQueueUrl("error", "Follow-up task is missing."));
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("complete_followup_task", {
    p_task_id: taskId,
  });

  if (error) {
    redirect(personalQueueUrl("error", error.message));
  }

  revalidateEmployeeWorkspace(leadId);

  redirect(personalQueueUrl("notice", "followup-completed"));
}

export async function snoozeDashboardFollowUpAction(formData: FormData) {
  const taskId = textValue(formData, "task_id");
  const leadId = textValue(formData, "lead_id");

  if (!taskId) {
    redirect(personalQueueUrl("error", "Follow-up task is missing."));
  }

  const dueAt = tomorrowAt10AmIndia();
  const supabase = await createClient();

  const { error } = await supabase.rpc("snooze_followup_task", {
    p_task_id: taskId,
    p_due_at: dueAt,
  });

  if (error) {
    redirect(personalQueueUrl("error", error.message));
  }

  revalidateEmployeeWorkspace(leadId);

  redirect(personalQueueUrl("notice", "followup-snoozed"));
}

function tomorrowAt10AmIndia() {
  const now = new Date();
  const indiaOffsetMs = 5.5 * 60 * 60 * 1000;
  const indiaClock = new Date(now.getTime() + indiaOffsetMs);

  const year = indiaClock.getUTCFullYear();
  const month = indiaClock.getUTCMonth();
  const day = indiaClock.getUTCDate();

  const utcMs = Date.UTC(year, month, day + 1, 10, 0, 0, 0) - indiaOffsetMs;

  return new Date(utcMs).toISOString();
}
