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

export async function resumePublishedDelayAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const enrollmentId = value(formData, 'enrollment_id');
  const waitStateId = value(formData, 'wait_state_id');

  if (!workflowId || !enrollmentId || !waitStateId) {
    go('error', 'Workflow, enrollment and delay wait are required.');
  }

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const [{ data: workflow, error: workflowError }, { data: enrollment, error: enrollmentError }, { data: delayWait, error: waitError }] = await Promise.all([
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
      .select('id,enrollment_id,status,wait_type,resume_at')
      .eq('organization_id', organizationId)
      .eq('workflow_id', workflowId)
      .eq('id', waitStateId)
      .maybeSingle(),
  ]);

  if (workflowError || !workflow) go('error', workflowError?.message || 'Workflow was not found.');
  if (workflow.runtime_flow_enabled === true) go('error', 'Automatic graph runtime must remain disabled for this controlled delay test.');
  if (enrollmentError || !enrollment) go('error', enrollmentError?.message || 'Enrollment was not found.');
  if (waitError || !delayWait) go('error', waitError?.message || 'Delay wait was not found.');
  if (enrollment.status !== 'active') go('error', 'Enrollment must be active.');
  if (!enrollment.current_node_id) go('error', 'Enrollment has no current node.');
  if (delayWait.enrollment_id !== enrollment.id || delayWait.wait_type !== 'delay') go('error', 'Delay wait does not belong to this enrollment.');
  if (delayWait.status !== 'waiting') go('notice', `This delay wait is already ${delayWait.status}; nothing was executed again.`);

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

  const { data: currentNode, error: currentNodeError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key,node_type,label')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .eq('id', enrollment.current_node_id)
    .maybeSingle();

  if (currentNodeError || !currentNode) go('error', currentNodeError?.message || 'Current published delay node was not found.');
  if (currentNode.node_type !== 'wait') go('error', `Expected delay wait node, found ${currentNode.node_type}.`);

  const { data: edges, error: edgeError } = await admin
    .from('automation_flow_edges')
    .select('target_node_id,label,priority')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .eq('source_node_id', currentNode.id)
    .order('priority', { ascending: true })
    .limit(2);

  if (edgeError) go('error', edgeError.message);
  if ((edges ?? []).length !== 1) go('error', `Controlled delay resume requires exactly one outgoing edge; found ${(edges ?? []).length}.`);

  const edge = edges![0];
  const { data: targetNode, error: targetNodeError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key,node_type,label,config')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .eq('id', edge.target_node_id)
    .eq('enabled', true)
    .maybeSingle();

  if (targetNodeError || !targetNode) go('error', targetNodeError?.message || 'Published delay target node was not found.');

  const { data: job, error: jobError } = await admin
    .from('automation_scheduled_jobs')
    .select('id,status,attempt_count,max_attempts')
    .eq('organization_id', organizationId)
    .eq('wait_state_id', delayWait.id)
    .eq('job_type', 'resume_wait')
    .maybeSingle();

  if (jobError || !job) go('error', jobError?.message || 'Delay resume job was not found.');
  if (job.status !== 'scheduled') go('notice', `Delay job is already ${job.status}; nothing was executed again.`);
  if (Number(job.attempt_count ?? 0) >= Number(job.max_attempts ?? 3)) go('error', 'Delay job reached its maximum attempts.');

  const now = new Date().toISOString();

  const { data: claimedJob, error: claimError } = await admin
    .from('automation_scheduled_jobs')
    .update({
      status: 'claimed',
      claimed_at: now,
      attempt_count: Number(job.attempt_count ?? 0) + 1,
    })
    .eq('organization_id', organizationId)
    .eq('id', job.id)
    .eq('status', 'scheduled')
    .select('id')
    .maybeSingle();

  if (claimError) go('error', claimError.message);
  if (!claimedJob?.id) go('notice', 'Another execution already claimed or completed this delay. No duplicate branch ran.');

  const { data: resumedWait, error: resumeError } = await admin
    .from('automation_wait_states')
    .update({
      status: 'resumed',
      resumed_at: now,
      metadata: {
        source: 'published_flow_controlled_delay_resume',
        flow_version: enrollment.flow_version,
        resumed_by: 'controlled_delay_fast_forward',
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', delayWait.id)
    .eq('status', 'waiting')
    .select('id')
    .maybeSingle();

  if (resumeError || !resumedWait?.id) {
    await admin
      .from('automation_scheduled_jobs')
      .update({ status: 'cancelled', cancelled_at: now })
      .eq('organization_id', organizationId)
      .eq('id', job.id)
      .eq('status', 'claimed');
    go('notice', 'Delay wait was no longer waiting. The resume job was cancelled to prevent duplicate execution.');
  }

  const completed = targetNode.node_type === 'end';
  const mergedMetadata = {
    ...metadata,
    current_node_key: targetNode.node_key,
    current_node_type: targetNode.node_type,
    resumed_delay_node_key: currentNode.node_key,
    delay_edge_label: edge.label,
    wait_state_id: delayWait.id,
    scheduled_job_id: job.id,
    runtime_flow_enabled: false,
    customer_message_sent: false,
  };

  const { data: movedEnrollment, error: enrollmentUpdateError } = await admin
    .from('automation_enrollments')
    .update({
      status: completed ? 'completed' : 'active',
      current_node_id: targetNode.id,
      next_action_at: null,
      last_event_at: now,
      metadata: mergedMetadata,
    })
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('id', enrollment.id)
    .eq('current_node_id', currentNode.id)
    .select('id')
    .maybeSingle();

  if (enrollmentUpdateError || !movedEnrollment?.id) {
    go('error', enrollmentUpdateError?.message || 'Enrollment no longer points to the expected delay node.');
  }

  const { error: completeJobError } = await admin
    .from('automation_scheduled_jobs')
    .update({
      status: 'completed',
      completed_at: now,
      payload: {
        source: 'published_flow_controlled_delay_resume',
        flow_version: enrollment.flow_version,
        processed_by: 'controlled_delay_fast_forward',
        target_node_key: targetNode.node_key,
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('id', job.id)
    .eq('status', 'claimed');

  if (completeJobError) go('error', completeJobError.message);

  revalidatePath('/automation/published-runtime-test');
  go('notice', `Published v${enrollment.flow_version} delay resumed successfully and followed ${edge.label || 'the next connection'} to ${targetNode.label}. No customer message was sent.`);
}
