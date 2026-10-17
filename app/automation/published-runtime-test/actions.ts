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

  if (workflowError || !workflow) {
    go('error', workflowError?.message || 'Workflow was not found in this organization.');
  }
  if (leadError || !lead) {
    go('error', leadError?.message || 'Lead was not found in this organization.');
  }
  if (workflow.status !== 'active') {
    go('error', 'The workflow must be active for this controlled test.');
  }
  if (workflow.runtime_flow_enabled === true) {
    go('error', 'Controlled pinning requires automatic graph runtime to remain disabled.');
  }

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

  if (versionError || !version || version.status !== 'published') {
    go('error', versionError?.message || 'Current published version is not available as a published snapshot.');
  }
  if (triggerError || !trigger) {
    go('error', triggerError?.message || 'Published flow does not have an enabled trigger node.');
  }

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

  if (enrollmentError || !enrollment?.id) {
    go('error', enrollmentError?.message || 'Unable to create the controlled published-flow enrollment.');
  }

  revalidatePath('/automation/published-runtime-test');
  go('notice', `Published Version ${publishedVersion} pinned successfully. The enrollment is parked on the published trigger node; nothing executed and no customer message was sent.`);
}
