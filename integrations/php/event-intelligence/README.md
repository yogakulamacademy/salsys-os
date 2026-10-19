# First-Party Event Intelligence Relay (PHP/MySQL)

This package lets a PHP website own its tracking contract and event journal instead of depending on GTM, GA4, Meta, or SalsysOS for collection.

The browser talks only to the website. The website journals each event first and then delivers it to one or more adapters. SalsysOS is the first adapter. Other destinations can be added without changing the browser SDK or event IDs.

## Flow

```text
Browser / website backend
        ↓
Universal salsys-tracker.js
        ↓
First-party PHP endpoints
        ↓
site_event_log (canonical local journal)
        ↓
site_event_deliveries (per-destination state)
        ↓
SalsysOS Event API today
GA4 / Meta CAPI / warehouse adapters later
```

PostgreSQL `raw_events` remains the authoritative SalsysOS event ledger after delivery. OpenSearch is secondary/rebuildable and should receive derived intelligence documents, not raw browser exhaust.

## Requirements

- PHP 7.4+
- PDO MySQL
- cURL
- MySQL/MariaDB
- HTTPS in production
- a cron or protected HTTP worker

## 1. Install the local event journal

Run `sql/001_event_journal.sql` in the website database.

The schema separates immutable event payloads from delivery state. One `event_id` can therefore be delivered to multiple independent systems without creating different source events.

## 2. Configure the relay

Copy `config.example.php` to a private `config.php`, ideally outside the public web root, or set `SALSYS_TRACKING_CONFIG` to an absolute private path.

At minimum configure:

```text
SALSYS_SITE_ORIGIN=https://www.yogakulam.com
SALSYS_TRACKING_DSN=mysql:host=...;dbname=...;charset=utf8mb4
SALSYS_TRACKING_DB_USER=...
SALSYS_TRACKING_DB_PASSWORD=...
SALSYS_EVENTS_BASE_URL=https://salsysos.com
SALSYS_EVENTS_SOURCE_KEY=...
SALSYS_EVENTS_SOURCE_SECRET=...
SALSYS_TRACKING_WORKER_TOKEN=...
```

The source key/secret is only required for trusted server events such as lead, booking, payment and enrollment lifecycle events. Browser behavior and consent are still routed through the browser privacy gate upstream and never use the server secret.

The SalsysOS admin endpoint `/api/tracking/sources` can provision a secret source. Create it with only the event-family prefixes the website backend actually needs, for example:

```json
{
  "name": "Yogakulam website backend",
  "sourceType": "api",
  "sourceSystem": "yogakulam_website_backend",
  "allowedEventPrefixes": ["lead.", "booking.", "payment.", "enrollment."],
  "rateLimitPerMinute": 600
}
```

Store the returned secret once in the website's private environment/config. SalsysOS stores only its SHA-256 hash.

## 3. Publish the first-party endpoints

A recommended Yogakulam mapping is:

```text
/api/tracking/event.php   → public/event.php
/api/tracking/consent.php → public/consent.php
/api/tracking/worker.php  → public/worker.php
```

Keep `event-intelligence.php` and `config.php` outside the public directory if your hosting layout allows it. Adjust the `require_once` path in the three public endpoint files to match the final layout.

`event.php` accepts only `web.*` browser events. It strips sensitive browser keys, journals the event, and then attempts delivery. A SalsysOS outage cannot erase an accepted event; the delivery remains pending for the worker.

`consent.php` journals privacy choices separately and forwards them to the SalsysOS privacy preference engine. GPC and consent remain independent of analytics event collection.

`worker.php` retries pending deliveries with exponential backoff and dead-letters only after the configured maximum attempts.

## 4. Host the SDK on the website itself

Copy `public/salsys-tracker.js` from the SalsysOS repository into the website, for example:

```text
/assets/js/salsys-tracker.js
```

Then include it once in the common website template/footer, not through GTM:

```html
<script
  src="/assets/js/salsys-tracker.js"
  data-site="yogakulam.com"
  data-endpoint="/api/tracking/event.php"
  data-consent-endpoint="/api/tracking/consent.php"
  data-consent-mode="required"
  data-auto-page="true"
  data-auto-spa="true"
  data-auto-forms="true"
  data-legacy-aliases="true"
  defer></script>
```

