# Durable Event Ingestion V1

## Goal

Protect authoritative Salsys business events from temporary Supabase/Postgres outages without allowing Salsys telemetry to break a customer's checkout or payment flow.

This applies to trusted server-side events such as:

- `booking.started`
- `booking.completed`
- `payment.started`
- `payment.completed`
- `payment.failed`
- `enrollment.completed`

## Architecture

```text
Trusted customer backend
  -> POST /api/events/v1
  -> sanitize + size guard
  -> best-effort source verification (short deadline)
  -> Vercel durable queue (outside Supabase)
  -> private Vercel queue-triggered consumer
  -> source secret-hash revalidation
  -> source rate limit
  -> ingest_tracking_event_v1
  -> process_tracking_raw_event_v1
  -> existing raw-event sweepers for projection retries
```

The queue is intentionally outside Supabase. A queue stored in the same Postgres instance would be unavailable during the exact failure mode this design is intended to survive.

## Admission semantics

A successful `202` response from `/api/events/v1` means the event has reached a durable persistence boundary. It does not necessarily mean all downstream CRM/revenue projections have completed already.

Normal path:

1. Parse and sanitize the event.
2. Build a durable envelope.
3. Quickly verify the source against Supabase when available.
4. Publish to the independent Vercel queue.
5. Return `202` with `queued: true`.

If Supabase is unavailable during the quick verification window, verification is deferred. The queue consumer must re-validate the source before any authoritative write is made.

## Credential handling

The queue message never contains the raw tracking secret.

It contains:

- tracking source key
- SHA-256 hash of the supplied secret
- sanitized event
- payload byte length
- minimal request context

The private consumer fetches the active tracking source from Supabase and compares the queued hash with the stored source secret hash using a timing-safe comparison.

A revoked source or invalid secret is a permanent failure and is acknowledged/discarded rather than retried forever.

## Retry behavior

The Vercel queue trigger is configured for repeated delivery attempts.

Transient failures include:

- Supabase connection timeouts
- connection resets
- temporary PostgREST/RPC failures
- temporary ingestion dependency failures

The consumer returns a non-2xx response for these failures. Vercel Queues retains and retries the message.

Permanent failures include:

- revoked/inactive source
- incorrect source secret hash
- unsupported envelope version
- oversized source payload
- rate-limit rejection

These are acknowledged so they cannot create poison-message retry loops.

## Idempotency

Vercel queue publishing uses an idempotency key derived from:

```text
source_key:event_id
```

Supabase ingestion also uses the existing stable source event ID contract.

Therefore the architecture assumes at-least-once delivery and remains duplicate-safe at the business event layer.

## Queue retention

Durable tracking messages use a seven-day retention period.

This provides a recovery window for temporary database outages without making the queue an indefinite source of record.

## Dual-failure fallback

If Vercel Queue publishing fails, `/api/events/v1` makes one direct idempotent persistence attempt against Supabase.

```text
Queue unavailable + Supabase healthy
  -> direct Supabase persistence
  -> 202

Queue unavailable + Supabase unavailable
  -> 503 retryable
  -> Retry-After header
```

The `503` is intentional. When both independent durability boundaries are unavailable, Salsys must not falsely claim the event was accepted.

## Remaining end-to-end gap

This architecture makes Salsys substantially more resilient, but it cannot guarantee delivery if both Vercel Queue and Supabase are simultaneously unavailable and the originating customer backend sends the event only once.

For full end-to-end durability, trusted adapters should eventually implement a small source-side outbox/retry mechanism:

```text
Customer booking/payment commit
  -> local outbox row / durable job
  -> Salsys delivery attempt
  -> retry on 429/5xx/network timeout
  -> delete/mark delivered only after Salsys 202
```

This is especially important for `payment.completed`, refunds and final enrollment events.

## Operational guarantees

V1 is designed around the following guarantees:

- A Supabase outage does not erase a queued trusted event.
- Raw tracking secrets are not stored in the queue.
- Queue retries are safe because event IDs are stable and idempotent.
- Revoked/invalid sources cannot write authoritative data after recovery.
- Downstream projection failure after raw-event persistence does not require queue redelivery; existing sweepers can retry processing.
- If neither external queue nor Supabase can durably accept the event, the API returns a retryable failure instead of a false success.

## Next hardening steps

1. Source-side adapter outbox/retry for critical business events.
2. Queue depth / oldest-message health monitoring and alerting.
3. Dead-letter operational visibility for exhausted deliveries.
4. External source-registry cache for strong admission authentication during a complete Supabase outage.
5. Disaster-recovery runbook and periodic failure-injection tests.
