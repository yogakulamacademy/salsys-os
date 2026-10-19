# Salsys Universal Tracking Intelligence SDK

**Status:** V1 implementation contract  
**Protocol:** Salsys Universal Event Protocol v1

The Salsys Universal Tracking Intelligence SDK is the platform-independent tracking layer for SalsysOS.

It supports websites, apps, backend services, workers and connectors without coupling the tracking model to a backend language, framework, CMS, database or hosting provider.

The universal boundary is **HTTPS + JSON + the canonical event contract**.

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

### Browser SDK

Canonical browser entrypoint:

```text
/public/salsys-intelligence.js
```

The entrypoint loads the browser tracking core at:

```text
/public/salsys-tracker.js
```

`/salsys-tracker.js` remains available for compatibility while `/salsys-intelligence.js` is the product-facing Universal Tracking Intelligence SDK entrypoint.

Current browser capabilities include:

- anonymous visitor ID;
- session ID;
- first-touch acquisition;
- current-session acquisition;
- UTM and major ad-click ID capture;
- page views;
- session starts;
- CTA clicks;
- WhatsApp/call/email click classification;
- Instagram and enrollment/booking CTA compatibility classification;
- form start;
- form submit;
- SPA navigation tracking;
- form decoration with visitor/session continuity;
- purpose-specific consent state;
- Global Privacy Control handling;
- local retry queue;
- sensitive-key sanitization;
- manual event tracking;
- controlled migration of legacy Yogakulam visitor/session/analytics-consent aliases;
- compatibility for established `data-yk-event` instrumentation and `yk:consent` events during cutover;
- temporary `YKTracking` diagnostics facade and `yk_tracking_ready` dataLayer bridge during cutover.

### Universal Event API

Trusted runtimes use:

```text
POST /api/events/v1
X-Salsys-Source-Key: <source-key>
Authorization: Bearer <tracking-source-secret>
```

The same endpoint works from any backend language capable of HTTPS.

### Browser-safe Event API

Browsers use `/api/events/browser/v1` and are authorized through trusted origin/source configuration rather than server credentials embedded in JavaScript.

The browser ingest path preserves server-side geo enrichment from trusted proxy/hosting headers where available, without persisting a raw client IP address.

### Universal identity handoff

Trusted backends link an anonymous visitor/session to a known CRM lead through:

```text
POST /api/events/identify/v1
X-Salsys-Source-Key: <source-key>
Authorization: Bearer <tracking-source-secret>
```

The endpoint preserves the pre-existing exact-session safety rule: the lead, tracking source tenant, anonymous visitor and existing session must all agree before journey history is attached.

### Event schema

Machine-readable canonical schema:

```text
schemas/salsys-event-v1.schema.json
```

## Browser installation

```html
<script
  src="https://salsysos.com/salsys-intelligence.js"
  data-consent-mode="required"
  defer>
</script>
```

The site hostname is inferred by default. A configured site value may be supplied when needed.

A customer may self-host the browser entrypoint/core as long as the canonical event contract is unchanged.

## Browser API

The product entrypoint exposes the API as both `SalsysIntelligence` and the backward-compatible `Salsys` global.

### Manual event

```javascript
SalsysIntelligence.track('web.cta_clicked', {
  action: 'enroll_now',
  course_key: '200-hour-ytt'
});
```

### Page view

```javascript
SalsysIntelligence.page({ content_type: 'course' });
```

### Consent

```javascript
SalsysIntelligence.consent({
  analytics: 'granted',
  advertising: 'denied'
});
```

A cookie-consent implementation may also dispatch:

```javascript
window.dispatchEvent(
  new CustomEvent('salsys:consent', {
    detail: {
      analytics: true,
      advertising: false
    }
  })
);
```

During controlled migration, the legacy `yk:consent` event is translated into the new purpose vocabulary.

### Visitor/session continuity

```javascript
const ids = SalsysIntelligence.identifiers();
```

## Event tracking model

Salsys event tracking separates **observed behavior** from **authoritative business facts**.

Browser-observed examples:

```text
web.session_started
web.page_viewed
web.cta_clicked
web.form_started
web.form_submitted
web.lead_submitted
```

Trusted business examples:

```text
lead.created
booking.started
booking.completed
payment.started
payment.completed
payment.failed
enrollment.completed
```

Other registered namespaces may include:

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

The SDK captures evidence used by SalsysOS for:

- visitor/session journey reconstruction;
- first/current touch attribution;
- content and campaign influence;
- lead intent signals;
- product/course affinity;
- funnel progression;
- conversion and revenue attribution;
- feature-store state;
- explainable predictions;
- next-best-action recommendations;
- actual outcome learning.

The browser does not perform business prediction or become authority for confirmed payment, enrollment, refund or revenue.

## Privacy rules

- consent is purpose-specific;
- GPC is respected;
- arbitrary form values are not captured;
- sensitive credential/payment fields are excluded or redacted;
- browser identity is anonymous until linked by a trusted workflow;
- backend credentials never enter browser JavaScript;
- a migrated legacy analytics grant is recorded through the new privacy endpoint before normal analytics collection is allowed;
- failed migration of a prior grant remains fail-closed.

## Reliability rules

Every producer preserves a stable `event_id` across retries.

A first-party transport/outbox may be implemented using any language/platform. Durability is a capability, not a language/database requirement.

## Compatibility rule

Future JavaScript, Node, Python, Go, Java, .NET, mobile or other SDKs are wrappers over the same Universal Event Protocol. They must not create different event meanings or different source-of-truth rules.

Legacy compatibility exists only to preserve established production journeys during cutover. New tenants should use neutral `Salsys*`, `data-salsys-*`, canonical event names and canonical privacy-purpose names from day one.
