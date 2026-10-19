# Salsys Universal Event Protocol v1

**Status:** Canonical architecture contract  
**Date:** 2026-10-19

Salsys Tracking Intelligence is protocol-first and platform/language independent. No backend language, framework, database, CMS or hosting provider is part of the canonical tracking contract.

The **Universal Tracking Intelligence SDK** is the developer-facing layer over this protocol. SDKs may improve installation ergonomics, but they must emit the same canonical events.

## 1. Canonical transports

### Trusted server / app / worker

Any trusted runtime that can make HTTPS requests can emit events:

```text
POST /api/events/v1
X-Salsys-Source: <source-key>
Authorization: Bearer <tracking-source-secret>
Content-Type: application/json
```

### Browser

Browser collection uses origin-resolved authorization and never receives a server tracking secret:

```text
POST /api/events/browser/v1
Content-Type: application/json
```

The universal integration boundary is **HTTPS + JSON**.

## 2. Canonical event envelope

Canonical producers should use snake_case field names:

```json
{
  "event_id": "evt_01...",
  "event_name": "web.page_viewed",
  "schema_version": 1,
  "occurred_at": "2026-10-19T12:30:00Z",
  "anonymous_visitor_id": "v_01...",
  "session_key": "s_01...",
  "external_message_id": null,
  "site": "example.com",
  "properties": {
    "pagePath": "/courses/example"
  },
  "context": {
    "page_origin": "https://example.com",
    "language": "en"
  },
  "metadata": {
    "sdk": "salsys-universal-web",
    "sdk_version": "1.0.0",
    "runtime": "browser"
  }
}
```

Required semantics:

- `event_id` is stable and reused for every retry of the same logical event;
- `event_name` follows a registered event contract;
- `schema_version` is an integer contract version;
- `occurred_at` is the observed event time, not delivery completion time;
- anonymous/session identity is included where relevant;
- `properties` contains event-specific facts;
- `context` contains environment/journey context;
- `metadata` contains producer/SDK/transport metadata;
- sensitive values are never intentionally serialized and are sanitized again at ingestion.

The current ingestion layer also accepts selected legacy camelCase aliases for compatibility, but new SDKs should emit the canonical snake_case contract above.

## 3. Universal event namespaces

The platform event model is namespace-based:

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

Vertical-specific semantics may be added through registered contracts without forking the protocol or SDK.

## 4. Browser authority boundary

The browser SDK is intended for observed behavior and intent. Browser-safe events use `web.*`.

Examples:

```text
web.session_started
web.page_viewed
web.cta_clicked
web.form_started
web.form_submitted
web.lead_submitted
```

The browser is **not authoritative** for:

- payment success;
- confirmed enrollment;
- refunds;
- final revenue;
- privileged CRM state;
- provider delivery state.

Those facts must be emitted by a trusted server/provider/backend source.

## 5. Universal Tracking Intelligence SDK model

```text
Universal Event Protocol                 canonical contract
        |
        +-- Browser SDK                  direct website/app instrumentation
        +-- HTTPS Event API              every server language/platform
        +-- first-party transport        optional customer-domain relay/proxy
        +-- runtime SDKs                 convenience wrappers, optional
```

A runtime SDK must not invent a second event model.

## 6. First-party transport contract

A customer may route browser events through a first-party endpoint on its own domain before delivery to SalsysOS.

Example:

```text
https://customer.example/events
```

The transport may be an edge worker, reverse proxy, serverless function, application route, queue consumer, conventional backend service or another suitable runtime.

A compliant transport preserves:

- canonical event shape;
- stable `event_id`;
- tenant/source authorization boundaries;
- privacy/consent decisions;
- retry safety;
- server credential secrecy;
- ordering when an integration contract requires it.

## 7. Durable outbox contract

Durability is a capability, not a database or language requirement.

A durable producer/outbox should provide:

- persistent journal or equivalent durable storage;
- stable event IDs;
- delivery state;
- bounded retry/backoff;
- lease/claim semantics where concurrent workers exist;
- terminal/dead-letter state;
- retention/cleanup policy;
- idempotent downstream delivery.

Storage can be IndexedDB, SQLite, PostgreSQL, MySQL, Redis, a queue, KV storage or another platform-native durable mechanism.

## 8. Identity contract

Canonical neutral identity terms are:

```text
anonymous_visitor_id
session_key
person_id
lead_id
user_id
device_id
event_id
```

Historical identifiers such as Yogakulam migration aliases may be read during migration, but they are not part of the universal contract.

## 9. Privacy contract

The SDK/protocol must support purpose-specific consent, denial, withdrawal and Global Privacy Control handling.

Browser collection must fail closed when the configured policy requires prior consent.

No browser SDK may serialize arbitrary form values, passwords, card data, authorization headers, cookies, secrets or browser PII by default.

## 10. Source of truth

PostgreSQL `raw_events` remains immutable event evidence and the canonical event source of truth.

OpenSearch is optional, derived and rebuildable. Raw events are not copied into OpenSearch as an alternate truth store.

## 11. Compatibility rule

All future SDKs and transport adapters implement this protocol.

A runtime-specific implementation may improve developer ergonomics, but it must not change event meaning, identity semantics, privacy rules, authorization boundaries or source-of-truth rules.