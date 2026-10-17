'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { claimAndProcessAutomationJobs } from '@/lib/automation/runtime-worker';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/runtime-worker-retry-test?${type}=${encodeURIComponent(message)}`);
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
    go('error', 'Only organization admins can run controlled runtime-worker retry tests.');
  }

  return { organizationId, userId: user.id };
}

export async function prepareRuntimeWorkerRetryTestAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const leadId = value(formData, 'lead_id');
  if (!workflowId || !leadId) go('error', 'Workflow and lead are required.');

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const [{ data: workflow, error: workflowError }, { data: lead, error: leadError }] = await Promise.all([
    admin
      .from('automation_workflows')
      .select('id,status,current_published_version,current_draft_version,runtime_flow_enabled')
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

  if (workflowError || !workflow) go('error', workflowError?.message || 'Workflow was not found.');
  if (leadError || !lead) go('error', leadError?.message || 'Lead was not found.');
  if (workflow.status !== 'active') go('error', 'Workflow must be active.');
  if (workflow.runtime_flow_enabled === true) go('error', 'Automatic runtime must remain disabled during this controlled retry test.');

  const scheduledFor = new Date(Date.now() + 60 * 60_000).toISOString();
  const dedupeKey = `runtime-worker-retry-test:${leadId}:${randomUUID()}`;

  const { data: job, error: jobError } = await admin
    .from('automation_scheduled_jobs')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: null,
      wait_state_id: null,
      lead_id: leadId,
      job_type: 'workflow_wakeup',
      status: 'scheduled',
      scheduled_for: scheduledFor,
      attempt_count: 0,
      max_attempts: 3,
      dedupe_key: dedupeKey,
      payload: {
        source: 'runtime_worker_retry_controlled_test',
        mode: 'controlled_failure_only',
        expected_failure: 'Unsupported job type: workflow_wakeup',
        actor_user_id: userId,
        published_version_at_start: workflow.current_published_version,
        draft_version_at_start: workflow.current_draft_version,
        runtime_flow_enabled: false,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (jobError || !job?.id) go('error', jobError?.message || 'Unable to create controlled failure-only worker job.');

  revalidatePath('/automation/runtime-worker-retry-test');
  go('notice', 'Controlled failure-only job prepared. It is scheduled with 0 / 3 attempts; nothing executed and no customer message was sent.');
}

export async function processRuntimeWorkerRetryAttemptAction(formData: FormData) {
  const jobId = value(formData, 'job_id');
  if (!jobId) go('error', 'Scheduled retry-test job is required.');

  const { organizationId } = await adminContext();
  const admin = createAdminClient();

  const { data: job, error: jobError } = await admin
    .from('automation_scheduled_jobs')
    .select('id,status,attempt_count,max_attempts,job_type,payload')
    .eq('organization_id', organizationId)
    .eq('id', jobId)
    .maybeSingle();

  if (jobError || !job) go('error', jobError?.message || 'Retry-test job was not found.');
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  if (payload.source !== 'runtime_worker_retry_controlled_test') go('error', 'This page will not process unrelated scheduled jobs.');
  if (job.job_type !== 'workflow_wakeup') go('error', 'Controlled retry test expects the failure-only workflow_wakeup job type.');
  if (job.status !== 'scheduled') go('notice', `This job is ${job.status}; it is no longer claimable.`);

  const results = await claimAndProcessAutomationJobs(admin, organizationId, {
    jobId,
    limit: 1,
    allowEarly: true,
  });

  const result = results[0];
  if (!result) go('notice', 'No retry-test job was claimable. Another worker may already have claimed it.');

  revalidatePath('/automation/runtime-worker-retry-test');
  go('notice', `${result.message} Automatic runtime remains disabled and no customer message was sent.`);
}

export async function probeFailedRuntimeWorkerJobAction(formData: FormData) {
  const jobId = value(formData, 'job_id');
  if (!jobId) go('error', 'Failed retry-test job is required.');

  const { organizationId } = await adminContext();
  const admin = createAdminClient();

  const { data: job, error: jobError } = await admin
    .from('automation_scheduled_jobs')
    .select('id,status,attempt_count,max_attempts,payload')
    .eq('organization_id', organizationId)
    .eq('id', jobId)
    .maybeSingle();

  if (jobError || !job) go('error', jobError?.message || 'Retry-test job was not found.');
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  if (payload.source !== 'runtime_worker_retry_controlled_test') go('error', 'This page will not probe unrelated scheduled jobs.');
  if (job.status !== 'failed') go('error', 'Terminal no-reclaim probe requires a failed job.');

  const { data, error } = await admin.rpc('claim_automation_scheduled_jobs_v1', {
    p_organization_id: organizationId,
    p_limit: 1,
    p_job_id: jobId,
    p_allow_early: true,
  });

  if (error) go('error', error.message);
  const claims = (data ?? []) as Array<Record<string, unknown>>;
  if (claims.length !== 0) go('error', `Terminal failure isolation failed: expected 0 claims, got ${claims.length}. Automatic runtime remains disabled.`);

  const mergedPayload = {
    ...payload,
    terminal_failure_probe: {
      claims_observed: 0,
      attempt_count: job.attempt_count,
      max_attempts: job.max_attempts,
      automatic_runtime_enabled: false,
      customer_message_sent: false,
    },
  };

  const { error: evidenceError } = await admin
    .from('automation_scheduled_jobs')
    .update({ payload: mergedPayload })
    .eq('organization_id', organizationId)
    .eq('id', jobId)
    .eq('status', 'failed');

  if (evidenceError) go('error', evidenceError.message);

  revalidatePath('/automation/runtime-worker-retry-test');
  go('notice', 'Terminal failure probe passed: the failed job returned 0 claims and cannot execute again.');
}
