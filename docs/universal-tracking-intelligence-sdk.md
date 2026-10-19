# Salsys Universal Tracking Intelligence SDK

**Status:** V1 implementation contract  
**Protocol:** Salsys Universal Event Protocol v1

The Salsys Universal Tracking Intelligence SDK is the platform-independent tracking layer for SalsysOS.

It is designed so a customer can use SalsysOS regardless of whether their website/app is built with WordPress, plain HTML, React, Next.js, Vue, Laravel, Django, Rails, Java, .NET, Go, mobile, serverless or another runtime.

The universal boundary is **HTTPS + JSON + the canonical event contract**. Runtime SDKs are optional convenience layers over that contract.

## Architecture

```text
Website / App / Backend / Worker / Connector
                |
                v
Universal Tracking Intelligence SDK / Event API
                |
                v
Canonical Event Contract
                |
                v
Salsys Event Ingestion
                |
                v
PostgreSQL raw_events
                |
        +-------+-------+
        |               |
        v               v
Identity/Journey    Attribution/Funnel
        |               |
        +-------+-------+
                v
          Feature Store
                v
          Predictions
                v
      Decisions / Outcomes
                v
   Optional OpenSearch projection
```

## V1 components

### 1. Browser SDK

Canonical browser entrypoint:

```text
/public/salsys-intelligence.js
```

The entrypoint loads the existing browser tracking core at:

```text
/public/salsys-tracker.js
```

`/salsys-tracker.js` remains available for backward compatibility while `/salsys-intelligence.js` is the product-facing Universal Tracking Intelligence SDK entrypoint.

It is backend/CMS independent and can be installed on any web page that can execute JavaScript.

Capabilities already implemented:

- anonymous visitor ID;
- session ID;
- first-touch acquisition;
- current-session acquisition;
- UTM capture;
- `gclid`, `gbraid`, `wbraid`, `fbclid` capture;
- page views;
- session starts;
- CTA clicks;
- WhatsApp/call/email click classification;
- form start;
- form submit;
- SPA navigation tracking;
- form decoration with visitor/session continuity;
- purpose-specific consent state;
- Global Privacy Control handling;
- local retry queue;
- sensitive-key sanitization;
- manual event tracking through the SDK API.

### 2. Universal Event API

Trusted runtimes use:

```text
POST /api/events/v1
X-Salsys-Source: <source-key>
Authorization: Bearer <source-secret>
Content-Type: application/json
```

This is the canonical integration for every backend language.

### 3. Browser-safe Event API

Browsers use:

```text
POST /api/events/browser/v1
```

Tenant/source authorization is resolved from the configured browser origin. A server secret must never be embedded into browser JavaScript.

### 4. Event schema

Machine-readable canonical schema:

```text
schemas/salsys-event-v1.schema.json
```

## Browser installation

Direct installation:

```html
<script
  src="https://salsysos.com/salsys-intelligence.js"
  data-site="example.com"
  data-consent-mode="required"
  defer>
</script>
```

A customer may self-host the browser entrypoint/core or serve them through its own first-party asset domain as long as the event contract is unchanged.

## Browser API

The entrypoint exposes the browser API as both `SalsysIntelligence` and the backward-compatible `Salsys` global.

### Manual event

```javascript
SalsysIntelligence.track('web.cta_clicked', {
  action: 'enroll_now',
  course_key: '200-hour-ytt'
});
```

### Page view

```javascript
SalsysIntelligence.page({
  content_type: 'course'
});
```

### Consent

```javascript
SalsysIntelligence.consent({
  analytics: 'granted',
  advertising: 'denied'
});
```

### Visitor/session continuity

```javascript
const ids = SalsysIntelligence.identifiers();
```

The browser SDK never treats browser-side payment or enrollment claims as authoritative.

## Language-independent server event example

The following is intentionally plain HTTP rather than a language-specific SDK:

```http
POST /api/events/v1 HTTP/1.1
Host: salsysos.com
X-Salsys-Source: customer-production
Authorization: Bearer <secret>
Content-Type: application/json

{
  "event_id": "evt_payment_123",
  "event_name": "payment.completed",
  "schema_version": 1,
  "occurred_at": "2026-10-19T12:30:00Z",
  "anonymous_visitor_id": "v_123",
  "session_key": "s_123",
  "site": "example.com",
  "properties": {
    "transaction_id": "txn_123",
    "currency": "USD",
    "amount": 500
  },
  "context": {},
  "metadata": {
    "runtime": "server"
  }
}
```

Any programming language capable of HTTPS can emit the same event.

## Event tracking model

Salsys event tracking separates **observed behavior** from **authoritative business facts**.

### Browser-observed events

Examples:

```text
web.session_started
web.page_viewed
web.cta_clicked
web.form_started
web.form_submitted
web.lead_submitted
```

### Trusted server/business events

Examples:

```text
lead.created
booking.started
booking.completed
payment.started
payment.completed
payment.failed
enrollment.completed
```

### Other platform events

The canonical protocol supports registered event families such as:

```text
conversation.*
message.*
automation.*
privacy.*
system.*
custom.*
```

A new event must be registered through the event-contract system rather than silently inventing semantics in a client SDK.

## Intelligence produced from events

The SDK does not perform business predictions in the browser. It captures trustworthy evidence that the Salsys intelligence layer can use for:

- visitor/session journey reconstruction;
- first/last/current touch attribution;
- content influence;
- campaign influence;
- lead intent signals;
- product/course affinity;
- funnel progression;
- conversion and revenue attribution;
- feature-store state;
- explainable predictions;
- next-best-action recommendations;
- actual outcome learning.

This keeps collection deterministic and intelligence server-controlled.

## Privacy rules

- consent is purpose-specific;
- GPC is respected;
- arbitrary form values are not captured;
- passwords, secrets, authorization values, cookies and payment-card data are excluded/redacted;
- browser identity is anonymous until linked by a trusted server workflow;
- customer/backend secrets never enter browser JavaScript.

## Reliability rules

Every producer must preserve a stable `event_id` across retries.

A first-party transport/outbox may be implemented using any language/platform. Durability is a capability, not a language/database requirement.

## Compatibility rule

Future JavaScript, Node, Python, Go, Java, .NET, mobile or other SDKs are wrappers over the same Universal Event Protocol. They must not create different event meanings or different source-of-truth rules.
