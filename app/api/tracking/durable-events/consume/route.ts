import { NextResponse } from 'next/server';

import {
  DURABLE_EVENT_QUEUE_TOPIC,
  DurableEventPermanentError,
  processDurableTrustedEvent,
  type DurableTrustedEventEnvelope,
} from '@/lib/tracking/durable-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function noContent() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: Request) {
  const eventType = request.headers.get('ce-type');
  const queueName = request.headers.get('ce-vqsqueuename');
  const messageId = request.headers.get('ce-vqsmessageid');
  const deliveryCount = request.headers.get('ce-vqsdeliverycount');

  // Vercel queue-triggered functions are private/air-gapped, but validate the
  // CloudEvent metadata anyway so this handler fails closed if invoked outside
  // the expected delivery path.
  if (
    eventType !== 'com.vercel.queue.v2beta' ||
    queueName !== DURABLE_EVENT_QUEUE_TOPIC
  ) {
    return new NextResponse(null, { status: 404 });
  }

  let envelope: DurableTrustedEventEnvelope;
  try {
    envelope = (await request.json()) as DurableTrustedEventEnvelope;
  } catch {
    console.warn('DURABLE_TRACKING_EVENT_DISCARDED', {
      messageId,
      deliveryCount,
      reason: 'malformed_json',
    });
    return noContent();
  }

  if (
    !envelope ||
    envelope.version !== 1 ||
    !envelope.sourceKey ||
    !envelope.secretHash ||
    !envelope.event?.eventId
  ) {
    console.warn('DURABLE_TRACKING_EVENT_DISCARDED', {
      messageId,
      deliveryCount,
      eventId: envelope?.event?.eventId ?? null,
      reason: 'malformed_envelope',
    });
    return noContent();
  }

  try {
    const result = await processDurableTrustedEvent(envelope);

    console.info('DURABLE_TRACKING_EVENT_PROCESSED', {
      messageId,
      deliveryCount,
      eventId: envelope.event.eventId,
      accepted: result.accepted,
      duplicate: result.duplicate,
      rawEventId: result.rawEventId,
      reason: result.reason,
    });

    // A 2xx response acknowledges the queue message. At this point the raw
    // event is either persisted, known as a duplicate, or intentionally
    // quarantined by the tracking contract.
    return noContent();
  } catch (error) {
    if (error instanceof DurableEventPermanentError) {
      console.warn('DURABLE_TRACKING_EVENT_DISCARDED', {
        messageId,
        deliveryCount,
        eventId: envelope.event.eventId,
        reason: error.reason,
      });

      // Permanent failures (revoked source, invalid secret/hash, payload too
      // large, etc.) must not retry forever.
      return noContent();
    }

    console.error('DURABLE_TRACKING_EVENT_RETRY_PENDING', {
      messageId,
      deliveryCount,
      eventId: envelope.event.eventId,
      error: error instanceof Error ? error.message : 'Unknown transient failure',
    });

    // Non-2xx tells Vercel Queues to retry delivery. Supabase outages,
    // connection resets and transient ingestion failures land here.
    return NextResponse.json(
      {
        ok: false,
        retryable: true,
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': '60',
        },
      },
    );
  }
}
