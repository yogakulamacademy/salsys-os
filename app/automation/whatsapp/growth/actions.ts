'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import {
  normalizeReplyRoutingMode,
  normalizeRoutingUserIds,
  parseWhatsAppTemplateBindings,
} from '@/lib/automation/whatsapp-growth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  normalizeWhatsAppAudienceFilters,
  resolveWhatsAppAudience,
} from '@/lib/whatsapp-operations';
import { requireCurrentOrganizationId } from '@/lib/workspace';

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function listValues(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function growthRedirect(type: 'notice' | 'error', message: string): never {
  redirect(`/automation/whatsapp/growth?${type}=${encodeURIComponent(message)}`);
}

async function currentAdminContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) growthRedirect('error', 'Your session has expired. Sign in again.');

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data: canManage, error } = await supabase.rpc('can_manage_organization', {
    p_organization_id: organizationId,
  });
  if (error || canManage !== true) {
    growthRedirect('error', 'Only organization admins can manage WhatsApp growth campaigns.');
  }

  return { supabase, admin: createAdminClient(), user, organizationId };
}

async function campaignEvent(params: {
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
    actor_user_id: params.actorUserId,
    event_type: params.eventType,
    metadata: params.metadata ?? {},
  });
  if (error) console.error('WHATSAPP_GROWTH_CAMPAIGN_EVENT_FAILED', error);
}

