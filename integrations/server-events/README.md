# SalsysOS Universal Trusted Business Events

SalsysOS exposes one platform-neutral server event contract for authoritative business outcomes.

Endpoint:

```text
POST https://salsysos.com/api/events/v1
```

Authentication:

```text
X-Salsys-Source-Key: <source key>
Authorization: Bearer <server secret>
Content-Type: application/json
```

The source key and secret are server credentials. Never expose the secret in browser JavaScript, HTML, mobile client code, public repositories, forms, or analytics tags.

## Universal event envelope

Every backend sends the same JSON structure regardless of framework or language:

```json
{
  "event_id": "payment_completed:PAY-123",
  "event_name": "payment.completed",
  "schema_version": 1,
  "occurred_at": "2026-10-25T13:30:00Z",
  "site": "example.com",
  "anonymous_visitor_id": "vis_optional",
  "session_key": "s_optional",
  "properties": {
    "payment_reference": "PAY-123",
    "booking_reference": "BOOK-123",
    "email": "customer@example.com",
    "phone": "+919999999999",
    "provider": "stripe",
    "payment_kind": "deposit",
    "amount": 500,
    "currency": "USD"
  },
  "metadata": {
    "integration": "my_backend"
  }
}
```

## Canonical business events

Use the same names on every platform:

```text
booking.started
booking.completed
payment.started
payment.completed
payment.failed
enrollment.completed
```

Do not treat browser-side values as authoritative payment, enrollment, refund, booking, or revenue facts.

## Identity resolution

Trusted server events resolve to the correct CRM lead using the strongest available signal:

1. explicit internal reference;
2. existing booking/enrollment reference;
3. prior lead event/session/visitor identity;
4. exact tenant-scoped email or phone match for secret-authenticated sources.

Conflicting contact identities fail closed instead of guessing.

## Idempotency

`event_id` must be stable for the same real-world business event.

Examples:

```text
booking_completed:BOOK-123
payment_started:PAY-123
payment_completed:PAY-123
enrollment_completed:ENR-BOOK-123
```

Retry network failures with the same event ID. Salsys deduplicates repeated delivery.

## Revenue rule

`payment.completed.properties.amount` should represent actual business revenue for the purchased product/service. Processor fees, gateway surcharges and taxes that are not business revenue should be stored separately in metadata when needed.

## Platform adapters

The contract is universal. Adapters are implementation conveniences only.

Supported patterns include:

- PHP / Laravel / WordPress
- Node.js / Next.js / Express / NestJS
- Python / Django / Flask / FastAPI
- Supabase Edge Functions / Deno
- Firebase / Google Cloud Functions
- AWS Lambda
- Vercel Functions / Route Handlers / Server Actions
- Shopify webhook apps
- WooCommerce hooks
- n8n
- Make
- Zapier
- any backend capable of HTTPS POST requests

## Event timing

Emit events only after the source system has committed or verified the business action.

Examples:

- reservation stored successfully → `booking.completed`
- pending payment row created → `payment.started`
- gateway capture verified and local payment committed paid → `payment.completed`
- verified first payment confirms enrollment → `enrollment.completed`
- UPI/bank proof merely uploaded → do not emit `payment.completed`

Salsys delivery failure should not undo a valid customer transaction. Log the failure and retry asynchronously from the source system when appropriate.

## Language examples

See:

```text
integrations/php/salsys-server-events.php
integrations/node/salsys-server-events.ts
integrations/python/salsys_server_events.py
```

All three implement the same event contract. Product logic must not depend on any one adapter.
