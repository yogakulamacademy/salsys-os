'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';


function textValue(
  formData: FormData,
  key: string
) {
  const value =
    String(
      formData.get(key) ?? ''
    ).trim();

  return value || null;
}


function revalidateAdmissionsLead(
  leadId?: string | null
) {
  revalidatePath('/admissions');
  revalidatePath('/follow-ups');
  revalidatePath('/dashboard');
  revalidatePath('/leads');
  revalidatePath('/pipeline');
  revalidatePath('/conversations');

  if (leadId) {
    revalidatePath(
      `/leads/${leadId}`
    );
  }
}


export async function completeAdmissionFollowUpAction(
  formData: FormData
) {
  const taskId =
    textValue(
      formData,
      'task_id'
    );

  const leadId =
    textValue(
      formData,
      'lead_id'
    );

  if (!taskId) {
    redirect(
      '/admissions?error=Follow-up%20task%20is%20missing'
    );
  }

  const supabase =
    await createClient();

  const {
    error,
  } = await supabase.rpc(
    'complete_followup_task',
    {
      p_task_id:
        taskId,
    }
  );

  if (error) {
    redirect(
      `/admissions?error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  revalidateAdmissionsLead(
    leadId
  );

  redirect(
    '/admissions?notice=followup-completed'
  );
}


export async function snoozeAdmissionFollowUpAction(
  formData: FormData
) {
  const taskId =
    textValue(
      formData,
      'task_id'
    );

  const leadId =
    textValue(
      formData,
      'lead_id'
    );

  if (!taskId) {
    redirect(
      '/admissions?error=Follow-up%20task%20is%20missing'
    );
  }

  const dueAt =
    tomorrowAt10AmIndia();

  const supabase =
    await createClient();

  const {
    error,
  } = await supabase.rpc(
    'snooze_followup_task',
    {
      p_task_id:
        taskId,
      p_due_at:
        dueAt,
    }
  );

  if (error) {
    redirect(
      `/admissions?error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  revalidateAdmissionsLead(
    leadId
  );

  redirect(
    '/admissions?notice=followup-snoozed'
  );
}


export async function logAdmissionContactAction(
  formData: FormData
) {
  const leadId =
    textValue(
      formData,
      'lead_id'
    );

  const channelRaw =
    textValue(
      formData,
      'channel'
    );

  if (!leadId) {
    redirect(
      '/admissions?error=Lead%20is%20missing'
    );
  }

  const allowedChannels = new Set([
    'website',
    'instagram',
    'whatsapp',
    'email',
    'phone',
    'meta_lead_form',
    'other',
  ]);

  const channel =
    channelRaw &&
    allowedChannels.has(
      channelRaw
    )
      ? channelRaw
      : 'other';

  const body =
    textValue(
      formData,
      'body'
    ) ||
    defaultContactLogBody(
      channel
    );

  const supabase =
    await createClient();

  const {
    error,
  } = await supabase.rpc(
    'log_lead_interaction',
    {
      p_lead_id:
        leadId,
      p_channel:
        channel,
      p_direction:
        'outbound',
      p_body:
        body,
      p_conversation_id:
        null,
    }
  );

  if (error) {
    redirect(
      `/admissions?error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  revalidateAdmissionsLead(
    leadId
  );

  redirect(
    '/admissions?notice=contact-logged'
  );
}


function defaultContactLogBody(
  channel: string
) {
  if (
    channel === 'whatsapp'
  ) {
    return 'Manual WhatsApp response logged from Admissions Desk.';
  }

  if (
    channel === 'email'
  ) {
    return 'Manual email response logged from Admissions Desk.';
  }

  if (
    channel === 'phone'
  ) {
    return 'Manual outbound phone contact logged from Admissions Desk.';
  }

  if (
    channel === 'instagram'
  ) {
    return 'Manual Instagram response logged from Admissions Desk.';
  }

  return 'Manual outbound contact logged from Admissions Desk.';
}


function tomorrowAt10AmIndia() {
  const now =
    new Date();

  const indiaOffsetMs =
    5.5 *
    60 *
    60 *
    1000;

  const indiaClock =
    new Date(
      now.getTime() +
      indiaOffsetMs
    );

  const year =
    indiaClock
      .getUTCFullYear();

  const month =
    indiaClock
      .getUTCMonth();

  const day =
    indiaClock
      .getUTCDate();

  const utcMs =
    Date.UTC(
      year,
      month,
      day + 1,
      10,
      0,
      0,
      0
    ) -
    indiaOffsetMs;

  return new Date(
    utcMs
  ).toISOString();
}
