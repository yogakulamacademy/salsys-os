'use server';

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
  redirect(`/automation/runtime-worker-test?${type}=${encodeURIComponent(message)}`);
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
    go('error', 'Only organization admins can run controlled runtime-worker tests.');
  }

  return { organizationId, userId: user.id };
}

export async function prepareRuntimeWorkerTestAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const leadId = value(formData, 'lead_id');

  if (!workflowId || !leadId) go('error', 'Workflow and lead are required.');

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const [{ data: workflow, error: workflowError }, { data: lead, error: leadError }] = await Promise.all([
    admin
      .from('automation_workflows')
      .select('id,current_published_version,runtime_flow_enabled,status')
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
  if (workflow.runtime_flow_enabled === true) go('error', 'Automatic runtime must stay disabled during the controlled worker test.');

  const publishedVersion = Number(workflow.current_published_version ?? 0);
  if (!publishedVersion) go('error', 'A published flow version is required.');

  const { data: trigger, error: triggerError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key,node_type,label')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', publishedVersion)
    .eq('node_type', 'trigger')
    .eq('enabled', true)
    .limit(1)
    .maybeSingle();

  if (triggerError || !trigger) go('error', triggerError?.message || 'Published trigger was not found.');

  const { data: triggerEdges, error: edgeError } = await admin
    .from('automation_flow_edges')
    .select('target_node_id,label,priority')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', publishedVersion)
    .eq('source_node_id', trigger.id)
    .order('priority', { ascending: true })
    .limit(2);

  if (edgeError) go('error', edgeError.message);
  if ((triggerEdges ?? []).length !== 1) go('error', `Published trigger must have exactly one outgoing edge; found ${(triggerEdges ?? []).length}.`);

  const waitNodeId = String(triggerEdges![0].target_node_id);
  const { data: waitNode, error: waitNodeError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key,node_type,label,config')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', publishedVersion)
    .eq('id', waitNodeId)
    .eq('enabled', true)
    .maybeSingle();

  if (waitNodeError || !waitNode) go('error', waitNodeError?.message || 'Published wait node was not found.');
  if (waitNode.node_type !== 'wait_for_reply') go('error', `Controlled worker setup expects wait_for_reply after trigger, found ${waitNode.node_type}.`);

  const { data: existingEnrollment, error: existingError } = await admin
    .from('automation_enrollments')
    .select('id,status')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('lead_id', leadId)
    .in('status', ['active', 'paused'])
    .maybeSingle();

  if (existingError) go('error', existingError.message);
  if (existingEnrollment?.id) go('error', 'This lead already has an active enrollment for this workflow. Complete or stop it before preparing the worker test.');

  const config = (waitNode.config ?? {}) as Record<string, unknown>;
  const timeoutMinutes = Math.max(1, Math.min(Math.round(Number(config.timeout_minutes ?? 60) || 60), 10080));
  const now = new Date();
  const nowIso = now.toISOString();
  const timeoutAt = new Date(now.getTime() + timeoutMinutes * 60_000).toISOString();

  const { data: enrollment, error: enrollmentError } = await admin
    .from('automation_enrollments')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      lead_id: leadId,
      status: 'active',
      attempt_count: 0,
      current_node_id: waitNode.id,
      flow_version: publishedVersion,
      next_action_at: timeoutAt,
      last_event_at: nowIso,
      metadata: {
        source: 'runtime_worker_controlled_test',
        mode: 'controlled_manual_test',
        pinned_published_version: publishedVersion,
        current_node_key: waitNode.node_key,
        current_node_type: waitNode.node_type,
        actor_user_id: userId,
        runtime_flow_enabled: false,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (enrollmentError || !enrollment?.id) go('error', enrollmentError?.message || 'Unable to create controlled worker enrollment.');

  const { data: replyWait, error: replyWaitError } = await admin
    .from('automation_wait_states')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollment.id,
      lead_id: leadId,
      wait_type: 'reply',
      status: 'waiting',
      timeout_at: timeoutAt,
      waiting_since: nowIso,
      metadata: {
        source: 'runtime_worker_controlled_test',
        flow_version: publishedVersion,
        node_id: waitNode.id,
        node_key: waitNode.node_key,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (replyWaitError || !replyWait?.id) {
    await admin.from('automation_enrollments').delete().eq('organization_id', organizationId).eq('id', enrollment.id);
    go('error', replyWaitError?.message || 'Unable to create controlled reply wait.');
  }

  const dedupeKey = `runtime-worker-test:reply-timeout:${enrollment.id}:${replyWait.id}:v${publishedVersion}`;
  const { data: job, error: jobError } = await admin
    .from('automation_scheduled_jobs')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollment.id,
      wait_state_id: replyWait.id,
      lead_id: leadId,
      job_type: 'resume_reply_timeout',
      status: 'scheduled',
      scheduled_for: timeoutAt,
      max_attempts: 3,
      dedupe_key: dedupeKey,
      payload: {
        source: 'runtime_worker_controlled_test',
        flow_version: publishedVersion,
        node_id: waitNode.id,
        node_key: waitNode.node_key,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (jobError || !job?.id) {
    await Promise.all([
      admin.from('automation_wait_states').delete().eq('organization_id', organizationId).eq('id', replyWait.id),
      admin.from('automation_enrollments').delete().eq('organization_id', organizationId).eq('id', enrollment.id),
    ]);
    go('error', jobError?.message || 'Unable to create controlled scheduled job.');
  }

  revalidatePath('/automation/runtime-worker-test');
  go('notice', `Worker test prepared on Published v${publishedVersion}. One reply-timeout job is scheduled; nothing has executed and no customer message was sent.`);
}

export async function processRuntimeWorkerJobAction(formData: FormData) {
  const jobId = value(formData, 'job_id');
  if (!jobId) go('error', 'Scheduled job is required.');

  const { organizationId } = await adminContext();
  const admin = createAdminClient();

  const { data: job, error: jobError } = await admin
    .from('automation_scheduled_jobs')
    .select('id,payload,status')
    .eq('organization_id', organizationId)
    .eq('id', jobId)
    .maybeSingle();

  if (jobError || !job) go('error', jobError?.message || 'Scheduled job was not found.');
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  if (payload.source !== 'runtime_worker_controlled_test' && payload.worker !== 'smart_trigger_runtime_v1') {
    go('error', 'Controlled worker page will not process unrelated scheduled jobs.');
  }
  if (job.status !== 'scheduled') go('notice', `This job is already ${job.status}; nothing was processed again.`);

  const results = await claimAndProcessAutomationJobs(admin, organizationId, {
    jobId,
    limit: 1,
    allowEarly: true,
  });

  const result = results[0];
  if (!result) go('notice', 'No scheduled job was claimable. Another worker may already have claimed it.');

  revalidatePath('/automation/runtime-worker-test');
  go('notice', `${result.message} Automatic runtime remains disabled and no customer message was sent.`);
}