`required` is the production default. Analytics events do not leave the browser until analytics consent is granted. Existing Yogakulam `yk_vid` / `yk_sid` identifiers are reused when valid so historical continuity is not unnecessarily broken.

## 5. Connect the cookie banner

When analytics is accepted:

```js
window.Salsys && window.Salsys.consent({
  analytics: 'granted'
});
```

A full preference example:

```js
window.Salsys.consent({
  analytics: 'granted',
  marketing: 'denied',
  advertising: 'denied',
  personalization: 'denied'
});
```

On withdrawal:

```js
window.Salsys.consent({ analytics: 'withdrawn' });
```

Global Privacy Control is detected automatically and records `sale_sharing=opted_out` when applicable.

## 6. Browser events

The SDK emits a stable canonical vocabulary:

```text
web.session_started
web.page_viewed
web.cta_clicked
web.form_started
web.form_submitted
```

Use declarative custom properties where useful:

```html
<a
  href="#enroll"
  data-salsys-track="enroll_click"
  data-salsys-prop-course="200h-ytt"
  data-salsys-prop-location="mysore">
  Enroll now
</a>
```

Or emit an explicit web event:

```js
window.Salsys.track('web.cta_clicked', {
  action: 'brochure_download',
  course: '200h-ytt'
});
```

The SDK automatically recognizes WhatsApp, telephone and email links. It tracks form start/submission without serializing form values.

## 7. Anonymous-to-known identity

Before a form submits, the SDK injects:

```text
salsys_visitor_id
salsys_session_id
salsys_first_touch
salsys_session_touch
```

During migration it also injects the legacy aliases:

```text
yk_visitor_id
yk_session_id
yk_first_touch
yk_session_touch
```

The website backend should persist the visitor/session IDs alongside the enquiry/booking and pass them in the trusted `lead.submitted` event. SalsysOS can then bind the exact anonymous session and earlier touchpoints to the known CRM lead without fuzzy identity guesses.

## 8. Trusted server events

Use `salsys_event_emit_server()` after the website has authoritative evidence. Examples are in `examples/server-events.php`.

Recommended operational vocabulary:

```text
lead.submitted
booking.started
booking.completed
payment.started
payment.completed
payment.failed
enrollment.completed
```

Do not emit `payment.completed`, `enrollment.completed`, revenue, refunds or similar outcomes from browser JavaScript. Those must originate from the payment/booking/backend source of truth.

Use a stable event ID from the operational record, e.g. `payment-<gateway-id>-completed`. Replaying the same ID with the same payload is safe; reusing it with a different payload is rejected.

## 9. Worker schedule

Preferred CLI cron every minute:

```bash
* * * * * /usr/bin/php /private/path/worker.php 50 >/dev/null 2>&1
```

Periodic cleanup can run daily:

```bash
15 3 * * * /usr/bin/php /private/path/worker.php 100 --cleanup >/dev/null 2>&1
```

If CLI cron is not available, call the protected HTTP worker with:

```text
X-Salsys-Worker-Token: <private token>
```

Do not place the worker token in browser JavaScript.

## 10. Adding other destinations

The event journal is not coupled to SalsysOS. A future adapter should:

1. register a destination name such as `ga4`, `meta_capi` or `warehouse`;
2. insert one `site_event_deliveries` row per existing/new event that should be delivered there;
3. transform the canonical event only inside that adapter;
4. preserve the original `event_id` as the cross-system idempotency key where the provider supports it;
5. never rewrite `site_event_log` to fit a provider-specific schema.

This keeps acquisition, behavioral, CRM, payment and revenue evidence consistent even when providers change.

## Production acceptance test

The tracking milestone is not complete until a controlled real journey proves:

```text
campaign URL
→ first-party visitor/session
→ page + CTA behavior
→ consent
→ enquiry/form
→ CRM lead identity binding
→ booking/checkout
→ trusted payment event
→ enrollment
→ revenue attribution
→ feature calculation
→ prediction/recommendation
→ outcome feedback
```

The same event lineage must be visible in the SalsysOS raw event ledger and its derived session/touchpoint/CRM views. OpenSearch-derived intelligence is validated only after PostgreSQL truth is correct.
