# Salsys Web Platform Installation V1

This guide installs the same Salsys browser intelligence layer across custom-coded sites, WordPress, Webflow and Framer. Shopify uses its Customer Events pixel sandbox and therefore has a dedicated adapter.

## Canonical browser snippet

Use exactly one Salsys browser installation per page:

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
  data-consent-brand="Your Brand"
  defer>
</script>
```

Do not place a Supabase secret, Salsys trusted source secret, organization ID or CRM server credential in browser HTML.

If the site already uses a CMP/cookie banner as the visual consent authority, do not render a second Salsys banner. Keep `salsys-intelligence.js`, omit `salsys-consent.js`, and forward the CMP decision to the SDK after it is available:

```html
<script>
  // Example only: call this from the existing CMP callback.
  window.SalsysIntelligence?.consent?.({
    analytics: 'granted',
    marketing: 'denied',
    advertising: 'denied',
    personalization: 'denied',
    sale_sharing: 'opted_out'
  });
</script>
```

The actual purpose values must come from the site's consent system. Do not infer or pre-grant them.

## Lead forms

Forms that represent a lead/enquiry can opt into the Salsys lead-form behavior with the neutral marker:

```html
<form data-salsys-lead-form>
  ...
</form>
```

Salsys tracking never needs arbitrary form-field values. The website/backend should handle lead PII through the secure CRM lead-capture flow, while the browser layer supplies attribution/session identifiers.

## Custom-coded websites

Add the canonical browser snippet once in the shared site layout, preferably before the closing `</head>` when using `defer`, or in the site's global script include.

Frameworks such as React/Next.js/Vue/Angular should mount the browser SDK once at the application shell/root, not once per route component. SPA navigation is handled by the Salsys browser wrapper.

## WordPress

Salsys does not require a second PHP tracking engine.

Install the canonical browser snippet once using the site's approved global header/custom-code mechanism. Suitable approaches include:

- a site-wide custom-code/header feature already used by the WordPress installation;
- a child theme/layout hook controlled by the site owner;
- a trusted code-snippet/header manager used by the site's operations team.

Do not paste the same Salsys snippet into individual posts/pages if it is already installed globally.

For form builders, add `data-salsys-lead-form` to the rendered form when the builder supports custom attributes. If a builder cannot expose a form attribute, use a tiny DOM adapter that marks only the known enquiry form after page load. Never forward all form input values to Salsys tracking.

## Webflow

Add the canonical browser snippet once in site-wide Custom Code. The Salsys scripts are ordinary deferred browser JavaScript and require no server-side language.

Mark intended enquiry forms with `data-salsys-lead-form` through Webflow custom attributes. Do not mark newsletter/search/checkout forms as lead forms unless that is intentionally part of the CRM workflow.

After publishing, validate in a fresh browser session that only one `salsys-intelligence.js` and one `salsys-consent.js` installation exist.

## Framer

Add the canonical browser snippet once through Framer Project Settings -> Custom Code. Use a site-wide placement and do not add duplicate code to individual pages/components.

For a Framer form that should create/attribute a CRM enquiry, add `data-salsys-lead-form` when the component supports attributes, or use a controlled component wrapper that applies that marker only to the intended form.

## Shopify

Do **not** paste the ordinary DOM browser SDK into the Shopify Customer Events sandbox. Use the dedicated Shopify adapter.

### Fast install: Custom Pixel

1. In Salsys, provision a tracking source with:
   - source type: `client`
   - platform: `shopify`
   - privacy notice version: the merchant's current notice version
2. Copy the returned **publishable source key**. It is not a server secret.
3. In Shopify, open Settings -> Customer events -> Add custom pixel.
4. Copy `integrations/shopify/salsys-custom-pixel.js` into the pixel editor.
5. Replace `REPLACE_WITH_PUBLISHABLE_SOURCE_KEY` with the publishable source key.
6. Configure the pixel's Shopify privacy permission to require analytics processing.
7. Connect the pixel and test with consent granted.

The adapter subscribes to Shopify standard customer events and maps them to non-authoritative Salsys `web.*` telemetry.

### App pixel extension

For a reusable Shopify app integration, scaffold a Shopify web-pixel extension with Shopify CLI, then use:

```text
integrations/shopify/web-pixel-extension/src/index.js
```

and copy the relevant settings/privacy fields from:

```text
integrations/shopify/web-pixel-extension/shopify.extension.toml.example
```

The real extension UID is generated/managed by Shopify CLI; do not reuse a placeholder UID.

The app pixel settings contain only a publishable Salsys source key and optional verified Salsys base URL.

### Shopify authority boundary

Storefront behavior is telemetry, not business truth.

These browser/customer-events signals are allowed examples:

```text
web.page_viewed
web.product_viewed
web.collection_viewed
web.search_submitted
web.cart_viewed
web.product_added_to_cart
web.product_removed_from_cart
web.checkout_started
web.payment_info_submitted
web.checkout_completed_observed
```

Even `web.checkout_completed_observed` is **not** proof of payment or revenue.

Authoritative Shopify facts must arrive through a trusted server/webhook integration using `/api/events/v1`, for example:

```text
commerce.order_created
payment.succeeded
payment.refunded
commerce.fulfillment_created
```

Those events require a trusted Salsys server-source secret and must never be emitted by a public pixel.

## Installation acceptance checklist

For any web platform, close the installation only after verifying:

1. exactly one Salsys tracking installation is active;
2. optional analytics fails closed before consent;
3. grant creates a server consent receipt and enables allowed telemetry;
4. deny/withdraw stops optional telemetry;
5. GPC is honored where applicable;
6. page/session/CTA/form events have stable visitor + session IDs;
7. no arbitrary form PII appears in `raw_events`;
8. lead identity handoff uses the server-side exact-session identify path;
9. no client integration can assert authoritative payment/enrollment/revenue facts;
10. source health shows recent accepted events without contract/dead-letter errors.
