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
    go('error', 'Only organization admins can run controlled reply-wait tests.');
  }

  return { organizationId, userId: user.id };
}

export async function startControlledReplyWaitAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const leadId = value(formData, 'lead_id');
  const requestedTimeout = Number(value(formData, 'timeout_minutes'));
  const timeoutMinutes = Number.isFinite(requestedTimeout)
    ? Math.max(1, Math.min(Math.trunc(requestedTimeout), 60))
    : 5;

  if (!workflowId || !leadId) go('error', 'Workflow and lead are required.');

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const [{ data: workflow, error: workflowError }, { data: lead, error: leadError }] = await Promise.all([
    admin
      .from('automation_workflows')
      .select('id,name,status,stop_on_reply')
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
    go('error', 'The workflow must be active before starting a reply wait.');
  }

  if (workflow.stop_on_reply !== true) {
    go('error', 'This controlled test requires stop-on-reply to be enabled for the workflow.');
  }

  if (leadError || !lead) {
    go('error', leadError?.message || 'Lead was not found in this organization.');
  }

  const { data: existingEnrollment, error: existingEnrollmentError } = await admin
    .from('automation_enrollments')
    .select('id,status')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('lead_id', leadId)
    .in('status', ['active', 'paused'])
    .maybeSingle();

  if (existingEnrollmentError) go('error', existingEnrollmentError.message);

  if (existingEnrollment?.id) {
    const { data: existingWait, error: existingWaitError } = await admin
      .from('automation_wait_states')
      .select('id,status,wait_type')
      .eq('organization_id', organizationId)
      .eq('enrollment_id', existingEnrollment.id)
      .eq('wait_type', 'reply')
      .eq('status', 'waiting')
      .maybeSingle();

    if (existingWaitError) go('error', existingWaitError.message);
    if (existingWait?.id) {
      go('notice', 'Deduplication passed: this lead is already waiting for a reply in this workflow.');
    }

    go('error', 'This lead already has another active enrollment state for this workflow. Complete or stop it first.');
  }

  const now = new Date();
  const timeoutAt = new Date(now.getTime() + timeoutMinutes * 60_000);

  const { data: enrollment, error: enrollmentError } = await admin
    .from('automation_enrollments')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      lead_id: leadId,
      status: 'active',
      attempt_count: 0,
      next_action_at: timeoutAt.toISOString(),
      last_event_at: now.toISOString(),
      metadata: {
        source: 'reply_wait_controlled_test',
        current_state: 'waiting_for_reply',
        timeout_minutes: timeoutMinutes,
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (enrollmentError || !enrollment?.id) {
    go('error', enrollmentError?.message || 'Unable to create reply-wait enrollment.');
  }

  const enrollmentId = String(enrollment.id);

  const { data: waitState, error: waitStateError } = await admin
    .from('automation_wait_states')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollmentId,
      lead_id: leadId,
      wait_type: 'reply',
      status: 'waiting',
      resume_at: null,
      timeout_at: timeoutAt.toISOString(),
      waiting_since: now.toISOString(),
      metadata: {
        source: 'reply_wait_controlled_test',
        timeout_minutes: timeoutMinutes,
        stop_on_reply: true,
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (waitStateError || !waitState?.id) {
    await admin
      .from('automation_enrollments')
      .update({ status: 'cancelled', stopped_reason: waitStateError?.message || 'Reply wait creation failed.' })
      .eq('organization_id', organizationId)
      .eq('id', enrollmentId);
    go('error', waitStateError?.message || 'Unable to create reply wait state.');
  }

  const waitStateId = String(waitState.id);
  const dedupeKey = `controlled-reply-timeout:${enrollmentId}:${waitStateId}:v1`;

  const { data: job, error: jobError } = await admin
    .from('automation_scheduled_jobs')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollmentId,
      wait_state_id: waitStateId,
      lead_id: leadId,
      job_type: 'resume_reply_timeout',
      status: 'scheduled',
      scheduled_for: timeoutAt.toISOString(),
      max_attempts: 3,
      dedupe_key: dedupeKey,
      payload: {
        source: 'reply_wait_controlled_test',
        wait_type: 'reply',
        timeout_minutes: timeoutMinutes,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (jobError || !job?.id) {
    const cancelledAt = new Date().toISOString();
    await Promise.all([
      admin
        .from('automation_wait_states')
        .update({
          status: 'cancelled',
          cancelled_at: cancelledAt,
          cancel_reason: jobError?.message || 'Reply timeout job creation failed.',
        })
        .eq('organization_id', organizationId)
        .eq('id', waitStateId),
      admin
        .from('automation_enrollments')
        .update({
          status: 'cancelled',
          next_action_at: null,
          stopped_reason: jobError?.message || 'Reply timeout job creation failed.',
        })
        .eq('organization_id', organizationId)
        .eq('id', enrollmentId),
    ]);
    go('error', jobError?.message || 'Unable to create reply timeout job.');
  }

  await admin
    .from('automation_enrollments')
    .update({
      metadata: {
        source: 'reply_wait_controlled_test',
        current_state: 'waiting_for_reply',
        timeout_minutes: timeoutMinutes,
        wait_state_id: waitStateId,
        scheduled_job_id: job.id,
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', enrollmentId);

  revalidatePath('/automation/reply-wait-test');
  go('notice', `Waiting for reply for up to ${timeoutMinutes} minute${timeoutMinutes === 1 ? '' : 's'}. No customer message was sent.`);
}

export async function simulateControlledInboundReplyAction(formData: FormData) {
  const waitStateId = value(formData, 'wait_state_id');
  if (!waitStateId) go('error', 'Reply wait state is required.');

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const { data: waitState, error: waitStateError } = await admin
    .from('automation_wait_states')
    .select('id,workflow_id,enrollment_id,lead_id,status,wait_type,waiting_since,timeout_at')
    .eq('organization_id', organizationId)
    .eq('id', waitStateId)
    .maybeSingle();

  if (waitStateError || !waitState) {
    go('error', waitStateError?.message || 'Reply wait state was not found in this organization.');
  }

  if (waitState.wait_type !== 'reply') {
    go('error', 'The selected wait state is not a reply wait.');
  }

  if (waitState.status !== 'waiting') {
    go('notice', `This reply wait is already ${waitState.status}; nothing was executed again.`);
  }

  const sourceSystem = 'manual_reply_wait_test';
  const sourceEventId = `message.received:${waitState.id}:v1`;

  const { data: existingEvent, error: existingEventError } = await admin
    .from('automation_events')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('source_system', sourceSystem)
    .eq('source_event_id', sourceEventId)
    .maybeSingle();

  if (existingEventError) go('error', existingEventError.message);

  let eventId = existingEvent?.id ? String(existingEvent.id) : null;

  if (!eventId) {
    const { data: event, error: eventError } = await admin
      .from('automation_events')
      .insert({
        organization_id: organizationId,
        event_name: 'message.received',
        source_system: sourceSystem,
        source_event_id: sourceEventId,
        lead_id: waitState.lead_id,
        occurred_at: new Date().toISOString(),
        payload: {
          mode: 'controlled_reply_simulation',
          wait_state_id: waitState.id,
          actor_user_id: userId,
          synthetic_inbound_event: true,
          customer_message_sent: false,
        },
      })
      .select('id')
      .single();

    if (eventError || !event?.id) {
      go('error', eventError?.message || 'Unable to record controlled inbound reply event.');
    }

    eventId = String(event.id);
  }

  const now = new Date().toISOString();

  const { error: resumeError } = await admin
    .from('automation_wait_states')
    .update({
      status: 'resumed',
      resumed_at: now,
      resume_event_id: eventId,
      metadata: {
        source: 'reply_wait_controlled_test',
        resumed_by: 'message.received',
        synthetic_inbound_event: true,
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', waitState.id)
    .eq('status', 'waiting');

  if (resumeError) go('error', resumeError.message);

  const { error: cancelJobError } = await admin
    .from('automation_scheduled_jobs')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      payload: {
        source: 'reply_wait_controlled_test',
        cancelled_by: 'message.received',
        synthetic_inbound_event: true,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('wait_state_id', waitState.id)
    .eq('status', 'scheduled');

  if (cancelJobError) go('error', cancelJobError.message);

  const { error: enrollmentError } = await admin
    .from('automation_enrollments')
    .update({
      status: 'completed',
      next_action_at: null,
      last_event_at: now,
      metadata: {
        source: 'reply_wait_controlled_test',
        current_state: 'reply_received',
        resumed_by: 'message.received',
        synthetic_inbound_event: true,
        resume_event_id: eventId,
        wait_state_id: waitState.id,
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', waitState.enrollment_id);

  if (enrollmentError) go('error', enrollmentError.message);

  revalidatePath('/automation/reply-wait-test');
  go('notice', 'Controlled inbound reply processed: reply wait resumed, timeout job cancelled, and no customer message was sent.');
}
