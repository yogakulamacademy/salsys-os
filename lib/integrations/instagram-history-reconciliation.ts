import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getInstagramRuntimeForOrganization } from '@/lib/integrations/instagram-connection';

// Official Conversations API only. Never scrape Instagram or send DMs.
// This API can omit inactive Requests chats and older messages.
const META_GRAPH_VERSION = 'v26.0';
const MAX_CONVERSATIONS_PER_PASS = 3;
const MAX_MESSAGES_PER_CONVERSATION = 20;
const GRAPH_TIMEOUT_MS = 7_000;

type Json = Record<string, unknown>;
type GraphPerson = { id?: string | null };
type GraphConversation = { id?: string; participants?: { data?: GraphPerson[] } | GraphPerson[] };
type GraphMessage = {
  id?: string;
  created_time?: string;
  from?: GraphPerson;
  to?: { data?: GraphPerson[] } | GraphPerson[];
  message?: string;
  attachments?: unknown;
};
type GraphPage<T> = {
  data?: T[];
  paging?: { next?: string; cursors?: { after?: string } };
  error?: { code?: number; message?: string };
};

export type InstagramHistorySyncSummary = {
  conversationsScanned: number;
  conversationsMatched: number;
  messagesSeen: number;
  /** Distinct outgoing provider MIDs in the bounded read-only sample. */
  outboundMessagesSeen: number;
  /** Distinct provider outbound MIDs present in the exact existing CRM thread. */
  outboundMessagesMatched: number;
  /** Provider outbound MIDs not present in that one sampled CRM thread. */
  outboundMessagesNotInCrm: number;
  messagesImported: number;
  messagesAlreadyPresent: number;
  messagesSkipped: number;
  hasMore: boolean;
  dryRun: boolean;
  customerMessageSent: false;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function object(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}
function participantsOf(conversation: GraphConversation): GraphPerson[] {
  const raw = conversation.participants;
  return Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
}

async function graphPage<T>(path: string, token: string, params: Record<string, string>): Promise<GraphPage<T>> {
  const url = new URL('https://graph.instagram.com/' + META_GRAPH_VERSION + '/' + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    cache: 'no-store',
    signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => ({})) as GraphPage<T>;
  if (!response.ok || !Array.isArray(payload.data)) {
    // Provider responses may include sensitive URLs; never echo their bodies.
    throw new Error('Instagram Conversations API unavailable (HTTP ' +
      response.status + ', code ' + (Number(payload.error?.code) || 0) + ').');
  }
  return payload;
}

/** Provider read-only check; does not subscribe, publish or send messages.
 *
 * Inspect only THIS OAuth application's subscription. A connected Instagram
 * account may have other Meta applications registered; merging all returned
 * subscribed_fields would falsely attribute their message_echoes to SalsysOS.
 */
export async function inspectInstagramEchoSubscription(
  organizationId: string,
  accountId: string,
): Promise<{ subscribed: boolean; fields: string[]; customerMessageSent: false }> {
  const configuredAppId = process.env.INSTAGRAM_APP_ID?.trim() ?? '';
  if (!/^[0-9]{4,30}$/.test(configuredAppId)) {
    throw new Error('Instagram app configuration is unavailable.');
  }

  const runtime = await getInstagramRuntimeForOrganization(organizationId, accountId);
  const response = await fetch('https://graph.instagram.com/' + META_GRAPH_VERSION + '/me/subscribed_apps', {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + runtime.accessToken },
    cache: 'no-store',
    signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
  });
  if (!response.ok) {
    // Non-success is UNKNOWN, never imply an unsubscribed account.
    throw new Error('Meta did not provide Instagram webhook subscription status.');
  }

  const payload = await response.json().catch(() => ({})) as { data?: unknown };
  if (!Array.isArray(payload.data) || payload.data.length > 50) {
    throw new Error('Meta returned an invalid Instagram webhook subscription response.');
  }

  const matching: Json[] = [];
  for (const item of payload.data) {
    const subscription = object(item);
    // Meta has returned application IDs both directly and as application.id.
    const direct = subscription.id;
    const nested = object(subscription.application).id;
    const directId = typeof direct === 'string' || typeof direct === 'number'
      ? String(direct).trim() : '';
    const nestedId = typeof nested === 'string' || typeof nested === 'number'
      ? String(nested).trim() : '';
    if ((directId && nestedId && directId !== nestedId) ||
        !/^[0-9]{4,30}$/.test(directId || nestedId)) {
      // Without a trustworthy app identity, never credit another app's fields.
      throw new Error('Meta subscription application identity is unavailable.');
    }
    if ((directId || nestedId) === configuredAppId) matching.push(subscription);
  }

  if (matching.length > 1) {
    throw new Error('Meta returned ambiguous Instagram app subscriptions.');
  }
  if (matching.length === 0) {
    if (payload.data.length > 0) {
      // Product variants may return a different identifier kind. Do not treat
      // unknown identities or another app's fields as evidence of OUR status.
      throw new Error('Meta did not identify the configured Instagram app.');
    }
    // A verified empty subscription list contains no subscribed applications.
    return { subscribed: false, fields: [], customerMessageSent: false };
  }

  const values = matching[0].subscribed_fields;
  if (!Array.isArray(values) || values.length > 40 ||
      !values.every(value => typeof value === 'string' && /^[a-z_]{2,50}$/.test(value))) {
    throw new Error('Meta returned invalid Instagram webhook subscription fields.');
  }
  const fields = Array.from(new Set(values as string[])).sort();
  return { subscribed: fields.includes('message_echoes'), fields, customerMessageSent: false };
}

