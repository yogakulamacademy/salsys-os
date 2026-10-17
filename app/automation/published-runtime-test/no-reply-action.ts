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
  redirect(`/automation/published-runtime-test?${type}=${encodeURIComponent(message)}`);
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
    go('error', 'Only organization admins can run controlled published-flow tests.');
  }

  return { organizationId, userId: user.id };
}

export async function simulatePublishedNoReplyTimeoutAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const enrollmentId = value(formData, 'enrollment_id');
  const waitStateId = value(formData, 'wait_state_id');

  if (!workflowId || !enrollmentId || !waitStateId) {
    go('error', 'Workflow, enrollment and reply wait are required.');
  }

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const [{ data: workflow, error: workflowError }, { data: enrollment, error: enrollmentError }, { data: replyWait, error: waitError }] = await Promise.all([
    admin
      .from('automation_workflows')
      .select('id,runtime_flow_enabled')
      .eq('organization_id', organizationId)
      .eq('id', workflowId)
      .maybeSingle(),
    admin
      .from('automation_enrollments')
      .select('id,lead_id,status,flow_version,current_node_id,metadata')
      .eq('organization_id', organizationId)
      .eq('workflow_id', workflowId)
      .eq('id', enrollmentId)
      .maybeSingle(),
    admin
      .from('automation_wait_states')
      .select('id,enrollment_id,lead_id,status,wait_type')
      .eq('organization_id', organizationId)
      .eq('workflow_id', workflowId)
      .eq('id', waitStateId)
      .maybeSingle(),
  ]);

  if (workflowError || !workflow) go('error', workflowError?.message || 'Workflow was not found.');
  if (workflow.runtime_flow_enabled === true) go('error', 'Automatic graph runtime must remain disabled for this controlled timeout test.');
  if (enrollmentError || !enrollment) go('error', enrollmentError?.message || 'Enrollment was not found.');
  if (waitError || !replyWait) go('error', waitError?.message || 'Reply wait was not found.');
  if (enrollment.status !== 'active') go('error', 'Enrollment must be active.');
  if (!enrollment.current_node_id) go('error', 'Enrollment has no current node.');
  if (replyWait.enrollment_id !== enrollment.id || replyWait.wait_type !== 'reply') go('error', 'Reply wait does not belong to this enrollment.');
  if (replyWait.status !== 'waiting') go('notice', `This reply wait is already ${replyWait.status}; nothing was executed again.`);

  const metadata = (enrollment.metadata ?? {}) as Record<string, unknown>;
  if (metadata.source !== 'published_flow_controlled_pin_test') {
    go('error', 'This action only supports the controlled published-flow enrollment.');
  }

  const { data: version, error: versionError } = await admin
    .from('automation_flow_versions')
    .select('status')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .maybeSingle();

  if (versionError || !version || version.status !== 'published') {
    go('error', versionError?.message || 'Pinned flow version is not published.');
  }

  const { data: waitNode, error: waitNodeError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key,node_type,label')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .eq('id', enrollment.current_node_id)
    .maybeSingle();

  if (waitNodeError || !waitNode) go('error', waitNodeError?.message || 'Current published wait node was not found.');
  if (waitNode.node_type !== 'wait_for_reply') go('error', `Expected wait_for_reply, found ${waitNode.node_type}.`);

  const { data: waitEdges, error: waitEdgesError } = await admin
    .from('automation_flow_edges')
    .select('target_node_id')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .eq('source_node_id', waitNode.id)
    .order('priority', { ascending: true })
    .limit(2);

  if (waitEdgesError) go('error', waitEdgesError.message);
  if ((waitEdges ?? []).length !== 1) go('error', `Reply wait must resolve to exactly one condition node; found ${(waitEdges ?? []).length}.`);

  const conditionNodeId = String(waitEdges![0].target_node_id);
  const { data: conditionNode, error: conditionNodeError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key,node_type,label')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .eq('id', conditionNodeId)
    .eq('enabled', true)
    .maybeSingle();

  if (conditionNodeError || !conditionNode) go('error', conditionNodeError?.message || 'Reply outcome condition was not found.');
  if (conditionNode.node_type !== 'condition') go('error', `Reply wait target must be a condition node, found ${conditionNode.node_type}.`);

  const { data: conditionEdges, error: conditionEdgesError } = await admin
    .from('automation_flow_edges')
    .select('id,target_node_id,label,condition,priority')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .eq('source_node_id', conditionNode.id)
    .order('priority', { ascending: true });

  if (conditionEdgesError) go('error', conditionEdgesError.message);

  const timeoutEdge = (conditionEdges ?? []).find((edge) => {
    const condition = (edge.condition ?? {}) as Record<string, unknown>;
    return condition.equals === 'reply_timeout';
  });

  if (!timeoutEdge) go('error', 'Published condition has no reply_timeout branch.');

  const { data: delayNode, error: delayNodeError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key,node_type,label,config')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .eq('id', timeoutEdge.target_node_id)
    .eq('enabled', true)
    .maybeSingle();

  if (delayNodeError || !delayNode) go('error', delayNodeError?.message || 'No-reply branch target node was not found.');
  if (delayNode.node_type !== 'wait') go('error', `Controlled no-reply V1 expects a delay wait, found ${delayNode.node_type}.`);

  const { data: timeoutJob, error: timeoutJobError } = await admin
    .from('automation_scheduled_jobs')
    .select('id,status,attempt_count,max_attempts')
    .eq('organization_id', organizationId)
    .eq('wait_state_id', replyWait.id)
    .eq('job_type', 'resume_reply_timeout')
    .maybeSingle();

  if (timeoutJobError || !timeoutJob) go('error', timeoutJobError?.message || 'Reply timeout job was not found.');
  if (timeoutJob.status !== 'scheduled') go('notice', `Reply timeout job is already ${timeoutJob.status}; nothing was executed again.`);
  if (Number(timeoutJob.attempt_count ?? 0) >= Number(timeoutJob.max_attempts ?? 3)) go('error', 'Reply timeout job reached its maximum attempts.');

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: claimedJob, error: claimError } = await admin
    .from('automation_scheduled_jobs')
    .update({
      status: 'claimed',
      claimed_at: nowIso,
      attempt_count: Number(timeoutJob.attempt_count ?? 0) + 1,
    })
    .eq('organization_id', organizationId)
    .eq('id', timeoutJob.id)
    .eq('status', 'scheduled')
    .select('id')
    .maybeSingle();

  if (claimError) go('error', claimError.message);
  if (!claimedJob?.id) go('notice', 'Another execution already claimed or cancelled this timeout. No duplicate branch ran.');

  const { data: expiredWait, error: expireError } = await admin
    .from('automation_wait_states')
    .update({
      status: 'expired',
      resumed_at: nowIso,
      metadata: {
        source: 'published_flow_controlled_no_reply_branch',
        flow_version: enrollment.flow_version,
        resumed_by: 'reply_timeout',
        reply_outcome: 'reply_timeout',
        simulated_due_now: true,
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', replyWait.id)
    .eq('status', 'waiting')
    .select('id')
    .maybeSingle();

  if (expireError || !expiredWait?.id) {
    await admin
      .from('automation_scheduled_jobs')
      .update({ status: 'cancelled', cancelled_at: nowIso })
      .eq('organization_id', organizationId)
      .eq('id', timeoutJob.id)
      .eq('status', 'claimed');
    go('notice', 'Reply wait was no longer waiting. The timeout branch was cancelled to prevent duplicate execution.');
  }

  const { error: variableError } = await admin
    .from('automation_variables')
    .upsert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollment.id,
      lead_id: enrollment.lead_id,
      variable_key: 'reply_outcome',
      value: 'reply_timeout',
      value_type: 'string',
      source_node_id: conditionNode.id,
    }, {
      onConflict: 'organization_id,enrollment_id,variable_key',
    });

  if (variableError) go('error', variableError.message);

  const delayConfig = (delayNode.config ?? {}) as Record<string, unknown>;
  const delayMinutes = Math.max(1, Math.min(Math.round(Number(delayConfig.delay_minutes ?? 10) || 10), 10080));
  const resumeAt = new Date(now.getTime() + delayMinutes * 60_000).toISOString();

  const { data: delayWait, error: delayWaitError } = await admin
    .from('automation_wait_states')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollment.id,
      lead_id: enrollment.lead_id,
      wait_type: 'delay',
      status: 'waiting',
      resume_at: resumeAt,
      timeout_at: null,
      waiting_since: nowIso,
      metadata: {
        source: 'published_flow_controlled_no_reply_branch',
        flow_version: enrollment.flow_version,
        node_id: delayNode.id,
        node_key: delayNode.node_key,
        delay_minutes: delayMinutes,
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (delayWaitError || !delayWait?.id) go('error', delayWaitError?.message || 'Unable to create the published delay wait.');

  const delayDedupeKey = `published-flow-delay:${enrollment.id}:${delayWait.id}:v${enrollment.flow_version}`;
  const { data: delayJob, error: delayJobError } = await admin
    .from('automation_scheduled_jobs')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollment.id,
      wait_state_id: delayWait.id,
      lead_id: enrollment.lead_id,
      job_type: 'resume_wait',
      status: 'scheduled',
      scheduled_for: resumeAt,
      max_attempts: 3,
      dedupe_key: delayDedupeKey,
      payload: {
        source: 'published_flow_controlled_no_reply_branch',
        flow_version: enrollment.flow_version,
        node_id: delayNode.id,
        node_key: delayNode.node_key,
        delay_minutes: delayMinutes,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (delayJobError || !delayJob?.id) {
    await admin.from('automation_wait_states').delete().eq('organization_id', organizationId).eq('id', delayWait.id);
    go('error', delayJobError?.message || 'Unable to schedule the published delay job.');
  }

  const mergedMetadata = {
    ...metadata,
    current_node_key: delayNode.node_key,
    current_node_type: delayNode.node_type,
    resolved_wait_node_key: waitNode.node_key,
    condition_node_key: conditionNode.node_key,
    branch_label: timeoutEdge.label,
    reply_outcome: 'reply_timeout',
    wait_state_id: delayWait.id,
    scheduled_job_id: delayJob.id,
    previous_reply_wait_id: replyWait.id,
    previous_reply_timeout_job_id: timeoutJob.id,
    runtime_flow_enabled: false,
    customer_message_sent: false,
  };

  const { error: enrollmentUpdateError } = await admin
    .from('automation_enrollments')
    .update({
      current_node_id: delayNode.id,
      next_action_at: resumeAt,
      last_event_at: nowIso,
      metadata: mergedMetadata,
    })
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('id', enrollment.id)
    .eq('current_node_id', waitNode.id);

  if (enrollmentUpdateError) go('error', enrollmentUpdateError.message);

  const { error: completeTimeoutJobError } = await admin
    .from('automation_scheduled_jobs')
    .update({
      status: 'completed',
      completed_at: nowIso,
      payload: {
        source: 'published_flow_controlled_no_reply_branch',
        flow_version: enrollment.flow_version,
        processed_by: 'controlled_reply_timeout',
        reply_outcome: 'reply_timeout',
        simulated_due_now: true,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', timeoutJob.id)
    .eq('status', 'claimed');

  if (completeTimeoutJobError) go('error', completeTimeoutJobError.message);

  revalidatePath('/automation/published-runtime-test');
  go('notice', `Published v${enrollment.flow_version} no-reply branch passed: reply wait expired, reply_outcome=reply_timeout, and the flow entered ${delayNode.label} for ${delayMinutes} minutes. No customer message was sent.`);
}
