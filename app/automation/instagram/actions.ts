'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

const TRIGGERS = new Set([
  'dm_keyword',
  'comment_keyword',
  'story_reply',
  'story_mention',
  'postback',
  'referral',
]);
const MATCH_MODES = new Set(['contains_any', 'exact_any', 'any']);

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function boolValue(formData: FormData, key: string) {
  const value = textValue(formData, key).toLowerCase();
  return value === 'true' || value === '1' || value === 'on' || value === 'yes';
}

function integerValue(formData: FormData, key: string, fallback: number) {
  const parsed = Number.parseInt(textValue(formData, key), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csvValues(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 100);
}

function instagramRedirect(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/instagram?${type}=${encodeURIComponent(message)}`);
}

async function currentAdminContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    instagramRedirect('error', 'Your session has expired. Sign in again.');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage, error: manageError } = await supabase.rpc(
    'can_manage_organization',
    { p_organization_id: organizationId },
  );

  if (manageError || canManage !== true) {
    instagramRedirect('error', 'Only organization admins can manage Instagram operations.');
  }

  return { supabase, admin: createAdminClient(), user, organizationId };
}

function revalidateInstagram() {
  revalidatePath('/automation/instagram');
  revalidatePath('/conversations');
}

export async function updateInstagramPolicyAction(formData: FormData) {
  if (useMockData) instagramRedirect('error', 'Mock mode is active. No policy was changed.');

  const pilotMaxMessages = Math.max(1, Math.min(integerValue(formData, 'pilot_max_messages', 1), 20));
  const maxAutomated = Math.max(
    1,
    Math.min(integerValue(formData, 'max_automated_messages_per_user_24h', 3), 20),
  );
  const { supabase, organizationId } = await currentAdminContext();

  const { error } = await supabase.from('instagram_channel_policies').upsert(
    {
      organization_id: organizationId,
      automation_enabled: boolValue(formData, 'automation_enabled'),
      dm_automation_enabled: boolValue(formData, 'dm_automation_enabled'),
      comment_private_reply_enabled: boolValue(formData, 'comment_private_reply_enabled'),
      provider_send_enabled: boolValue(formData, 'provider_send_enabled'),
      requires_human_approval: boolValue(formData, 'requires_human_approval'),
      pilot_mode_enabled: boolValue(formData, 'pilot_mode_enabled'),
      pilot_max_messages: pilotMaxMessages,
      max_automated_messages_per_user_24h: maxAutomated,
    },
    { onConflict: 'organization_id' },
  );

  if (error) instagramRedirect('error', error.message);
  revalidateInstagram();
  instagramRedirect(
    'notice',
    'Instagram policy saved. Every automated provider send is still rechecked at execution time.',
  );
}

export async function resetInstagramPilotAction() {
  if (useMockData) instagramRedirect('error', 'Mock mode is active.');
  const { supabase, organizationId } = await currentAdminContext();
  const { error } = await supabase
    .from('instagram_channel_policies')
    .update({ pilot_sent_count: 0, provider_send_enabled: false })
    .eq('organization_id', organizationId);

  if (error) instagramRedirect('error', error.message);
  revalidateInstagram();
  instagramRedirect('notice', 'Instagram pilot counter reset. Provider sending was left OFF.');
}

export async function createInstagramQuickReplyAction(formData: FormData) {
  if (useMockData) instagramRedirect('error', 'Mock mode is active.');

  const title = textValue(formData, 'title');
  let shortcut = textValue(formData, 'shortcut').toLowerCase();
  const body = textValue(formData, 'body');
  const category = textValue(formData, 'category');

  if (!title || !body) instagramRedirect('error', 'Quick reply title and message are required.');
  if (!shortcut.startsWith('/')) shortcut = `/${shortcut}`;
  if (!/^\/[a-z0-9_-]{1,40}$/.test(shortcut)) {
    instagramRedirect('error', 'Shortcut must look like /fees or /dates.');
  }
  if (body.length > 1000) instagramRedirect('error', 'Instagram quick replies are limited to 1000 characters.');

  const { supabase, user, organizationId } = await currentAdminContext();
  const { error } = await supabase.from('instagram_quick_replies').insert({
    organization_id: organizationId,
    title,
    shortcut,
    body,
    category: category || null,
    active: true,
    created_by: user.id,
  });

  if (error) instagramRedirect('error', error.message);
  revalidateInstagram();
  instagramRedirect('notice', 'Instagram quick reply saved and available in the shared inbox.');
}

export async function archiveInstagramQuickReplyAction(formData: FormData) {
  if (useMockData) instagramRedirect('error', 'Mock mode is active.');
  const quickReplyId = textValue(formData, 'quick_reply_id');
  if (!quickReplyId) instagramRedirect('error', 'Quick reply is required.');

  const { supabase, organizationId } = await currentAdminContext();
  const { error } = await supabase
    .from('instagram_quick_replies')
    .update({ active: false })
    .eq('organization_id', organizationId)
    .eq('id', quickReplyId);

  if (error) instagramRedirect('error', error.message);
  revalidateInstagram();
  instagramRedirect('notice', 'Instagram quick reply archived.');
}

export async function createInstagramAutomationRuleAction(formData: FormData) {
  if (useMockData) instagramRedirect('error', 'Mock mode is active.');

  const name = textValue(formData, 'name');
  const triggerType = textValue(formData, 'trigger_type');
  const matchMode = textValue(formData, 'match_mode') || 'contains_any';
  const keywords = csvValues(textValue(formData, 'keywords'));
  const responseText = textValue(formData, 'response_text');
  const publicReplyText = textValue(formData, 'public_reply_text');
  const priority = Math.max(1, Math.min(integerValue(formData, 'priority', 100), 10000));

  if (!name || !responseText) instagramRedirect('error', 'Rule name and private response are required.');
  if (!TRIGGERS.has(triggerType)) instagramRedirect('error', 'Instagram trigger type is invalid.');
  if (!MATCH_MODES.has(matchMode)) instagramRedirect('error', 'Instagram match mode is invalid.');
  if (matchMode !== 'any' && !keywords.length) {
    instagramRedirect('error', 'Keyword rules require at least one comma-separated keyword.');
  }
  if (responseText.length > 1000) instagramRedirect('error', 'Instagram response is limited to 1000 characters.');

  const { supabase, user, organizationId } = await currentAdminContext();
  const { error } = await supabase.from('instagram_automation_rules').insert({
    organization_id: organizationId,
    name,
    trigger_type: triggerType,
    match_mode: matchMode,
    keywords,
    response_text: responseText,
    public_reply_text: publicReplyText || null,
    active: false,
    priority,
    requires_human_approval: boolValue(formData, 'requires_human_approval'),
    created_by: user.id,
  });

  if (error) instagramRedirect('error', error.message);
  revalidateInstagram();
  instagramRedirect('notice', 'Instagram automation rule created inactive. Review it before enabling.');
}

export async function toggleInstagramAutomationRuleAction(formData: FormData) {
  if (useMockData) instagramRedirect('error', 'Mock mode is active.');
  const ruleId = textValue(formData, 'rule_id');
  const active = boolValue(formData, 'active');
  if (!ruleId) instagramRedirect('error', 'Automation rule is required.');

  const { supabase, organizationId } = await currentAdminContext();
  const { error } = await supabase
    .from('instagram_automation_rules')
    .update({ active })
    .eq('organization_id', organizationId)
    .eq('id', ruleId);

  if (error) instagramRedirect('error', error.message);
  revalidateInstagram();
  instagramRedirect(
    'notice',
    active
      ? 'Instagram rule enabled. Provider/pilot/approval gates still apply.'
      : 'Instagram rule disabled.',
  );
}

export async function approveInstagramAutomationRunAction(formData: FormData) {
  if (useMockData) instagramRedirect('error', 'Mock mode is active.');
  const runId = textValue(formData, 'run_id');
  if (!runId) instagramRedirect('error', 'Automation run is required.');

  const { admin, user, organizationId } = await currentAdminContext();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('instagram_automation_runs')
    .update({
      status: 'approved',
      human_approved: true,
      approved_by: user.id,
      approved_at: now,
    })
    .eq('organization_id', organizationId)
    .eq('id', runId)
    .eq('status', 'pending_approval')
    .select('id')
    .maybeSingle();

  if (error || !data?.id) {
    instagramRedirect('error', error?.message || 'Only pending Instagram runs can be approved.');
  }

  revalidateInstagram();
  instagramRedirect(
    'notice',
    'Instagram run approved by a human. The runner will still recheck Meta window, suppression, frequency, pilot and provider gates before sending.',
  );
}

export async function cancelInstagramAutomationRunAction(formData: FormData) {
  if (useMockData) instagramRedirect('error', 'Mock mode is active.');
  const runId = textValue(formData, 'run_id');
  if (!runId) instagramRedirect('error', 'Automation run is required.');

  const { admin, organizationId } = await currentAdminContext();
  const { error } = await admin
    .from('instagram_automation_runs')
    .update({ status: 'cancelled' })
    .eq('organization_id', organizationId)
    .eq('id', runId)
    .in('status', ['pending_approval', 'approved', 'queued', 'blocked', 'failed']);

  if (error) instagramRedirect('error', error.message);
  revalidateInstagram();
  instagramRedirect('notice', 'Instagram automation run cancelled.');
}

export async function addInstagramPilotAllowlistAction(formData: FormData) {
  if (useMockData) instagramRedirect('error', 'Mock mode is active.');
  const targetType = textValue(formData, 'target_type');
  const targetValue = textValue(formData, 'target_value');
  const label = textValue(formData, 'label');

  if (!['instagram_user_id', 'comment_id'].includes(targetType)) {
    instagramRedirect('error', 'Pilot target type is invalid.');
  }
  if (!targetValue) instagramRedirect('error', 'Pilot target value is required.');

  const { supabase, user, organizationId } = await currentAdminContext();
  const { error } = await supabase.from('instagram_pilot_allowlist').upsert(
    {
      organization_id: organizationId,
      target_type: targetType,
      target_value: targetValue,
      label: label || null,
      active: true,
      created_by: user.id,
    },
    { onConflict: 'organization_id,target_type,target_value' },
  );

  if (error) instagramRedirect('error', error.message);
  revalidateInstagram();
  instagramRedirect('notice', 'Instagram pilot target allowlisted. No message was sent.');
}

export async function removeInstagramPilotAllowlistAction(formData: FormData) {
  if (useMockData) instagramRedirect('error', 'Mock mode is active.');
  const id = textValue(formData, 'allowlist_id');
  if (!id) instagramRedirect('error', 'Pilot allowlist entry is required.');

  const { supabase, organizationId } = await currentAdminContext();
  const { error } = await supabase
    .from('instagram_pilot_allowlist')
    .update({ active: false })
    .eq('organization_id', organizationId)
    .eq('id', id);

  if (error) instagramRedirect('error', error.message);
  revalidateInstagram();
  instagramRedirect('notice', 'Instagram pilot target removed from the active allowlist.');
}

export async function unsuppressInstagramUserAction(formData: FormData) {
  if (useMockData) instagramRedirect('error', 'Mock mode is active.');
  const instagramUserId = textValue(formData, 'instagram_user_id');
  if (!instagramUserId) instagramRedirect('error', 'Instagram user ID is required.');

  const { supabase, organizationId } = await currentAdminContext();
  const { error } = await supabase
    .from('instagram_channel_preferences')
    .update({ suppressed: false, suppression_reason: null, suppressed_at: null })
    .eq('organization_id', organizationId)
    .eq('instagram_user_id', instagramUserId);

  if (error) instagramRedirect('error', error.message);
  revalidateInstagram();
  instagramRedirect('notice', 'Instagram recipient suppression cleared by an administrator.');
}