/**
 * Bounded and resumable per connected account.
 * Preview is read-only. The apply path imports only into EXISTING
 * conversations, never creates leads or triggers sales automations.
 */
export async function reconcileInstagramMessageHistory({
  organizationId, accountId, apply,
}: {
  organizationId: string;
  accountId: string;
  apply: boolean;
}): Promise<InstagramHistorySyncSummary> {
  if (!/^[0-9]{4,30}$/.test(accountId) || !/^[0-9a-f-]{36}$/i.test(organizationId)) {
    throw new Error('Invalid workspace or Instagram account identifier.');
  }

  const admin = createAdminClient();
  const runtime = await getInstagramRuntimeForOrganization(organizationId, accountId);
  const { data: state, error: stateError } = await admin
    .from('instagram_history_sync_cursor_v1')
    .select('next_cursor,completed_cycles,conversations_scanned,messages_imported,messages_already_present')
    .eq('organization_id', organizationId)
    .eq('instagram_account_id', accountId)
    .maybeSingle();
  if (stateError) throw new Error('Instagram history sync state is unavailable.');

  const params: Record<string, string> = {
    fields: 'id,participants,updated_time',
    limit: String(apply ? MAX_CONVERSATIONS_PER_PASS : 1),
  };
  if (apply && text(state?.next_cursor)) params.after = text(state?.next_cursor);

  const conversations = await graphPage<GraphConversation>(
    encodeURIComponent(accountId) + '/conversations', runtime.accessToken, params,
  );
  const summary: InstagramHistorySyncSummary = {
    conversationsScanned: 0,
    conversationsMatched: 0,
    messagesSeen: 0,
    outboundMessagesSeen: 0,
    outboundMessagesMatched: 0,
    outboundMessagesNotInCrm: 0,
    messagesImported: 0,
    messagesAlreadyPresent: 0,
    messagesSkipped: 0,
    hasMore: Boolean(conversations.paging?.next && conversations.paging?.cursors?.after),
    dryRun: !apply,
    customerMessageSent: false,
  };

  for (const providerConversation of conversations.data ?? []) {
    const graphConversationId = text(providerConversation.id);
    if (!/^[A-Za-z0-9_:-]{4,160}$/.test(graphConversationId)) {
      summary.messagesSkipped += 1;
      continue;
    }
    summary.conversationsScanned += 1;
    const users = participantsOf(providerConversation)
      .map(person => text(person.id)).filter(id => id && id !== accountId);
    if (users.length !== 1 || !/^[0-9]{4,40}$/.test(users[0] ?? '')) {
      summary.messagesSkipped += 1;
      continue;
    }
    const instagramUserId = users[0] as string;

    const { data: matching, error: matchError } = await admin.from('conversations')
      .select('id,lead_id')
      .eq('organization_id', organizationId)
      .eq('channel', 'instagram')
      .eq('external_account_id', accountId)
      .eq('external_conversation_id', accountId + ':' + instagramUserId)
      .limit(2);
    if (matchError) throw new Error('Instagram CRM identity check failed.');
    if (!matching || matching.length !== 1) {
      // Never invent a lead or import a conversation we cannot identify.
      summary.messagesSkipped += 1;
      continue;
    }
    summary.conversationsMatched += 1;

    const providerMessages = await graphPage<GraphMessage>(
      encodeURIComponent(graphConversationId) + '/messages', runtime.accessToken,
      { fields: 'id,created_time,from,to,message,attachments', limit: String(MAX_MESSAGES_PER_CONVERSATION) },
    );
    // The read-only inspection is intentionally bounded: do not silently
    // process or summarize more than the configured provider message page.
    if (!apply && (providerMessages.data ?? []).length > MAX_MESSAGES_PER_CONVERSATION) {
      throw new Error('Instagram history preview exceeded its message limit.');
    }
    const previewOutboundIds = new Set<string>();
    for (const providerMessage of providerMessages.data ?? []) {
      summary.messagesSeen += 1;
      const id = text(providerMessage.id);
      const sender = text(providerMessage.from?.id);
      const timestamp = text(providerMessage.created_time);
      if (!id || !sender || (sender !== accountId && sender !== instagramUserId) ||
        !timestamp || !Number.isFinite(Date.parse(timestamp))) {
        summary.messagesSkipped += 1;
        continue;
      }
      // Verify Meta's recipient when available, never invert sender direction.
      const rawTo = providerMessage.to;
      const recipients = (Array.isArray(rawTo) ? rawTo : Array.isArray(rawTo?.data) ? rawTo.data : [])
        .map(recipient => text(recipient.id));
      const expectedRecipient = sender === accountId ? instagramUserId : accountId;
      if (recipients.length && !recipients.includes(expectedRecipient)) {
        summary.messagesSkipped += 1;
        continue;
      }
      if (!apply && sender === accountId) previewOutboundIds.add(id);
      if (!apply) continue;

      const direction = sender === accountId ? 'outbound' : 'inbound';
      const { data: ingestion, error: ingestError } = await admin.rpc('ingest_raw_event', {
        p_organization_id: organizationId,
        p_source_system: 'instagram',
        p_source_event_id: 'history:' + id,
        p_source_event_type: 'history:' + direction,
        p_ingestion_method: 'instagram_graph_conversations',
        p_occurred_at: new Date(timestamp).toISOString(),
        p_source_account_id: accountId,
        p_source_subject_id: instagramUserId,
        p_anonymous_visitor_id: null,
        p_session_key: null,
        p_external_message_id: id,
        p_site: null,
        p_payload: { history_message: providerMessage, graph_conversation_id: graphConversationId },
        p_context: { provider_api: 'instagram_conversations', direction },
        p_metadata: { adapter: 'instagram_history_reconciliation_v1' },
        p_schema_version: 1,
      });
      if (ingestError) throw new Error('Failed to persist Instagram history evidence.');
      const rawId = text(object(ingestion).event_id);
      if (!rawId) throw new Error('Instagram history receipt did not return a raw event ID.');
      const { data: projected, error: projectionError } = await admin.rpc(
        'ingest_instagram_history_message_v1', { p_raw_event_id: rawId },
      );
      if (projectionError || object(projected).ok !== true) {
        throw new Error('Failed to reconcile Instagram history into the CRM.');
      }
      const result = object(projected);
      if (result.deferred === true) summary.messagesSkipped += 1;
      else if (result.imported === true) summary.messagesImported += 1;
      else if (result.duplicate_message === true) summary.messagesAlreadyPresent += 1;
    }

    if (!apply && previewOutboundIds.size > 0) {
      // Provider history can show an outbound native-app message even when
      // webhook echoes have never been delivered. Compare real provider MIDs
      // against ONLY this previously identity-verified tenant CRM thread.
      // Return aggregate counts only: never pass provider IDs to the client.
      const { data: existing, error: lookupError } = await admin.from('messages')
        .select('external_message_id')
        .eq('organization_id', organizationId)
        .eq('conversation_id', matching[0].id)
        .eq('direction', 'outbound')
        .in('external_message_id', Array.from(previewOutboundIds))
        .limit(MAX_MESSAGES_PER_CONVERSATION * MAX_MESSAGES_PER_CONVERSATION + 1);
      if (lookupError || !Array.isArray(existing) ||
          existing.length > MAX_MESSAGES_PER_CONVERSATION * MAX_MESSAGES_PER_CONVERSATION) {
        throw new Error('Instagram outbound history preview CRM evidence unavailable.');
      }
      const matched = new Set(existing
        .map(row => text(row.external_message_id))
        .filter(mid => previewOutboundIds.has(mid)));
      summary.outboundMessagesSeen += previewOutboundIds.size;
      summary.outboundMessagesMatched += matched.size;
      summary.outboundMessagesNotInCrm += previewOutboundIds.size - matched.size;
    }
  }

  if (apply) {
    const nextCursor = summary.hasMore ? text(conversations.paging?.cursors?.after) : null;
    const now = new Date().toISOString();
    const { error: progressError } = await admin.from('instagram_history_sync_cursor_v1')
      .upsert({
        organization_id: organizationId,
        instagram_account_id: accountId,
        next_cursor: nextCursor,
        completed_cycles: Number(state?.completed_cycles || 0) + (nextCursor ? 0 : 1),
        conversations_scanned: Number(state?.conversations_scanned || 0) + summary.conversationsScanned,
        messages_imported: Number(state?.messages_imported || 0) + summary.messagesImported,
        messages_already_present: Number(state?.messages_already_present || 0) + summary.messagesAlreadyPresent,
        last_scanned_at: now,
        last_error: null,
        updated_at: now,
      }, { onConflict: 'organization_id,instagram_account_id' });
    if (progressError) throw new Error('Instagram scan succeeded but saving its cursor failed.');
  }
  return summary;
}
