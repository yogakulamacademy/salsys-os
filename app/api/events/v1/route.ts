import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  buildDurableTrustedEventEnvelope,
  DURABLE_EVENT_EDGE_MAX_BYTES,
  DurableEventPermanentError,
  DurableEventTransientError,
  processDurableTrustedEvent,
  publishDurableTrustedEvent,
  verifyDurableTrustedSource,
} from '@/lib/tracking/durable-events';
import { sanitizeGenericTrackingEvent } from '@/lib/tracking/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SOURCE_VERIFY_DEADLINE_MS = 800;

class PublicRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type VerificationResult =
  | {
      kind: 'verified';
      source: Awaited<ReturnType<typeof verifyDurableTrustedSource>>;
    }
  | {
      kind: 'deferred';
      reason: 'timeout' | 'dependency_unavailable';
    }
  | {
      kind: 'rejected';
      error: DurableEventPermanentError;
    };

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  return authorization.slice(7).trim() || null;
}

function json(
  body: Record<string, unknown>,
  status: number,
  extraHeaders?: Record<string, string>,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function declaredContentLength(request: NextRequest) {
  const header = request.headers.get('content-length');
  if (!header) return null;

  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function readBoundedText(request: NextRequest, maxBytes: number) {
  const declared = declaredContentLength(request);
  if (declared !== null && declared > maxBytes) {
    throw new PublicRequestError('Payload too large.', 413);
  }

  if (!request.body) {
    throw new PublicRequestError('Invalid JSON payload.', 400);
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
        throw new PublicRequestError('Payload too large.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder().decode(body),
    byteLength: totalBytes,
  };
}

async function verifySourceWithDeadline(
  envelope: Parameters<typeof verifyDurableTrustedSource>[0],
): Promise<VerificationResult> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const verification = verifyDurableTrustedSource(envelope)
    .then(
      (source): VerificationResult => ({
        kind: 'verified',
        source,
      }),
    )
    .catch((error): VerificationResult => {
      if (error instanceof DurableEventPermanentError) {
        return {
          kind: 'rejected',
          error,
        };
      }

      return {
        kind: 'deferred',
        reason: 'dependency_unavailable',
      };
    });

  const deadline = new Promise<VerificationResult>((resolve) => {
    timeout = setTimeout(() => {
      resolve({
        kind: 'deferred',
        reason: 'timeout',
      });
    }, SOURCE_VERIFY_DEADLINE_MS);
  });

  try {
    return await Promise.race([verification, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function permanentErrorResponse(error: DurableEventPermanentError) {
  if (error.reason === 'payload_too_large') {
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Payload too large.',
      },
      413,
    );
  }

  if (error.reason === 'rate_limited') {
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Rate limit exceeded.',
      },
      429,
      {
        'Retry-After': '60',
      },
    );
  }

  if (
    error.reason === 'invalid_source_key' ||
    error.reason === 'invalid_secret' ||
    error.reason === 'unauthorized_source' ||
    error.reason === 'unauthorized_secret'
  ) {
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Unauthorized tracking source.',
      },
      401,
    );
  }

  return json(
    {
      ok: false,
      accepted: false,
      error: 'Event rejected.',
      reason: error.reason,
    },
    400,
  );
}

