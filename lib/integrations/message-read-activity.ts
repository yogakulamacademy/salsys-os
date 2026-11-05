import crypto from 'crypto';

import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

type InstagramReadEvidence = {
  accountId: string;
  customerId: string;
  occurredAt: string;
};

/**
 * RFC 9562 UUIDv8-like deterministic evidence key from a SHA-256 digest.
 * The same provider receipt cannot create another activity on webhook retry.
 * No customer/provider identifiers are exposed through the activity ID.
 */
function activityId(parts: string[]) {
  const bytes = crypto.createHash('sha256')
    .update(JSON.stringify(['message-read-activity-v1', ...parts]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

async function persistActivity(admin: Admin, activity: Record<string, unknown>) {
  // The deterministic primary key and DO NOTHING make repeated provider
  // deliveries safe even if independent webhook requests race.
  const { error } = await admin.from('activities').upsert(activity, {
    onConflict: 'id',
    ignoreDuplicates: true,
  });
  if (error) throw new Error('Message read activity could not be recorded.');
}

/**
 * Only a Meta-signed WhatsApp status=read event, already applied to an
 * existing outbound message, may reach this function.
 * Never manufacture a read activity from a staff inbox view.
 */
export async function recordWhatsappMessageSeenActivity(
  admin: Admin,
  input: { organizationId: string; providerMessageId: string },
) {
  const org = text(input.organizationId);
  const mid = text(input.providerMessageId);
  if (!org || !mid) throw new Error('Missing WhatsApp read receipt identity.');

  const { data: messages, error: messageError } = await admin.from('messages')
    .select('id,lead_id,conversation_id,read_at')
    .eq('organization_id', org)
    .eq('external_message_id', mid)
    .eq('direction', 'outbound')
    .limit(2);
  if (messageError || !Array.isArray(messages) || messages.length !== 1) {
    throw new Error('WhatsApp read receipt message identity unavailable.');
  }
  const message = messages[0];
  const messageId = text(message.id);
  const leadId = text(message.lead_id);
  const conversationId = text(message.conversation_id);
  const readAt = text(message.read_at);
  if (!messageId || !leadId || !conversationId || !readAt ||
      Number.isNaN(Date.parse(readAt))) {
    throw new Error('WhatsApp read receipt has no confirmed CRM read timestamp.');
  }

  const { data: conversations, error: conversationError } = await admin.from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('organization_id', org)
    .eq('lead_id', leadId)
    .eq('channel', 'whatsapp')
    .limit(2);
  if (conversationError || !Array.isArray(conversations) ||
      conversations.length !== 1) {
    throw new Error('WhatsApp read receipt conversation identity unavailable.');
  }

  await persistActivity(admin, {
    id: activityId(['whatsapp', org, messageId]),
    lead_id: leadId,
    activity_type: 'message_seen',
    channel: 'whatsapp',
    actor_type: 'system',
    actor_id: 'whatsapp_provider_status',
    title: 'WhatsApp message seen',
    details: 'WhatsApp confirmed that the recipient read an outbound message. This is not a reply.',
    occurred_at: readAt,
    metadata: {
      source: 'verified_whatsapp_read_status',
      message_id: messageId,
      conversation_id: conversationId,
      confidence: 'exact_provider_message_id',
    },
  });
  return { acknowledged: true };
}

/**
 * Instagram's `read.watermark` is conversation-level evidence, not an
 * identified outbound message MID. Never label this as one message seen.
 */
export async function recordInstagramConversationReadActivity(
  admin: Admin,
  input: InstagramReadEvidence,
) {
  const accountId = text(input.accountId);
  const customerId = text(input.customerId);
  const occurredAt = text(input.occurredAt);
  if (!accountId || !customerId || accountId === customerId ||
      !occurredAt || Number.isNaN(Date.parse(occurredAt))) {
    return { acknowledged: false, reason: 'invalid_evidence' };
  }

  // Fail closed on an account connected to two organizations.
  const { data: links, error: linkError } = await admin.from('integration_connections')
    .select('organization_id')
    .eq('provider', 'instagram')
    .eq('status', 'connected')
    .eq('external_account_id', accountId)
    .limit(2);
  if (linkError || !Array.isArray(links)) {
    throw new Error('Instagram read receipt account lookup unavailable.');
  }
  if (links.length !== 1 || !text(links[0].organization_id)) {
    return { acknowledged: false, reason: 'unmapped_or_ambiguous_account' };
  }

  const organizationId = text(links[0].organization_id);
  const { data: threads, error: threadError } = await admin.from('conversations')
    .select('id,lead_id')
    .eq('organization_id', organizationId)
    .eq('channel', 'instagram')
    .eq('external_account_id', accountId)
    .eq('external_conversation_id', accountId + ':' + customerId)
    .limit(2);
  if (threadError || !Array.isArray(threads)) {
    throw new Error('Instagram read receipt thread lookup unavailable.');
  }
  if (threads.length !== 1 || !text(threads[0].id) || !text(threads[0].lead_id)) {
    return { acknowledged: false, reason: 'unmapped_or_ambiguous_thread' };
  }

  const conversationId = text(threads[0].id);
  const leadId = text(threads[0].lead_id);
  await persistActivity(admin, {
    id: activityId(['instagram', organizationId, accountId, customerId, occurredAt]),
    lead_id: leadId,
    activity_type: 'conversation_read_observed',
    channel: 'instagram',
    actor_type: 'system',
    actor_id: 'instagram_signed_webhook',
    title: 'Instagram conversation read receipt',
    details: 'Meta reported a conversation-level read watermark. A specific message view or reply is not verified.',
    occurred_at: occurredAt,
    metadata: {
      source: 'signed_instagram_read_watermark',
      conversation_id: conversationId,
      confidence: 'conversation_watermark_only',
    },
  });
  return { acknowledged: true };
}
