'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return value || null;
}

export async function completeAdmissionFollowUpAction(formData: FormData) {
  const taskId = textValue(formData, 'task_id');
  const leadId = textValue(formData, 'lead_id');

  if (!taskId) {
    redirect('/admissions?error=Missing%20follow-up%20task');
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('complete_followup_task', {
    p_task_id: taskId,
  });

  if (error) {
    redirect(`/admissions?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/admissions');
  revalidatePath('/follow-ups');
  revalidatePath('/dashboard');

  if (leadId) {
    revalidatePath(`/leads/${leadId}`);
  }

  redirect('/admissions?notice=followup-completed');
}

export async function snoozeAdmissionFollowUpAction(formData: FormData) {
  const taskId = textValue(formData, 'task_id');
  const leadId = textValue(formData, 'lead_id');

  if (!taskId) {
    redirect('/admissions?error=Missing%20follow-up%20task');
  }

  // Tomorrow at 10:00 AM Asia/Kolkata, converted explicitly to UTC.
  const now = new Date();
  const indiaOffsetMs = 5.5 * 60 * 60 * 1000;
  const indiaClock = new Date(now.getTime() + indiaOffsetMs);

  const dueAt = new Date(
    Date.UTC(
      indiaClock.getUTCFullYear(),
      indiaClock.getUTCMonth(),
      indiaClock.getUTCDate() + 1,
      10,
      0,
      0,
      0
    ) - indiaOffsetMs
  );

  const supabase = await createClient();
  const { error } = await supabase.rpc('snooze_followup_task', {
    p_task_id: taskId,
    p_due_at: dueAt.toISOString(),
  });

  if (error) {
    redirect(`/admissions?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/admissions');
  revalidatePath('/follow-ups');
  revalidatePath('/dashboard');

  if (leadId) {
    revalidatePath(`/leads/${leadId}`);
  }

  redirect('/admissions?notice=followup-snoozed');
}
