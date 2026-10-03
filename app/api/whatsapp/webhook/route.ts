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

      const phoneNumberId = stringValue(
        event.phone_number_id
      );

      if (!phoneNumberId) {
        throw new Error(
          'Webhook phone_number_id is missing.'
        );
      }

      const {
        data: whatsappAccount,
        error: whatsappAccountError,
      } = await supabase
        .from('whatsapp_accounts')
        .select('organization_id')
        .eq(
          'phone_number_id',
          phoneNumberId
        )
        .eq(
          'active',
          true
        )
        .maybeSingle();

      if (whatsappAccountError) {
        throw whatsappAccountError;
      }

      const organizationId = stringValue(
        whatsappAccount?.organization_id
      );

      if (!organizationId) {
        throw new Error(
          `No active organization mapping found for WhatsApp phone_number_id ${phoneNumberId}.`
        );
      }

      event.organization_id =
        organizationId;

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
          .eq(
            'organization_id',
            organizationId
          )
          .eq(
            'event_key',
            eventKey
          )
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
  /*
   * Load the stored raw event first so we can route:
   *
   * message:* → existing inbound CRM ingestion
   * status:*  → outbound sent/delivered/read/failed updates
   *
   * Keeping the raw event as the source of truth also makes Meta retries
   * deterministic and preserves the existing idempotency behavior.
   */
  const {
    data: storedEvent,
    error: storedEventError,
  } = await supabase
    .from('whatsapp_webhook_events')
    .select(
      `
      id,
      event_type,
      external_message_id,
      payload,
      processing_status
      `
    )
    .eq('id', eventId)
    .single();

  if (storedEventError) {
    throw storedEventError;
  }

  const eventType =
    stringValue(storedEvent?.event_type) || '';

  /*
   * Delivery/read webhooks reference the outbound Meta wamid that we now
   * attach to public.messages.external_message_id after every successful
   * free-form or template send.
   */
  if (eventType.startsWith('status:')) {
    return processStoredWhatsAppStatusEvent(
      supabase,
      eventId,
      storedEvent
    );
  }

  /*
   * Preserve the existing inbound-message processor unchanged.
   */
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

async function processStoredWhatsAppStatusEvent(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string,
  storedEvent: Record<string, unknown>
) {
  const eventType =
    stringValue(storedEvent.event_type) || '';

  const statusName =
    eventType.startsWith('status:')
      ? eventType.slice('status:'.length).trim()
      : '';

  /*
   * If this exact webhook has already been successfully processed, a Meta
   * retry should be acknowledged without updating the CRM again.
   */
  if (
    stringValue(storedEvent.processing_status) ===
    'processed'
  ) {
    return {
      ok: true,
      already_processed: true,
    };
  }

  const supportedStatuses = new Set([
    'sent',
    'delivered',
    'read',
    'failed',
  ]);

  /*
   * Keep unknown future Meta status types in the raw webhook audit trail,
   * but do not let them break webhook delivery.
   */
  if (!supportedStatuses.has(statusName)) {
    await markWebhookEventProcessed(
      supabase,
      eventId
    );

    return {
      ok: true,
      ignored: true,
    };
  }

  const externalMessageId =
    stringValue(
      storedEvent.external_message_id
    );

  if (!externalMessageId) {
    await markWebhookEventProcessed(
      supabase,
      eventId,
      'Status event did not contain an external message ID.'
    );

    return {
      ok: true,
      ignored: true,
    };
  }

  const payload =
    objectValue(storedEvent.payload);

  const statusPayload =
    objectValue(payload.status);

  const statusAt =
    whatsappStatusTimestamp(
      statusPayload.timestamp
    );

  const {
    data: statusResult,
    error: statusError,
  } = await supabase.rpc(
    'apply_whatsapp_message_status',
    {
      p_external_message_id:
        externalMessageId,

      p_status:
        statusName,

      p_status_at:
        statusAt,

      /*
       * Save the full Meta status object into message metadata.
       * For failed messages this preserves Meta's error information.
       */
      p_event_metadata:
        statusPayload,
    }
  );

  if (statusError) {
    throw statusError;
  }

  /*
   * apply_whatsapp_message_status() returns no row when the wamid has not
   * yet been attached to a CRM message.
   *
   * Do NOT mark the webhook processed in that case. Returning 500 lets Meta
   * retry, while our raw-event unique key keeps the retry idempotent.
   */
  const matchedMessage =
    Array.isArray(statusResult)
      ? statusResult.length > 0
      : Boolean(statusResult);

  if (!matchedMessage) {
    throw new Error(
      `WhatsApp ${statusName} status could not yet be matched to CRM message ${externalMessageId}.`
    );
  }

  await markWebhookEventProcessed(
    supabase,
    eventId
  );

  return {
    ok: true,
    processed: true,
    external_message_id:
      externalMessageId,
    message_status:
      statusName,
  };
}

async function markWebhookEventProcessed(
  supabase: ReturnType<typeof createAdminClient>,
  eventId: string,
  processingError: string | null = null
) {
  const {
    error,
  } = await supabase
    .from('whatsapp_webhook_events')
    .update({
      processing_status:
        'processed',

      processing_error:
        processingError,

      processed_at:
        new Date().toISOString(),
    })
    .eq('id', eventId);

  if (error) {
    throw error;
  }
}

function whatsappStatusTimestamp(
  value: unknown
) {
  /*
   * Meta currently supplies status timestamps as Unix seconds, usually
   * encoded as strings. Accept numbers too so the webhook remains robust.
   */
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (
    Number.isFinite(
      numericValue
    ) &&
    numericValue > 0
  ) {
    return new Date(
      numericValue * 1000
    ).toISOString();
  }

  return new Date().toISOString();
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
