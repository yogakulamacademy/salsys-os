import 'server-only';

import { executePreparedWhatsAppProviderSend } from '@/lib/integrations/whatsapp-provider-send';
import { createAdminClient } from '@/lib/supabase/admin';

type JsonRecord = Record<string, unknown>;

type CampaignRow = {
  id: string;
  organization_id: string;
  status: string;
  approved_at: string | null;
  approved_by: string | null;
  scheduled_at: string | null;
  eligible_count: number | null;
};

type PolicyRow = {
  policy_enabled: boolean | null;
};

type ProviderRow = {
  provider_send_enabled: boolean | null;
  pilot_mode_enabled: boolean | null;
  pilot_lead_id: string | null;
  pilot_max_messages: number | null;
};

type RecipientRow = {
  id: string;
  lead_id: string;
  status: string;
};

export type WhatsAppBroadcastRunnerResult = {
  ok: boolean;
  observedCampaigns: number;
  startedCampaigns: number;
  processedRecipients: number;
  sentRecipients: number;
  blockedRecipients: number;
  failedRecipients: number;
  skippedCampaigns: number;
  campaignResults: Array<{
    campaignId: string;
    organizationId: string;
    action: 'processed' | 'skipped';
    reason?: string;
    processed?: number;
    sent?: number;
    blocked?: number;
    failed?: number;
  }>;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown) {
  return value === true;
}

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

