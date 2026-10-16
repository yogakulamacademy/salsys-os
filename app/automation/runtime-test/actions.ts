'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function go(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/runtime-test?${type}=${encodeURIComponent(message)}`);
}

async function adminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) go('error', 'Your session has expired. Sign in again.');
  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage } = await supabase.rpc('can_manage_organization', { p_organization_id: organizationId });
  if (canManage !== true) go('error', 'Only organization admins can run controlled automation tests.');
  return { organizationId, userId: user.id };
}

export async function activateWorkflowForControlledTestAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  if (!workflowId) go('error', 'Workflow is required.');
  const { organizationId } = await adminContext();
  const admin = createAdminClient();
  const { error } = await admin.from('automation_workflows').update({ status: 'active' })
    .eq('organization_id', organizationId).eq('id', workflowId).eq('status', 'draft');
  if (error) go('error', error.message);
  revalidatePath('/automation');
  revalidatePath('/automation/runtime-test');
  go('notice', 'Workflow activated for controlled testing. Automatic event runtime is still disabled.');
}

export async function runControlledFollowupTestAction(formData: FormData) {
  const workflowId = value(formData, 'workflow_id');
  const leadId = value(formData, 'lead_id');
  if (!workflowId || !leadId) go('error', 'Workflow and lead are required.');

  const { organizationId, userId } = await adminContext();
  const admin = createAdminClient();

  const { data: workflow } = await admin.from('automation_workflows')
    .select('id,status').eq('organization_id', organizationId).eq('id', workflowId).maybeSingle();
  if (!workflow || workflow.status !== 'active') go('error', 'Activate the workflow before running the controlled test.');

  const [{ data: trigger }, { data: action }, { data: lead }] = await Promise.all([
    admin.from('automation_triggers').select('id,event_name').eq('organization_id', organizationId).eq('workflow_id', workflowId).eq('enabled', true).order('position').limit(1).maybeSingle(),
    admin.from('automation_actions').select('id,action_type,config').eq('organization_id', organizationId).eq('workflow_id', workflowId).eq('enabled', true).order('position').limit(1).maybeSingle(),
    admin.from('leads').select('id').eq('organization_id', organizationId).eq('id', leadId).maybeSingle(),
  ]);

  if (!lead) go('error', 'Lead was not found in this organization.');
  if (!trigger || trigger.event_name !== 'lead.created') go('error', 'Controlled V1 test currently supports only lead.created.');
  if (!action || action.action_type !== 'create_followup') go('error', 'Controlled V1 test currently supports only create_followup.');

  const dedupeKey = `manual:${workflowId}:${leadId}:lead.created:v1`;
  const { data: existingRun } = await admin.from('automation_runs').select('id').eq('organization_id', organizationId).eq('workflow_id', workflowId).eq('dedupe_key', dedupeKey).maybeSingle();
  if (existingRun?.id) go('notice', 'Deduplication passed: this exact workflow/lead test already ran, so no second task was created.');

  const now = new Date();
  const sourceSystem = 'manual_smart_trigger_test';
  const sourceEventId = `lead.created:${workflowId}:${leadId}:v1`;

  let eventId: string | null = null;

  const { data: existingEvent, error: existingEventError } = await admin
    .from('automation_events')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('source_system', sourceSystem)
    .eq('source_event_id', sourceEventId)
    .maybeSingle();

  if (existingEventError) go('error', existingEventError.message);

  if (existingEvent?.id) {
    eventId = existingEvent.id;
  } else {
    const { data: insertedEvent, error: eventError } = await admin.from('automation_events').insert({
      organization_id: organizationId,
      event_name: 'lead.created',
      source_system: sourceSystem,
      source_event_id: sourceEventId,
      lead_id: leadId,
      occurred_at: now.toISOString(),
      payload: { mode: 'controlled_manual_test', actor_user_id: userId },
    }).select('id').single();

    if (eventError || !insertedEvent?.id) {
      // A concurrent retry may have inserted the same dedupe event first.
      const { data: racedEvent, error: racedEventError } = await admin
        .from('automation_events')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('source_system', sourceSystem)
        .eq('source_event_id', sourceEventId)
        .maybeSingle();

      if (racedEventError || !racedEvent?.id) {
        go('error', eventError?.message || racedEventError?.message || 'Unable to record the test event.');
      }

      eventId = racedEvent.id;
    } else {
      eventId = insertedEvent.id;
    }
  }

  if (!eventId) go('error', 'Unable to resolve the automation test event.');

  const { data: run, error: runError } = await admin.from('automation_runs').insert({
    organization_id: organizationId,
    workflow_id: workflowId,
    event_id: eventId,
    lead_id: leadId,
    dedupe_key: dedupeKey,
    status: 'running',
    decision: { mode: 'controlled_manual_test', trigger: 'lead.created', matched: true, event_reused: Boolean(existingEvent?.id) },
    reason: 'Controlled deterministic Smart Trigger V1 test.',
    started_at: now.toISOString(),
  }).select('id').single();
  if (runError || !run?.id) go('error', runError?.message || 'Unable to create automation run.');

  const { data: actionRun, error: actionRunError } = await admin.from('automation_action_runs').insert({
    organization_id: organizationId,
    run_id: run.id,
    action_id: action.id,
    status: 'running',
    requires_approval: false,
  }).select('id').single();
  if (actionRunError || !actionRun?.id) go('error', actionRunError?.message || 'Unable to create action run.');

  const config = (action.config ?? {}) as Record<string, unknown>;
  const title = typeof config.title === 'string' && config.title.trim() ? config.title.trim() : 'Follow up with new lead';
  const delay = Math.max(0, Math.min(Number(config.delay_minutes ?? 0) || 0, 10080));
  const dueAt = new Date(now.getTime() + delay * 60000).toISOString();

  const { data: task, error: taskError } = await admin.from('tasks').insert({
    organization_id: organizationId,
    lead_id: leadId,
    task_type: 'follow_up',
    title,
    status: 'open',
    due_at: dueAt,
    created_by_type: 'automation',
    created_by_id: `smart_trigger:${workflowId}`,
    metadata: { source: 'smart_trigger_v1', mode: 'controlled_manual_test', workflow_id: workflowId, automation_run_id: run.id, event_id: eventId },
  }).select('id').single();

  if (taskError || !task?.id) {
    const ended = new Date().toISOString();
    await Promise.all([
      admin.from('automation_action_runs').update({ status: 'failed', executed_at: ended, error_message: taskError?.message || 'Task creation failed.' }).eq('organization_id', organizationId).eq('id', actionRun.id),
      admin.from('automation_runs').update({ status: 'failed', completed_at: ended, error_message: taskError?.message || 'Task creation failed.' }).eq('organization_id', organizationId).eq('id', run.id),
    ]);
    go('error', taskError?.message || 'Unable to create follow-up task.');
  }

  const ended = new Date().toISOString();
  await Promise.all([
    admin.from('automation_action_runs').update({ status: 'completed', executed_at: ended, result: { task_id: task.id, customer_message_sent: false } }).eq('organization_id', organizationId).eq('id', actionRun.id),
    admin.from('automation_runs').update({ status: 'completed', completed_at: ended, decision: { mode: 'controlled_manual_test', trigger: 'lead.created', matched: true, action: 'create_followup', task_id: task.id, customer_message_sent: false, event_reused: Boolean(existingEvent?.id) } }).eq('organization_id', organizationId).eq('id', run.id),
  ]);

  revalidatePath('/automation');
  revalidatePath('/follow-ups');
  revalidatePath('/automation/runtime-test');
  go('notice', 'Controlled test passed: one internal follow-up task was created. No customer message was sent.');
}
