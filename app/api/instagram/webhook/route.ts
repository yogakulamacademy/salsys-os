import crypto from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  queueInstagramCommentAutomation,
  queueInstagramDmAutomation,
} from '@/lib/automation/instagram-operations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_META_WEBHOOK_BYTES = 4 * 1024 * 1024;

type JsonObject = Record<string, unknown>;

type InstagramInboundEvent = {
  accountId: string;
  senderId: string;
  recipientId: string;
  messageId: string;
  messageType: string;
  body: string | null;
  occurredAt: string | null;
  raw: JsonObject;
};

type InstagramCommentEvent = {
  accountId: string;
  commentId: string;
  mediaId: string | null;
  authorId: string | null;
  authorUsername: string | null;
  body: string | null;
  occurredAt: string;
  raw: JsonObject;
};

class WebhookRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function declaredContentLength(request: NextRequest) {
  const header = request.headers.get('content-length');
  if (!header) return null;
  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function readBoundedRawBody(request: NextRequest, maxBytes: number) {
  const declared = declaredContentLength(request);
  if (declared !== null && declared > maxBytes) {
    throw new WebhookRequestError('Webhook payload too large', 413);
  }
  if (!request.body) {
    throw new WebhookRequestError('Invalid webhook payload', 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new WebhookRequestError('Webhook payload too large', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');
  const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN?.trim();

  if (mode === 'subscribe' && verifyToken && token === verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return NextResponse.json(
    { ok: false, error: 'Webhook verification failed' },
    { status: 403 },
  );
}

export async function POST(request: NextRequest) {
  try {
    /* Meta signs the exact raw request bytes. Verify before JSON parsing. */
    const rawBytes = await readBoundedRawBody(request, MAX_META_WEBHOOK_BYTES);
    const signatureHeader = request.headers.get('x-hub-signature-256');
    const appSecret = requireEnv('INSTAGRAM_APP_SECRET');

    if (!signatureHeader) {
      return NextResponse.json(
        { ok: false, error: 'Missing webhook signature' },
        { status: 401 },
      );
    }

    if (!verifyMetaSignature(rawBytes, signatureHeader, appSecret)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid webhook signature' },
        { status: 401 },
      );
    }

    let payload: JsonObject;
    try {
      payload = JSON.parse(rawBytes.toString('utf8')) as JsonObject;
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON payload' },
        { status: 400 },
      );
    }

    if (stringValue(payload.object) !== 'instagram') {
      return NextResponse.json(
        { ok: true, ignored: true, reason: 'unsupported_object' },
        { status: 200 },
      );
    }

    const messages = extractInstagramInboundEvents(payload);
    const comments = extractInstagramCommentEvents(payload);

    if (!messages.length && !comments.length) {
      return NextResponse.json(
        {
          ok: true,
          received: true,
          processed: 0,
          ignored: true,
          reason: 'no_supported_instagram_events',
        },
        { status: 200 },
      );
    }

    const supabase = createAdminClient();
    const organizationCache = new Map<string, string | null>();

    let processed = 0;
    let commentsProcessed = 0;
    let alreadyProcessed = 0;
    let duplicateMessages = 0;
    let unknownAccounts = 0;
    let rawEventsCreated = 0;
    let automationsQueued = 0;
    let automationErrors = 0;

    const resolveOrganization = async (accountId: string) => {
      if (organizationCache.has(accountId)) {
        return organizationCache.get(accountId) ?? null;
      }

      const { data: connection, error } = await supabase
        .from('integration_connections')
        .select('organization_id')
        .eq('provider', 'instagram')
        .eq('status', 'connected')
        .eq('external_account_id', accountId)
        .maybeSingle();

      if (error) throw error;
      const organizationId = stringValue(connection?.organization_id) || null;
      organizationCache.set(accountId, organizationId);
      return organizationId;
    };

    for (const event of messages) {
      const organizationId = await resolveOrganization(event.accountId);

      if (!organizationId) {
        unknownAccounts += 1;
        console.warn('Ignoring Instagram webhook for unmapped account.', {
          instagramAccountId: event.accountId,
        });
        continue;
      }

      const sourceEventId = `message:${event.messageId}`;
      const { data: rawIngestData, error: rawIngestError } = await supabase.rpc(
        'ingest_raw_event',
        {
          p_organization_id: organizationId,
          p_source_system: 'instagram',
          p_source_event_id: sourceEventId,
          p_source_event_type: `message:${event.messageType}`,
          p_ingestion_method: 'instagram_webhook',
          p_occurred_at: event.occurredAt,
          p_source_account_id: event.accountId,
          p_source_subject_id: event.senderId,
          p_anonymous_visitor_id: null,
          p_session_key: null,
          p_external_message_id: event.messageId,
          p_site: null,
          p_payload: event.raw,
          p_context: {
            object_type: 'instagram',
            recipient_id: event.recipientId,
            signature_valid: true,
          },
          p_metadata: { adapter: 'app/api/instagram/webhook' },
          p_schema_version: 1,
        },
      );

      if (rawIngestError) throw rawIngestError;
      const rawResult = objectValue(rawIngestData);
      const rawEventId = stringValue(rawResult.event_id);
      if (!rawEventId) {
        throw new Error(`Instagram raw event could not be resolved for message ${event.messageId}.`);
      }
      if (rawResult.created === true) rawEventsCreated += 1;

      const { data: crmData, error: crmError } = await supabase.rpc(
        'ingest_instagram_dm_event',
        {
          p_raw_event_id: rawEventId,
          p_sender_username: null,
          p_message_type: event.messageType,
          p_body: event.body,
          p_message_at: event.occurredAt,
        },
      );

      if (crmError) throw crmError;
      const crmResult = objectValue(crmData);
      if (crmResult.ok !== true) {
        throw new Error(
          stringValue(crmResult.error) ||
            `Instagram CRM ingestion failed for message ${event.messageId}.`,
        );
      }

      if (crmResult.already_processed === true) {
        alreadyProcessed += 1;
        continue;
      }
      if (crmResult.duplicate_message === true) {
        duplicateMessages += 1;
        continue;
      }

      if (crmResult.processed === true) {
        processed += 1;
        const leadId = stringValue(crmResult.lead_id);
        const conversationId = stringValue(crmResult.conversation_id);
        const instagramUserId = stringValue(crmResult.instagram_user_id) || event.senderId;

        if (leadId && conversationId && instagramUserId) {
          try {
            await supabase.rpc('reconcile_instagram_private_reply_lead_v1', {
              p_organization_id: organizationId,
              p_instagram_account_id: event.accountId,
              p_instagram_user_id: instagramUserId,
              p_lead_id: leadId,
              p_conversation_id: conversationId,
            });
          } catch (error) {
            console.error('Instagram private-reply reconciliation failed.', error);
          }

          try {
            const automation = await queueInstagramDmAutomation({
              organizationId,
              rawEventId,
              sourceEventId,
              leadId,
              conversationId,
              instagramAccountId: event.accountId,
              instagramUserId,
              messageType: event.messageType,
              body: event.body,
            });
            if (automation.queued) automationsQueued += 1;
          } catch (error) {
            automationErrors += 1;
            console.error('Instagram DM automation queue failed.', error);
          }
        }
      }
    }

    for (const event of comments) {
      const organizationId = await resolveOrganization(event.accountId);
      if (!organizationId) {
        unknownAccounts += 1;
        continue;
      }

      const sourceEventId = `comment:${event.commentId}`;
      const { data: rawIngestData, error: rawIngestError } = await supabase.rpc(
        'ingest_raw_event',
        {
          p_organization_id: organizationId,
          p_source_system: 'instagram',
          p_source_event_id: sourceEventId,
          p_source_event_type: 'comment',
          p_ingestion_method: 'instagram_webhook',
          p_occurred_at: event.occurredAt,
          p_source_account_id: event.accountId,
          p_source_subject_id: event.authorId,
          p_anonymous_visitor_id: null,
          p_session_key: null,
          p_external_message_id: null,
          p_site: null,
          p_payload: event.raw,
          p_context: {
            object_type: 'instagram',
            webhook_field: 'comments',
            signature_valid: true,
          },
          p_metadata: { adapter: 'app/api/instagram/webhook' },
          p_schema_version: 1,
        },
      );

      if (rawIngestError) throw rawIngestError;
      const rawResult = objectValue(rawIngestData);
      const rawEventId = stringValue(rawResult.event_id);
      if (!rawEventId) {
        throw new Error(`Instagram raw event could not be resolved for comment ${event.commentId}.`);
      }
      if (rawResult.created === true) rawEventsCreated += 1;

      const { error: commentError } = await supabase
        .from('instagram_comment_events')
        .upsert(
          {
            organization_id: organizationId,
            raw_event_id: rawEventId,
            instagram_account_id: event.accountId,
            comment_id: event.commentId,
            media_id: event.mediaId,
            author_instagram_user_id: event.authorId,
            author_username: event.authorUsername,
            body: event.body,
            occurred_at: event.occurredAt,
            metadata: { signature_valid: true, source_event_id: sourceEventId },
          },
          { onConflict: 'organization_id,instagram_account_id,comment_id' },
        );

      if (commentError) throw commentError;
      commentsProcessed += 1;

      try {
        const automation = await queueInstagramCommentAutomation({
          organizationId,
          rawEventId,
          sourceEventId,
          instagramAccountId: event.accountId,
          commentId: event.commentId,
          body: event.body,
        });
        if (automation.queued) automationsQueued += 1;
      } catch (error) {
        automationErrors += 1;
        console.error('Instagram comment automation queue failed.', error);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        received_messages: messages.length,
        received_comments: comments.length,
        raw_events_created: rawEventsCreated,
        processed,
        comments_processed: commentsProcessed,
        already_processed: alreadyProcessed,
        duplicate_messages: duplicateMessages,
        unknown_accounts: unknownAccounts,
        automations_queued: automationsQueued,
        automation_errors: automationErrors,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof WebhookRequestError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    const message = error instanceof Error ? error.message : 'Instagram webhook failed';
    console.error('Instagram webhook error:', message);

    /* Genuine ingestion failures return 500 so Meta can retry safely. */
    return NextResponse.json(
      { ok: false, error: 'Instagram webhook failed' },
      { status: 500 },
    );
  }
}

function extractInstagramInboundEvents(payload: JsonObject) {
  const result: InstagramInboundEvent[] = [];

  for (const rawEntry of arrayValue(payload.entry)) {
    const entry = objectValue(rawEntry);
    const accountId = stringValue(entry.id);
    if (!accountId) continue;

    for (const rawMessagingEvent of arrayValue(entry.messaging)) {
      const messagingEvent = objectValue(rawMessagingEvent);
      const sender = objectValue(messagingEvent.sender);
      const recipient = objectValue(messagingEvent.recipient);
      const message = objectValue(messagingEvent.message);
      const postback = objectValue(messagingEvent.postback);
      const referral = objectValue(messagingEvent.referral);

      const senderId = stringValue(sender.id);
      const recipientId = stringValue(recipient.id);
      if (!senderId || !recipientId || recipientId !== accountId || senderId === accountId) {
        continue;
      }

      if (message.is_echo === true || message.is_deleted === true) continue;

      const messageId =
        stringValue(message.mid) ||
        stringValue(postback.mid) ||
        deterministicSyntheticEventId(accountId, senderId, messagingEvent);
      if (!messageId) continue;

      const text =
        stringValue(message.text) ||
        stringValue(postback.payload) ||
        stringValue(referral.ref) ||
        '';

      const messageType = Object.keys(postback).length
        ? 'postback'
        : Object.keys(referral).length
          ? 'referral'
          : instagramMessageType(message, text);

      result.push({
        accountId,
        senderId,
        recipientId,
        messageId,
        messageType,
        body: text || null,
        occurredAt: instagramTimestamp(messagingEvent.timestamp),
        raw: messagingEvent,
      });
    }
  }

  return result;
}

function extractInstagramCommentEvents(payload: JsonObject) {
  const result: InstagramCommentEvent[] = [];

  for (const rawEntry of arrayValue(payload.entry)) {
    const entry = objectValue(rawEntry);
    const accountId = stringValue(entry.id);
    if (!accountId) continue;

    for (const rawChange of arrayValue(entry.changes)) {
      const change = objectValue(rawChange);
      const field = stringValue(change.field);
      if (field !== 'comments' && field !== 'live_comments') continue;

      const value = objectValue(change.value);
      const from = objectValue(value.from);
      const media = objectValue(value.media);
      const commentId = stringValue(value.id) || stringValue(value.comment_id);
      if (!commentId) continue;

      const occurredAt =
        instagramFlexibleTimestamp(value.timestamp) ||
        instagramFlexibleTimestamp(entry.time) ||
        new Date().toISOString();

      result.push({
        accountId,
        commentId,
        mediaId: stringValue(value.media_id) || stringValue(media.id) || null,
        authorId: stringValue(from.id) || null,
        authorUsername: stringValue(from.username) || null,
        body: stringValue(value.text) || null,
        occurredAt,
        raw: change,
      });
    }
  }

  return result;
}

function instagramMessageType(message: JsonObject, text: string) {
  const replyTo = objectValue(message.reply_to);
  if (Object.keys(objectValue(replyTo.story)).length) return 'story_reply';
  if (message.is_unsupported === true) return 'unsupported';
  if (text) return 'text';

  const attachments = arrayValue(message.attachments);
  if (attachments.length) {
    const attachmentType = stringValue(objectValue(attachments[0]).type);
    if (attachmentType) return attachmentType;
  }

  return 'unknown';
}

function instagramTimestamp(value: unknown) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  const milliseconds = numericValue < 100_000_000_000 ? numericValue * 1000 : numericValue;
  const timestamp = new Date(milliseconds);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function instagramFlexibleTimestamp(value: unknown) {
  const numeric = instagramTimestamp(value);
  if (numeric) return numeric;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function deterministicSyntheticEventId(
  accountId: string,
  senderId: string,
  event: JsonObject,
) {
  const timestamp = stringValue(event.timestamp) || String(event.timestamp ?? '');
  if (!timestamp) return '';
  return `synthetic-${crypto
    .createHash('sha256')
    .update(`${accountId}:${senderId}:${timestamp}:${JSON.stringify(event)}`)
    .digest('hex')
    .slice(0, 40)}`;
}

function verifyMetaSignature(rawBytes: Buffer, header: string, appSecret: string) {
  const prefix = 'sha256=';
  if (!header.startsWith(prefix)) return false;

  const suppliedHex = header.slice(prefix.length).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(suppliedHex)) return false;

  const expectedHex = crypto
    .createHmac('sha256', appSecret)
    .update(rawBytes)
    .digest('hex');

  const supplied = Buffer.from(suppliedHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}
