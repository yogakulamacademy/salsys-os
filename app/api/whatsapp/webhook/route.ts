import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JsonObject = Record<string, unknown>;

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');
  const verifyToken = process.env.WA_VERIFY_TOKEN?.trim();

  if (
    mode === 'subscribe' &&
    verifyToken &&
    token === verifyToken &&
    challenge
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: 'Webhook verification failed',
    },
    { status: 403 }
  );
}

export async function POST(request: NextRequest) {
  try {
    // Meta signs the exact raw request bytes, so validate before parsing JSON.
    const rawBytes = Buffer.from(await request.arrayBuffer());
    const rawBody = rawBytes.toString('utf8');

    const signatureHeader = request.headers.get('x-hub-signature-256');
    const appSecret = requireEnv('WA_APP_SECRET');

    if (!signatureHeader) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing webhook signature',
        },
        { status: 401 }
      );
    }

    const signatureValid = verifyMetaSignature(
      rawBytes,
      signatureHeader,
      appSecret
    );

    if (!signatureValid) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid webhook signature',
        },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody) as JsonObject;
    const events = extractWebhookEvents(payload);
    const supabase = createAdminClient();

    let inserted = 0;
    let duplicates = 0;
    let processed = 0;
    let alreadyProcessed = 0;
    let ignored = 0;

    for (const event of events) {
      const eventKey = stringValue(event.event_key);

      if (!eventKey) {
        throw new Error('Webhook event_key could not be generated.');
      }

      let eventId: string | null = null;

      const {
        data: insertedEvent,
        error: insertError,
      } = await supabase
        .from('whatsapp_webhook_events')
        .insert(event)
        .select('id')
        .single();

      if (insertError) {
        if (insertError.code !== '23505') {
          throw insertError;
        }

        duplicates += 1;

        // Meta retries webhooks. On a duplicate, recover the existing raw
        // event and run the processor again. Processed events are idempotent;
        // failed/received events can safely retry.
        const {
          data: existingEvent,
          error: existingError,
        } = await supabase
          .from('whatsapp_webhook_events')
          .select('id')
          .eq('event_key', eventKey)
          .maybeSingle();

        if (existingError) {
          throw existingError;
        }

        eventId = stringValue(existingEvent?.id);
      } else {
        inserted += 1;
        eventId = stringValue(insertedEvent?.id);
      }

      if (!eventId) {
        throw new Error(
          `Unable to resolve stored webhook event for ${eventKey}.`
        );
      }

      const result = await processStoredWebhookEvent(
        supabase,
        eventId
      );

      if (result.already_processed === true) {
        alreadyProcessed += 1;
      } else if (result.ignored === true) {
        ignored += 1;
      } else if (result.processed === true) {
        processed += 1;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        received: events.length,
        inserted,
        duplicates,
        processed,
        already_processed: alreadyProcessed,
        ignored,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'WhatsApp webhook failed';

    console.error('WhatsApp webhook error:', message);

    // Returning 500 is intentional here. Meta may retry the webhook.
    // The raw-event unique key + CRM idempotency layer make retries safe.
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

async function processStoredWebhookEvent(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string
) {
  const { data, error } = await supabase.rpc(
    'ingest_whatsapp_webhook_event',
    {
      p_event_id: eventId,
    }
  );

  if (error) {
    throw error;
  }

  const result = objectValue(data);

  if (result.ok !== true) {
    const processorError =
      stringValue(result.error) ||
      'WhatsApp CRM ingestion failed.';

    throw new Error(processorError);
  }

  return result;
}

function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string,
  appSecret: string
) {
  const signature = signatureHeader.trim();

  if (!signature.startsWith('sha256=')) {
    return false;
  }

  const receivedHex = signature.slice('sha256='.length);

  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', Buffer.from(appSecret, 'utf8'))
    .update(rawBody)
    .digest();

  const received = Buffer.from(receivedHex, 'hex');

  if (received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(received, expected);
}

function extractWebhookEvents(payload: JsonObject) {
  const rows: Array<Record<string, unknown>> = [];

  const objectType = stringValue(payload.object);
  const entries = arrayValue(payload.entry);

  for (const entryRaw of entries) {
    const entry = objectValue(entryRaw);
    const entryId = stringValue(entry.id);
    const changes = arrayValue(entry.changes);

    for (const changeRaw of changes) {
      const change = objectValue(changeRaw);
      const fieldName = stringValue(change.field);
      const value = objectValue(change.value);
      const metadata = objectValue(value.metadata);

      const phoneNumberId = stringValue(metadata.phone_number_id);
      const displayPhoneNumber = stringValue(
        metadata.display_phone_number
      );

      const contacts = arrayValue(value.contacts);
      const defaultContactWaId = firstString(
        contacts,
        'wa_id'
      );

      const messages = arrayValue(value.messages);

      for (const messageRaw of messages) {
        const message = objectValue(messageRaw);
        const messageId = stringValue(message.id);
        const from = stringValue(message.from);
        const messageType =
          stringValue(message.type) || 'message';

        rows.push({
          event_key: messageId
            ? `message:${messageId}`
            : stableEventKey(
                objectType,
                entryId,
                fieldName,
                message
              ),
          object_type: objectType,
          entry_id: entryId,
          field_name: fieldName,
          phone_number_id: phoneNumberId,
          display_phone_number: displayPhoneNumber,
          event_type: `message:${messageType}`,
          external_message_id: messageId,
          contact_wa_id: from || defaultContactWaId,
          signature_valid: true,
          payload: {
            object: objectType,
            entry_id: entryId,
            field: fieldName,
            metadata,
            contacts,
            message,
          },
          processing_status: 'received',
        });
      }

      const statuses = arrayValue(value.statuses);

      for (const statusRaw of statuses) {
        const status = objectValue(statusRaw);
        const messageId = stringValue(status.id);
        const statusName =
          stringValue(status.status) || 'unknown';
        const recipientId = stringValue(
          status.recipient_id
        );

        rows.push({
          event_key: messageId
            ? `status:${messageId}:${statusName}`
            : stableEventKey(
                objectType,
                entryId,
                fieldName,
                status
              ),
          object_type: objectType,
          entry_id: entryId,
          field_name: fieldName,
          phone_number_id: phoneNumberId,
          display_phone_number: displayPhoneNumber,
          event_type: `status:${statusName}`,
          external_message_id: messageId,
          contact_wa_id:
            recipientId || defaultContactWaId,
          signature_valid: true,
          payload: {
            object: objectType,
            entry_id: entryId,
            field: fieldName,
            metadata,
            status,
          },
          processing_status: 'received',
        });
      }

      if (
        messages.length === 0 &&
        statuses.length === 0
      ) {
        const unknownPayload = {
          object: objectType,
          entry_id: entryId,
          field: fieldName,
          value,
        };

        rows.push({
          event_key: stableEventKey(
            objectType,
            entryId,
            fieldName,
            unknownPayload
          ),
          object_type: objectType,
          entry_id: entryId,
          field_name: fieldName,
          phone_number_id: phoneNumberId,
          display_phone_number: displayPhoneNumber,
          event_type: fieldName || 'unknown',
          external_message_id: null,
          contact_wa_id: defaultContactWaId,
          signature_valid: true,
          payload: unknownPayload,
          processing_status: 'received',
        });
      }
    }
  }

  return rows;
}

function stableEventKey(
  objectType: string | null,
  entryId: string | null,
  fieldName: string | null,
  payload: unknown
) {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');

  return [
    'event',
    objectType || 'unknown',
    entryId || 'unknown',
    fieldName || 'unknown',
    hash,
  ].join(':');
}

function objectValue(value: unknown): JsonObject {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value as JsonObject;
  }

  return {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function firstString(
  values: unknown[],
  key: string
) {
  for (const value of values) {
    const object = objectValue(value);
    const result = stringValue(object[key]);

    if (result) {
      return result;
    }
  }

  return null;
}
