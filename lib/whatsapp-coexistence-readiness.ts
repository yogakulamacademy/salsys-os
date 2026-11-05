import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContextForUser } from '@/lib/workspace';
import { isMockMode } from '@/lib/data';

export type WhatsAppCoexistenceReadiness = {
  checkedAt: string;
  connectedAccounts: number;
  recordedCoexistenceAccounts: number;
  recordedCloudApiAccounts: number;
  unknownOnboardingAccounts: number;
  linkedActiveSenders: number;
  signedBusinessAppEchoWebhooks: number;
  signedBusinessAppEchoChildren: number;
  failedWebhookEvents: number;
  deadLetterWebhookEvents: number;
  failedLast7Days: number;
  failedIncomingText: number;
  failedIncomingImages: number;
  failedUnsupportedMessages: number;
  failedDeliveryStatuses: number;
  failedOtherTypes: number;
};

type Connection = {
  id: string;
  provider_metadata: Record<string, unknown> | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function onboardingMode(metadata: Record<string, unknown> | null) {
  if (metadata?.is_on_biz_app === true || metadata?.onboarding_mode === 'coexistence') {
    return 'coexistence';
  }
  if (metadata?.is_on_biz_app === false || metadata?.onboarding_mode === 'cloud_api') {
    return 'cloud_api';
  }
  return 'unknown';
}

function validCount(value: number | null, error: unknown) {
  if (error || typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('WhatsApp synchronization evidence is temporarily unavailable.');
  }
  return value;
}

/**
 * Read-only tenant evidence from existing WhatsApp integration metadata and
 * signed legacy webhook receipts. No provider calls, webhook payloads,
 * message bodies, phone numbers or customer identifiers leave this server.
 *
 * Onboarding metadata is a claim about setup, not proof of provider
 * coexistence; zero echo rows mean no observed echoes, NOT a failed sync.
 */
export async function getCurrentWhatsAppCoexistenceReadiness():
  Promise<WhatsAppCoexistenceReadiness | null> {
  if (isMockMode()) return null;

  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user?.id) return null;

  const { data: profile, error: profileError } = await session.from('profiles')
    .select('active').eq('id', user.id).maybeSingle();
  if (profileError || profile?.active !== true) return null;

  const workspace = await getWorkspaceContextForUser(session, user.id);
  const active = workspace.activeWorkspace;
  if (!active || !['owner', 'admin'].includes(active.role) ||
      workspace.activeOrganizationId !== active.organizationId ||
      !workspace.memberships.some(member =>
        member.organizationId === active.organizationId && member.role === active.role)) {
    return null;
  }

  const admin = createAdminClient();
  const organizationId = active.organizationId;
  const { data: connectionRows, error: connectionError } = await admin
    .from('integration_connections')
    .select('id,provider_metadata')
    .eq('organization_id', organizationId)
    .eq('provider', 'whatsapp')
    .eq('status', 'connected')
    .limit(10);
  if (connectionError || !Array.isArray(connectionRows) || connectionRows.length > 10) {
    throw new Error('WhatsApp synchronization evidence is temporarily unavailable.');
  }
  const connections = connectionRows as Connection[];
  if (connections.some(connection => !UUID.test(connection.id))) {
    throw new Error('WhatsApp synchronization evidence contains invalid connections.');
  }
  const connectedIds = new Set(connections.map(connection => connection.id));

  const { data: senderRows, error: senderError } = await admin
    .from('whatsapp_accounts')
    .select('connection_id')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .limit(50);
  if (senderError || !Array.isArray(senderRows) || senderRows.length >= 50) {
    throw new Error('WhatsApp sender inventory is temporarily unavailable.');
  }
  const linkedActiveSenders = senderRows.filter(sender =>
    typeof sender.connection_id === 'string' && connectedIds.has(sender.connection_id)).length;

  // Exact, tenant-filtered, count-only queries. No event rows are returned.
  const receiptCount = async (
    field: 'event_type' | 'processing_status',
    value: string,
    signed = false,
    prefix = false,
  ) => {
    let query = admin.from('whatsapp_webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
    query = prefix ? query.like(field, value) : query.eq(field, value);
    if (signed) query = query.eq('signature_valid', true);
    const { count, error } = await query;
    return validCount(count, error);
  };
  const [signedBusinessAppEchoWebhooks, signedBusinessAppEchoChildren,
    failedWebhookEvents, deadLetterWebhookEvents] = await Promise.all([
    receiptCount('event_type', 'smb_message_echoes', true),
    receiptCount('event_type', 'echo:%', true, true),
    receiptCount('processing_status', 'failed'),
    receiptCount('processing_status', 'dead_letter'),
  ]);

  // Triage only fixed, bounded provider event types with aggregate HEAD counts.
  // Do not fetch processing_error, message payloads, customer IDs or event rows.
  const failedTypeCount = async (eventType: string) => {
    const { count, error } = await admin.from('whatsapp_webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('processing_status', 'failed')
      .eq('event_type', eventType);
    return validCount(count, error);
  };
  const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [failedLast7Days, failedIncomingText, failedIncomingImages,
    failedUnsupportedMessages, failedStatusSent, failedStatusDelivered] = await Promise.all([
    (async () => {
      const { count, error } = await admin.from('whatsapp_webhook_events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('processing_status', 'failed')
        .gte('received_at', last7Days);
      return validCount(count, error);
    })(),
    failedTypeCount('message:text'),
    failedTypeCount('message:image'),
    failedTypeCount('message:unsupported'),
    failedTypeCount('status:sent'),
    failedTypeCount('status:delivered'),
  ]);
  const failedDeliveryStatuses = failedStatusSent + failedStatusDelivered;
  const classified = failedIncomingText + failedIncomingImages +
    failedUnsupportedMessages + failedDeliveryStatuses;
  if (classified > failedWebhookEvents || failedLast7Days > failedWebhookEvents) {
    throw new Error('WhatsApp failure category counts are inconsistent.');
  }

  const modes = connections.map(connection => onboardingMode(connection.provider_metadata));
  return {
    checkedAt: new Date().toISOString(),
    connectedAccounts: connections.length,
    recordedCoexistenceAccounts: modes.filter(mode => mode === 'coexistence').length,
    recordedCloudApiAccounts: modes.filter(mode => mode === 'cloud_api').length,
    unknownOnboardingAccounts: modes.filter(mode => mode === 'unknown').length,
    linkedActiveSenders,
    signedBusinessAppEchoWebhooks,
    signedBusinessAppEchoChildren,
    failedWebhookEvents,
    deadLetterWebhookEvents,
    failedLast7Days,
    failedIncomingText,
    failedIncomingImages,
    failedUnsupportedMessages,
    failedDeliveryStatuses,
    failedOtherTypes: failedWebhookEvents - classified,
  };
}
