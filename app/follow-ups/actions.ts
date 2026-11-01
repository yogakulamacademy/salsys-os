'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';

function textValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return value || null;
}

function istDateTimeLocalToIso(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}:00+05:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function snoozeFollowUpFromQueueAction(formData: FormData) {
  const taskId = textValue(formData, 'task_id');
  const rawDueAt = textValue(formData, 'due_at');

  if (!taskId || !rawDueAt) {
    redirect('/follow-ups?error=Task%20and%20new%20time%20are%20required');
  }

  if (useMockData) {
    redirect('/follow-ups?notice=mock-snooze');
  }

  const dueAt = istDateTimeLocalToIso(rawDueAt);
  if (!dueAt) {
    redirect(
      `/follow-ups?error=${encodeURIComponent('Enter a valid follow-up date and time in IST.')}`,
    );
  }

  if (new Date(dueAt).getTime() <= Date.now()) {
    redirect(
      `/follow-ups?error=${encodeURIComponent('Choose a future time when rescheduling a follow-up.')}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('snooze_followup_task', {
    p_task_id: taskId,
    p_due_at: dueAt,
  });

  if (error) {
    redirect(`/follow-ups?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/follow-ups');
  revalidatePath('/dashboard');
  redirect('/follow-ups?notice=snoozed');
}
