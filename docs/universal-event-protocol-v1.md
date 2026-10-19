# Salsys Universal Event Protocol v1

**Status:** Architecture contract
**Date:** 2026-10-19

Salsys Event Intelligence is protocol-first and platform independent. No backend language, framework, database or hosting provider is part of the canonical tracking contract.

## 1. Canonical transport

Any trusted server, app, worker or integration that can make HTTPS requests may emit events to SalsysOS.

```text
POST /api/events/v1
Authorization: Bearer <tracking-source credential>
Content-Type: application/json
```

Browser collection uses the browser-safe endpoint and trusted origin/source resolution:

```text
POST /api/events/browser/v1
Content-Type: application/json
```

The transport is HTTPS + JSON. SDKs are convenience clients over this protocol, not alternative event contracts.

## 2. Canonical event envelope

```json
{
  "event_id": "evt_01...",
  "event_name": "web.page_viewed",
  "schema_version": "1.0",
  "occurred_at": "2026-10-19T12:30:00Z",
  "source": {
    "type": "browser",
    "sdk": "salsys-web",
    "sdk_version": "1.0.0"
  },
  "anonymous_id": "anon_...",
  "session_id": "ses_...",
  "context": {},
  "properties": {}
}
```

Required semantics:
- `event_id` is globally stable for the producer and is reused on retry;
- `event_name` must conform to a registered event contract;
- `occurred_at` describes when the event happened, not when delivery completed;
- `schema_version` identifies the contract version;
- browser identity/context fields are optional where they do not apply;
- sensitive fields must be sanitized before or during canonical ingestion.

## 3. Universal event namespaces

Recommended namespaces:

```text
web.*
identity.*
lead.*
conversation.*
message.*
booking.*
payment.*
enrollment.*
automation.*
privacy.*
system.*
custom.*
```

Vertical-specific semantics may be added through registered contracts without forking the protocol.

## 4. SDK model

The protocol is universal. SDKs are runtime-specific adapters over the same contract.

Initial SDK/runtime model:

```text
Browser JavaScript SDK        required for browser instrumentation
Raw HTTPS server protocol     canonical server integration
Reference server SDK          implementation convenience, not authority
Additional language SDKs      optional and demand-driven
```

No customer is required to use a particular backend language.

## 5. First-party transport contract

A customer may send browser traffic through a first-party path on its own domain before forwarding to SalsysOS.

Example:

```text
https://customer.example/events
```

A compliant first-party transport may be implemented using an edge worker, reverse proxy, serverless function, application route, queue consumer, conventional backend service or another suitable runtime.

The transport implementation must preserve:
- canonical event shape;
- stable `event_id`;
- tenant/source authorization boundaries;
- privacy/consent semantics;
- retry safety;
- ordering where the source contract requires it;
- no exposure of server credentials to browser code.

## 6. Durable outbox contract

Durability is a capability, not a database requirement.

A durable producer/outbox should provide:
- persistent event journal or equivalent storage;
- stable event IDs;
- per-destination delivery state where multiple adapters exist;
- retry with bounded backoff;
- lease/claim semantics for concurrent workers where needed;
- dead-letter or terminal failure state;
- retention/cleanup policy;
- idempotent downstream delivery.

Valid storage implementations may include browser IndexedDB, SQLite, PostgreSQL, MySQL, Redis, queues, KV stores or platform-native durable storage.

## 7. Identity contract

Neutral identity vocabulary:

```text
anonymous_id
session_id
person_id
lead_id
user_id
device_id
event_id
```

Tenant-specific or historical identifiers may be preserved as migration aliases, but must not become the universal SDK vocabulary.

## 8. Authority rules

Browser events may describe behavior and intent but are not authoritative for:
- payment success;
- enrollment completion;
- refunds;
- final revenue;
- privileged CRM state.

Those events must originate from trusted server/payment/backend evidence.

PostgreSQL remains the authoritative source of truth. OpenSearch remains optional and rebuildable.

## 9. Privacy

The protocol must support purpose-specific consent, denial, withdrawal/revocation and Global Privacy Control handling.

Browser collection must fail closed where the configured consent policy requires consent before optional processing.

No SDK may serialize arbitrary form values or browser PII by default.

## 10. Compatibility rule

All future SDKs and transport adapters must implement this contract rather than introducing a parallel event model.

A runtime-specific implementation may add developer ergonomics, but it must not change the canonical event meaning, identity model, authorization model or source-of-truth rules.
