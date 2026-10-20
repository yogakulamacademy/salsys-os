# Salsys Universal Tracking Platform V1

## Goal

One canonical Salsys event system must support:

- custom-coded websites;
- WordPress;
- Webflow;
- Framer;
- Shopify storefront telemetry plus trusted Shopify server/webhook facts;
- Android apps;
- iOS apps;
- trusted backend/services in any language.

Platform adapters are transport/install layers. They do not create separate event databases, identity models, privacy ledgers, or attribution systems.

## Canonical topology

```text
Web / WordPress / Webflow / Framer
            | origin-resolved browser SDK
            v
/api/events/browser/v1

Android / iOS / sandboxed storefront client
            | publishable source key
            v
/api/events/client/v1

Trusted backend / Shopify webhook / payments / enrollment
            | source key + server secret
            v
/api/events/v1

All accepted events
      -> ingest_tracking_event_v1
      -> PostgreSQL raw_events (authoritative event evidence)
      -> processors / sessions / attribution / features
      -> optional derived search indexes
```

## Credential classes

### Browser origin source

For ordinary websites, Salsys resolves the tenant/source from the configured request Origin. No tenant secret belongs in website HTML.

### Publishable client source

For Android, iOS and sandboxed client environments, the SDK uses `X-Salsys-Source-Key` with `auth_mode=publishable`.

The publishable source key is an identifier, **not a secret**. Therefore this surface is deliberately constrained:

- only configured `app.*` or `web.*` telemetry prefixes;
- no `payment.*`, `enrollment.*`, `booking.*`, `lead.*`, `message.*`, or other authoritative business facts;
- server-side privacy gate before raw-event persistence;
- aggressive PII-key redaction;
- source-scoped rate limiting;
- canonical event-id idempotency;
- SDK/platform provenance on every event.

### Trusted server source

`/api/events/v1` requires both source key and server secret. This is the only suitable surface for authoritative facts such as successful payment, refund, enrollment, order outcome, or backend CRM state.

Never embed a Salsys server secret in JavaScript, Android, iOS, Shopify client pixel code, WordPress public markup, Webflow, or Framer.

## Event envelope

All clients use the existing `Salsys Universal Event v1` envelope.

Cross-platform clients must include:

```json
{
  "event_id": "evt_...",
  "event_name": "app.screen_viewed",
  "schema_version": 1,
  "occurred_at": "2026-10-20T06:00:00Z",
  "anonymous_visitor_id": "v_...",
  "session_key": "s_...",
  "properties": {},
  "context": {
    "platform": "android"
  },
  "metadata": {
    "sdk": {
      "name": "salsys-android",
      "version": "1.0.0",
      "integration": "native_android"
    }
  }
}
```

Supported V1 publishable client platforms are:

- `android`
- `ios`
- `web`
- `shopify`

## App event family V1

Registered client-safe app events:

- `app.session_started`
- `app.screen_viewed`
- `app.cta_clicked`
- `app.form_started`
- `app.form_submitted`
- `app.deep_link_opened`

`app.*` is mapped to the optional `analytics` privacy purpose. Without effective analytics permission, the client endpoint rejects persistence with a privacy-blocked response.

## Consent

Publishable clients write privacy choices through:

```text
POST /api/privacy/consent/client/v1
X-Salsys-Source-Key: <publishable source key>
```

Purposes remain the same cross-platform ledger used by the browser SDK:

- analytics
- marketing
- advertising
- personalization
- sale/sharing

Android and iOS SDKs persist consent locally and do not persist their anonymous visitor ID or retry queue until analytics permission is granted. Withdrawal/denial removes the persistent visitor identifier and queued telemetry.

## Android SDK

Source:

```text
sdk/android/src/main/java/com/salsys/sdk/Salsys.kt
```

Core API:

```kotlin
Salsys.initialize(
    context = applicationContext,
    configuration = SalsysConfig(
        sourceKey = "src_publishable..."
    )
)

Salsys.setConsent(
    mapOf("analytics" to "granted")
)

Salsys.track(
    "app.screen_viewed",
    mapOf("screen" to "course_detail")
)
```

The Android SDK provides anonymous visitor/session IDs, local consent state, a bounded offline retry queue, source-key transport, SDK provenance, and local PII-key redaction.

## iOS SDK

Source:

```text
sdk/ios/Sources/Salsys/Salsys.swift
```

Core API:

```swift
Salsys.shared.configure(
    SalsysConfig(sourceKey: "src_publishable...")
)

Salsys.shared.setConsent([
    "analytics": "granted"
])

Salsys.shared.track(
    "app.screen_viewed",
    properties: ["screen": "course_detail"]
)
```

The iOS SDK provides the same consent, visitor/session, queue, provenance, and PII-minimization contract as Android.

## Web platforms

### Custom-coded websites

Use the existing product-facing browser entrypoint and consent UI:

```html
<script
  src="https://salsysos.com/salsys-intelligence.js"
  data-consent-mode="required"
  data-form-mode="lead-only"
  defer>
</script>
<script
  src="https://salsysos.com/salsys-consent.js"
  data-consent-banner="auto"
  data-consent-settings="floating"
  defer>
</script>
```

### WordPress

V1 compatibility uses the same browser SDK installed once globally by the site's approved custom-code/header mechanism. Salsys does **not** introduce a second PHP event engine or database. WordPress-specific convenience packaging can wrap this installation layer later without changing the event protocol.

### Webflow

Install the same browser SDK once in site-wide custom code. Forms intended as lead forms use the neutral `data-salsys-lead-form` marker.

### Framer

Install the same browser SDK once in site-wide custom code. No tenant secret is placed in Framer code.

### Shopify

Shopify is intentionally split by authority:

- storefront/client interactions use a publishable client source and non-authoritative `web.*` telemetry;
- order/payment/refund/fulfillment truth must arrive from a trusted Shopify server/webhook adapter into `/api/events/v1`.

A client-side Shopify event must never be treated as proof of revenue, payment, refund, or fulfillment.

## Identity

Browser identity handoff remains exact-session and server-authenticated through `/api/events/identify/v1`.

Native-app cross-device identity is **not** allowed to self-assert a Salsys `person_id`, `lead_id`, or `customer_id` through the publishable SDK. Those keys are redacted. A future native identify handoff must bind an authenticated application account/session to Salsys server-side before Person 360 linkage.

This preserves the existing rule: weak/public client evidence cannot merge people.

## Status of V1

This checkpoint establishes:

- platform-neutral client/source contract;
- publishable-key security class;
- privacy-gated client ingestion;
- cross-platform consent receipts;
- PII minimization;
- Android SDK source;
- iOS SDK source;
- web-platform compatibility model;
- Shopify authority split.

It does **not** claim Android/iOS store-package publication, Shopify app-store approval, WordPress plugin-directory publication, or live production validation on those platforms. Those are separate distribution/adapter acceptance checkpoints.
