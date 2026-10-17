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

export async function simulatePublishedInboundReplyAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const enrollmentId = value(formData, 'enrollment_id');
  const waitStateId = value(formData, 'wait_state_id');

  if (!workflowId || !enrollmentId || !waitStateId) {
    go('error', 'Workflow, enrollment and reply wait are required.');
  }

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const [{ data: workflow, error: workflowError }, { data: enrollment, error: enrollmentError }, { data: waitState, error: waitError }] = await Promise.all([
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
  if (workflow.runtime_flow_enabled === true) go('error', 'Automatic graph runtime must remain disabled for this controlled reply test.');
  if (enrollmentError || !enrollment) go('error', enrollmentError?.message || 'Enrollment was not found.');
  if (waitError || !waitState) go('error', waitError?.message || 'Reply wait was not found.');
  if (enrollment.status !== 'active') go('error', 'Enrollment must be active.');
  if (!enrollment.current_node_id) go('error', 'Enrollment has no current node.');
  if (waitState.enrollment_id !== enrollment.id || waitState.wait_type !== 'reply') go('error', 'Reply wait does not belong to this enrollment.');
  if (waitState.status !== 'waiting') go('notice', `This reply wait is already ${waitState.status}; nothing was executed again.`);

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
    .select('id,node_key,node_type,label,config')
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

  const replyEdge = (conditionEdges ?? []).find((edge) => {
    const condition = (edge.condition ?? {}) as Record<string, unknown>;
    return condition.equals === 'reply_received';
  });

  if (!replyEdge) go('error', 'Published condition has no reply_received branch.');

  const { data: targetNode, error: targetNodeError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key,node_type,label,config')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', enrollment.flow_version)
    .eq('id', replyEdge.target_node_id)
    .eq('enabled', true)
    .maybeSingle();

  if (targetNodeError || !targetNode) go('error', targetNodeError?.message || 'Reply branch target node was not found.');

  const sourceSystem = 'manual_published_flow_reply_test';
  const sourceEventId = `message.received:${enrollment.id}:${waitState.id}:v${enrollment.flow_version}`;

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
        lead_id: enrollment.lead_id,
        occurred_at: new Date().toISOString(),
        payload: {
          mode: 'controlled_published_flow_reply',
          enrollment_id: enrollment.id,
          wait_state_id: waitState.id,
          flow_version: enrollment.flow_version,
          synthetic_inbound_event: true,
          actor_user_id: userId,
          customer_message_sent: false,
        },
      })
      .select('id')
      .single();

    if (eventError || !event?.id) go('error', eventError?.message || 'Unable to record the controlled inbound reply event.');
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
        source: 'published_flow_controlled_reply_branch',
        flow_version: enrollment.flow_version,
        resumed_by: 'message.received',
        reply_outcome: 'reply_received',
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
        source: 'published_flow_controlled_reply_branch',
        flow_version: enrollment.flow_version,
        cancelled_by: 'message.received',
        customer_message_sent: false,
      },
    })
    .eq('organization_id', organizationId)
    .eq('wait_state_id', waitState.id)
    .eq('status', 'scheduled');

  if (cancelJobError) go('error', cancelJobError.message);

  const { error: variableError } = await admin
    .from('automation_variables')
    .upsert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollment.id,
      lead_id: enrollment.lead_id,
      variable_key: 'reply_outcome',
      value: 'reply_received',
      value_type: 'string',
      source_node_id: conditionNode.id,
    }, {
      onConflict: 'organization_id,enrollment_id,variable_key',
    });

  if (variableError) go('error', variableError.message);

  const completed = targetNode.node_type === 'end';
  const mergedMetadata = {
    ...metadata,
    current_node_key: targetNode.node_key,
    current_node_type: targetNode.node_type,
    resolved_wait_node_key: waitNode.node_key,
    condition_node_key: conditionNode.node_key,
    branch_label: replyEdge.label,
    reply_outcome: 'reply_received',
    resume_event_id: eventId,
    wait_state_id: waitState.id,
    runtime_flow_enabled: false,
    customer_message_sent: false,
  };

  const { error: enrollmentUpdateError } = await admin
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
    .eq('current_node_id', waitNode.id);

  if (enrollmentUpdateError) go('error', enrollmentUpdateError.message);

  revalidatePath('/automation/published-runtime-test');
  go('notice', `Published v${enrollment.flow_version} reply branch passed: wait resumed, timeout cancelled, reply_outcome=reply_received, and the flow reached ${targetNode.label}. No customer message was sent.`);
}
