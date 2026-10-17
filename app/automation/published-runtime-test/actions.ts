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

export async function pinLeadToPublishedFlowAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const leadId = value(formData, 'lead_id');

  if (!workflowId || !leadId) go('error', 'Workflow and lead are required.');

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const [{ data: workflow, error: workflowError }, { data: lead, error: leadError }] = await Promise.all([
    admin
      .from('automation_workflows')
      .select('id,name,status,current_draft_version,current_published_version,runtime_flow_enabled')
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

  if (workflowError || !workflow) go('error', workflowError?.message || 'Workflow was not found in this organization.');
  if (leadError || !lead) go('error', leadError?.message || 'Lead was not found in this organization.');
  if (workflow.status !== 'active') go('error', 'The workflow must be active for this controlled test.');
  if (workflow.runtime_flow_enabled === true) go('error', 'Controlled pinning requires automatic graph runtime to remain disabled.');

  const publishedVersion = Number(workflow.current_published_version ?? 0);
  if (!publishedVersion) go('error', 'A published flow version is required.');

  const [{ data: version, error: versionError }, { data: trigger, error: triggerError }] = await Promise.all([
    admin
      .from('automation_flow_versions')
      .select('id,status,version_number')
      .eq('organization_id', organizationId)
      .eq('workflow_id', workflowId)
      .eq('version_number', publishedVersion)
      .maybeSingle(),
    admin
      .from('automation_flow_nodes')
      .select('id,node_key,node_type,label')
      .eq('organization_id', organizationId)
      .eq('workflow_id', workflowId)
      .eq('version_number', publishedVersion)
      .eq('node_type', 'trigger')
      .eq('enabled', true)
      .limit(1)
      .maybeSingle(),
  ]);

  if (versionError || !version || version.status !== 'published') go('error', versionError?.message || 'Current published version is not available as a published snapshot.');
  if (triggerError || !trigger) go('error', triggerError?.message || 'Published flow does not have an enabled trigger node.');

  const { data: existingEnrollment, error: existingError } = await admin
    .from('automation_enrollments')
    .select('id,status,flow_version,current_node_id,metadata')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('lead_id', leadId)
    .in('status', ['active', 'paused'])
    .maybeSingle();

  if (existingError) go('error', existingError.message);
  if (existingEnrollment?.id) {
    const source = String((existingEnrollment.metadata as Record<string, unknown> | null)?.source ?? 'another automation');
    go('error', `This lead already has an active enrollment for this workflow (${source}). Complete or stop it before this test.`);
  }

  const now = new Date().toISOString();
  const { data: enrollment, error: enrollmentError } = await admin
    .from('automation_enrollments')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      lead_id: leadId,
      status: 'active',
      attempt_count: 0,
      next_action_at: null,
      last_event_at: now,
      current_node_id: trigger.id,
      flow_version: publishedVersion,
      metadata: {
        source: 'published_flow_controlled_pin_test',
        mode: 'controlled_manual_test',
        pinned_published_version: publishedVersion,
        draft_version_at_start: workflow.current_draft_version,
        current_node_key: trigger.node_key,
        current_node_type: trigger.node_type,
        actor_user_id: userId,
        runtime_flow_enabled: false,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (enrollmentError || !enrollment?.id) go('error', enrollmentError?.message || 'Unable to create the controlled published-flow enrollment.');

  revalidatePath('/automation/published-runtime-test');
  go('notice', `Published Version ${publishedVersion} pinned successfully. The enrollment is parked on the published trigger node; nothing executed and no customer message was sent.`);
}

export async function advancePinnedEnrollmentOneStepAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const enrollmentId = value(formData, 'enrollment_id');

  if (!workflowId || !enrollmentId) go('error', 'Workflow and enrollment are required.');

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const { data: workflow, error: workflowError } = await admin
    .from('automation_workflows')
    .select('id,runtime_flow_enabled')
    .eq('organization_id', organizationId)
    .eq('id', workflowId)
    .maybeSingle();

  if (workflowError || !workflow) go('error', workflowError?.message || 'Workflow was not found.');
  if (workflow.runtime_flow_enabled === true) go('error', 'Automatic graph runtime must remain disabled for this controlled step test.');

  const { data: enrollment, error: enrollmentError } = await admin
    .from('automation_enrollments')
    .select('id,lead_id,status,flow_version,current_node_id,metadata')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('id', enrollmentId)
    .maybeSingle();

  if (enrollmentError || !enrollment) go('error', enrollmentError?.message || 'Enrollment was not found.');
  if (enrollment.status !== 'active') go('error', 'Enrollment must be active.');
  if (!enrollment.current_node_id) go('error', 'Enrollment has no current node.');

  const metadata = (enrollment.metadata ?? {}) as Record<string, unknown>;
  if (metadata.source !== 'published_flow_controlled_pin_test') go('error', 'This action only supports the controlled published-flow pin test.');

  const { data: version, error: versionError } = await admin
    .from('automation_flow_versions')
    .select('status')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .maybeSingle();

  if (versionError || !version || version.status !== 'published') go('error', versionError?.message || 'Pinned flow version is not an immutable published version.');

  const { data: currentNode, error: nodeError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key,node_type,label')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .eq('id', enrollment.current_node_id)
    .maybeSingle();

  if (nodeError || !currentNode) go('error', nodeError?.message || 'Current published node was not found.');
  if (currentNode.node_type !== 'trigger') go('notice', `Enrollment is already on ${currentNode.label}; this controlled action advances only the published trigger step.`);

  const { data: edges, error: edgeError } = await admin
    .from('automation_flow_edges')
    .select('id,target_node_id,label,priority')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .eq('source_node_id', currentNode.id)
    .order('priority', { ascending: true })
    .limit(2);

  if (edgeError) go('error', edgeError.message);
  if ((edges ?? []).length !== 1) go('error', `Controlled trigger advancement requires exactly one outgoing edge; found ${(edges ?? []).length}.`);

  const edge = edges![0];
  const { data: targetNode, error: targetError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key,node_type,label,config')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .eq('id', edge.target_node_id)
    .eq('enabled', true)
    .maybeSingle();

  if (targetError || !targetNode) go('error', targetError?.message || 'Published target node was not found.');
  if (targetNode.node_type !== 'wait_for_reply') go('error', `Controlled V1 step currently expects wait_for_reply after the trigger, but found ${targetNode.node_type}.`);

  const { data: existingWait, error: existingWaitError } = await admin
    .from('automation_wait_states')
    .select('id,status')
    .eq('organization_id', organizationId)
    .eq('enrollment_id', enrollment.id)
    .eq('wait_type', 'reply')
    .eq('status', 'waiting')
    .maybeSingle();

  if (existingWaitError) go('error', existingWaitError.message);
  if (existingWait?.id) go('notice', 'Deduplication passed: this enrollment is already waiting for a reply. No second wait or timeout job was created.');

  const config = (targetNode.config ?? {}) as Record<string, unknown>;
  const timeoutMinutes = Math.max(1, Math.min(Math.round(Number(config.timeout_minutes ?? 60) || 60), 10080));
  const stopOnReply = config.stop_on_reply !== false;
  const now = new Date();
  const timeoutAt = new Date(now.getTime() + timeoutMinutes * 60_000).toISOString();

  const { data: waitState, error: waitError } = await admin
    .from('automation_wait_states')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollment.id,
      lead_id: enrollment.lead_id,
      wait_type: 'reply',
      status: 'waiting',
      timeout_at: timeoutAt,
      waiting_since: now.toISOString(),
      metadata: {
        source: 'published_flow_controlled_step_test',
        flow_version: enrollment.flow_version,
        node_id: targetNode.id,
        node_key: targetNode.node_key,
        stop_on_reply: stopOnReply,
        actor_user_id: userId,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (waitError || !waitState?.id) go('error', waitError?.message || 'Unable to create the published reply wait.');

  const dedupeKey = `published-flow-reply-timeout:${enrollment.id}:${waitState.id}:v${enrollment.flow_version}`;
  const { data: job, error: jobError } = await admin
    .from('automation_scheduled_jobs')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollment.id,
      wait_state_id: waitState.id,
      lead_id: enrollment.lead_id,
      job_type: 'resume_reply_timeout',
      status: 'scheduled',
      scheduled_for: timeoutAt,
      max_attempts: 3,
      dedupe_key: dedupeKey,
      payload: {
        source: 'published_flow_controlled_step_test',
        flow_version: enrollment.flow_version,
        node_id: targetNode.id,
        node_key: targetNode.node_key,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (jobError || !job?.id) {
    await admin.from('automation_wait_states').delete().eq('organization_id', organizationId).eq('id', waitState.id);
    go('error', jobError?.message || 'Unable to schedule the controlled reply timeout.');
  }

  const mergedMetadata = {
    ...metadata,
    current_node_key: targetNode.node_key,
    current_node_type: targetNode.node_type,
    advanced_from_node_key: currentNode.node_key,
    edge_label: edge.label,
    wait_state_id: waitState.id,
    scheduled_job_id: job.id,
    stop_on_reply: stopOnReply,
    runtime_flow_enabled: false,
    customer_message_sent: false,
  };

  const { error: advanceError } = await admin
    .from('automation_enrollments')
    .update({
      current_node_id: targetNode.id,
      next_action_at: timeoutAt,
      last_event_at: now.toISOString(),
      metadata: mergedMetadata,
    })
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('id', enrollment.id)
    .eq('current_node_id', currentNode.id);

  if (advanceError) {
    await Promise.all([
      admin.from('automation_scheduled_jobs').delete().eq('organization_id', organizationId).eq('id', job.id),
      admin.from('automation_wait_states').delete().eq('organization_id', organizationId).eq('id', waitState.id),
    ]);
    go('error', advanceError.message);
  }

  revalidatePath('/automation/published-runtime-test');
  go('notice', `Published v${enrollment.flow_version} advanced one controlled step to ${targetNode.label}. One internal reply wait and timeout job were created; no customer message was sent.`);
}
