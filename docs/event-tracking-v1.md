# Salsys Event Tracking v1

**Status:** Canonical event-tracking model for the Universal Tracking Intelligence SDK

Salsys event tracking records customer-journey evidence in a consistent event graph. Events are immutable evidence; CRM state, attribution, features and predictions are derived from that evidence.

## 1. Event naming

Canonical event names use:

```text
namespace.event_name
```

Rules:

- lowercase;
- snake_case event name;
- stable meaning over time;
- new meanings require a new registered contract/version;
- tenant-specific data belongs in properties, not in forked SDK code.

## 2. Core browser events

### `web.session_started`

Observed when a browser session becomes trackable under the active privacy policy.

Typical properties/context:

- landing page;
- first touch;
- session touch;
- referrer;
- viewport/language/timezone;
- visitor/session IDs.

### `web.page_viewed`

Observed page/content view.

Typical properties:

- page path;
- title;
- content/course identifiers when explicitly supplied;
- navigation type for SPA navigation.

### `web.cta_clicked`

Observed CTA/link interaction.

Typical properties:

- action;
- label;
- element;
- destination origin/path;
- campaign/course/content identifiers when explicitly supplied.

The browser SDK classifies WhatsApp, phone and email links directly. The Universal Tracking Intelligence entrypoint also preserves the established Instagram and enrollment/booking CTA classifications during migration so existing intent/affinity models do not silently lose signal.

### `web.form_started`

Observed first interaction with a form.

Typical properties:

- form ID/name;
- form action path.

No arbitrary input values are captured.

### `web.form_submitted`

Observed browser form submission attempt.

This is behavioral evidence, not proof that the backend accepted or converted the enquiry.

### `web.lead_submitted`

Optional browser-side lead-submission evidence when a site has a reliable success callback. CRM lead creation remains server-authoritative.

## 3. Trusted business events

Trusted server/provider sources should emit business facts.

Recommended contracts include:

```text
lead.created
lead.updated
booking.started
booking.completed
payment.started
payment.completed
payment.failed
enrollment.completed
```

Refund/cancellation/revenue events should be added only when backed by real authoritative state.

## 4. Messaging and conversation events

Registered platform events may include:

```text
conversation.started
message.received
message.sent
message.delivered
message.read
```

Provider webhooks remain the authority for delivery/read state.

## 5. Automation events

Automation/runtime evidence may use:

```text
automation.triggered
automation.eligible
automation.drafted
automation.approved
automation.sent
automation.stopped
automation.failed
```

These events describe automation execution and do not replace canonical CRM/message/payment evidence.

## 6. Custom events

A customer may define `custom.*` events only through the registered event-contract system.

Do not allow arbitrary unregistered event names to silently become business truth.

## 7. Event IDs and retry

Every logical event has one stable `event_id`.

```text
same logical event + retry -> same event_id
new logical event          -> new event_id
```

The ingestion layer is responsible for idempotent acceptance and duplicate handling.

## 8. Identity

Browser events may include:

```text
anonymous_visitor_id
session_key
```

Known identity is linked only through a trusted server workflow. Browsers do not choose tenant IDs or privileged CRM lead IDs as authority.

Canonical identity handoff uses:

```text
POST /api/events/identify/v1
```

The identity route preserves the strongest pre-existing tracking safety rule: the authenticated tracking source tenant, CRM lead, anonymous visitor and exact pre-existing browser session must all agree before the session/touchpoints are attached. Reusing a browser/visitor identifier by itself is never enough.

## 9. Acquisition

Where observed, browser tracking may capture:

```text
utm_source
utm_medium
utm_campaign
utm_content
utm_term
utm_id
gclid
gbraid
wbraid
fbclid
campaign_id
adset_id
ad_id
adgroup_id
creative_id
```

Missing identifiers are never fabricated.

Legacy URL aliases used by an established deployment may be translated during a controlled migration, but new integrations should emit/use the canonical names above.

## 10. Privacy and consent

Consent is purpose-specific. Current neutral purposes include:

```text
analytics
marketing
advertising
sale_sharing
personalization
```

Global Privacy Control is honored according to tracking-source policy.

During Yogakulam migration only, established consent aliases are translated as follows:

```text
legacy analytics        -> analytics
legacy adUserData       -> advertising
legacy adPersonalization -> personalization
legacy marketing        -> marketing
```

No missing purpose is inferred. In particular, legacy advertising consent is not silently converted into sale/sharing consent.

## 11. Server-side context enrichment

Browser events may be enriched at ingestion with trusted hosting/proxy context such as country, region, city and timezone when the deployment provides those headers.

The browser does not send or control that trusted geo context, and the browser event route does not persist the raw client IP address.

## 12. Event intelligence flow

```text
Event
  -> raw_events
  -> normalization
  -> session/touchpoint/person journey
  -> attribution
  -> feature state
  -> deterministic/statistical prediction
  -> recommendation/action
  -> observed outcome
  -> learning
```

Predictions and recommendations are derived intelligence. They are not rewritten as observed events unless an actual action/outcome occurs.

## 13. Browser SDK API

Current universal browser implementation exposes:

```javascript
SalsysIntelligence.track('web.cta_clicked', { action: 'enroll_now' });
SalsysIntelligence.page({ content_type: 'course' });
SalsysIntelligence.consent({ analytics: 'granted' });
SalsysIntelligence.identifiers();
SalsysIntelligence.flush();
```

`Salsys` remains an API alias. Declarative HTML instrumentation is supported through `data-salsys-event`, `data-salsys-track` and `data-salsys-prop-*` attributes.

The product entrypoint temporarily supports established `data-yk-event`, `yk:consent` and `YKTracking` integrations during the Yogakulam cutover. These are migration shims, not the universal contract for new tenants.

## 14. Server API

Any backend language can emit trusted events over HTTPS using:

```text
POST /api/events/v1
X-Salsys-Source-Key: <source-key>
Authorization: Bearer <tracking-source-secret>
```

Identity handoff uses the same source authentication on `/api/events/identify/v1`.

## 15. Completion definition

Event tracking is not production-complete until a real journey is verified end-to-end:

```text
campaign/click
-> visitor/session
-> page/CTA/form behavior
-> consent
-> lead identity
-> booking/checkout
-> payment
-> enrollment
-> revenue attribution
-> feature state
-> prediction/recommendation
-> observed outcome
```
