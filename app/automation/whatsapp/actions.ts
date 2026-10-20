'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  normalizeWhatsAppAudienceFilters,
  resolveWhatsAppAudience,
  type WhatsAppAudienceFilters,
} from '@/lib/whatsapp-operations';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
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

function whatsappRedirect(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/whatsapp?${type}=${encodeURIComponent(message)}`);
}

async function currentAdminContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    whatsappRedirect('error', 'Your session has expired. Sign in again.');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage, error: manageError } = await supabase.rpc(
    'can_manage_organization',
    { p_organization_id: organizationId },
  );

  if (manageError || canManage !== true) {
    whatsappRedirect('error', 'Only organization admins can manage WhatsApp operations.');
  }

  return { supabase, admin: createAdminClient(), user, organizationId };
}

function filtersFromForm(formData: FormData): WhatsAppAudienceFilters {
  return normalizeWhatsAppAudienceFilters({
    stages: csvValues(textValue(formData, 'stages')),
    intents: csvValues(textValue(formData, 'intents')),
    countries: csvValues(textValue(formData, 'countries')),
    course_ids: csvValues(textValue(formData, 'course_ids')),
    owner_user_ids: csvValues(textValue(formData, 'owner_user_ids')),
    source_channels: csvValues(textValue(formData, 'source_channels')),
    preferred_locations: csvValues(textValue(formData, 'preferred_locations')),
    require_verified_primary_whatsapp:
      textValue(formData, 'require_verified_primary_whatsapp') !== 'false',
  });
}

async function logCampaignEvent(params: {
  organizationId: string;
  campaignId: string;
  actorUserId: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from('whatsapp_campaign_events').insert({
    organization_id: params.organizationId,
    campaign_id: params.campaignId,
    event_type: params.eventType,
    actor_user_id: params.actorUserId,
    metadata: params.metadata ?? {},
  });

  if (error) console.error('WHATSAPP_CAMPAIGN_EVENT_INSERT_FAILED', error);
}

export async function createWhatsAppAudienceSegmentAction(formData: FormData) {
  if (useMockData) whatsappRedirect('error', 'Mock mode is active. No segment was created.');

  const name = textValue(formData, 'name');
  const description = textValue(formData, 'description');
  if (!name) whatsappRedirect('error', 'Audience segment name is required.');

  const filters = filtersFromForm(formData);
  const { supabase, user, organizationId } = await currentAdminContext();
  const { error } = await supabase.from('whatsapp_audience_segments').insert({
    organization_id: organizationId,
    name,
    description: description || null,
    filters,
    active: true,
    created_by: user.id,
  });

  if (error) whatsappRedirect('error', error.message);
  revalidatePath('/automation/whatsapp');
  whatsappRedirect('notice', 'Audience segment created. No messages were sent.');
}

export async function createWhatsAppQuickReplyAction(formData: FormData) {
  if (useMockData) whatsappRedirect('error', 'Mock mode is active. No quick reply was created.');

  const title = textValue(formData, 'title');
  let shortcut = textValue(formData, 'shortcut').toLowerCase();
  const body = textValue(formData, 'body');
  const category = textValue(formData, 'category');

  if (!title || !body) whatsappRedirect('error', 'Quick reply title and message are required.');
  if (!shortcut.startsWith('/')) shortcut = `/${shortcut}`;
  if (!/^\/[a-z0-9_-]{1,40}$/.test(shortcut)) {
    whatsappRedirect('error', 'Shortcut must use letters, numbers, underscores or hyphens, for example /fees.');
  }

  const { supabase, user, organizationId } = await currentAdminContext();
  const { error } = await supabase.from('whatsapp_quick_replies').insert({
    organization_id: organizationId,
    title,
    shortcut,
    body,
    category: category || null,
    active: true,
    created_by: user.id,
  });

  if (error) whatsappRedirect('error', error.message);
  revalidatePath('/automation/whatsapp');
  revalidatePath('/conversations');
  whatsappRedirect('notice', 'Quick reply saved and available to the WhatsApp inbox.');
}

export async function archiveWhatsAppQuickReplyAction(formData: FormData) {
  if (useMockData) whatsappRedirect('error', 'Mock mode is active.');
  const id = textValue(formData, 'quick_reply_id');
  if (!id) whatsappRedirect('error', 'Quick reply is required.');

  const { supabase, organizationId } = await currentAdminContext();
  const { error } = await supabase
    .from('whatsapp_quick_replies')
    .update({ active: false })
    .eq('organization_id', organizationId)
    .eq('id', id);

  if (error) whatsappRedirect('error', error.message);
  revalidatePath('/automation/whatsapp');
  revalidatePath('/conversations');
  whatsappRedirect('notice', 'Quick reply archived.');
}

export async function createWhatsAppBroadcastCampaignAction(formData: FormData) {
  if (useMockData) whatsappRedirect('error', 'Mock mode is active. No campaign was created.');

  const name = textValue(formData, 'name');
  const description = textValue(formData, 'description');
  const segmentId = textValue(formData, 'audience_segment_id');
  const templateId = textValue(formData, 'whatsapp_template_id');
  const scheduledRaw = textValue(formData, 'scheduled_at');

  if (!name || !segmentId || !templateId) {
    whatsappRedirect('error', 'Campaign name, audience segment and approved template are required.');
  }

  const { supabase, user, organizationId } = await currentAdminContext();
  const [{ data: segment, error: segmentError }, { data: template, error: templateError }] =
    await Promise.all([
      supabase
        .from('whatsapp_audience_segments')
        .select('id,filters,active')
        .eq('organization_id', organizationId)
        .eq('id', segmentId)
        .maybeSingle(),
      supabase
        .from('automation_whatsapp_templates')
        .select('id,approval_status,active')
        .eq('organization_id', organizationId)
        .eq('id', templateId)
        .maybeSingle(),
    ]);

  if (segmentError || !segment || segment.active !== true) {
    whatsappRedirect('error', segmentError?.message || 'Audience segment is not active.');
  }
  if (templateError || !template || template.active !== true || template.approval_status !== 'approved') {
    whatsappRedirect('error', templateError?.message || 'WhatsApp template must be approved and active.');
  }

  let scheduledAt: string | null = null;
  if (scheduledRaw) {
    const parsed = Date.parse(scheduledRaw);
    if (!Number.isFinite(parsed)) whatsappRedirect('error', 'Scheduled time is invalid.');
    scheduledAt = new Date(parsed).toISOString();
  }

  const { data: campaign, error } = await supabase
    .from('whatsapp_broadcast_campaigns')
    .insert({
      organization_id: organizationId,
      name,
      description: description || null,
      status: 'draft',
      whatsapp_template_id: templateId,
      audience_segment_id: segmentId,
      audience_filters: normalizeWhatsAppAudienceFilters(segment.filters),
      scheduled_at: scheduledAt,
      created_by: user.id,
      metadata: {
        campaign_version: 'v1',
        approval_boundary: 'campaign_level_human_review',
        send_policy: 'fail_closed',
      },
    })
    .select('id')
    .single();

  if (error || !campaign?.id) whatsappRedirect('error', error?.message || 'Unable to create campaign.');

  await logCampaignEvent({
    organizationId,
    campaignId: campaign.id,
    actorUserId: user.id,
    eventType: 'campaign.created',
  });

  revalidatePath('/automation/whatsapp');
  whatsappRedirect('notice', 'Campaign draft created. Snapshot the audience before approval.');
}

export async function snapshotWhatsAppBroadcastAudienceAction(formData: FormData) {
  if (useMockData) whatsappRedirect('error', 'Mock mode is active.');
  const campaignId = textValue(formData, 'campaign_id');
  if (!campaignId) whatsappRedirect('error', 'Campaign is required.');

  const { admin, user, organizationId } = await currentAdminContext();
  const { data: campaign, error: campaignError } = await admin
    .from('whatsapp_broadcast_campaigns')
    .select('id,status,audience_filters')
    .eq('organization_id', organizationId)
    .eq('id', campaignId)
    .maybeSingle();

  if (campaignError || !campaign) whatsappRedirect('error', campaignError?.message || 'Campaign not found.');
  if (!['draft', 'ready'].includes(String(campaign.status))) {
    whatsappRedirect('error', 'Only draft or ready campaigns can refresh their audience snapshot.');
  }

  const members = await resolveWhatsAppAudience({
    organizationId,
    filters: campaign.audience_filters,
    limit: 5000,
  });

  const { error: deleteError } = await admin
    .from('whatsapp_broadcast_recipients')
    .delete()
    .eq('organization_id', organizationId)
    .eq('campaign_id', campaignId);
  if (deleteError) whatsappRedirect('error', deleteError.message);

  for (let index = 0; index < members.length; index += 500) {
    const batch = members.slice(index, index + 500).map((member) => ({
      organization_id: organizationId,
      campaign_id: campaignId,
      lead_id: member.leadId,
      lead_contact_id: member.contactId,
      status: member.eligible ? 'eligible' : member.exclusionReason === 'suppressed' ? 'suppressed' : 'excluded',
      exclusion_reason: member.exclusionReason,
      metadata: {
        display_name: member.displayName,
        stage: member.stage,
        intent: member.intent,
        country: member.country,
        audience_snapshot_version: 'v1',
      },
    }));
    if (!batch.length) continue;
    const { error: insertError } = await admin.from('whatsapp_broadcast_recipients').insert(batch);
    if (insertError) whatsappRedirect('error', insertError.message);
  }

  const eligibleCount = members.filter((member) => member.eligible).length;
  const excludedCount = members.length - eligibleCount;
  const { error: updateError } = await admin
    .from('whatsapp_broadcast_campaigns')
    .update({
      status: eligibleCount > 0 ? 'ready' : 'draft',
      audience_count: members.length,
      eligible_count: eligibleCount,
      excluded_count: excludedCount,
      queued_count: 0,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      replied_count: 0,
      failed_count: 0,
      approved_by: null,
      approved_at: null,
    })
    .eq('organization_id', organizationId)
    .eq('id', campaignId);

  if (updateError) whatsappRedirect('error', updateError.message);

  await logCampaignEvent({
    organizationId,
    campaignId,
    actorUserId: user.id,
    eventType: 'audience.snapshotted',
    metadata: {
      audience_count: members.length,
      eligible_count: eligibleCount,
      excluded_count: excludedCount,
    },
  });

  revalidatePath('/automation/whatsapp');
  whatsappRedirect(
    'notice',
    `Audience snapshot saved: ${eligibleCount} eligible, ${excludedCount} excluded. No messages were sent.`,
  );
}

export async function approveWhatsAppBroadcastCampaignAction(formData: FormData) {
  if (useMockData) whatsappRedirect('error', 'Mock mode is active.');
  const campaignId = textValue(formData, 'campaign_id');
  if (!campaignId) whatsappRedirect('error', 'Campaign is required.');

  const { supabase, user, organizationId } = await currentAdminContext();
  const { data: campaign, error: campaignError } = await supabase
    .from('whatsapp_broadcast_campaigns')
    .select('id,status,eligible_count,scheduled_at,whatsapp_template_id')
    .eq('organization_id', organizationId)
    .eq('id', campaignId)
    .maybeSingle();

  if (campaignError || !campaign) whatsappRedirect('error', campaignError?.message || 'Campaign not found.');
  if (campaign.status !== 'ready' || Number(campaign.eligible_count ?? 0) < 1) {
    whatsappRedirect('error', 'Campaign must have a fresh eligible audience snapshot before approval.');
  }

  const { data: template, error: templateError } = await supabase
    .from('automation_whatsapp_templates')
    .select('id,approval_status,active')
    .eq('organization_id', organizationId)
    .eq('id', campaign.whatsapp_template_id)
    .maybeSingle();

  if (templateError || !template || template.approval_status !== 'approved' || template.active !== true) {
    whatsappRedirect('error', templateError?.message || 'The campaign template is no longer approved and active.');
  }

  const nextStatus = campaign.scheduled_at && Date.parse(String(campaign.scheduled_at)) > Date.now()
    ? 'scheduled'
    : 'approved';
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('whatsapp_broadcast_campaigns')
    .update({ status: nextStatus, approved_by: user.id, approved_at: now })
    .eq('organization_id', organizationId)
    .eq('id', campaignId)
    .eq('status', 'ready');

  if (error) whatsappRedirect('error', error.message);

  await logCampaignEvent({
    organizationId,
    campaignId,
    actorUserId: user.id,
    eventType: 'campaign.approved',
    metadata: { status: nextStatus },
  });

  revalidatePath('/automation/whatsapp');
  whatsappRedirect(
    'notice',
    'Campaign approved by a human operator. Provider execution remains fail-closed until the campaign runner and existing WhatsApp provider gates allow it.',
  );
}

export async function pauseWhatsAppBroadcastCampaignAction(formData: FormData) {
  if (useMockData) whatsappRedirect('error', 'Mock mode is active.');
  const campaignId = textValue(formData, 'campaign_id');
  if (!campaignId) whatsappRedirect('error', 'Campaign is required.');

  const { supabase, user, organizationId } = await currentAdminContext();
  const { error } = await supabase
    .from('whatsapp_broadcast_campaigns')
    .update({ status: 'paused', paused_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', campaignId)
    .in('status', ['approved', 'scheduled', 'running']);
  if (error) whatsappRedirect('error', error.message);

  await logCampaignEvent({
    organizationId,
    campaignId,
    actorUserId: user.id,
    eventType: 'campaign.paused',
  });
  revalidatePath('/automation/whatsapp');
  whatsappRedirect('notice', 'Campaign paused. No new recipients should be executed while paused.');
}

export async function cancelWhatsAppBroadcastCampaignAction(formData: FormData) {
  if (useMockData) whatsappRedirect('error', 'Mock mode is active.');
  const campaignId = textValue(formData, 'campaign_id');
  if (!campaignId) whatsappRedirect('error', 'Campaign is required.');

  const { admin, user, organizationId } = await currentAdminContext();
  const now = new Date().toISOString();
  const { error } = await admin
    .from('whatsapp_broadcast_campaigns')
    .update({ status: 'cancelled', cancelled_at: now })
    .eq('organization_id', organizationId)
    .eq('id', campaignId)
    .not('status', 'in', '(completed,cancelled)');
  if (error) whatsappRedirect('error', error.message);

  await admin
    .from('whatsapp_broadcast_recipients')
    .update({ status: 'cancelled' })
    .eq('organization_id', organizationId)
    .eq('campaign_id', campaignId)
    .in('status', ['eligible', 'queued']);

  await logCampaignEvent({
    organizationId,
    campaignId,
    actorUserId: user.id,
    eventType: 'campaign.cancelled',
  });
  revalidatePath('/automation/whatsapp');
  whatsappRedirect('notice', 'Campaign cancelled.');
}
