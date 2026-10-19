# First-party Event Intelligence relay

This package makes the website the first-party tracking source. The browser does not need GTM, GA4, Meta, or SalsysOS in order to create the canonical event.

## Flow

```text
browser / website backend
        -> local website event store
        -> local delivery outbox
        -> SalsysOS adapter
        -> future GA4 / Meta / warehouse adapters
```

`site_tracking_events` is the durable first-party event record. `site_tracking_deliveries` records delivery attempts to downstream systems. A temporary SalsysOS outage therefore does not erase the visitor journey.

## Files to install on the website

Copy these files into a protected website backend folder such as `/api/tracking/`:

- `SalsysTracking.php`
- `bootstrap.php`
- `event.php`
- `consent.php`
- `worker.php`
- `config.php` created from `config.example.php`

Run `schema.sql` against the website database.

Copy `public/salsys-event-tracker.js` from the SalsysOS repository to the website itself, for example:

```text
/assets/js/salsys-event-tracker.js
```

The browser should load the local file, not a GTM-hosted tag and not a remote SalsysOS script:

```html
<script
  src="/assets/js/salsys-event-tracker.js"
  data-site="www.example.com"
  data-event-endpoint="/api/tracking/event.php"
  data-consent-endpoint="/api/tracking/consent.php"
  data-consent-mode="required"
  defer>
</script>
```

## Consent

The SDK does not send `web.*` analytics events until analytics consent is explicitly granted. A consent manager can update the SDK with:

```js
window.dispatchEvent(new CustomEvent('salsys:consent', {
  detail: {
    analytics: true,
    adUserData: false,
    adPersonalization: false,
    marketing: false,
    source: 'cookie_banner'
  }
}));
```

During the Yogakulam cutover, the SDK also listens for the legacy `yk:consent` event and preserves the existing `yk_vid` / `yk_sid` identifiers when analytics consent already exists.

## Browser events

The browser SDK accepts `web.*` events only. It automatically captures page views, form starts/submissions, and important CTA/link interactions without reading form field values.

Custom examples:

```js
SalsysEvent.track('web.course_viewed', {
  course_key: '200h-ytt-mysore',
  location: 'mysore'
});

SalsysEvent.track('web.enroll_opened', {
  course_key: '200h-ytt-mysore',
  batch_key: '2026-11'
});
```

Declarative CTA tracking is also available:

```html
<a href="..." data-salsys-track="hero-enroll">Enroll now</a>
```

The tracker automatically classifies WhatsApp, telephone, and email links as dedicated `web.whatsapp_clicked`, `web.call_clicked`, and `web.email_clicked` events.

## Authoritative business events

Do not let the browser declare payment or enrollment truth. Emit those events from the website backend after the actual database/payment state changes.

```php
/** @var SalsysTracking $tracking */
$tracking = require __DIR__ . '/api/tracking/bootstrap.php';

$tracking->captureServerEvent('booking.completed', [
    'booking_reference' => $bookingReference,
    'course_key' => $courseKey,
    'batch_key' => $batchKey,
], [
    'event_id' => 'booking_completed_' . $bookingReference,
    'anonymous_visitor_id' => $_POST['salsys_visitor_id'] ?? null,
    'session_key' => $_POST['salsys_session_id'] ?? null,
]);
```

Payment success should use an idempotent provider/payment identifier:

```php
$tracking->captureServerEvent('payment.completed', [
    'booking_reference' => $bookingReference,
    'payment_reference' => $paymentReference,
    'amount' => $amount,
    'currency' => $currency,
    'payment_method' => $paymentMethod,
], [
    'event_id' => 'payment_completed_' . $paymentReference,
    'anonymous_visitor_id' => $visitorId,
    'session_key' => $sessionId,
]);
```

Then emit `enrollment.completed` only when the enrollment is truly confirmed in the source database.

## Identity handoff

When analytics consent is granted, the SDK decorates forms with both the new and transitional hidden fields:

```text
salsys_visitor_id
salsys_session_id
yk_visitor_id
yk_session_id
```

The website backend should persist these values with the booking/enquiry and use them when creating the CRM lead. SalsysOS can then join the exact anonymous session to the lead without guessing identity.

## Outbox worker

`event.php` and `consent.php` persist locally first and then attempt one immediate upstream delivery. Failed deliveries remain queued.

Run the worker at least once per minute:

```bash
php /absolute/path/api/tracking/worker.php 50
```

The worker retries with exponential backoff and eventually marks a delivery failed after the configured maximum attempts. The canonical local event row is never deleted by the delivery worker.

## Security rules

- Never put the Salsys source secret in JavaScript or HTML.
- Keep `config.php` out of version control and outside public download paths where possible.
- Browser relay accepts only same-origin `web.*` events.
- Browser tracking never records form values.
- Payment/revenue/enrollment facts must originate from trusted backend code.
- Use deterministic event IDs for payment/provider callbacks so retries remain idempotent.
- PostgreSQL/SalsysOS remains the business source of truth for CRM, attribution and predictions; OpenSearch is a derived retrieval/intelligence index only.

## Adapter model

The local event store is intentionally destination-neutral. Additional destinations should be implemented by adding delivery rows/adapters rather than changing the browser SDK. This allows the same canonical event to feed SalsysOS, GA4 Measurement Protocol, Meta CAPI, a warehouse, or another future system independently.
