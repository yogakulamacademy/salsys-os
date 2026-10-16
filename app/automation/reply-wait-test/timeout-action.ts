'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/reply-wait-test?${type}=${encodeURIComponent(message)}`);
}

async function adminContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) go('error', 'Your session has expired. Sign in again.');

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage } = await supabase.rpc('can_manage_organization', {
    p_organization_id: organizationId,
  });

  if (canManage !== true) {
    go('error', 'Only organization admins can run controlled reply-timeout tests.');
  }

  return { organizationId, userId: user.id };
}

export async function processControlledReplyTimeoutAction(formData: FormData) {
  const jobId = value(formData, 'job_id');
  if (!jobId) go('error', 'Reply timeout job is required.');

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const { data: job, error: jobError } = await admin
    .from('automation_scheduled_jobs')
    .select('id,workflow_id,enrollment_id,wait_state_id,lead_id,job_type,status,scheduled_for,attempt_count,max_attempts')
    .eq('organization_id', organizationId)
    .eq('id', jobId)
    .maybeSingle();

  if (jobError || !job) {
    go('error', jobError?.message || 'Reply timeout job was not found in this organization.');
  }

  if (job.job_type !== 'resume_reply_timeout') {
    go('error', 'The selected scheduled job is not a reply-timeout job.');
  }

  if (job.status !== 'scheduled') {
    go('notice', `This reply timeout job is already ${job.status}; nothing was executed again.`);
  }

  const dueAt = new Date(job.scheduled_for);
  const now = new Date();

  if (dueAt.getTime() > now.getTime()) {
    const remainingSeconds = Math.max(1, Math.ceil((dueAt.getTime() - now.getTime()) / 1000));
    go('error', `This reply timeout is not due yet. Try again in about ${remainingSeconds} seconds.`);
  }

  if (Number(job.attempt_count ?? 0) >= Number(job.max_attempts ?? 3)) {
    go('error', 'This reply timeout has reached its maximum attempt limit.');
  }

  const { data: waitState, error: waitStateError } = await admin
    .from('automation_wait_states')
    .select('id,enrollment_id,lead_id,wait_type,status,timeout_at')
    .eq('organization_id', organizationId)
    .eq('id', job.wait_state_id)
    .maybeSingle();

  if (waitStateError || !waitState) {
    go('error', waitStateError?.message || 'Reply wait state was not found in this organization.');
  }

  if (waitState.wait_type !== 'reply') {
    go('error', 'The scheduled timeout does not point to a reply wait.');
  }

  if (waitState.status !== 'waiting') {
    const cancelledAt = new Date().toISOString();
    await admin
      .from('automation_scheduled_jobs')
      .update({
        status: 'cancelled',
        cancelled_at: cancelledAt,
        payload: {
          source: 'reply_wait_controlled_test',
          cancelled_reason: `wait_already_${waitState.status}`,
          customer_message_sent: false,
        },
      })
      .eq('organization_id', organizationId)
      .eq('id', job.id)
      .eq('status', 'scheduled');

    revalidatePath('/automation/reply-wait-test');
    go('notice', `Reply wait is already ${waitState.status}; the stale timeout job was cancelled and no duplicate branch ran.`);
  }

  const { data: claimedJob, error: claimError } = await admin
    .from('automation_scheduled_jobs')
    .update({
      status: 'claimed',
      claimed_at: now.toISOString(),
      attempt_count: Number(job.attempt_count ?? 0) + 1,
    })
    .eq('organization_id', organizationId)
    .eq('id', job.id)
    .eq('status', 'scheduled')
    .select('id')
    .maybeSingle();

  if (claimError) go('error', claimError.message);
  if (!claimedJob?.id) {
    go('notice', 'Another execution already claimed or cancelled this reply timeout. No duplicate branch ran.');
  }

  const completedAt = new Date().toISOString();

  const { data: expiredWait, error: expireError } = await admin
    .from('automation_wait_states')
    .update({
      status: 'expired',
      resumed_at: completedAt,
      metadata: {
        source: 'reply_wait_controlled_test',
        resumed_by: 'reply_timeout',
        actor_user_id: userId,
        no_reply_branch: true,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', waitState.id)
    .eq('status', 'waiting')
    .select('id')
    .maybeSingle();

  if (expireError) {
    await admin
      .from('automation_scheduled_jobs')
      .update({ status: 'failed', completed_at: completedAt, last_error: expireError.message })
      .eq('organization_id', organizationId)
      .eq('id', job.id)
      .eq('status', 'claimed');
    go('error', expireError.message);
  }

  if (!expiredWait?.id) {
    await admin
      .from('automation_scheduled_jobs')
      .update({
        status: 'cancelled',
        cancelled_at: completedAt,
        payload: {
          source: 'reply_wait_controlled_test',
          cancelled_reason: 'reply_won_race',
          customer_message_sent: false,
        },
      })
      .eq('organization_id', organizationId)
      .eq('id', job.id)
      .eq('status', 'claimed');

    revalidatePath('/automation/reply-wait-test');
    go('notice', 'A reply won the race before timeout processing completed. The timeout branch was cancelled.');
  }

  const { error: enrollmentError } = await admin
    .from('automation_enrollments')
    .update({
      status: 'completed',
      next_action_at: null,
      last_event_at: completedAt,
      metadata: {
        source: 'reply_wait_controlled_test',
        current_state: 'reply_timeout',
        resumed_by: 'reply_timeout',
        no_reply_branch: true,
        wait_state_id: waitState.id,
        scheduled_job_id: job.id,
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', waitState.enrollment_id);

  if (enrollmentError) {
    await admin
      .from('automation_scheduled_jobs')
      .update({ status: 'failed', completed_at: completedAt, last_error: enrollmentError.message })
      .eq('organization_id', organizationId)
      .eq('id', job.id)
      .eq('status', 'claimed');
    go('error', enrollmentError.message);
  }

  const { error: completeJobError } = await admin
    .from('automation_scheduled_jobs')
    .update({
      status: 'completed',
      completed_at: completedAt,
      payload: {
        source: 'reply_wait_controlled_test',
        processed_by: 'reply_timeout',
        no_reply_branch: true,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', job.id)
    .eq('status', 'claimed');

  if (completeJobError) go('error', completeJobError.message);

  revalidatePath('/automation/reply-wait-test');
  go('notice', 'Controlled no-reply timeout processed: wait expired, enrollment completed on the no-reply branch, and no customer message was sent.');
}
