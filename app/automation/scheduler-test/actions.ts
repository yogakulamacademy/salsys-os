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
  redirect(`/automation/scheduler-test?${type}=${encodeURIComponent(message)}`);
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
    go('error', 'Only organization admins can run controlled scheduler tests.');
  }

  return { organizationId, userId: user.id };
}

export async function scheduleControlledDelayAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const leadId = value(formData, 'lead_id');
  const requestedDelay = Number(value(formData, 'delay_minutes'));
  const delayMinutes = Number.isFinite(requestedDelay)
    ? Math.max(1, Math.min(Math.trunc(requestedDelay), 60))
    : 1;

  if (!workflowId || !leadId) go('error', 'Workflow and lead are required.');

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const [{ data: workflow, error: workflowError }, { data: lead, error: leadError }] = await Promise.all([
    admin
      .from('automation_workflows')
      .select('id,name,status')
      .eq('organization_id', organizationId)
      .eq('id', workflowId)
      .maybeSingle(),
    admin
      .from('leads')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', leadId)
      .maybeSingle(),
  ]);

  if (workflowError || !workflow) {
    go('error', workflowError?.message || 'Workflow was not found in this organization.');
  }

  if (workflow.status !== 'active') {
    go('error', 'The workflow must be active before scheduling a controlled wait.');
  }

  if (leadError || !lead) {
    go('error', leadError?.message || 'Lead was not found in this organization.');
  }

  const { data: existingEnrollment, error: existingEnrollmentError } = await admin
    .from('automation_enrollments')
    .select('id,status,next_action_at,metadata')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('lead_id', leadId)
    .in('status', ['active', 'paused'])
    .maybeSingle();

  if (existingEnrollmentError) go('error', existingEnrollmentError.message);

  let enrollmentId = existingEnrollment?.id ?? null;

  if (enrollmentId) {
    const { data: pendingJob, error: pendingJobError } = await admin
      .from('automation_scheduled_jobs')
      .select('id,scheduled_for,status')
      .eq('organization_id', organizationId)
      .eq('enrollment_id', enrollmentId)
      .in('status', ['scheduled', 'claimed'])
      .order('scheduled_for', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (pendingJobError) go('error', pendingJobError.message);

    if (pendingJob?.id) {
      go('notice', 'Deduplication passed: this lead already has a pending controlled wait for this workflow. No second job was created.');
    }
  } else {
    const { data: enrollment, error: enrollmentError } = await admin
      .from('automation_enrollments')
      .insert({
        organization_id: organizationId,
        workflow_id: workflowId,
        lead_id: leadId,
        status: 'active',
        attempt_count: 0,
        metadata: {
          source: 'scheduler_controlled_test',
          current_state: 'created',
          actor_user_id: userId,
          customer_message_sent: false,
        },
      })
      .select('id')
      .single();

    if (enrollmentError || !enrollment?.id) {
      go('error', enrollmentError?.message || 'Unable to create automation enrollment.');
    }

    enrollmentId = String(enrollment.id);
  }

  const now = new Date();
  const resumeAt = new Date(now.getTime() + delayMinutes * 60_000);

  const { data: waitState, error: waitStateError } = await admin
    .from('automation_wait_states')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollmentId,
      lead_id: leadId,
      wait_type: 'delay',
      status: 'waiting',
      resume_at: resumeAt.toISOString(),
      waiting_since: now.toISOString(),
      metadata: {
        source: 'scheduler_controlled_test',
        delay_minutes: delayMinutes,
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (waitStateError || !waitState?.id) {
    go('error', waitStateError?.message || 'Unable to create controlled wait state.');
  }

  const waitStateId = String(waitState.id);
  const dedupeKey = `controlled-delay:${enrollmentId}:${waitStateId}:v1`;

  const { data: job, error: jobError } = await admin
    .from('automation_scheduled_jobs')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollmentId,
      wait_state_id: waitStateId,
      lead_id: leadId,
      job_type: 'resume_wait',
      status: 'scheduled',
      scheduled_for: resumeAt.toISOString(),
      max_attempts: 3,
      dedupe_key: dedupeKey,
      payload: {
        source: 'scheduler_controlled_test',
        wait_type: 'delay',
        delay_minutes: delayMinutes,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (jobError || !job?.id) {
    await admin
      .from('automation_wait_states')
      .update({
        status: 'failed',
        cancel_reason: jobError?.message || 'Scheduled job creation failed.',
      })
      .eq('organization_id', organizationId)
      .eq('id', waitStateId);

    go('error', jobError?.message || 'Unable to create controlled scheduled job.');
  }

  const { error: enrollmentUpdateError } = await admin
    .from('automation_enrollments')
    .update({
      next_action_at: resumeAt.toISOString(),
      last_event_at: now.toISOString(),
      metadata: {
        source: 'scheduler_controlled_test',
        current_state: 'waiting',
        wait_type: 'delay',
        delay_minutes: delayMinutes,
        wait_state_id: waitStateId,
        scheduled_job_id: job.id,
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', enrollmentId);

  if (enrollmentUpdateError) {
    await Promise.all([
      admin
        .from('automation_scheduled_jobs')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          last_error: enrollmentUpdateError.message,
        })
        .eq('organization_id', organizationId)
        .eq('id', job.id),
      admin
        .from('automation_wait_states')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: enrollmentUpdateError.message,
        })
        .eq('organization_id', organizationId)
        .eq('id', waitStateId),
    ]);

    go('error', enrollmentUpdateError.message);
  }

  revalidatePath('/automation/scheduler-test');
  go(
    'notice',
    `Controlled wait scheduled for ${delayMinutes} minute${delayMinutes === 1 ? '' : 's'}. No customer message was sent.`,
  );
}

export async function resumeControlledDueWaitAction(formData: FormData) {
  const jobId = value(formData, 'job_id');
  if (!jobId) go('error', 'Scheduled job is required.');

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const { data: job, error: jobError } = await admin
    .from('automation_scheduled_jobs')
    .select('id,workflow_id,enrollment_id,wait_state_id,lead_id,status,scheduled_for,attempt_count,max_attempts')
    .eq('organization_id', organizationId)
    .eq('id', jobId)
    .maybeSingle();

  if (jobError || !job) {
    go('error', jobError?.message || 'Scheduled job was not found in this organization.');
  }

  if (job.status !== 'scheduled') {
    go('notice', `This scheduled job is already ${job.status}; nothing was executed again.`);
  }

  const dueAt = new Date(job.scheduled_for);
  const now = new Date();
  if (dueAt.getTime() > now.getTime()) {
    const remainingSeconds = Math.max(1, Math.ceil((dueAt.getTime() - now.getTime()) / 1000));
    go('error', `This wait is not due yet. Try again in about ${remainingSeconds} seconds.`);
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
    go('notice', 'Another execution already claimed this scheduled job. No duplicate resume was performed.');
  }

  const completedAt = new Date().toISOString();

  const { error: waitError } = await admin
    .from('automation_wait_states')
    .update({
      status: 'resumed',
      resumed_at: completedAt,
      metadata: {
        source: 'scheduler_controlled_test',
        resumed_manually: true,
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', job.wait_state_id)
    .eq('status', 'waiting');

  if (waitError) {
    await admin
      .from('automation_scheduled_jobs')
      .update({ status: 'failed', completed_at: completedAt, last_error: waitError.message })
      .eq('organization_id', organizationId)
      .eq('id', job.id);
    go('error', waitError.message);
  }

  const { error: enrollmentError } = await admin
    .from('automation_enrollments')
    .update({
      status: 'completed',
      next_action_at: null,
      last_event_at: completedAt,
      metadata: {
        source: 'scheduler_controlled_test',
        current_state: 'completed',
        resumed_manually: true,
        scheduled_job_id: job.id,
        wait_state_id: job.wait_state_id,
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', job.enrollment_id);

  if (enrollmentError) {
    await admin
      .from('automation_scheduled_jobs')
      .update({ status: 'failed', completed_at: completedAt, last_error: enrollmentError.message })
      .eq('organization_id', organizationId)
      .eq('id', job.id);
    go('error', enrollmentError.message);
  }

  const { error: completeJobError } = await admin
    .from('automation_scheduled_jobs')
    .update({
      status: 'completed',
      completed_at: completedAt,
      payload: {
        source: 'scheduler_controlled_test',
        resumed_manually: true,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', job.id)
    .eq('status', 'claimed');

  if (completeJobError) go('error', completeJobError.message);

  revalidatePath('/automation/scheduler-test');
  go('notice', 'Controlled wait resumed successfully. Enrollment completed and no customer message was sent.');
}
