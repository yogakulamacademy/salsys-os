import 'server-only';

import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;

export type MessageSeenActivityReadiness = {
  checkedAt: string;
  whatsappThreadsChecked: number;
  confirmedReadMessages: number;
  eligibleProviderReadMessages: number;
  activityMatchedMessages: number;
  eligibleWithoutActivity: number;
  readMessagesWithoutProviderId: number;
};

const MAX_PER_READ = 250;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function metadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
function checkedRows(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > MAX_PER_READ ||
      value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error(`Message seen ${label} evidence is unavailable or exceeds the bounded window.`);
  }
  return value as Record<string, unknown>[];
}

/**
 * Read-only preview. Caller MUST authenticate an active owner/admin and exact
 * active workspace before supplying the service-role client.
 * All tenant-aware queries repeat that organization ID. The legacy
 * activities table is lead-keyed; its lead IDs come only from the already
 * tenant-verified outbound messages, never from caller input.
 *
 * A bounded result is required: large or malformed datasets return
 * "unavailable" rather than a misleading zero or percentage.
 */
export async function readMessageSeenActivityReadiness(
  admin: Admin,
  organizationId: string,
): Promise<MessageSeenActivityReadiness> {
  if (!validId(organizationId)) throw new Error('Invalid active organization.');

  const { data: rawThreads, error: threadsError } = await admin
    .from('conversations').select('id')
    .eq('organization_id', organizationId)
    .eq('channel', 'whatsapp')
    .limit(MAX_PER_READ + 1);
  if (threadsError) throw new Error('Message seen conversation inventory is unavailable.');
  const threads = checkedRows(rawThreads, 'conversations');
  if (threads.some(row => !validId(row.id)) ||
      new Set(threads.map(row => row.id)).size !== threads.length) {
    throw new Error('Message seen conversation identities are invalid.');
  }

  const empty: MessageSeenActivityReadiness = {
    checkedAt: new Date().toISOString(),
    whatsappThreadsChecked: threads.length,
    confirmedReadMessages: 0,
    eligibleProviderReadMessages: 0,
    activityMatchedMessages: 0,
    eligibleWithoutActivity: 0,
    readMessagesWithoutProviderId: 0,
  };
  if (threads.length === 0) return empty;

  const { data: rawMessages, error: messagesError } = await admin.from('messages')
    .select('id,lead_id,conversation_id,read_at,external_message_id')
    .eq('organization_id', organizationId)
    .eq('direction', 'outbound')
    .in('conversation_id', threads.map(row => row.id as string))
    .not('read_at', 'is', null)
    .limit(MAX_PER_READ + 1);
  if (messagesError) throw new Error('Message seen outbound inventory is unavailable.');
  const messages = checkedRows(rawMessages, 'read messages');
  const threadIds = new Set(threads.map(row => row.id));
  const messageIds = new Set<string>();
  for (const row of messages) {
    if (!validId(row.id) || !validId(row.lead_id) ||
        !validId(row.conversation_id) || !threadIds.has(row.conversation_id) ||
        typeof row.read_at !== 'string' || !Number.isFinite(Date.parse(row.read_at)) ||
        messageIds.has(row.id)) {
      throw new Error('Message seen evidence contains invalid or duplicated message identities.');
    }
    messageIds.add(row.id);
  }

  const eligible = messages.filter(row =>
    typeof row.external_message_id === 'string' &&
    row.external_message_id.trim().length > 0);
  const leadIds = [...new Set(eligible.map(row => row.lead_id as string))];
  if (leadIds.length === 0) {
    return {
      ...empty,
      confirmedReadMessages: messages.length,
      readMessagesWithoutProviderId: messages.length,
    };
  }

  const { data: rawActivities, error: activitiesError } = await admin.from('activities')
    .select('id,lead_id,metadata')
    .eq('activity_type', 'message_seen')
    .in('lead_id', leadIds)
    .limit(MAX_PER_READ + 1);
  if (activitiesError) throw new Error('Message seen activity evidence is unavailable.');
  const activities = checkedRows(rawActivities, 'activities');

  // Validate evidence against the exact tenant-bound outbound message and
  // message-specific provider-confirmed read timestamp. A manually inserted
  // activity or a mismatched lead/conversation never counts as coverage.
  const covered = new Set<string>();
  const eligibleById = new Map(eligible.map(row => [row.id as string, row]));
  for (const activity of activities) {
    const info = metadata(activity.metadata);
    const messageId = info.message_id;
    if (typeof messageId !== 'string') continue;
    const message = eligibleById.get(messageId);
    if (!message) continue;
    if (info.source !== 'verified_whatsapp_read_status' ||
        info.confidence !== 'exact_provider_message_id' ||
        info.conversation_id !== message.conversation_id ||
        activity.lead_id !== message.lead_id ||
        !validId(activity.id)) continue;
    covered.add(messageId);
  }

  return {
    checkedAt: new Date().toISOString(),
    whatsappThreadsChecked: threads.length,
    confirmedReadMessages: messages.length,
    eligibleProviderReadMessages: eligible.length,
    activityMatchedMessages: covered.size,
    eligibleWithoutActivity: eligible.length - covered.size,
    readMessagesWithoutProviderId: messages.length - eligible.length,
  };
}