async function validateTemplateBindings(params: {
  organizationId: string;
  templateId: string;
  bindings: { header: Array<Record<string, unknown>>; body: Array<Record<string, unknown>> };
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('validate_whatsapp_template_bindings_v1', {
    p_organization_id: params.organizationId,
    p_template_id: params.templateId,
    p_bindings: params.bindings,
  });

  if (error) growthRedirect('error', `Unable to validate template variables: ${error.message}`);
  const result = (data ?? {}) as { valid?: boolean; reasons?: string[] };
  if (result.valid !== true) {
    growthRedirect(
      'error',
      `Template variable configuration is invalid: ${(result.reasons ?? ['unknown configuration error']).join(', ')}.`,
    );
  }
}

export async function createWhatsAppGrowthCampaignAction(formData: FormData) {
  if (useMockData) growthRedirect('error', 'Mock mode is active. No campaign was created.');

  const name = textValue(formData, 'name');
  const description = textValue(formData, 'description');
  const segmentId = textValue(formData, 'audience_segment_id');
  const baseTemplateId = textValue(formData, 'whatsapp_template_id');
  const scheduledRaw = textValue(formData, 'scheduled_at');
  const experimentEnabled = textValue(formData, 'experiment_enabled') === 'true';
  const challengerTemplateId = textValue(formData, 'challenger_template_id');
  const routingMode = normalizeReplyRoutingMode(textValue(formData, 'reply_routing_mode'));
  const routingUserIds = normalizeRoutingUserIds(listValues(formData, 'reply_routing_user_ids'));
  const conversionWindowDays = Math.min(
    90,
    Math.max(1, Number.parseInt(textValue(formData, 'conversion_window_days') || '30', 10) || 30),
  );
  const challengerWeight = Math.min(
    90,
    Math.max(10, Number.parseInt(textValue(formData, 'challenger_weight') || '50', 10) || 50),
  );

  if (!name || !segmentId || !baseTemplateId) {
    growthRedirect('error', 'Campaign name, audience segment and control template are required.');
  }
  if (experimentEnabled && (!challengerTemplateId || challengerTemplateId === baseTemplateId)) {
    growthRedirect('error', 'A/B testing requires a different approved challenger template.');
  }
  if (routingMode === 'round_robin_if_unassigned' && !routingUserIds.length) {
    growthRedirect('error', 'Round-robin routing requires at least one active team member.');
  }

  let baseBindings;
  let challengerBindings;
  try {
    baseBindings = parseWhatsAppTemplateBindings(textValue(formData, 'base_template_bindings'));
    challengerBindings = parseWhatsAppTemplateBindings(textValue(formData, 'challenger_template_bindings'));
  } catch (error) {
    growthRedirect('error', error instanceof Error ? error.message : 'Template bindings are invalid.');
  }

  const { admin, user, organizationId } = await currentAdminContext();
  const [{ data: segment, error: segmentError }, { data: templates, error: templateError }] =
    await Promise.all([
      admin
        .from('whatsapp_audience_segments')
        .select('id,filters,active')
        .eq('organization_id', organizationId)
        .eq('id', segmentId)
        .maybeSingle(),
      admin
        .from('automation_whatsapp_templates')
        .select('id,approval_status,active')
        .eq('organization_id', organizationId)
        .in('id', experimentEnabled ? [baseTemplateId, challengerTemplateId] : [baseTemplateId]),
    ]);

  if (segmentError || !segment || segment.active !== true) {
    growthRedirect('error', segmentError?.message || 'Audience segment is not active.');
  }
  if (templateError) growthRedirect('error', templateError.message);
  const approvedIds = new Set(
    (templates ?? [])
      .filter((template) => template.active === true && template.approval_status === 'approved')
      .map((template) => String(template.id)),
  );
  if (!approvedIds.has(baseTemplateId) || (experimentEnabled && !approvedIds.has(challengerTemplateId))) {
    growthRedirect('error', 'Every campaign template must be active and Meta-approved.');
  }

  await validateTemplateBindings({
    organizationId,
    templateId: baseTemplateId,
    bindings: baseBindings,
  });
  if (experimentEnabled) {
    await validateTemplateBindings({
      organizationId,
      templateId: challengerTemplateId,
      bindings: challengerBindings,
    });
  }

  if (routingUserIds.length) {
    const { data: memberRows, error: memberError } = await admin
      .from('organization_members')
      .select('user_id,role,active')
      .eq('organization_id', organizationId)
      .in('user_id', routingUserIds)
      .eq('active', true)
      .in('role', ['owner', 'admin', 'admissions']);
    if (memberError) growthRedirect('error', memberError.message);
    if ((memberRows ?? []).length !== routingUserIds.length) {
      growthRedirect('error', 'Reply routing can only use active team members from this organization.');
    }
  }

  let scheduledAt: string | null = null;
  if (scheduledRaw) {
    const parsed = Date.parse(scheduledRaw);
    if (!Number.isFinite(parsed)) growthRedirect('error', 'Scheduled time is invalid.');
    scheduledAt = new Date(parsed).toISOString();
  }

  const { data: campaign, error: campaignError } = await admin
    .from('whatsapp_broadcast_campaigns')
    .insert({
      organization_id: organizationId,
      name,
      description: description || null,
      status: 'draft',
      whatsapp_template_id: baseTemplateId,
      template_parameter_bindings: baseBindings,
      audience_segment_id: segmentId,
      audience_filters: normalizeWhatsAppAudienceFilters(segment.filters),
      scheduled_at: scheduledAt,
      reply_routing_mode: routingMode,
      reply_routing_user_ids: routingUserIds,
      conversion_window_days: conversionWindowDays,
      created_by: user.id,
      metadata: {
        campaign_version: 'growth_v1',
        approval_boundary: 'campaign_level_human_review',
        send_policy: 'fail_closed',
        experiment_enabled: experimentEnabled,
        attribution_method: 'last_sent_whatsapp_campaign_within_window',
      },
    })
    .select('id')
    .single();

  if (campaignError || !campaign?.id) {
    growthRedirect('error', campaignError?.message || 'Unable to create campaign.');
  }

  if (experimentEnabled) {
    const { error: variantError } = await admin.from('whatsapp_campaign_variants').insert([
      {
        organization_id: organizationId,
        campaign_id: campaign.id,
        label: 'Control',
        whatsapp_template_id: baseTemplateId,
        parameter_bindings: baseBindings,
        allocation_weight: 100 - challengerWeight,
        active: true,
        created_by: user.id,
      },
      {
        organization_id: organizationId,
        campaign_id: campaign.id,
        label: 'Challenger',
        whatsapp_template_id: challengerTemplateId,
        parameter_bindings: challengerBindings,
        allocation_weight: challengerWeight,
        active: true,
        created_by: user.id,
      },
    ]);

    if (variantError) {
      await admin
        .from('whatsapp_broadcast_campaigns')
        .delete()
        .eq('organization_id', organizationId)
        .eq('id', campaign.id)
        .eq('status', 'draft');
      growthRedirect('error', `Unable to create A/B variants: ${variantError.message}`);
    }
  }

  const { data: config, error: configError } = await admin.rpc(
    'validate_whatsapp_broadcast_campaign_config_v1',
    { p_organization_id: organizationId, p_campaign_id: campaign.id },
  );
  if (configError || (config as { valid?: boolean } | null)?.valid !== true) {
    growthRedirect('error', configError?.message || 'Campaign configuration did not pass validation.');
  }

  await campaignEvent({
    organizationId,
    campaignId: campaign.id,
    actorUserId: user.id,
    eventType: 'campaign.growth_created',
    metadata: {
      experiment_enabled: experimentEnabled,
      reply_routing_mode: routingMode,
      conversion_window_days: conversionWindowDays,
    },
  });

  revalidatePath('/automation/whatsapp');
  revalidatePath('/automation/whatsapp/growth');
  growthRedirect('notice', 'Growth campaign draft created. Snapshot the audience before human approval.');
}

export async function snapshotWhatsAppGrowthAudienceAction(formData: FormData) {
  if (useMockData) growthRedirect('error', 'Mock mode is active.');
  const campaignId = textValue(formData, 'campaign_id');
  if (!campaignId) growthRedirect('error', 'Campaign is required.');

  const { admin, user, organizationId } = await currentAdminContext();
  const { data: campaign, error: campaignError } = await admin
    .from('whatsapp_broadcast_campaigns')
    .select('id,status,audience_filters')
    .eq('organization_id', organizationId)
    .eq('id', campaignId)
    .maybeSingle();

  if (campaignError || !campaign) growthRedirect('error', campaignError?.message || 'Campaign not found.');
  if (!['draft', 'ready'].includes(String(campaign.status))) {
    growthRedirect('error', 'Only draft or ready campaigns can refresh their audience snapshot.');
  }

  const { data: config, error: configError } = await admin.rpc(
    'validate_whatsapp_broadcast_campaign_config_v1',
    { p_organization_id: organizationId, p_campaign_id: campaignId },
  );
  const validation = (config ?? {}) as { valid?: boolean; reasons?: string[] };
  if (configError || validation.valid !== true) {
    growthRedirect(
      'error',
      configError?.message || `Campaign configuration is invalid: ${(validation.reasons ?? []).join(', ')}.`,
    );
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
  if (deleteError) growthRedirect('error', deleteError.message);

  for (let index = 0; index < members.length; index += 500) {
    const rows = members.slice(index, index + 500).map((member) => ({
      organization_id: organizationId,
      campaign_id: campaignId,
      lead_id: member.leadId,
      lead_contact_id: member.contactId,
      status: member.eligible
        ? 'eligible'
        : member.exclusionReason === 'suppressed'
          ? 'suppressed'
          : 'excluded',
      exclusion_reason: member.exclusionReason,
      metadata: {
        display_name: member.displayName,
        stage: member.stage,
        intent: member.intent,
        country: member.country,
        audience_snapshot_version: 'growth_v1',
      },
    }));
    if (!rows.length) continue;
    const { error } = await admin.from('whatsapp_broadcast_recipients').insert(rows);
    if (error) growthRedirect('error', error.message);
  }

  const { data: recipientRows, error: recipientError } = await admin
    .from('whatsapp_broadcast_recipients')
    .select('status')
    .eq('organization_id', organizationId)
    .eq('campaign_id', campaignId);
  if (recipientError) growthRedirect('error', recipientError.message);

  const statuses = recipientRows ?? [];
  const eligibleCount = statuses.filter((row) => row.status === 'eligible').length;
  const excludedCount = statuses.length - eligibleCount;
  const { error: updateError } = await admin
    .from('whatsapp_broadcast_campaigns')
    .update({
      status: eligibleCount > 0 ? 'ready' : 'draft',
      audience_count: statuses.length,
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
  if (updateError) growthRedirect('error', updateError.message);

  await campaignEvent({
    organizationId,
    campaignId,
    actorUserId: user.id,
    eventType: 'audience.growth_snapshotted',
    metadata: {
      audience_count: statuses.length,
      eligible_count: eligibleCount,
      excluded_count: excludedCount,
    },
  });

  revalidatePath('/automation/whatsapp');
  revalidatePath('/automation/whatsapp/growth');
  growthRedirect(
    'notice',
    `Audience snapshot saved: ${eligibleCount} eligible, ${excludedCount} excluded after template/personalization checks. No messages were sent.`,
  );
}

export async function approveWhatsAppGrowthCampaignAction(formData: FormData) {
  if (useMockData) growthRedirect('error', 'Mock mode is active.');
  const campaignId = textValue(formData, 'campaign_id');
  if (!campaignId) growthRedirect('error', 'Campaign is required.');

  const { admin, user, organizationId } = await currentAdminContext();
  const { data: config, error: configError } = await admin.rpc(
    'validate_whatsapp_broadcast_campaign_config_v1',
    { p_organization_id: organizationId, p_campaign_id: campaignId },
  );
  const validation = (config ?? {}) as { valid?: boolean; reasons?: string[] };
  if (configError || validation.valid !== true) {
    growthRedirect(
      'error',
      configError?.message || `Campaign configuration is invalid: ${(validation.reasons ?? []).join(', ')}.`,
    );
  }

  const { data: campaign, error: campaignError } = await admin
    .from('whatsapp_broadcast_campaigns')
    .select('id,status,eligible_count,scheduled_at')
    .eq('organization_id', organizationId)
    .eq('id', campaignId)
    .maybeSingle();
  if (campaignError || !campaign) growthRedirect('error', campaignError?.message || 'Campaign not found.');
  if (campaign.status !== 'ready' || Number(campaign.eligible_count ?? 0) < 1) {
    growthRedirect('error', 'Campaign must have a fresh eligible audience snapshot before approval.');
  }

  const nextStatus = campaign.scheduled_at && Date.parse(String(campaign.scheduled_at)) > Date.now()
    ? 'scheduled'
    : 'approved';
  const now = new Date().toISOString();
  const { error } = await admin
    .from('whatsapp_broadcast_campaigns')
    .update({ status: nextStatus, approved_by: user.id, approved_at: now })
    .eq('organization_id', organizationId)
    .eq('id', campaignId)
    .eq('status', 'ready');
  if (error) growthRedirect('error', error.message);

  await campaignEvent({
    organizationId,
    campaignId,
    actorUserId: user.id,
    eventType: 'campaign.growth_approved',
    metadata: {
      status: nextStatus,
      configuration_validation: validation,
    },
  });

  revalidatePath('/automation/whatsapp');
  revalidatePath('/automation/whatsapp/growth');
  growthRedirect(
    'notice',
    'Campaign approved with its audience, template variables, experiment split and reply-routing configuration frozen for execution. Existing provider gates still control whether anything can send.',
  );
}
