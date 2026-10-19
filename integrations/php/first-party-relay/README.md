# Salsys first-party PHP relay

This package lets a PHP website own its tracking transport. Browser events are posted to the website itself, stored in a durable local outbox, and delivered server-to-server to SalsysOS. GTM, GA4 and ad platforms are not required for the core event chain.

## Architecture

`Browser -> same-origin PHP relay -> local MySQL outbox -> authenticated Salsys Event API -> PostgreSQL raw_events -> processors`

SalsysOS remains an intelligence consumer and processing system. The website keeps a durable copy of undelivered events so temporary SalsysOS or network failures do not lose the journey.

## Files

- `schema.mysql.sql` — durable outbox table
- `config.example.php` — server-only configuration template
- `bootstrap.php` — queue, retry and delivery runtime
- `event.php` — browser event intake
- `consent.php` — consent/preference intake
- `worker.php` — retry worker for pending outbox rows
- `health.php` — protected delivery-health endpoint

## Install

1. Run `schema.mysql.sql` against the website database.
2. Copy `config.example.php` to `config.php` and populate credentials using server environment variables where possible.
3. Place the PHP relay files under a same-origin location such as `/api/tracking/`.
4. Host `salsys-tracker.js` directly from the website, for example `/assets/js/salsys-tracker.js`.
5. Add the script once in the shared website template/footer:

```html
<script
  src="/assets/js/salsys-tracker.js"
  data-site="www.example.com"
  data-event-endpoint="/api/tracking/event.php"
  data-consent-endpoint="/api/tracking/consent.php"
  defer>
</script>
```

No GTM container is required for the tracker to run.

## Consent integration

When analytics consent is granted:

```js
window.dispatchEvent(new CustomEvent('salsys:consent', {
  detail: {
    analytics: 'granted',
    marketing: 'denied',
    advertising: 'denied'
  }
}));
```

When analytics consent is withdrawn:

```js
window.dispatchEvent(new CustomEvent('salsys:consent', {
  detail: {
    analytics: 'withdrawn'
  }
}));
```

The SDK also listens to the legacy `yk:consent` event and migrates existing `yk_vid` / `yk_sid` identifiers where available so a Yogakulam cutover can preserve historical continuity.

## Declarative tracking

Track an important click:

```html
<a href="..." data-salsys-track="whatsapp_course_enquiry">WhatsApp</a>
```

Decorate a lead form so visitor/session IDs travel with the existing form POST:

```html
<form data-salsys-lead-form ...>
```

The SDK injects:

- `salsys_visitor_id`
- `salsys_session_id`
- backward-compatible `yk_visitor_id`
- backward-compatible `yk_session_id`

## Custom events

```js
Salsys.track('web.course_viewed', {
  course_key: '200h-ytt',
  location: 'mysore'
});
```

Server-authoritative business events such as payment success, enrollment confirmation, refunds and revenue should be emitted by backend code, not trusted from browser JavaScript.

## Lead submit

For a first-party relay, the SDK may submit a canonical `lead.submitted` event:

```js
Salsys.lead(
  { name: 'Example', email: 'example@example.com', phone: '+91...' },
  { course_key: '200h-ytt', location: 'mysore' }
);
```

PII is not persisted in the browser retry queue. The first-party PHP outbox stores the server-received event until delivery succeeds.

## Worker

Run every minute from cron:

```bash
php /absolute/path/to/api/tracking/worker.php
```

The worker uses exponential retry backoff and stops after the configured maximum attempt count. Failed rows remain visible as `dead_letter` instead of being silently discarded.

## Health

`health.php` requires the `X-Salsys-Worker-Secret` header and reports pending, delivering, delivered, dead-letter and oldest-pending state without returning event payloads.

## Security rules

- Never place `source_secret`, database passwords or worker secrets in JavaScript.
- The browser only talks to the same-origin website relay by default.
- The relay authenticates server-to-server to SalsysOS using `X-Salsys-Source-Key` plus a Bearer secret.
- Event IDs are unique and retries are idempotent.
- SalsysOS applies its privacy gate again before server-relayed events are persisted.
- PostgreSQL remains the authoritative SalsysOS event store; OpenSearch is secondary/rebuildable.
