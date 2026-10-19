'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function checkboxValue(formData: FormData, key: string) {
  return formData.get(key) === 'on';
}

function integerValue(formData: FormData, key: string, fallback: number) {
  const parsed = Number(textValue(formData, key));
  return Number.isInteger(parsed) ? parsed : fallback;
}

function settingsRedirect(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/settings?${type}=${encodeURIComponent(message)}`);
}

function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

async function currentAdminContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    settingsRedirect('error', 'Your session has expired. Sign in again.');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage, error: manageError } = await supabase.rpc(
    'can_manage_organization',
    { p_organization_id: organizationId },
  );

  if (manageError || canManage !== true) {
    settingsRedirect('error', 'Only organization admins can change Smart Trigger safety settings.');
  }

  return { supabase, admin: createAdminClient(), user, organizationId };
}

export async function updateWhatsAppMessagingPolicyAction(formData: FormData) {
  if (useMockData) {
    settingsRedirect('error', 'Mock mode is active. Messaging policy was not changed.');
  }

  const policyEnabled = checkboxValue(formData, 'policy_enabled');
  const max24h = integerValue(formData, 'max_messages_24h', 3);
  const max7d = integerValue(formData, 'max_messages_7d', 8);
  const minGap = integerValue(formData, 'min_gap_minutes', 30);

  if (max24h < 1 || max24h > 1000) {
    settingsRedirect('error', '24-hour message cap must be between 1 and 1000.');
  }
  if (max7d < 1 || max7d > 5000) {
    settingsRedirect('error', '7-day message cap must be between 1 and 5000.');
  }
  if (minGap < 0 || minGap > 10080) {
    settingsRedirect('error', 'Minimum message gap must be between 0 and 10080 minutes.');
  }

  const { admin, user, organizationId } = await currentAdminContext();

  const { data: existing, error: existingError } = await admin
    .from('automation_messaging_policies')
    .select('id,metadata')
    .eq('organization_id', organizationId)
    .eq('channel', 'whatsapp')
    .maybeSingle();

  if (existingError) {
    settingsRedirect('error', existingError.message);
  }

  const metadata = {
    ...((existing?.metadata && typeof existing.metadata === 'object') ? existing.metadata : {}),
    managed_from: 'automation_settings_ui',
    last_updated_by: user.id,
    last_updated_at: new Date().toISOString(),
  };

  const payload = {
    organization_id: organizationId,
    channel: 'whatsapp',
    policy_enabled: policyEnabled,
    autonomous_send_enabled: false,
    requires_human_approval: true,
    max_messages_24h: max24h,
    max_messages_7d: max7d,
    min_gap_minutes: minGap,
    metadata,
  };

  const { error } = existing?.id
    ? await admin
        .from('automation_messaging_policies')
        .update(payload)
        .eq('organization_id', organizationId)
        .eq('id', existing.id)
    : await admin.from('automation_messaging_policies').insert(payload);

  if (error) {
    settingsRedirect('error', error.message);
  }

  revalidatePath('/automation');
  revalidatePath('/automation/settings');
  settingsRedirect(
    'notice',
    policyEnabled
      ? 'WhatsApp policy enabled. Autonomous sending remains OFF and provider execution is still controlled by the provider kill switch.'
      : 'WhatsApp policy disabled. Customer automation sends remain blocked.',
  );
}

export async function updateWorkflowRuntimeAction(formData: FormData) {
  if (useMockData) {
    settingsRedirect('error', 'Mock mode is active. Workflow runtime was not changed.');
  }

  const workflowId = textValue(formData, 'workflow_id');
  const requestedStatus = textValue(formData, 'status');
  const runtimeFlowEnabled = checkboxValue(formData, 'runtime_flow_enabled');

  if (!workflowId) {
    settingsRedirect('error', 'Workflow is required.');
  }
  if (!['active', 'paused'].includes(requestedStatus)) {
    settingsRedirect('error', 'Workflow runtime status must be Active or Paused.');
  }

  const { supabase, organizationId } = await currentAdminContext();
  const { data: workflow, error: workflowError } = await supabase
    .from('automation_workflows')
    .select('id,status,current_published_version')
    .eq('organization_id', organizationId)
    .eq('id', workflowId)
    .maybeSingle();

  if (workflowError || !workflow) {
    settingsRedirect('error', workflowError?.message || 'Workflow was not found.');
  }
  if (workflow.status === 'archived') {
    settingsRedirect('error', 'Archived workflows cannot be activated from runtime settings.');
  }
  if ((requestedStatus === 'active' || runtimeFlowEnabled) && !workflow.current_published_version) {
    settingsRedirect('error', 'Publish a validated flow version before activating runtime execution.');
  }

  const { error } = await supabase
    .from('automation_workflows')
    .update({
      status: requestedStatus,
      runtime_flow_enabled: runtimeFlowEnabled,
    })
    .eq('organization_id', organizationId)
    .eq('id', workflowId);

  if (error) {
    settingsRedirect('error', error.message);
  }

  revalidatePath('/automation');
  revalidatePath('/automation/settings');
  settingsRedirect(
    'notice',
    runtimeFlowEnabled
      ? 'Workflow runtime enabled. WhatsApp sends are still subject to policy, approval, suppression, quiet-hours and provider gates.'
      : 'Workflow runtime disabled.',
  );
}

export async function updateWorkflowSafetyAction(formData: FormData) {
  if (useMockData) {
    settingsRedirect('error', 'Mock mode is active. Workflow safety settings were not changed.');
  }

  const workflowId = textValue(formData, 'workflow_id');
  const stopOnReply = checkboxValue(formData, 'stop_on_reply');
  const quietHoursEnabled = checkboxValue(formData, 'quiet_hours_enabled');
  const quietHoursStart = textValue(formData, 'quiet_hours_start');
  const quietHoursEnd = textValue(formData, 'quiet_hours_end');
  const timezone = textValue(formData, 'timezone') || 'Asia/Kolkata';

  if (!workflowId) {
    settingsRedirect('error', 'Workflow is required.');
  }
  if (!validTimezone(timezone)) {
    settingsRedirect('error', 'Enter a valid IANA timezone, for example Asia/Kolkata.');
  }
  if (quietHoursEnabled && (!validTime(quietHoursStart) || !validTime(quietHoursEnd))) {
    settingsRedirect('error', 'Quiet-hour start and end must both use HH:MM format.');
  }

  const { supabase, organizationId } = await currentAdminContext();
  const { error } = await supabase
    .from('automation_workflows')
    .update({
      stop_on_reply: stopOnReply,
      quiet_hours_enabled: quietHoursEnabled,
      quiet_hours_start: quietHoursEnabled ? quietHoursStart : null,
      quiet_hours_end: quietHoursEnabled ? quietHoursEnd : null,
      timezone,
    })
    .eq('organization_id', organizationId)
    .eq('id', workflowId)
    .neq('status', 'archived');

  if (error) {
    settingsRedirect('error', error.message);
  }

  revalidatePath('/automation');
  revalidatePath('/automation/settings');
  settingsRedirect('notice', 'Workflow safety settings updated.');
}
