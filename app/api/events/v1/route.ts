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
  const declaredLength = Number(request.headers.get('content-length') || '0');
  if (
    Number.isFinite(declaredLength) &&
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

  try {
    const rawBody = await request.text();
    const actualLength = Buffer.byteLength(rawBody, 'utf8');

    if (actualLength > DURABLE_EVENT_EDGE_MAX_BYTES) {
      return json(
        {
          ok: false,
          accepted: false,
          error: 'Payload too large.',
        },
        413,
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

    const event = sanitizeGenericTrackingEvent(parsed);
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

    const message =
      error instanceof Error ? error.message : 'Invalid event payload.';

    return json(
      {
        ok: false,
        accepted: false,
        error: message,
      },
      400,
    );
  }
}