export async function runWhatsAppBroadcasts(options: {
  maxCampaigns?: number;
  maxRecipientsPerCampaign?: number;
} = {}): Promise<WhatsAppBroadcastRunnerResult> {
  const admin = createAdminClient();
  const maxCampaigns = clamp(options.maxCampaigns, 5, 1, 20);
  const maxRecipientsPerCampaign = clamp(options.maxRecipientsPerCampaign, 10, 1, 50);
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: campaignData, error: campaignError } = await admin
    .from('whatsapp_broadcast_campaigns')
    .select('id,organization_id,status,approved_at,approved_by,scheduled_at,eligible_count')
    .in('status', ['approved', 'scheduled', 'running'])
    .order('scheduled_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(maxCampaigns);

  if (campaignError) {
    throw new Error(`Unable to load WhatsApp broadcast campaigns: ${campaignError.message}`);
  }

  const campaigns = (campaignData ?? []) as CampaignRow[];
  const result: WhatsAppBroadcastRunnerResult = {
    ok: true,
    observedCampaigns: campaigns.length,
    startedCampaigns: 0,
    processedRecipients: 0,
    sentRecipients: 0,
    blockedRecipients: 0,
    failedRecipients: 0,
    skippedCampaigns: 0,
    campaignResults: [],
  };

  for (const campaign of campaigns) {
    const organizationId = String(campaign.organization_id);
    const campaignId = String(campaign.id);

    const [{ data: policyData, error: policyError }, { data: providerData, error: providerError }] =
      await Promise.all([
        admin
          .from('automation_messaging_policies')
          .select('policy_enabled')
          .eq('organization_id', organizationId)
          .eq('channel', 'whatsapp')
          .maybeSingle(),
        admin
          .from('automation_provider_send_settings')
          .select('provider_send_enabled,pilot_mode_enabled,pilot_lead_id,pilot_max_messages')
          .eq('organization_id', organizationId)
          .eq('channel', 'whatsapp')
          .eq('provider', 'meta_cloud_api')
          .maybeSingle(),
      ]);

    if (policyError || providerError) {
      result.ok = false;
      result.skippedCampaigns += 1;
      result.campaignResults.push({
        campaignId,
        organizationId,
        action: 'skipped',
        reason: 'safety_settings_unavailable',
      });
      continue;
    }

    const policy = (policyData ?? null) as PolicyRow | null;
    const provider = (providerData ?? null) as ProviderRow | null;

    // The runner never opens gates. A human/operator must configure both the
    // messaging policy and provider-send gate elsewhere before execution.
    if (policy?.policy_enabled !== true || provider?.provider_send_enabled !== true) {
      result.skippedCampaigns += 1;
      result.campaignResults.push({
        campaignId,
        organizationId,
        action: 'skipped',
        reason: policy?.policy_enabled !== true ? 'messaging_policy_disabled' : 'provider_send_disabled',
      });
      continue;
    }

    if (!campaign.approved_at || !campaign.approved_by) {
      result.skippedCampaigns += 1;
      result.campaignResults.push({
        campaignId,
        organizationId,
        action: 'skipped',
        reason: 'campaign_human_approval_required',
      });
      continue;
    }

    if (campaign.scheduled_at && Date.parse(campaign.scheduled_at) > now.getTime()) {
      result.skippedCampaigns += 1;
      result.campaignResults.push({
        campaignId,
        organizationId,
        action: 'skipped',
        reason: 'campaign_not_due',
      });
      continue;
    }

    const { data: openRecipientData, error: openRecipientError } = await admin
      .from('whatsapp_broadcast_recipients')
      .select('id,lead_id,status')
      .eq('organization_id', organizationId)
      .eq('campaign_id', campaignId)
      .in('status', ['eligible', 'queued'])
      .order('created_at', { ascending: true });

    if (openRecipientError) {
      result.ok = false;
      result.skippedCampaigns += 1;
      result.campaignResults.push({
        campaignId,
        organizationId,
        action: 'skipped',
        reason: 'recipient_snapshot_unavailable',
      });
      continue;
    }

    const openRecipients = (openRecipientData ?? []) as RecipientRow[];

    // Production currently uses pilot mode as a hard blast-radius limit. While
    // pilot mode is enabled, a broadcast is executable only when every open
    // recipient is exactly the allowlisted pilot lead and does not exceed the
    // configured pilot cap. The provider claim re-checks the same boundary.
    if (provider?.pilot_mode_enabled === true) {
      const pilotLeadId = provider.pilot_lead_id ? String(provider.pilot_lead_id) : null;
      const pilotMax = Math.max(0, Number(provider.pilot_max_messages ?? 0));
      const pilotScopeValid =
        Boolean(pilotLeadId) &&
        openRecipients.length > 0 &&
        openRecipients.length <= pilotMax &&
        openRecipients.every((recipient) => String(recipient.lead_id) === pilotLeadId);

      if (!pilotScopeValid) {
        result.skippedCampaigns += 1;
        result.campaignResults.push({
          campaignId,
          organizationId,
          action: 'skipped',
          reason: 'pilot_scope_mismatch',
        });
        continue;
      }
    }

    if (campaign.status !== 'running') {
      const { data: started, error: startError } = await admin
        .from('whatsapp_broadcast_campaigns')
        .update({
          status: 'running',
          execution_requested_at: nowIso,
          started_at: nowIso,
          completed_at: null,
        })
        .eq('organization_id', organizationId)
        .eq('id', campaignId)
        .in('status', ['approved', 'scheduled'])
        .not('approved_at', 'is', null)
        .not('approved_by', 'is', null)
        .select('id')
        .maybeSingle();

      if (startError || !started?.id) {
        result.ok = false;
        result.skippedCampaigns += 1;
        result.campaignResults.push({
          campaignId,
          organizationId,
          action: 'skipped',
          reason: 'campaign_start_transition_failed',
        });
        continue;
      }
      result.startedCampaigns += 1;
    }

    const recipients = openRecipients.slice(0, maxRecipientsPerCampaign);
    let processed = 0;
    let sent = 0;
    let blocked = 0;
    let failed = 0;

    for (const recipient of recipients) {
      processed += 1;
      result.processedRecipients += 1;

      const { data: prepareData, error: prepareError } = await admin.rpc(
        'prepare_whatsapp_broadcast_provider_send_v1',
        {
          p_organization_id: organizationId,
          p_campaign_id: campaignId,
          p_recipient_id: String(recipient.id),
          p_now: nowIso,
        },
      );

      if (prepareError) {
        failed += 1;
        result.failedRecipients += 1;
        result.ok = false;
        continue;
      }

      let prepared = record(prepareData);
      let auditId = stringValue(prepared.audit_id);
      let providerCallAllowed = booleanValue(prepared.provider_call_allowed);

      if (auditId && !providerCallAllowed && stringValue(prepared.status) === 'blocked') {
        const { data: rearmData, error: rearmError } = await admin.rpc(
          'rearm_whatsapp_broadcast_provider_send_v1',
          {
            p_organization_id: organizationId,
            p_audit_id: auditId,
            p_now: nowIso,
          },
        );

        if (!rearmError) {
          prepared = record(rearmData);
          providerCallAllowed = booleanValue(prepared.provider_call_allowed);
        }
      }

      if (!auditId || !providerCallAllowed) {
        blocked += 1;
        result.blockedRecipients += 1;
        continue;
      }

      try {
        const sendResult = await executePreparedWhatsAppProviderSend({
          organizationId,
          auditId,
        });

        if (sendResult.customerMessageSent) {
          sent += 1;
          result.sentRecipients += 1;
        } else if (sendResult.status === 'blocked') {
          blocked += 1;
          result.blockedRecipients += 1;
        } else if (!sendResult.ok) {
          failed += 1;
          result.failedRecipients += 1;
          result.ok = false;
        }
      } catch (error) {
        console.error('WHATSAPP_BROADCAST_RECIPIENT_EXECUTION_FAILED', {
          organizationId,
          campaignId,
          recipientId: recipient.id,
          error,
        });
        failed += 1;
        result.failedRecipients += 1;
        result.ok = false;
      }
    }

    const { error: refreshError } = await admin.rpc(
      'refresh_whatsapp_broadcast_campaign_counts_v1',
      {
        p_organization_id: organizationId,
        p_campaign_id: campaignId,
        p_now: new Date().toISOString(),
      },
    );

    if (refreshError) {
      result.ok = false;
      console.error('WHATSAPP_BROADCAST_COUNT_REFRESH_FAILED', {
        organizationId,
        campaignId,
        refreshError,
      });
    }

    result.campaignResults.push({
      campaignId,
      organizationId,
      action: 'processed',
      processed,
      sent,
      blocked,
      failed,
    });
  }

  return result;
}
