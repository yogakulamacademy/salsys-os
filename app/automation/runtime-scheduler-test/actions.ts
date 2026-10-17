'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { runControlledAutomationSchedulerSweep } from '@/lib/automation/runtime-scheduler';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/runtime-scheduler-test?${type}=${encodeURIComponent(message)}`);
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

  if (canManage !== true) go('error', 'Only organization admins can run controlled scheduler tests.');
  return { organizationId, userId: user.id };
}

export async function prepareRuntimeSchedulerTestAction(formData: FormData) {
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
  if (workflow.runtime_flow_enabled === true) go('error', 'Automatic runtime must remain disabled during controlled scheduler testing.');

  const publishedVersion = Number(workflow.current_published_version ?? 0);
  if (!publishedVersion) go('error', 'A published flow version is required.');

  const { data: delayNode, error: delayNodeError } = await admin
    .from('automation_flow_nodes')
    .select('id,node_key,node_type,label')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('version_number', publishedVersion)
    .eq('node_type', 'wait')
    .eq('enabled', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (delayNodeError || !delayNode) go('error', delayNodeError?.message || 'Published delay node was not found.');

  const { data: existingEnrollment, error: existingError } = await admin
    .from('automation_enrollments')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('workflow_id', workflowId)
    .eq('lead_id', leadId)
    .in('status', ['active', 'paused'])
    .maybeSingle();

  if (existingError) go('error', existingError.message);
  if (existingEnrollment?.id) go('error', 'This lead already has an active enrollment for this workflow.');

  const nowIso = new Date().toISOString();
  const dueIso = new Date(Date.now() - 60_000).toISOString();

  const { data: enrollment, error: enrollmentError } = await admin
    .from('automation_enrollments')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      lead_id: leadId,
      status: 'active',
      attempt_count: 0,
      current_node_id: delayNode.id,
      flow_version: publishedVersion,
      next_action_at: dueIso,
      last_event_at: nowIso,
      metadata: {
        source: 'runtime_scheduler_controlled_test',
        mode: 'controlled_scheduler_test',
        current_node_key: delayNode.node_key,
        current_node_type: delayNode.node_type,
        actor_user_id: userId,
        runtime_flow_enabled: false,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (enrollmentError || !enrollment?.id) go('error', enrollmentError?.message || 'Unable to create scheduler-test enrollment.');

  const { data: wait, error: waitError } = await admin
    .from('automation_wait_states')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollment.id,
      lead_id: leadId,
      wait_type: 'delay',
      status: 'waiting',
      resume_at: dueIso,
      waiting_since: nowIso,
      metadata: {
        source: 'runtime_scheduler_controlled_test',
        flow_version: publishedVersion,
        node_id: delayNode.id,
        node_key: delayNode.node_key,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (waitError || !wait?.id) {
    await admin.from('automation_enrollments').delete().eq('organization_id', organizationId).eq('id', enrollment.id);
    go('error', waitError?.message || 'Unable to create scheduler-test wait.');
  }

  const { data: job, error: jobError } = await admin
    .from('automation_scheduled_jobs')
    .insert({
      organization_id: organizationId,
      workflow_id: workflowId,
      enrollment_id: enrollment.id,
      wait_state_id: wait.id,
      lead_id: leadId,
      job_type: 'resume_wait',
      status: 'scheduled',
      scheduled_for: dueIso,
      attempt_count: 0,
      max_attempts: 3,
      dedupe_key: `runtime-scheduler-test:${enrollment.id}:${wait.id}:v${publishedVersion}`,
      payload: {
        source: 'runtime_scheduler_controlled_test',
        flow_version: publishedVersion,
        node_id: delayNode.id,
        node_key: delayNode.node_key,
        runtime_flow_enabled: false,
        customer_message_sent: false,
      },
    })
    .select('id')
    .single();

  if (jobError || !job?.id) {
    await Promise.all([
      admin.from('automation_wait_states').delete().eq('organization_id', organizationId).eq('id', wait.id),
      admin.from('automation_enrollments').delete().eq('organization_id', organizationId).eq('id', enrollment.id),
    ]);
    go('error', jobError?.message || 'Unable to create scheduler-test job.');
  }

  revalidatePath('/automation/runtime-scheduler-test');
  go('notice', 'Controlled due job prepared. It is already due, but nothing has executed yet and background runtime remains disabled.');
}

export async function runRuntimeSchedulerSweepAction() {
  const { organizationId } = await adminContext();
  const admin = createAdminClient();

  const result = await runControlledAutomationSchedulerSweep(admin, organizationId, { limit: 10 });

  revalidatePath('/automation/runtime-scheduler-test');
  go(
    'notice',
    `Controlled scheduler sweep finished: ${result.candidatesFound} due candidate(s), ${result.jobsClaimed} claimed, ${result.jobsCompleted} completed, ${result.jobsFailed} failed. Background runtime remains disabled and no customer message was sent.`,
  );
}