export async function POST(request: NextRequest) {
  const declaredLength = declaredContentLength(request);
  if (
    declaredLength !== null &&
    declaredLength > DURABLE_EVENT_EDGE_MAX_BYTES
  ) {
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Payload too large.',
      },
      413,
    );
  }

  let rawBody: string;
  let actualLength: number;
  try {
    const bounded = await readBoundedText(request, DURABLE_EVENT_EDGE_MAX_BYTES);
    rawBody = bounded.text;
    actualLength = bounded.byteLength;
  } catch (error) {
    const requestError =
      error instanceof PublicRequestError
        ? error
        : new PublicRequestError('Invalid JSON payload.', 400);

    return json(
      {
        ok: false,
        accepted: false,
        error: requestError.message,
      },
      requestError.status,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Invalid JSON payload.',
      },
      400,
    );
  }

  let event: ReturnType<typeof sanitizeGenericTrackingEvent>;
  try {
    event = sanitizeGenericTrackingEvent(parsed);
  } catch {
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Invalid event payload.',
      },
      400,
    );
  }

  try {
    const forwardedFor = request.headers.get('x-forwarded-for');

    const envelope = buildDurableTrustedEventEnvelope({
      sourceKey: request.headers.get('x-salsys-source-key'),
      bearerSecret: bearerToken(request),
      contentLength: actualLength,
      userAgent: request.headers.get('user-agent'),
      ipPresent: Boolean(forwardedFor?.trim()),
      event,
    });

    const verification = await verifySourceWithDeadline(envelope);

    if (verification.kind === 'rejected') {
      return permanentErrorResponse(verification.error);
    }

    if (
      verification.kind === 'verified' &&
      actualLength > verification.source.maxPayloadBytes
    ) {
      return json(
        {
          ok: false,
          accepted: false,
          error: 'Payload too large.',
        },
        413,
      );
    }

    try {
      const queued = await publishDurableTrustedEvent(envelope);

      // Queue acceptance protects the event from a transient database outage,
      // but a queue trigger can still be misconfigured or temporarily fail to
      // invoke. When the source was verified at the edge, also make one
      // idempotent write-through attempt to the canonical ingest path. If the
      // queue later delivers the same event, ingest_tracking_event_v1 treats it
      // as a duplicate rather than creating a second business event.
      if (verification.kind === 'verified') {
        try {
          const result = await processDurableTrustedEvent(envelope);

          return json(
            {
              ok: true,
              accepted: result.accepted,
              duplicate: result.duplicate,
              quarantined: !result.accepted,
              queued: true,
              durable: true,
              write_through: 'supabase_direct',
              verification: 'verified',
              queue_message_id: queued.messageId,
              queue_deferred: queued.deferred,
              raw_event_id: result.rawEventId,
              event_family: result.eventFamily,
              contract_status: result.contractStatus,
              reason: result.reason,
              processing: result.processing,
              event_id: event.eventId,
              received_at: new Date().toISOString(),
            },
            202,
          );
        } catch (writeThroughError) {
          if (writeThroughError instanceof DurableEventPermanentError) {
            console.warn('TRUSTED_EVENT_WRITE_THROUGH_REJECTED', {
              eventId: event.eventId,
              sourceKey: envelope.sourceKey,
              reason: writeThroughError.reason,
            });

            return permanentErrorResponse(writeThroughError);
          }

          console.warn('TRUSTED_EVENT_WRITE_THROUGH_DEFERRED', {
            eventId: event.eventId,
            sourceKey: envelope.sourceKey,
            error:
              writeThroughError instanceof Error
                ? writeThroughError.message
                : 'Unknown write-through failure',
          });
        }
      }

      // If source verification had to be deferred, or direct write-through hit
      // a transient dependency failure, the accepted queue copy remains the
      // durable retry path.
      return json(
        {
          ok: true,
          accepted: true,
          duplicate: false,
          queued: true,
          durable: true,
          verification:
            verification.kind === 'verified' ? 'verified' : 'deferred',
          queue_message_id: queued.messageId,
          queue_deferred: queued.deferred,
          event_id: event.eventId,
          received_at: new Date().toISOString(),
        },
        202,
      );
    } catch (queueError) {
      if (!(queueError instanceof DurableEventTransientError)) {
        throw queueError;
      }

      // Vercel Queue is independent from Supabase. If the queue itself is
      // temporarily unavailable, make one direct idempotent persistence
      // attempt so a healthy Supabase can still accept the business event.
      try {
        const result = await processDurableTrustedEvent(envelope);

        return json(
          {
            ok: true,
            accepted: result.accepted,
            duplicate: result.duplicate,
            quarantined: !result.accepted,
            queued: false,
            durable: true,
            fallback: 'supabase_direct',
            raw_event_id: result.rawEventId,
            event_family: result.eventFamily,
            contract_status: result.contractStatus,
            reason: result.reason,
            processing: result.processing,
            received_at: new Date().toISOString(),
          },
          202,
        );
      } catch (fallbackError) {
        if (fallbackError instanceof DurableEventPermanentError) {
          return permanentErrorResponse(fallbackError);
        }

        console.error('TRUSTED_EVENT_DURABILITY_UNAVAILABLE', {
          eventId: event.eventId,
          sourceKey: envelope.sourceKey,
          queueError: queueError.message,
          fallbackError:
            fallbackError instanceof Error
              ? fallbackError.message
              : 'Unknown persistence failure',
        });

        return json(
          {
            ok: false,
            accepted: false,
            retryable: true,
            error: 'Event durability is temporarily unavailable.',
          },
          503,
          {
            'Retry-After': '30',
          },
        );
      }
    }
  } catch (error) {
    if (error instanceof DurableEventPermanentError) {
      return permanentErrorResponse(error);
    }

    console.error('Trusted event ingestion failed.', error);
    return json(
      {
        ok: false,
        accepted: false,
        error: 'Trusted event ingestion failed.',
      },
      500,
    );
  }
}
